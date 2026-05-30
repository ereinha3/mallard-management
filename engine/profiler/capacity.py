"""Capacity profiler skeleton for docs/greenlight/02 §3.1 and 06 Phase 2."""

from schemas.models import ValidatedProfile


def capacity_score(profile: ValidatedProfile) -> float:
    """Compute the 0-100 capacity score per docs/greenlight/02 §3.1."""

    raise NotImplementedError


def capacity_to_gamma(score: float) -> float:
    """Map capacity score to gamma per docs/greenlight/02 §3.1."""

    raise NotImplementedError
