"""Responsibility gate for docs/greenlight/05 §2.4 and 06 Phase 1."""

from schemas.constants import EF_MONTHS, HIGH_APR, LOW_APR
from schemas.models import Debt, GateMath, GateResult, ValidatedProfile
from tax.rates import expected_after_tax_market_return


def _empty_math(target_amount: float = 0.0) -> GateMath:
    return GateMath(
        target_amount=target_amount,
        debt=None,
        guaranteed_return=0.0,
        expected_after_tax_market_return=0.0,
        interest_accruing_annual=0.0,
        net_advantage_annual=0.0,
    )


def _debt_math(
    debt: Debt,
    filing_status: str,
    bracket: float | None = None,
) -> GateMath:
    after_tax_return = expected_after_tax_market_return(bracket, filing_status)
    return GateMath(
        target_amount=0.0,
        debt=debt,
        guaranteed_return=debt.apr,
        expected_after_tax_market_return=after_tax_return,
        interest_accruing_annual=debt.balance * debt.apr,
        net_advantage_annual=debt.balance * (debt.apr - after_tax_return),
    )


def evaluate_gate(profile: ValidatedProfile, bracket: float | None = None) -> GateResult:
    """Evaluate the responsibility gate per docs/greenlight/05 §2.4."""

    effective_bracket = bracket if bracket is not None else getattr(profile, "bracket", None)
    required_emergency_fund = EF_MONTHS * profile.monthly_expenses
    if profile.emergency_fund < required_emergency_fund:
        return GateResult(
            status="halt",
            failed_check="emergency_fund",
            reason=f"Emergency fund is below {EF_MONTHS} months of expenses.",
            recommended_action=f"Build liquid reserves to ${required_emergency_fund:,.0f} before investing.",
            math=_empty_math(target_amount=required_emergency_fund),
            notes=[],
        )

    for debt in profile.debts:
        if debt.apr > HIGH_APR:
            return GateResult(
                status="halt",
                failed_check="high_interest_debt",
                reason="High-interest debt offers a better guaranteed return than investing.",
                recommended_action="Pay down the high-interest debt before adding market risk.",
                math=_debt_math(debt, profile.filing_status, effective_bracket),
                notes=[],
            )

    notes = []
    for debt in profile.debts:
        if debt.apr < LOW_APR:
            notes.append(
                f"{debt.kind} debt at {debt.apr:.1%} APR is low-interest and can be managed alongside investing."
            )

    return GateResult(
        status="greenlight",
        failed_check="none",
        reason="Responsibility checks cleared.",
        recommended_action="",
        math=None,
        notes=notes,
    )
