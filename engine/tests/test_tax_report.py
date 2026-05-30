from schemas.models import Positions
from tax.report import tax_report


def test_tax_report_flags_harvestable_losses_and_wash_sale_warning():
    positions = Positions(
        items=[
            {"ticker": "BND", "shares": 10.0, "avg_cost": 100.0, "market_value": 950.0},
            {"ticker": "GLD", "shares": 5.0, "avg_cost": 200.0, "market_value": 1200.0},
        ],
        portfolio_value=2150.0,
        cash=0.0,
    )

    report = tax_report(positions, cost_basis={"BND": 1000.0, "GLD": 1000.0}, filing_status="single")

    assert len(report.harvestable) == 1
    assert report.harvestable[0].ticker == "BND"
    assert report.harvestable[0].unrealized_loss == 50.0
    assert len(report.wash_sale_warnings) == 1
    assert report.wash_sale_warnings[0].ticker == "BND"
    assert report.wash_sale_warnings[0].window_days == 30
    assert report.wash_sale_warnings[0].suggested_replacement != "BND"
    assert any("$3,000" in note for note in report.after_tax_notes)
