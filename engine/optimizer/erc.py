"""ERC optimizer for docs/greenlight/05 §4 and 06 Phase 3.2."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np
import pandas as pd


def _columns(returns: object) -> list[str]:
    values = np.asarray(returns)
    if values.ndim != 2:
        raise ValueError("returns must be a 2D matrix")
    fallback = [f"asset_{idx}" for idx in range(values.shape[1])]
    return list(getattr(returns, "columns", fallback))


def cov_ledoit_wolf(returns: object, delta: float | None = None) -> pd.DataFrame:
    """Estimate a linear-shrinkage covariance per docs/greenlight/06 Phase 3.2.

    This uses the constant-correlation target described in
    docs/greenlight/.codex-tasks/ENV-CONSTRAINTS.md.
    """

    values = np.asarray(returns, dtype=float)
    if values.ndim != 2:
        raise ValueError("returns must be a 2D matrix")
    values = values[np.isfinite(values).all(axis=1)]
    if values.shape[0] < 2:
        raise ValueError("returns must contain at least two finite observations")

    labels = _columns(returns)
    sample = np.atleast_2d(np.cov(values, rowvar=False))
    if sample.shape != (values.shape[1], values.shape[1]):
        sample = sample.reshape(values.shape[1], values.shape[1])

    if values.shape[1] == 1:
        sigma = sample
    else:
        var = np.diag(sample).copy()
        std = np.sqrt(np.maximum(var, 0.0))
        denom = np.outer(std, std)
        corr = np.zeros_like(sample)
        np.divide(sample, denom, out=corr, where=denom > 0)
        np.fill_diagonal(corr, 1.0)
        n_assets = values.shape[1]
        rbar = (float(corr.sum()) - n_assets) / (n_assets * (n_assets - 1))
        target = rbar * denom
        np.fill_diagonal(target, var)
        shrinkage = 0.2 if delta is None else float(delta)
        shrinkage = min(1.0, max(0.0, shrinkage))
        sigma = (1.0 - shrinkage) * sample + shrinkage * target

    sigma = (sigma + sigma.T) / 2.0
    sigma = sigma + np.eye(values.shape[1]) * 1e-12
    return pd.DataFrame(sigma, index=labels, columns=labels)


def erc_weights(returns: object) -> dict[str, float]:
    """Compute equal-risk-contribution weights per docs/greenlight/06 Phase 3.2."""

    cov_frame = cov_ledoit_wolf(returns)
    cov = cov_frame.to_numpy(dtype=float)
    n_assets = cov.shape[0]
    if n_assets == 0:
        raise ValueError("returns must contain at least one asset")
    budgets = np.full(n_assets, 1 / n_assets)
    x = np.ones(n_assets)
    cov = cov + np.eye(n_assets) * 1e-12
    sigma_x = cov @ x
    for _ in range(10000):
        old = x / x.sum()
        for i in range(n_assets):
            variance_i = cov[i, i]
            cross = sigma_x[i] - variance_i * x[i]
            new_x = (-cross + np.sqrt(cross**2 + 4 * variance_i * budgets[i])) / (2 * variance_i)
            delta = new_x - x[i]
            x[i] = new_x
            sigma_x += cov[:, i] * delta
        if np.max(np.abs((x / x.sum()) - old)) < 1e-12:
            break
    weights = x / x.sum()
    return dict(zip(cov_frame.columns, (float(value) for value in weights), strict=True))


def risk_contributions(w: Mapping[str, float] | Sequence[float], cov: object) -> list[float]:
    """Compute risk contributions per docs/greenlight/06 Phase 3.2."""

    labels = list(getattr(cov, "columns", []))
    if isinstance(w, Mapping) and labels:
        weights = np.asarray([w[label] for label in labels], dtype=float)
    else:
        weights = np.asarray(list(w.values()) if isinstance(w, Mapping) else w, dtype=float)
    covariance = np.asarray(cov, dtype=float)
    portfolio_variance = float(weights @ covariance @ weights)
    if portfolio_variance <= 0:
        raise ValueError("portfolio variance must be positive")
    return ((weights * (covariance @ weights)) / portfolio_variance).astype(float).tolist()
