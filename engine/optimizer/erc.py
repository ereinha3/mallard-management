"""ERC optimizer for docs/greenlight/05 §4 and 06 Phase 3.2."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np
import pandas as pd


def _finite_return_values(returns: object) -> np.ndarray:
    values = np.asarray(returns, dtype=float)
    if values.ndim != 2:
        raise ValueError("returns must be a 2D matrix")
    values = values[np.isfinite(values).all(axis=1)]
    if values.shape[0] < 2:
        raise ValueError("returns must contain at least two finite observations")
    return values


def _columns(returns: object) -> list[str]:
    values = np.asarray(returns)
    if values.ndim != 2:
        raise ValueError("returns must be a 2D matrix")
    fallback = [f"asset_{idx}" for idx in range(values.shape[1])]
    return list(getattr(returns, "columns", fallback))


def _sample_covariance(values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    centered = values - values.mean(axis=0, keepdims=True)
    sample = (centered.T @ centered) / values.shape[0]
    return np.atleast_2d(sample), centered


def _constant_correlation_target(sample: np.ndarray) -> np.ndarray:
    sample = (np.asarray(sample, dtype=float) + np.asarray(sample, dtype=float).T) / 2.0
    n_assets = sample.shape[0]
    var = np.maximum(np.diag(sample).copy(), 0.0)
    std = np.sqrt(var)
    denom = np.outer(std, std)
    target = np.zeros_like(sample)
    if n_assets == 1:
        target[0, 0] = var[0]
        return target

    corr = np.zeros_like(sample)
    np.divide(sample, denom, out=corr, where=denom > 0)
    off_diag = ~np.eye(n_assets, dtype=bool)
    valid = off_diag & (denom > 0)
    rbar = float(corr[valid].mean()) if np.any(valid) else 0.0
    rbar = min(1.0, max(-1.0 / (n_assets - 1) + 1e-12, rbar))
    target = rbar * denom
    np.fill_diagonal(target, var)
    return (target + target.T) / 2.0


def _target_directional_derivative(sample: np.ndarray, direction: np.ndarray) -> np.ndarray:
    sample_norm = max(float(np.linalg.norm(sample)), 1.0)
    direction_norm = max(float(np.linalg.norm(direction)), 1.0)
    step = 1e-5 * sample_norm / direction_norm
    plus = _constant_correlation_target(sample + step * direction)
    minus = _constant_correlation_target(sample - step * direction)
    return (plus - minus) / (2.0 * step)


def _ledoit_wolf_delta_from_centered(centered: np.ndarray, sample: np.ndarray) -> float:
    n_obs, n_assets = centered.shape
    if n_assets == 1:
        return 0.0

    target = _constant_correlation_target(sample)
    gamma_hat = float(np.sum((target - sample) ** 2))
    if gamma_hat <= 1e-24:
        return 0.0

    products = centered[:, :, None] * centered[:, None, :]
    shocks = products - sample
    pi_hat = float(np.mean(np.sum(shocks * shocks, axis=(1, 2))))

    rho_terms = []
    for shock in shocks:
        target_shock = _target_directional_derivative(sample, shock)
        rho_terms.append(float(np.sum(target_shock * shock)))
    rho_hat = float(np.mean(rho_terms)) if rho_terms else 0.0

    kappa_hat = (pi_hat - rho_hat) / gamma_hat
    return min(1.0, max(0.0, kappa_hat / n_obs))


def ledoit_wolf_shrinkage_delta(returns: object) -> float:
    """Estimate Ledoit-Wolf shrinkage intensity toward a constant-correlation target."""

    values = _finite_return_values(returns)
    sample, centered = _sample_covariance(values)
    if sample.shape != (values.shape[1], values.shape[1]):
        sample = sample.reshape(values.shape[1], values.shape[1])
    return _ledoit_wolf_delta_from_centered(centered, sample)


def cov_ledoit_wolf(returns: object, delta: float | None = None) -> pd.DataFrame:
    """Estimate a linear-shrinkage covariance per docs/greenlight/06 Phase 3.2.

    This uses the constant-correlation target described in
    docs/greenlight/.codex-tasks/ENV-CONSTRAINTS.md.
    """

    values = _finite_return_values(returns)
    labels = _columns(returns)
    sample, centered = _sample_covariance(values)
    if sample.shape != (values.shape[1], values.shape[1]):
        sample = sample.reshape(values.shape[1], values.shape[1])

    if values.shape[1] == 1:
        sigma = sample
        shrinkage = 0.0
    else:
        target = _constant_correlation_target(sample)
        shrinkage = _ledoit_wolf_delta_from_centered(centered, sample) if delta is None else float(delta)
        shrinkage = min(1.0, max(0.0, shrinkage))
        sigma = (1.0 - shrinkage) * sample + shrinkage * target

    sigma = (sigma + sigma.T) / 2.0
    sigma = sigma + np.eye(values.shape[1]) * 1e-12
    frame = pd.DataFrame(sigma, index=labels, columns=labels)
    frame.attrs["ledoit_wolf_delta"] = float(shrinkage)
    return frame


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
