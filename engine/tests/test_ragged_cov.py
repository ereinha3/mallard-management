import numpy as np
import pandas as pd

from optimizer.erc import cov_ledoit_wolf, erc_weights


def _reference_finite_values(returns):
    values = np.asarray(returns, dtype=float)
    values = values[np.isfinite(values).all(axis=1)]
    if values.shape[0] < 2:
        raise ValueError("returns must contain at least two finite observations")
    return values


def _reference_constant_correlation_target(sample):
    sample = (np.asarray(sample, dtype=float) + np.asarray(sample, dtype=float).T) / 2.0
    n_assets = sample.shape[0]
    var = np.maximum(np.diag(sample).copy(), 0.0)
    std = np.sqrt(var)
    denom = np.outer(std, std)
    target = np.zeros_like(sample)
    if n_assets == 1:
        target[0, 0] = var[0]
        return target

    corr = np.zeros_like(sample)
    np.divide(sample, denom, out=corr, where=denom > 0)
    off_diag = ~np.eye(n_assets, dtype=bool)
    valid = off_diag & (denom > 0)
    rbar = float(corr[valid].mean()) if np.any(valid) else 0.0
    rbar = min(1.0, max(-1.0 / (n_assets - 1) + 1e-12, rbar))
    target = rbar * denom
    np.fill_diagonal(target, var)
    return (target + target.T) / 2.0


def _reference_target_directional_derivative(sample, direction):
    sample_norm = max(float(np.linalg.norm(sample)), 1.0)
    direction_norm = max(float(np.linalg.norm(direction)), 1.0)
    step = 1e-5 * sample_norm / direction_norm
    plus = _reference_constant_correlation_target(sample + step * direction)
    minus = _reference_constant_correlation_target(sample - step * direction)
    return (plus - minus) / (2.0 * step)


def _reference_delta(centered, sample):
    n_obs, n_assets = centered.shape
    if n_assets == 1:
        return 0.0

    target = _reference_constant_correlation_target(sample)
    gamma_hat = float(np.sum((target - sample) ** 2))
    if gamma_hat <= 1e-24:
        return 0.0

    products = centered[:, :, None] * centered[:, None, :]
    shocks = products - sample
    pi_hat = float(np.mean(np.sum(shocks * shocks, axis=(1, 2))))

    rho_terms = []
    for shock in shocks:
        target_shock = _reference_target_directional_derivative(sample, shock)
        rho_terms.append(float(np.sum(target_shock * shock)))
    rho_hat = float(np.mean(rho_terms)) if rho_terms else 0.0

    kappa_hat = (pi_hat - rho_hat) / gamma_hat
    return min(1.0, max(0.0, kappa_hat / n_obs))


def _reference_complete_cov(returns):
    values = _reference_finite_values(returns)
    centered = values - values.mean(axis=0, keepdims=True)
    sample = (centered.T @ centered) / values.shape[0]
    sample = np.atleast_2d(sample)

    if values.shape[1] == 1:
        sigma = sample
        shrinkage = 0.0
    else:
        target = _reference_constant_correlation_target(sample)
        shrinkage = _reference_delta(centered, sample)
        sigma = (1.0 - shrinkage) * sample + shrinkage * target

    sigma = (sigma + sigma.T) / 2.0
    sigma = sigma + np.eye(values.shape[1]) * 1e-12
    frame = pd.DataFrame(sigma, index=returns.columns, columns=returns.columns)
    frame.attrs["ledoit_wolf_delta"] = float(shrinkage)
    return frame


def _population_variance(values):
    values = np.asarray(values, dtype=float)
    values = values[np.isfinite(values)]
    centered = values - float(values.mean())
    return float(centered @ centered) / len(values)


def test_complete_matrix_matches_pre_pairwise_reference():
    returns = pd.DataFrame(
        {
            "alpha": [0.012, -0.008, 0.021, 0.004, -0.015, 0.018],
            "beta": [-0.004, 0.007, 0.013, -0.011, 0.006, 0.010],
            "gamma": [0.009, 0.003, -0.014, 0.016, -0.002, 0.005],
        }
    )

    actual = cov_ledoit_wolf(returns)
    expected = _reference_complete_cov(returns)

    np.testing.assert_allclose(actual.to_numpy(dtype=float), expected.to_numpy(dtype=float), atol=1e-12)
    assert abs(actual.attrs["ledoit_wolf_delta"] - expected.attrs["ledoit_wolf_delta"]) < 1e-12


def test_ragged_covariance_uses_each_assets_available_history():
    returns = pd.DataFrame(
        {
            "older_asset": [0.10, -0.10, 0.08, -0.08, 0.06, -0.06, 0.02, -0.02],
            "newer_asset": [np.nan, np.nan, np.nan, np.nan, 0.03, -0.03, 0.01, -0.01],
        }
    )

    cov = cov_ledoit_wolf(returns)
    eigenvalues = np.linalg.eigvalsh(cov.to_numpy(dtype=float))

    assert np.isfinite(cov.to_numpy(dtype=float)).all()
    assert np.allclose(cov, cov.T, atol=1e-12)
    assert float(eigenvalues.min()) >= -1e-12

    unshrunk = cov_ledoit_wolf(returns, delta=0.0)
    full_history_variance = _population_variance(returns["older_asset"])
    common_interval_variance = _population_variance(returns.dropna()["older_asset"])

    assert abs(float(unshrunk.loc["older_asset", "older_asset"]) - full_history_variance) < 1e-10
    assert abs(full_history_variance - common_interval_variance) > 1e-3


def test_degenerate_ragged_inputs_return_finite_psd_output():
    returns = pd.DataFrame(
        {
            "all_nan": [np.nan, np.nan, np.nan],
            "one_observation": [np.nan, 0.02, np.nan],
            "two_observations": [0.01, np.nan, -0.03],
        }
    )

    cov = cov_ledoit_wolf(returns)
    weights = erc_weights(returns)
    eigenvalues = np.linalg.eigvalsh(cov.to_numpy(dtype=float))

    assert list(cov.index) == list(returns.columns)
    assert list(cov.columns) == list(returns.columns)
    assert np.isfinite(cov.to_numpy(dtype=float)).all()
    assert np.allclose(cov, cov.T, atol=1e-12)
    assert float(eigenvalues.min()) >= -1e-12
    assert set(weights) == set(returns.columns)
    assert np.isfinite(list(weights.values())).all()
    assert abs(sum(weights.values()) - 1.0) < 1e-12

    single_asset = cov_ledoit_wolf(pd.DataFrame({"solo": [0.01]}))

    assert single_asset.shape == (1, 1)
    assert np.isfinite(single_asset.to_numpy(dtype=float)).all()
    assert float(single_asset.iloc[0, 0]) > 0.0
