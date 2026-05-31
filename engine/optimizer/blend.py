"""CAL blend for docs/greenlight/05 §4 and §7.3."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import numpy as np
import pandas as pd

from data.loaders import load_prices
from schemas.constants import GLIDE_BASE_AGE, GLIDE_FLOOR
from schemas.models import TargetWeights
from optimizer.erc import cov_ledoit_wolf, erc_weights


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


def _sleeve_returns(universe: Any, prices: Any | None) -> pd.DataFrame:
    ticker_returns = _ticker_returns(prices)
    sleeve_matrix = pd.DataFrame(index=ticker_returns.index)

    for sleeve, tickers in universe.sleeves.items():
        available = [ticker for ticker in tickers if ticker in ticker_returns.columns]
        if not available:
            raise KeyError(f"No cached prices available for sleeve {sleeve!r}")
        sleeve_matrix[sleeve] = ticker_returns[available].mean(axis=1)

    return sleeve_matrix.dropna(how="any")


def _normalized(weights: Mapping[str, float]) -> dict[str, float]:
    total = float(sum(weights.values()))
    if total <= 0:
        raise ValueError("weights must have positive total")
    return {key: float(value / total) for key, value in weights.items()}


def _safe_sleeve_weights(universe: Any) -> dict[str, float]:
    weights = {
        sleeve: float(universe.market_weights.get(sleeve, 0.0))
        for sleeve in universe.safe_sleeves
    }
    if sum(weights.values()) <= 0:
        weights = {sleeve: 1.0 for sleeve in universe.safe_sleeves}
    return _normalized(weights)


def _periods_per_year(index: Any) -> float:
    try:
        dates = pd.to_datetime(index)
        span_days = max((dates.max() - dates.min()).days, 1)
        return float((len(dates) - 1) * 365.25 / span_days)
    except Exception:
        return 252.0


def _portfolio_vols_and_corr(
    sleeve_matrix: pd.DataFrame,
    risky_weights: Mapping[str, float],
    safe_weights: Mapping[str, float],
) -> tuple[float, float, float]:
    risky = sleeve_matrix[list(risky_weights)].dot(pd.Series(risky_weights, dtype=float))
    safe = sleeve_matrix[list(safe_weights)].dot(pd.Series(safe_weights, dtype=float))
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

    sleeve_matrix = _sleeve_returns(universe, prices)
    risky_matrix = sleeve_matrix[list(universe.risky_sleeves)]
    risky_weights = erc_weights(risky_matrix)
    safe_weights = _safe_sleeve_weights(universe)
    sigma_risky, sigma_safe, rho = _portfolio_vols_and_corr(
        sleeve_matrix,
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

    by_sleeve: dict[str, float] = {}
    for sleeve, weight in risky_weights.items():
        by_sleeve[sleeve] = alpha_final * weight
    for sleeve, weight in safe_weights.items():
        by_sleeve[sleeve] = (1.0 - alpha_final) * weight
    by_sleeve = _normalized(by_sleeve)

    by_ticker: dict[str, float] = {}
    for sleeve, sleeve_weight in by_sleeve.items():
        tickers = list(universe.sleeves[sleeve])
        ticker_weight = sleeve_weight / len(tickers)
        for ticker in tickers:
            by_ticker[ticker] = by_ticker.get(ticker, 0.0) + ticker_weight
    by_ticker = _normalized(by_ticker)

    return TargetWeights(
        by_ticker=by_ticker,
        by_sleeve=by_sleeve,
        blend_alpha=float(alpha_final),
        method="erc",
    )
