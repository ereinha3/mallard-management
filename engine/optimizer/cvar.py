"""Long-only CVaR sleeve optimizer."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import numpy as np

from montecarlo.projection import _stationary_bootstrap_paths
from schemas.constants import BLOCK_L


def _values_and_labels(returns: Any) -> tuple[np.ndarray, list[str]]:
    values = np.asarray(returns.to_numpy(dtype=float) if hasattr(returns, "to_numpy") else returns, dtype=float)
    if values.ndim != 2 or values.shape[0] == 0 or values.shape[1] == 0:
        raise ValueError("returns must be a non-empty 2D matrix")
    values = values[np.isfinite(values).all(axis=1)]
    if values.shape[0] == 0:
        raise ValueError("returns must contain at least one finite row")
    fallback = [f"asset_{idx}" for idx in range(values.shape[1])]
    labels = [str(label) for label in getattr(returns, "columns", fallback)]
    return values, labels


def _weight_vector(labels: list[str], weights: Mapping[str, float]) -> np.ndarray:
    vector = np.asarray([float(weights.get(label, 0.0)) for label in labels], dtype=float)
    if vector.shape != (len(labels),) or not np.all(np.isfinite(vector)):
        raise ValueError("weights must be finite and match return columns")
    if vector.sum() <= 0.0:
        raise ValueError("weights must have positive total")
    vector = np.maximum(vector, 0.0)
    return vector / vector.sum()


def _project_simplex(values: np.ndarray) -> np.ndarray:
    if values.ndim != 1:
        raise ValueError("values must be one-dimensional")
    ordered = np.sort(values)[::-1]
    cumsum = np.cumsum(ordered)
    rho_candidates = ordered * np.arange(1, len(values) + 1) > (cumsum - 1.0)
    if not np.any(rho_candidates):
        return np.full(len(values), 1.0 / len(values))
    rho = int(np.flatnonzero(rho_candidates)[-1])
    theta = (cumsum[rho] - 1.0) / float(rho + 1)
    projected = np.maximum(values - theta, 0.0)
    return projected / projected.sum()


def _bootstrap_scenarios(
    values: np.ndarray,
    n_scenarios: int,
    seed: int | None,
    block_l: int,
) -> np.ndarray:
    if n_scenarios <= values.shape[0]:
        return values.copy()
    rng = np.random.default_rng(seed)
    index_series = np.arange(values.shape[0], dtype=float)
    indices = _stationary_bootstrap_paths(
        index_series,
        n_scenarios,
        1,
        rng,
        block_l=block_l,
    )[0].astype(int)
    return values[indices]


def _cvar_loss_array(values: np.ndarray, weights: np.ndarray, beta: float) -> float:
    losses = -(values @ weights)
    cutoff = float(np.quantile(losses, beta))
    tail = losses[losses >= cutoff - 1e-15]
    if tail.size == 0:
        return float(max(0.0, losses.max()))
    return float(max(0.0, tail.mean()))


def cvar_95_loss(returns: Any, weights: Mapping[str, float], beta: float = 0.95) -> float:
    """Return historical expected shortfall loss for a sleeve portfolio."""

    values, labels = _values_and_labels(returns)
    vector = _weight_vector(labels, weights)
    return _cvar_loss_array(values, vector, beta)


def cvar_weights(
    returns: Any,
    *,
    beta: float = 0.95,
    n_scenarios: int = 1000,
    seed: int | None = 17,
    block_l: int = BLOCK_L,
    max_iter: int = 1200,
) -> dict[str, float]:
    """Minimize 95% CVaR over long-only sleeve weights using pure numpy."""

    if not 0.0 < beta < 1.0:
        raise ValueError("beta must be between 0 and 1")
    if n_scenarios < 1:
        raise ValueError("n_scenarios must be positive")
    values, labels = _values_and_labels(returns)
    scenarios = _bootstrap_scenarios(values, int(n_scenarios), seed, block_l)
    n_assets = scenarios.shape[1]

    candidates = [np.full(n_assets, 1.0 / n_assets)]
    candidates.extend(np.eye(n_assets))
    individual_losses = [_cvar_loss_array(scenarios, candidate, beta) for candidate in candidates[1:]]
    start = candidates[1 + int(np.argmin(individual_losses))].copy()
    candidates.append(start)

    best = candidates[0].copy()
    best_loss = _cvar_loss_array(scenarios, best, beta)
    for candidate in candidates[1:]:
        loss = _cvar_loss_array(scenarios, candidate, beta)
        if loss < best_loss:
            best = candidate.copy()
            best_loss = loss

    w = 0.5 * candidates[0] + 0.5 * start
    w = _project_simplex(w)
    for iteration in range(1, max_iter + 1):
        losses = -(scenarios @ w)
        var = float(np.quantile(losses, beta))
        tail_mask = losses >= var - 1e-15
        if not np.any(tail_mask):
            break
        gradient = -scenarios[tail_mask].mean(axis=0)
        step = 0.25 / np.sqrt(iteration)
        w = _project_simplex(w - step * gradient)
        loss = _cvar_loss_array(scenarios, w, beta)
        if loss < best_loss:
            best = w.copy()
            best_loss = loss

    best = _project_simplex(best)
    return dict(zip(labels, (float(value) for value in best), strict=True))
