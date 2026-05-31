from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_ENGINE_DIR = _BACKEND_DIR.parent / "engine"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
if str(_ENGINE_DIR) not in sys.path:
    sys.path.append(str(_ENGINE_DIR))

import models as api_models  # noqa: E402
from auth_utils import get_password_hash, verify_password  # noqa: E402
from config import (  # noqa: E402
    EF_MONTHS,
    EXPECTED_AFTER_TAX_MARKET_RETURN,
    EXPECTED_MARKET_RETURN,
    HIGH_APR,
    LOW_APR,
    LTCG_RATE,
)
from data.db import (  # noqa: E402
    ChatMessageRow,
    ChatSession,
    Profile,
    User,
    append_message,
    create_all,
    get_messages,
    get_or_create_session,
    get_session,
    get_sessions_for_user,
    get_user,
    get_user_record,
)
from data.seed import seed_database  # noqa: E402
from data.loaders import load_prices, returns_matrix  # noqa: E402
from gate.responsibility import evaluate_gate  # noqa: E402
from llm.advisor import stream_advisor  # noqa: E402
from llm.elicitation import stream_elicitation  # noqa: E402
from montecarlo.projection import project  # noqa: E402
from optimizer.blend import build_target_weights  # noqa: E402
from optimizer.erc import cov_ledoit_wolf, risk_contributions  # noqa: E402
from profiler.profile import build_risk_profile  # noqa: E402
from profiler.validate import validate_profile  # noqa: E402
from rebalance.rebalancer import decide_rebalance  # noqa: E402
from schemas.models import (  # noqa: E402
    Positions as EnginePositions,
    TargetWeights as EngineTargetWeights,
    UserProfile as EngineUserProfile,
)
from tax.report import tax_report  # noqa: E402
from universe.builder import build_universe  # noqa: E402

router = APIRouter()
_DATA_READY = False
create_all()

_RISK_LABELS = [
    (2.0, "Aggressive"),
    (4.0, "Moderate-Aggressive"),
    (6.0, "Moderate"),
    (8.0, "Moderate-Conservative"),
    (float("inf"), "Conservative"),
]


def _ensure_engine_data() -> None:
    global _DATA_READY
    if _DATA_READY:
        return
    if os.environ.get("GREENLIGHT_DB_URL"):
        _DATA_READY = True
        return

    db_path = Path("/tmp/greenlight-backend/greenlight.db")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    os.environ["GREENLIGHT_DB_URL"] = f"sqlite:///{db_path}"
    seed_database(os.environ["GREENLIGHT_DB_URL"], reset=False)
    _DATA_READY = True


def _normalize_goal(goal: str) -> str:
    value = goal.strip().lower().replace("-", "_").replace(" ", "_")
    if "retire" in value:
        return "retirement"
    if "home" in value or "house" in value:
        return "home"
    if "educ" in value or "college" in value:
        return "education"
    if value in {"retirement", "home", "education", "general_wealth"}:
        return value
    return "general_wealth"


def _to_engine_profile(profile_input: api_models.UserProfileInput) -> EngineUserProfile:
    payload = profile_input.model_dump()
    payload["goals"] = [_normalize_goal(goal) for goal in payload.get("goals") or ["general_wealth"]]
    payload["loss_aversion_probe"] = payload["loss_aversion_probe"] or 100.0
    payload["confidence"] = {
        key: max(0.0, min(1.0, float(value)))
        for key, value in payload.get("confidence", {}).items()
    }
    return EngineUserProfile.model_validate(payload)


def _validation_clarifications(exc: ValidationError) -> list[api_models.ClarificationRequest]:
    clarifications = []
    for error in exc.errors():
        field = ".".join(str(part) for part in error.get("loc", ())) or "profile"
        issue = str(error.get("msg", "Invalid profile value."))
        clarifications.append(
            api_models.ClarificationRequest(
                field=field,
                issue=issue,
                suggested_question=f"Could you verify the value for {field}?",
            )
        )
    return clarifications


