from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from data.loaders import load_prices, returns_matrix
from optimizer.blend import build_target_weights
from optimizer.erc import erc_weights
from optimizer.tilt import (
    BUCKET_TILT_MAX_WEIGHT,
    _momentum,
    _periods_per_year,
    _risk_adjusted_momentum,
    _volatility,
    momentum_vol_tilt,
)
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


def test_aggressive_tilt_favors_risk_adjusted_momentum_not_raw_volatility():
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
    assert aggressive["us_equity"] > erc["us_equity"]
    assert aggressive["reits"] < erc["reits"]
    assert aggressive["us_equity"] > aggressive["reits"]
    assert conservative == pytest.approx(erc, abs=1e-12)


def test_aggressive_tilt_rewards_highest_risk_adjusted_momentum_on_offline_fixture():
    buckets = ["us_equity", "intl_equity", "reits", "gold"]
    returns = returns_matrix(buckets)
    erc = erc_weights(returns)

    aggressive = momentum_vol_tilt(erc, returns, GAMMA_MIN)

    periods_per_year = _periods_per_year(returns.index)
    momentum = _momentum(returns, 12, periods_per_year)
    volatility = _volatility(returns, periods_per_year)
    risk_adjusted = _risk_adjusted_momentum(momentum, volatility)
    highest_risk_adjusted = buckets[int(np.argmax(risk_adjusted))]
    highest_volatility = buckets[int(np.argmax(volatility))]

    assert aggressive[highest_risk_adjusted] > erc[highest_risk_adjusted]
    if highest_volatility != highest_risk_adjusted:
        assert aggressive[highest_volatility] <= erc[highest_volatility]


def test_tilt_caps_single_bucket_weight_when_cap_is_feasible():
    periods = 320
    dates = pd.bdate_range("2024-01-01", periods=periods)
    step = np.arange(periods)
    buckets = [f"bucket_{idx}" for idx in range(8)]
    returns = pd.DataFrame(
        {
            "bucket_0": np.linspace(0.0020, 0.0040, periods),
            **{
                bucket: 0.0001 + 0.0015 * np.sin(step / (idx + 2))
                for idx, bucket in enumerate(buckets[1:], start=1)
            },
        },
        index=dates,
    )
    erc = {bucket: 1.0 / len(buckets) for bucket in buckets}

    aggressive = momentum_vol_tilt(erc, returns, GAMMA_MIN, lam=25.0)

    assert aggressive["bucket_0"] == pytest.approx(BUCKET_TILT_MAX_WEIGHT)
    assert max(aggressive.values()) <= BUCKET_TILT_MAX_WEIGHT + 1e-12
    assert sum(aggressive.values()) == pytest.approx(1.0)


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

    aggressive = build_target_weights(_profile(GAMMA_MIN), universe, prices, method="erc")
    conservative = build_target_weights(_profile(GAMMA_MAX), universe, prices, method="erc")

    risky = [bucket for bucket in universe.risky_buckets if bucket in aggressive.by_bucket]
    agg_risky_total = sum(aggressive.by_bucket[bucket] for bucket in risky)
    con_risky_total = sum(conservative.by_bucket[bucket] for bucket in risky)

    # The most conservative profile (gamma_max) disables the tilt and leaves the
    # ERC weights unchanged; an aggressive profile applies the risk-adjusted
    # momentum tilt, which concentrates the risky budget into the high
    # risk-adjusted-momentum broad core (us_total_market / us_large_blend) and
    # away from volatile satellites (which are also held under SATELLITE_BUCKET_CAP).
    assert aggressive.by_bucket != conservative.by_bucket
    assert (
        aggressive.by_bucket["us_total_market"] / agg_risky_total
        > conservative.by_bucket["us_total_market"] / con_risky_total
    )
    assert (
        aggressive.by_bucket["us_large_blend"] / agg_risky_total
        > conservative.by_bucket["us_large_blend"] / con_risky_total
    )
    # Safe-bucket weight still equals 1 - blend_alpha.
    assert sum(
        conservative.by_bucket[bucket]
        for bucket in universe.safe_buckets
        if bucket in conservative.by_bucket
    ) == pytest.approx(1.0 - conservative.blend_alpha)
