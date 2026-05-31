from __future__ import annotations

from types import SimpleNamespace

from data.loaders import load_prices, load_universe, returns_matrix
from data.seed import seed_database
from optimizer.blend import build_target_weights


def test_safe_sleeve_is_cash_like_only():
    universe = load_universe(["none"])

    assert universe.safe_sleeves == ["cash_like"]
    assert set(universe.safe_buckets) == {"us_cash", "us_treasury_short"}
    assert set(universe.risky_sleeves) >= {
        "core_bonds",
        "credit",
        "duration_hedge",
        "inflation",
    }


def test_seeded_safe_sleeve_realized_vol_is_low():
    safe_returns = returns_matrix(["cash_like"])["cash_like"]

    annualized_vol = float(safe_returns.std(ddof=0) * (252 ** 0.5))

    assert annualized_vol < 0.06


def test_moderate_target_keeps_meaningful_risky_weight():
    universe = load_universe(["none"])
    risk_profile = SimpleNamespace(
        target_vol_band=SimpleNamespace(mid=0.145),
        age=35,
        horizon_years=30,
    )

    weights = build_target_weights(risk_profile, universe, load_prices())
    risky_total = sum(weights.by_bucket.get(bucket, 0.0) for bucket in universe.risky_buckets)

    assert weights.blend_alpha > 0.30
    assert risky_total > 0.30


def test_missing_market_weights_do_not_dominate_explicit_bucket_weights(tmp_path, monkeypatch):
    db_url = f"sqlite:///{tmp_path / 'weights.db'}"
    prices = tmp_path / "prices.csv"
    prices.write_text("date,ticker,adj_close\n")
    instruments = [
        {
            "ticker": "AAA",
            "name": "Core Fund",
            "asset_class": "equity",
            "bucket": "core",
            "region": "us",
            "size": "large",
            "style": "blend",
            "underlying_index": "Core Index",
            "issuer": "Issuer",
            "quote_type": "ETF",
            "sleeve": "us_equity",
            "role": "risky",
            "market_weight": 0.2,
            "fossil_fuels": None,
            "weapons": None,
            "tobacco": None,
            "gambling": None,
        },
        {
            "ticker": "BBB",
            "name": "Unweighted Satellite",
            "asset_class": "equity",
            "bucket": "satellite_one",
            "region": "us",
            "size": "large",
            "style": "growth",
            "underlying_index": "Satellite Index",
            "issuer": "Issuer",
            "quote_type": "ETF",
            "sleeve": "us_equity",
            "role": "risky",
            "market_weight": None,
            "fossil_fuels": None,
            "weapons": None,
            "tobacco": None,
            "gambling": None,
        },
        {
            "ticker": "CCC",
            "name": "Second Unweighted Satellite",
            "asset_class": "equity",
            "bucket": "satellite_two",
            "region": "us",
            "size": "large",
            "style": "value",
            "underlying_index": "Satellite Index",
            "issuer": "Issuer",
            "quote_type": "ETF",
            "sleeve": "us_equity",
            "role": "risky",
            "market_weight": None,
            "fossil_fuels": None,
            "weapons": None,
            "tobacco": None,
            "gambling": None,
        },
    ]
    seed_database(db_url, prices_path=prices, instruments=instruments)
    monkeypatch.setenv("GREENLIGHT_DB_URL", db_url)

    universe = load_universe(["none"])

    assert universe.bucket_market_weights == {"core": 1.0}
    assert "satellite_one" not in universe.bucket_market_weights
    assert "satellite_two" not in universe.bucket_market_weights
    assert max(universe.bucket_market_weights.values()) == 1.0
