"""Pydantic v2 models for docs/greenlight/05-contracts.md §2."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Money = Annotated[float, Field(ge=0)]
PositiveMoney = Annotated[float, Field(gt=0)]
Percent = Annotated[float, Field(ge=0)]
Weight = Annotated[float, Field(ge=0, le=1)]
ConfidenceValue = Annotated[float, Field(ge=0, le=1)]

Goal = Literal["retirement", "home", "education", "general_wealth"]
FilingStatus = Literal["single", "married_joint", "married_separate", "head_of_household"]
LossScenarioResponse = Literal["buy_more", "hold", "sell_some", "sell_all"]
IncomeStability = Literal["bond_like", "mixed", "stock_like"]
UniversePref = Literal["etf", "stock", "mix"]
EsgExclusion = Literal["fossil_fuels", "weapons", "tobacco", "gambling", "none"]
DebtKind = Literal["credit_card", "student", "auto", "mortgage", "personal", "other"]
# Sleeve taxonomy. The fixed-income split (cash_like / core_bonds / credit /
# duration_hedge / inflation) is the Wave-0 contract for the Sharpe-audit
# remediation: only `cash_like` is the CAL risk-free leg; the rest are capped
# risky diversifiers (see docs/greenlight/audits/2026-05-31-sharpe-audit.md).
# `bonds`/`tips` retained for back-compat with existing seed/data.
Sleeve = Literal[
    "us_equity", "intl_equity", "gold", "reits", "real_assets",
    "bonds", "tips",
    "cash_like", "core_bonds", "credit", "duration_hedge", "inflation",
]
Bucket = str


class ContractModel(BaseModel):
    """Base model: contracts reject fields outside docs/greenlight/05 §2."""

    model_config = ConfigDict(extra="forbid")


class Debt(ContractModel):
    balance: PositiveMoney
    apr: Percent
    kind: DebtKind


class UserProfile(ContractModel):
    household_income: Money
    monthly_expenses: Money
    capital_on_hand: Money
    emergency_fund: Money
    debts: list[Debt]
    age: int = Field(ge=18, le=100)
    horizon_years: int = Field(ge=1, le=60)
    goals: list[Goal] = Field(min_length=1)
    goal_target: Money
    dependents: int = Field(ge=0, le=20)
    filing_status: FilingStatus
    risk_instrument_responses: list[int] = Field(min_length=13, max_length=13)
    dohmen_risk: int | None = Field(default=None, ge=0, le=10)
    loss_scenario_response: LossScenarioResponse
    loss_aversion_probe: Money
    income_stability: IncomeStability
    universe_pref: UniversePref
    esg_exclusions: list[EsgExclusion]
    sector_theme_tilts: list[str]
    confidence: dict[str, ConfidenceValue]
    uncertainty_flags: list[str]


class DerivedProfile(ContractModel):
    required_emergency_fund: Money
    monthly_surplus: float


class ValidatedProfile(ContractModel):
    household_income: Money
    monthly_expenses: Money
    capital_on_hand: Money
    emergency_fund: Money
    debts: list[Debt]
    age: int = Field(ge=18, le=100)
    horizon_years: int = Field(ge=1, le=60)
    goals: list[Goal] = Field(min_length=1)
    goal_target: Money
    dependents: int = Field(ge=0, le=20)
    filing_status: FilingStatus
    risk_instrument_responses: list[int] = Field(min_length=13, max_length=13)
    dohmen_risk: int | None = Field(default=None, ge=0, le=10)
    loss_scenario_response: LossScenarioResponse
    loss_aversion_probe: Money
    income_stability: IncomeStability
    universe_pref: UniversePref
    esg_exclusions: list[EsgExclusion]
    sector_theme_tilts: list[str]
    derived: DerivedProfile


class GammaBand(ContractModel):
    aggressive: float = Field(ge=1.5, le=8.0)
    mid: float = Field(ge=1.5, le=8.0)
    conservative: float = Field(ge=1.5, le=8.0)

    @model_validator(mode="after")
    def validate_order(self) -> Self:
        if not self.aggressive <= self.mid <= self.conservative:
            raise ValueError("GammaBand must satisfy aggressive <= mid <= conservative")
        return self


class TargetVolBand(ContractModel):
    aggressive: Percent
    mid: Percent
    conservative: Percent


class RiskSignals(ContractModel):
    gl13_gamma: float = Field(ge=1.5, le=8.0)
    gl13_var: float = Field(gt=0)
    dohmen_gamma: float = Field(ge=1.5, le=8.0)
    dohmen_var: float = Field(gt=0)
    loss_aversion_gamma: float | None = Field(default=None, ge=1.5, le=8.0)
    loss_aversion_var: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_loss_aversion_pair(self) -> Self:
        if (self.loss_aversion_gamma is None) != (self.loss_aversion_var is None):
            raise ValueError("loss_aversion_gamma and loss_aversion_var must be provided together")
        return self


class RiskProfile(ContractModel):
    gamma_band: GammaBand
    tolerance_gamma: GammaBand
    capacity_gamma: float = Field(ge=1.5, le=8.0)
    capacity_score: float = Field(ge=0, le=100)
    tolerance_score: float = Field(ge=0, le=100)
    binding_axis: Literal["tolerance", "capacity"]
    target_vol_band: TargetVolBand
    signal_confidence: ConfidenceValue = 1.0
    contradiction_note: str | None = None
    loss_aversion_flag: bool = False


class GateMath(ContractModel):
    target_amount: Money
    debt: Debt | None
    guaranteed_return: Percent
    expected_after_tax_market_return: Percent
    interest_accruing_annual: Money
    net_advantage_annual: Money


class GateResult(ContractModel):
    status: Literal["greenlight", "halt"]
    failed_check: Literal["emergency_fund", "high_interest_debt", "none"]
    reason: str
    recommended_action: str
    math: GateMath | None
    notes: list[str]


class ExcludedTicker(ContractModel):
    ticker: str
    reason: str
    replacement: str | None = None


class Universe(ContractModel):
    tickers: list[str]
    sleeves: dict[Sleeve, list[str]]
    buckets: dict[Bucket, list[str]] = Field(default_factory=dict)
    risky_sleeves: list[Sleeve]
    safe_sleeves: list[Sleeve]
    risky_buckets: list[Bucket] = Field(default_factory=list)
    safe_buckets: list[Bucket] = Field(default_factory=list)
    market_weights: dict[Sleeve, Weight]
    bucket_market_weights: dict[Bucket, Weight] = Field(default_factory=dict)
    excluded: list[ExcludedTicker]

    @model_validator(mode="after")
    def validate_market_weights_sum(self) -> Self:
        if abs(sum(self.market_weights.values()) - 1.0) > 1e-6:
            raise ValueError("market_weights must sum to 1.0 ± 1e-6")
        if self.bucket_market_weights and abs(sum(self.bucket_market_weights.values()) - 1.0) > 1e-6:
            raise ValueError("bucket_market_weights must sum to 1.0 ± 1e-6")
        return self


class TargetWeights(ContractModel):
    by_ticker: dict[str, Weight]
    by_sleeve: dict[Sleeve, Weight]
    by_bucket: dict[Bucket, Weight] = Field(default_factory=dict)
    blend_alpha: Weight
    method: Literal["erc", "black_litterman", "cvar"]

    @model_validator(mode="after")
    def validate_weight_sums(self) -> Self:
        if abs(sum(self.by_ticker.values()) - 1.0) > 1e-6:
            raise ValueError("by_ticker weights must sum to 1.0 ± 1e-6")
        if abs(sum(self.by_sleeve.values()) - 1.0) > 1e-6:
            raise ValueError("by_sleeve weights must sum to 1.0 ± 1e-6")
        if self.by_bucket and abs(sum(self.by_bucket.values()) - 1.0) > 1e-6:
            raise ValueError("by_bucket weights must sum to 1.0 ± 1e-6")
        return self


class RiskMetrics(ContractModel):
    expected_vol: Percent
    expected_shortfall_95: Percent
    risk_contributions: dict[str, Percent]


PercentileKey = Literal["p5", "p25", "p50", "p75", "p95"]


class Projection(ContractModel):
    p_success: Percent
    generator: Literal["stationary_bootstrap", "gaussian"]
    horizon_years: int = Field(ge=1)
    percentile_paths: dict[PercentileKey, list[Money]]
    bad_case_terminal: Money
    median_terminal: Money
    n_paths: int = Field(ge=1)


class BuyOrder(ContractModel):
    ticker: str
    dollars: Money
    shares: float = Field(ge=0)


class DcaScheduleEntry(ContractModel):
    month_offset: int = Field(ge=0)
    contribution: Money


class OrderPlan(ContractModel):
    method: Literal["lump_sum", "dca"]
    buys: list[BuyOrder]
    schedule: list[DcaScheduleEntry]


class Fill(ContractModel):
    ticker: str
    shares: float = Field(ge=0)
    price: Money
    ts: datetime


class Position(ContractModel):
    ticker: str
    shares: float = Field(ge=0)
    avg_cost: Money
    market_value: Money


class Positions(ContractModel):
    items: list[Position]
    portfolio_value: Money
    cash: Money


class Drift(ContractModel):
    current: Weight
    target: Weight
    drift_pp: float


class Steer(ContractModel):
    next_contribution_to: list[Sleeve]


class RebalanceTrade(ContractModel):
    ticker: str
    side: Literal["buy", "sell"]
    shares: float = Field(ge=0)


class RebalanceDecision(ContractModel):
    action: Literal["none", "steer", "trade"]
    drifts: dict[Sleeve, Drift]
    steer: Steer | None
    trades: list[RebalanceTrade]


class HarvestableLoss(ContractModel):
    ticker: str
    unrealized_loss: Money
    note: str


class WashSaleWarning(ContractModel):
    ticker: str
    window_days: int = Field(default=30, ge=1)
    suggested_replacement: str


class TaxReport(ContractModel):
    harvestable: list[HarvestableLoss]
    wash_sale_warnings: list[WashSaleWarning]
    after_tax_notes: list[str]


StrategyName = Literal[
    "greenlight_erc", "one_over_n", "sixty_forty", "target_date", "naive_mvo", "spy"
]


class EquityCurvePoint(ContractModel):
    date: date
    value: Money


class DrawdownCurvePoint(ContractModel):
    date: date
    dd: float


class BacktestMetrics(ContractModel):
    cagr: float
    sharpe: float
    deflated_sharpe: float
    sortino: float
    max_drawdown: float
    calmar: float
    turnover: float = Field(ge=0)


class BacktestStrategy(ContractModel):
    equity_curve: list[EquityCurvePoint]
    drawdown_curve: list[DrawdownCurvePoint]
    metrics: BacktestMetrics


class BacktestPeriod(ContractModel):
    start: date
    end: date


class BacktestConfig(ContractModel):
    window_months: int = Field(ge=1)
    rebalance: Literal["monthly", "quarterly"]
    tx_cost_bps: float = Field(ge=0)
    n_trials: int = Field(ge=1)
    period: BacktestPeriod


class BacktestResult(ContractModel):
    strategies: dict[StrategyName, BacktestStrategy]
    config: BacktestConfig
