"""Capacity profiler for docs/greenlight/02 §3.1 and 06 Phase 2."""

from __future__ import annotations

from math import exp, log
from typing import Any

from schemas.constants import CAPACITY_WEIGHTS, GAMMA_MAX, GAMMA_MIN, HIGH_APR
from schemas.models import UserProfile, ValidatedProfile


def _clamp_score(value: float) -> float:
    return min(100.0, max(0.0, value))


def _coerce_validated_profile(profile: ValidatedProfile | UserProfile | dict[str, Any]) -> ValidatedProfile:
    if isinstance(profile, ValidatedProfile):
        return profile

    from profiler.validate import validate_profile

    result = validate_profile(profile)
    if isinstance(result, dict):
        raise ValueError("profile requires clarification before capacity scoring")
    return result


def _monthly_surplus(profile: ValidatedProfile) -> float:
    return profile.derived.monthly_surplus


def _horizon_subscore(profile: ValidatedProfile) -> float:
    return _clamp_score(profile.horizon_years / 30.0 * 100.0)


def _income_stability_subscore(profile: ValidatedProfile) -> float:
    return {
        "bond_like": 100.0,
        "mixed": 60.0,
        "stock_like": 25.0,
    }[profile.income_stability]


def _emergency_fund_subscore(profile: ValidatedProfile) -> float:
    if profile.monthly_expenses <= 0:
        return 100.0
    months_covered = profile.emergency_fund / profile.monthly_expenses
    return _clamp_score(months_covered / 6.0 * 100.0)


def _savings_subscore(profile: ValidatedProfile) -> float:
    if profile.household_income <= 0:
        return 0.0

    projected_rate = max(0.0, _monthly_surplus(profile) * 12.0 / profile.household_income)
    observed_rate = max(0.0, profile.capital_on_hand / profile.household_income)
    savings_rate = min(projected_rate, observed_rate) if profile.capital_on_hand > 0 else projected_rate
    return _clamp_score(savings_rate / 0.20 * 100.0)


def _debt_subscore(profile: ValidatedProfile) -> float:
    if any(debt.apr > HIGH_APR for debt in profile.debts):
        return 0.0

    total_debt = sum(debt.balance for debt in profile.debts)
    if total_debt <= 0:
        return 100.0

    capacity_base = profile.household_income + profile.emergency_fund + profile.capital_on_hand
    if capacity_base <= 0:
        return 0.0

    debt_to_income = total_debt / capacity_base
    return 100.0 - min(100.0, debt_to_income * 100.0)


def capacity_score(profile: ValidatedProfile | UserProfile | dict[str, Any]) -> float:
    """Compute the 0-100 capacity score per docs/greenlight/02 §3.1."""

    profile = _coerce_validated_profile(profile)
    subscores = {
        "horizon": _horizon_subscore(profile),
        "income_stability": _income_stability_subscore(profile),
        "ef": _emergency_fund_subscore(profile),
        "savings": _savings_subscore(profile),
        "debt": _debt_subscore(profile),
    }
    return sum(CAPACITY_WEIGHTS[name] * score for name, score in subscores.items())


def capacity_to_gamma(score: float) -> float:
    """Map capacity score to gamma per docs/greenlight/02 §3.1."""

    p_cap = _clamp_score(score) / 100.0
    gamma = exp(log(GAMMA_MAX) - p_cap * (log(GAMMA_MAX) - log(GAMMA_MIN)))
    return min(GAMMA_MAX, max(GAMMA_MIN, gamma))
