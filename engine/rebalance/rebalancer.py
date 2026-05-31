"""Rebalancer skeleton for docs/greenlight/05 §2.9 and 06 Phase 5.3."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping

from data.loaders import latest_prices
from data.repository import ticker_to_sleeve
from schemas.constants import DRIFT_BAND_PP
from schemas.models import Positions, RebalanceDecision, RebalanceTrade, Sleeve, TargetWeights

EPSILON = 1e-9


def _ticker_to_sleeve() -> dict[str, Sleeve]:
    return ticker_to_sleeve()


def _target_ticker_for_sleeve(weights: TargetWeights, sleeve: Sleeve, mapping: dict[str, Sleeve]) -> str | None:
    candidates = [
        (ticker, weight)
        for ticker, weight in weights.by_ticker.items()
        if weight > 0 and mapping.get(ticker) == sleeve
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[1])[0]


def _largest_position_ticker(positions: Positions, sleeve: Sleeve, mapping: dict[str, Sleeve]) -> str | None:
    candidates = [
        (position.ticker, position.market_value)
        for position in positions.items
        if mapping.get(position.ticker) == sleeve and position.market_value > 0
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[1])[0]


def decide_rebalance(positions: Positions, weights: TargetWeights) -> RebalanceDecision:
    """Decide rebalance actions per docs/greenlight/05 §2.9."""

    mapping = _ticker_to_sleeve()
    sleeve_values: dict[Sleeve, float] = defaultdict(float)
    for position in positions.items:
        sleeve = mapping.get(position.ticker)
        if sleeve is not None:
            sleeve_values[sleeve] += position.market_value

    portfolio_value = positions.portfolio_value
    drifts = {}
    for sleeve, target in weights.by_sleeve.items():
        current = 0.0 if portfolio_value <= 0 else sleeve_values[sleeve] / portfolio_value
        drifts[sleeve] = {
            "current": current,
            "target": target,
            "drift_pp": (current - target) * 100.0,
        }

    max_abs_drift = max((abs(drift["drift_pp"]) for drift in drifts.values()), default=0.0)
    if max_abs_drift <= EPSILON:
        return RebalanceDecision(action="none", drifts=drifts, steer=None, trades=[])

    if max_abs_drift <= DRIFT_BAND_PP + EPSILON:
        underweight = [
            sleeve for sleeve, drift in drifts.items() if drift["target"] - drift["current"] > EPSILON
        ]
        return RebalanceDecision(
            action="steer",
            drifts=drifts,
            steer={"next_contribution_to": underweight},
            trades=[],
        )

    trades = []
    for sleeve, drift in drifts.items():
        if abs(drift["drift_pp"]) <= DRIFT_BAND_PP + EPSILON:
            continue

        gap_dollars = (drift["current"] - drift["target"]) * portfolio_value
        if gap_dollars > 0:
            ticker = _largest_position_ticker(positions, sleeve, mapping)
            side = "sell"
        else:
            ticker = _target_ticker_for_sleeve(weights, sleeve, mapping)
            side = "buy"

        if ticker is None:
            continue

        price = latest_prices([ticker])[ticker]
        trades.append({"ticker": ticker, "side": side, "shares": abs(gap_dollars) / price})

    return RebalanceDecision(action="trade", drifts=drifts, steer=None, trades=trades)


def rebalance_to_target(
    positions: Positions,
    weights: TargetWeights,
    prices: Mapping[str, float],
) -> list[RebalanceTrade]:
    """Build a full transition from current holdings/cash to target ticker weights."""

    total_value = sum(position.market_value for position in positions.items) + positions.cash
    current_dollars = {position.ticker: position.market_value for position in positions.items}
    tickers = set(current_dollars) | set(weights.by_ticker)
    sells: list[RebalanceTrade] = []
    buys: list[RebalanceTrade] = []

    for ticker in sorted(tickers):
        price = prices.get(ticker)
        if price is None or price <= 0:
            continue

        target = float(weights.by_ticker.get(ticker, 0.0)) * total_value
        current = float(current_dollars.get(ticker, 0.0))
        delta = target - current
        if delta < -1e-2:
            sells.append(RebalanceTrade(ticker=ticker, side="sell", shares=abs(delta) / price))
        elif delta > 1e-2:
            buys.append(RebalanceTrade(ticker=ticker, side="buy", shares=delta / price))

    return sells + buys
