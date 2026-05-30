"""CAL blend skeleton for docs/greenlight/05 §4 and §7.3."""

from typing import Any

from schemas.constants import GLIDE_BASE_AGE, GLIDE_FLOOR
from schemas.models import TargetWeights


def solve_blend_alpha(
    sigma_risky: float,
    sigma_safe: float,
    rho: float,
    sigma_target: float,
) -> float:
    """Solve the CAL risky-sleeve fraction per docs/greenlight/05 §4."""

    if sigma_risky < 0 or sigma_safe < 0 or sigma_target < 0:
        raise ValueError("volatilities must be non-negative")
    if sigma_risky == sigma_safe:
        return 1.0 if sigma_target >= sigma_risky else 0.0
    if sigma_target >= sigma_risky:
        return 1.0
    if sigma_target <= sigma_safe:
        return 0.0

    def blend_vol(alpha: float) -> float:
        variance = (
            alpha**2 * sigma_risky**2
            + (1 - alpha) ** 2 * sigma_safe**2
            + 2 * alpha * (1 - alpha) * rho * sigma_risky * sigma_safe
        )
        return max(variance, 0.0) ** 0.5

    lo, hi = 0.0, 1.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if blend_vol(mid) < sigma_target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def glide_factor(age: int, horizon: int) -> float:
    """Compute glide factor per docs/greenlight/05 §4."""

    _ = (GLIDE_BASE_AGE, GLIDE_FLOOR, age, horizon)
    raise NotImplementedError


def build_target_weights(risk_profile: Any, universe: Any, prices: Any) -> TargetWeights:
    """Build TargetWeights per docs/greenlight/05 §2.6 and §4."""

    raise NotImplementedError
