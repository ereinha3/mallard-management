"""Risk profile builder for docs/greenlight/05 §2.3 and 06 Phase 2."""

from __future__ import annotations

from typing import Any

from profiler.capacity import capacity_score, capacity_to_gamma
from profiler.tolerance import score_to_gamma_band
from profiler.validate import validate_profile
from schemas.constants import SR_REF
from schemas.models import GammaBand, RiskProfile, UserProfile, ValidatedProfile


def _coerce_validated_profile(vp: ValidatedProfile | UserProfile | dict[str, Any]) -> ValidatedProfile:
    if isinstance(vp, ValidatedProfile):
        return vp

    if isinstance(vp, UserProfile):
        result = validate_profile(vp)
        if isinstance(result, dict):
            raise ValueError("profile requires clarification before risk profiling")
        return result

    result = validate_profile(vp)
    if isinstance(result, dict):
        raise ValueError("profile requires clarification before risk profiling")
    return result


def build_risk_profile(vp: ValidatedProfile | UserProfile | dict[str, Any]) -> RiskProfile:
    """Build a RiskProfile per docs/greenlight/05 §2.3."""

    profile = _coerce_validated_profile(vp)

    tolerance_score = float(sum(profile.risk_instrument_responses))
    tolerance_gamma = score_to_gamma_band(tolerance_score)
    cap_score = capacity_score(profile)
    cap_gamma = capacity_to_gamma(cap_score)

    gamma_band = GammaBand(
        aggressive=max(tolerance_gamma.aggressive, cap_gamma),
        mid=max(tolerance_gamma.mid, cap_gamma),
        conservative=max(tolerance_gamma.conservative, cap_gamma),
    )
    binding_axis = "tolerance" if tolerance_gamma.mid >= cap_gamma else "capacity"

    return RiskProfile(
        gamma_band=gamma_band,
        tolerance_gamma=tolerance_gamma,
        capacity_gamma=cap_gamma,
        capacity_score=cap_score,
        tolerance_score=tolerance_score,
        binding_axis=binding_axis,
        target_vol_band={
            "aggressive": SR_REF / gamma_band.aggressive,
            "mid": SR_REF / gamma_band.mid,
            "conservative": SR_REF / gamma_band.conservative,
        },
    )
