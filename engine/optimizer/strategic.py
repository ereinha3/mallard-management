"""Strategic model-portfolio glidepath for the Greenlight allocator."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

import pandas as pd
from pydantic import ValidationError

from data.loaders import _theme_terms
from schemas.constants import GAMMA_MAX, GAMMA_MIN
from schemas.models import TargetWeights

CONSERVATIVE_ALLOCATION = {
    "equity": 0.13,
    "bonds": 0.59,
    "gold": 0.18,
    "cash": 0.10,
}
AGGRESSIVE_ALLOCATION = {
    "equity": 0.63,
    "bonds": 0.19,
    "gold": 0.18,
    "cash": 0.00,
}
EQUITY_SPLIT = {
    "us_equity": 0.60,
    "intl_dev": 0.30,
    "em": 0.10,
}
CORE_BUILDING_BLOCKS = {
    "us_equity": ("VTI", "us_total_market", ("ITOT", "VOO", "ESGV")),
    "intl_dev": ("VEA", "intl_developed", ("IEFA", "ESGD")),
    "em": ("VWO", "em_broad", ("IEMG", "ESGE")),
    "bonds": ("AGG", "us_aggregate", ("BND",)),
    "gold": ("GLD", "gold", ("SGOL",)),
    "cash": ("BIL", "us_cash", ("SHY", "VGSH")),
}
CASH_FALLBACK_BUCKETS = ("us_treasury_short",)
NEGATIVE_THEME_WORDS = ("avoid", "exclude", "away", "underweight")
TILT_PER_THEME_CAP = 0.05
TILT_TOTAL_CAP = 0.15


def _get_attr_or_key(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _target_vol_mid(risk_profile: Any) -> float:
    target_vol_band = _get_attr_or_key(risk_profile, "target_vol_band")
    if target_vol_band is None:
        raise ValueError("risk_profile.target_vol_band is required")
    return float(_get_attr_or_key(target_vol_band, "mid"))


def _clip(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return min(high, max(low, float(value)))


def _capacity_cap(risk_profile: Any) -> float | None:
    """Return a simple capacity-based upper bound for the glidepath score.

    Capacity is a hard constraint, not a return preference. If present, a low
    capacity score or conservative capacity gamma caps the strategic risk score
    at a moderate level; absent capacity fields leave the target-vol score alone.
    """

    capacity_score = _get_attr_or_key(risk_profile, "capacity_score")
    if capacity_score is not None:
        return 0.35 + 0.65 * _clip(float(capacity_score))

    capacity_gamma = _get_attr_or_key(risk_profile, "capacity_gamma")
    if capacity_gamma is not None:
        gamma_span = max(GAMMA_MAX - GAMMA_MIN, 1e-12)
        gamma_score = 1.0 - (float(capacity_gamma) - GAMMA_MIN) / gamma_span
        return max(0.35, _clip(gamma_score))

    binding_axis = str(_get_attr_or_key(risk_profile, "binding_axis", "") or "").lower()
    if "capacity" in binding_axis:
        return 0.50

    return None


def risk_score_from_profile(risk_profile: Any) -> float:
    """Map target volatility to a strategic glidepath score in [0, 1]."""

    score = _clip((_target_vol_mid(risk_profile) - 0.05) / (0.18 - 0.05))
    cap = _capacity_cap(risk_profile)
    if cap is not None:
        score = min(score, cap)
    return score


def _priced_tickers(prices: Any | None, universe: Any) -> set[str]:
    if prices is None:
        return {str(ticker) for ticker in getattr(universe, "tickers", [])}
    if not isinstance(prices, pd.DataFrame):
        prices = pd.DataFrame(prices)
    if {"ticker", "adj_close"}.issubset(prices.columns):
        available = prices.loc[prices["adj_close"].notna(), "ticker"]
        return {str(ticker) for ticker in available}

    wide = prices.copy()
    if "date" in wide.columns:
        wide = wide.set_index("date")
    return {str(column) for column in wide.columns if wide[column].notna().any()}


def _ticker_maps(universe: Any) -> tuple[dict[str, str], dict[str, str]]:
    ticker_to_sleeve: dict[str, str] = {}
    for sleeve, tickers in getattr(universe, "sleeves", {}).items():
        for ticker in tickers:
            ticker_to_sleeve.setdefault(str(ticker), str(sleeve))

    ticker_to_bucket: dict[str, str] = {}
    for bucket, tickers in getattr(universe, "buckets", {}).items():
        for ticker in tickers:
            ticker_to_bucket.setdefault(str(ticker), str(bucket))

    return ticker_to_sleeve, ticker_to_bucket


def _replacement_for(universe: Any, ticker: str) -> str | None:
    for item in getattr(universe, "excluded", []) or []:
        original = str(_get_attr_or_key(item, "ticker", ""))
        replacement = str(_get_attr_or_key(item, "replacement", "") or "")
        if original == ticker and replacement:
            return replacement
    return None


def _bucket_candidates(universe: Any, bucket: str) -> list[str]:
    return [str(ticker) for ticker in getattr(universe, "buckets", {}).get(bucket, [])]


def _sleeve_candidates(universe: Any, sleeve: str) -> list[str]:
    return [str(ticker) for ticker in getattr(universe, "sleeves", {}).get(sleeve, [])]


def _ordered_unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value not in seen:
            ordered.append(value)
            seen.add(value)
    return ordered


def _resolve_core_ticker(
    sleeve: str,
    universe: Any,
    priced: set[str],
) -> tuple[str, str]:
    default, bucket, fallbacks = CORE_BUILDING_BLOCKS[sleeve]
    universe_tickers = {str(ticker) for ticker in getattr(universe, "tickers", [])}
    bucket_names = [bucket]
    if sleeve == "cash":
        bucket_names.extend(CASH_FALLBACK_BUCKETS)

    candidates = [default]
    replacement = _replacement_for(universe, default)
    if replacement:
        candidates.append(replacement)
    candidates.extend(fallbacks)
    for bucket_name in bucket_names:
        candidates.extend(_bucket_candidates(universe, bucket_name))

    # Last resort: stay inside the same actual sleeve if a bucket-level match is
    # unavailable in a reduced universe.
    target_sleeves = {
        "intl_dev": "intl_equity",
        "em": "intl_equity",
        "bonds": "core_bonds",
        "gold": "real_assets",
        "cash": "cash_like",
    }
    candidates.extend(_sleeve_candidates(universe, target_sleeves.get(sleeve, sleeve)))

    for ticker in _ordered_unique([str(candidate) for candidate in candidates]):
        if ticker in universe_tickers and ticker in priced:
            ticker_to_bucket = _ticker_maps(universe)[1]
            return ticker, ticker_to_bucket.get(ticker, bucket)

    for ticker in _ordered_unique([str(candidate) for candidate in candidates]):
        if ticker in universe_tickers:
            ticker_to_bucket = _ticker_maps(universe)[1]
            return ticker, ticker_to_bucket.get(ticker, bucket)

    raise ValueError(f"Universe must include a priced ticker for strategic sleeve {sleeve!r}.")


def _normalize(weights: Mapping[str, float]) -> dict[str, float]:
    cleaned = {str(key): max(float(value), 0.0) for key, value in weights.items()}
    total = float(sum(cleaned.values()))
    if total <= 0.0:
        raise ValueError("weights must have positive total")
    return {key: value / total for key, value in cleaned.items() if value > 0.0}


def _interpolated_sleeve_weights(score: float) -> dict[str, float]:
    total_equity = (
        CONSERVATIVE_ALLOCATION["equity"]
        + score * (AGGRESSIVE_ALLOCATION["equity"] - CONSERVATIVE_ALLOCATION["equity"])
    )
    weights = {
        sleeve: total_equity * split
        for sleeve, split in EQUITY_SPLIT.items()
    }
    for sleeve in ("bonds", "gold", "cash"):
        weights[sleeve] = (
            CONSERVATIVE_ALLOCATION[sleeve]
            + score * (AGGRESSIVE_ALLOCATION[sleeve] - CONSERVATIVE_ALLOCATION[sleeve])
        )
    return _normalize(weights)


def _theme_is_negative(theme: str) -> bool:
    normalized = str(theme or "").lower()
    return any(word in normalized for word in NEGATIVE_THEME_WORDS)


def _matches_term(value: str, term: str) -> bool:
    normalized_value = value.lower().replace("-", "_")
    normalized_term = term.lower().replace("-", "_")
    if "_" in normalized_term:
        return normalized_term in normalized_value
    return re.search(rf"\b{re.escape(normalized_term)}\b", normalized_value.replace("_", " ")) is not None


def _matching_theme_buckets(universe: Any, theme: str) -> list[str]:
    _, terms = _theme_terms(str(theme))
    if not terms:
        return []

    matches: list[str] = []
    ticker_to_sleeve, _ = _ticker_maps(universe)
    for bucket, tickers in getattr(universe, "buckets", {}).items():
        haystack_parts = [str(bucket), *[str(ticker) for ticker in tickers]]
        haystack_parts.extend(ticker_to_sleeve.get(str(ticker), "") for ticker in tickers)
        haystack = " ".join(haystack_parts)
        if any(_matches_term(haystack, term) for term in terms):
            matches.append(str(bucket))
    return matches


def _allocate_bucket_overlay(
    by_ticker: dict[str, float],
    universe: Any,
    priced: set[str],
    bucket: str,
    weight: float,
) -> None:
    tickers = [
        ticker
        for ticker in _bucket_candidates(universe, bucket)
        if ticker in priced
    ] or _bucket_candidates(universe, bucket)
    if not tickers:
        return
    per_ticker = weight / len(tickers)
    for ticker in tickers:
        by_ticker[ticker] = by_ticker.get(ticker, 0.0) + per_ticker


def _remove_bucket_weight(by_ticker: dict[str, float], universe: Any, bucket: str) -> float:
    removed = 0.0
    for ticker in _bucket_candidates(universe, bucket):
        removed += by_ticker.pop(ticker, 0.0)
    return removed


def _apply_preference_overlay(
    by_ticker: dict[str, float],
    core_tickers: Mapping[str, str],
    risk_profile: Any,
    universe: Any,
    priced: set[str],
) -> dict[str, float]:
    themes = list(_get_attr_or_key(risk_profile, "sector_theme_tilts", []) or [])
    if not themes:
        return by_ticker

    result = dict(by_ticker)
    us_core = core_tickers["us_equity"]
    total_tilt = 0.0
    negative_buckets: set[str] = set()

    for theme in themes:
        matching_buckets = _matching_theme_buckets(universe, str(theme))
        if not matching_buckets:
            continue
        if _theme_is_negative(str(theme)):
            negative_buckets.update(matching_buckets)
            continue

        matching_buckets = [bucket for bucket in matching_buckets if bucket not in negative_buckets]
        if not matching_buckets:
            continue
        available = max(result.get(us_core, 0.0), 0.0)
        tilt = min(TILT_PER_THEME_CAP, TILT_TOTAL_CAP - total_tilt, available)
        if tilt <= 0.0:
            continue
        result[us_core] = available - tilt
        per_bucket = tilt / len(matching_buckets)
        for bucket in matching_buckets:
            _allocate_bucket_overlay(result, universe, priced, bucket, per_bucket)
        total_tilt += tilt

    removed = 0.0
    for bucket in negative_buckets:
        removed += _remove_bucket_weight(result, universe, bucket)
    if removed > 0.0:
        result[us_core] = result.get(us_core, 0.0) + removed

    return _normalize(result)


def _aggregate_by(
    by_ticker: Mapping[str, float],
    ticker_mapping: Mapping[str, str],
) -> dict[str, float]:
    result: dict[str, float] = {}
    for ticker, weight in by_ticker.items():
        group = ticker_mapping.get(ticker)
        if group is None:
            continue
        result[group] = result.get(group, 0.0) + float(weight)
    return _normalize(result)


def _target_weights_construct(
    *,
    by_ticker: dict[str, float],
    by_sleeve: dict[str, float],
    by_bucket: dict[str, float],
    blend_alpha: float,
    method: str,
) -> TargetWeights:
    try:
        return TargetWeights(
            by_ticker=by_ticker,
            by_sleeve=by_sleeve,
            by_bucket=by_bucket,
            blend_alpha=blend_alpha,
            method=method,
        )
    except ValidationError:
        if method != "strategic":
            raise
        # schemas.models.TargetWeights has not yet widened its method literal.
        # Keep the exact object shape while avoiding an out-of-scope schema edit.
        return TargetWeights.model_construct(
            by_ticker=by_ticker,
            by_sleeve=by_sleeve,
            by_bucket=by_bucket,
            blend_alpha=blend_alpha,
            method=method,
        )


def strategic_target_weights(risk_profile: Any, universe: Any, prices: Any | None = None) -> TargetWeights:
    """Build a focused strategic portfolio with personalization overlays."""

    priced = _priced_tickers(prices, universe)
    sleeve_weights = _interpolated_sleeve_weights(risk_score_from_profile(risk_profile))

    core_tickers: dict[str, str] = {}
    by_ticker: dict[str, float] = {}
    for sleeve, weight in sleeve_weights.items():
        ticker, _bucket = _resolve_core_ticker(sleeve, universe, priced)
        core_tickers[sleeve] = ticker
        by_ticker[ticker] = by_ticker.get(ticker, 0.0) + weight

    by_ticker = _apply_preference_overlay(
        _normalize(by_ticker),
        core_tickers,
        risk_profile,
        universe,
        priced,
    )

    ticker_to_sleeve, ticker_to_bucket = _ticker_maps(universe)
    by_sleeve = _aggregate_by(by_ticker, ticker_to_sleeve)
    by_bucket = _aggregate_by(by_ticker, ticker_to_bucket)
    blend_alpha = by_sleeve.get("us_equity", 0.0) + by_sleeve.get("intl_equity", 0.0)

    return _target_weights_construct(
        by_ticker=by_ticker,
        by_sleeve=by_sleeve,
        by_bucket=by_bucket,
        blend_alpha=_clip(blend_alpha),
        method="strategic",
    )
