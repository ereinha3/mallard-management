from __future__ import annotations

import asyncio
import json
import math
import os
import secrets
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Mapping

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
if str(_BACKEND_DIR / "tax") not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR / "tax"))
if str(_ENGINE_DIR) not in sys.path:
    sys.path.append(str(_ENGINE_DIR))

import models as api_models  # noqa: E402
from config import (  # noqa: E402
    EF_MONTHS,
    EXPECTED_AFTER_TAX_MARKET_RETURN,
    EXPECTED_MARKET_RETURN,
    HIGH_APR,
    LOW_APR,
    LTCG_RATE,
)
from persistence import (  # noqa: E402
    ChatMessage as ChatMessageRow,
    ChatSession,
    FundingTransaction,
    InvestmentAccount,
    Profile,
    add_mock_deposit,
    append_message,
    create_user,
    get_messages,
    get_or_create_session,
    get_or_create_investment_account,
    get_latest_active_session,
    get_password_hash,
    get_profile_result,
    get_session,
    get_user,
    list_sessions,
    set_alpaca_account_id,
    set_session_status,
    update_investment_account_cash,
    upsert_profile,
    verify_password,
)
from brokerage import BrokerageService, get_broker_client as _get_broker_client  # noqa: E402
from broker_factory import get_broker  # noqa: E402
from data.seed import seed_database  # noqa: E402
from data.loaders import load_prices, returns_matrix, ticker_metadata  # noqa: E402
from backtest.run import run_backtest_report  # noqa: E402
from gate.responsibility import evaluate_gate  # noqa: E402
from llm.advisor import stream_advisor  # noqa: E402
from llm.elicitation import stream_interview  # noqa: E402
from montecarlo.downside import DEFAULT_SCENARIO_VAR_SEED, scenario_var_1yr_loss  # noqa: E402
from montecarlo.projection import project  # noqa: E402
from optimizer.black_litterman import black_litterman_weights  # noqa: E402
from optimizer.blend import build_target_weights, bucket_return_matrix  # noqa: E402
from optimizer.cvar import cvar_weights  # noqa: E402
from optimizer.erc import cov_ledoit_wolf, erc_weights, risk_contributions  # noqa: E402
from profiler.profile import build_risk_profile  # noqa: E402
from profiler.validate import validate_profile  # noqa: E402
from rebalance.rebalancer import decide_rebalance, rebalance_to_target  # noqa: E402
from schemas.models import (  # noqa: E402
    Positions as EnginePositions,
    TargetWeights as EngineTargetWeights,
    UserProfile as EngineUserProfile,
)
from schemas import constants as engine_constants  # noqa: E402
from sizing.sizer import size_orders  # noqa: E402
from tax.rates import (  # noqa: E402
    expected_after_tax_market_return,
    ltcg_rate_for_bracket,
)
from debt_optimizer import DebtPayoffOptimizer  # noqa: E402
from tax.report import tax_report  # noqa: E402
from taxplanning.bucket_optimizer import BucketOptimizer  # noqa: E402
from taxplanning.calculator import TaxCalculator  # noqa: E402
from universe.builder import build_universe  # noqa: E402

router = APIRouter()
_DATA_READY = False

_RISK_LABELS = [
    (2.0, "Aggressive"),
    (4.0, "Moderate-Aggressive"),
    (6.0, "Moderate"),
    (8.0, "Moderate-Conservative"),
    (float("inf"), "Conservative"),
]
_WEIGHT_TOLERANCE = 1e-6


def get_broker_client() -> Any:
    return _get_broker_client()


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
    tax_fields = {
        "state",
        "zip_code",
        "pretax_401k",
        "pretax_ira",
        "pretax_hsa",
        "employer_match_rate",
        "employer_match_cap_pct",
        "has_hsa_eligible_plan",
        "hsa_coverage",
        "home_value",
        "non_liquid_savings",
    }
    payload = profile_input.model_dump(exclude=tax_fields)
    for debt in payload.get("debts", []):
        debt.pop("minimum_payment", None)
        debt.pop("min_payment", None)
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
    payload["state"] = source.state
    payload["zip_code"] = source.zip_code
    payload["pretax_401k"] = source.pretax_401k
    payload["pretax_ira"] = source.pretax_ira
    payload["pretax_hsa"] = source.pretax_hsa
    payload["employer_match_rate"] = source.employer_match_rate
    payload["employer_match_cap_pct"] = source.employer_match_cap_pct
    payload["has_hsa_eligible_plan"] = source.has_hsa_eligible_plan
    payload["hsa_coverage"] = source.hsa_coverage
    payload["home_value"] = source.home_value
    payload["non_liquid_savings"] = source.non_liquid_savings
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
    payload["state"] = source.state
    payload["zip_code"] = source.zip_code
    payload["pretax_401k"] = source.pretax_401k
    payload["pretax_ira"] = source.pretax_ira
    payload["pretax_hsa"] = source.pretax_hsa
    payload["employer_match_rate"] = source.employer_match_rate
    payload["employer_match_cap_pct"] = source.employer_match_cap_pct
    payload["has_hsa_eligible_plan"] = source.has_hsa_eligible_plan
    payload["hsa_coverage"] = source.hsa_coverage
    payload["home_value"] = source.home_value
    payload["non_liquid_savings"] = source.non_liquid_savings
    payload["monthly_surplus"] = round(monthly_surplus, 2)
    payload["emergency_fund_months"] = round(profile.emergency_fund / profile.monthly_expenses, 3)
    payload["required_emergency_fund"] = round(profile.monthly_expenses * EF_MONTHS, 2)
    return api_models.ValidatedProfile.model_validate(payload)


def _to_api_risk(risk_profile: Any) -> api_models.RiskProfile:
    payload = risk_profile.model_dump()
    return api_models.RiskProfile.model_validate(payload)


