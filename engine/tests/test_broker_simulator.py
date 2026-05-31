from data.loaders import load_prices
from broker.simulator import SimulatorBroker
from schemas.models import OrderPlan


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
