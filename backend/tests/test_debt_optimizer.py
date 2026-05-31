import sys
from types import SimpleNamespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tax"))
from debt_optimizer import DebtPayoffOptimizer


def debt(kind, balance, apr):
    return SimpleNamespace(kind=kind, balance=balance, apr=apr)


def test_avalanche_pays_highest_apr_first():
    plan = DebtPayoffOptimizer().optimize(
        [
            debt("student", 5000, 0.06),
            debt("credit_card", 1000, 0.24),
        ],
        monthly_surplus=500,
        method="avalanche",
    )

    assert plan.monthly_schedule[0].targeted_debt_kind == "credit_card"


def test_snowball_pays_lowest_balance_first():
    plan = DebtPayoffOptimizer().optimize(
        [
            debt("credit_card", 5000, 0.24),
            debt("student", 1000, 0.06),
        ],
        monthly_surplus=500,
        method="snowball",
    )

    assert plan.monthly_schedule[0].targeted_debt_kind == "student"


def test_avalanche_saves_money_vs_snowball_for_right_debt_mix():
    optimizer = DebtPayoffOptimizer()
    debts = [
        debt("credit_card", 8000, 0.24),
        debt("student", 1000, 0.02),
    ]

    avalanche = optimizer.optimize(debts, monthly_surplus=500, method="avalanche")
    snowball = optimizer.optimize(debts, monthly_surplus=500, method="snowball")

    assert avalanche.total_interest_paid < snowball.total_interest_paid


def test_single_zero_apr_debt_pays_down_without_interest():
    plan = DebtPayoffOptimizer().optimize(
        [debt("other", 1000, 0.0)],
        monthly_surplus=0,
        method="avalanche",
    )

    assert plan.months_to_freedom == 40
    assert plan.total_interest_paid == 0
    assert plan.per_debt[0].payoff_month == 40


def test_months_to_freedom_is_finite_for_normal_inputs():
    plan = DebtPayoffOptimizer().optimize(
        [
            debt("credit_card", 3000, 0.19),
            debt("student", 12000, 0.05),
        ],
        monthly_surplus=800,
        method="avalanche",
    )

    assert plan.months_to_freedom is not None
    assert 0 < plan.months_to_freedom <= 360


def test_low_apr_mortgage_is_excluded_from_aggressive_payoff():
    plan = DebtPayoffOptimizer().optimize(
        [
            debt("mortgage", 340000, 0.064),
            debt("student", 18000, 0.058),
        ],
        monthly_surplus=2150,
        method="avalanche",
    )

    assert [item.kind for item in plan.per_debt] == ["student"]
    assert plan.excluded_debt_kinds == ["mortgage"]
    assert plan.excluded_debt_balance == 340000


def test_high_apr_mortgage_is_included_for_payoff():
    plan = DebtPayoffOptimizer().optimize(
        [
            debt("mortgage", 100000, 0.095),
            debt("student", 18000, 0.058),
        ],
        monthly_surplus=3000,
        method="avalanche",
    )

    assert plan.monthly_schedule[0].targeted_debt_kind == "mortgage"
    assert "mortgage" in [item.kind for item in plan.per_debt]


def test_upfront_cash_is_applied_before_monthly_schedule():
    plan = DebtPayoffOptimizer().optimize(
        [
            debt("credit_card", 3000, 0.24),
            debt("student", 5000, 0.05),
        ],
        monthly_surplus=500,
        upfront_cash=3000,
        method="avalanche",
    )

    assert plan.upfront_cash_applied == 3000
    assert plan.per_debt[0].kind == "credit_card"
    assert plan.per_debt[0].payoff_month == 0
    assert plan.monthly_schedule[0].targeted_debt_kind == "student"
