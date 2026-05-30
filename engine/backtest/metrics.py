"""Backtest metrics for docs/greenlight/05 §7.5."""

from __future__ import annotations

from collections.abc import Sequence
from math import erf, isfinite, log, prod, sqrt

import numpy as np


def _as_array(values: Sequence[float], name: str) -> np.ndarray:
    arr = np.asarray(values, dtype=float)
    if arr.ndim != 1 or arr.size == 0:
        raise ValueError(f"{name} must be a non-empty 1D sequence")
    if not np.all(np.isfinite(arr)):
        raise ValueError(f"{name} must contain only finite values")
    return arr


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))


def _norm_ppf(p: float) -> float:
    """Acklam's rational approximation for the standard normal quantile."""

    if not 0.0 < p < 1.0:
        raise ValueError("p must be in (0, 1)")
    a = [
        -3.969683028665376e01,
        2.209460984245205e02,
        -2.759285104469687e02,
        1.383577518672690e02,
        -3.066479806614716e01,
        2.506628277459239e00,
    ]
    b = [
        -5.447609879822406e01,
        1.615858368580409e02,
        -1.556989798598866e02,
        6.680131188771972e01,
        -1.328068155288572e01,
    ]
    c = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e00,
        -2.549732539343734e00,
        4.374664141464968e00,
        2.938163982698783e00,
    ]
    d = [
        7.784695709041462e-03,
        3.224671290700398e-01,
        2.445134137142996e00,
        3.754408661907416e00,
    ]
    plow = 0.02425
    phigh = 1.0 - plow

    if p < plow:
        q = sqrt(-2.0 * log(p))
        return (
            (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
            / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0)
        )
    if p > phigh:
        q = sqrt(-2.0 * log(1.0 - p))
        return -(
            (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
            / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0)
        )

    q = p - 0.5
    r = q * q
    return (
        (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5])
        * q
        / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0)
    )


def deflated_sharpe(returns: Sequence[float], sr_hat: float, n_trials: int) -> float:
    """Compute Deflated Sharpe per docs/greenlight/05 §7.5."""

    values = _as_array(returns, "returns")
    if values.size < 2:
        raise ValueError("deflated_sharpe requires at least two returns")
    if n_trials < 1:
        raise ValueError("n_trials must be >= 1")
    if not isfinite(sr_hat):
        raise ValueError("sr_hat must be finite")

    centered = values - float(values.mean())
    variance = float(np.mean(centered**2))
    if variance <= 0.0:
        return 1.0 if sr_hat > 0.0 else 0.0

    std = sqrt(variance)
    skew = float(np.mean(centered**3) / std**3)
    kurtosis = float(np.mean(centered**4) / std**4)
    t_obs = values.size

    if n_trials == 1:
        sr0 = 0.0
    else:
        zeta = 0.5772
        sr_estimator_std = sqrt(1.0 / (t_obs - 1.0))
        expected_max = (1.0 - zeta) * _norm_ppf(1.0 - 1.0 / n_trials)
        expected_max += zeta * _norm_ppf(1.0 - 1.0 / (n_trials * np.e))
        sr0 = sr_estimator_std * expected_max

    variance_term = 1.0 - skew * sr0 + ((kurtosis - 1.0) / 4.0) * sr0**2
    if variance_term <= 0.0:
        return 1.0 if sr_hat > sr0 else 0.0
    statistic = (sr_hat - sr0) * sqrt(t_obs - 1.0) / sqrt(variance_term)
    return float(min(max(_norm_cdf(statistic), 0.0), 1.0))


def sortino(returns: Sequence[float], periods_per_year: int = 12) -> float:
    """Compute Sortino ratio per docs/greenlight/06 Phase 6.2."""

    values = _as_array(returns, "returns")
    downside = np.minimum(values, 0.0)
    downside_deviation = sqrt(float(np.mean(downside**2)))
    annualized_mean = float(values.mean()) * periods_per_year
    if downside_deviation == 0.0:
        if annualized_mean > 0.0:
            return float("inf")
        if annualized_mean < 0.0:
            return float("-inf")
        return 0.0
    return annualized_mean / (downside_deviation * sqrt(periods_per_year))


def max_drawdown(equity: Sequence[float]) -> float:
    """Compute max drawdown per docs/greenlight/06 Phase 6.2."""

    values = _as_array(equity, "equity")
    if np.any(values <= 0.0):
        raise ValueError("equity values must be positive")
    running_peak = np.maximum.accumulate(values)
    drawdowns = values / running_peak - 1.0
    return float(drawdowns.min())


def calmar(returns: Sequence[float], periods_per_year: int = 12) -> float:
    """Compute Calmar ratio per docs/greenlight/06 Phase 6.2."""

    values = _as_array(returns, "returns")
    ending_value = prod(1.0 + float(value) for value in values)
    if ending_value <= 0.0:
        cagr = -1.0
    else:
        cagr = ending_value ** (periods_per_year / values.size) - 1.0
    equity = np.cumprod(1.0 + values)
    mdd = abs(max_drawdown(equity))
    if mdd == 0.0:
        return float("inf") if cagr > 0.0 else 0.0
    return cagr / mdd
