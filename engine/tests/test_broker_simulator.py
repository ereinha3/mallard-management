from data.loaders import load_prices
from broker.simulator import SimulatorBroker
from schemas.models import OrderPlan, RebalanceTrade


def _latest_price(ticker: str) -> float:
    prices = load_prices()
    row = prices[prices["ticker"] == ticker].sort_values("date").iloc[-1]
    return float(row["adj_close"])


def test_simulator_fills_at_cached_price_and_reads_positions():
    price = _latest_price("VTI")
    broker = SimulatorBroker(initial_cash=1000.0)
    plan = OrderPlan(
        method="lump_sum",
        buys=[{"ticker": "VTI", "dollars": price * 2.0, "shares": 2.0}],
        schedule=[],
    )

    fills = broker.place_order(plan)
    positions = broker.read_positions()

    assert len(fills) == 1
    assert fills[0].ticker == "VTI"
    assert fills[0].shares == 2.0
    assert fills[0].price == price
    assert len(positions.items) == 1
    assert positions.items[0].ticker == "VTI"
    assert positions.items[0].shares == 2.0
    assert positions.items[0].avg_cost == price
    assert positions.items[0].market_value == price * 2.0
    assert positions.cash == 1000.0 - price * 2.0
    assert positions.portfolio_value == positions.items[0].market_value + positions.cash


def test_simulator_clamps_near_zero_cash_after_exact_spend():
    price = _latest_price("VTI")
    broker = SimulatorBroker(initial_cash=1000.0)
    plan = OrderPlan(
        method="lump_sum",
        buys=[{"ticker": "VTI", "dollars": 1000.0, "shares": 1000.0 / price}],
        schedule=[],
    )

    broker.place_order(plan)
    positions = broker.read_positions()

    assert positions.cash == 0.0
    assert positions.portfolio_value == positions.items[0].market_value


def test_simulator_place_trades_processes_sells_before_buys_and_conserves_cash():
    broker = SimulatorBroker(initial_cash=0.0, price_cache={"VTI": 100.0, "BND": 50.0})
    broker._shares["VTI"] = 5.0
    broker._avg_cost["VTI"] = 80.0

    fills = broker.place_trades(
        [
            RebalanceTrade(ticker="BND", side="buy", shares=10.0),
            RebalanceTrade(ticker="VTI", side="sell", shares=5.0),
        ]
    )
    positions = broker.read_positions()

    assert [fill.ticker for fill in fills] == ["VTI", "BND"]
    assert broker.cash == 0.0
    assert positions.cash == 0.0
    by_ticker = {position.ticker: position for position in positions.items}
    assert by_ticker["VTI"].shares == 0.0
    assert by_ticker["BND"].shares == 10.0
    assert positions.portfolio_value == 500.0


def test_simulator_place_trades_clamps_oversized_sell_to_held_shares():
    broker = SimulatorBroker(initial_cash=0.0, price_cache={"VTI": 100.0})
    broker._shares["VTI"] = 2.0
    broker._avg_cost["VTI"] = 70.0

    fills = broker.place_trades([RebalanceTrade(ticker="VTI", side="sell", shares=5.0)])
    positions = broker.read_positions()

    assert len(fills) == 1
    assert fills[0].shares == 2.0
    assert positions.items[0].shares == 0.0
    assert broker.cash == 200.0


def test_simulator_place_trades_updates_avg_cost_on_buy():
    broker = SimulatorBroker(initial_cash=500.0, price_cache={"VTI": 100.0})
    broker._shares["VTI"] = 2.0
    broker._avg_cost["VTI"] = 80.0

    broker.place_trades([RebalanceTrade(ticker="VTI", side="buy", shares=1.0)])
    positions = broker.read_positions()

    assert positions.items[0].shares == 3.0
    assert positions.items[0].avg_cost == (2.0 * 80.0 + 1.0 * 100.0) / 3.0
    assert positions.cash == 400.0
