"""Monte Carlo projection skeleton for docs/greenlight/05 §7.4."""

from collections.abc import Mapping
from typing import Any

from schemas.models import Projection


def project(
    weights: Mapping[str, float],
    returns: Any,
    horizon_years: int,
    capital: float,
    monthly_contribution: float,
    goal: float,
    generator: str,
    seed: int | None,
    n_paths: int,
) -> Projection:
    """Project goal success per docs/greenlight/05 §7.4."""

    raise NotImplementedError
