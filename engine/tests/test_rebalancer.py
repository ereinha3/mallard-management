from data.loaders import load_prices
from pytest import approx
from rebalance.rebalancer import decide_rebalance
from schemas.models import Positions, TargetWeights


def _latest_price(ticker: str) -> float:
    prices = load_prices()
    row = prices[prices["ticker"] == ticker].sort_values("date").iloc[-1]
    return float(row["adj_close"])


def _target(vti: float = 0.5, bnd: float = 0.5, tip: float = 0.0) -> TargetWeights:
    by_ticker = {"VTI": vti, "BND": bnd}
    # BND/TIP were reclassified out of the legacy bonds/tips sleeves in the
    # Sharpe-audit remediation (BND -> core_bonds, TIP -> inflation).
    by_sleeve = {"us_equity": vti, "core_bonds": bnd}
    if tip > 0:
        by_ticker["TIP"] = tip
        by_sleeve["inflation"] = tip
    return TargetWeights(
        by_ticker=by_ticker,
        by_sleeve=by_sleeve,
        blend_alpha=vti,
        method="erc",
    )


def _positions(values: dict[str, float], cash: float = 0.0) -> Positions:
    items = [
        {
            "ticker": ticker,
            "shares": market_value / _latest_price(ticker),
            "avg_cost": _latest_price(ticker),
            "market_value": market_value,
        }
        for ticker, market_value in values.items()
    ]
    return Positions(items=items, portfolio_value=sum(values.values()) + cash, cash=cash)


def test_rebalance_none_when_on_target():
    decision = decide_rebalance(_positions({"VTI": 500.0, "BND": 500.0}), _target())

    assert decision.action == "none"
    assert decision.steer is None
    assert decision.trades == []


def test_rebalance_steers_contributions_when_inside_drift_band():
    decision = decide_rebalance(_positions({"VTI": 530.0, "BND": 470.0}), _target())

    assert decision.action == "steer"
    assert decision.steer.next_contribution_to == ["core_bonds"]
    assert decision.trades == []
    assert round(decision.drifts["us_equity"].drift_pp, 2) == 3.0
    assert round(decision.drifts["core_bonds"].drift_pp, 2) == -3.0


def test_rebalance_trades_minimal_correction_when_band_breached():
    decision = decide_rebalance(
        _positions({"VTI": 560.0, "BND": 280.0, "TIP": 160.0}),
        _target(vti=0.5, bnd=0.3, tip=0.2),
    )

    assert decision.action == "trade"
    assert decision.steer is None
    assert len(decision.trades) == 1
    assert decision.trades[0].ticker == "VTI"
    assert decision.trades[0].side == "sell"
    assert decision.trades[0].shares == approx(60.0 / _latest_price("VTI"))
