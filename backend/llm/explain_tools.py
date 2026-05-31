"""Read-only explainability tools for the Gemini advisor."""

from __future__ import annotations

from typing import Any, Callable

import models as api_models
from persistence import Profile, get_or_create_investment_account, get_session, get_user


DEFAULT_PROJECTION_SEED = 17
CITATION_METHODS = (
    "llm_boundary",
    "risk_tolerance",
    "risk_capacity",
    "optimization",
    "monte_carlo",
    "backtest",
    "taxes",
)

_CITATIONS: dict[str, dict[str, Any]] = {
    "llm_boundary": {
        "method": "llm_boundary",
        "summary": (
            "Greenlight uses the LLM as an interface and narrator. Deterministic, "
            "typed engine code produces figures so the model does not invent advice."
        ),
        "citations": [
            {
                "title": "Are Generative AI Agents Effective Personalized Financial Advisors?",
                "authors": "Takayanagi et al.",
                "year": 2025,
                "relevance": "Shows LLM financial advisors can elicit preferences but may mishandle conflicts and user trust.",
            },
            {
                "title": "Deficiency of LLMs in Finance",
                "authors": "Kang & Liu",
                "year": 2023,
                "relevance": "Documents arithmetic reliability issues that motivate the deterministic engine boundary.",
            },
            {
                "title": "ELEPHANT: Measuring Social Sycophancy in LLMs",
                "authors": "Cheng et al.",
                "year": 2025,
                "relevance": "Supports anti-sycophancy constraints when users state preferences.",
            },
        ],
    },
    "risk_tolerance": {
        "method": "risk_tolerance",
        "summary": (
            "Risk willingness is estimated from multiple signals and reported as a gamma band, "
            "not a point estimate, because elicited preferences include measurement error."
        ),
        "citations": [
            {
                "title": "Financial risk tolerance revisited",
                "authors": "Grable & Lytton",
                "year": 1999,
                "relevance": "Introduces the 13-item risk-tolerance scale used as the primary psychometric signal.",
            },
            {
                "title": "Risk Preferences in the PSID",
                "authors": "Kimball, Sahm & Shapiro",
                "year": 2008,
                "relevance": "Supports CRRA gamma bracketing and explicit measurement-error bands.",
            },
            {
                "title": "The Generality of Risk Preferences",
                "authors": "Brown, Imai, Vieider & Camerer",
                "year": 2024,
                "relevance": "Informs the loss-aversion calibration used as a supplementary signal.",
            },
        ],
    },
    "risk_capacity": {
        "method": "risk_capacity",
        "summary": (
            "Risk capacity is scored separately from willingness using objective financial context; "
            "the more conservative of capacity and tolerance binds the usable risk profile."
        ),
        "citations": [
            {
                "title": "Labor supply flexibility and portfolio choice in a life cycle model",
                "authors": "Bodie, Merton & Samuelson",
                "year": 1992,
                "relevance": "Grounds human capital and time horizon as portfolio-risk capacity inputs.",
            },
            {
                "title": "Lifetime Financial Advice: Human Capital, Asset Allocation, and Insurance",
                "authors": "Ibbotson, Chen, Milevsky & Zhu",
                "year": 2006,
                "relevance": "Supports income stability and labor-income beta as capacity factors.",
            },
            {
                "title": "The Glidepath Illusion",
                "authors": "Estrada",
                "year": 2014,
                "relevance": "Frames glide-path claims as contested and suitable for demonstration rather than assertion.",
            },
        ],
    },
    "optimization": {
        "method": "optimization",
        "summary": (
            "The core optimizer uses covariance-based diversification and target-volatility blending, "
            "avoiding return forecasts as the headline allocation driver."
        ),
        "citations": [
            {
                "title": "On the properties of equally-weighted risk contributions portfolios",
                "authors": "Maillard, Roncalli & Teiletche",
                "year": 2010,
                "relevance": "Grounds equal-risk-contribution portfolios without expected-return estimates.",
            },
            {
                "title": "Honey, I Shrunk the Sample Covariance Matrix",
                "authors": "Ledoit & Wolf",
                "year": 2004,
                "relevance": "Supports shrinkage covariance for more stable risk estimates.",
            },
            {
                "title": "Optimal Versus Naive Diversification",
                "authors": "DeMiguel, Garlappi & Uppal",
                "year": 2009,
                "relevance": "Warns against fragile forecast-heavy mean-variance optimization.",
            },
        ],
    },
    "monte_carlo": {
        "method": "monte_carlo",
        "summary": (
            "Projection percentiles use a seeded historical-return resampling engine for repeatable explanations."
        ),
        "citations": [
            {
                "title": "The Stationary Bootstrap",
                "authors": "Politis & Romano",
                "year": 1994,
                "relevance": "Supports block resampling that preserves short-horizon return dependence.",
            },
            {
                "title": "An Automatic Block-Length Selection Method",
                "authors": "Politis & White",
                "year": 2004,
                "relevance": "Grounds block-length selection for bootstrap projections.",
            },
            {
                "title": "Reducing Retirement Risk with a Rising Equity Glide Path",
                "authors": "Pfau & Kitces",
                "year": 2014,
                "relevance": "Uses realistic return-path simulation to evaluate retirement glide paths.",
            },
        ],
    },
    "backtest": {
        "method": "backtest",
        "summary": (
            "Backtests are framed as walk-forward diagnostics with transaction costs and overfitting caveats."
        ),
        "citations": [
            {
                "title": "Pseudo-Mathematics and Financial Charlatanism",
                "authors": "Bailey, Borwein, López de Prado & Zhu",
                "year": 2014,
                "relevance": "Explains why reported backtest performance must account for trial counts and overfitting.",
            },
            {
                "title": "The Deflated Sharpe Ratio",
                "authors": "Bailey & López de Prado",
                "year": 2014,
                "relevance": "Supports deflating Sharpe estimates when many configurations are tried.",
            },
            {
                "title": "Optimal Versus Naive Diversification",
                "authors": "DeMiguel, Garlappi & Uppal",
                "year": 2009,
                "relevance": "Provides the 1/N hurdle and cautions against overstated optimizer claims.",
            },
        ],
    },
    "taxes": {
        "method": "taxes",
        "summary": (
            "Tax features are read-only educational calculations that surface loss-harvesting and wash-sale constraints."
        ),
        "citations": [
            {
                "title": "Internal Revenue Code Section 1091",
                "authors": "U.S. Congress",
                "year": 2026,
                "relevance": "Defines wash-sale disallowance for substantially identical securities.",
            },
            {
                "title": "Publication 550",
                "authors": "Internal Revenue Service",
                "year": 2026,
                "relevance": "Explains investment income, capital gains, losses, and wash-sale treatment.",
            },
            {
                "title": "Topic No. 409 Capital Gains and Losses",
                "authors": "Internal Revenue Service",
                "year": 2026,
                "relevance": "Summarizes capital-loss offsets and carryforward mechanics.",
            },
        ],
    },
}


