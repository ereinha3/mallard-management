"""Guarded Alpaca paper broker adapter scaffold.

This module intentionally does not import alpaca-py at module import time so
offline test and development environments can import broker.alpaca safely.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any

from schemas.models import Fill, OrderPlan, Positions, RebalanceTrade


class AlpacaBroker:
    """Paper-trading BrokerAdapter backed by alpaca-py when explicitly enabled."""

    def __init__(self) -> None:
        try:
            from alpaca.trading.client import TradingClient
            from alpaca.trading.enums import OrderSide, TimeInForce
            from alpaca.trading.requests import MarketOrderRequest
        except ImportError as exc:
            raise RuntimeError(
                "alpaca-py SDK is required for BROKER_PROVIDER=alpaca_paper. "
                "Install alpaca-py in the runtime environment to enable this adapter."
            ) from exc

        api_key = os.environ.get("ALPACA_API_KEY")
        secret_key = os.environ.get("ALPACA_SECRET_KEY")
        if not api_key or not secret_key:
            raise RuntimeError(
                "ALPACA_API_KEY and ALPACA_SECRET_KEY are required for "
                "BROKER_PROVIDER=alpaca_paper."
            )

        self._client = TradingClient(api_key, secret_key, paper=True)
        self._market_order_request = MarketOrderRequest
        self._order_side = OrderSide
        self._time_in_force = TimeInForce

    def place_order(self, plan: OrderPlan) -> list[Fill]:
        """Submit buy market orders and return best-effort fill records."""

        fills: list[Fill] = []
        submitted_at = datetime.now(UTC)
        for buy in plan.buys:
            request = self._market_order_request(
                symbol=buy.ticker,
                notional=round(float(buy.dollars), 2),
                side=self._order_side.BUY,
                time_in_force=self._time_in_force.DAY,
            )
            order = self._client.submit_order(order_data=request)
            fills.append(
                Fill(
                    ticker=buy.ticker,
                    shares=_float_attr(order, "filled_qty", buy.shares),
                    price=_float_attr(order, "filled_avg_price", 0.0),
                    ts=submitted_at,
                )
            )
        return fills

    def place_trades(self, trades: list[RebalanceTrade]) -> list[Fill]:
        """Submit rebalance market orders and return best-effort fill records."""

        fills: list[Fill] = []
        submitted_at = datetime.now(UTC)
        ordered_trades = [trade for trade in trades if trade.side == "sell"] + [
            trade for trade in trades if trade.side == "buy"
        ]
        for trade in ordered_trades:
            request = self._market_order_request(
                symbol=trade.ticker,
                qty=float(trade.shares),
                side=self._order_side.SELL if trade.side == "sell" else self._order_side.BUY,
                time_in_force=self._time_in_force.DAY,
            )
            order = self._client.submit_order(order_data=request)
            fills.append(
                Fill(
                    ticker=trade.ticker,
                    shares=_float_attr(order, "filled_qty", trade.shares),
                    price=_float_attr(order, "filled_avg_price", 0.0),
                    ts=submitted_at,
                )
            )
        return fills

    def read_positions(self) -> Positions:
        """Read account cash/equity and current positions from Alpaca paper."""

        account = self._client.get_account()
        raw_positions = self._client.get_all_positions()
        items = [
            {
                "ticker": str(position.symbol),
                "shares": float(position.qty),
                "avg_cost": float(position.avg_entry_price),
                "market_value": float(position.market_value),
            }
            for position in raw_positions
        ]
        return Positions(
            items=items,
            portfolio_value=float(account.equity),
            cash=float(account.cash),
        )


def _float_attr(obj: Any, name: str, default: float) -> float:
    value = getattr(obj, name, None)
    if value in (None, ""):
        return float(default)
    return float(value)
