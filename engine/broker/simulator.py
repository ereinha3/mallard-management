"""Simulator broker skeleton for docs/greenlight/06 Phase 5.2."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime

from data.loaders import latest_prices
from schemas.models import Fill, OrderPlan, Positions


class SimulatorBroker:
    """In-process simulator broker from docs/greenlight/06 Phase 5.2."""

    def __init__(self, initial_cash: float = 0.0, price_cache: Mapping[str, float] | None = None):
        self.cash = float(initial_cash)
        self._price_cache = dict(price_cache or {})
        self._shares: dict[str, float] = {}
        self._avg_cost: dict[str, float] = {}

    def _prices_for(self, tickers: list[str]) -> dict[str, float]:
        missing = [ticker for ticker in tickers if ticker not in self._price_cache]
        if missing:
            self._price_cache.update(latest_prices(missing))
        return {ticker: self._price_cache[ticker] for ticker in tickers}

    def place_order(self, plan: OrderPlan) -> list[Fill]:
        """Place an OrderPlan and return fills per docs/greenlight/05 §2.8."""

        tickers = [buy.ticker for buy in plan.buys]
        prices = self._prices_for(tickers)
        fills: list[Fill] = []
        ts = datetime.now(UTC)

        for buy in plan.buys:
            price = prices[buy.ticker]
            trade_value = buy.shares * price
            old_shares = self._shares.get(buy.ticker, 0.0)
            old_cost = self._avg_cost.get(buy.ticker, 0.0)
            new_shares = old_shares + buy.shares
            if new_shares > 0:
                self._avg_cost[buy.ticker] = ((old_shares * old_cost) + trade_value) / new_shares
            self._shares[buy.ticker] = new_shares
            self.cash -= trade_value
            fills.append(Fill(ticker=buy.ticker, shares=buy.shares, price=price, ts=ts))

        return fills

    def read_positions(self) -> Positions:
        """Read current positions per docs/greenlight/05 §2.8."""

        tickers = sorted(self._shares)
        prices = self._prices_for(tickers)
        items = []
        for ticker in tickers:
            shares = self._shares[ticker]
            market_value = shares * prices[ticker]
            items.append(
                {
                    "ticker": ticker,
                    "shares": shares,
                    "avg_cost": self._avg_cost[ticker],
                    "market_value": market_value,
                }
            )

        invested_value = sum(item["market_value"] for item in items)
        return Positions(items=items, portfolio_value=invested_value + self.cash, cash=self.cash)
