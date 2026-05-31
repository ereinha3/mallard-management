"""Alpaca Broker API adapter for per-user brokerage accounts.

This module does not import alpaca-py at module import time. Offline tests can
inject a fake BrokerClient without the SDK installed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from schemas.models import Fill, OrderPlan, Positions, RebalanceTrade


@dataclass
class _Request:
    """Tiny request object used only when tests inject a fake client."""

    def __init__(self, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            setattr(self, key, value)


@dataclass(frozen=True)
class _BrokerSDK:
    broker_client: Any
    market_order_request: Any
    order_side: Any
    time_in_force: Any


def _load_broker_sdk() -> _BrokerSDK:
    try:
        from alpaca.broker.client import BrokerClient
        from alpaca.trading.enums import OrderSide, TimeInForce
        from alpaca.trading.requests import MarketOrderRequest
    except ImportError as exc:
        raise RuntimeError(
            "alpaca-py SDK is required for BROKER_PROVIDER=alpaca_broker. "
            "Install alpaca-py in the runtime environment to enable this adapter."
        ) from exc

    return _BrokerSDK(
        broker_client=BrokerClient,
        market_order_request=MarketOrderRequest,
        order_side=OrderSide,
        time_in_force=TimeInForce,
    )


def _client() -> tuple[Any, _BrokerSDK]:
    sdk = _load_broker_sdk()
    api_key = os.environ.get("BROKER_API_KEY")
    secret_key = os.environ.get("BROKER_SECRET_KEY")
    if not api_key or not secret_key:
        raise RuntimeError(
            "BROKER_API_KEY and BROKER_SECRET_KEY are required for "
            "BROKER_PROVIDER=alpaca_broker."
        )

    return sdk.broker_client(api_key, secret_key, sandbox=True), sdk


class AlpacaBrokerAPI:
    """BrokerAdapter backed by Alpaca's multi-account Broker API."""

    def __init__(self, account_id: str, client: Any | None = None) -> None:
        if not account_id:
            raise RuntimeError("alpaca_broker requires a non-empty account_id.")

        self.account_id = account_id
        if client is None:
            self._client, self._sdk = _client()
        else:
            self._client = client
            self._sdk = None

    def _market_order_request(self, **kwargs: Any) -> Any:
        if self._sdk is None:
            return _Request(**kwargs)
        return self._sdk.market_order_request(**kwargs)

    def _order_side(self, side: str) -> Any:
        if self._sdk is None:
            return side
        return self._sdk.order_side.BUY if side == "buy" else self._sdk.order_side.SELL

    def _time_in_force_day(self) -> Any:
        if self._sdk is None:
            return "day"
        return self._sdk.time_in_force.DAY

    def place_order(self, plan: OrderPlan) -> list[Fill]:
        """Submit buy market orders for an OrderPlan and return best-effort fills."""

        fills: list[Fill] = []
        submitted_at = datetime.now(UTC)
        for buy in plan.buys:
            order_kwargs: dict[str, Any] = {
                "symbol": buy.ticker,
                "side": self._order_side("buy"),
                "time_in_force": self._time_in_force_day(),
            }
            if buy.dollars > 0:
                order_kwargs["notional"] = round(float(buy.dollars), 2)
            else:
                order_kwargs["qty"] = float(buy.shares)

            request = self._market_order_request(**order_kwargs)
            order = self._client.submit_order_for_account(self.account_id, request)
            fills.append(_fill_from_order(order, buy.ticker, buy.shares, submitted_at))

        return fills

    def place_trades(self, trades: list[RebalanceTrade]) -> list[Fill]:
        """Submit market orders for rebalance trades and return best-effort fills."""

        fills: list[Fill] = []
        submitted_at = datetime.now(UTC)
        for trade in trades:
            request = self._market_order_request(
                symbol=trade.ticker,
                qty=float(trade.shares),
                side=self._order_side(trade.side),
                time_in_force=self._time_in_force_day(),
            )
            order = self._client.submit_order_for_account(self.account_id, request)
            fills.append(_fill_from_order(order, trade.ticker, trade.shares, submitted_at))

        return fills

    def read_positions(self) -> Positions:
        """Read positions and account cash/equity for this brokerage account."""

        raw_positions = self._client.get_all_positions_for_account(self.account_id)
        account = self._client.get_trade_account_by_id(self.account_id)
        items = [
            {
                "ticker": str(position.symbol),
                "shares": _float_attr(position, "qty", 0.0),
                "avg_cost": _float_attr(position, "avg_entry_price", 0.0),
                "market_value": _float_attr(position, "market_value", 0.0),
            }
            for position in raw_positions
        ]
        return Positions(
            items=items,
            portfolio_value=_float_attr(account, "portfolio_value", 0.0),
            cash=_float_attr(account, "cash", 0.0),
        )


def _fill_from_order(order: Any, ticker: str, default_shares: float, submitted_at: datetime) -> Fill:
    return Fill(
        ticker=ticker,
        shares=_float_attr(order, "filled_qty", default_shares),
        price=_float_attr(order, "filled_avg_price", 0.0),
        ts=submitted_at,
    )


def _float_attr(obj: Any, name: str, default: float) -> float:
    value = getattr(obj, name, None)
    if value in (None, ""):
        return float(default)
    return float(value)
