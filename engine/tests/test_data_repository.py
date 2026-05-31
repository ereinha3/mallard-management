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

    assert len(universe.tickers) == 95
    assert {"VOO", "XLK", "XLF", "AGG", "SGOL", "VNQI"}.issubset(set(universe.tickers))
    assert {"XLK", "VGT"}.issubset(set(universe.sleeves["us_equity"]))
    assert len(universe.buckets) == 55
    assert set(universe.buckets["gold"]) == {"GLD", "SGOL"}
    # Sharpe-audit remediation: only genuine cash/short-duration is the safe
    # (CAL risk-free) leg; reclassified bonds (core_bonds/credit/duration_hedge/
    # inflation) are now risky diversifiers.
    assert set(universe.risky_sleeves) == {
        "us_equity", "intl_equity", "reits", "real_assets",
        "core_bonds", "credit", "duration_hedge", "inflation",
    }
    assert set(universe.safe_sleeves) == {"cash_like"}
    assert len(universe.risky_buckets) == 53
    assert len(universe.safe_buckets) == 2
    assert "gold" in universe.risky_buckets
    assert set(universe.safe_buckets) == {"us_cash", "us_treasury_short"}
    assert "us_aggregate" in universe.risky_buckets
    assert abs(sum(universe.market_weights.values()) - 1.0) < 1e-9
    assert abs(sum(universe.bucket_market_weights.values()) - 1.0) < 1e-9


def test_repository_ticker_mappings_include_alternates():
    sleeves = repository.ticker_to_sleeve()
    buckets = repository.ticker_to_bucket()

    assert sleeves["VTI"] == "us_equity"
    assert sleeves["ESGV"] == "us_equity"
    assert buckets["BND"] == "us_aggregate"
