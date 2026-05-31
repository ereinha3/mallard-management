from schemas.models import Positions
from tax.report import tax_report


def _positions_with_loss(unrealized_loss: float) -> Positions:
    basis = 5000.0
    return Positions(
        items=[
            {
                "ticker": "BND",
                "shares": 10.0,
                "avg_cost": basis / 10.0,
                "market_value": basis - unrealized_loss,
            },
        ],
        portfolio_value=basis - unrealized_loss,
        cash=0.0,
    )


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
    assert report.harvestable[0].estimated_tax_value is None
    assert report.harvestable[0].tax_rate_used is None
    assert len(report.wash_sale_warnings) == 1
    assert report.wash_sale_warnings[0].ticker == "BND"
    assert report.wash_sale_warnings[0].window_days == 30
    assert report.wash_sale_warnings[0].suggested_replacement != "BND"
    assert any("$3,000" in note for note in report.after_tax_notes)


def test_tax_report_estimates_ordinary_offset_value_for_small_loss():
    report = tax_report(
        _positions_with_loss(50.0),
        cost_basis={"BND": 5000.0},
        filing_status="single",
        bracket=0.22,
    )

    assert report.harvestable[0].estimated_tax_value == 11.0
    assert report.harvestable[0].tax_rate_used == 0.22


def test_tax_report_caps_single_ordinary_loss_offset_value():
    report = tax_report(
        _positions_with_loss(5000.0),
        cost_basis={"BND": 5000.0},
        filing_status="single",
        bracket=0.22,
    )

    assert report.harvestable[0].estimated_tax_value == 660.0
    assert report.harvestable[0].tax_rate_used == 0.22


def test_tax_report_caps_married_separate_ordinary_loss_offset_value():
    report = tax_report(
        _positions_with_loss(5000.0),
        cost_basis={"BND": 5000.0},
        filing_status="married_separate",
        bracket=0.22,
    )

    assert report.harvestable[0].estimated_tax_value == 330.0
    assert report.harvestable[0].tax_rate_used == 0.22


def test_tax_report_uses_explicit_top_ordinary_bracket_for_loss_value():
    report = tax_report(
        _positions_with_loss(50.0),
        cost_basis={"BND": 5000.0},
        filing_status="single",
        bracket=0.37,
    )

    assert report.harvestable[0].estimated_tax_value == 18.5
    assert report.harvestable[0].tax_rate_used == 0.37


def test_ltcg_rate_boundaries_and_clamping():
    from tax.rates import ltcg_rate_for_bracket, normalize_bracket

    assert ltcg_rate_for_bracket(0.12) == 0.0
    assert ltcg_rate_for_bracket(0.35) == 0.15
    assert ltcg_rate_for_bracket(1.0) == 0.20
    assert ltcg_rate_for_bracket(None) == 0.15
    assert normalize_bracket(1.5) == 1.0
    assert normalize_bracket(-0.1) == 0.0
    assert normalize_bracket(float("nan")) is None


def test_tax_report_clamps_out_of_range_bracket():
    report = tax_report(
        _positions_with_loss(50.0),
        cost_basis={"BND": 5000.0},
        filing_status="single",
        bracket=1.5,
    )
    # Out-of-range bracket clamps to 1.0; estimated value cannot exceed the loss.
    assert report.harvestable[0].estimated_tax_value == 50.0
    assert report.harvestable[0].tax_rate_used == 1.0
