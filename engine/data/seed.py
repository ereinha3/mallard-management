"""Seed a Greenlight SQLite database.

Instrument taxonomy comes from the version-controlled `universe_seed` config
(the DB is the runtime store; that module is the single source of truth).
Synthetic prices for deterministic tests come from the bundled prices.csv;
live prices/macro are ingested separately via `ingest/refresh.py`.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

from data import universe_seed
from data.db import Instrument, InstrumentMeta, MacroSeries, Price, create_all, drop_all, get_session

DATA_DIR = Path(__file__).resolve().parent
PRICES_PATH = DATA_DIR / "prices.csv"
ESG_COLUMNS = universe_seed.ESG_COLUMNS


def _instrument_rows() -> list[dict[str, Any]]:
    """Instrument rows (primaries + ESG alternates) from the seed config."""

    return universe_seed.instrument_rows()


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
    instruments: list[dict[str, Any]] | None = None,
    reset: bool = True,
) -> None:
    """Create and seed a DB: universe from the seed config, synthetic prices from CSV.

    Pass ``instruments`` (a list of Instrument-shaped dicts) to inject a custom
    universe for tests instead of the bundled seed config.
    """

    if reset:
        drop_all(db_url)
    create_all(db_url)

    price_rows = _price_rows(prices_path)
    instruments = list(instruments) if instruments is not None else _instrument_rows()
    inception = universe_seed.inception_dates()
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
                    inception_date=inception.get(row["ticker"]),
                )
            )
        for row in _risk_free_rows(row["date"] for row in price_rows):
            session.merge(MacroSeries(**row))
        session.commit()


if __name__ == "__main__":
    seed_database()
