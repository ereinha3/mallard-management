import numpy as np
import pandas as pd
import pytest

from montecarlo.downside import scenario_var_1yr_loss


def test_scenario_var_1yr_loss_is_seeded_and_known_for_fixture():
    returns = pd.DataFrame(
        {
            "growth": [
                0.018,
                0.012,
                -0.045,
                0.021,
                0.009,
                -0.038,
                0.016,
                0.011,
                -0.030,
                0.024,
                0.007,
                -0.025,
            ],
            "defensive": [
                0.004,
                0.003,
                0.006,
                0.002,
                0.003,
                0.007,
                0.002,
                0.004,
                0.005,
                0.001,
                0.003,
                0.006,
            ],
        }
    )
    weights = {"growth": 0.7, "defensive": 0.3}

    first = scenario_var_1yr_loss(
        weights,
        returns,
        n_scenarios=1_000,
        seed=29,
        block_l=4,
    )
    second = scenario_var_1yr_loss(
        weights,
        returns,
        n_scenarios=1_000,
        seed=29,
        block_l=4,
    )

    assert first == second
    assert first == pytest.approx(0.047907213106330955)


def test_scenario_var_1yr_loss_can_infer_daily_year_length():
    index = pd.bdate_range("2024-01-02", periods=260)
    returns = pd.DataFrame(
        {
            "risk": np.full(len(index), 0.001),
            "cash": np.full(len(index), 0.0001),
        },
        index=index,
    )

    loss = scenario_var_1yr_loss(
        {"risk": 0.8, "cash": 0.2},
        returns,
        n_scenarios=200,
        seed=3,
    )

    assert loss == 0.0
