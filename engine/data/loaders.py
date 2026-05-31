"""Data loaders for docs/greenlight/05-contracts.md §§5 and 8."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from pathlib import Path

import pandas as pd

from data import repository
from schemas.models import EsgExclusion, ExcludedTicker, Sleeve, Universe

DATA_DIR = Path(__file__).resolve().parent
UNIVERSE_PATH = DATA_DIR / "universe.csv"
PRICES_PATH = DATA_DIR / "prices.csv"

RISKY_SLEEVES: list[Sleeve] = ["us_equity", "intl_equity", "reits", "gold"]
SAFE_SLEEVES: list[Sleeve] = ["bonds", "tips"]
ESG_COLUMNS = ("fossil_fuels", "weapons", "tobacco", "gambling")


def load_prices() -> pd.DataFrame:
    """Load cached prices in the docs/greenlight/05 §8 long shape."""

    prices = repository.prices_long()
    columns = ["date", "ticker", "adj_close"]
    if "volume" in prices.columns and prices["volume"].notna().any():
        columns.append("volume")
    return prices[columns].sort_values(["date", "ticker"]).reset_index(drop=True)


def latest_prices(tickers: Iterable[str] | None = None) -> dict[str, float]:
    """Return the latest committed cached price for each requested ticker."""

    return repository.latest_prices(tickers)


def load_universe(esg_exclusions: Iterable[EsgExclusion] | None = None) -> Universe:
    """Build a Universe from docs/greenlight/05 §5, applying ESG substitutions."""

    exclusions = [ex for ex in (esg_exclusions or []) if ex != "none"]
    rows = repository.instruments().fillna("")
    if rows.empty:
        raise ValueError("instrument universe is empty")
    primary = rows[rows["role"].isin(["risky", "safe"])]
    if primary.empty:
        primary = rows
    sleeves: dict[Sleeve, list[str]] = {}
    market_weights: dict[Sleeve, float] = {}
    excluded: list[ExcludedTicker] = []

    for row in primary.to_dict("records"):
        sleeve = str(row.get("sleeve") or repository.SLEEVE_BY_ASSET_CLASS.get(str(row.get("asset_class")), row.get("asset_class")))
        ticker = str(row["ticker"])
        for exclusion in exclusions:
            replacement = str(row.get(exclusion, "")).strip()
            if replacement and replacement != ticker:
                excluded.append(ExcludedTicker(ticker=ticker, reason=exclusion))
                ticker = replacement
                break
        sleeves.setdefault(sleeve, []).append(ticker)
        weight = row.get("market_weight", "")
        if weight == "":
            market_weights.setdefault(sleeve, 1.0)
        else:
            market_weights[sleeve] = float(weight)

    tickers = sorted({ticker for tickers_for_sleeve in sleeves.values() for ticker in tickers_for_sleeve})
    total_weight = sum(market_weights.values())
    if total_weight <= 0:
        equal_weight = 1.0 / len(market_weights)
        market_weights = {sleeve: equal_weight for sleeve in market_weights}
    elif abs(total_weight - 1.0) > 1e-12:
        market_weights = {sleeve: weight / total_weight for sleeve, weight in market_weights.items()}
    return Universe(
        tickers=tickers,
        sleeves=sleeves,
        risky_sleeves=RISKY_SLEEVES,
        safe_sleeves=SAFE_SLEEVES,
        market_weights=market_weights,
        excluded=excluded,
    )


def returns_matrix(sleeves: Iterable[Sleeve] | Mapping[Sleeve, Iterable[str]]) -> pd.DataFrame:
    """Return daily sleeve returns for docs/greenlight/05 §§4-5 sleeve names."""

    if isinstance(sleeves, Mapping):
        sleeve_to_tickers = {sleeve: list(tickers) for sleeve, tickers in sleeves.items()}
    else:
        universe = load_universe(["none"])
        sleeve_to_tickers = {sleeve: universe.sleeves[sleeve] for sleeve in sleeves}

    prices = load_prices().pivot(index="date", columns="ticker", values="adj_close").sort_index()
    returns = prices.pct_change().dropna(how="all")
    matrix = pd.DataFrame(index=returns.index)
    for sleeve, tickers in sleeve_to_tickers.items():
        available = [ticker for ticker in tickers if ticker in returns.columns]
        if not available:
            raise KeyError(f"No cached prices available for sleeve {sleeve!r}")
        matrix[sleeve] = returns[available].mean(axis=1)
    return matrix.dropna(how="any")


def sleeve_returns(weights: Mapping[Sleeve, float]) -> pd.Series:
    """Combine sleeve returns under docs/greenlight/05 §2.6 sleeve weights."""

    matrix = returns_matrix(weights.keys())
    aligned = pd.Series(weights, dtype=float).reindex(matrix.columns).fillna(0.0)
    return matrix.dot(aligned)
