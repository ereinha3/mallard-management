from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from data.loaders import load_prices, returns_matrix
from optimizer.blend import build_target_weights
from optimizer.erc import erc_weights
from optimizer.tilt import momentum_vol_tilt
from schemas.constants import GAMMA_MAX, GAMMA_MIN
from universe.builder import build_universe


def _synthetic_risky_returns(periods: int = 300) -> pd.DataFrame:
    dates = pd.bdate_range("2024-01-01", periods=periods)
    return pd.DataFrame(
        {
            "us_equity": np.linspace(0.0010, 0.0030, periods),
            "intl_equity": np.full(periods, 0.0005),
            "reits": np.tile([0.0035, -0.0015], periods // 2),
            "gold": np.full(periods, -0.0002),
        },
        index=dates,
    )


def test_tilt_zero_gamma_max_reproduces_erc_weights_exactly():
    returns = returns_matrix(["us_equity", "intl_equity", "reits", "gold"])
    erc = erc_weights(returns)

    tilted = momentum_vol_tilt(erc, returns, GAMMA_MAX)

    assert tilted == pytest.approx(erc, abs=1e-12)


def test_aggressive_tilt_reduces_gold_and_raises_high_momentum_vol_equity():
    returns = _synthetic_risky_returns()
    erc = {
        "us_equity": 0.25,
        "intl_equity": 0.25,
        "reits": 0.25,
        "gold": 0.25,
    }

    aggressive = momentum_vol_tilt(erc, returns, GAMMA_MIN)
    conservative = momentum_vol_tilt(erc, returns, GAMMA_MAX)

    assert aggressive["gold"] < erc["gold"]
    assert aggressive["reits"] > erc["reits"]
    assert conservative == pytest.approx(erc, abs=1e-12)


def test_aggressive_tilt_reduces_gold_on_offline_fixture():
    returns = returns_matrix(["us_equity", "intl_equity", "reits", "gold"])
    erc = erc_weights(returns)

    aggressive = momentum_vol_tilt(erc, returns, GAMMA_MIN)

    assert aggressive["gold"] < erc["gold"]
    assert aggressive["reits"] > erc["reits"]


def test_tilt_weights_are_non_negative_and_sum_to_one_across_profiles():
    returns = returns_matrix(["us_equity", "intl_equity", "reits", "gold"])
    erc = erc_weights(returns)

    for gamma in (GAMMA_MIN, (GAMMA_MIN + GAMMA_MAX) / 2, GAMMA_MAX):
        tilted = momentum_vol_tilt(erc, returns, gamma)

        assert min(tilted.values()) >= 0.0
        assert sum(tilted.values()) == pytest.approx(1.0)


def test_tilt_handles_degenerate_inputs_without_nan():
    flat = pd.DataFrame(
        {
            "gold": [0.0, 0.0, 0.0],
            "us_equity": [0.0, 0.0, 0.0],
        },
        index=pd.bdate_range("2024-01-01", periods=3),
    )
    short = pd.DataFrame({"gold": [0.01]}, index=pd.bdate_range("2024-01-01", periods=1))

    flat_tilted = momentum_vol_tilt({"gold": 0.6, "us_equity": 0.4}, flat, GAMMA_MIN)
    short_tilted = momentum_vol_tilt({"gold": 1.0}, short, GAMMA_MIN)

    assert flat_tilted == pytest.approx({"gold": 0.6, "us_equity": 0.4})
    assert short_tilted == pytest.approx({"gold": 1.0})
    assert all(np.isfinite(value) for value in flat_tilted.values())
    assert all(np.isfinite(value) for value in short_tilted.values())


def test_build_target_weights_applies_tilt_inside_risky_buckets():
    universe = build_universe(SimpleNamespace(esg_exclusions=["none"]))
    prices = load_prices()

    def _profile(gamma: float) -> SimpleNamespace:
        return SimpleNamespace(
            gamma_band=SimpleNamespace(mid=gamma),
            target_vol_band=SimpleNamespace(mid=0.145),
            age=28,
            horizon_years=37,
        )

    aggressive = build_target_weights(_profile(GAMMA_MIN), universe, prices)
    conservative = build_target_weights(_profile(GAMMA_MAX), universe, prices)

    risky = [bucket for bucket in universe.risky_buckets if bucket in aggressive.by_bucket]
    agg_risky_total = sum(aggressive.by_bucket[bucket] for bucket in risky)
    con_risky_total = sum(conservative.by_bucket[bucket] for bucket in risky)

    # The most conservative profile (gamma_max) disables the tilt; an aggressive
    # profile rotates the risky budget away from low-volatility gold.
    assert (
        aggressive.by_bucket["gold"] / agg_risky_total
        < conservative.by_bucket["gold"] / con_risky_total
    )
    # Safe-bucket weight still equals 1 - blend_alpha.
    assert sum(
        conservative.by_bucket[bucket]
        for bucket in universe.safe_buckets
        if bucket in conservative.by_bucket
    ) == pytest.approx(1.0 - conservative.blend_alpha)