def _debt_verdict(
    debt: Any,
    bracket: float | None = None,
    filing_status: str | None = None,
) -> str:
    after_tax_return = expected_after_tax_market_return(bracket, filing_status)
    ltcg_rate = ltcg_rate_for_bracket(bracket, filing_status)
    return (
        f"Paying off your {debt.apr * 100:.0f}% APR debt is a guaranteed, "
        f"tax-free {debt.apr * 100:.0f}% return. Equities return "
        f"~{EXPECTED_MARKET_RETURN * 100:.0f}% nominally, or "
        f"~{after_tax_return * 100:.1f}% after a "
        f"{ltcg_rate * 100:.0f}% capital-gains rate, and that return is uncertain."
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


def _to_api_gate(
    gate_result: Any,
    validated: Any,
    bracket: float | None = None,
) -> api_models.GateResult:
    math_payload: api_models.GateMath | None = None
    effective_bracket = bracket if bracket is not None else getattr(validated, "bracket", None)
    target_balance = validated.monthly_expenses * EF_MONTHS
    shortfall = max(0.0, target_balance - validated.emergency_fund)
    months_covered = validated.emergency_fund / validated.monthly_expenses
    emergency_status = "pass" if shortfall <= 0 else "fail"
    debt = max(validated.debts, key=lambda item: item.apr) if validated.debts else None
    debt_status = "pass"
    debt_detail = f"No debt reported; high-interest threshold is {HIGH_APR:.0%} APR."
    if debt is not None:
        debt_status = "fail" if debt.apr > HIGH_APR else "warn"
        debt_detail = (
            f"Highest debt APR is {debt.apr:.1%} on {debt.kind.replace('_', ' ')} debt; "
            f"high-interest threshold is {HIGH_APR:.0%} APR."
        )
    checks = [
        api_models.GateCheck(
            key="emergency_fund",
            status=emergency_status,
            detail=(
                f"Emergency fund covers {months_covered:.2f} months; target_balance is "
                f"${target_balance:,.2f} for {EF_MONTHS} months; shortfall is ${shortfall:,.2f}."
            ),
        ),
        api_models.GateCheck(
            key="high_interest_debt",
            status=debt_status,
            detail=debt_detail,
        ),
    ]

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
                verdict=_debt_verdict(
                    debt,
                    effective_bracket,
                    getattr(validated, "filing_status", None),
                ),
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
        checks=checks,
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


def _estimated_minimum_payment(debt: Any) -> float:
    explicit = getattr(debt, "minimum_payment", None)
    if explicit is None:
        explicit = getattr(debt, "min_payment", None)
    if explicit is not None and float(explicit) > 0:
        return min(float(explicit), float(debt.balance))
    return min(max(float(debt.balance) * 0.02, 25.0), float(debt.balance))


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
        net_worth_estimate=round(
            profile.capital_on_hand
            + profile.emergency_fund
            + (profile.non_liquid_savings or 0.0)
            + (profile.home_value or 0.0)
            - total_debt,
            2,
        ),
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
    debt_payoff_plan = None
    if profile.debts:
        optimizer = DebtPayoffOptimizer()
        debt_payoff_plan = optimizer.optimize(
            profile.debts,
            profile.monthly_surplus,
            "avalanche",
            mortgage_apr_threshold=HIGH_APR,
        )
        snowball_plan = optimizer.optimize(
            profile.debts,
            profile.monthly_surplus,
            "snowball",
            mortgage_apr_threshold=HIGH_APR,
        )
        if (
            debt_payoff_plan.total_interest_paid is not None
            and snowball_plan.total_interest_paid is not None
        ):
            debt_payoff_plan.avalanche_vs_snowball_interest_saved = round(
                snowball_plan.total_interest_paid - debt_payoff_plan.total_interest_paid,
                2,
            )
    debt_snapshots = []
    for rank, debt in enumerate(sorted_debts, 1):
        monthly_interest = round(debt.balance * debt.apr / 12.0, 2)
        monthly_debt_payment = _estimated_minimum_payment(debt)
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
        estimated_max_loss_1yr_pct=_estimated_max_loss_1yr_pct_for_profile(profile, risk_profile),
        loss_aversion_flag=risk_profile.loss_aversion_flag,
        contradiction_note=risk_profile.contradiction_note,
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
            monthly_debt_payment = _estimated_minimum_payment(debt)
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
        debt_payoff_plan=debt_payoff_plan,
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


def _risk_profile_with_target_vol(validated: Any, target_vol: float) -> SimpleNamespace:
    return SimpleNamespace(
        target_vol_band=SimpleNamespace(mid=float(target_vol)),
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


def _estimated_max_loss_1yr_pct(
    weights: Mapping[str, float],
    returns: Any,
) -> float:
    loss = scenario_var_1yr_loss(
        weights,
        returns,
        seed=DEFAULT_SCENARIO_VAR_SEED,
    )
    return round(loss * 100.0, 1)


def _estimated_max_loss_1yr_pct_for_weights(universe: Any, weights: Any) -> float:
    _ensure_engine_data()
    by_bucket = getattr(weights, "by_bucket", {}) or {}
    if by_bucket and getattr(universe, "buckets", None):
        return _estimated_max_loss_1yr_pct(
            by_bucket,
            bucket_return_matrix(universe, load_prices()),
        )
    return _estimated_max_loss_1yr_pct(
        weights.by_sleeve,
        returns_matrix(universe.sleeves),
    )


def _estimated_max_loss_1yr_pct_for_profile(validated: Any, risk_profile: Any) -> float:
    universe = _build_universe(validated)
    weights = build_target_weights(
        _risk_profile_with_context(validated, risk_profile),
        universe,
        load_prices(),
    )
    return _estimated_max_loss_1yr_pct_for_weights(universe, weights)


def _compute_risk_metrics(universe: Any, weights: Any) -> api_models.RiskMetrics:
    _ensure_engine_data()
    by_bucket = getattr(weights, "by_bucket", {}) or {}
    if by_bucket and getattr(universe, "buckets", None):
        returns = bucket_return_matrix(universe, load_prices())
        aligned = pd.Series(by_bucket, dtype=float).reindex(returns.columns).fillna(0.0)
    else:
        returns = returns_matrix(universe.sleeves)
        aligned = pd.Series(weights.by_sleeve, dtype=float).reindex(returns.columns).fillna(0.0)
    periods = _periods_per_year(returns.index)
    annual_cov = cov_ledoit_wolf(returns) * periods
    vector = aligned.reindex(annual_cov.columns).fillna(0.0).to_numpy(dtype=float)
    expected_vol = float(np.sqrt(max(vector @ annual_cov.to_numpy(dtype=float) @ vector, 0.0)))

    portfolio_returns = returns.dot(aligned)
    tail_cutoff = portfolio_returns.quantile(0.05)
    tail_losses = -portfolio_returns[portfolio_returns <= tail_cutoff]
    expected_shortfall = float(max(0.0, tail_losses.mean() * math.sqrt(periods))) if not tail_losses.empty else 0.0

    contributions = risk_contributions(aligned.reindex(annual_cov.columns).fillna(0.0).to_dict(), annual_cov)
    return api_models.RiskMetrics(
        expected_vol=expected_vol,
        expected_shortfall_95=expected_shortfall,
        risk_contributions={
            str(sleeve): float(contribution)
            for sleeve, contribution in zip(annual_cov.columns, contributions, strict=True)
        },
    )


def _build_universe(validated: Any) -> Any:
    _ensure_engine_data()
    universe = build_universe(
        {
            "universe_pref": validated.universe_pref,
            "esg_exclusions": list(validated.esg_exclusions),
            "sector_theme_tilts": list(validated.sector_theme_tilts),
        }
    )
    if not getattr(universe, "tickers", None) or not getattr(universe, "sleeves", None):
        raise HTTPException(status_code=400, detail="Universe is empty for this profile.")
    return universe


def _portfolio_etfs(universe: Any, weights: Any) -> list[api_models.PortfolioETF]:
    metadata = ticker_metadata()
    replacements = {
        str(item.replacement): item
        for item in getattr(universe, "excluded", [])
        if getattr(item, "replacement", None)
    }
    etfs: list[api_models.PortfolioETF] = []
    for ticker, weight in sorted(weights.by_ticker.items()):
        if weight <= 0.0:
            continue
        meta = metadata.get(str(ticker), {})
        replacement = replacements.get(str(ticker))
        sleeve = str(meta.get("sleeve") or "")
        if not sleeve:
            sleeve = next(
                (
                    str(sleeve_name)
                    for sleeve_name, sleeve_tickers in universe.sleeves.items()
                    if ticker in sleeve_tickers
                ),
                "",
            )
        bucket = str(meta.get("bucket") or "")
        if not bucket:
            bucket = next(
                (
                    str(bucket_name)
                    for bucket_name, bucket_tickers in getattr(universe, "buckets", {}).items()
                    if ticker in bucket_tickers
                ),
                "",
            )
        etfs.append(
            api_models.PortfolioETF(
                ticker=str(ticker),
                name=str(meta.get("name") or ticker),
                sleeve=sleeve,
                bucket=bucket,
                weight=float(weight),
                replacement_for=None if replacement is None else str(replacement.ticker),
                exclusion_reason=None if replacement is None else str(replacement.reason),
            )
        )
    return etfs


def _portfolio_response(universe: Any, weights: Any) -> api_models.PortfolioResponse:
    return api_models.PortfolioResponse(
        universe=api_models.Universe.model_validate(universe.model_dump()),
        weights=api_models.TargetWeights.model_validate(weights.model_dump()),
        metrics=_compute_risk_metrics(universe, weights),
        etfs=_portfolio_etfs(universe, weights),
    )


def _build_portfolio(validated: Any, risk_profile: Any) -> api_models.PortfolioResponse:
    universe = _build_universe(validated)
    weights = build_target_weights(
        _risk_profile_with_context(validated, risk_profile),
        universe,
        load_prices(),
    )
    return _portfolio_response(universe, weights)


def _target_weights_from_sleeves(
    universe: Any,
    sleeve_weights: Mapping[str, float],
    method: str,
) -> EngineTargetWeights:
    by_sleeve = {sleeve: max(0.0, float(sleeve_weights.get(sleeve, 0.0))) for sleeve in universe.sleeves}
    sleeve_total = sum(by_sleeve.values())
    if sleeve_total <= 0.0:
        raise HTTPException(status_code=400, detail=f"{method} optimizer returned zero weights.")
    by_sleeve = {sleeve: weight / sleeve_total for sleeve, weight in by_sleeve.items()}

    by_ticker: dict[str, float] = {}
    for sleeve, sleeve_weight in by_sleeve.items():
        tickers = list(universe.sleeves[sleeve])
        ticker_weight = sleeve_weight / len(tickers)
        for ticker in tickers:
            by_ticker[ticker] = by_ticker.get(ticker, 0.0) + ticker_weight
    ticker_total = sum(by_ticker.values())
    by_ticker = {ticker: weight / ticker_total for ticker, weight in by_ticker.items()}
    by_bucket = _by_bucket_from_tickers(universe, by_ticker)

    risky_fraction = sum(by_sleeve.get(sleeve, 0.0) for sleeve in universe.risky_sleeves)
    return EngineTargetWeights(
        by_ticker=by_ticker,
        by_sleeve=by_sleeve,
        by_bucket=by_bucket,
        blend_alpha=float(max(0.0, min(1.0, risky_fraction))),
        method=method,
    )


def _build_alternative_portfolio(validated: Any, method: str) -> api_models.PortfolioResponse:
    universe = _build_universe(validated)
    sleeve_returns = returns_matrix(universe.sleeves)
    if method == "black_litterman":
        sleeve_weights = black_litterman_weights(
            sleeve_returns,
            universe.market_weights,
            profile=validated,
        )
    elif method == "cvar":
        sleeve_weights = cvar_weights(sleeve_returns, n_scenarios=750, seed=17, max_iter=800)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown portfolio method: {method}")

    weights = _target_weights_from_sleeves(universe, sleeve_weights, method)
    return _portfolio_response(universe, weights)


def _build_portfolio_at_target_vol(validated: Any, target_vol: float) -> api_models.PortfolioResponse:
    universe = _build_universe(validated)
    weights = build_target_weights(
        _risk_profile_with_target_vol(validated, target_vol),
        universe,
        load_prices(),
    )
    return _portfolio_response(universe, weights)


def _optimizer_target_vol_for_dial(universe: Any, risk_dial: float) -> float:
    """Map the user dial onto the realized safe/risky frontier used by the optimizer."""
    _ensure_engine_data()
    returns = bucket_return_matrix(universe, load_prices())
    risky_buckets = [bucket for bucket in universe.risky_buckets if bucket in returns.columns]
    safe_buckets = [bucket for bucket in universe.safe_buckets if bucket in returns.columns]
    if not risky_buckets or not safe_buckets:
        raise ValueError("Universe must include risky and safe buckets for risk-dial optimization.")

    risky_weights = erc_weights(returns[risky_buckets])
    safe_weights = {
        bucket: float(universe.bucket_market_weights.get(bucket, 0.0))
        for bucket in safe_buckets
    }
    if sum(safe_weights.values()) <= 0:
        safe_weights = {bucket: 1.0 for bucket in safe_buckets}
    safe_weights = _normalize_weights(safe_weights, "safe_bucket")

    risky_series = returns[list(risky_weights)].dot(pd.Series(risky_weights, dtype=float))
    safe_series = returns[list(safe_weights)].dot(pd.Series(safe_weights, dtype=float))
    portfolios = pd.DataFrame({"risky": risky_series, "safe": safe_series}).dropna(how="any")
    annual_cov = cov_ledoit_wolf(portfolios) * _periods_per_year(portfolios.index)
    sigma_safe = float(np.sqrt(max(annual_cov.loc["safe", "safe"], 0.0)))
    sigma_risky = float(np.sqrt(max(annual_cov.loc["risky", "risky"], 0.0)))
    low, high = sorted((sigma_safe, sigma_risky))
    dial = max(0.0, min(1.0, float(risk_dial)))
    if high <= low:
        return high
    return low + ((high - low) * dial)


def _greenlit_engine_context(profile_input: api_models.UserProfileInput) -> tuple[Any, Any]:
    try:
        engine_profile = _to_engine_profile(profile_input)
    except ValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Profile requires clarification before portfolio construction.",
                "clarification_requests": [
                    request.model_dump() for request in _validation_clarifications(exc)
                ],
            },
        ) from exc

    validated = validate_profile(engine_profile)
    if isinstance(validated, dict):
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Profile requires clarification before portfolio construction.",
                "clarification_requests": [
                    request.model_dump() for request in _engine_clarifications(validated)
                ],
            },
        )

    gate_result = evaluate_gate(validated, validated.bracket)
    if gate_result.status != "greenlight":
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Profile must pass the responsibility gate before portfolio construction.",
                "gate_result": _to_api_gate(gate_result, validated, validated.bracket).model_dump(),
            },
        )

    return validated, build_risk_profile(validated)


