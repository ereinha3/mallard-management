"""
Financial analysis engine — computes all statistics the website displays.
Runs after validation and risk profiling, regardless of gate result.
"""
import math
from typing import List, Optional

from config import EF_MONTHS as EMERGENCY_FUND_MONTHS, HIGH_APR as HIGH_APR_THRESHOLD, LOW_APR as LOW_APR_THRESHOLD
from models import (
    DebtAnalysis,
    DebtSnapshot,
    EmergencyFundAnalysis,
    FinancialAnalysis,
    FinancialSnapshot,
    GateResult,
    GreenLightStep,
    PathToGreenlight,
    RiskProfile,
    RiskSummary,
    ValidatedProfile,
)

_RISK_LABELS = [
    (2.0,        "Aggressive"),
    (4.0,        "Moderate-Aggressive"),
    (6.0,        "Moderate"),
    (8.0,        "Moderate-Conservative"),
    (float("inf"), "Conservative"),
]


def _risk_label(gamma: float) -> str:
    for threshold, label in _RISK_LABELS:
        if gamma <= threshold:
            return label
    return "Conservative"


def _months_to_payoff(balance: float, apr: float, monthly_payment: float) -> Optional[int]:
    """Standard loan amortization formula. Returns None if payment can't clear the debt."""
    if monthly_payment <= 0 or balance <= 0:
        return None
    if apr == 0.0:
        return math.ceil(balance / monthly_payment)
    r = apr / 12.0
    if monthly_payment <= balance * r:
        return None  # payment doesn't cover accruing interest
    n = math.log(monthly_payment / (monthly_payment - balance * r)) / math.log(1.0 + r)
    return math.ceil(n)


def _total_interest(balance: float, monthly_payment: float, months: Optional[int]) -> Optional[float]:
    if months is None:
        return None
    return round(max(0.0, monthly_payment * months - balance), 2)


def _debt_gate_status(apr: float) -> str:
    if apr >= HIGH_APR_THRESHOLD:
        return "halt"
    if apr >= LOW_APR_THRESHOLD:
        return "caution"
    return "allow"


def _compute_snapshot(profile: ValidatedProfile) -> FinancialSnapshot:
    monthly_income = profile.household_income / 12.0
    total_debt = sum(d.balance for d in profile.debts)
    high_apr_debt = sum(d.balance for d in profile.debts if d.apr >= HIGH_APR_THRESHOLD)
    ef_target = profile.monthly_expenses * EMERGENCY_FUND_MONTHS
    ef_pct = min(100.0, profile.emergency_fund_months / EMERGENCY_FUND_MONTHS * 100.0)
    ef_shortfall = max(0.0, ef_target - profile.emergency_fund)
    savings_rate = (profile.monthly_surplus / monthly_income * 100.0) if monthly_income > 0 else 0.0

    return FinancialSnapshot(
        monthly_income=round(monthly_income, 2),
        monthly_expenses=profile.monthly_expenses,
        monthly_surplus=profile.monthly_surplus,
        savings_rate_pct=round(savings_rate, 1),
        annual_surplus=round(profile.monthly_surplus * 12.0, 2),
        total_debt=round(total_debt, 2),
        total_high_apr_debt=round(high_apr_debt, 2),
        total_low_apr_debt=round(total_debt - high_apr_debt, 2),
        debt_to_income_ratio=round(total_debt / profile.household_income, 3) if profile.household_income > 0 else 0.0,
        net_worth_estimate=round(profile.capital_on_hand - total_debt, 2),
        emergency_fund_months=profile.emergency_fund_months,
        emergency_fund_target_months=EMERGENCY_FUND_MONTHS,
        emergency_fund_pct_complete=round(ef_pct, 1),
        emergency_fund_shortfall=round(ef_shortfall, 2),
    )


def _compute_emergency_fund(profile: ValidatedProfile) -> EmergencyFundAnalysis:
    ef_target = profile.monthly_expenses * EMERGENCY_FUND_MONTHS
    ef_shortfall = max(0.0, ef_target - profile.emergency_fund)
    ef_pct = min(100.0, profile.emergency_fund_months / EMERGENCY_FUND_MONTHS * 100.0)

    months_to_target: Optional[int] = None
    if ef_shortfall > 0 and profile.monthly_surplus > 0:
        months_to_target = math.ceil(ef_shortfall / profile.monthly_surplus)

    return EmergencyFundAnalysis(
        current_balance=profile.emergency_fund,
        current_months=profile.emergency_fund_months,
        target_months=EMERGENCY_FUND_MONTHS,
        target_balance=round(ef_target, 2),
        shortfall=round(ef_shortfall, 2),
        pct_complete=round(ef_pct, 1),
        months_to_target=months_to_target,
    )


