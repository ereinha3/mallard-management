from __future__ import annotations

from io import StringIO

import pandas as pd
from sqlalchemy import func, select

from data import universe_seed
from data.db import InstrumentMeta, MacroSeries, Price, get_session
from data.ingest.fred_source import fetch_series
from data.ingest.refresh import refresh
from data.ingest.yfinance_source import fetch_prices


def test_yfinance_price_transform_handles_multi_ticker_download_frame():
    dates = pd.to_datetime(["2024-01-02", "2024-01-03"])
    columns = pd.MultiIndex.from_product([["AAA", "BBB"], ["Close", "Volume"]])
    raw = pd.DataFrame(
        [
            [10.0, 100.0, 20.0, 200.0],
            [11.0, 110.0, 21.0, 210.0],
        ],
        index=dates,
        columns=columns,
    )

    result = fetch_prices(["AAA", "BBB"], download_fn=lambda *args, **kwargs: raw)

    assert result.to_dict("records") == [
        {"date": dates[0], "ticker": "AAA", "adj_close": 10.0, "volume": 100.0},
        {"date": dates[0], "ticker": "BBB", "adj_close": 20.0, "volume": 200.0},
        {"date": dates[1], "ticker": "AAA", "adj_close": 11.0, "volume": 110.0},
        {"date": dates[1], "ticker": "BBB", "adj_close": 21.0, "volume": 210.0},
    ]


def test_fred_source_uses_injected_opener_without_network():
    def opener(url: str) -> StringIO:
        assert "DGS3MO" in url
        return StringIO("DATE,DGS3MO\n2024-01-01,5.25\n2024-01-02,.\n2024-01-03,5.20\n")

    result = fetch_series("DGS3MO", opener=opener)

    assert result["value"].tolist() == [5.25, 5.20]
    assert result["date"].dt.strftime("%Y-%m-%d").tolist() == ["2024-01-01", "2024-01-03"]


def test_refresh_sources_universe_from_seed_config():
    rows = universe_seed.instrument_rows()
    assert len(rows) >= 90
    assert {"VTI", "GLD", "BND"} <= {r["ticker"] for r in rows}
    # The seed must populate every Instrument column the schema models.
    assert {"name", "bucket", "sleeve", "role", "fossil_fuels", "weapons"} <= set(rows[0])


def test_refresh_upserts_fixture_dataframes_idempotently(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'refresh.db'}"
    expected_instruments = len(universe_seed.instrument_rows())
    prices = pd.DataFrame(
        {
            "date": pd.to_datetime(["2024-01-02", "2024-01-03", "2024-01-02"]),
            "ticker": ["AAA", "AAA", "BBB"],
            "adj_close": [10.0, 11.0, 20.0],
            "volume": [1000.0, 2000.0, 3000.0],
        }
    )
    meta = pd.DataFrame(
        {
            "ticker": ["AAA", "BBB"],
            "expense_ratio": [0.001, 0.002],
            "aum": [100_000_000.0, 200_000_000.0],
            "avg_dollar_volume": [None, None],
            "inception_date": [pd.Timestamp("2020-01-01").date(), pd.Timestamp("2021-01-01").date()],
            "quote_type": ["ETF", "ETF"],
        }
    )
    macro = pd.DataFrame({"date": pd.to_datetime(["2024-01-02"]), "value": [5.0]})

    for _ in range(2):
        summary = refresh(
            db_url=db_url,
            price_fetcher=lambda tickers: prices,
            meta_fetcher=lambda tickers: meta,
            fred_fetcher=lambda series_id: macro,
        )

    assert summary == {
        "instruments": expected_instruments,
        "prices": 3,
        "instrument_meta": 2,
        "macro_series": 1,
    }
    with get_session(db_url) as session:
        assert session.scalar(select(func.count()).select_from(Price)) == 3
        assert session.scalar(select(func.count()).select_from(MacroSeries)) == 1
        aaa_meta = session.get(InstrumentMeta, {"ticker": "AAA", "as_of": pd.Timestamp("2024-01-03").date()})
        assert aaa_meta is not None
        assert aaa_meta.avg_dollar_volume == 16000.0