def _normalize_weights(weights: dict[str, float], label: str) -> dict[str, float]:
    total = float(sum(weights.values()))
    if total <= 0:
        raise HTTPException(status_code=400, detail=f"{label} weights must have a positive total.")
    return {key: float(value) / total for key, value in weights.items()}


def _ticker_to_sleeve(universe: Any) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for sleeve, tickers in universe.sleeves.items():
        for ticker in tickers:
            mapping[str(ticker)] = str(sleeve)
    return mapping


def _ticker_to_bucket(universe: Any) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for bucket, tickers in getattr(universe, "buckets", {}).items():
        for ticker in tickers:
            mapping[str(ticker)] = str(bucket)
    return mapping


def _by_bucket_from_tickers(universe: Any, by_ticker: Mapping[str, float]) -> dict[str, float]:
    ticker_buckets = _ticker_to_bucket(universe)
    by_bucket: dict[str, float] = {str(bucket): 0.0 for bucket in getattr(universe, "buckets", {})}
    for ticker, weight in by_ticker.items():
        bucket = ticker_buckets.get(str(ticker))
        if bucket is not None:
            by_bucket[bucket] = by_bucket.get(bucket, 0.0) + float(weight)
    return _normalize_weights(by_bucket, "by_bucket")


def _weights_from_sleeves(
    universe: Any,
    weights: dict[Any, float],
) -> tuple[dict[str, float], dict[str, float], dict[str, float], list[str]]:
    warnings: list[str] = []
    known_sleeves = {str(sleeve) for sleeve in universe.sleeves}
    unknown = sorted(str(sleeve) for sleeve in weights if str(sleeve) not in known_sleeves)
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown sleeve(s): {', '.join(unknown)}",
        )

    raw_by_sleeve = {
        sleeve: float(weights.get(sleeve, 0.0))
        for sleeve in known_sleeves
    }
    raw_total = float(sum(raw_by_sleeve.values()))
    if abs(raw_total - 1.0) > _WEIGHT_TOLERANCE:
        warnings.append(f"Input by_sleeve sum was {raw_total:.6f}; normalized to 1.0.")
    by_sleeve = _normalize_weights(raw_by_sleeve, "by_sleeve")
    by_ticker: dict[str, float] = {}
    for sleeve, sleeve_weight in by_sleeve.items():
        tickers = list(universe.sleeves.get(sleeve, []))
        if not tickers:
            warnings.append(f"Sleeve {sleeve} has no available tickers.")
            continue
        ticker_weight = sleeve_weight / len(tickers)
        for ticker in tickers:
            by_ticker[str(ticker)] = by_ticker.get(str(ticker), 0.0) + ticker_weight

    by_ticker = _normalize_weights(by_ticker, "by_ticker")
    return by_ticker, by_sleeve, _by_bucket_from_tickers(universe, by_ticker), warnings


