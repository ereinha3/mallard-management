from types import SimpleNamespace

import numpy as np
import pandas as pd

from optimizer.black_litterman import black_litterman_weights_from_cov
from optimizer.cvar import cvar_95_loss, cvar_weights


def test_black_litterman_known_posterior_weights_from_two_absolute_views():
    covariance = pd.DataFrame(
        [[0.04, 0.0], [0.0, 0.09]],
        index=["growth", "defensive"],
        columns=["growth", "defensive"],
    )
    market_weights = {"growth": 0.6, "defensive": 0.4}
    views = {"growth": 0.02, "defensive": -0.01}

    weights = black_litterman_weights_from_cov(
        covariance,
        market_weights,
        views,
        risk_aversion=2.5,
        tau=1.0,
        view_confidence=0.5,
    )

    assert set(weights) == {"growth", "defensive"}
    assert np.isclose(weights["growth"], 0.6494845360824743)
    assert np.isclose(weights["defensive"], 0.35051546391752575)
    assert np.isclose(sum(weights.values()), 1.0)


def test_cvar_optimizer_improves_or_matches_equal_weight_fixture():
    returns = pd.DataFrame(
        {
            "steady": [0.01, 0.01, 0.01, -0.02, 0.01, -0.01, 0.01, 0.0, 0.01, 0.01],
            "volatile": [0.04, 0.05, -0.30, 0.06, 0.05, -0.25, 0.04, 0.05, 0.06, 0.04],
        }
    )
    equal = {"steady": 0.5, "volatile": 0.5}

    weights = cvar_weights(returns, beta=0.95, n_scenarios=200, seed=11)

    assert set(weights) == {"steady", "volatile"}
    assert np.isclose(sum(weights.values()), 1.0)
    assert min(weights.values()) >= 0.0
    assert cvar_95_loss(returns, weights) <= cvar_95_loss(returns, equal)


def test_black_litterman_profile_views_tilt_toward_named_sleeve():
    covariance = pd.DataFrame(
        [[0.04, 0.0], [0.0, 0.04]],
        index=["us_equity", "bonds"],
        columns=["us_equity", "bonds"],
    )
    profile = SimpleNamespace(sector_theme_tilts=["us_equity"], esg_exclusions=[])

    weights = black_litterman_weights_from_cov(
        covariance,
        {"us_equity": 0.5, "bonds": 0.5},
        profile=profile,
        risk_aversion=2.5,
        tau=1.0,
        view_confidence=0.5,
    )

    assert weights["us_equity"] > 0.5
    assert weights["bonds"] < 0.5
