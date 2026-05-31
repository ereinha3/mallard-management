from typing import List, Optional, Tuple
from models import UserProfileInput, ValidatedProfile, ClarificationRequest
from config import EF_MONTHS


def validate_profile(
    raw: UserProfileInput,
) -> Tuple[Optional[ValidatedProfile], List[ClarificationRequest]]:
    issues: List[ClarificationRequest] = []

    monthly_income = raw.household_income / 12

    if raw.monthly_expenses > monthly_income * 1.5:
        issues.append(
            ClarificationRequest(
                field="monthly_expenses",
                issue=(
                    f"Monthly expenses (${raw.monthly_expenses:,.0f}) exceed 150% of monthly income "
                    f"(${monthly_income:,.0f}). Please verify."
                ),
                suggested_question=(
                    "Your monthly expenses appear higher than your income. "
                    "Could you double-check those figures?"
                ),
            )
        )

    if raw.emergency_fund > raw.capital_on_hand + 500_000:
        issues.append(
            ClarificationRequest(
                field="emergency_fund",
                issue="Emergency fund exceeds plausible liquid assets.",
                suggested_question=(
                    "Can you clarify the balance of your emergency savings account?"
                ),
            )
        )

    for i, debt in enumerate(raw.debts):
        if debt.apr > 0.60:
            issues.append(
                ClarificationRequest(
                    field=f"debts[{i}].apr",
                    issue=f"APR of {debt.apr * 100:.1f}% is unusually high — please verify.",
                    suggested_question=(
                        f"What is the annual interest rate on your {debt.kind.replace('_', ' ')}?"
                    ),
                )
            )

    if issues:
        return None, issues

    monthly_surplus = monthly_income - raw.monthly_expenses
    emergency_fund_months = (
        raw.emergency_fund / raw.monthly_expenses if raw.monthly_expenses > 0 else 0.0
    )

    required_emergency_fund = raw.monthly_expenses * EF_MONTHS

    validated = ValidatedProfile(
        **raw.model_dump(),
        monthly_surplus=round(monthly_surplus, 2),
        emergency_fund_months=round(emergency_fund_months, 3),
        required_emergency_fund=round(required_emergency_fund, 2),
    )
    return validated, []
