from __future__ import annotations
from pydantic import BaseModel, Field, model_validator
from typing import Any, List, Optional, Dict, Literal, Tuple
from datetime import date, datetime
from taxplanning.models import BucketPlan, TaxBreakdown


# ── Auth ──────────────────────────────────────────────────────────────────────

class AuthRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None  # Only for sign-up
    phone: Optional[str] = None
    address: Optional[str] = None
    zip_code: Optional[str] = None


class AuthResponse(BaseModel):
    email: str
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    zip_code: Optional[str] = None
    token: str  # Dummy token for now


class UpdateAccountRequest(BaseModel):
    user_email: str
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    zip_code: Optional[str] = None


# ── Chat / elicitation ────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(min_length=1)
    user_email: Optional[str] = None
    session_id: Optional[str] = None


class AdvisorChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(min_length=1)
    user_email: Optional[str] = None
    session_id: Optional[str] = None
    context: Optional[Any] = Field(
        default=None,
        description="OnboardResponse JSON from /api/v1/onboard — gives the advisor the user's numbers",
    )


class ChatMessageOut(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    seq: int
    created_at: Optional[str] = None


class ChatSessionOut(BaseModel):
    id: str
    kind: Literal["elicitation", "advisor"]
    status: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    extracted_profile: Optional[Dict[str, Any]] = None
    messages: List[ChatMessageOut] = Field(default_factory=list)


class AccountOut(BaseModel):
    email: str
    name: str
    created_at: Optional[str] = None


class UserRecord(BaseModel):
    account: AccountOut
    profile_input: Optional[Dict[str, Any]] = None
    onboard_result: Optional[Dict[str, Any]] = None
    chat_sessions: List[ChatSessionOut] = Field(default_factory=list)


class ResumeOnboarding(BaseModel):
    """An in-progress elicitation session a user can resume after an interrupt."""
    found: bool
    session: Optional[ChatSessionOut] = None


# ── Financial profile ─────────────────────────────────────────────────────────

class DebtItem(BaseModel):
    balance: float = Field(gt=0, description="Outstanding balance in dollars")
    apr: float = Field(ge=0, le=1.0, description="Annual rate as decimal — 0.22 = 22%")
    kind: Literal["credit_card", "student", "mortgage", "auto", "personal", "other"]


class UserProfileInput(BaseModel):
    # ── Financials ────────────────────────────────────────────────────────────
    household_income: float = Field(gt=0, description="Annual household income in dollars")
    monthly_expenses: float = Field(gt=0, description="Total monthly essential expenses")
    capital_on_hand: float = Field(ge=0, description="Liquid capital available to invest")
    emergency_fund: float = Field(ge=0, description="Current emergency fund balance")
    home_value: Optional[float] = Field(default=0.0, ge=0, description="Estimated current home value")
    non_liquid_savings: Optional[float] = Field(
        default=0.0,
        ge=0,
        description="Non-liquid savings: stocks, ETFs, brokerage accounts",
    )
    debts: List[DebtItem] = Field(default_factory=list)

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    age: int = Field(ge=18, le=100)
    horizon_years: int = Field(ge=1, le=60, description="Years to retirement or primary goal")
    goals: List[str] = Field(default_factory=list)
    goal_target: float = Field(default=0.0, ge=0, description="Target terminal wealth; 0 if not specified")
    dependents: int = Field(ge=0, default=0)
    filing_status: Literal[
        "single",
        "married_joint",
        "married_separate",
        "head_of_household",
    ]
    bracket: Optional[float] = Field(default=None, ge=0, le=1)

    # ── Risk tolerance signals (Grable-Lytton instrument) ────────────────────
    risk_instrument_responses: List[int] = Field(
        min_length=13,
        max_length=13,
        description="13 GL items each scored 1–4 (higher = more risk tolerant)",
    )
    dohmen_risk: Optional[int] = Field(
        default=None,
        ge=0,
        le=10,
        description="Dohmen general willingness-to-take-risk item, integer 0-10",
    )
    loss_scenario_response: Literal["sell_all", "sell_some", "hold", "buy_more"]
    loss_aversion_probe: Optional[float] = Field(
        default=None,
        description="Minimum $ win to accept a 50/50 bet against a $100 loss",
    )

    # ── Capacity inputs ───────────────────────────────────────────────────────
    income_stability: Literal["bond_like", "mixed", "stock_like"]

    # ── Preferences ───────────────────────────────────────────────────────────
    universe_pref: Literal["etf", "stock", "mix"] = "etf"
    esg_exclusions: List[Literal["fossil_fuels", "weapons", "tobacco", "gambling", "none"]] = Field(
        default_factory=list
    )
    sector_theme_tilts: List[str] = Field(default_factory=list)


    # ── Tax fields ────────────────────────────────────────────────────────────────────────
    state: Optional[str] = None
    zip_code: Optional[str] = None
    pretax_401k: Optional[float] = Field(default=0.0, ge=0)
    pretax_ira: Optional[float] = Field(default=0.0, ge=0)
    pretax_hsa: Optional[float] = Field(default=0.0, ge=0)
    employer_match_rate: float = Field(default=0.5, ge=0, le=1.0)
    employer_match_cap_pct: float = Field(default=0.05, ge=0, le=1.0)
    has_hsa_eligible_plan: bool = False
    hsa_coverage: Optional[Literal["self_only", "family"]] = None
    # ── LLM confidence metadata ───────────────────────────────────────────────
    confidence: Dict[str, float] = Field(default_factory=dict)
    uncertainty_flags: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_instrument_scores(self) -> "UserProfileInput":
        for i, v in enumerate(self.risk_instrument_responses):
            if v not in (1, 2, 3, 4):
                raise ValueError(f"risk_instrument_responses[{i}] must be 1–4, got {v}")
        return self


class ValidatedProfile(UserProfileInput):
    """UserProfileInput plus derived fields added by the validation gate."""
    monthly_surplus: float
    emergency_fund_months: float
    required_emergency_fund: float     # = monthly_expenses × EF_MONTHS


class ClarificationRequest(BaseModel):
    field: str
    issue: str
    suggested_question: str


# ── Risk profile ──────────────────────────────────────────────────────────────

class GammaBand(BaseModel):
    """
    Posture-keyed band.  aggressive <= mid <= conservative (all in [1.5, 8.0]).
    Lower gamma = more aggressive (higher target vol).
    Keyed by posture so target_vol.aggressive = SR_REF / gamma.aggressive (highest vol),
    which keeps the mapping intuitive and avoids silent inversion bugs.
    """
    aggressive: float
    mid: float
    conservative: float


class TargetVolBand(BaseModel):
    aggressive: float    # highest vol
    mid: float
    conservative: float  # lowest vol


class RiskSignals(BaseModel):
    gl13_gamma: float = Field(ge=1.5, le=8.0)
    gl13_var: float = Field(gt=0)
    dohmen_gamma: float = Field(ge=1.5, le=8.0)
    dohmen_var: float = Field(gt=0)
    loss_aversion_gamma: Optional[float] = Field(default=None, ge=1.5, le=8.0)
    loss_aversion_var: Optional[float] = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _validate_loss_aversion_pair(self) -> "RiskSignals":
        if (self.loss_aversion_gamma is None) != (self.loss_aversion_var is None):
            raise ValueError("loss_aversion_gamma and loss_aversion_var must be provided together")
        return self


class RiskProfile(BaseModel):
    gamma_band: GammaBand
    tolerance_gamma: GammaBand
    capacity_gamma: float               # single implied floor from capacity score
    capacity_score: float = Field(ge=0, le=100)
    tolerance_score: float = Field(ge=0, le=100)
    binding_axis: Literal["capacity", "tolerance"]
    target_vol_band: TargetVolBand
    signal_confidence: float = Field(default=1.0, ge=0, le=1)
    contradiction_note: Optional[str] = None
    loss_aversion_flag: bool = False


class RiskSignalComponent(BaseModel):
    name: Literal["gl13", "dohmen", "loss_aversion"]
    gamma: float = Field(ge=1.5, le=8.0)
    variance: float = Field(gt=0)


class RiskFusionInternals(BaseModel):
    signals: List[RiskSignalComponent]
    fixed_gamma: float = Field(ge=1.5, le=8.0)
    fused_gamma: float = Field(ge=1.5, le=8.0)
    q: float = Field(ge=0)
    i_squared: float = Field(ge=0)
    tau_squared: float = Field(ge=0)
    combined_var: float = Field(gt=0)
    signal_confidence: float = Field(ge=0, le=1)
    gamma_band: GammaBand
    needs_clarification: bool
    contradiction_note: Optional[str] = None


# ── Gate math objects ─────────────────────────────────────────────────────────

class EmergencyFundMath(BaseModel):
    current_balance: float
    monthly_expenses: float
    months_covered: float
    required_months: float
    target_balance: float
    shortfall: float


class DebtGateMath(BaseModel):
    debt_balance: float
    apr: float
    debt_kind: str
    guaranteed_return: float                    # = debt.apr (risk-free, tax-free)
    expected_after_tax_market_return: float     # = 0.07 × (1 − 0.15) = 0.0595 (fixed constant)
    interest_accruing_annual: float             # = balance × apr  — the punchy headline number
    net_advantage_annual: float                 # = balance × (apr − after_tax_return)  — true harm prevented
    verdict: str


class GateMath(BaseModel):
    check: Literal["emergency_fund", "high_interest_debt"]
    emergency_fund: Optional[EmergencyFundMath] = None
    debt: Optional[DebtGateMath] = None


class GateCheck(BaseModel):
    key: str
    status: Literal["pass", "fail", "warn"]
    detail: str


class GateResult(BaseModel):
    status: Literal["greenlight", "halt"]
    failed_check: Optional[Literal["emergency_fund", "high_interest_debt", "none"]] = None
    reason: Optional[str] = None
    math: Optional[GateMath] = None
    recommended_action: str = ""
    notes: List[str] = Field(default_factory=list)
    preview_next_checks: List[str] = Field(default_factory=list)
    checks: List[GateCheck] = Field(default_factory=list)


# ── Optimizer boundary ────────────────────────────────────────────────────────

class OptimizerInput(BaseModel):
    risk_profile: RiskProfile
    universe_pref: str
    esg_exclusions: List[str]
    sector_theme_tilts: List[str]
    capital_on_hand: float
    monthly_surplus: float
    age: int
    horizon_years: int
    goal_target: float
    human_capital_beta: Literal["bond_like", "mixed", "stock_like"]
    filing_status: str
    gate_notes: List[str] = Field(default_factory=list)


# ── Canonical engine finance endpoint models ─────────────────────────────────

# Mirrors engine/schemas/models.py Sleeve (Wave-0 contract for the Sharpe-audit
# remediation). Only `cash_like` is the CAL risk-free leg; other fixed-income
# sleeves are capped risky diversifiers. `bonds`/`tips` kept for back-compat.
Sleeve = Literal[
    "us_equity", "intl_equity", "gold", "reits", "real_assets",
    "bonds", "tips",
    "cash_like", "core_bonds", "credit", "duration_hedge", "inflation",
]


class ExcludedTicker(BaseModel):
    ticker: str
    reason: str
    replacement: Optional[str] = None


class Universe(BaseModel):
    tickers: List[str]
    sleeves: Dict[Sleeve, List[str]]
    buckets: Dict[str, List[str]] = Field(default_factory=dict)
    risky_sleeves: List[Sleeve]
    safe_sleeves: List[Sleeve]
    risky_buckets: List[str] = Field(default_factory=list)
    safe_buckets: List[str] = Field(default_factory=list)
    market_weights: Dict[Sleeve, float]
    bucket_market_weights: Dict[str, float] = Field(default_factory=dict)
    excluded: List[ExcludedTicker] = Field(default_factory=list)


class TargetWeights(BaseModel):
    by_ticker: Dict[str, float]
    by_sleeve: Dict[Sleeve, float]
    by_bucket: Dict[str, float] = Field(default_factory=dict)
    blend_alpha: float = Field(ge=0, le=1)
    method: Literal["strategic", "erc", "black_litterman", "cvar"]


class PortfolioETF(BaseModel):
    ticker: str
    name: str
    sleeve: Sleeve
    bucket: str
    weight: float = Field(ge=0)
    replacement_for: Optional[str] = None
    exclusion_reason: Optional[str] = None


class FundingDepositRequest(BaseModel):
    user_email: str
    amount: float = Field(gt=0)


class InvestmentAccountOut(BaseModel):
    user_email: str
    cash_available: float = Field(ge=0)
    cash_pending: float = Field(ge=0)
    broker_provider: str
    alpaca_account_id: Optional[str] = None


class BrokerageAccountRequest(BaseModel):
    user_email: str


class BrokerageAccountOut(BaseModel):
    user_email: str
    alpaca_account_id: str


class BrokerageACHRelationshipRequest(BaseModel):
    user_email: str
    nickname: str
    routing_number: str
    account_number: str
    account_type: str = "CHECKING"


class BrokerageACHRelationshipOut(BaseModel):
    id: Optional[str] = None
    status: Optional[str] = None


class BrokerageDepositRequest(BaseModel):
    user_email: str
    relationship_id: str
    amount: float = Field(gt=0)


class BrokerageDepositOut(BaseModel):
    id: Optional[str] = None
    status: Optional[str] = None


class BrokerageJournalRequest(BaseModel):
    user_email: str
    amount: float = Field(gt=0)


class BrokerageJournalOut(BaseModel):
    id: Optional[str] = None
    status: Optional[str] = None
    cash_available: float = Field(ge=0)


class FundingTransactionOut(BaseModel):
    id: int
    user_email: str
    provider: Literal["mock_ach"]
    amount: float = Field(gt=0)
    status: Literal["succeeded"]
    created_at: datetime


class BuyOrderOut(BaseModel):
    ticker: str
    dollars: float = Field(ge=0)
    shares: float = Field(ge=0)


class DcaScheduleEntryOut(BaseModel):
    month_offset: int = Field(ge=0)
    contribution: float = Field(ge=0)


class OrderPlanOut(BaseModel):
    method: Literal["lump_sum", "dca"]
    buys: List[BuyOrderOut]
    schedule: List[DcaScheduleEntryOut]


class ExecutionRequest(BaseModel):
    user_email: str
    weights: TargetWeights


class FillOut(BaseModel):
    ticker: str
    shares: float = Field(ge=0)
    price: float = Field(ge=0)
    ts: datetime


class RiskMetrics(BaseModel):
    expected_vol: float = Field(ge=0)
    expected_shortfall_95: float = Field(ge=0)
    risk_contributions: Dict[str, float]


class PortfolioRequest(BaseModel):
    profile: UserProfileInput
    method: Optional[Literal["strategic", "erc", "black_litterman", "cvar"]] = "strategic"


class PortfolioResponse(BaseModel):
    universe: Universe
    weights: TargetWeights
    metrics: RiskMetrics
    etfs: List[PortfolioETF] = Field(default_factory=list)


class BacktestRequest(BaseModel):
    profile: Optional[UserProfileInput] = None
    weights: Optional[TargetWeights] = None
    start: Optional[date] = None
    end: Optional[date] = None

    @model_validator(mode="after")
    def _validate_profile_or_weights(self) -> "BacktestRequest":
        if (self.profile is None) == (self.weights is None):
            raise ValueError("Provide exactly one of profile or weights")
        return self


class BacktestEquityPoint(BaseModel):
    date: date
    value: float


class BacktestDrawdownPoint(BaseModel):
    date: date
    dd: float


class BacktestMetricSet(BaseModel):
    cagr: Optional[float] = None
    sharpe: float
    deflated_sharpe: Optional[float] = None
    sortino: float
    max_drawdown: float
    calmar: float
    turnover: float = Field(ge=0)


class BacktestStrategyResult(BaseModel):
    equity_curve: List[BacktestEquityPoint]
    drawdown_curve: Optional[List[BacktestDrawdownPoint]] = None
    metrics: BacktestMetricSet


class BacktestResponse(BaseModel):
    equity_curve: List[BacktestEquityPoint]
    drawdown_curve: Optional[List[BacktestDrawdownPoint]] = None
    metrics: BacktestMetricSet
    benchmarks: Dict[
        Literal["one_over_n", "sixty_forty", "target_date", "naive_mvo", "spy"],
        BacktestStrategyResult,
    ]


class PortfolioRiskSummary(BaseModel):
    target_volatility_pct: float
    estimated_max_loss_1yr_pct: float


class SavePortfolioRequest(BaseModel):
    portfolio: PortfolioResponse
    risk_summary: Optional[PortfolioRiskSummary] = None
    user_email: Optional[str] = None


class PortfolioReoptimizeRequest(BaseModel):
    profile: UserProfileInput
    risk_dial: float = Field(ge=0, le=1)


class PortfolioReoptimizeResponse(BaseModel):
    portfolio: PortfolioResponse
    risk_summary: PortfolioRiskSummary


class EditableWeights(BaseModel):
    by_ticker: Optional[Dict[str, float]] = None
    by_sleeve: Optional[Dict[Sleeve, float]] = None

    @model_validator(mode="after")
    def _validate_weight_inputs(self) -> "EditableWeights":
        if not self.by_ticker and not self.by_sleeve:
            raise ValueError("weights must include by_ticker or by_sleeve")
        for name, weights in (("by_ticker", self.by_ticker), ("by_sleeve", self.by_sleeve)):
            for key, value in (weights or {}).items():
                if value < 0:
                    raise ValueError(f"{name}.{key} must be non-negative")
        return self


class PortfolioAnalyzeWeightsRequest(BaseModel):
    profile: UserProfileInput
    weights: EditableWeights


class AnalyzedWeights(BaseModel):
    by_ticker: Dict[str, float]
    by_sleeve: Dict[Sleeve, float]
    by_bucket: Dict[str, float] = Field(default_factory=dict)


class PortfolioWeightsValidation(BaseModel):
    sum_by_ticker: float
    sum_by_sleeve: float
    sum_risky_bucket: float
    sum_safe_bucket: float
    sum_risky_within_bucket: float
    sum_safe_within_bucket: float
    warnings: List[str] = Field(default_factory=list)


class PortfolioAnalyzeWeightsResponse(BaseModel):
    weights: AnalyzedWeights
    metrics: RiskMetrics
    validation: PortfolioWeightsValidation


class UpdateProfileRequest(BaseModel):
    profile_patch: Dict[str, Any]
    user_email: Optional[str] = None


class ProjectionRequest(BaseModel):
    weights: TargetWeights
    horizon_years: int = Field(ge=1)

    @model_validator(mode="before")
    @classmethod
    def _sanitize_weights(cls, data: Any) -> Any:
        # Be tolerant of caller-supplied weight maps that carry null/None entries
        # (e.g. a UI that enumerates universe sleeve members and leaves unheld
        # tickers as null). Drop the null entries and renormalize by_ticker so the
        # projection runs on a valid, fully-invested portfolio instead of 422-ing.
        if isinstance(data, dict) and isinstance(data.get("weights"), dict):
            weights = data["weights"]
            for key in ("by_ticker", "by_sleeve", "by_bucket"):
                mapping = weights.get(key)
                if isinstance(mapping, dict):
                    cleaned = {
                        str(k): float(v)
                        for k, v in mapping.items()
                        if isinstance(v, (int, float)) and not isinstance(v, bool)
                    }
                    # Renormalize each map to sum to 1.0 so the downstream engine
                    # TargetWeights sum validators accept the null-stripped portfolio.
                    total = sum(cleaned.values())
                    if total > 0:
                        cleaned = {k: v / total for k, v in cleaned.items()}
                    weights[key] = cleaned
        return data

    monthly_contribution: float = Field(ge=0)
    capital_on_hand: float = Field(ge=0)
    goal_target: float = Field(ge=0)
    generator: Literal["stationary_bootstrap", "gaussian"] = "stationary_bootstrap"
    seed: Optional[int] = None
    n_paths: int = Field(default=10000, ge=1)


class Projection(BaseModel):
    p_success: float = Field(ge=0, le=1)
    generator: Literal["stationary_bootstrap", "gaussian"]
    horizon_years: int = Field(ge=1)
    percentile_paths: Dict[Literal["p5", "p25", "p50", "p75", "p95"], List[float]]
    bad_case_terminal: float
    median_terminal: float
    n_paths: int = Field(ge=1)
    seed: int


class Position(BaseModel):
    ticker: str
    shares: float = Field(ge=0)
    avg_cost: float = Field(ge=0)
    market_value: float = Field(ge=0)


class Positions(BaseModel):
    items: List[Position]
    portfolio_value: float = Field(ge=0)
    cash: float = Field(ge=0)


class ExecutionSubmitResponse(BaseModel):
    fills: List[FillOut]
    positions: Positions


class Drift(BaseModel):
    current: float = Field(ge=0, le=1)
    target: float = Field(ge=0, le=1)
    drift_pp: float


class Steer(BaseModel):
    next_contribution_to: List[Sleeve]


class RebalanceTrade(BaseModel):
    ticker: str
    side: Literal["buy", "sell"]
    shares: float = Field(ge=0)


class RebalanceDecision(BaseModel):
    action: Literal["none", "steer", "trade"]
    drifts: Dict[Sleeve, Drift]
    steer: Optional[Steer] = None
    trades: List[RebalanceTrade] = Field(default_factory=list)


class RebalanceRequest(BaseModel):
    positions: Positions
    weights: TargetWeights


class RebalanceExecutionRequest(BaseModel):
    user_email: str
    weights: TargetWeights


class RebalanceSubmitResponse(BaseModel):
    action: Literal["none", "steer", "trade"]
    drifts: Dict[Sleeve, Drift]
    steer: Optional[Steer] = None
    trades: List[RebalanceTrade] = Field(default_factory=list)
    fills: List[FillOut] = Field(default_factory=list)
    positions: Positions


class HarvestableLoss(BaseModel):
    ticker: str
    unrealized_loss: float = Field(ge=0)
    note: str
    estimated_tax_value: Optional[float] = Field(default=None, ge=0)
    tax_rate_used: Optional[float] = Field(default=None, ge=0)


class WashSaleWarning(BaseModel):
    ticker: str
    window_days: int = Field(default=30, ge=1)
    suggested_replacement: str


class TaxReport(BaseModel):
    harvestable: List[HarvestableLoss]
    wash_sale_warnings: List[WashSaleWarning]
    after_tax_notes: List[str]


class TaxReportRequest(BaseModel):
    positions: Positions
    cost_basis: Dict[str, float]
    filing_status: Literal[
        "single",
        "married_joint",
        "married_separate",
        "head_of_household",
    ]
    bracket: Optional[float] = Field(default=None, ge=0, le=1)


# ── Financial analysis ────────────────────────────────────────────────────────

class FinancialSnapshot(BaseModel):
    monthly_income: float
    monthly_expenses: float
    monthly_surplus: float
    savings_rate_pct: float
    annual_surplus: float
    total_debt: float
    total_high_apr_debt: float
    total_low_apr_debt: float
    debt_to_income_ratio: float
    net_worth_estimate: float
    emergency_fund_months: float
    emergency_fund_target_months: float
    emergency_fund_pct_complete: float
    emergency_fund_shortfall: float


class DebtSnapshot(BaseModel):
    balance: float
    apr: float
    kind: str
    monthly_interest_cost: float
    months_to_payoff: Optional[int]
    total_interest_cost: Optional[float]
    priority_rank: int
    gate_status: Literal["halt", "caution", "allow"]


class DebtAnalysis(BaseModel):
    debts: List[DebtSnapshot]
    total_balance: float
    total_monthly_interest: float
    avalanche_order: List[str]


class EmergencyFundAnalysis(BaseModel):
    current_balance: float
    current_months: float
    target_months: float
    target_balance: float
    shortfall: float
    pct_complete: float
    months_to_target: Optional[int]


class GreenLightStep(BaseModel):
    step: int
    action: str
    target_amount: float
    months_estimated: Optional[int]
    note: str


class PathToGreenlight(BaseModel):
    already_green: bool
    steps: List[GreenLightStep] = Field(default_factory=list)
    total_months_estimated: Optional[int]


class RiskSummary(BaseModel):
    gamma_mid: float
    label: str
    capacity_score: float
    tolerance_score: float
    binding_axis: Literal["capacity", "tolerance"]
    target_volatility_pct: float
    estimated_max_loss_1yr_pct: float
    loss_aversion_flag: bool
    contradiction_note: Optional[str] = None


class FinancialAnalysis(BaseModel):
    snapshot: FinancialSnapshot
    debt: DebtAnalysis
    emergency_fund: EmergencyFundAnalysis
    risk: RiskSummary
    path_to_greenlight: PathToGreenlight


# ── API response ──────────────────────────────────────────────────────────────

class OnboardResponse(BaseModel):
    status: Literal["greenlight", "halt", "needs_clarification", "no_profile"]
    validated_profile: Optional[ValidatedProfile] = None
    risk_profile: Optional[RiskProfile] = None
    gate_result: Optional[GateResult] = None
    financial_analysis: Optional[FinancialAnalysis] = None
    optimizer_input: Optional[OptimizerInput] = None
    portfolio: Optional[PortfolioResponse] = None
    clarification_requests: List[ClarificationRequest] = Field(default_factory=list)
    tax_breakdown: Optional[TaxBreakdown] = None
    bucket_plan: Optional[BucketPlan] = None


class MaintenanceRebalanceRequest(BaseModel):
    user_email: str
    trigger: Literal["quarterly", "reprofile"]
    profile_patch: Optional[Dict[str, Any]] = None
    fresh_data: bool = True
    execute: bool = True


class MaintenanceRebalanceResponse(BaseModel):
    trigger: Literal["quarterly", "reprofile"]
    data_source: Literal["skipped", "live", "cached"]
    status: Literal["greenlight", "halt", "needs_clarification", "no_profile"]
    action: Literal["none", "steer", "trade"]
    drifts: Optional[Dict[Sleeve, Drift]] = None
    trades: List[RebalanceTrade] = Field(default_factory=list)
    fills: List[FillOut] = Field(default_factory=list)
    positions: Optional[Positions] = None
    portfolio: Optional[PortfolioResponse] = None
    gate_result: Optional[GateResult] = None
    clarification_requests: List[ClarificationRequest] = Field(default_factory=list)
