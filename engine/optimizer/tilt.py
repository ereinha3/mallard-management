"""Momentum and volatility tilt for risky-sleeve ERC weights."""

from __future__ import annotations

from collections.abc import Mapping

import numpy as np
import pandas as pd

from schemas.constants import GAMMA_MAX, GAMMA_MIN, TILT_LAMBDA, TILT_LOOKBACK_MONTHS


def _periods_per_year(index: object) -> float:
    try:
        dates = pd.to_datetime(index)
        span_days = max((dates.max() - dates.min()).days, 1)
        periods = len(dates)
        if periods < 2:
            return 252.0
        return float((periods - 1) * 365.25 / span_days)
    except Exception:
        return 252.0


def _as_return_frame(sleeve_returns: object, columns: list[str]) -> pd.DataFrame:
    frame = sleeve_returns if isinstance(sleeve_returns, pd.DataFrame) else pd.DataFrame(sleeve_returns)
    if frame.empty:
        return pd.DataFrame(0.0, index=pd.RangeIndex(1), columns=columns)
    return frame.reindex(columns=columns).astype(float)


def _normalize(weights: Mapping[str, float]) -> dict[str, float]:
    cleaned = {key: max(float(value), 0.0) for key, value in weights.items()}
    total = float(sum(cleaned.values()))
    if total <= 0.0 or not np.isfinite(total):
        equal = 1.0 / len(cleaned) if cleaned else 0.0
        return {key: equal for key in cleaned}
    return {key: float(value / total) for key, value in cleaned.items()}


def _zscore(values: np.ndarray) -> np.ndarray:
    finite = np.where(np.isfinite(values), values, 0.0)
    if finite.size < 2:
        return np.zeros_like(finite, dtype=float)
    centered = finite - float(np.mean(finite))
    scale = float(np.std(centered))
    if scale <= 1e-12 or not np.isfinite(scale):
        return np.zeros_like(finite, dtype=float)
    return centered / scale


def _momentum(frame: pd.DataFrame, lookback_months: int, periods_per_year: float) -> np.ndarray:
    values = frame.to_numpy(dtype=float)
    if values.size == 0:
        return np.zeros(len(frame.columns), dtype=float)

    periods_per_month = max(1, int(round(periods_per_year / 12.0)))
    skip = min(periods_per_month, max(values.shape[0] - 1, 0))
    history = values[: values.shape[0] - skip] if skip else values
    if history.size == 0:
        history = values

    lookback_periods = max(1, int(round(max(1, lookback_months) * periods_per_month)))
    window = history[-min(lookback_periods, history.shape[0]) :]
    window = np.nan_to_num(window, nan=0.0, posinf=0.0, neginf=0.0)
    return np.prod(1.0 + window, axis=0) - 1.0


def _volatility(frame: pd.DataFrame, periods_per_year: float) -> np.ndarray:
    values = np.nan_to_num(frame.to_numpy(dtype=float), nan=0.0, posinf=0.0, neginf=0.0)
    ddof = 1 if values.shape[0] > 1 else 0
    return np.std(values, axis=0, ddof=ddof) * np.sqrt(periods_per_year)


def _cap_low_vol_boosts(base: np.ndarray, tilted: np.ndarray, z_vol: np.ndarray) -> np.ndarray:
    """Prevent momentum alone from increasing below-average-volatility sleeves."""

    capped = tilted.copy()
    low_vol_boost = (z_vol < 0.0) & (capped > base)
    if not np.any(low_vol_boost):
        return capped

    excess = float(np.sum(capped[low_vol_boost] - base[low_vol_boost]))
    capped[low_vol_boost] = base[low_vol_boost]
    receivers = (~low_vol_boost) & (z_vol > 0.0)
    if excess > 0.0 and np.any(receivers):
        receiver_total = float(np.sum(capped[receivers]))
        if receiver_total > 0.0:
            capped[receivers] += excess * capped[receivers] / receiver_total
    return capped


def momentum_vol_tilt(
    erc_weights: Mapping[str, float],
    sleeve_returns: object,
    gamma: float,
    *,
    lookback_months: int = TILT_LOOKBACK_MONTHS,
    lam: float = TILT_LAMBDA,
) -> dict[str, float]:
    """Tilt ERC risky-sleeve weights by gamma-scaled momentum and volatility."""

    columns = list(erc_weights)
    if not columns:
        return {}

    tilt_strength = float(np.clip((GAMMA_MAX - float(gamma)) / (GAMMA_MAX - GAMMA_MIN), 0.0, 1.0))
    if tilt_strength <= 1e-15 or float(lam) == 0.0:
        return {key: float(value) for key, value in erc_weights.items()}

    frame = _as_return_frame(sleeve_returns, columns)
    periods_per_year = _periods_per_year(frame.index)
    z_vol = _zscore(_volatility(frame, periods_per_year))
    signal = _zscore(_momentum(frame, lookback_months, periods_per_year)) + z_vol
    multiplier = np.exp(np.clip(tilt_strength * float(lam) * signal, -50.0, 50.0))

    base = np.asarray([max(float(erc_weights[column]), 0.0) for column in columns], dtype=float)
    tilted = np.nan_to_num(base * multiplier, nan=0.0, posinf=0.0, neginf=0.0)
    tilted = _cap_low_vol_boosts(base, tilted, z_vol)
    return _normalize(dict(zip(columns, (float(value) for value in tilted), strict=True)))