def _profile_row(user_email: str) -> Profile:
    db = get_session()
    try:
        row = db.query(Profile).filter(Profile.user_email == user_email).first()
        if row is None:
            raise ValueError("No stored profile was found for the requesting user.")
        db.expunge(row)
        return row
    finally:
        db.close()


def _stored_onboard(user_email: str) -> api_models.OnboardResponse:
    result = _profile_row(user_email).get_result()
    if not result:
        raise ValueError("No stored onboard result was found for the requesting user.")
    return api_models.OnboardResponse.model_validate(result)


def _stored_profile_input(user_email: str) -> api_models.UserProfileInput:
    return api_models.UserProfileInput.model_validate(_profile_row(user_email).get_input())


def _dump(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def _api_module() -> Any:
    return __import__("api.v1", fromlist=["v1"])


def get_account_summary(user_email: str) -> dict[str, Any]:
    db = get_session()
    try:
        user = get_user(db, user_email)
        if user is None:
            return {"error": "No account was found for the requesting user."}
        account = get_or_create_investment_account(db, user_email)
        return {
            "name": user.name,
            "email": user.email,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "cash_available": account.cash_available,
            "cash_pending": account.cash_pending,
            "broker_provider": account.broker_provider,
        }
    finally:
        db.close()


def get_my_settings(user_email: str) -> dict[str, Any]:
    db = get_session()
    try:
        profile = db.query(Profile).filter(Profile.user_email == user_email).first()
        if profile is None:
            return {"error": "Onboarding not complete for the requesting user."}
        profile_input = profile.get_input()
        result = profile.get_result() or {}
    finally:
        db.close()

    settings: dict[str, Any] = {}
    for key in ("horizon_years", "goal_target", "monthly_contribution", "universe_pref", "esg_exclusions"):
        if key in profile_input:
            settings[key] = profile_input[key]

    if "sector_tilts" in profile_input:
        settings["sector_tilts"] = profile_input["sector_tilts"]
    elif "sector_theme_tilts" in profile_input:
        settings["sector_tilts"] = profile_input["sector_theme_tilts"]

    optimizer_input = result.get("optimizer_input") if isinstance(result, dict) else None
    validated_profile = result.get("validated_profile") if isinstance(result, dict) else None
    risk_profile = result.get("risk_profile") if isinstance(result, dict) else None
    financial_analysis = result.get("financial_analysis") if isinstance(result, dict) else None
    financial_risk = (
        financial_analysis.get("risk")
        if isinstance(financial_analysis, dict)
        else None
    )

    if "monthly_contribution" not in settings:
        for source in (optimizer_input, validated_profile):
            if isinstance(source, dict) and "monthly_contribution" in source:
                settings["monthly_contribution"] = source["monthly_contribution"]
                break

    if isinstance(risk_profile, dict):
        if "risk_band" in risk_profile:
            settings["risk_band"] = risk_profile["risk_band"]
        elif "gamma_band" in risk_profile:
            settings["risk_band"] = risk_profile["gamma_band"]

    if isinstance(financial_risk, dict) and "target_volatility_pct" in financial_risk:
        settings["target_volatility_pct"] = financial_risk["target_volatility_pct"]

    return settings


def get_my_profile_inputs(user_email: str) -> dict[str, Any]:
    db = get_session()
    try:
        profile = db.query(Profile).filter(Profile.user_email == user_email).first()
        if profile is None:
            return {"error": "Onboarding not complete for the requesting user."}
        profile_input = profile.get_input()
    finally:
        db.close()

    keys = (
        "household_income",
        "monthly_expenses",
        "capital_on_hand",
        "emergency_fund",
        "age",
        "filing_status",
        "dependents",
        "income_stability",
        "debts",
    )
    return {key: profile_input[key] for key in keys if key in profile_input}


def get_my_gate_status(user_email: str) -> dict[str, Any]:
    onboard = _stored_onboard(user_email)
    gate = onboard.gate_result
    if gate is None:
        return {
            "status": onboard.status,
            "failed_check": None,
            "reason": None,
            "math": None,
            "recommended_action": "",
            "checks": [],
            "notes": [],
        }
    return {
        "status": gate.status,
        "failed_check": gate.failed_check,
        "reason": gate.reason,
        "math": _dump(gate.math),
        "recommended_action": gate.recommended_action,
        "checks": _dump(gate.checks),
        "notes": list(gate.notes),
        "preview_next_checks": list(gate.preview_next_checks),
    }


def explain_portfolio(user_email: str, method: str | None = None) -> dict[str, Any]:
    profile_input = _stored_profile_input(user_email)
    api = _api_module()
    portfolio = api._greenlit_portfolio(profile_input, method or "erc")
    return {
        "method": portfolio.weights.method,
        "weights": {
            "by_ticker": dict(portfolio.weights.by_ticker),
            "by_sleeve": dict(portfolio.weights.by_sleeve),
        },
        "blend": {"blend_alpha": portfolio.weights.blend_alpha},
        "expected_vol": portfolio.metrics.expected_vol,
        "expected_shortfall_95": portfolio.metrics.expected_shortfall_95,
        "risk_contributions": dict(portfolio.metrics.risk_contributions),
        "excluded": [_dump(item) for item in portfolio.universe.excluded],
    }


def explain_risk_fusion(user_email: str) -> dict[str, Any]:
    from profiler.fusion import fuse_risk_signals
    from profiler.tolerance import risk_signals_from_inputs
    from profiler.validate import validate_profile

    api = _api_module()
    profile_input = _stored_profile_input(user_email)
    engine_profile = api._to_engine_profile(profile_input)
    validated = validate_profile(engine_profile)
    if isinstance(validated, dict):
        raise ValueError("Profile requires clarification before risk fusion can be explained.")

    signals = risk_signals_from_inputs(
        gl13_score=float(sum(validated.risk_instrument_responses)),
        dohmen_risk=validated.dohmen_risk,
        loss_aversion_probe=validated.loss_aversion_probe,
    )
    fusion = fuse_risk_signals(signals)
    signal_rows = [
        api_models.RiskSignalComponent(
            name="gl13",
            gamma=signals.gl13_gamma,
            variance=signals.gl13_var,
        ),
        api_models.RiskSignalComponent(
            name="dohmen",
            gamma=signals.dohmen_gamma,
            variance=signals.dohmen_var,
        ),
    ]
    if signals.loss_aversion_gamma is not None and signals.loss_aversion_var is not None:
        signal_rows.append(
            api_models.RiskSignalComponent(
                name="loss_aversion",
                gamma=signals.loss_aversion_gamma,
                variance=signals.loss_aversion_var,
            )
        )

    return api_models.RiskFusionInternals(
        signals=signal_rows,
        fixed_gamma=fusion.fixed_gamma,
        fused_gamma=fusion.fused_gamma,
        q=fusion.q,
        i_squared=fusion.i_squared,
        tau_squared=fusion.tau_squared,
        combined_var=fusion.combined_var,
        signal_confidence=fusion.signal_confidence,
        gamma_band=api_models.GammaBand.model_validate(fusion.gamma_band.model_dump()),
        needs_clarification=fusion.needs_clarification,
        contradiction_note=fusion.contradiction_note,
    ).model_dump(mode="json")


def get_projection_percentiles(
    user_email: str,
    horizon_years: int | None = None,
    n_paths: int = 1000,
    seed: int = DEFAULT_PROJECTION_SEED,
    generator: str = "stationary_bootstrap",
) -> dict[str, Any]:
    api = _api_module()
    onboard = _stored_onboard(user_email)
    if onboard.validated_profile is None:
        raise ValueError("A validated profile is required before projection can be explained.")
    if onboard.portfolio is None:
        raise ValueError("A greenlit portfolio is required before projection can be explained.")

    weights = onboard.portfolio.weights
    result = api.project(
        weights=weights.by_ticker,
        returns=api._ticker_monthly_returns(weights.by_ticker),
        horizon_years=horizon_years or onboard.validated_profile.horizon_years,
        capital=onboard.validated_profile.capital_on_hand,
        monthly_contribution=max(onboard.validated_profile.monthly_surplus, 0.0),
        goal=onboard.validated_profile.goal_target,
        generator=generator,
        seed=seed,
        n_paths=n_paths,
    )
    payload = api_models.Projection.model_validate(
        {**result.model_dump(), "seed": seed}
    ).model_dump(mode="json")
    return payload


def get_method_citations(method: str) -> dict[str, Any]:
    key = method.strip().lower()
    if key not in _CITATIONS:
        raise ValueError(f"Unknown citation method: {method}")
    return _CITATIONS[key]


def dispatch_explain_tool(name: str, args: dict[str, Any] | None, user_email: str | None) -> dict[str, Any]:
    args = args or {}
    scoped_tools: dict[str, Callable[..., dict[str, Any]]] = {
        "get_account_summary": get_account_summary,
        "get_my_settings": get_my_settings,
        "get_my_profile_inputs": get_my_profile_inputs,
        "get_my_gate_status": get_my_gate_status,
        "explain_portfolio": explain_portfolio,
        "explain_risk_fusion": explain_risk_fusion,
        "get_projection_percentiles": get_projection_percentiles,
    }
    if name in scoped_tools:
        if not user_email:
            raise ValueError("A signed-in user is required for user-scoped explainability tools.")
        # Security boundary: the LLM never chooses the principal. Any model-supplied
        # email/user identifier is ignored; the API route passes the requesting user.
        safe_args = {key: value for key, value in args.items() if key not in {"email", "user_email"}}
        return scoped_tools[name](user_email, **safe_args)
    if name == "get_method_citations":
        return get_method_citations(str(args.get("method", "")))
    raise ValueError(f"Unknown advisor explainability tool: {name}")
