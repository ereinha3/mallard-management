import json
import math

import pytest

from backtest.metrics import calmar, deflated_sharpe, max_drawdown, sortino
from backtest.run import run_backtest
from schemas.constants import TX_COST_BPS


def test_drawdown_sortino_and_calmar_on_known_vectors():
    assert max_drawdown([100.0, 120.0, 90.0, 150.0, 120.0]) == pytest.approx(-0.25)

    returns = [0.04, -0.02, 0.03, -0.01]
    assert sortino(returns, periods_per_year=1) == pytest.approx(0.8944271909999159)

    calmar_returns = [0.10, -0.05, 0.20]
    assert calmar(calmar_returns, periods_per_year=1) == pytest.approx(1.567303067818715)


def test_deflated_sharpe_matches_contract_formula_known_vector():
    returns = [
        0.01,
        0.02,
        -0.015,
        0.005,
        0.012,
        -0.004,
        0.018,
        -0.01,
        0.007,
        0.011,
        0.003,
        -0.006,
    ]

    # Pinned to docs/greenlight/05-contracts.md §7.5:
    # SR0 = 0.359577749..., skew = -0.2975168, kurtosis = 2.0170561,
    # and the denominator uses SR0 rather than sr_hat.
    assert deflated_sharpe(returns, sr_hat=0.75, n_trials=5) == pytest.approx(
        0.8874058019902793,
        abs=1e-9,
    )


def test_run_backtest_writes_contract_json(tmp_path):
    output_path = tmp_path / "backtest.json"

    result = run_backtest(output_path=output_path)

    assert output_path.exists()
    raw = json.loads(output_path.read_text())
    assert raw["config"]["window_months"] == 36
    assert raw["config"]["rebalance"] == "quarterly"
    assert raw["config"]["tx_cost_bps"] == TX_COST_BPS
    assert raw["config"]["n_trials"] == 5

    assert set(result.strategies) == {
        "greenlight_erc",
        "one_over_n",
        "sixty_forty",
        "target_date",
        "naive_mvo",
    }
    for strategy in result.strategies.values():
        assert strategy.equity_curve
        assert len(strategy.equity_curve) == len(strategy.drawdown_curve)
        assert strategy.metrics.turnover >= 0
        assert -1.0 <= strategy.metrics.max_drawdown <= 0.0
        assert 0.0 <= strategy.metrics.deflated_sharpe <= 1.0
        assert math.isfinite(strategy.metrics.sharpe)