def _engine_clarifications(payload: dict[str, Any]) -> list[api_models.ClarificationRequest]:
    requests = payload.get("clarification_requests", [])
    return [
        api_models.ClarificationRequest(
            field="risk_tolerance",
            issue=str(item),
            suggested_question=str(item),
        )
        for item in requests
    ]


def _to_api_validated(
    validated: Any,
    source: api_models.UserProfileInput,
) -> api_models.ValidatedProfile:
    payload = validated.model_dump(exclude={"derived"})
    payload["confidence"] = source.confidence
    payload["uncertainty_flags"] = source.uncertainty_flags
    payload["monthly_surplus"] = round(validated.derived.monthly_surplus, 2)
    payload["emergency_fund_months"] = round(
        validated.emergency_fund / validated.monthly_expenses,
        3,
    )
    payload["required_emergency_fund"] = round(validated.derived.required_emergency_fund, 2)
    return api_models.ValidatedProfile.model_validate(payload)


def _to_api_validated_from_profile(
    profile: Any,
    source: api_models.UserProfileInput,
) -> api_models.ValidatedProfile:
    monthly_surplus = profile.household_income / 12.0 - profile.monthly_expenses
    payload = profile.model_dump()
    payload["confidence"] = source.confidence
    payload["uncertainty_flags"] = source.uncertainty_flags
    payload["monthly_surplus"] = round(monthly_surplus, 2)
    payload["emergency_fund_months"] = round(profile.emergency_fund / profile.monthly_expenses, 3)
    payload["required_emergency_fund"] = round(profile.monthly_expenses * EF_MONTHS, 2)
    return api_models.ValidatedProfile.model_validate(payload)


def _to_api_risk(risk_profile: Any) -> api_models.RiskProfile:
    payload = risk_profile.model_dump()
    payload["loss_aversion_flag"] = False
    return api_models.RiskProfile.model_validate(payload)


def _debt_verdict(debt: Any) -> str:
    return (
        f"Paying off your {debt.apr * 100:.0f}% APR debt is a guaranteed, "
        f"tax-free {debt.apr * 100:.0f}% return. Equities return "
        f"~{EXPECTED_MARKET_RETURN * 100:.0f}% nominally, or "
        f"~{EXPECTED_AFTER_TAX_MARKET_RETURN * 100:.1f}% after a "
        f"{LTCG_RATE * 100:.0f}% capital-gains rate, and that return is uncertain."
    )


def _preview_next_checks(validated: Any, failed_check: str) -> list[str]:
    if failed_check == "emergency_fund":
        high_apr = [debt for debt in validated.debts if debt.apr > HIGH_APR]
        if not high_apr:
            return []
        worst = max(high_apr, key=lambda debt: debt.apr)
        interest_annual = worst.balance * worst.apr
        return [
            (
                f"After building your emergency fund, your {worst.apr * 100:.0f}% APR "
                f"{worst.kind.replace('_', ' ')} would also block investing; it is "
                f"accruing about ${interest_annual:,.0f}/yr in interest."
            )
        ]

    if failed_check == "high_interest_debt":
        high_apr = [debt for debt in validated.debts if debt.apr > HIGH_APR]
        if len(high_apr) <= 1:
            return []
        return [
            "Additional high-APR debts to clear: "
            + ", ".join(f"{debt.apr * 100:.0f}% APR {debt.kind}" for debt in high_apr[1:])
        ]

    return []


