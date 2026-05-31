"""yfinance-backed ingestion adapter.

The yfinance import is intentionally lazy so the core engine imports without
the optional ingest dependency installed.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from datetime import datetime
from typing import Any

import pandas as pd


def _as_list(tickers: Iterable[str]) -> list[str]:
    return [str(ticker) for ticker in tickers]


def _field(frame: pd.DataFrame, name: str) -> pd.Series:
    if name in frame.columns:
        return frame[name]
    if name == "Close" and "Adj Close" in frame.columns:
        return frame["Adj Close"]
    raise KeyError(f"yfinance frame is missing {name!r}")


def _single_ticker_frame(raw: pd.DataFrame, ticker: str) -> pd.DataFrame:
    frame = raw.copy()
    frame = frame.reset_index().rename(columns={"index": "date", "Date": "date"})
    return pd.DataFrame(
        {
            "date": pd.to_datetime(frame["date"]),
            "ticker": ticker,
            "adj_close": _field(frame, "Close").astype(float),
            "volume": _field(frame, "Volume").astype(float),
        }
    )


def _multi_ticker_frame(raw: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if ticker in raw.columns.get_level_values(0):
        frame = raw[ticker]
    elif ticker in raw.columns.get_level_values(1):
        frame = raw.xs(ticker, axis=1, level=1)
    else:
        return pd.DataFrame(columns=["date", "ticker", "adj_close", "volume"])
    return _single_ticker_frame(frame, ticker)


def fetch_prices(
    tickers: Iterable[str],
    period: str = "max",
    *,
    download_fn: Callable[..., pd.DataFrame] | None = None,
) -> pd.DataFrame:
    """Fetch yfinance daily prices as date/ticker/adj_close/volume rows."""

    ticker_list = _as_list(tickers)
    if not ticker_list:
        return pd.DataFrame(columns=["date", "ticker", "adj_close", "volume"])
    if download_fn is None:
        import yfinance as yf

        download_fn = yf.download

    raw = download_fn(
        ticker_list,
        period=period,
        interval="1d",
        auto_adjust=True,
        group_by="ticker",
        progress=False,
    )
    if raw is None or raw.empty:
        return pd.DataFrame(columns=["date", "ticker", "adj_close", "volume"])

    if isinstance(raw.columns, pd.MultiIndex):
        frames = [_multi_ticker_frame(raw, ticker) for ticker in ticker_list]
        result = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    else:
        result = _single_ticker_frame(raw, ticker_list[0])

    if result.empty:
        return pd.DataFrame(columns=["date", "ticker", "adj_close", "volume"])
    return (
        result.dropna(subset=["date", "ticker", "adj_close"])
        .sort_values(["date", "ticker"])
        .reset_index(drop=True)
    )


def _epoch_date(value: Any) -> pd.Timestamp | None:
    if value in (None, "") or pd.isna(value):
        return None
    if isinstance(value, (datetime, pd.Timestamp)):
        return pd.to_datetime(value)
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return pd.to_datetime(value)
    return pd.to_datetime(numeric, unit="s")


def fetch_meta(
    tickers: Iterable[str],
    *,
    info_provider: Callable[[str], Mapping[str, Any]] | None = None,
) -> pd.DataFrame:
    """Fetch yfinance ETF metadata in the selection_meta shape."""

    ticker_list = _as_list(tickers)
    if info_provider is None:
        import yfinance as yf

        def info_provider(ticker: str) -> Mapping[str, Any]:
            return yf.Ticker(ticker).info

    rows = []
    for ticker in ticker_list:
        info = dict(info_provider(ticker) or {})
        inception = _epoch_date(info.get("fundInceptionDate"))
        expense_ratio = info.get("netExpenseRatio", info.get("annualReportExpenseRatio"))
        rows.append(
            {
                "ticker": ticker,
                "expense_ratio": None if expense_ratio in ("", None) else expense_ratio,
                "aum": info.get("totalAssets"),
                "avg_dollar_volume": None,
                "inception_date": None if inception is None else inception.date(),
                "quote_type": info.get("quoteType"),
            }
        )
    return pd.DataFrame(
        rows,
        columns=[
            "ticker",
            "expense_ratio",
            "aum",
            "avg_dollar_volume",
            "inception_date",
            "quote_type",
        ],
    )

