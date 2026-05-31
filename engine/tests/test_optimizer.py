from types import SimpleNamespace

import numpy as np
import pandas as pd

from data.seed import seed_database
from data.loaders import bucket_returns, load_prices, returns_matrix
from optimizer.blend import build_target_weights, glide_factor, solve_blend_alpha
from optimizer.erc import (
    cov_ledoit_wolf,
    erc_weights,
    ledoit_wolf_shrinkage_delta,
    risk_contributions,
)
from universe.builder import build_universe


def test_universe_builder_applies_esg_substitutions_and_contract_weights():
    universe = build_universe(SimpleNamespace(esg_exclusions=["fossil_fuels"]))

    assert {"ESGV", "ESGD", "ESGU", "ESGE"} <= set(universe.tickers)
    assert "VTI" not in universe.tickers
    assert "VEA" not in universe.tickers
    assert set(universe.risky_buckets) >= {"us_total_market", "intl_developed", "gold", "us_reit"}
    assert set(universe.safe_buckets) >= {"us_aggregate", "us_tips"}
    assert set(universe.buckets["us_total_market"]) == {"ESGV", "ITOT"}
    assert set(universe.buckets["intl_developed"]) == {"ESGD", "IEFA"}
    assert abs(sum(universe.market_weights.values()) - 1.0) < 1e-6
    assert abs(sum(universe.bucket_market_weights.values()) - 1.0) < 1e-6
    # Every fossil-fuel-flagged primary is substituted out.
    assert {item.ticker for item in universe.excluded} == {
        "VTI", "VOO", "VEA", "VWO", "IEMG", "XLE", "VDE"
    }


def test_universe_builder_honors_sector_theme_tilts_without_changing_optimizer_math():
    universe = build_universe(
        SimpleNamespace(
            universe_pref="etf",
            esg_exclusions=["none"],
            sector_theme_tilts=["technology"],
        )
    )

    assert set(universe.buckets["us_sector_tech"]) == {"XLK", "VGT"}
    assert set(universe.sleeves["us_equity"]) == {"XLK", "VGT"}
    assert "XLF" not in universe.tickers
    assert "BND" in universe.sleeves["bonds"]
    assert abs(sum(universe.market_weights.values()) - 1.0) < 1e-6


def test_universe_builder_honors_universe_pref_quote_type(tmp_path, monkeypatch):
    db_url = f"sqlite:///{tmp_path / 'universe-pref.db'}"
    instruments = [
        {"ticker": "AAA", "name": "AAA Fund", "asset_class": "equity", "bucket": "broad",
         "region": "us", "size": "large", "style": "blend", "underlying_index": "AAA Index",
         "issuer": "Issuer A", "quote_type": "ETF", "sleeve": "us_equity", "role": "risky",
         "market_weight": 1.0, "fossil_fuels": None, "weapons": None, "tobacco": None, "gambling": None},
        {"ticker": "BBB", "name": "BBB Fund", "asset_class": "equity", "bucket": "broad",
         "region": "us", "size": "large", "style": "blend", "underlying_index": "BBB Index",
         "issuer": "Issuer B", "quote_type": "stock", "sleeve": "us_equity", "role": "risky",
         "market_weight": 1.0, "fossil_fuels": None, "weapons": None, "tobacco": None, "gambling": None},
    ]
    prices = tmp_path / "prices.csv"
    prices.write_text("date,ticker,adj_close\n")
    seed_database(db_url, prices_path=prices, instruments=instruments)
    monkeypatch.setenv("GREENLIGHT_DB_URL", db_url)

    etf_universe = build_universe({"universe_pref": "etf"})
    stock_universe = build_universe({"universe_pref": "stock"})
    mixed_universe = build_universe({"universe_pref": "mix"})

    assert etf_universe.tickers == ["AAA"]
    assert stock_universe.tickers == ["BBB"]
    assert mixed_universe.tickers == ["AAA", "BBB"]


def test_cov_ledoit_wolf_returns_labeled_dataframe():
    returns = returns_matrix(["us_total_market", "intl_developed", "us_reit", "gold"])

    cov = cov_ledoit_wolf(returns)

    assert isinstance(cov, pd.DataFrame)
    assert list(cov.index) == list(returns.columns)
    assert list(cov.columns) == list(returns.columns)


def test_ledoit_wolf_delta_is_data_derived_and_covariance_is_psd():
    returns = returns_matrix(["us_total_market", "intl_developed", "us_reit", "gold"])
    stressed = returns.copy()
    stressed.iloc[0, 0] *= 5.0

    delta = ledoit_wolf_shrinkage_delta(returns)
    stressed_delta = ledoit_wolf_shrinkage_delta(stressed)
    cov = cov_ledoit_wolf(returns)
    eigenvalues = np.linalg.eigvalsh(cov.to_numpy(dtype=float))

    assert 0.0 < delta < 1.0
    assert 0.0 < cov.attrs["ledoit_wolf_delta"] < 1.0
    assert abs(delta - stressed_delta) > 1e-6
    assert abs(delta - 0.2) > 1e-3
    assert np.allclose(cov, cov.T, atol=1e-12)
    assert float(eigenvalues.min()) >= -1e-10


def test_erc_risk_contributions_are_equal():
    returns = returns_matrix(["us_total_market", "intl_developed", "us_reit", "gold"])

    weights = erc_weights(returns)
    rc = risk_contributions(weights, cov_ledoit_wolf(returns))

    assert abs(sum(weights.values()) - 1.0) < 1e-9
    assert min(weights.values()) > 0.0
    assert max(rc) - min(rc) < 1e-3


def test_cal_blend_hits_target_vol():
    alpha = solve_blend_alpha(
        sigma_risky=0.16,
        sigma_safe=0.05,
        rho=0.15,
        sigma_target=0.145,
    )

    assert 0.89 <= alpha <= 0.91


def test_clamp_when_target_exceeds_risky():
    assert solve_blend_alpha(0.16, 0.05, 0.15, 0.20) == 1.0


def test_glide_factor_reduces_alpha_with_age():
    assert glide_factor(age=28, horizon=37) > glide_factor(age=60, horizon=5)


def test_build_target_weights_sums_to_one():
    universe = build_universe(SimpleNamespace(esg_exclusions=["none"]))
    risk_profile = SimpleNamespace(
        target_vol_band=SimpleNamespace(mid=0.145),
        age=28,
        horizon_years=37,
    )

    weights = build_target_weights(risk_profile, universe, load_prices())

    assert weights.method == "erc"
    assert 0.0 <= weights.blend_alpha <= 1.0
    assert abs(sum(weights.by_ticker.values()) - 1.0) < 1e-6
    assert abs(sum(weights.by_sleeve.values()) - 1.0) < 1e-6
    assert abs(sum(weights.by_bucket.values()) - 1.0) < 1e-6
    assert set(weights.by_bucket) >= set(universe.risky_buckets)
    assert set(weights.by_bucket) >= set(universe.safe_buckets)
    assert weights.by_bucket["gold"] < 0.35


def test_loaders_expose_bucket_returns_for_price_backed_buckets():
    returns = bucket_returns(["us_total_market", "intl_developed", "us_aggregate", "gold"])

    assert list(returns.columns) == ["us_total_market", "intl_developed", "us_aggregate", "gold"]
    assert not returns.empty
