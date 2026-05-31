"""Data loaders for docs/greenlight/05-contracts.md §§5 and 8."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from pathlib import Path

import pandas as pd

from data import repository
from schemas.models import Bucket, EsgExclusion, ExcludedTicker, Sleeve, Universe

DATA_DIR = Path(__file__).resolve().parent

RISKY_SLEEVES: list[Sleeve] = [
    "us_equity",
    "intl_equity",
    "reits",
    "gold",
    "real_assets",
    "core_bonds",
    "credit",
    "duration_hedge",
    "inflation",
]
SAFE_SLEEVES: list[Sleeve] = ["cash_like"]
ESG_COLUMNS = ("fossil_fuels", "weapons", "tobacco", "gambling")

_THEME_ALIASES = {
    "technology": ("technology", "tech", "information_technology", "us_sector_tech", "xlk", "vgt"),
    "financials": ("financial", "financials", "finance", "us_sector_financials", "xlf", "vfh"),
    "healthcare": ("health", "healthcare", "health_care", "us_sector_healthcare", "xlv", "vht"),
    "energy": ("energy", "oil", "gas", "us_sector_energy", "xle", "vde"),
    "industrials": ("industrial", "industrials", "us_sector_industrials", "xli", "vis"),
    "discretionary": ("discretionary", "consumer_discretionary", "us_sector_discretionary", "xly", "vcr"),
    "staples": ("staples", "consumer_staples", "us_sector_staples", "xlp", "vdc"),
    "utilities": ("utility", "utilities", "us_sector_utilities", "xlu", "vpu"),
    "materials": ("material", "materials", "us_sector_materials", "xlb", "vaw"),
    "communication": ("communication", "communications", "comm", "us_sector_comm", "xlc", "vox"),
    "international": ("intl", "international", "foreign", "developed_intl", "emerging", "em"),
    "reits": ("reit", "reits", "real_estate", "property"),
    "gold": ("gold", "commodity", "commodities"),
    "bonds": ("bond", "bonds", "fixed_income", "core_bonds", "treasury", "corporate", "muni"),
    "tips": ("tips", "inflation", "inflation_protected"),
    "cash_like": ("cash", "cash_like", "t_bill", "treasury_bill", "short_treasury"),
    "credit": ("credit", "corporate", "high_yield", "bank_loans", "em_bonds"),
    "duration_hedge": ("duration", "duration_hedge", "long_treasury", "intermediate_treasury"),
    "inflation": ("inflation", "tips", "inflation_protected"),
}
_NEGATIVE_THEME_WORDS = ("avoid", "exclude", "away", "underweight")


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


def _normalize_text(value: object) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def _quote_type_allowed(value: object, universe_pref: str) -> bool:
    quote_type = _normalize_text(value)
    if universe_pref == "mix":
        return True
    if universe_pref == "stock":
        return quote_type in {"stock", "common_stock", "equity"}
    return quote_type in {"", "etf"}


def _theme_terms(theme: str) -> tuple[bool, list[str]]:
    normalized = _normalize_text(theme)
    negative = any(word in normalized for word in _NEGATIVE_THEME_WORDS)
    for word in _NEGATIVE_THEME_WORDS:
        normalized = normalized.replace(word, "")
    normalized = normalized.strip("_")
    terms = list(_THEME_ALIASES.get(normalized, (normalized,)))
    return negative, [term for term in terms if term]


def _row_matches_terms(row: Mapping[str, object], terms: Iterable[str]) -> bool:
    haystack = " ".join(
        _normalize_text(row.get(column))
        for column in (
            "ticker",
            "asset_class",
            "bucket",
            "region",
            "size",
            "style",
            "underlying_index",
            "issuer",
            "quote_type",
            "sleeve",
        )
    )
    # Single-word terms match whole words only (so "tech" does not match
    # "biotechnology"); multi-word terms (e.g. "us_sector_tech") match as substrings.
    tokens = set(haystack.replace("_", " ").split())
    for term in terms:
        if "_" in term:
            if term in haystack:
                return True
        elif term in tokens:
            return True
    return False


def _ordered_role_sleeves(
    sleeves: Mapping[str, list[str]],
    sleeve_roles: Mapping[str, str],
    role: str,
    preferred_order: Iterable[Sleeve],
) -> list[Sleeve]:
    preferred = [
        sleeve
        for sleeve in preferred_order
        if sleeve in sleeves and sleeve_roles.get(str(sleeve)) == role
    ]
    extras = sorted(
        sleeve
        for sleeve in sleeves
        if sleeve_roles.get(str(sleeve)) == role and sleeve not in preferred
    )
    return [*preferred, *extras]


def _normalize_weights(
    weights: Mapping[str, float],
    fallback_keys: Iterable[str],
) -> dict[str, float]:
    explicit = {key: float(value) for key, value in weights.items() if float(value) > 0.0}
    total = sum(explicit.values())
    if total > 0.0:
        return {key: value / total for key, value in explicit.items()}

    keys = list(fallback_keys)
    if not keys:
        return {}
    equal_weight = 1.0 / len(keys)
    return {key: equal_weight for key in keys}


def _apply_theme_tilts(rows: pd.DataFrame, sector_theme_tilts: Iterable[str] | None) -> pd.DataFrame:
    result = rows
    positive: list[list[str]] = []
    for theme in sector_theme_tilts or []:
        negative, terms = _theme_terms(str(theme))
        if not terms:
            continue
        mask = result.apply(lambda row: _row_matches_terms(row, terms), axis=1)
        if negative:
            result = result.loc[~mask].copy()
        else:
            positive.append(terms)

    for terms in positive:
        mask = result.apply(lambda row: _row_matches_terms(row, terms), axis=1)
        if not bool(mask.any()):
            continue
        matching_sleeves = set(result.loc[mask, "sleeve"].dropna().astype(str))
        result = result.loc[~result["sleeve"].astype(str).isin(matching_sleeves) | mask].copy()
    return result


def ticker_metadata() -> dict[str, dict[str, str]]:
    """Return ticker metadata sourced from the DB Instrument table."""

    rows = repository.instruments().fillna("")
    metadata: dict[str, dict[str, str]] = {}
    for row in rows.to_dict("records"):
        ticker = str(row["ticker"])
        sleeve = str(row.get("sleeve") or repository.SLEEVE_BY_ASSET_CLASS.get(str(row.get("asset_class")), ""))
        name = str(row.get("name") or "").strip()
        if not name:
            issuer = str(row.get("issuer") or "").strip()
            index = str(row.get("underlying_index") or "").strip()
            name = " ".join(part for part in (issuer, index, "ETF") if part).strip() or ticker
        metadata[ticker] = {
            "ticker": ticker,
            "name": name,
            "sleeve": sleeve,
            "bucket": str(row.get("bucket") or ""),
            "quote_type": str(row.get("quote_type") or ""),
        }
    return metadata


def load_universe(
    esg_exclusions: Iterable[EsgExclusion] | None = None,
    *,
    universe_pref: str = "etf",
    sector_theme_tilts: Iterable[str] | None = None,
) -> Universe:
    """Build a Universe from classification data, applying preference filters."""

    exclusions = [ex for ex in (esg_exclusions or []) if ex != "none"]
    rows = repository.instruments().fillna("")
    if rows.empty:
        raise ValueError("instrument universe is empty")
    primary = rows[rows["role"].isin(["risky", "safe"])].copy()
    if primary.empty:
        primary = rows
    primary = primary[primary["quote_type"].apply(lambda value: _quote_type_allowed(value, universe_pref))].copy()
    primary = _apply_theme_tilts(primary, sector_theme_tilts)
    if primary.empty:
        raise ValueError("instrument universe is empty after applying preferences")
    sleeves: dict[Sleeve, list[str]] = {}
    buckets: dict[Bucket, list[str]] = {}
    bucket_roles: dict[Bucket, str] = {}
    sleeve_roles: dict[Sleeve, str] = {}
    market_weights: dict[Sleeve, float] = {}
    bucket_market_weights: dict[Bucket, float] = {}
    excluded: list[ExcludedTicker] = []

    for row in primary.to_dict("records"):
        sleeve = str(row.get("sleeve") or repository.SLEEVE_BY_ASSET_CLASS.get(str(row.get("asset_class")), row.get("asset_class")))
        bucket = str(row.get("bucket") or sleeve)
        role = str(row.get("role") or ("safe" if sleeve in SAFE_SLEEVES else "risky"))
        ticker = str(row["ticker"])
        for exclusion in exclusions:
            replacement = str(row.get(exclusion, "")).strip()
            if replacement and replacement != ticker:
                excluded.append(ExcludedTicker(ticker=ticker, reason=exclusion, replacement=replacement))
                ticker = replacement
                break
        sleeve_tickers = sleeves.setdefault(sleeve, [])
        if ticker not in sleeve_tickers:
            sleeve_tickers.append(ticker)
        bucket_tickers = buckets.setdefault(bucket, [])
        if ticker not in bucket_tickers:
            bucket_tickers.append(ticker)
        sleeve_roles[sleeve] = role
        bucket_roles[bucket] = role
        weight = row.get("market_weight", "")
        if weight != "":
            market_weights[sleeve] = market_weights.get(sleeve, 0.0) + float(weight)
            bucket_market_weights[bucket] = bucket_market_weights.get(bucket, 0.0) + float(weight)

    tickers = sorted({ticker for tickers_for_sleeve in sleeves.values() for ticker in tickers_for_sleeve})
    market_weights = _normalize_weights(market_weights, sleeves.keys())
    bucket_market_weights = _normalize_weights(bucket_market_weights, buckets.keys())
    risky_buckets = [bucket for bucket in buckets if bucket_roles.get(bucket) == "risky"]
    safe_buckets = [bucket for bucket in buckets if bucket_roles.get(bucket) == "safe"]
    risky_sleeves = _ordered_role_sleeves(sleeves, sleeve_roles, "risky", RISKY_SLEEVES)
    safe_sleeves = _ordered_role_sleeves(sleeves, sleeve_roles, "safe", SAFE_SLEEVES)
    return Universe(
        tickers=tickers,
        sleeves=sleeves,
        buckets=buckets,
        risky_sleeves=risky_sleeves,
        safe_sleeves=safe_sleeves,
        risky_buckets=risky_buckets,
        safe_buckets=safe_buckets,
        market_weights=market_weights,
        bucket_market_weights=bucket_market_weights,
        excluded=excluded,
    )


def returns_matrix(groups: Iterable[str] | Mapping[str, Iterable[str]]) -> pd.DataFrame:
    """Return daily equal-weight returns for named sleeves or buckets."""

    if isinstance(groups, Mapping):
        group_to_tickers = {group: list(tickers) for group, tickers in groups.items()}
    else:
        universe = load_universe(["none"])
        group_to_tickers = {}
        for group in groups:
            if group in universe.buckets:
                group_to_tickers[group] = universe.buckets[group]
            else:
                group_to_tickers[group] = universe.sleeves[group]

    prices = load_prices().pivot(index="date", columns="ticker", values="adj_close").sort_index()
    returns = prices.pct_change().dropna(how="all")
    matrix = pd.DataFrame(index=returns.index)
    for group, tickers in group_to_tickers.items():
        available = [ticker for ticker in tickers if ticker in returns.columns]
        if not available:
            raise KeyError(f"No cached prices available for group {group!r}")
        matrix[group] = returns[available].mean(axis=1)
    return matrix.dropna(how="any")


def bucket_returns(buckets: Iterable[Bucket] | Mapping[Bucket, Iterable[str]] | None = None) -> pd.DataFrame:
    """Return daily bucket returns, equal-weighted across ETFs in each bucket."""

    if buckets is None:
        universe = load_universe(["none"])
        return returns_matrix(universe.buckets)
    return returns_matrix(buckets)


def sleeve_returns(weights: Mapping[Sleeve, float]) -> pd.Series:
    """Combine sleeve returns under docs/greenlight/05 §2.6 sleeve weights."""

    matrix = returns_matrix(weights.keys())
    aligned = pd.Series(weights, dtype=float).reindex(matrix.columns).fillna(0.0)
    return matrix.dot(aligned)
