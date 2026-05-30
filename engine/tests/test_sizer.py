from data.loaders import load_prices
from schemas.models import TargetWeights
from sizing.sizer import size_orders


def _latest_price(ticker: str) -> float:
    prices = load_prices()
    row = prices[prices["ticker"] == ticker].sort_values("date").iloc[-1]
    return float(row["adj_close"])


def _weights() -> TargetWeights:
    return TargetWeights(
        by_ticker={"VTI": 0.6, "BND": 0.4},
        by_sleeve={"us_equity": 0.6, "bonds": 0.4},
        blend_alpha=0.6,
        method="erc",
    )


def test_size_orders_allocates_capital_and_fractional_shares():
    plan = size_orders(_weights(), capital_on_hand=1000.0, monthly_surplus=0.0)

    assert plan.method == "lump_sum"
    assert plan.schedule == []
    buys = {buy.ticker: buy for buy in plan.buys}
    assert buys["VTI"].dollars == 600.0
    assert buys["BND"].dollars == 400.0
    assert buys["VTI"].shares == 600.0 / _latest_price("VTI")
    assert buys["BND"].shares == 400.0 / _latest_price("BND")


def test_size_orders_marks_dca_and_builds_monthly_schedule():
    plan = size_orders(_weights(), capital_on_hand=1200.0, monthly_surplus=250.0)

    assert plan.method == "dca"
    assert len(plan.schedule) == 12
    assert [entry.month_offset for entry in plan.schedule] == list(range(1, 13))
    assert {entry.contribution for entry in plan.schedule} == {250.0}
