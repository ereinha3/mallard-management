"""Monte Carlo projection skeleton for docs/greenlight/05 §7.4."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import numpy as np

from schemas.constants import BLOCK_L, N_PATHS
from schemas.models import Projection


PERCENTILE_SPECS = {
    "p5": 5,
    "p25": 25,
    "p50": 50,
    "p75": 75,
    "p95": 95,
}


def _portfolio_monthly_returns(weights: Mapping[str, float], returns: Any) -> np.ndarray:
    """Convert a return matrix to the weighted monthly portfolio series."""

    if not weights:
        raise ValueError("weights must not be empty")

    matrix = np.asarray(
        returns.to_numpy(dtype=float) if hasattr(returns, "to_numpy") else returns,
        dtype=float,
    )
    if matrix.ndim == 1:
        if len(weights) != 1:
            raise ValueError("1-D returns require exactly one portfolio weight")
        series = matrix
    elif matrix.ndim == 2:
        if matrix.shape[0] == 0 or matrix.shape[1] == 0:
            raise ValueError("returns must contain at least one row and one column")
        weight_vector = _weight_vector(weights, returns, matrix.shape[1])
        series = matrix @ weight_vector
    else:
        raise ValueError("returns must be a 1-D series or 2-D matrix")

    series = np.asarray(series, dtype=float).reshape(-1)
    series = series[np.isfinite(series)]
    if series.size == 0:
        raise ValueError("returns must contain at least one finite observation")
    return series


def _weight_vector(weights: Mapping[str, float], returns: Any, n_columns: int) -> np.ndarray:
    values = np.array(list(weights.values()), dtype=float)
    if not np.all(np.isfinite(values)) or np.all(values == 0.0):
        raise ValueError("weights must contain at least one finite non-zero value")

    if hasattr(returns, "columns"):
        weight_lookup = {str(key): float(value) for key, value in weights.items()}
        columns = [str(column) for column in returns.columns]
        vector = np.array([weight_lookup.get(column, 0.0) for column in columns], dtype=float)
        weighted_keys = {str(key) for key, value in weights.items() if float(value) != 0.0}
        matched_keys = weighted_keys.intersection(columns)
        if matched_keys:
            missing_keys = sorted(weighted_keys - set(columns))
            if missing_keys:
                raise ValueError(f"returns missing columns for weights: {missing_keys}")
            return vector

    if values.size != n_columns:
        raise ValueError("weight count must match return columns when returns are unlabeled")
    return values


def _stationary_bootstrap_paths(
    series: np.ndarray,
    n_months: int,
    n_paths: int,
    rng: np.random.Generator,
    block_l: int = BLOCK_L,
) -> np.ndarray:
    """Stationary bootstrap with geometric blocks of expected length ``block_l``."""

    sample_size = series.size
    if n_months == 0:
        return np.empty((n_paths, 0), dtype=float)

    restart_probability = 1.0 / max(1, block_l)
    indices = np.empty((n_paths, n_months), dtype=np.int64)
    indices[:, 0] = rng.integers(0, sample_size, size=n_paths)

    restarts = rng.random((n_paths, max(0, n_months - 1))) < restart_probability
    starts = rng.integers(0, sample_size, size=(n_paths, max(0, n_months - 1)))
    for month in range(1, n_months):
        indices[:, month] = np.where(
            restarts[:, month - 1],
            starts[:, month - 1],
            (indices[:, month - 1] + 1) % sample_size,
        )

    return series[indices]


def _gaussian_paths(series: np.ndarray, n_months: int, n_paths: int, rng: np.random.Generator) -> np.ndarray:
    return rng.normal(float(np.mean(series)), float(np.std(series)), size=(n_paths, n_months))


def _wealth_paths(monthly_returns: np.ndarray, capital: float, monthly_contribution: float) -> np.ndarray:
    wealth = np.empty_like(monthly_returns, dtype=float)
    current = np.full(monthly_returns.shape[0], float(capital), dtype=float)
    for month in range(monthly_returns.shape[1]):
        current = current * (1.0 + monthly_returns[:, month]) + monthly_contribution
        wealth[:, month] = current
    return wealth


def project(
    weights: Mapping[str, float],
    returns: Any,
    horizon_years: int,
    capital: float,
    monthly_contribution: float,
    goal: float,
    generator: str = "stationary_bootstrap",
    seed: int | None = None,
    n_paths: int = N_PATHS,
) -> Projection:
    """Project goal success per docs/greenlight/05 §7.4."""

    if horizon_years < 1:
        raise ValueError("horizon_years must be at least 1")
    if n_paths < 1:
        raise ValueError("n_paths must be at least 1")
    if capital < 0 or monthly_contribution < 0 or goal < 0:
        raise ValueError("capital, monthly_contribution, and goal must be non-negative")

    portfolio_returns = _portfolio_monthly_returns(weights, returns)
    n_months = horizon_years * 12
    rng = np.random.default_rng(seed)

    if generator == "stationary_bootstrap":
        simulated_returns = _stationary_bootstrap_paths(portfolio_returns, n_months, n_paths, rng)
    elif generator == "gaussian":
        simulated_returns = _gaussian_paths(portfolio_returns, n_months, n_paths, rng)
    else:
        raise ValueError("generator must be 'stationary_bootstrap' or 'gaussian'")

    wealth = _wealth_paths(simulated_returns, capital, monthly_contribution)
    terminal = wealth[:, -1]
    yearly_wealth = wealth[:, 11::12]
    percentiles = np.percentile(yearly_wealth, list(PERCENTILE_SPECS.values()), axis=0)
    percentile_paths = {
        key: [float(value) for value in percentiles[index]]
        for index, key in enumerate(PERCENTILE_SPECS)
    }

    return Projection(
        p_success=float(np.mean(terminal >= goal)),
        generator=generator,
        horizon_years=horizon_years,
        percentile_paths=percentile_paths,
        bad_case_terminal=float(np.percentile(terminal, 5)),
        median_terminal=float(np.percentile(terminal, 50)),
        n_paths=n_paths,
    )
