"""Scenario-derived downside metrics for portfolio returns."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import numpy as np

from montecarlo.projection import _portfolio_monthly_returns, _stationary_bootstrap_paths
from schemas.constants import BLOCK_L, N_PATHS

DEFAULT_SCENARIO_VAR_SEED = 20240531


def _infer_periods_per_year(returns: Any) -> int:
    index = getattr(returns, "index", None)
    if index is not None and len(index) > 1:
        try:
            raw_index = np.asarray(index)
            if not np.issubdtype(raw_index.dtype, np.datetime64):
                return 12
            dates = raw_index.astype("datetime64[ns]")
            span_days = float((dates[-1] - dates[0]) / np.timedelta64(1, "D"))
            if np.isfinite(span_days) and span_days > 0.0:
                periods = int(round((len(index) - 1) * 365.25 / span_days))
                return max(1, periods)
        except (TypeError, ValueError, OverflowError):
            pass
    return 12


def scenario_var_1yr_loss(
    weights: Mapping[str, float],
    returns: Any,
    *,
    beta: float = 0.95,
    n_scenarios: int = N_PATHS,
    seed: int = DEFAULT_SCENARIO_VAR_SEED,
    block_l: int = BLOCK_L,
    periods_per_year: int | None = None,
) -> float:
    """Return a deterministic 95% one-year VaR loss from bootstrap scenarios.

    The metric compounds one year of stationary-bootstrap portfolio return paths
    and reports the beta-quantile loss, equivalently the loss at the 5th
    percentile of one-year return when beta is 0.95.
    """

    if not 0.0 < beta < 1.0:
        raise ValueError("beta must be between 0 and 1")
    if n_scenarios < 1:
        raise ValueError("n_scenarios must be positive")
    if block_l < 1:
        raise ValueError("block_l must be positive")

    n_periods = int(periods_per_year) if periods_per_year is not None else _infer_periods_per_year(returns)
    if n_periods < 1:
        raise ValueError("periods_per_year must be positive")

    portfolio_returns = _portfolio_monthly_returns(weights, returns)
    rng = np.random.default_rng(seed)
    paths = _stationary_bootstrap_paths(
        portfolio_returns,
        n_periods,
        int(n_scenarios),
        rng,
        block_l=block_l,
    )
    one_year_returns = np.prod(1.0 + paths, axis=1) - 1.0
    losses = -one_year_returns
    return float(max(0.0, np.quantile(losses, beta)))