def _compute_debt_analysis(profile: ValidatedProfile) -> DebtAnalysis:
    # Avalanche order: highest APR first
    sorted_debts = sorted(profile.debts, key=lambda d: d.apr, reverse=True)
    surplus = max(profile.monthly_surplus, 1.0)

    snapshots: List[DebtSnapshot] = []
    for rank, debt in enumerate(sorted_debts, 1):
        monthly_interest = round(debt.balance * debt.apr / 12.0, 2)
        months = _months_to_payoff(debt.balance, debt.apr, surplus)
        snapshots.append(
            DebtSnapshot(
                balance=debt.balance,
                apr=debt.apr,
                kind=debt.kind,
                monthly_interest_cost=monthly_interest,
                months_to_payoff=months,
                total_interest_cost=_total_interest(debt.balance, surplus, months),
                priority_rank=rank,
                gate_status=_debt_gate_status(debt.apr),
            )
        )

    avalanche_order = [
        f"{d.kind.replace('_', ' ').title()} — {d.apr * 100:.1f}% APR"
        for d in sorted_debts
        if d.apr > 0
    ]

    return DebtAnalysis(
        debts=snapshots,
        total_balance=round(sum(d.balance for d in profile.debts), 2),
        total_monthly_interest=round(sum(s.monthly_interest_cost for s in snapshots), 2),
        avalanche_order=avalanche_order,
    )


def _compute_risk_summary(risk_profile: RiskProfile) -> RiskSummary:
    vol_mid = risk_profile.target_vol_band.mid
    target_vol_pct = round(vol_mid * 100.0, 1)
    max_loss_pct = round(vol_mid * 2.0 * 100.0, 1)  # rough 95th-percentile 1-yr drawdown ≈ 2σ

    contradiction_note: Optional[str] = None
    if risk_profile.loss_aversion_flag:
        contradiction_note = (
            "Your scenario response suggests higher loss aversion than your self-rating. "
            "Your risk profile has been adjusted to the more conservative reading."
        )

    return RiskSummary(
        gamma_mid=risk_profile.gamma_band.mid,
        label=_risk_label(risk_profile.gamma_band.mid),
        capacity_score=risk_profile.capacity_score,
        tolerance_score=risk_profile.tolerance_score,
        binding_axis=risk_profile.binding_axis,
        target_volatility_pct=target_vol_pct,
        estimated_max_loss_1yr_pct=max_loss_pct,
        loss_aversion_flag=risk_profile.loss_aversion_flag,
        contradiction_note=contradiction_note,
    )


def _compute_path_to_greenlight(
    profile: ValidatedProfile,
    gate_result: GateResult,
    ef_analysis: EmergencyFundAnalysis,
) -> PathToGreenlight:
    if gate_result.status == "greenlight":
        return PathToGreenlight(already_green=True, steps=[], total_months_estimated=0)

    steps: List[GreenLightStep] = []
    total_months = 0
    surplus = max(profile.monthly_surplus, 1.0)

    # Step 1 — emergency fund (if needed)
    if ef_analysis.shortfall > 0:
        m = ef_analysis.months_to_target
        steps.append(
            GreenLightStep(
                step=1,
                action="Build emergency fund",
                target_amount=ef_analysis.target_balance,
                months_estimated=m,
                note=(
                    f"Save ${ef_analysis.shortfall:,.0f} to reach "
                    f"${ef_analysis.target_balance:,.0f} "
                    f"({EMERGENCY_FUND_MONTHS:.0f} months of expenses)."
                ),
            )
        )
        total_months += m or 0

    # Subsequent steps — high-APR debts in avalanche order
    high_apr = sorted(
        [d for d in profile.debts if d.apr >= HIGH_APR_THRESHOLD],
        key=lambda d: d.apr,
        reverse=True,
    )
    for debt in high_apr:
        step_num = len(steps) + 1
        m = _months_to_payoff(debt.balance, debt.apr, surplus)
        steps.append(
            GreenLightStep(
                step=step_num,
                action=f"Pay off {debt.kind.replace('_', ' ')} ({debt.apr * 100:.0f}% APR)",
                target_amount=debt.balance,
                months_estimated=m,
                note=(
                    f"Direct ${surplus:,.0f}/month toward ${debt.balance:,.0f} balance. "
                    f"Paid off in ~{m} months."
                )
                if m
                else (
                    f"Your current surplus of ${surplus:,.0f}/month doesn't cover the monthly "
                    f"interest on this debt. Increase payments to make progress."
                ),
            )
        )
        total_months += m or 0

    return PathToGreenlight(
        already_green=False,
        steps=steps,
        total_months_estimated=total_months if total_months > 0 else None,
    )


def compute_financial_analysis(
    profile: ValidatedProfile,
    risk_profile: RiskProfile,
    gate_result: GateResult,
) -> FinancialAnalysis:
    snapshot = _compute_snapshot(profile)
    ef_analysis = _compute_emergency_fund(profile)
    debt_analysis = _compute_debt_analysis(profile)
    risk_summary = _compute_risk_summary(risk_profile)
    path = _compute_path_to_greenlight(profile, gate_result, ef_analysis)

    return FinancialAnalysis(
        snapshot=snapshot,
        debt=debt_analysis,
        emergency_fund=ef_analysis,
        risk=risk_summary,
        path_to_greenlight=path,
    )