def _weights_from_tickers(
    universe: Any,
    weights: dict[str, float],
) -> tuple[dict[str, float], dict[str, float], dict[str, float], list[str]]:
    warnings: list[str] = []
    ticker_sleeves = _ticker_to_sleeve(universe)
    ticker_buckets = _ticker_to_bucket(universe)
    known = {
        str(ticker): float(weight)
        for ticker, weight in weights.items()
        if str(ticker) in ticker_sleeves
    }
    unknown = sorted(str(ticker) for ticker in weights if str(ticker) not in ticker_sleeves)
    if unknown:
        warnings.append(f"Ignored unknown ticker(s): {', '.join(unknown)}.")

    raw_total = float(sum(known.values()))
    if abs(raw_total - 1.0) > _WEIGHT_TOLERANCE:
        warnings.append(f"Input by_ticker sum was {raw_total:.6f}; normalized to 1.0.")
    by_ticker = _normalize_weights(known, "by_ticker")
    by_sleeve: dict[str, float] = {}
    by_bucket: dict[str, float] = {}
    for ticker, weight in by_ticker.items():
        sleeve = ticker_sleeves[ticker]
        by_sleeve[sleeve] = by_sleeve.get(sleeve, 0.0) + weight
        bucket = ticker_buckets.get(ticker)
        if bucket is not None:
            by_bucket[bucket] = by_bucket.get(bucket, 0.0) + weight

    return by_ticker, _normalize_weights(by_sleeve, "by_sleeve"), _normalize_weights(by_bucket, "by_bucket"), warnings


def _analyze_weight_inputs(
    universe: Any,
    weights: api_models.EditableWeights,
) -> tuple[dict[str, float], dict[str, float], dict[str, float], list[str]]:
    if weights.by_sleeve:
        by_ticker, by_sleeve, by_bucket, warnings = _weights_from_sleeves(universe, weights.by_sleeve)
        if weights.by_ticker:
            warnings.append("by_ticker was ignored because by_sleeve was provided.")
        return by_ticker, by_sleeve, by_bucket, warnings

    return _weights_from_tickers(universe, weights.by_ticker or {})


def _portfolio_weight_validation(
    universe: Any,
    by_ticker: dict[str, float],
    by_sleeve: dict[str, float],
    by_bucket: dict[str, float],
    warnings: list[str],
) -> api_models.PortfolioWeightsValidation:
    sum_by_ticker = float(sum(by_ticker.values()))
    sum_by_sleeve = float(sum(by_sleeve.values()))
    risky_buckets = {str(bucket) for bucket in getattr(universe, "risky_buckets", [])}
    safe_buckets = {str(bucket) for bucket in getattr(universe, "safe_buckets", [])}
    sum_risky_bucket = float(sum(weight for bucket, weight in by_bucket.items() if bucket in risky_buckets))
    sum_safe_bucket = float(sum(weight for bucket, weight in by_bucket.items() if bucket in safe_buckets))

    risky_within = (
        sum(float(by_bucket.get(bucket, 0.0)) / sum_risky_bucket for bucket in risky_buckets)
        if sum_risky_bucket > _WEIGHT_TOLERANCE
        else 0.0
    )
    safe_within = (
        sum(float(by_bucket.get(bucket, 0.0)) / sum_safe_bucket for bucket in safe_buckets)
        if sum_safe_bucket > _WEIGHT_TOLERANCE
        else 0.0
    )

    next_warnings = list(warnings)
    if abs(sum_by_sleeve - 1.0) > _WEIGHT_TOLERANCE:
        next_warnings.append(f"Normalized by_sleeve sum is {sum_by_sleeve:.6f}; expected 1.0.")
    if abs((sum_risky_bucket + sum_safe_bucket) - 1.0) > _WEIGHT_TOLERANCE:
        next_warnings.append(
            "Risky and safe bucket shares do not sum to 1.0 after normalization."
        )
    if sum_safe_bucket > _WEIGHT_TOLERANCE and abs(safe_within - 1.0) > _WEIGHT_TOLERANCE:
        next_warnings.append(f"Safe bucket internal sum is {safe_within:.6f}; expected 1.0.")
    if sum_risky_bucket > _WEIGHT_TOLERANCE and abs(risky_within - 1.0) > _WEIGHT_TOLERANCE:
        next_warnings.append(f"Risky bucket internal sum is {risky_within:.6f}; expected 1.0.")

    return api_models.PortfolioWeightsValidation(
        sum_by_ticker=sum_by_ticker,
        sum_by_sleeve=sum_by_sleeve,
        sum_risky_bucket=sum_risky_bucket,
        sum_safe_bucket=sum_safe_bucket,
        sum_risky_within_bucket=float(risky_within),
        sum_safe_within_bucket=float(safe_within),
        warnings=next_warnings,
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
        gate_result = evaluate_gate(engine_profile, engine_profile.bracket)
        if gate_result.status == "halt":
            api_validated = _to_api_validated_from_profile(engine_profile, profile_input)
            return api_models.OnboardResponse(
                status="halt",
                validated_profile=api_validated,
                gate_result=_to_api_gate(gate_result, engine_profile, engine_profile.bracket),
            )
        return api_models.OnboardResponse(
            status="needs_clarification",
            clarification_requests=_engine_clarifications(validated),
        )

    risk_profile = build_risk_profile(validated)
    if isinstance(risk_profile, dict):
        return api_models.OnboardResponse(
            status="needs_clarification",
            validated_profile=_to_api_validated(validated, profile_input),
            clarification_requests=_engine_clarifications(risk_profile),
        )
    gate_result = evaluate_gate(validated, validated.bracket)

    api_validated = _to_api_validated(validated, profile_input)
    api_risk = _to_api_risk(risk_profile)
    api_gate = _to_api_gate(gate_result, validated, validated.bracket)
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
        debt_payoff_plan=financial_analysis.debt_payoff_plan,
        optimizer_input=optimizer_input,
        portfolio=portfolio,
    )


def _greenlit_portfolio(
    profile_input: api_models.UserProfileInput,
    method: str = "erc",
) -> api_models.PortfolioResponse:
    response = _run_pipeline(profile_input)
    if response.status != "greenlight" or response.portfolio is None:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Profile must pass the responsibility gate before portfolio construction.",
                "onboard": response.model_dump(),
            },
        )
    if method != "erc":
        if response.validated_profile is None:
            raise HTTPException(status_code=400, detail="Validated profile is required.")
        return _build_alternative_portfolio(response.validated_profile, method)
    return response.portfolio


