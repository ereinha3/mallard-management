"""Refresh the Greenlight DB from classification, yfinance, and FRED sources."""

from __future__ import annotations

import argparse
import logging
from collections.abc import Callable, Iterable
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import func, select

from data.db import Instrument, InstrumentMeta, MacroSeries, Price, create_all, get_session
from data.ingest.fred_source import fetch_series as fetch_fred_series
from data.ingest.yfinance_source import fetch_meta as fetch_yfinance_meta
from data.ingest.yfinance_source import fetch_prices as fetch_yfinance_prices
from data.seed import DATA_DIR, ESG_COLUMNS

DEFAULT_TICKERS_FROM = DATA_DIR / "universe.csv"
DEFAULT_RISK_FREE_SERIES = "DGS3MO"


def _clean(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


def _date(value: Any) -> date | None:
    value = _clean(value)
    if value is None:
        return None
    return pd.to_datetime(value).date()


def _sleeve(row: dict[str, Any]) -> str | None:
    explicit = _clean(row.get("sleeve"))
    if explicit:
        return str(explicit)
    asset_class = str(_clean(row.get("asset_class")) or "").lower()
    region = str(_clean(row.get("region")) or "").lower()
    bucket = str(_clean(row.get("bucket")) or "").lower()
    if asset_class == "equity":
        return "intl_equity" if region in {"developed_intl", "em", "international"} else "us_equity"
    if asset_class == "bond":
        return "tips" if "tips" in bucket or "inflation" in bucket else "bonds"
    if asset_class == "commodity":
        return "gold" if "gold" in bucket else "gold"
    if asset_class == "real_estate":
        return "reits"
    return None


def _role(sleeve: str | None, row: dict[str, Any]) -> str | None:
    explicit = _clean(row.get("role"))
    if explicit:
        return str(explicit)
    if sleeve in {"bonds", "tips"}:
        return "safe"
    if sleeve:
        return "risky"
    return None


def read_instruments(path: Path) -> pd.DataFrame:
    """Read a classification/universe CSV into instrument rows."""

    raw = pd.read_csv(path).fillna("")
    if "ticker" not in raw.columns:
        raise ValueError(f"{path} must contain a ticker column")

    rows: dict[str, dict[str, Any]] = {}
    for record in raw.to_dict("records"):
        ticker = str(record["ticker"]).strip()
        if not ticker:
            continue
        sleeve = _sleeve(record)
        bucket = _clean(record.get("bucket")) or sleeve
        row = {
            "ticker": ticker,
            "asset_class": _clean(record.get("asset_class")) or sleeve,
            "bucket": bucket,
            "region": _clean(record.get("region")),
            "size": _clean(record.get("size")),
            "style": _clean(record.get("style")),
            "underlying_index": _clean(record.get("underlying_index")),
            "issuer": _clean(record.get("issuer")),
            "quote_type": _clean(record.get("quote_type")),
            "sleeve": sleeve,
            "role": _role(sleeve, record),
            "market_weight": None if _clean(record.get("market_weight")) is None else float(record["market_weight"]),
            **{column: _clean(record.get(column)) for column in ESG_COLUMNS},
        }
        rows[ticker] = row

        for column in ESG_COLUMNS:
            replacement = _clean(record.get(column))
            if not replacement or replacement == ticker:
                continue
            rows.setdefault(
                str(replacement),
                {
                    **row,
                    "ticker": str(replacement),
                    "role": "alternate",
                    "market_weight": None,
                    **{name: None for name in ESG_COLUMNS},
                },
            )
    return pd.DataFrame(rows.values())


def compute_avg_dollar_volume(prices: pd.DataFrame, *, window: int = 63) -> pd.Series:
    """Compute trailing average dollar volume from long price rows."""

    if prices.empty or "volume" not in prices.columns:
        return pd.Series(dtype=float)
    frame = prices.copy()
    frame["date"] = pd.to_datetime(frame["date"])
    frame["volume"] = pd.to_numeric(frame["volume"], errors="coerce")
    frame["adj_close"] = pd.to_numeric(frame["adj_close"], errors="coerce")
    frame = frame.dropna(subset=["ticker", "adj_close", "volume"]).sort_values(["ticker", "date"])
    if frame.empty:
        return pd.Series(dtype=float)
    frame["dollar_volume"] = frame["volume"] * frame["adj_close"]
    return frame.groupby("ticker").tail(window).groupby("ticker")["dollar_volume"].mean()


def compute_latest_prices(prices: pd.DataFrame) -> pd.Series:
    """Return latest adjusted close per ticker from long price rows."""

    if prices.empty:
        return pd.Series(dtype=float)
    frame = prices.copy()
    frame["date"] = pd.to_datetime(frame["date"])
    frame["adj_close"] = pd.to_numeric(frame["adj_close"], errors="coerce")
    frame = frame.dropna(subset=["ticker", "date", "adj_close"]).sort_values(["ticker", "date"])
    if frame.empty:
        return pd.Series(dtype=float)
    return frame.groupby("ticker").tail(1).set_index("ticker")["adj_close"]


def upsert_instruments(session: Any, frame: pd.DataFrame) -> int:
    count = 0
    for record in frame.fillna("").to_dict("records"):
        ticker = _clean(record.get("ticker"))
        if ticker is None:
            continue
        session.merge(
            Instrument(
                ticker=str(ticker),
                asset_class=_clean(record.get("asset_class")),
                bucket=_clean(record.get("bucket")),
                region=_clean(record.get("region")),
                size=_clean(record.get("size")),
                style=_clean(record.get("style")),
                underlying_index=_clean(record.get("underlying_index")),
                issuer=_clean(record.get("issuer")),
                quote_type=_clean(record.get("quote_type")),
                sleeve=_clean(record.get("sleeve")),
                role=_clean(record.get("role")),
                market_weight=None if _clean(record.get("market_weight")) is None else float(record["market_weight"]),
                fossil_fuels=_clean(record.get("fossil_fuels")),
                weapons=_clean(record.get("weapons")),
                tobacco=_clean(record.get("tobacco")),
                gambling=_clean(record.get("gambling")),
            )
        )
        count += 1
    return count


def upsert_prices(session: Any, frame: pd.DataFrame) -> int:
    count = 0
    for record in frame.fillna("").to_dict("records"):
        ticker = _clean(record.get("ticker"))
        value = _clean(record.get("adj_close"))
        price_date = _date(record.get("date"))
        if ticker is None or value is None or price_date is None:
            continue
        session.merge(
            Price(
                ticker=str(ticker),
                date=price_date,
                adj_close=float(value),
                volume=None if _clean(record.get("volume")) is None else float(record["volume"]),
            )
        )
        count += 1
    return count


def upsert_instrument_meta(
    session: Any,
    frame: pd.DataFrame,
    *,
    avg_dollar_volume: pd.Series | None = None,
    latest_prices: pd.Series | None = None,
    as_of: date | None = None,
) -> int:
    if frame.empty:
        return 0
    count = 0
    avg_dollar_volume = avg_dollar_volume if avg_dollar_volume is not None else pd.Series(dtype=float)
    latest_prices = latest_prices if latest_prices is not None else pd.Series(dtype=float)
    as_of = as_of or date.today()
    for record in frame.fillna("").to_dict("records"):
        ticker = _clean(record.get("ticker"))
        if ticker is None:
            continue
        computed_adv = avg_dollar_volume.get(str(ticker), None)
        if computed_adv is not None and pd.isna(computed_adv):
            computed_adv = None
        explicit_adv = _clean(record.get("avg_dollar_volume"))
        explicit_aum = _clean(record.get("aum"))
        shares_outstanding = _clean(record.get("shares_outstanding"))
        computed_aum = None
        latest_price = latest_prices.get(str(ticker), None)
        if explicit_aum is None and shares_outstanding is not None and latest_price is not None and not pd.isna(latest_price):
            computed_aum = float(shares_outstanding) * float(latest_price)
        aum_value = computed_aum if explicit_aum is None else explicit_aum
        session.merge(
            InstrumentMeta(
                ticker=str(ticker),
                as_of=as_of,
                expense_ratio=None if _clean(record.get("expense_ratio")) is None else float(record["expense_ratio"]),
                aum=None if aum_value is None else float(aum_value),
                avg_dollar_volume=(
                    None
                    if computed_adv is None and explicit_adv is None
                    else float(computed_adv if computed_adv is not None else explicit_adv)
                ),
                inception_date=_date(record.get("inception_date")),
            )
        )
        quote_type = _clean(record.get("quote_type"))
        if quote_type:
            instrument = session.get(Instrument, str(ticker))
            if instrument is not None:
                instrument.quote_type = str(quote_type)
        count += 1
    return count


def upsert_macro_series(session: Any, series_id: str, frame: pd.DataFrame) -> int:
    count = 0
    for record in frame.fillna("").to_dict("records"):
        series_date = _date(record.get("date"))
        value = _clean(record.get("value"))
        if series_date is None or value is None:
            continue
        session.merge(MacroSeries(series_id=series_id, date=series_date, value=float(value)))
        count += 1
    return count


def _tickers(frame: pd.DataFrame) -> list[str]:
    return sorted({str(ticker) for ticker in frame["ticker"].dropna() if str(ticker)})


def data_quality_report(db_url: str | None = None, expected_tickers: Iterable[str] | None = None) -> dict[str, Any]:
    """Summarize DB coverage after a refresh."""

    expected = sorted({str(ticker).strip() for ticker in (expected_tickers or []) if str(ticker).strip()})
    with get_session(db_url) as session:
        table_counts = {
            "instruments": int(session.scalar(select(func.count()).select_from(Instrument)) or 0),
            "prices": int(session.scalar(select(func.count()).select_from(Price)) or 0),
            "instrument_meta": int(session.scalar(select(func.count()).select_from(InstrumentMeta)) or 0),
            "macro_series": int(session.scalar(select(func.count()).select_from(MacroSeries)) or 0),
        }
        price_rows = session.execute(
            select(Price.ticker, Price.date, Price.adj_close).order_by(Price.ticker, Price.date)
        ).mappings().all()

    prices = pd.DataFrame(price_rows)
    if prices.empty:
        missing = expected
        return {
            "table_counts": table_counts,
            "expected_tickers": len(expected),
            "tickers_with_prices": 0,
            "min_date": None,
            "max_date": None,
            "missing_price_tickers": missing,
            "missing_pct": 1.0 if expected else 0.0,
            "median_history_years": 0.0,
            "nan_adj_close": 0,
            "zero_adj_close": 0,
            "nonpositive_adj_close": 0,
        }

    prices["date"] = pd.to_datetime(prices["date"])
    prices["adj_close"] = pd.to_numeric(prices["adj_close"], errors="coerce")
    valid_prices = prices.dropna(subset=["ticker", "date", "adj_close"])
    priced = sorted({str(ticker) for ticker in valid_prices["ticker"].dropna()})
    missing = sorted(set(expected) - set(priced))
    history = valid_prices.groupby("ticker")["date"].agg(["min", "max"])
    history_years = ((history["max"] - history["min"]).dt.days / 365.25) if not history.empty else pd.Series(dtype=float)
    return {
        "table_counts": table_counts,
        "expected_tickers": len(expected),
        "tickers_with_prices": len(priced),
        "min_date": None if valid_prices.empty else valid_prices["date"].min().date().isoformat(),
        "max_date": None if valid_prices.empty else valid_prices["date"].max().date().isoformat(),
        "missing_price_tickers": missing,
        "missing_pct": (len(missing) / len(expected)) if expected else 0.0,
        "median_history_years": 0.0 if history_years.empty else float(history_years.median()),
        "nan_adj_close": int(prices["adj_close"].isna().sum()),
        "zero_adj_close": int((prices["adj_close"] == 0).sum()),
        "nonpositive_adj_close": int((prices["adj_close"] <= 0).sum()),
    }


def format_data_quality_report(report: dict[str, Any]) -> str:
    """Render a human-readable data-quality report for the refresh CLI."""

    table_counts = report["table_counts"]
    missing = report["missing_price_tickers"]
    lines = [
        "Data quality report:",
        "  table_rows: "
        + ", ".join(f"{name}={count}" for name, count in table_counts.items()),
        f"  tickers_with_prices: {report['tickers_with_prices']}/{report['expected_tickers']}",
        f"  date_range: {report['min_date']} to {report['max_date']}",
        f"  median_history_years: {report['median_history_years']:.2f}",
        f"  missing_price_tickers ({len(missing)}): {', '.join(missing) if missing else 'none'}",
        "  adj_close_quality: "
        f"nan={report['nan_adj_close']}, zero={report['zero_adj_close']}, "
        f"nonpositive={report['nonpositive_adj_close']}",
    ]
    if report["missing_pct"] > 0.10:
        lines.append(
            "  WARNING: MISSING PRICE DATA EXCEEDS 10% THRESHOLD "
            f"({report['missing_pct']:.1%})"
        )
    return "\n".join(lines)


def refresh(
    *,
    db_url: str | None = None,
    tickers_from: Path | str = DEFAULT_TICKERS_FROM,
    risk_free_series: str = DEFAULT_RISK_FREE_SERIES,
    price_fetcher: Callable[[Iterable[str]], pd.DataFrame] = fetch_yfinance_prices,
    meta_fetcher: Callable[[Iterable[str]], pd.DataFrame] = fetch_yfinance_meta,
    fred_fetcher: Callable[[str], pd.DataFrame] = fetch_fred_series,
) -> dict[str, int]:
    """Fetch source data and upsert it into the configured DB."""

    create_all(db_url)
    instrument_frame = read_instruments(Path(tickers_from))
    tickers = _tickers(instrument_frame)
    price_frame = price_fetcher(tickers)
    meta_frame = meta_fetcher(tickers)
    macro_frame = fred_fetcher(risk_free_series)
    as_of = pd.to_datetime(price_frame["date"]).max().date() if not price_frame.empty else date.today()
    avg_dollar_volume = compute_avg_dollar_volume(price_frame)
    latest_prices = compute_latest_prices(price_frame)

    with get_session(db_url) as session:
        instruments_count = upsert_instruments(session, instrument_frame)
        prices_count = upsert_prices(session, price_frame)
        meta_count = upsert_instrument_meta(
            session,
            meta_frame,
            avg_dollar_volume=avg_dollar_volume,
            latest_prices=latest_prices,
            as_of=as_of,
        )
        macro_count = upsert_macro_series(session, risk_free_series, macro_frame)
        session.commit()

    return {
        "instruments": instruments_count,
        "prices": prices_count,
        "instrument_meta": meta_count,
        "macro_series": macro_count,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Refresh the Greenlight data DB.")
    parser.add_argument("--db", dest="db_url", default=None, help="SQLAlchemy DB URL")
    parser.add_argument(
        "--tickers-from",
        type=Path,
        default=DEFAULT_TICKERS_FROM,
        help="classification/universe CSV with a ticker column",
    )
    parser.add_argument(
        "--risk-free-series",
        default=DEFAULT_RISK_FREE_SERIES,
        help="FRED series id for the risk-free rate",
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    args = build_parser().parse_args(argv)
    instrument_frame = read_instruments(args.tickers_from)
    summary = refresh(
        db_url=args.db_url,
        tickers_from=args.tickers_from,
        risk_free_series=args.risk_free_series,
    )
    print(f"Refresh summary: {summary}")
    report = data_quality_report(args.db_url, _tickers(instrument_frame))
    print(format_data_quality_report(report))


if __name__ == "__main__":
    main()
