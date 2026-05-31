"""
Responsibility Gate — the spine of Greenlight (01-e2e-design §5, contracts §2.4).
Pure deterministic logic, zero external dependencies.

Tax calculations are a separate workstream; filing_status is passed through.
Gate math uses the canonical fixed constants from config (LTCG_RATE, EXPECTED_MARKET_RETURN).

Check order (first failure halts):
  1. Emergency fund >= 3 months of expenses
  2. No debt with APR > 8%
  3. (pass) Low-interest debt noted; investing allowed alongside
"""

from typing import Optional

from config import (
    EF_MONTHS,
    EXPECTED_AFTER_TAX_MARKET_RETURN,
    EXPECTED_MARKET_RETURN,
    HIGH_APR,
    LOW_APR,
    LTCG_RATE,
)
from models import (
    DebtGateMath,
    EmergencyFundMath,
    GateMath,
    GateResult,
    OptimizerInput,
    RiskProfile,
    ValidatedProfile,
)


def _check_emergency_fund(profile: ValidatedProfile) -> Optional[GateResult]:
    if profile.emergency_fund_months >= EF_MONTHS:
        return None

    target = profile.monthly_expenses * EF_MONTHS
    shortfall = target - profile.emergency_fund

    # Preview the next check even though we stopped here
    high_apr = [d for d in profile.debts if d.apr > HIGH_APR]
    preview: list[str] = []
    if high_apr:
        worst = max(high_apr, key=lambda d: d.apr)
        interest_annual = worst.balance * worst.apr
        preview.append(
            f"After building your emergency fund, your {worst.apr * 100:.0f}% APR "
            f"{worst.kind.replace('_', ' ')} would also block investing — it's costing "
            f"${interest_annual:,.0f}/yr in interest on a guaranteed "
            f"{worst.apr * 100:.0f}% paydown return vs. an uncertain "
            f"~{EXPECTED_AFTER_TAX_MARKET_RETURN * 100:.1f}% after-tax market return."
        )

    return GateResult(
        status="halt",
        failed_check="emergency_fund",
        reason=(
            f"Your emergency fund covers only {profile.emergency_fund_months:.1f} months "
            f"of expenses. You need at least {EF_MONTHS:.0f} months before investing."
        ),
        math=GateMath(
            check="emergency_fund",
            emergency_fund=EmergencyFundMath(
                current_balance=profile.emergency_fund,
                monthly_expenses=profile.monthly_expenses,
                months_covered=round(profile.emergency_fund_months, 2),
                required_months=EF_MONTHS,
                target_balance=round(target, 2),
                shortfall=round(shortfall, 2),
            ),
        ),
        recommended_action=(
            f"Save ${shortfall:,.0f} to reach a {EF_MONTHS:.0f}-month "
            f"emergency fund (${target:,.0f} total)."
        ),
        preview_next_checks=preview,
    )


def _check_high_apr_debt(profile: ValidatedProfile) -> Optional[GateResult]:
    high_apr = [d for d in profile.debts if d.apr > HIGH_APR]
    if not high_apr:
        return None

    worst = max(high_apr, key=lambda d: d.apr)

    interest_accruing = round(worst.balance * worst.apr, 2)
    net_advantage = round(worst.balance * (worst.apr - EXPECTED_AFTER_TAX_MARKET_RETURN), 2)
    total_high_apr_balance = sum(d.balance for d in high_apr)
    monthly_toward_debt = max(profile.monthly_surplus, 1.0)
    months_to_payoff: Optional[int] = None
    if worst.apr > 0:
        import math
        r = worst.apr / 12.0
        if monthly_toward_debt > worst.balance * r:
            n = math.log(monthly_toward_debt / (monthly_toward_debt - worst.balance * r)) / math.log(1 + r)
            months_to_payoff = math.ceil(n)

    preview: list[str] = []
    others = [d for d in high_apr if d is not worst]
    if others:
        preview.append(
            "Additional high-APR debts to clear: "
            + ", ".join(f"{d.apr*100:.0f}% APR {d.kind}" for d in others)
        )

    return GateResult(
        status="halt",
        failed_check="high_interest_debt",
        reason=(
            f"You have ${total_high_apr_balance:,.0f} in high-interest debt "
            f"(highest: {worst.apr * 100:.0f}% APR {worst.kind}). "
            "Pay this off before investing."
        ),
        math=GateMath(
            check="high_interest_debt",
            debt=DebtGateMath(
                debt_balance=worst.balance,
                apr=worst.apr,
                debt_kind=worst.kind,
                guaranteed_return=worst.apr,
                expected_after_tax_market_return=EXPECTED_AFTER_TAX_MARKET_RETURN,
                interest_accruing_annual=interest_accruing,
                net_advantage_annual=net_advantage,
                verdict=(
                    f"Paying off your {worst.apr * 100:.0f}% APR debt is a guaranteed, "
                    f"tax-free {worst.apr * 100:.0f}% return. "
                    f"Equities return ~{EXPECTED_MARKET_RETURN * 100:.0f}% nominally — "
                    f"~{EXPECTED_AFTER_TAX_MARKET_RETURN * 100:.1f}% after a "
                    f"{LTCG_RATE * 100:.0f}% capital gains rate — and that's uncertain. "
                    f"This debt is costing you ${interest_accruing:,.0f}/yr. "
                    f"Choosing paydown over investing saves you ${net_advantage:,.0f}/yr net."
                ),
            ),
        ),
        recommended_action=(
            f"Direct ${monthly_toward_debt:,.0f}/month toward your "
            f"{worst.apr * 100:.0f}% APR {worst.kind} (${worst.balance:,.0f}). "
            + (f"Paid off in ~{months_to_payoff} months." if months_to_payoff else "")
        ),
        preview_next_checks=preview,
    )


def run_gate(profile: ValidatedProfile, risk_profile: RiskProfile) -> GateResult:
    halt = _check_emergency_fund(profile)
    if halt:
        return halt

    halt = _check_high_apr_debt(profile)
    if halt:
        return halt

    notes: list[str] = []
    for debt in profile.debts:
        if 0 < debt.apr < LOW_APR:
            notes.append(
                f"{debt.kind.title()} at {debt.apr * 100:.1f}% APR is below "
                f"the {LOW_APR * 100:.0f}% threshold — investing alongside is allowed."
            )

    return GateResult(status="greenlight", failed_check="none", notes=notes)


def build_optimizer_input(
    profile: ValidatedProfile,
    risk_profile: RiskProfile,
    gate_result: GateResult,
) -> OptimizerInput:
    return OptimizerInput(
        risk_profile=risk_profile,
        universe_pref=profile.universe_pref,
        esg_exclusions=list(profile.esg_exclusions),
        sector_theme_tilts=profile.sector_theme_tilts,
        capital_on_hand=profile.capital_on_hand,
        monthly_surplus=profile.monthly_surplus,
        age=profile.age,
        horizon_years=profile.horizon_years,
        goal_target=profile.goal_target,
        human_capital_beta=profile.income_stability,
        filing_status=profile.filing_status,
        gate_notes=gate_result.notes,
    )