def _ticker_monthly_returns(weights: dict[str, float]) -> pd.DataFrame:
    _ensure_engine_data()
    tickers = [ticker for ticker, weight in weights.items() if weight > 0]
    prices = load_prices().pivot(index="date", columns="ticker", values="adj_close").sort_index()
    prices.index = pd.to_datetime(prices.index)
    monthly = prices.resample("ME").last().pct_change().dropna(how="all")
    missing = sorted(set(tickers) - set(prices.columns))
    if missing:
        metadata = ticker_metadata()
        sleeve_by_ticker = {
            ticker: str(meta.get("sleeve") or "")
            for ticker, meta in metadata.items()
        }
        if monthly.empty:
            raise ValueError(f"No cached prices available for ticker(s): {', '.join(missing)}")
        for ticker in missing:
            sleeve = sleeve_by_ticker.get(ticker, "")
            proxies = [
                column
                for column in monthly.columns
                if sleeve and sleeve_by_ticker.get(str(column), "") == sleeve
            ]
            if not proxies:
                proxies = list(monthly.columns)
            monthly[ticker] = monthly[proxies].mean(axis=1)
    return monthly[tickers].dropna(how="all")


def _price_backed_weights(weights: EngineTargetWeights) -> EngineTargetWeights:
    prices = load_prices()
    priced = set(prices["ticker"].dropna().astype(str))
    metadata = ticker_metadata()
    sleeve_by_ticker = {
        ticker: str(meta.get("sleeve") or "")
        for ticker, meta in metadata.items()
    }
    by_ticker: dict[str, float] = {}
    for sleeve, sleeve_weight in weights.by_sleeve.items():
        sleeve_tickers = [
            ticker
            for ticker, ticker_weight in weights.by_ticker.items()
            if ticker_weight > 0.0
            and ticker in priced
            and sleeve_by_ticker.get(str(ticker), "") == str(sleeve)
        ]
        if not sleeve_tickers:
            sleeve_tickers = [
                ticker
                for ticker in sorted(priced)
                if sleeve_by_ticker.get(str(ticker), "") == str(sleeve)
            ]
        if not sleeve_tickers:
            continue
        raw = {ticker: float(weights.by_ticker.get(ticker, 0.0)) for ticker in sleeve_tickers}
        total = sum(raw.values())
        if total <= 0.0:
            raw = {ticker: 1.0 for ticker in sleeve_tickers}
            total = sum(raw.values())
        for ticker, ticker_weight in raw.items():
            by_ticker[ticker] = by_ticker.get(ticker, 0.0) + float(sleeve_weight) * ticker_weight / total

    total = sum(by_ticker.values())
    if total <= 0.0:
        return weights
    return EngineTargetWeights(
        by_ticker={ticker: weight / total for ticker, weight in by_ticker.items()},
        by_sleeve=weights.by_sleeve,
        by_bucket=getattr(weights, "by_bucket", {}) or {},
        blend_alpha=weights.blend_alpha,
        method=weights.method,
    )


async def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


def _json_dt(value: Any) -> str | None:
    return value.isoformat() if value else None


def _investment_account_out(account: InvestmentAccount) -> api_models.InvestmentAccountOut:
    return api_models.InvestmentAccountOut(
        user_email=account.user_email,
        cash_available=account.cash_available,
        cash_pending=account.cash_pending,
        broker_provider=account.broker_provider,
        alpaca_account_id=account.alpaca_account_id,
    )


def _funding_transaction_out(transaction: FundingTransaction) -> api_models.FundingTransactionOut:
    return api_models.FundingTransactionOut(
        id=transaction.id,
        user_email=transaction.user_email,
        provider="mock_ach",
        amount=transaction.amount,
        status="succeeded",
        created_at=transaction.created_at,
    )


def _message_out(message: ChatMessageRow) -> dict[str, Any]:
    return {
        "role": message.role,
        "content": message.content,
        "seq": message.seq,
        "created_at": _json_dt(message.created_at),
    }


def _session_out(
    db: Session,
    chat_session: ChatSession,
    include_messages: bool = True,
) -> dict[str, Any]:
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


def _profile_input(profile: Profile | None) -> dict[str, Any] | None:
    return profile.get_input() if profile else None


def _stored_profile_or_404(db: Session, email: str) -> Profile:
    profile = db.query(Profile).filter(Profile.user_email == email).first()
    if not profile or not profile.get_result():
        raise HTTPException(status_code=404, detail="Stored profile not found")
    return profile


def _request_email(query_email: str | None, body_email: str | None) -> str:
    email = query_email or body_email
    if not email:
        raise HTTPException(status_code=400, detail="user_email is required")
    return email


