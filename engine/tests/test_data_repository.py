from __future__ import annotations

from data import repository
from data.loaders import load_universe


def test_repository_reads_seeded_prices_instruments_and_macro_series():
    prices = repository.prices_long(["VTI"])
    instruments = repository.instruments()
    macro = repository.macro_series("DGS3MO")

    assert set(prices.columns) == {"date", "ticker", "adj_close", "volume"}
    assert prices["ticker"].unique().tolist() == ["VTI"]
    assert {"VTI", "ESGV", "BND"}.issubset(set(instruments["ticker"]))
    assert not macro.empty
    assert macro["value"].iloc[0] == 0.04


def test_load_universe_is_db_backed_and_preserves_esg_substitutions():
    universe = load_universe(["fossil_fuels"])

    assert "ESGV" in universe.tickers
    assert "ESGD" in universe.tickers
    assert "VTI" not in universe.tickers
    assert "VEA" not in universe.tickers
    assert abs(sum(universe.market_weights.values()) - 1.0) < 1e-9


def test_load_universe_uses_full_classification_source():
    universe = load_universe(["none"])

    assert len(universe.tickers) == 61
    assert {"VOO", "XLK", "XLF", "AGG", "SGOL", "VNQI"}.issubset(set(universe.tickers))
    assert {"XLK", "VGT"}.issubset(set(universe.sleeves["us_equity"]))
    assert set(universe.risky_sleeves) == {"us_equity", "intl_equity", "reits", "gold"}
    assert set(universe.safe_sleeves) == {"bonds", "tips"}
    assert abs(sum(universe.market_weights.values()) - 1.0) < 1e-9


def test_repository_ticker_mappings_include_alternates():
    sleeves = repository.ticker_to_sleeve()
    buckets = repository.ticker_to_bucket()

    assert sleeves["VTI"] == "us_equity"
    assert sleeves["ESGV"] == "us_equity"
    assert buckets["BND"] == "us_aggregate"
