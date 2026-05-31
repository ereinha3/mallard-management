"""yfinance-backed ingestion adapter.

The yfinance import is intentionally lazy so the core engine imports without
the optional ingest dependency installed.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from datetime import datetime
import logging
import time
from typing import Any

import pandas as pd

LOGGER = logging.getLogger(__name__)

PRICE_COLUMNS = ["date", "ticker", "adj_close", "volume"]
META_COLUMNS = [
    "ticker",
    "expense_ratio",
    "aum",
    "avg_dollar_volume",
    "inception_date",
    "quote_type",
    "shares_outstanding",
]


def _as_list(tickers: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for ticker in tickers:
        value = str(ticker).strip()
        if value and value not in seen:
            result.append(value)
            seen.add(value)
    return result


def _empty_prices() -> pd.DataFrame:
    return pd.DataFrame(columns=PRICE_COLUMNS)


def _empty_meta() -> pd.DataFrame:
    return pd.DataFrame(columns=META_COLUMNS)


def _field(frame: pd.DataFrame, name: str, *, required: bool = True) -> pd.Series:
    if name in frame.columns:
        return frame[name]
    if name == "Close" and "Adj Close" in frame.columns:
        return frame["Adj Close"]
    if required:
        raise KeyError(f"yfinance frame is missing {name!r}")
    return pd.Series(pd.NA, index=frame.index)


def _price_field_columns(columns: pd.Index) -> list[Any]:
    fields = {"Open", "High", "Low", "Close", "Adj Close", "Volume"}
    result = []
    for column in columns:
        if isinstance(column, tuple):
            match = next((part for part in column if part in fields), column[-1])
            result.append(match)
        else:
            result.append(column)
    return result


def _single_ticker_frame(raw: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if raw is None or raw.empty:
        return _empty_prices()
    frame = raw.copy()
    if isinstance(frame.columns, pd.MultiIndex):
        frame.columns = _price_field_columns(frame.columns)
    frame = frame.reset_index().rename(columns={"index": "date", "Date": "date"})
    if "date" not in frame.columns:
        LOGGER.warning("Skipping %s: yfinance frame does not include a date index/column", ticker)
        return _empty_prices()
    try:
        adj_close = pd.to_numeric(_field(frame, "Close"), errors="coerce")
    except KeyError as exc:
        LOGGER.warning("Skipping %s: %s", ticker, exc)
        return _empty_prices()
    volume = pd.to_numeric(_field(frame, "Volume", required=False), errors="coerce")
    return pd.DataFrame(
        {
            "date": pd.to_datetime(frame["date"]),
            "ticker": ticker,
            "adj_close": adj_close,
            "volume": volume,
        }
    )


def _multi_ticker_frame(raw: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if not isinstance(raw.columns, pd.MultiIndex):
        return _single_ticker_frame(raw, ticker)
    for level in range(raw.columns.nlevels):
        if ticker in raw.columns.get_level_values(level):
            frame = raw.xs(ticker, axis=1, level=level, drop_level=True)
            return _single_ticker_frame(frame, ticker)
    return _empty_prices()


def _chunks(values: list[str], size: int) -> Iterable[list[str]]:
    size = max(1, int(size))
    for start in range(0, len(values), size):
        yield values[start : start + size]


def _with_retries(
    call: Callable[[], pd.DataFrame | Mapping[str, Any]],
    label: str,
    *,
    retries: int,
    sleep_seconds: float,
    backoff: float,
) -> pd.DataFrame | Mapping[str, Any]:
    last_error: Exception | None = None
    attempts = max(1, int(retries) + 1)
    for attempt in range(attempts):
        try:
            return call()
        except Exception as exc:  # pragma: no cover - exercised with real network failures
            last_error = exc
            if attempt == attempts - 1:
                break
            delay = max(0.0, sleep_seconds) * (max(1.0, backoff) ** attempt)
            LOGGER.warning("%s failed on attempt %s/%s: %s", label, attempt + 1, attempts, exc)
            if delay:
                time.sleep(delay)
    assert last_error is not None
    raise last_error


def _download_prices(
    ticker_batch: list[str],
    *,
    period: str,
    download_fn: Callable[..., pd.DataFrame],
) -> pd.DataFrame:
    return download_fn(
        ticker_batch,
        period=period,
        interval="1d",
        auto_adjust=True,
        group_by="ticker",
        progress=False,
        threads=False,
    )


def _prices_from_raw(raw: pd.DataFrame | None, tickers: list[str]) -> pd.DataFrame:
    if raw is None or raw.empty:
        return _empty_prices()
    if isinstance(raw.columns, pd.MultiIndex):
        frames = [_multi_ticker_frame(raw, ticker) for ticker in tickers]
        return pd.concat(frames, ignore_index=True) if frames else _empty_prices()
    if len(tickers) != 1:
        LOGGER.warning("Received single-index yfinance frame for a multi-ticker batch: %s", ",".join(tickers))
    return _single_ticker_frame(raw, tickers[0])


def fetch_prices(
    tickers: Iterable[str],
    period: str = "max",
    *,
    download_fn: Callable[..., pd.DataFrame] | None = None,
    batch_size: int = 20,
    retries: int = 3,
    sleep_seconds: float = 0.75,
    backoff: float = 2.0,
) -> pd.DataFrame:
    """Fetch yfinance daily prices as date/ticker/adj_close/volume rows."""

    ticker_list = _as_list(tickers)
    if not ticker_list:
        return _empty_prices()
    injected_download = download_fn is not None
    if download_fn is None:
        import yfinance as yf

        download_fn = yf.download
    effective_sleep = 0.0 if injected_download else sleep_seconds

    frames: list[pd.DataFrame] = []
    for batch in _chunks(ticker_list, batch_size):
        try:
            raw = _with_retries(
                lambda batch=batch: _download_prices(batch, period=period, download_fn=download_fn),
                f"yfinance price download {','.join(batch)}",
                retries=retries,
                sleep_seconds=effective_sleep,
                backoff=backoff,
            )
            batch_frame = _prices_from_raw(raw if isinstance(raw, pd.DataFrame) else None, batch)
        except Exception as exc:  # pragma: no cover - exercised with real network failures
            LOGGER.warning("Batch price download failed for %s: %s", ",".join(batch), exc)
            batch_frame = _empty_prices()

        present = set(batch_frame["ticker"].dropna()) if not batch_frame.empty else set()
        missing = [ticker for ticker in batch if ticker not in present]
        if missing and len(batch) > 1:
            LOGGER.warning("Retrying %s ticker(s) individually after missing batch data: %s", len(missing), missing)
            for ticker in missing:
                try:
                    raw = _with_retries(
                        lambda ticker=ticker: _download_prices([ticker], period=period, download_fn=download_fn),
                        f"yfinance price download {ticker}",
                        retries=retries,
                        sleep_seconds=effective_sleep,
                        backoff=backoff,
                    )
                    single_frame = _prices_from_raw(raw if isinstance(raw, pd.DataFrame) else None, [ticker])
                    if single_frame.empty:
                        LOGGER.warning("No yfinance price data returned for %s", ticker)
                    else:
                        frames.append(single_frame)
                except Exception as exc:  # pragma: no cover - exercised with real network failures
                    LOGGER.warning("Skipping %s after failed yfinance price download: %s", ticker, exc)
            if not batch_frame.empty:
                frames.append(batch_frame[~batch_frame["ticker"].isin(missing)])
        elif not batch_frame.empty:
            frames.append(batch_frame)

        if effective_sleep and len(ticker_list) > batch_size:
            time.sleep(effective_sleep)

    result = pd.concat(frames, ignore_index=True) if frames else _empty_prices()
    if result.empty:
        return _empty_prices()
    return (
        result.dropna(subset=["date", "ticker", "adj_close"])
        .drop_duplicates(subset=["date", "ticker"], keep="last")
        .sort_values(["date", "ticker"])
        .reset_index(drop=True)
    )


def _epoch_date(value: Any) -> pd.Timestamp | None:
    if value is None or value == "":
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, (datetime, pd.Timestamp)):
        return pd.to_datetime(value)
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return pd.to_datetime(value)
    return pd.to_datetime(numeric, unit="s")


def _first(info: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = info.get(key)
        if value is None:
            continue
        if isinstance(value, str) and value == "":
            continue
        return value
    return None


def _numeric(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, str) and value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(number):
        return None
    return number


def _computed_aum(info: Mapping[str, Any], price: float | None) -> float | None:
    explicit = _numeric(_first(info, "totalAssets", "totalAsset", "fundTotalAssets"))
    if explicit is not None:
        return explicit
    shares = _numeric(_first(info, "sharesOutstanding", "impliedSharesOutstanding"))
    if shares is None or price is None:
        return None
    return shares * price


def fetch_meta(
    tickers: Iterable[str],
    *,
    info_provider: Callable[[str], Mapping[str, Any]] | None = None,
    retries: int = 2,
    sleep_seconds: float = 0.25,
    backoff: float = 2.0,
) -> pd.DataFrame:
    """Fetch yfinance ETF metadata in the selection_meta shape."""

    ticker_list = _as_list(tickers)
    if not ticker_list:
        return _empty_meta()
    injected_provider = info_provider is not None
    if info_provider is None:
        import yfinance as yf

        def info_provider(ticker: str) -> Mapping[str, Any]:
            return yf.Ticker(ticker).info

    effective_sleep = 0.0 if injected_provider else sleep_seconds
    rows = []
    for ticker in ticker_list:
        try:
            payload = _with_retries(
                lambda ticker=ticker: info_provider(ticker) or {},
                f"yfinance metadata {ticker}",
                retries=retries,
                sleep_seconds=effective_sleep,
                backoff=backoff,
            )
            info = dict(payload)
        except Exception as exc:  # pragma: no cover - exercised with real network failures
            LOGGER.warning("Skipping yfinance metadata for %s after retries: %s", ticker, exc)
            info = {}
        inception = _epoch_date(info.get("fundInceptionDate"))
        expense_ratio = _numeric(_first(info, "netExpenseRatio", "annualReportExpenseRatio"))
        price = _numeric(_first(info, "navPrice", "regularMarketPrice", "previousClose"))
        average_volume = _numeric(_first(info, "averageVolume", "averageDailyVolume10Day"))
        shares = _numeric(_first(info, "sharesOutstanding", "impliedSharesOutstanding"))
        rows.append(
            {
                "ticker": ticker,
                "expense_ratio": expense_ratio,
                "aum": _computed_aum(info, price),
                "avg_dollar_volume": None if average_volume is None or price is None else average_volume * price,
                "inception_date": None if inception is None else inception.date(),
                "quote_type": info.get("quoteType"),
                "shares_outstanding": shares,
            }
        )
        if effective_sleep:
            time.sleep(effective_sleep)
    return pd.DataFrame(rows, columns=META_COLUMNS)
