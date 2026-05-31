"""CAL blend for docs/greenlight/05 §4 and §7.3."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import numpy as np
import pandas as pd

from data.loaders import load_prices
from schemas.constants import (
    GAMMA_MAX,
    GLIDE_BASE_AGE,
    GLIDE_FLOOR,
    TILT_LAMBDA,
    TILT_LOOKBACK_MONTHS,
)
from schemas.models import TargetWeights
from optimizer.erc import cov_ledoit_wolf, erc_weights
from optimizer.tilt import momentum_vol_tilt


SATELLITE_BUCKET_CAP = 0.04

_CORE_RISKY_SLEEVES = frozenset({"us_equity", "intl_equity"})
_CORE_BUCKET_EXACT = frozenset(
    {
        "us_equity",
        "intl_equity",
        "us_total_market",
        "us_large_blend",
        "intl_developed",
        "intl_emerging",
        "international_developed",
        "international_emerging",
        "developed_markets",
        "emerging_markets",
        "em_equity",
    }
)
_CORE_BUCKET_MARKERS = (
    "total_market",
    "large_blend",
    "broad_market",
    "broad_developed",
    "broad_emerging",
    "global_equity",
)


def solve_blend_alpha(
    sigma_risky: float,
    sigma_safe: float,
    rho: float,
    sigma_target: float,
) -> float:
    """Solve the CAL risky-sleeve fraction per docs/greenlight/05 §4."""

    if sigma_risky < 0 or sigma_safe < 0 or sigma_target < 0:
        raise ValueError("volatilities must be non-negative")
    if sigma_risky == sigma_safe:
        return 1.0 if sigma_target >= sigma_risky else 0.0
    if sigma_target >= sigma_risky:
        return 1.0
    if sigma_target <= sigma_safe:
        return 0.0

    def blend_vol(alpha: float) -> float:
        variance = (
            alpha**2 * sigma_risky**2
            + (1 - alpha) ** 2 * sigma_safe**2
            + 2 * alpha * (1 - alpha) * rho * sigma_risky * sigma_safe
        )
        return max(variance, 0.0) ** 0.5

    lo, hi = 0.0, 1.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if blend_vol(mid) < sigma_target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def glide_factor(age: int, horizon: int) -> float:
    """Compute glide factor per docs/greenlight/05 §4."""

    _ = horizon
    value = 1.0 - max(0, age - GLIDE_BASE_AGE) / 100.0
    return min(1.0, max(GLIDE_FLOOR, value))


def _get_attr_or_key(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _target_vol_mid(risk_profile: Any) -> float:
    target_vol_band = _get_attr_or_key(risk_profile, "target_vol_band")
    if target_vol_band is None:
        raise ValueError("risk_profile.target_vol_band is required")
    return float(_get_attr_or_key(target_vol_band, "mid"))


def _gamma_mid(risk_profile: Any) -> float:
    """Risk-tolerance gamma used to scale the momentum/vol tilt.

    GAMMA_MAX (most conservative) disables the tilt; lower gamma tilts more.
    """

    gamma_band = _get_attr_or_key(risk_profile, "gamma_band")
    if gamma_band is None:
        return GAMMA_MAX
    return float(_get_attr_or_key(gamma_band, "mid", GAMMA_MAX))


def _ticker_returns(prices: Any | None) -> pd.DataFrame:
    if prices is None:
        prices = load_prices()
    if not isinstance(prices, pd.DataFrame):
        prices = pd.DataFrame(prices)

    if {"date", "ticker", "adj_close"}.issubset(prices.columns):
        wide = prices.pivot(index="date", columns="ticker", values="adj_close").sort_index()
    else:
        wide = prices.copy()
        if "date" in wide.columns:
            wide = wide.set_index("date")
        wide = wide.sort_index()

    return wide.astype(float).pct_change().dropna(how="all")


def _bucket_to_sleeve(universe: Any) -> dict[str, str]:
    mapping: dict[str, str] = {}
    sleeves = getattr(universe, "sleeves", {})
    for bucket, bucket_tickers in getattr(universe, "buckets", {}).items():
        bucket_set = set(bucket_tickers)
        for sleeve, sleeve_tickers in sleeves.items():
            if bucket_set.intersection(set(sleeve_tickers)):
                mapping[str(bucket)] = str(sleeve)
                break
    return mapping


def _group_returns(
    universe: Any,
    prices: Any | None,
    groups: Mapping[str, list[str]],
    *,
    allow_sleeve_fallback: bool = False,
) -> pd.DataFrame:
    ticker_returns = _ticker_returns(prices)
    matrix = pd.DataFrame(index=ticker_returns.index)
    sleeve_matrix: dict[str, pd.Series] = {}
    if allow_sleeve_fallback:
        for sleeve, tickers in getattr(universe, "sleeves", {}).items():
            available = [ticker for ticker in tickers if ticker in ticker_returns.columns]
            if available:
                sleeve_matrix[str(sleeve)] = ticker_returns[available].mean(axis=1)
    bucket_sleeves = _bucket_to_sleeve(universe) if allow_sleeve_fallback else {}

    for group, tickers in groups.items():
        available = [ticker for ticker in tickers if ticker in ticker_returns.columns]
        if available:
            matrix[group] = ticker_returns[available].mean(axis=1)
            continue
        fallback = sleeve_matrix.get(bucket_sleeves.get(str(group), ""))
        if fallback is None:
            # No priced tickers for this group in the given window (e.g. a fund
            # that had not yet listed in a historical backtest window). Skip it
            # rather than failing; callers filter risky/safe buckets to the
            # groups actually present.
            continue
        matrix[group] = fallback

    return matrix.dropna(how="any")


def _sleeve_returns(universe: Any, prices: Any | None) -> pd.DataFrame:
    return _group_returns(universe, prices, universe.sleeves)


def _bucket_returns(universe: Any, prices: Any | None) -> pd.DataFrame:
    buckets = getattr(universe, "buckets", None)
    if not buckets:
        return _sleeve_returns(universe, prices)
    return _group_returns(universe, prices, buckets, allow_sleeve_fallback=True)


def bucket_return_matrix(universe: Any, prices: Any | None = None) -> pd.DataFrame:
    """Return the bucket-level return matrix used by the ERC blend."""

    return _bucket_returns(universe, prices)


def _normalized(weights: Mapping[str, float]) -> dict[str, float]:
    total = float(sum(weights.values()))
    if total <= 0:
        raise ValueError("weights must have positive total")
    return {key: float(value / total) for key, value in weights.items()}


def _is_core_risky_bucket(
    bucket: str,
    bucket_sleeves: Mapping[str, str],
) -> bool:
    bucket_key = str(bucket)
    sleeve = str(bucket_sleeves.get(bucket_key, bucket_key))
    if sleeve not in _CORE_RISKY_SLEEVES:
        return False

    normalized_bucket = bucket_key.lower()
    return (
        normalized_bucket in _CORE_BUCKET_EXACT
        or any(marker in normalized_bucket for marker in _CORE_BUCKET_MARKERS)
    )


def _satellite_capped_risky_weights(
    risky_weights: Mapping[str, float],
    universe: Any,
) -> dict[str, float]:
    weights = _normalized(
        {str(bucket): max(float(weight), 0.0) for bucket, weight in risky_weights.items()}
    )
    bucket_sleeves = _bucket_to_sleeve(universe)
    core_buckets = [
        bucket for bucket in weights if _is_core_risky_bucket(bucket, bucket_sleeves)
    ]
    satellite_buckets = [bucket for bucket in weights if bucket not in core_buckets]
    if not core_buckets or not satellite_buckets:
        return weights

    capped = dict(weights)
    excess = 0.0
    for bucket in satellite_buckets:
        weight = capped[bucket]
        if weight > SATELLITE_BUCKET_CAP:
            capped[bucket] = SATELLITE_BUCKET_CAP
            excess += weight - SATELLITE_BUCKET_CAP

    if excess <= 0.0:
        return weights

    core_total = sum(capped[bucket] for bucket in core_buckets)
    if core_total > 0.0:
        for bucket in core_buckets:
            capped[bucket] += excess * capped[bucket] / core_total
    else:
        equal_add = excess / len(core_buckets)
        for bucket in core_buckets:
            capped[bucket] += equal_add

    return _normalized(capped)


def _safe_bucket_weights(universe: Any) -> dict[str, float]:
    safe_buckets = list(getattr(universe, "safe_buckets", []) or [])
    if not safe_buckets:
        return {
            str(sleeve): weight
            for sleeve, weight in _safe_sleeve_weights(universe).items()
        }
    bucket_market_weights = getattr(universe, "bucket_market_weights", {})
    weights = {
        str(bucket): float(bucket_market_weights.get(bucket, 0.0))
        for bucket in safe_buckets
    }
    if sum(weights.values()) <= 0:
        weights = {str(bucket): 1.0 for bucket in safe_buckets}
    return _normalized(weights)


def _safe_sleeve_weights(universe: Any) -> dict[str, float]:
    weights = {
        str(sleeve): float(universe.market_weights.get(sleeve, 0.0))
        for sleeve in universe.safe_sleeves
    }
    if sum(weights.values()) <= 0:
        weights = {str(sleeve): 1.0 for sleeve in universe.safe_sleeves}
    return _normalized(weights)


def _periods_per_year(index: Any) -> float:
    try:
        dates = pd.to_datetime(index)
        span_days = max((dates.max() - dates.min()).days, 1)
        return float((len(dates) - 1) * 365.25 / span_days)
    except Exception:
        return 252.0


def _portfolio_vols_and_corr(
    return_matrix: pd.DataFrame,
    risky_weights: Mapping[str, float],
    safe_weights: Mapping[str, float],
) -> tuple[float, float, float]:
    risky = return_matrix[list(risky_weights)].dot(pd.Series(risky_weights, dtype=float))
    safe = return_matrix[list(safe_weights)].dot(pd.Series(safe_weights, dtype=float))
    portfolios = pd.DataFrame({"risky": risky, "safe": safe}).dropna(how="any")
    cov = cov_ledoit_wolf(portfolios) * _periods_per_year(portfolios.index)

    sigma_risky = float(np.sqrt(max(cov.loc["risky", "risky"], 0.0)))
    sigma_safe = float(np.sqrt(max(cov.loc["safe", "safe"], 0.0)))
    if sigma_risky == 0.0 or sigma_safe == 0.0:
        rho = 0.0
    else:
        rho = float(cov.loc["risky", "safe"] / (sigma_risky * sigma_safe))
        rho = min(1.0, max(-1.0, rho))
    return sigma_risky, sigma_safe, rho


def build_target_weights(risk_profile: Any, universe: Any, prices: Any) -> TargetWeights:
    """Build TargetWeights per docs/greenlight/05 §2.6 and §4."""

    bucket_matrix = _bucket_returns(universe, prices)
    risky_buckets = [
        str(bucket)
        for bucket in getattr(universe, "risky_buckets", getattr(universe, "risky_sleeves", []))
        if str(bucket) in bucket_matrix.columns
    ]
    if not risky_buckets:
        raise ValueError("Universe must include at least one risky bucket.")
    risky_matrix = bucket_matrix[risky_buckets]
    risky_weights = erc_weights(risky_matrix)
    # Gamma-modulated momentum/volatility tilt over the risky buckets: aggressive
    # profiles rotate toward higher-momentum/higher-vol buckets (scaling down
    # low-vol gold); the most conservative profile leaves ERC weights unchanged.
    risky_weights = momentum_vol_tilt(
        risky_weights,
        risky_matrix,
        _gamma_mid(risk_profile),
        lookback_months=TILT_LOOKBACK_MONTHS,
        lam=TILT_LAMBDA,
    )
    risky_weights = _satellite_capped_risky_weights(risky_weights, universe)
    safe_weights = {
        bucket: weight
        for bucket, weight in _safe_bucket_weights(universe).items()
        if bucket in bucket_matrix.columns
    }
    if not safe_weights:
        raise ValueError("Universe must include at least one safe bucket.")
    safe_weights = _normalized(safe_weights)
    sigma_risky, sigma_safe, rho = _portfolio_vols_and_corr(
        bucket_matrix,
        risky_weights,
        safe_weights,
    )

    alpha_star = solve_blend_alpha(
        sigma_risky=sigma_risky,
        sigma_safe=sigma_safe,
        rho=rho,
        sigma_target=_target_vol_mid(risk_profile),
    )
    age = int(_get_attr_or_key(risk_profile, "age", GLIDE_BASE_AGE))
    horizon = int(
        _get_attr_or_key(
            risk_profile,
            "horizon_years",
            _get_attr_or_key(risk_profile, "horizon", 0),
        )
    )
    alpha_final = alpha_star * glide_factor(age=age, horizon=horizon)

    by_bucket: dict[str, float] = {}
    for bucket, weight in risky_weights.items():
        by_bucket[bucket] = alpha_final * weight
    for bucket, weight in safe_weights.items():
        by_bucket[bucket] = (1.0 - alpha_final) * weight
    by_bucket = _normalized(by_bucket)

    bucket_sleeves = _bucket_to_sleeve(universe)
    by_sleeve: dict[str, float] = {str(sleeve): 0.0 for sleeve in universe.sleeves}
    for bucket, bucket_weight in by_bucket.items():
        sleeve = bucket_sleeves.get(str(bucket), str(bucket))
        by_sleeve[sleeve] = by_sleeve.get(sleeve, 0.0) + bucket_weight
    by_sleeve = _normalized(by_sleeve)

    by_ticker: dict[str, float] = {}
    for bucket, bucket_weight in by_bucket.items():
        tickers = list(universe.buckets[bucket])
        ticker_weight = bucket_weight / len(tickers)
        for ticker in tickers:
            by_ticker[ticker] = by_ticker.get(ticker, 0.0) + ticker_weight
    by_ticker = _normalized(by_ticker)

    return TargetWeights(
        by_ticker=by_ticker,
        by_sleeve=by_sleeve,
        by_bucket=by_bucket,
        blend_alpha=float(alpha_final),
        method="erc",
    )