def _to_api_gate(gate_result: Any, validated: Any) -> api_models.GateResult:
    math_payload: api_models.GateMath | None = None

    if gate_result.math is not None and gate_result.failed_check == "emergency_fund":
        target = gate_result.math.target_amount
        shortfall = max(0.0, target - validated.emergency_fund)
        math_payload = api_models.GateMath(
            check="emergency_fund",
            emergency_fund=api_models.EmergencyFundMath(
                current_balance=validated.emergency_fund,
                monthly_expenses=validated.monthly_expenses,
                months_covered=round(validated.emergency_fund / validated.monthly_expenses, 2),
                required_months=float(EF_MONTHS),
                target_balance=round(target, 2),
                shortfall=round(shortfall, 2),
            ),
        )

    if gate_result.math is not None and gate_result.failed_check == "high_interest_debt":
        debt = gate_result.math.debt
        math_payload = api_models.GateMath(
            check="high_interest_debt",
            debt=api_models.DebtGateMath(
                debt_balance=debt.balance,
                apr=debt.apr,
                debt_kind=debt.kind,
                guaranteed_return=gate_result.math.guaranteed_return,
                expected_after_tax_market_return=gate_result.math.expected_after_tax_market_return,
                interest_accruing_annual=gate_result.math.interest_accruing_annual,
                net_advantage_annual=gate_result.math.net_advantage_annual,
                verdict=_debt_verdict(debt),
            ),
        )

    return api_models.GateResult(
        status=gate_result.status,
        failed_check=gate_result.failed_check,
        reason=gate_result.reason,
        math=math_payload,
        recommended_action=gate_result.recommended_action,
        notes=list(gate_result.notes),
        preview_next_checks=_preview_next_checks(validated, gate_result.failed_check),
    )


def _risk_label(gamma: float) -> str:
    for threshold, label in _RISK_LABELS:
        if gamma <= threshold:
            return label
    return "Conservative"


def _months_to_payoff(balance: float, apr: float, monthly_payment: float) -> int | None:
    if monthly_payment <= 0 or balance <= 0:
        return None
    if apr == 0.0:
        return math.ceil(balance / monthly_payment)
    monthly_rate = apr / 12.0
    if monthly_payment <= balance * monthly_rate:
        return None
    months = math.log(monthly_payment / (monthly_payment - balance * monthly_rate)) / math.log(
        1.0 + monthly_rate
    )
    return math.ceil(months)


def _total_interest(balance: float, monthly_payment: float, months: int | None) -> float | None:
    if months is None:
        return None
    return round(max(0.0, monthly_payment * months - balance), 2)


def _debt_gate_status(apr: float) -> str:
    if apr > HIGH_APR:
        return "halt"
    if apr >= LOW_APR:
        return "caution"
    return "allow"


