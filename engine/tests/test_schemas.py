from schemas.models import Debt, UserProfile


def test_userprofile_roundtrips_and_rejects_bad_enum():
    p = UserProfile(
        household_income=78000,
        monthly_expenses=3200,
        capital_on_hand=6000,
        emergency_fund=1500,
        debts=[Debt(balance=9000, apr=0.22, kind="credit_card")],
        age=28,
        horizon_years=37,
        goals=["retirement"],
        goal_target=1_000_000,
        dependents=0,
        filing_status="single",
        risk_instrument_responses=[2] * 13,
        loss_scenario_response="sell_some",
        loss_aversion_probe=250.0,
        income_stability="mixed",
        universe_pref="etf",
        esg_exclusions=["fossil_fuels"],
        sector_theme_tilts=[],
        confidence={},
        uncertainty_flags=[],
    )
    assert p.debts[0].apr == 0.22

    import pytest

    with pytest.raises(Exception):
        Debt(balance=1, apr=0.1, kind="bitcoin")