def _deep_merge(base: dict[str, Any], patch: Mapping[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in patch.items():
        if isinstance(value, Mapping) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _apply_saved_risk_summary(
    result: dict[str, Any],
    risk_summary: api_models.PortfolioRiskSummary | None,
) -> None:
    if risk_summary is None:
        return

    summary = risk_summary.model_dump(mode="json")
    financial_analysis = result.get("financial_analysis")
    if isinstance(financial_analysis, dict) and isinstance(financial_analysis.get("risk"), dict):
        financial_analysis["risk"].update(summary)

    risk_profile = result.get("risk_profile")
    target_volatility_pct = summary.get("target_volatility_pct")
    if isinstance(risk_profile, dict) and target_volatility_pct is not None:
        target_vol_band = risk_profile.get("target_vol_band")
        if isinstance(target_vol_band, dict):
            target_vol_band["mid"] = float(target_volatility_pct) / 100.0


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
async def register(req: api_models.AuthRequest, db: Session = Depends(get_db)) -> api_models.AuthResponse:
    if not req.name:
        raise HTTPException(status_code=400, detail="Name is required for registration")

    if get_user(db, req.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    user = create_user(db, req.email, req.name, get_password_hash(req.password))
    db.commit()
    return api_models.AuthResponse(email=user.email, name=user.name, token="mock-token-" + user.email)


@router.post("/auth/login", response_model=api_models.AuthResponse)
async def login(req: api_models.AuthRequest, db: Session = Depends(get_db)) -> api_models.AuthResponse:
    user = get_user(db, req.email)
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return api_models.AuthResponse(email=user.email, name=user.name, token="mock-token-" + user.email)


@router.post("/funding/mock/deposit", response_model=api_models.FundingTransactionOut)
async def mock_deposit(
    request: api_models.FundingDepositRequest,
    db: Session = Depends(get_db),
) -> api_models.FundingTransactionOut:
    """Mock ACH funding stub: no real money movement, no Stripe integration."""
    transaction = add_mock_deposit(db, request.user_email, request.amount)
    db.commit()
    db.refresh(transaction)
    return _funding_transaction_out(transaction)


@router.get("/funding/account/{user_email}", response_model=api_models.InvestmentAccountOut)
async def funding_account(
    user_email: str,
    db: Session = Depends(get_db),
) -> api_models.InvestmentAccountOut:
    account = get_or_create_investment_account(db, user_email)
    db.commit()
    db.refresh(account)
    return _investment_account_out(account)


@router.post("/brokerage/account", response_model=api_models.BrokerageAccountOut)
async def brokerage_account(
    request: api_models.BrokerageAccountRequest,
    db: Session = Depends(get_db),
) -> api_models.BrokerageAccountOut:
    try:
        service = BrokerageService(client=get_broker_client())
        account_id = service.create_brokerage_account({"email_address": request.user_email})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    account = set_alpaca_account_id(db, request.user_email, account_id)
    db.commit()
    db.refresh(account)
    return api_models.BrokerageAccountOut(
        user_email=account.user_email,
        alpaca_account_id=account.alpaca_account_id or account_id,
    )


@router.post(
    "/brokerage/ach-relationship",
    response_model=api_models.BrokerageACHRelationshipOut,
)
async def brokerage_ach_relationship(
    request: api_models.BrokerageACHRelationshipRequest,
    db: Session = Depends(get_db),
) -> api_models.BrokerageACHRelationshipOut:
    account = get_or_create_investment_account(db, request.user_email)
    if not account.alpaca_account_id:
        raise HTTPException(status_code=400, detail="No alpaca_account_id stored for user.")

    try:
        service = BrokerageService(client=get_broker_client())
        relationship = service.create_ach_relationship(
            account.alpaca_account_id,
            request.model_dump(exclude={"user_email"}),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return api_models.BrokerageACHRelationshipOut(
        id=getattr(relationship, "id", None),
        status=getattr(relationship, "status", None),
    )


@router.post("/brokerage/deposit", response_model=api_models.BrokerageDepositOut)
async def brokerage_deposit(
    request: api_models.BrokerageDepositRequest,
    db: Session = Depends(get_db),
) -> api_models.BrokerageDepositOut:
    account = get_or_create_investment_account(db, request.user_email)
    if not account.alpaca_account_id:
        raise HTTPException(status_code=400, detail="No alpaca_account_id stored for user.")

    try:
        service = BrokerageService(client=get_broker_client())
        deposit = service.create_deposit(
            account.alpaca_account_id, request.relationship_id, request.amount
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return api_models.BrokerageDepositOut(
        id=getattr(deposit, "id", None),
        status=getattr(deposit, "status", None),
    )


@router.post("/brokerage/journal", response_model=api_models.BrokerageJournalOut)
async def brokerage_journal(
    request: api_models.BrokerageJournalRequest,
    db: Session = Depends(get_db),
) -> api_models.BrokerageJournalOut:
    account = get_or_create_investment_account(db, request.user_email)
    if not account.alpaca_account_id:
        raise HTTPException(status_code=400, detail="No alpaca_account_id stored for user.")

    try:
        service = BrokerageService(client=get_broker_client())
        journal = service.journal_funds(account.alpaca_account_id, request.amount)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    updated_account = update_investment_account_cash(
        db,
        request.user_email,
        account.cash_available + request.amount,
    )
    db.commit()
    db.refresh(updated_account)
    return api_models.BrokerageJournalOut(
        id=getattr(journal, "id", None),
        status=getattr(journal, "status", None),
        cash_available=updated_account.cash_available,
    )


@router.post("/execution/preview", response_model=api_models.OrderPlanOut)
async def execution_preview(
    request: api_models.ExecutionRequest,
    db: Session = Depends(get_db),
) -> api_models.OrderPlanOut:
    account = get_or_create_investment_account(db, request.user_email)
    weights = EngineTargetWeights.model_validate(request.weights.model_dump())
    plan = size_orders(weights, capital_on_hand=account.cash_available, monthly_surplus=0.0)
    return api_models.OrderPlanOut.model_validate(plan.model_dump())


@router.post("/execution/submit", response_model=api_models.ExecutionSubmitResponse)
async def execution_submit(
    request: api_models.ExecutionRequest,
    db: Session = Depends(get_db),
) -> api_models.ExecutionSubmitResponse:
    account = get_or_create_investment_account(db, request.user_email)
    weights = EngineTargetWeights.model_validate(request.weights.model_dump())
    plan = size_orders(weights, capital_on_hand=account.cash_available, monthly_surplus=0.0)
    # TODO: extend the engine order contract before wiring sell-side rebalances.
    try:
        broker = get_broker(request.user_email, cash_available=account.cash_available)
        fills = broker.place_order(plan)
        positions = broker.read_positions()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    update_investment_account_cash(db, request.user_email, positions.cash)
    db.commit()
    return api_models.ExecutionSubmitResponse(
        fills=[api_models.FillOut.model_validate(fill.model_dump()) for fill in fills],
        positions=api_models.Positions.model_validate(positions.model_dump()),
    )


@router.post("/execution/rebalance/submit", response_model=api_models.RebalanceSubmitResponse)
async def execution_rebalance_submit(
    request: api_models.RebalanceExecutionRequest,
    db: Session = Depends(get_db),
) -> api_models.RebalanceSubmitResponse:
    account = get_or_create_investment_account(db, request.user_email)
    weights = EngineTargetWeights.model_validate(request.weights.model_dump())
    try:
        _ensure_engine_data()
        broker = get_broker(request.user_email, cash_available=account.cash_available)
        current_positions = broker.read_positions()
        decision = decide_rebalance(current_positions, weights)
        fills = []
        positions = current_positions
        if decision.action == "trade":
            fills = broker.place_trades(decision.trades)
            positions = broker.read_positions()
            update_investment_account_cash(db, request.user_email, positions.cash)
            db.commit()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return api_models.RebalanceSubmitResponse(
        action=decision.action,
        drifts={
            sleeve: api_models.Drift.model_validate(drift.model_dump())
            for sleeve, drift in decision.drifts.items()
        },
        steer=(
            api_models.Steer.model_validate(decision.steer.model_dump())
            if decision.steer is not None
            else None
        ),
        trades=[api_models.RebalanceTrade.model_validate(trade.model_dump()) for trade in decision.trades],
        fills=[api_models.FillOut.model_validate(fill.model_dump()) for fill in fills],
        positions=api_models.Positions.model_validate(positions.model_dump()),
    )


@router.get("/positions/{user_email}", response_model=api_models.Positions)
async def positions(user_email: str, db: Session = Depends(get_db)) -> api_models.Positions:
    account = get_or_create_investment_account(db, user_email)
    try:
        broker = get_broker(user_email, cash_available=account.cash_available)
        broker_positions = broker.read_positions()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return api_models.Positions.model_validate(broker_positions.model_dump())


@router.get("/profile/{email}", response_model=api_models.OnboardResponse)
async def get_profile(email: str, db: Session = Depends(get_db)) -> api_models.OnboardResponse:
    result = get_profile_result(db, email)
    if not result:
        return api_models.OnboardResponse(status="no_profile")

    return api_models.OnboardResponse(**result)


@router.post("/portfolio/save", response_model=api_models.OnboardResponse)
async def portfolio_save(
    request: api_models.SavePortfolioRequest,
    user_email: str | None = None,
    db: Session = Depends(get_db),
) -> api_models.OnboardResponse:
    email = _request_email(user_email, request.user_email)
    profile = _stored_profile_or_404(db, email)
    result = profile.get_result()
    if result is None:
        raise HTTPException(status_code=404, detail="Stored profile not found")

    result["portfolio"] = request.portfolio.model_dump(mode="json")
    _apply_saved_risk_summary(result, request.risk_summary)
    try:
        response = api_models.OnboardResponse.model_validate(result)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    upsert_profile(
        db,
        email,
        json.dumps(profile.get_input()),
        response.model_dump_json(),
    )
    db.commit()
    return response


@router.post("/profile/update", response_model=api_models.OnboardResponse)
async def profile_update(
    request: api_models.UpdateProfileRequest,
    user_email: str | None = None,
    db: Session = Depends(get_db),
) -> api_models.OnboardResponse:
    email = _request_email(user_email, request.user_email)
    profile = _stored_profile_or_404(db, email)
    merged_input = _deep_merge(profile.get_input(), request.profile_patch)
    try:
        profile_input = api_models.UserProfileInput.model_validate(merged_input)
    except ValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Updated profile is invalid.",
                "clarification_requests": [
                    clarification.model_dump()
                    for clarification in _validation_clarifications(exc)
                ],
            },
        ) from exc

    response = _run_pipeline(profile_input)
    upsert_profile(
        db,
        email,
        profile_input.model_dump_json(),
        response.model_dump_json(),
    )
    db.commit()
    return response


def _marginal_federal_rate(tax_breakdown: Any) -> float | None:
    """Marginal (last-dollar) federal ordinary rate implied by Gilbert's computed
    tax breakdown. This is the bracket-aware input the gate / TLH math (G-03)
    consume — derived from the real federal brackets + taxable income rather than
    a manual guess. Returns None if the breakdown is malformed."""
    try:
        federal = tax_breakdown.tax_rate_bundle.federal
        taxable = max(0.0, float(tax_breakdown.agi) - float(federal.standard_deduction))
        marginal: float | None = None
        for bracket in sorted(federal.brackets, key=lambda b: float(b.min_income)):
            if taxable > float(bracket.min_income):
                marginal = float(bracket.rate)
        return marginal
    except Exception:
        return None


@router.post("/onboard", response_model=api_models.OnboardResponse, summary="Full intake pipeline")
async def onboard(
    profile_input: api_models.UserProfileInput,
    user_email: str | None = None,
    session_id: str | None = None,
    db: Session = Depends(get_db),
) -> api_models.OnboardResponse:
    """
    Validate profile -> compute risk profile -> run responsibility gate.
    Returns a halt with math or a greenlight with a packaged OptimizerInput.

    When ``session_id`` is supplied, the elicitation session that produced this
    profile is marked ``complete`` so it is no longer surfaced as resumable.
    """
    # Compute Gilbert's gross-to-net tax breakdown FIRST (best-effort, LLM-backed,
    # so guarded + timed out), then feed its marginal federal bracket into the
    # gate / TLH math instead of the manual `bracket` field. If it is absent or
    # fails, the gate falls back to the deterministic default (G-03).
    tax_breakdown = None
    if profile_input.zip_code:
        try:
            calculator = TaxCalculator()
            tax_breakdown = await asyncio.wait_for(
                calculator.calculate(
                    gross_income=profile_input.household_income,
                    filing_status=profile_input.filing_status,
                    zip_code=profile_input.zip_code,
                    pretax_401k=profile_input.pretax_401k or 0.0,
                    pretax_ira=profile_input.pretax_ira or 0.0,
                    pretax_hsa=profile_input.pretax_hsa or 0.0,
                ),
                timeout=15.0,
            )
        except Exception:
            tax_breakdown = None

    if tax_breakdown is not None and profile_input.bracket is None:
        marginal = _marginal_federal_rate(tax_breakdown)
        if marginal is not None:
            profile_input = profile_input.model_copy(update={"bracket": marginal})

    response = _run_pipeline(profile_input)
    response.tax_breakdown = tax_breakdown

    if response.validated_profile is not None:
        try:
            optimizer = BucketOptimizer()
            response.bucket_plan = optimizer.optimize(
                gross_income=response.validated_profile.household_income,
                filing_status=response.validated_profile.filing_status,
                age=response.validated_profile.age,
                monthly_surplus=response.validated_profile.monthly_surplus,
                employer_match_rate=response.validated_profile.employer_match_rate,
                employer_match_cap_pct=response.validated_profile.employer_match_cap_pct,
                has_hsa=response.validated_profile.has_hsa_eligible_plan,
                hsa_coverage=response.validated_profile.hsa_coverage,
                tax_brackets=tax_breakdown.tax_rate_bundle if tax_breakdown else None,
            )
        except Exception:
            pass

    if user_email and get_user(db, user_email):
        upsert_profile(
            db,
            user_email,
            profile_input.model_dump_json(),
            response.model_dump_json(),
        )
        if session_id:
            set_session_status(db, session_id, "complete")
        db.commit()

    return response


@router.post("/gate/recheck", response_model=api_models.OnboardResponse, summary="Re-run gate on updated profile")
async def recheck(profile_input: api_models.UserProfileInput) -> api_models.OnboardResponse:
    """Re-run after the user has paid off debt or built their emergency fund."""
    return _run_pipeline(profile_input)


@router.post("/portfolio", response_model=api_models.PortfolioResponse, summary="Build target portfolio")
async def portfolio(request: api_models.PortfolioRequest) -> api_models.PortfolioResponse:
    """Build canonical engine universe, target weights, and risk metrics for a greenlit profile."""
    return _greenlit_portfolio(request.profile, request.method or "erc")


@router.post("/backtest", response_model=api_models.BacktestResponse, summary="Run cached walk-forward backtest")
async def backtest(request: api_models.BacktestRequest) -> api_models.BacktestResponse:
    """Serve the cached walk-forward backtest report for the requested profile or target weights."""
    try:
        report = run_backtest_report(
            profile=request.profile.model_dump(mode="json") if request.profile is not None else None,
            weights=request.weights.model_dump(mode="json") if request.weights is not None else None,
            start=request.start,
            end=request.end,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return api_models.BacktestResponse.model_validate(report)


@router.post(
    "/portfolio/reoptimize",
    response_model=api_models.PortfolioReoptimizeResponse,
    summary="Re-optimize target portfolio for a risk dial",
)
async def portfolio_reoptimize(
    request: api_models.PortfolioReoptimizeRequest,
) -> api_models.PortfolioReoptimizeResponse:
    """Build a greenlit portfolio with target volatility selected within the user's allowed band."""
    try:
        validated, _ = _greenlit_engine_context(request.profile)
        universe = _build_universe(validated)
        # The strategic allocator maps target_vol in [0.05, 0.18] -> glidepath
        # score s in [0, 1]. Drive the user's risk dial directly across that band
        # so the slider actually slides the equity/bond/cash mix (conservative ->
        # aggressive), rather than onto the much narrower empirical safe/risky
        # frontier (which collapsed most of the dial range to the conservative end).
        dial = max(0.0, min(1.0, float(request.risk_dial)))
        optimizer_target_vol = 0.05 + dial * (0.18 - 0.05)
        weights = build_target_weights(
            _risk_profile_with_target_vol(validated, optimizer_target_vol),
            universe,
            load_prices(),
        )
        portfolio_result = _portfolio_response(universe, weights)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Report the portfolio's REALIZED volatility so the displayed target matches
    # portfolio.metrics.expected_vol exactly. Previously the displayed target came
    # from the gamma-derived band while the portfolio was built on the empirical
    # safe/risky frontier, so the two numbers could disagree on screen.
    realized_vol = portfolio_result.metrics.expected_vol
    return api_models.PortfolioReoptimizeResponse(
        portfolio=portfolio_result,
        risk_summary=api_models.PortfolioRiskSummary(
            target_volatility_pct=round(realized_vol * 100.0, 1),
            estimated_max_loss_1yr_pct=_estimated_max_loss_1yr_pct_for_weights(universe, weights),
        ),
    )


@router.post(
    "/portfolio/analyze-weights",
    response_model=api_models.PortfolioAnalyzeWeightsResponse,
    summary="Analyze user-edited portfolio weights",
)
async def portfolio_analyze_weights(
    request: api_models.PortfolioAnalyzeWeightsRequest,
) -> api_models.PortfolioAnalyzeWeightsResponse:
    """Normalize edited weights against the profile universe and recompute risk metrics."""
    try:
        validated, _ = _greenlit_engine_context(request.profile)
        universe = _build_universe(validated)
        by_ticker, by_sleeve, by_bucket, warnings = _analyze_weight_inputs(universe, request.weights)
        normalized_weights = SimpleNamespace(by_sleeve=by_sleeve, by_bucket=by_bucket)
        metrics = _compute_risk_metrics(universe, normalized_weights)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return api_models.PortfolioAnalyzeWeightsResponse(
        weights=api_models.AnalyzedWeights(by_ticker=by_ticker, by_sleeve=by_sleeve, by_bucket=by_bucket),
        metrics=metrics,
        validation=_portfolio_weight_validation(universe, by_ticker, by_sleeve, by_bucket, warnings),
    )


@router.post("/projection", response_model=api_models.Projection, summary="Run Monte Carlo projection")
async def projection(request: api_models.ProjectionRequest) -> api_models.Projection:
    """Project goal success from target weights and cached engine return data."""
    try:
        weights = EngineTargetWeights.model_validate(request.weights.model_dump())
        seed = request.seed if request.seed is not None else secrets.randbelow(2**31)
        projection_result = project(
            weights=weights.by_ticker,
            returns=_ticker_monthly_returns(weights.by_ticker),
            horizon_years=request.horizon_years,
            capital=request.capital_on_hand,
            monthly_contribution=request.monthly_contribution,
            goal=request.goal_target,
            generator=request.generator,
            seed=seed,
            n_paths=request.n_paths,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return api_models.Projection.model_validate({**projection_result.model_dump(), "seed": seed})


@router.post("/rebalance", response_model=api_models.RebalanceDecision, summary="Decide rebalance action")
async def rebalance(request: api_models.RebalanceRequest) -> api_models.RebalanceDecision:
    """Decide drift-band rebalance actions using the canonical engine."""
    try:
        _ensure_engine_data()
        positions = EnginePositions.model_validate(request.positions.model_dump())
        weights = _price_backed_weights(EngineTargetWeights.model_validate(request.weights.model_dump()))
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
        report = tax_report(positions, request.cost_basis, request.filing_status, request.bracket)
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
        async for event in stream_interview(request.messages, session_id=session_id):
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
        async for event in stream_advisor(
            request.messages,
            request.context,
            user_email=request.user_email,
        ):
            if event.get("type") == "token":
                assistant_chunks.append(event.get("content", ""))
            yield f"data: {json.dumps(event)}\n\n"
        if session_id:
            _append_assistant_message(session_id, "".join(assistant_chunks))
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/users/{email}/record", response_model=api_models.UserRecord)
async def user_record(email: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_user(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.query(Profile).filter(Profile.user_email == email).first()
    return {
        "account": {
            "email": user.email,
            "name": user.name,
            "created_at": _json_dt(user.created_at),
        },
        "profile_input": _profile_input(profile),
        "onboard_result": profile.get_result() if profile else None,
        "chat_sessions": [
            _session_out(db, chat_session)
            for chat_session in list_sessions(db, email)
        ],
    }


@router.get("/users/{email}/chats", response_model=list[api_models.ChatSessionOut])
async def user_chats(
    email: str,
    kind: str | None = None,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    if not get_user(db, email):
        raise HTTPException(status_code=404, detail="User not found")
    return [
        _session_out(db, chat_session, include_messages=False)
        for chat_session in list_sessions(db, email, kind)
    ]


@router.get("/users/{email}/active-onboarding", response_model=api_models.ResumeOnboarding)
async def active_onboarding(email: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Resume hook: the latest in-progress (status='active') elicitation session for
    this user, with its full transcript and any extracted profile, or found=False."""
    if not get_user(db, email):
        raise HTTPException(status_code=404, detail="User not found")
    chat_session = get_latest_active_session(db, email, "elicitation")
    if not chat_session:
        return {"found": False, "session": None}
    return {"found": True, "session": _session_out(db, chat_session)}


@router.get("/chats/{session_id}", response_model=api_models.ChatSessionOut)
async def chat_transcript(session_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return _session_out(db, chat_session)


@router.get("/config", summary="Gate thresholds and market assumptions")
async def get_config() -> dict:
    """Canonical constants exposed so the frontend can display the parameter panel."""
    gl_constants = {
        name.lower(): value
        for name, value in vars(engine_constants).items()
        if name.startswith("GL_")
    }
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
        "risk_model": {
            **gl_constants,
            "gamma_min": engine_constants.GAMMA_MIN,
            "gamma_max": engine_constants.GAMMA_MAX,
            "sr_ref": engine_constants.SR_REF,
            "capacity_weights": engine_constants.CAPACITY_WEIGHTS,
        },
    }


@router.post(
    "/maintenance/rebalance",
    response_model=api_models.MaintenanceRebalanceResponse,
    summary="Run portfolio maintenance and optionally execute trades",
)
async def maintenance_rebalance(
    request: api_models.MaintenanceRebalanceRequest,
    db: Session = Depends(get_db),
) -> api_models.MaintenanceRebalanceResponse:
    profile = _stored_profile_or_404(db, request.user_email)
    merged_input = profile.get_input()

    if request.trigger == "reprofile" and request.profile_patch:
        merged_input = _deep_merge(merged_input, request.profile_patch)
        try:
            profile_input = api_models.UserProfileInput.model_validate(merged_input)
        except ValidationError as exc:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Updated profile is invalid.",
                    "clarification_requests": [
                        clarification.model_dump()
                        for clarification in _validation_clarifications(exc)
                    ],
                },
            ) from exc
    else:
        profile_input = api_models.UserProfileInput.model_validate(merged_input)

    data_source = "skipped"
    if request.trigger == "quarterly" and request.fresh_data:
        import concurrent.futures

        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        try:
            from data.ingest import refresh as refresh_module

            future = executor.submit(
                refresh_module.refresh,
                db_url=os.environ.get("GREENLIGHT_DB_URL"),
            )
            future.result(timeout=20.0)
            data_source = "live"
        except Exception:
            data_source = "cached"
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    response = _run_pipeline(profile_input)
    if response.status != "greenlight" or response.portfolio is None:
        return api_models.MaintenanceRebalanceResponse(
            trigger=request.trigger,
            data_source=data_source,
            status=response.status,
            action="none",
            gate_result=response.gate_result,
            clarification_requests=response.clarification_requests,
            portfolio=response.portfolio,
        )

    new_weights = EngineTargetWeights.model_validate(response.portfolio.weights.model_dump())
    account = get_or_create_investment_account(db, request.user_email)
    try:
        broker = get_broker(request.user_email, cash_available=account.cash_available)
        current_positions = broker.read_positions()
        decision = None
        drifts = None

        if request.trigger == "quarterly":
            decision = decide_rebalance(current_positions, _price_backed_weights(new_weights))
            trades = decision.trades if decision.action == "trade" else []
            action = decision.action
            drifts = {
                sleeve: api_models.Drift.model_validate(drift.model_dump())
                for sleeve, drift in decision.drifts.items()
            }
        else:
            from data.loaders import latest_prices

            target_weights = _price_backed_weights(new_weights)
            tickers = sorted(
                {position.ticker for position in current_positions.items}
                | set(target_weights.by_ticker)
            )
            prices = latest_prices(tickers)
            trades = rebalance_to_target(current_positions, target_weights, prices)
            action = "trade" if trades else "none"

        fills = []
        positions = current_positions
        if request.execute and trades:
            fills = broker.place_trades(trades)
            positions = broker.read_positions()
            update_investment_account_cash(db, request.user_email, positions.cash)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = response.model_dump(mode="json")
    upsert_profile(
        db,
        request.user_email,
        json.dumps(profile_input.model_dump(mode="json")),
        json.dumps(result),
    )
    db.commit()

    return api_models.MaintenanceRebalanceResponse(
        trigger=request.trigger,
        data_source=data_source,
        status=response.status,
        action=action,
        drifts=drifts,
        trades=[api_models.RebalanceTrade.model_validate(trade.model_dump()) for trade in trades],
        fills=[api_models.FillOut.model_validate(fill.model_dump()) for fill in fills],
        positions=api_models.Positions.model_validate(positions.model_dump()),
        portfolio=response.portfolio,
    )
