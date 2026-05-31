"""Data loaders for docs/greenlight/05-contracts.md §§5 and 8."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from pathlib import Path

import pandas as pd

from data import repository
from schemas.models import EsgExclusion, ExcludedTicker, Sleeve, Universe

DATA_DIR = Path(__file__).resolve().parent
CLASSIFICATION_PATH = DATA_DIR / "classification.csv"
UNIVERSE_PATH = CLASSIFICATION_PATH
PRICES_PATH = DATA_DIR / "prices.csv"

RISKY_SLEEVES: list[Sleeve] = ["us_equity", "intl_equity", "reits", "gold"]
SAFE_SLEEVES: list[Sleeve] = ["bonds", "tips"]
ESG_COLUMNS = ("fossil_fuels", "weapons", "tobacco", "gambling")
ETF_NAME_OVERRIDES = {
    "VTI": "Vanguard Total Stock Market ETF",
    "ITOT": "iShares Core S&P Total U.S. Stock Market ETF",
    "VOO": "Vanguard S&P 500 ETF",
    "SCHX": "Schwab U.S. Large-Cap ETF",
    "VTV": "Vanguard Value ETF",
    "IVE": "iShares S&P 500 Value ETF",
    "VUG": "Vanguard Growth ETF",
    "IVW": "iShares S&P 500 Growth ETF",
    "VO": "Vanguard Mid-Cap ETF",
    "IJH": "iShares Core S&P Mid-Cap ETF",
    "VB": "Vanguard Small-Cap ETF",
    "IJR": "iShares Core S&P Small-Cap ETF",
    "VBR": "Vanguard Small-Cap Value ETF",
    "IJS": "iShares S&P Small-Cap 600 Value ETF",
    "XLK": "Technology Select Sector SPDR Fund",
    "VGT": "Vanguard Information Technology ETF",
    "XLF": "Financial Select Sector SPDR Fund",
    "VFH": "Vanguard Financials ETF",
    "XLV": "Health Care Select Sector SPDR Fund",
    "VHT": "Vanguard Health Care ETF",
    "XLE": "Energy Select Sector SPDR Fund",
    "VDE": "Vanguard Energy ETF",
    "XLI": "Industrial Select Sector SPDR Fund",
    "VIS": "Vanguard Industrials ETF",
    "XLY": "Consumer Discretionary Select Sector SPDR Fund",
    "VCR": "Vanguard Consumer Discretionary ETF",
    "XLP": "Consumer Staples Select Sector SPDR Fund",
    "VDC": "Vanguard Consumer Staples ETF",
    "XLU": "Utilities Select Sector SPDR Fund",
    "VPU": "Vanguard Utilities ETF",
    "XLB": "Materials Select Sector SPDR Fund",
    "VAW": "Vanguard Materials ETF",
    "XLC": "Communication Services Select Sector SPDR Fund",
    "VOX": "Vanguard Communication Services ETF",
    "VEA": "Vanguard FTSE Developed Markets ETF",
    "IEFA": "iShares Core MSCI EAFE ETF",
    "EFV": "iShares MSCI EAFE Value ETF",
    "SCZ": "iShares MSCI EAFE Small-Cap ETF",
    "VWO": "Vanguard FTSE Emerging Markets ETF",
    "IEMG": "iShares Core MSCI Emerging Markets ETF",
    "SHY": "iShares 1-3 Year Treasury Bond ETF",
    "VGSH": "Vanguard Short-Term Treasury ETF",
    "IEF": "iShares 7-10 Year Treasury Bond ETF",
    "VGIT": "Vanguard Intermediate-Term Treasury ETF",
    "TLT": "iShares 20+ Year Treasury Bond ETF",
    "VGLT": "Vanguard Long-Term Treasury ETF",
    "BND": "Vanguard Total Bond Market ETF",
    "AGG": "iShares Core U.S. Aggregate Bond ETF",
    "LQD": "iShares iBoxx $ Investment Grade Corporate Bond ETF",
    "VCIT": "Vanguard Intermediate-Term Corporate Bond ETF",
    "HYG": "iShares iBoxx $ High Yield Corporate Bond ETF",
    "JNK": "SPDR Bloomberg High Yield Bond ETF",
    "MUB": "iShares National Muni Bond ETF",
    "VTEB": "Vanguard Tax-Exempt Bond ETF",
    "TIP": "iShares TIPS Bond ETF",
    "VTIP": "Vanguard Short-Term Inflation-Protected Securities ETF",
    "GLD": "SPDR Gold Shares",
    "SGOL": "abrdn Physical Gold Shares ETF",
    "VNQ": "Vanguard Real Estate ETF",
    "SCHH": "Schwab U.S. REIT ETF",
    "VNQI": "Vanguard Global ex-U.S. Real Estate ETF",
    "ESGV": "Vanguard ESG U.S. Stock ETF",
    "ESGD": "iShares ESG Aware MSCI EAFE ETF",
}

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
    "bonds": ("bond", "bonds", "fixed_income", "treasury", "corporate", "muni"),
    "tips": ("tips", "inflation", "inflation_protected"),
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
    return any(term in haystack for term in terms)


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


def _classification_names() -> dict[str, str]:
    if not CLASSIFICATION_PATH.exists():
        return {}
    try:
        frame = pd.read_csv(CLASSIFICATION_PATH).fillna("")
    except Exception:
        return {}
    if "name" not in frame.columns:
        return {}
    return {
        str(row["ticker"]).strip(): str(row["name"]).strip()
        for row in frame.to_dict("records")
        if str(row.get("ticker", "")).strip() and str(row.get("name", "")).strip()
    }


def ticker_metadata() -> dict[str, dict[str, str]]:
    """Return ticker metadata from classification data with static ETF name fallbacks."""

    names = {**ETF_NAME_OVERRIDES, **_classification_names()}
    rows = repository.instruments().fillna("")
    metadata: dict[str, dict[str, str]] = {}
    for row in rows.to_dict("records"):
        ticker = str(row["ticker"])
        sleeve = str(row.get("sleeve") or repository.SLEEVE_BY_ASSET_CLASS.get(str(row.get("asset_class")), ""))
        name = names.get(ticker)
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
    market_weights: dict[Sleeve, float] = {}
    excluded: list[ExcludedTicker] = []

    for row in primary.to_dict("records"):
        sleeve = str(row.get("sleeve") or repository.SLEEVE_BY_ASSET_CLASS.get(str(row.get("asset_class")), row.get("asset_class")))
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
