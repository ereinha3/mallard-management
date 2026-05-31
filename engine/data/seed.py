"""Seed a Greenlight SQLite database from the bundled synthetic CSV data."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

from data.db import Instrument, InstrumentMeta, MacroSeries, Price, create_all, drop_all, get_session

DATA_DIR = Path(__file__).resolve().parent
PRICES_PATH = DATA_DIR / "prices.csv"
CLASSIFICATION_PATH = DATA_DIR / "classification.csv"
UNIVERSE_PATH = CLASSIFICATION_PATH
ESG_COLUMNS = ("fossil_fuels", "weapons", "tobacco", "gambling")

SLEEVE_METADATA = {
    "us_equity": {"asset_class": "equity", "region": "us", "size": "large", "style": "blend"},
    "intl_equity": {"asset_class": "equity", "region": "developed_intl", "size": "large", "style": "blend"},
    "reits": {"asset_class": "real_estate", "region": "us", "size": "na", "style": "na"},
    "gold": {"asset_class": "commodity", "region": "global", "size": "na", "style": "na"},
    "bonds": {"asset_class": "bond", "region": "us", "size": "na", "style": "na"},
    "tips": {"asset_class": "bond", "region": "us", "size": "na", "style": "na"},
}

TICKER_METADATA = {
    "VTI": {"underlying_index": "CRSP US Total Market", "issuer": "Vanguard"},
    "ESGV": {"underlying_index": "FTSE US All Cap Choice", "issuer": "Vanguard"},
    "VEA": {"underlying_index": "FTSE Developed ex US", "issuer": "Vanguard"},
    "ESGD": {"underlying_index": "MSCI EAFE ESG Focus", "issuer": "iShares"},
    "VNQ": {"underlying_index": "MSCI US Investable Market Real Estate 25/50", "issuer": "Vanguard"},
    "GLD": {"underlying_index": "LBMA Gold Price PM", "issuer": "SPDR"},
    "BND": {"underlying_index": "Bloomberg US Aggregate Float Adjusted", "issuer": "Vanguard"},
    "TIP": {"underlying_index": "Bloomberg US Treasury Inflation-Linked Bond", "issuer": "iShares"},
}


def _clean(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


def _date(value: Any) -> date:
    return pd.to_datetime(value).date()


def _instrument_defaults(ticker: str, sleeve: str) -> dict[str, Any]:
    metadata = SLEEVE_METADATA.get(sleeve, {})
    ticker_metadata = TICKER_METADATA.get(ticker, {})
    return {
        "ticker": ticker,
        "asset_class": metadata.get("asset_class", sleeve),
        "bucket": sleeve,
        "region": metadata.get("region", "na"),
        "size": metadata.get("size", "na"),
        "style": metadata.get("style", "na"),
        "underlying_index": ticker_metadata.get("underlying_index", f"{ticker} synthetic index"),
        "issuer": ticker_metadata.get("issuer", "synthetic"),
        "quote_type": "ETF",
        "sleeve": sleeve,
    }


def _sleeve(record: dict[str, Any]) -> str:
    explicit = _clean(record.get("sleeve"))
    if explicit:
        return str(explicit)
    asset_class = str(_clean(record.get("asset_class")) or "").lower()
    region = str(_clean(record.get("region")) or "").lower()
    bucket = str(_clean(record.get("bucket")) or "").lower()
    if asset_class == "equity":
        return "intl_equity" if region in {"developed_intl", "em", "international"} else "us_equity"
    if asset_class == "bond":
        return "tips" if "tips" in bucket or "inflation" in bucket else "bonds"
    if asset_class == "commodity":
        return "gold"
    if asset_class == "real_estate":
        return "reits"
    return str(_clean(record.get("asset_class")) or "us_equity")


def _role(sleeve: str, record: dict[str, Any]) -> str:
    explicit = _clean(record.get("role"))
    if explicit:
        return str(explicit)
    return "safe" if sleeve in {"bonds", "tips"} else "risky"


def _market_weight(value: Any) -> float | None:
    cleaned = _clean(value)
    return None if cleaned is None else float(cleaned)


def _instrument_rows(universe_path: Path) -> list[dict[str, Any]]:
    universe = pd.read_csv(universe_path).fillna("")
    rows: dict[str, dict[str, Any]] = {}

    for record in universe.to_dict("records"):
        ticker = str(record["ticker"]).strip()
        if not ticker:
            continue
        sleeve = _sleeve(record)
        row = _instrument_defaults(ticker, sleeve)
        row.update(
            {
                "asset_class": _clean(record.get("asset_class")) or row["asset_class"],
                "bucket": _clean(record.get("bucket")) or row["bucket"],
                "region": _clean(record.get("region")) or row["region"],
                "size": _clean(record.get("size")) or row["size"],
                "style": _clean(record.get("style")) or row["style"],
                "underlying_index": _clean(record.get("underlying_index")) or row["underlying_index"],
                "issuer": _clean(record.get("issuer")) or row["issuer"],
                "quote_type": _clean(record.get("quote_type")) or row["quote_type"],
                "sleeve": sleeve,
                "role": _role(sleeve, record),
                "market_weight": _market_weight(record.get("market_weight")),
                **{column: _clean(record.get(column)) for column in ESG_COLUMNS},
            }
        )
        rows[ticker] = row

        for column in ESG_COLUMNS:
            replacement = _clean(record.get(column))
            if not replacement or replacement == ticker:
                continue
            replacement_ticker = str(replacement)
            alternate = _instrument_defaults(replacement_ticker, sleeve)
            alternate.update(
                {
                    "asset_class": row["asset_class"],
                    "bucket": row["bucket"],
                    "region": row["region"],
                    "size": row["size"],
                    "style": row["style"],
                    "underlying_index": row["underlying_index"],
                    "issuer": row["issuer"],
                    "quote_type": row["quote_type"],
                    "role": "alternate",
                    "market_weight": None,
                    **{column_name: None for column_name in ESG_COLUMNS},
                }
            )
            rows.setdefault(replacement_ticker, alternate)

    return list(rows.values())


def _price_rows(prices_path: Path) -> list[dict[str, Any]]:
    prices = pd.read_csv(prices_path, parse_dates=["date"])
    if "volume" not in prices.columns:
        prices["volume"] = None
    return [
        {
            "ticker": str(row["ticker"]),
            "date": row["date"].date(),
            "adj_close": float(row["adj_close"]),
            "volume": None if pd.isna(row["volume"]) else float(row["volume"]),
        }
        for row in prices.to_dict("records")
    ]


def _risk_free_rows(price_dates: Iterable[date], annual_yield: float = 0.04) -> list[dict[str, Any]]:
    return [
        {"series_id": "DGS3MO", "date": value, "value": float(annual_yield)}
        for value in sorted(set(price_dates))
    ]


def seed_database(
    db_url: str | None = None,
    *,
    prices_path: Path = PRICES_PATH,
    universe_path: Path = UNIVERSE_PATH,
    reset: bool = True,
) -> None:
    """Create and seed a DB from bundled synthetic CSVs."""

    if reset:
        drop_all(db_url)
    create_all(db_url)

    price_rows = _price_rows(prices_path)
    instruments = _instrument_rows(universe_path)
    latest_price_date = max((row["date"] for row in price_rows), default=date.today())

    with get_session(db_url) as session:
        for row in instruments:
            session.merge(Instrument(**row))
        for row in price_rows:
            session.merge(Price(**row))
        for row in instruments:
            session.merge(
                InstrumentMeta(
                    ticker=row["ticker"],
                    as_of=latest_price_date,
                    expense_ratio=None,
                    aum=None,
                    avg_dollar_volume=None,
                    inception_date=None,
                )
            )
        for row in _risk_free_rows(row["date"] for row in price_rows):
            session.merge(MacroSeries(**row))
        session.commit()


if __name__ == "__main__":
    seed_database()
