from types import SimpleNamespace

import numpy as np
import pandas as pd

from data.loaders import load_prices, returns_matrix
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

    assert "ESGV" in universe.tickers
    assert "ESGD" in universe.tickers
    assert "VTI" not in universe.tickers
    assert "VEA" not in universe.tickers
    assert set(universe.risky_sleeves) == {"us_equity", "intl_equity", "reits", "gold"}
    assert set(universe.safe_sleeves) == {"bonds", "tips"}
    assert abs(sum(universe.market_weights.values()) - 1.0) < 1e-6
    assert {item.ticker for item in universe.excluded} == {"VTI", "VEA"}


def test_cov_ledoit_wolf_returns_labeled_dataframe():
    returns = returns_matrix(["us_equity", "intl_equity", "reits", "gold"])

    cov = cov_ledoit_wolf(returns)

    assert isinstance(cov, pd.DataFrame)
    assert list(cov.index) == list(returns.columns)
    assert list(cov.columns) == list(returns.columns)


def test_ledoit_wolf_delta_is_data_derived_and_covariance_is_psd():
    returns = returns_matrix(["us_equity", "intl_equity", "reits", "gold"])
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
    returns = returns_matrix(["us_equity", "intl_equity", "reits", "gold"])

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
