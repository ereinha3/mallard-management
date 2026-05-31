"""Order sizing skeleton for docs/greenlight/05 §2.8 and 06 Phase 5.1."""

from data.loaders import latest_prices
from schemas.models import OrderPlan, TargetWeights

DCA_MONTHS = 12


def size_orders(weights: TargetWeights, capital_on_hand: float, monthly_surplus: float) -> OrderPlan:
    """Size orders per docs/greenlight/05 §2.8."""

    if capital_on_hand < 0:
        raise ValueError("capital_on_hand must be non-negative")

    tickers = [ticker for ticker, weight in weights.by_ticker.items() if weight > 0]
    prices = latest_prices(tickers)
    buys = []
    for ticker in tickers:
        dollars = capital_on_hand * weights.by_ticker[ticker]
        price = prices[ticker]
        buys.append({"ticker": ticker, "dollars": dollars, "shares": dollars / price})

    method = "dca" if monthly_surplus > 0 else "lump_sum"
    schedule = []
    if method == "dca":
        schedule = [
            {"month_offset": month_offset, "contribution": monthly_surplus}
            for month_offset in range(1, DCA_MONTHS + 1)
        ]

    return OrderPlan(method=method, buys=buys, schedule=schedule)