def _compute_financial_analysis(
    profile: api_models.ValidatedProfile,
    risk_profile: api_models.RiskProfile,
    gate_result: api_models.GateResult,
) -> api_models.FinancialAnalysis:
    monthly_income = profile.household_income / 12.0
    total_debt = sum(debt.balance for debt in profile.debts)
    high_apr_debt = sum(debt.balance for debt in profile.debts if debt.apr > HIGH_APR)
    ef_target = profile.monthly_expenses * EF_MONTHS
    ef_shortfall = max(0.0, ef_target - profile.emergency_fund)
    ef_pct = min(100.0, profile.emergency_fund_months / EF_MONTHS * 100.0)
    savings_rate = profile.monthly_surplus / monthly_income * 100.0 if monthly_income > 0 else 0.0

    snapshot = api_models.FinancialSnapshot(
        monthly_income=round(monthly_income, 2),
        monthly_expenses=profile.monthly_expenses,
        monthly_surplus=profile.monthly_surplus,
        savings_rate_pct=round(savings_rate, 1),
        annual_surplus=round(profile.monthly_surplus * 12.0, 2),
        total_debt=round(total_debt, 2),
        total_high_apr_debt=round(high_apr_debt, 2),
        total_low_apr_debt=round(total_debt - high_apr_debt, 2),
        debt_to_income_ratio=round(total_debt / profile.household_income, 3)
        if profile.household_income > 0
        else 0.0,
        net_worth_estimate=round(profile.capital_on_hand - total_debt, 2),
        emergency_fund_months=profile.emergency_fund_months,
        emergency_fund_target_months=float(EF_MONTHS),
        emergency_fund_pct_complete=round(ef_pct, 1),
        emergency_fund_shortfall=round(ef_shortfall, 2),
    )

    ef_months_to_target = (
        math.ceil(ef_shortfall / profile.monthly_surplus)
        if ef_shortfall > 0 and profile.monthly_surplus > 0
        else None
    )
    emergency_fund = api_models.EmergencyFundAnalysis(
        current_balance=profile.emergency_fund,
        current_months=profile.emergency_fund_months,
        target_months=float(EF_MONTHS),
        target_balance=round(ef_target, 2),
        shortfall=round(ef_shortfall, 2),
        pct_complete=round(ef_pct, 1),
        months_to_target=ef_months_to_target,
    )

    sorted_debts = sorted(profile.debts, key=lambda debt: debt.apr, reverse=True)
    monthly_debt_payment = max(profile.monthly_surplus, 1.0)
    debt_snapshots = []
    for rank, debt in enumerate(sorted_debts, 1):
        monthly_interest = round(debt.balance * debt.apr / 12.0, 2)
        months = _months_to_payoff(debt.balance, debt.apr, monthly_debt_payment)
        debt_snapshots.append(
            api_models.DebtSnapshot(
                balance=debt.balance,
                apr=debt.apr,
                kind=debt.kind,
                monthly_interest_cost=monthly_interest,
                months_to_payoff=months,
                total_interest_cost=_total_interest(debt.balance, monthly_debt_payment, months),
                priority_rank=rank,
                gate_status=_debt_gate_status(debt.apr),
            )
        )
    debt_analysis = api_models.DebtAnalysis(
        debts=debt_snapshots,
        total_balance=round(total_debt, 2),
        total_monthly_interest=round(sum(item.monthly_interest_cost for item in debt_snapshots), 2),
        avalanche_order=[
            f"{debt.kind.replace('_', ' ').title()} - {debt.apr * 100:.1f}% APR"
            for debt in sorted_debts
            if debt.apr > 0
        ],
    )

    vol_mid = risk_profile.target_vol_band.mid
    risk_summary = api_models.RiskSummary(
        gamma_mid=risk_profile.gamma_band.mid,
        label=_risk_label(risk_profile.gamma_band.mid),
        capacity_score=risk_profile.capacity_score,
        tolerance_score=risk_profile.tolerance_score,
        binding_axis=risk_profile.binding_axis,
        target_volatility_pct=round(vol_mid * 100.0, 1),
        estimated_max_loss_1yr_pct=round(vol_mid * 2.0 * 100.0, 1),
        loss_aversion_flag=risk_profile.loss_aversion_flag,
        contradiction_note=None,
    )

    steps: list[api_models.GreenLightStep] = []
    total_months = 0
    if gate_result.status == "halt" and ef_shortfall > 0:
        steps.append(
            api_models.GreenLightStep(
                step=1,
                action="Build emergency fund",
                target_amount=round(ef_target, 2),
                months_estimated=ef_months_to_target,
                note=(
                    f"Save ${ef_shortfall:,.0f} to reach ${ef_target:,.0f} "
                    f"({EF_MONTHS:.0f} months of expenses)."
                ),
            )
        )
        total_months += ef_months_to_target or 0

    if gate_result.status == "halt":
        for debt in [debt for debt in sorted_debts if debt.apr > HIGH_APR]:
            months = _months_to_payoff(debt.balance, debt.apr, monthly_debt_payment)
            steps.append(
                api_models.GreenLightStep(
                    step=len(steps) + 1,
                    action=f"Pay off {debt.kind.replace('_', ' ')} ({debt.apr * 100:.0f}% APR)",
                    target_amount=debt.balance,
                    months_estimated=months,
                    note=(
                        f"Direct ${monthly_debt_payment:,.0f}/month toward "
                        f"${debt.balance:,.0f} balance."
                    ),
                )
            )
            total_months += months or 0

    path_to_greenlight = api_models.PathToGreenlight(
        already_green=gate_result.status == "greenlight",
        steps=steps,
        total_months_estimated=0
        if gate_result.status == "greenlight"
        else total_months or None,
    )

    return api_models.FinancialAnalysis(
        snapshot=snapshot,
        debt=debt_analysis,
        emergency_fund=emergency_fund,
        risk=risk_summary,
        path_to_greenlight=path_to_greenlight,
    )


