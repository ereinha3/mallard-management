from __future__ import annotations

from types import SimpleNamespace

import pytest

from schemas.models import OrderPlan, RebalanceTrade


class FakeBrokerClient:
    def __init__(self) -> None:
        self.orders: list[tuple[str, object]] = []

    def submit_order_for_account(self, account_id: str, order: object) -> object:
        self.orders.append((account_id, order))
        return SimpleNamespace(filled_qty="1.5", filled_avg_price="200.25")

    def get_all_positions_for_account(self, account_id: str) -> list[object]:
        assert account_id == "acct-123"
        return [
            SimpleNamespace(
                symbol="VTI",
                qty="2.5",
                avg_entry_price="100.10",
                market_value="250.25",
            )
        ]

    def get_trade_account_by_id(self, account_id: str) -> object:
        assert account_id == "acct-123"
        return SimpleNamespace(cash="123.45", portfolio_value="373.70")


def test_place_order_submits_market_buy_notional_requests() -> None:
    from broker.alpaca_broker import AlpacaBrokerAPI

    client = FakeBrokerClient()
    broker = AlpacaBrokerAPI("acct-123", client=client)
    plan = OrderPlan(
        method="lump_sum",
        buys=[{"ticker": "VTI", "dollars": 300.0, "shares": 1.5}],
        schedule=[],
    )

    fills = broker.place_order(plan)

    assert fills[0].ticker == "VTI"
    assert fills[0].shares == 1.5
    assert fills[0].price == 200.25
    account_id, order = client.orders[0]
    assert account_id == "acct-123"
    assert order.symbol == "VTI"
    assert order.notional == 300.0
    assert getattr(order, "qty", None) is None
    assert str(order.side).lower().endswith("buy")
    assert str(order.time_in_force).lower().endswith("day")


def test_place_trades_submits_buy_and_sell_market_qty_requests() -> None:
    from broker.alpaca_broker import AlpacaBrokerAPI

    client = FakeBrokerClient()
    broker = AlpacaBrokerAPI("acct-123", client=client)

    broker.place_trades(
        [
            RebalanceTrade(ticker="VTI", side="sell", shares=2.0),
            RebalanceTrade(ticker="BND", side="buy", shares=3.0),
        ]
    )

    orders = [order for _, order in client.orders]
    assert [(order.symbol, order.qty) for order in orders] == [("VTI", 2.0), ("BND", 3.0)]
    assert str(orders[0].side).lower().endswith("sell")
    assert str(orders[1].side).lower().endswith("buy")
    assert all(str(order.time_in_force).lower().endswith("day") for order in orders)


def test_read_positions_maps_broker_fields_to_engine_positions() -> None:
    from broker.alpaca_broker import AlpacaBrokerAPI

    broker = AlpacaBrokerAPI("acct-123", client=FakeBrokerClient())

    positions = broker.read_positions()

    assert positions.cash == 123.45
    assert positions.portfolio_value == 373.70
    assert len(positions.items) == 1
    position = positions.items[0]
    assert position.ticker == "VTI"
    assert position.shares == 2.5
    assert position.avg_cost == 100.10
    assert position.market_value == 250.25


def test_alpaca_broker_api_raises_cleanly_without_sdk_or_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("BROKER_API_KEY", raising=False)
    monkeypatch.delenv("BROKER_SECRET_KEY", raising=False)

    from broker.alpaca_broker import AlpacaBrokerAPI

    with pytest.raises(RuntimeError, match="alpaca-py SDK|BROKER_API_KEY|BROKER_SECRET_KEY"):
        AlpacaBrokerAPI("acct-123")
