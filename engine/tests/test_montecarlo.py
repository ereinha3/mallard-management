import numpy as np

from montecarlo.projection import project


def fixed_weights():
    return {"us_equity": 0.6, "bonds": 0.4}


def toy_returns():
    base = np.array(
        [
            [0.012, 0.003],
            [0.009, 0.002],
            [-0.018, 0.006],
            [0.016, 0.001],
            [0.004, 0.004],
            [0.021, -0.002],
            [-0.011, 0.005],
            [0.013, 0.002],
            [0.007, 0.003],
            [0.018, 0.001],
            [-0.006, 0.004],
            [0.011, 0.002],
        ]
    )
    return np.tile(base, (4, 1))


def neg_skewed_returns():
    steady = np.full(96, 0.012)
    crash_cluster = np.array([-0.24, -0.19, -0.16, -0.13])
    series = np.concatenate([steady, crash_cluster])
    return series.reshape(-1, 1)


def test_p_success_deterministic_and_in_range():
    first = project(
        weights=fixed_weights(),
        returns=toy_returns(),
        horizon_years=10,
        capital=10_000,
        monthly_contribution=500,
        goal=120_000,
        generator="stationary_bootstrap",
        n_paths=2_000,
        seed=42,
    )
    second = project(
        weights=fixed_weights(),
        returns=toy_returns(),
        horizon_years=10,
        capital=10_000,
        monthly_contribution=500,
        goal=120_000,
        generator="stationary_bootstrap",
        n_paths=2_000,
        seed=42,
    )

    assert first == second
    assert 0.0 <= first.p_success <= 1.0
    assert first.median_terminal > 0
    assert first.bad_case_terminal <= first.median_terminal
    assert len(first.percentile_paths["p50"]) == 10


def test_gaussian_understates_left_tail_on_neg_skewed_series():
    weights = {"portfolio": 1.0}
    returns = neg_skewed_returns()

    boot = project(
        weights=weights,
        returns=returns,
        horizon_years=20,
        capital=50_000,
        monthly_contribution=750,
        goal=500_000,
        generator="stationary_bootstrap",
        n_paths=4_000,
        seed=1,
    )
    gauss = project(
        weights=weights,
        returns=returns,
        horizon_years=20,
        capital=50_000,
        monthly_contribution=750,
        goal=500_000,
        generator="gaussian",
        n_paths=4_000,
        seed=1,
    )

    assert boot.bad_case_terminal < gauss.bad_case_terminal