def _risk_profile_with_context(validated: Any, risk_profile: Any) -> SimpleNamespace:
    return SimpleNamespace(
        target_vol_band=risk_profile.target_vol_band,
        age=validated.age,
        horizon_years=validated.horizon_years,
    )


def _periods_per_year(index: Any) -> float:
    try:
        dates = pd.to_datetime(index)
        span_days = max((dates.max() - dates.min()).days, 1)
        return float((len(dates) - 1) * 365.25 / span_days)
    except Exception:
        return 252.0


def _compute_risk_metrics(universe: Any, weights: Any) -> api_models.RiskMetrics:
    _ensure_engine_data()
    sleeve_returns = returns_matrix(universe.sleeves)
    aligned = pd.Series(weights.by_sleeve, dtype=float).reindex(sleeve_returns.columns).fillna(0.0)
    periods = _periods_per_year(sleeve_returns.index)
    annual_cov = cov_ledoit_wolf(sleeve_returns) * periods
    vector = aligned.reindex(annual_cov.columns).fillna(0.0).to_numpy(dtype=float)
    expected_vol = float(np.sqrt(max(vector @ annual_cov.to_numpy(dtype=float) @ vector, 0.0)))

    portfolio_returns = sleeve_returns.dot(aligned)
    tail_cutoff = portfolio_returns.quantile(0.05)
    tail_losses = -portfolio_returns[portfolio_returns <= tail_cutoff]
    expected_shortfall = float(max(0.0, tail_losses.mean() * math.sqrt(periods))) if not tail_losses.empty else 0.0

    contributions = risk_contributions(weights.by_sleeve, annual_cov)
    return api_models.RiskMetrics(
        expected_vol=expected_vol,
        expected_shortfall_95=expected_shortfall,
        risk_contributions={
            str(sleeve): float(contribution)
            for sleeve, contribution in zip(annual_cov.columns, contributions, strict=True)
        },
    )


def _build_portfolio(validated: Any, risk_profile: Any) -> api_models.PortfolioResponse:
    _ensure_engine_data()
    universe = build_universe(
        {
            "universe_pref": validated.universe_pref,
            "esg_exclusions": list(validated.esg_exclusions),
            "sector_theme_tilts": list(validated.sector_theme_tilts),
        }
    )
    weights = build_target_weights(
        _risk_profile_with_context(validated, risk_profile),
        universe,
        load_prices(),
    )
    return api_models.PortfolioResponse(
        universe=api_models.Universe.model_validate(universe.model_dump()),
        weights=api_models.TargetWeights.model_validate(weights.model_dump()),
        metrics=_compute_risk_metrics(universe, weights),
    )


def _build_optimizer_input(
    validated: Any,
    risk_profile: api_models.RiskProfile,
    gate_result: Any,
) -> api_models.OptimizerInput:
    return api_models.OptimizerInput(
        risk_profile=risk_profile,
        universe_pref=validated.universe_pref,
        esg_exclusions=list(validated.esg_exclusions),
        sector_theme_tilts=list(validated.sector_theme_tilts),
        capital_on_hand=validated.capital_on_hand,
        monthly_surplus=round(validated.derived.monthly_surplus, 2),
        age=validated.age,
        horizon_years=validated.horizon_years,
        goal_target=validated.goal_target,
        human_capital_beta=validated.income_stability,
        filing_status=validated.filing_status,
        gate_notes=list(gate_result.notes),
    )


