"""ERC optimizer fallback for docs/greenlight/05 §4 and 06 Phase 3.2."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np


def _columns(returns: object) -> list[str]:
    return list(getattr(returns, "columns", range(np.asarray(returns).shape[1])))


def cov_ledoit_wolf(returns: object) -> np.ndarray:
    """Estimate Ledoit-Wolf covariance per docs/greenlight/06 Phase 3.2."""

    values = np.asarray(returns, dtype=float)
    if values.ndim != 2:
        raise ValueError("returns must be a 2D matrix")
    try:
        from sklearn.covariance import LedoitWolf

        return LedoitWolf().fit(values).covariance_
    except Exception:
        sample = np.cov(values, rowvar=False)
        diagonal = np.diag(np.diag(sample))
        return 0.9 * sample + 0.1 * diagonal


def erc_weights(returns: object) -> dict[str, float]:
    """Compute equal-risk-contribution weights per docs/greenlight/06 Phase 3.2."""

    cov = cov_ledoit_wolf(returns)
    n_assets = cov.shape[0]
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
    return dict(zip(_columns(returns), (float(value) for value in weights), strict=True))


def risk_contributions(w: Mapping[str, float] | Sequence[float], cov: object) -> list[float]:
    """Compute risk contributions per docs/greenlight/06 Phase 3.2."""

    weights = np.asarray(list(w.values()) if isinstance(w, Mapping) else w, dtype=float)
    covariance = np.asarray(cov, dtype=float)
    portfolio_variance = float(weights @ covariance @ weights)
    if portfolio_variance <= 0:
        raise ValueError("portfolio variance must be positive")
    return ((weights * (covariance @ weights)) / portfolio_variance).astype(float).tolist()
