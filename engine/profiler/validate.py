"""Profile validation for docs/greenlight/05 §2.2 and 06 Phase 7.3."""

from __future__ import annotations

from typing import Any

from schemas.constants import EF_MONTHS, GL_MEAN
from schemas.models import DerivedProfile, UserProfile, ValidatedProfile


ClarificationResponse = dict[str, list[str]]


def _coerce_user_profile(up: UserProfile | dict[str, Any]) -> UserProfile:
    return up if isinstance(up, UserProfile) else UserProfile.model_validate(up)


def _risk_score(up: UserProfile) -> float:
    responses = up.risk_instrument_responses
    if any(not isinstance(score, int) or score < 1 or score > 4 for score in responses):
        raise ValueError("risk_instrument_responses must contain 13 item scores in [1, 4]")
    return float(sum(responses))


def _needs_risk_clarification(up: UserProfile) -> bool:
    panic_sell = up.loss_scenario_response in {"sell_some", "sell_all"}
    instrument_implies_aggressive = _risk_score(up) > GL_MEAN
    return panic_sell and instrument_implies_aggressive


def validate_profile(up: UserProfile | dict[str, Any]) -> ValidatedProfile | ClarificationResponse:
    """Validate a UserProfile into docs/greenlight/05 §2.2 ValidatedProfile."""

    profile = _coerce_user_profile(up)

    if _needs_risk_clarification(profile):
        return {
            "clarification_requests": [
                "Your risk questionnaire points to an aggressive risk tolerance, "
                "but your loss scenario answer says you would sell during a sharp drop. "
                "Please clarify which response better reflects how you would invest real money."
            ]
        }

    derived = DerivedProfile(
        required_emergency_fund=EF_MONTHS * profile.monthly_expenses,
        monthly_surplus=profile.household_income / 12.0 - profile.monthly_expenses,
    )
    payload = profile.model_dump(exclude={"confidence", "uncertainty_flags"})
    payload["derived"] = derived
    return ValidatedProfile.model_validate(payload)