def _run_pipeline(profile_input: api_models.UserProfileInput) -> api_models.OnboardResponse:
    try:
        engine_profile = _to_engine_profile(profile_input)
    except ValidationError as exc:
        return api_models.OnboardResponse(
            status="needs_clarification",
            clarification_requests=_validation_clarifications(exc),
        )

    validated = validate_profile(engine_profile)
    if isinstance(validated, dict):
        gate_result = evaluate_gate(engine_profile)
        if gate_result.status == "halt":
            api_validated = _to_api_validated_from_profile(engine_profile, profile_input)
            return api_models.OnboardResponse(
                status="halt",
                validated_profile=api_validated,
                gate_result=_to_api_gate(gate_result, engine_profile),
            )
        return api_models.OnboardResponse(
            status="needs_clarification",
            clarification_requests=_engine_clarifications(validated),
        )

    risk_profile = build_risk_profile(validated)
    gate_result = evaluate_gate(validated)

    api_validated = _to_api_validated(validated, profile_input)
    api_risk = _to_api_risk(risk_profile)
    api_gate = _to_api_gate(gate_result, validated)
    financial_analysis = _compute_financial_analysis(api_validated, api_risk, api_gate)

    optimizer_input = None
    portfolio = None
    if gate_result.status == "greenlight":
        optimizer_input = _build_optimizer_input(validated, api_risk, gate_result)
        portfolio = _build_portfolio(validated, risk_profile)

    return api_models.OnboardResponse(
        status=gate_result.status,
        validated_profile=api_validated,
        risk_profile=api_risk,
        gate_result=api_gate,
        financial_analysis=financial_analysis,
        optimizer_input=optimizer_input,
        portfolio=portfolio,
    )


def _greenlit_portfolio(profile_input: api_models.UserProfileInput) -> api_models.PortfolioResponse:
    response = _run_pipeline(profile_input)
    if response.status != "greenlight" or response.portfolio is None:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Profile must pass the responsibility gate before portfolio construction.",
                "onboard": response.model_dump(),
            },
        )
    return response.portfolio


def _ticker_monthly_returns(weights: dict[str, float]) -> pd.DataFrame:
    _ensure_engine_data()
    tickers = [ticker for ticker, weight in weights.items() if weight > 0]
    prices = load_prices().pivot(index="date", columns="ticker", values="adj_close").sort_index()
    prices.index = pd.to_datetime(prices.index)
    missing = sorted(set(tickers) - set(prices.columns))
    if missing:
        raise ValueError(f"No cached prices available for ticker(s): {', '.join(missing)}")
    return prices[tickers].resample("ME").last().pct_change().dropna(how="all")


def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


def _json_dt(value: Any) -> str | None:
    return value.isoformat() if value else None


def _message_out(message: ChatMessageRow) -> dict[str, Any]:
    return {
        "role": message.role,
        "content": message.content,
        "seq": message.seq,
        "created_at": _json_dt(message.created_at),
    }


def _session_out(db: Session, chat_session: ChatSession, include_messages: bool = True) -> dict[str, Any]:
    return {
        "id": chat_session.id,
        "kind": chat_session.kind,
        "status": chat_session.status,
        "created_at": _json_dt(chat_session.created_at),
        "updated_at": _json_dt(chat_session.updated_at),
        "extracted_profile": chat_session.get_extracted_profile(),
        "messages": [
            _message_out(message)
            for message in (get_messages(db, chat_session.id) if include_messages else [])
        ],
    }


def _prepare_chat_session(
    session_id: str | None,
    user_email: str | None,
    kind: str,
    messages: list[Any],
) -> str:
    db = get_session()
    try:
        persisted_email = user_email if user_email and get_user(db, user_email) else None
        chat_session = get_or_create_session(db, session_id, persisted_email, kind)
        db.flush()

        stored_count = len(get_messages(db, chat_session.id))
        for message in messages[stored_count:]:
            append_message(db, chat_session.id, message.role, message.content)

        db.commit()
        return chat_session.id
    except Exception:
        db.rollback()
        if session_id:
            return session_id
        raise
    finally:
        db.close()


