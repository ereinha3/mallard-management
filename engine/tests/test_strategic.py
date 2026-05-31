from types import SimpleNamespace

import pandas as pd
import pytest

from data.loaders import load_prices
from optimizer.strategic import risk_score_from_profile, strategic_target_weights
from universe.builder import build_universe


def _profile(target_vol: float = 0.145, **kwargs: object) -> SimpleNamespace:
    values = {
        "target_vol_band": SimpleNamespace(mid=target_vol),
        "age": 35,
        "horizon_years": 30,
        "sector_theme_tilts": [],
    }
    values.update(kwargs)
    return SimpleNamespace(
        **values,
    )


def _core_prices():
    prices = load_prices()
    additions = []
    for source, target in (("BND", "AGG"), ("VEA", "VWO"), ("ESGD", "ESGE")):
        if target in set(prices["ticker"]):
            continue
        copied = prices.loc[prices["ticker"] == source].copy()
        copied["ticker"] = target
        additions.append(copied)
    if additions:
        return pd.concat([prices, *additions], ignore_index=True)
    return prices


def test_strategic_core_glidepath_uses_global_core_and_sums_to_one() -> None:
    universe = build_universe(SimpleNamespace(esg_exclusions=["none"]))

    weights = strategic_target_weights(_profile(), universe, _core_prices())

    assert weights.method == "strategic"
    assert sum(weights.by_ticker.values()) == pytest.approx(1.0)
    assert sum(weights.by_sleeve.values()) == pytest.approx(1.0)
    assert sum(weights.by_bucket.values()) == pytest.approx(1.0)
    assert min(weights.by_ticker.values()) >= 0.0
    assert set(weights.by_ticker) == {"VTI", "VEA", "VWO", "AGG", "GLD", "BIL"}
    assert weights.by_bucket["us_total_market"] == pytest.approx(weights.blend_alpha * 0.60)
    assert weights.by_bucket["intl_developed"] == pytest.approx(weights.blend_alpha * 0.30)
    assert weights.by_bucket["em_broad"] == pytest.approx(weights.blend_alpha * 0.10)
    assert weights.by_bucket["gold"] == pytest.approx(0.18)


def test_strategic_honors_esg_core_substitutions() -> None:
    universe = build_universe(SimpleNamespace(esg_exclusions=["fossil_fuels"]))

    weights = strategic_target_weights(_profile(), universe, _core_prices())

    assert "VTI" not in weights.by_ticker
    assert "VEA" not in weights.by_ticker
    assert "VWO" not in weights.by_ticker
    assert {"ESGV", "ESGD", "ESGE"} <= set(weights.by_ticker)


def test_capacity_caps_risk_score_when_capacity_is_binding() -> None:
    high_tolerance = _profile(target_vol=0.18, capacity_score=0.0)
    binding_axis = _profile(target_vol=0.18, binding_axis="capacity")

    assert risk_score_from_profile(high_tolerance) == pytest.approx(0.35)
    assert risk_score_from_profile(binding_axis) == pytest.approx(0.50)


def test_positive_theme_overlay_moves_capped_slice_from_us_core() -> None:
    universe = build_universe(SimpleNamespace(esg_exclusions=["none"]))
    plain = strategic_target_weights(_profile(), universe, load_prices())
    tilted = strategic_target_weights(
        _profile(sector_theme_tilts=["technology"]),
        universe,
        load_prices(),
    )

    assert tilted.by_bucket["us_sector_tech"] == pytest.approx(0.05)
    assert tilted.by_ticker["VTI"] == pytest.approx(plain.by_ticker["VTI"] - 0.05)
    assert tilted.by_ticker["XLK"] == pytest.approx(0.025)
    assert tilted.by_ticker["VGT"] == pytest.approx(0.025)
    assert tilted.blend_alpha == pytest.approx(plain.blend_alpha)


def test_total_theme_overlay_is_capped() -> None:
    universe = build_universe(SimpleNamespace(esg_exclusions=["none"]))
    weights = strategic_target_weights(
        _profile(sector_theme_tilts=["technology", "financials", "healthcare", "energy"]),
        universe,
        load_prices(),
    )
    overlay_total = sum(
        weights.by_bucket.get(bucket, 0.0)
        for bucket in ("us_sector_tech", "us_sector_financials", "us_sector_healthcare", "us_sector_energy")
    )

    assert overlay_total == pytest.approx(0.15)
