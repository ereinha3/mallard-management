"""DB-backed read helpers for the Greenlight data layer."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

import pandas as pd
from sqlalchemy import Select, func, select

from data.db import Instrument, MacroSeries, Price, get_session

SLEEVE_BY_ASSET_CLASS = {
    "us_equity": "us_equity",
    "intl_equity": "intl_equity",
    "bonds": "bonds",
    "tips": "tips",
    "gold": "gold",
    "reits": "reits",
    "equity": "us_equity",
    "bond": "bonds",
    "commodity": "gold",
    "real_estate": "reits",
}


def _frame(statement: Select[Any]) -> pd.DataFrame:
    with get_session() as session:
        rows = session.execute(statement).mappings().all()
    return pd.DataFrame(rows)


def _normalize_dates(frame: pd.DataFrame, columns: Iterable[str] = ("date", "as_of", "inception_date")) -> pd.DataFrame:
    for column in columns:
        if column in frame.columns:
            frame[column] = pd.to_datetime(frame[column])
    return frame


def prices_long(tickers: Iterable[str] | None = None) -> pd.DataFrame:
    """Return price rows in long form: date, ticker, adj_close, volume."""

    requested = list(tickers or [])
    statement = select(
        Price.date,
        Price.ticker,
        Price.adj_close,
        Price.volume,
    )
    if requested:
        statement = statement.where(Price.ticker.in_(requested))
    statement = statement.order_by(Price.date, Price.ticker)
    frame = _frame(statement)
    if frame.empty:
        return pd.DataFrame(columns=["date", "ticker", "adj_close", "volume"])
    return _normalize_dates(frame, ("date",))


def prices_wide(tickers: Iterable[str] | None = None) -> pd.DataFrame:
    """Return adjusted close prices pivoted by ticker."""

    long = prices_long(tickers)
    if long.empty:
        return pd.DataFrame()
    return long.pivot(index="date", columns="ticker", values="adj_close").sort_index()


def latest_prices(tickers: Iterable[str] | None = None) -> dict[str, float]:
    """Return latest adjusted close by ticker."""

    requested = list(tickers or [])
    latest_date = (
        select(Price.ticker, func.max(Price.date).label("date"))
        .group_by(Price.ticker)
        .subquery()
    )
    statement = (
        select(Price.ticker, Price.adj_close)
        .join(
            latest_date,
            (Price.ticker == latest_date.c.ticker) & (Price.date == latest_date.c.date),
        )
        .order_by(Price.ticker)
    )
    if requested:
        statement = statement.where(Price.ticker.in_(requested))
    frame = _frame(statement)
    result = {
        str(row["ticker"]): float(row["adj_close"])
        for row in frame.to_dict("records")
    }
    missing = sorted(set(requested) - set(result))
    if missing:
        raise KeyError(f"No cached price available for ticker(s): {', '.join(missing)}")
    return result


def instruments() -> pd.DataFrame:
    """Return all instrument classification rows."""

    statement = select(
        Instrument.ticker,
        Instrument.name,
        Instrument.asset_class,
        Instrument.bucket,
        Instrument.region,
        Instrument.size,
        Instrument.style,
        Instrument.underlying_index,
        Instrument.issuer,
        Instrument.quote_type,
        Instrument.sleeve,
        Instrument.role,
        Instrument.market_weight,
        Instrument.fossil_fuels,
        Instrument.weapons,
        Instrument.tobacco,
        Instrument.gambling,
    ).order_by(Instrument.ticker)
    frame = _frame(statement)
    if frame.empty:
        return pd.DataFrame(
            columns=[
                "ticker",
                "name",
                "asset_class",
                "bucket",
                "region",
                "size",
                "style",
                "underlying_index",
                "issuer",
                "quote_type",
                "sleeve",
                "role",
                "market_weight",
                "fossil_fuels",
                "weapons",
                "tobacco",
                "gambling",
            ]
        )
    return frame


def buckets() -> pd.DataFrame:
    """Return distinct bucket classifications."""

    statement = (
        select(Instrument.bucket, Instrument.asset_class, Instrument.sleeve)
        .where(Instrument.bucket.is_not(None))
        .distinct()
        .order_by(Instrument.bucket)
    )
    frame = _frame(statement)
    if frame.empty:
        return pd.DataFrame(columns=["bucket", "asset_class", "sleeve"])
    return frame


def macro_series(series_id: str) -> pd.DataFrame:
    """Return a macro series as date/value rows."""

    statement = (
        select(MacroSeries.date, MacroSeries.value)
        .where(MacroSeries.series_id == series_id)
        .order_by(MacroSeries.date)
    )
    frame = _frame(statement)
    if frame.empty:
        return pd.DataFrame(columns=["date", "value"])
    return _normalize_dates(frame, ("date",))


def _row_sleeve(row: dict[str, Any]) -> str | None:
    sleeve = row.get("sleeve")
    if sleeve:
        return str(sleeve)
    asset_class = row.get("asset_class")
    if not asset_class:
        return None
    return SLEEVE_BY_ASSET_CLASS.get(str(asset_class), str(asset_class))


def ticker_to_sleeve() -> dict[str, str]:
    """Map each known ticker to its sleeve."""

    frame = instruments()
    mapping: dict[str, str] = {}
    for row in frame.to_dict("records"):
        sleeve = _row_sleeve(row)
        if sleeve is not None:
            mapping[str(row["ticker"])] = sleeve
    return mapping


def ticker_to_bucket() -> dict[str, str]:
    """Map each known ticker to its leaf bucket."""

    frame = instruments()
    mapping: dict[str, str] = {}
    for row in frame.to_dict("records"):
        bucket = row.get("bucket")
        if bucket:
            mapping[str(row["ticker"])] = str(bucket)
    return mapping