def _append_assistant_message(session_id: str, content: str) -> None:
    if not content:
        return
    db = get_session()
    try:
        append_message(db, session_id, "assistant", content)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _save_extracted_profile(session_id: str, profile: dict[str, Any]) -> None:
    db = get_session()
    try:
        chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if chat_session:
            chat_session.extracted_profile = json.dumps(profile)
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@router.post("/auth/register", response_model=api_models.AuthResponse)
def register(req: api_models.AuthRequest, db: Session = Depends(get_db)) -> api_models.AuthResponse:
    if not req.name:
        raise HTTPException(status_code=400, detail="Name is required for registration")

    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=req.email,
        name=req.name,
        hashed_password=get_password_hash(req.password),
    )
    db.add(user)
    db.commit()
    return api_models.AuthResponse(email=user.email, name=user.name, token="mock-token-" + user.email)


@router.post("/auth/login", response_model=api_models.AuthResponse)
def login(req: api_models.AuthRequest, db: Session = Depends(get_db)) -> api_models.AuthResponse:
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return api_models.AuthResponse(email=user.email, name=user.name, token="mock-token-" + user.email)


@router.get("/profile/{email}", response_model=api_models.OnboardResponse)
def get_profile(email: str, db: Session = Depends(get_db)) -> api_models.OnboardResponse:
    profile = db.query(Profile).filter(Profile.user_email == email).first()
    if not profile or not profile.get_result():
        return api_models.OnboardResponse(status="no_profile")

    return api_models.OnboardResponse(**profile.get_result())


@router.post("/onboard", response_model=api_models.OnboardResponse, summary="Full intake pipeline")
async def onboard(
    profile_input: api_models.UserProfileInput,
    user_email: str | None = None,
    db: Session = Depends(get_db),
) -> api_models.OnboardResponse:
    """
    Validate profile -> compute risk profile -> run responsibility gate.
    Returns a halt with math or a greenlight with a packaged OptimizerInput.
    """
    response = _run_pipeline(profile_input)

    if user_email and get_user(db, user_email):
        existing_profile = db.query(Profile).filter(Profile.user_email == user_email).first()
        if existing_profile:
            existing_profile.input_data = profile_input.model_dump_json()
            existing_profile.onboard_result = response.model_dump_json()
        else:
            db.add(
                Profile(
                    user_email=user_email,
                    input_data=profile_input.model_dump_json(),
                    onboard_result=response.model_dump_json(),
                )
            )
        db.commit()

    return response


@router.post("/gate/recheck", response_model=api_models.OnboardResponse, summary="Re-run gate on updated profile")
async def recheck(profile_input: api_models.UserProfileInput) -> api_models.OnboardResponse:
    """Re-run after the user has paid off debt or built their emergency fund."""
    return _run_pipeline(profile_input)


@router.post("/portfolio", response_model=api_models.PortfolioResponse, summary="Build target portfolio")
async def portfolio(request: api_models.PortfolioRequest) -> api_models.PortfolioResponse:
    """Build canonical engine universe, target weights, and risk metrics for a greenlit profile."""
    return _greenlit_portfolio(request.profile)


