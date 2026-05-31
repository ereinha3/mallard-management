from gate.responsibility import evaluate_gate
from schemas.models import Debt
from tests.factories import maya_greenlit, maya_t0


def test_halt_when_emergency_fund_below_three_months():
    r = evaluate_gate(maya_t0())

    assert r.status == "halt"
    assert r.failed_check == "emergency_fund"
    assert r.math.target_amount == 9600


def test_boundary_exactly_three_months_passes_ef_check():
    p = maya_t0()
    p.emergency_fund = 9600

    r = evaluate_gate(p)

    assert r.failed_check != "emergency_fund"


def test_halt_on_high_apr_with_harm_math():
    p = maya_greenlit()
    p.debts = [Debt(balance=9000, apr=0.22, kind="credit_card")]

    r = evaluate_gate(p)

    assert r.status == "halt"
    assert r.failed_check == "high_interest_debt"
    assert r.math.guaranteed_return == 0.22
    assert round(r.math.expected_after_tax_market_return, 4) == 0.0595
    assert r.math.interest_accruing_annual == 1980.0
    assert round(r.math.net_advantage_annual, 1) == 1444.5


def test_boundary_apr_exactly_threshold_does_not_halt():
    p = maya_greenlit()
    p.debts = [Debt(balance=5000, apr=0.08, kind="personal")]

    assert evaluate_gate(p).failed_check != "high_interest_debt"


def test_low_interest_debt_noted_not_halted():
    p = maya_greenlit()
    p.debts = [Debt(balance=14000, apr=0.045, kind="student")]

    r = evaluate_gate(p)

    assert r.status == "greenlight"
    assert any("student" in note or "4.5" in note for note in r.notes)


def test_greenlight_returns_none_failure_and_no_math():
    r = evaluate_gate(maya_greenlit())

    assert r.status == "greenlight"
    assert r.failed_check == "none"
    assert r.math is None
    assert r.recommended_action == ""