@router.post("/projection", response_model=api_models.Projection, summary="Run Monte Carlo projection")
async def projection(request: api_models.ProjectionRequest) -> api_models.Projection:
    """Project goal success from target weights and cached engine return data."""
    try:
        weights = EngineTargetWeights.model_validate(request.weights.model_dump())
        projection_result = project(
            weights=weights.by_ticker,
            returns=_ticker_monthly_returns(weights.by_ticker),
            horizon_years=request.horizon_years,
            capital=request.capital_on_hand,
            monthly_contribution=request.monthly_contribution,
            goal=request.goal_target,
            generator=request.generator,
            seed=request.seed,
            n_paths=request.n_paths,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return api_models.Projection.model_validate(projection_result.model_dump())


@router.post("/rebalance", response_model=api_models.RebalanceDecision, summary="Decide rebalance action")
async def rebalance(request: api_models.RebalanceRequest) -> api_models.RebalanceDecision:
    """Decide drift-band rebalance actions using the canonical engine."""
    try:
        _ensure_engine_data()
        positions = EnginePositions.model_validate(request.positions.model_dump())
        weights = EngineTargetWeights.model_validate(request.weights.model_dump())
        decision = decide_rebalance(positions, weights)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return api_models.RebalanceDecision.model_validate(decision.model_dump())


@router.post("/tax/report", response_model=api_models.TaxReport, summary="Generate tax-loss harvesting report")
async def tax_report_endpoint(request: api_models.TaxReportRequest) -> api_models.TaxReport:
    """Generate the read-only canonical engine tax report."""
    try:
        _ensure_engine_data()
        positions = EnginePositions.model_validate(request.positions.model_dump())
        report = tax_report(positions, request.cost_basis, request.filing_status)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return api_models.TaxReport.model_validate(report.model_dump())


@router.post("/chat", summary="Elicitation chat - streams tokens then emits profile_ready")
async def chat(request: api_models.ChatRequest) -> StreamingResponse:
    """
    Intake elicitation. Streams SSE:
      {"type": "token",        "content": "..."}
      {"type": "profile_ready","profile": {...}}   - submit to /onboard when received
      {"type": "error",        "content": "..."}
      [DONE]
    """

    try:
        session_id = _prepare_chat_session(
            request.session_id,
            request.user_email,
            "elicitation",
            request.messages,
        )
    except Exception:
        session_id = request.session_id

    async def event_stream():
        if session_id:
            yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"
        assistant_chunks = []
        async for event in stream_elicitation(request.messages):
            if event.get("type") == "token":
                assistant_chunks.append(event.get("content", ""))
            elif event.get("type") == "profile_ready" and session_id:
                _save_extracted_profile(session_id, event.get("profile", {}))
            yield f"data: {json.dumps(event)}\n\n"
        if session_id:
            _append_assistant_message(session_id, "".join(assistant_chunks))
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/advisor/chat", summary="Financial advisor Q&A - streams tokens")
async def advisor_chat(request: api_models.AdvisorChatRequest) -> StreamingResponse:
    """
    General financial advisor chat. Grounded in the user's computed analysis.
    Pass the OnboardResponse from /onboard as `context` to give the advisor
    the user's numbers. Omit `context` for general financial Q&A.

    Streams SSE:
      {"type": "token",  "content": "..."}
      {"type": "error",  "content": "..."}
      [DONE]
    """

    try:
        session_id = _prepare_chat_session(
            request.session_id,
            request.user_email,
            "advisor",
            request.messages,
        )
    except Exception:
        session_id = request.session_id

    async def event_stream():
        if session_id:
            yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"
        assistant_chunks = []
        async for event in stream_advisor(request.messages, request.context):
            if event.get("type") == "token":
                assistant_chunks.append(event.get("content", ""))
            yield f"data: {json.dumps(event)}\n\n"
        if session_id:
            _append_assistant_message(session_id, "".join(assistant_chunks))
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/users/{email}/record", response_model=api_models.UserRecord)
def user_record(email: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    record = get_user_record(db, email)
    if not record:
        raise HTTPException(status_code=404, detail="User not found")
    return record


@router.get("/users/{email}/chats", response_model=list[api_models.ChatSessionOut])
def user_chats(
    email: str,
    kind: str | None = None,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    if not get_user(db, email):
        raise HTTPException(status_code=404, detail="User not found")
    return [
        _session_out(db, chat_session, include_messages=False)
        for chat_session in get_sessions_for_user(db, email, kind)
    ]


@router.get("/chats/{session_id}", response_model=api_models.ChatSessionOut)
def chat_transcript(session_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return _session_out(db, chat_session)


@router.get("/config", summary="Gate thresholds and market assumptions")
async def get_config() -> dict:
    """Canonical constants exposed so the frontend can display the parameter panel."""
    return {
        "gate": {
            "emergency_fund_months_required": EF_MONTHS,
            "high_apr_threshold": HIGH_APR,
            "low_apr_threshold": LOW_APR,
        },
        "market_assumptions": {
            "expected_market_return": EXPECTED_MARKET_RETURN,
            "ltcg_rate": LTCG_RATE,
            "expected_after_tax_market_return": EXPECTED_AFTER_TAX_MARKET_RETURN,
        },
    }
