from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import models as api_models


AGGRESSIVE_PAYOFF_KINDS = {"credit_card", "personal", "student", "student_loan", "auto", "other"}
DEFAULT_MORTGAGE_APR_THRESHOLD = 0.08


@dataclass
class _DebtState:
    index: int
    kind: str
    balance: float
    apr: float
    minimum_payment: float
    starting_balance: float
    total_interest_paid: float = 0.0
    payoff_month: int | None = None


class DebtPayoffOptimizer:
    def optimize(
        self,
        debts: list[Any],
        monthly_surplus: float,
        method: Literal["avalanche", "snowball"] = "avalanche",
        upfront_cash: float = 0.0,
        include_mortgage: bool = False,
        mortgage_apr_threshold: float = DEFAULT_MORTGAGE_APR_THRESHOLD,
    ) -> api_models.DebtPayoffPlan:
        eligible_debts = []
        excluded_debts = []
        for debt in debts:
            if float(getattr(debt, "balance", 0.0)) <= 0:
                continue
            if self._is_eligible_for_aggressive_payoff(debt, include_mortgage, mortgage_apr_threshold):
                eligible_debts.append(debt)
            else:
                excluded_debts.append(debt)
        states = [
            _DebtState(
                index=index,
                kind=str(getattr(debt, "kind", getattr(debt, "type", "other"))),
                balance=float(getattr(debt, "balance")),
                apr=float(getattr(debt, "apr", getattr(debt, "rate", 0.0))),
                minimum_payment=self._minimum_payment(debt),
                starting_balance=float(getattr(debt, "balance")),
            )
            for index, debt in enumerate(eligible_debts)
            if float(getattr(debt, "balance", 0.0)) > 0
        ]
        minimums_total = sum(debt.minimum_payment for debt in states)
        monthly_free_cash = minimums_total + max(0.0, float(monthly_surplus))
        upfront_cash_applied = self._apply_upfront_cash(states, max(0.0, float(upfront_cash)), method)
        schedule: list[api_models.DebtPayoffMonth] = []

        for month in range(1, 361):
            active = [debt for debt in states if debt.balance > 0.005]
            if not active:
                break

            target = self._target(active, method)
            targeted_kind = target.kind
            starting_total_balance = sum(debt.balance for debt in active)
            interest_paid = 0.0

            for debt in active:
                interest = debt.balance * debt.apr / 12.0
                debt.balance += interest
                debt.total_interest_paid += interest
                interest_paid += interest

            for debt in active:
                payment = min(debt.minimum_payment, debt.balance)
                debt.balance -= payment
                if debt.balance <= 0.005 and debt.payoff_month is None:
                    debt.balance = 0.0
                    debt.payoff_month = month

            extra_payment = max(0.0, monthly_free_cash - sum(debt.minimum_payment for debt in active))
            while extra_payment > 0.005:
                extra_targets = [debt for debt in states if debt.balance > 0.005]
                if not extra_targets:
                    break
                target = self._target(extra_targets, method)
                payment = min(extra_payment, target.balance)
                target.balance -= payment
                extra_payment -= payment
                if target.balance <= 0.005 and target.payoff_month is None:
                    target.balance = 0.0
                    target.payoff_month = month

            ending_total_balance = sum(max(0.0, debt.balance) for debt in states)

            schedule.append(
                api_models.DebtPayoffMonth(
                    month=month,
                    total_balance_remaining=round(ending_total_balance, 2),
                    interest_paid=round(interest_paid, 2),
                    principal_paid=round(max(0.0, starting_total_balance - ending_total_balance), 2),
                    targeted_debt_kind=targeted_kind,
                )
            )

        total_balance_remaining = sum(max(0.0, debt.balance) for debt in states)
        months_to_freedom = next(
            (month.month for month in reversed(schedule) if (month.total_balance_remaining or 0.0) <= 0.01),
            360 if total_balance_remaining > 0.01 and states else 0,
        )

        return api_models.DebtPayoffPlan(
            method=method,
            payoff_scope="consumer_debt",
            months_to_freedom=months_to_freedom,
            total_interest_paid=round(sum(debt.total_interest_paid for debt in states), 2),
            upfront_cash_applied=round(upfront_cash_applied, 2),
            monthly_payment_budget=round(monthly_free_cash, 2),
            monthly_schedule=schedule,
            per_debt=[
                api_models.DebtPayoffDetail(
                    kind=debt.kind,
                    starting_balance=round(debt.starting_balance, 2),
                    payoff_month=debt.payoff_month,
                    total_interest_paid=round(debt.total_interest_paid, 2),
                )
                for debt in states
            ],
            monthly_free_cash_after_payoff=round(monthly_free_cash, 2),
            excluded_debt_kinds=sorted(
                {str(getattr(debt, "kind", getattr(debt, "type", "other"))) for debt in excluded_debts}
            ),
            excluded_debt_balance=round(
                sum(float(getattr(debt, "balance", 0.0)) for debt in excluded_debts),
                2,
            ),
        )

    def _target(
        self,
        debts: list[_DebtState],
        method: Literal["avalanche", "snowball"],
    ) -> _DebtState:
        if method == "snowball":
            return min(debts, key=lambda debt: (debt.balance, -debt.apr, debt.index))
        return max(debts, key=lambda debt: (debt.apr, debt.balance, -debt.index))

    def _minimum_payment(self, debt: Any) -> float:
        explicit = getattr(debt, "minimum_payment", None)
        if explicit is None:
            explicit = getattr(debt, "min_payment", None)
        balance = float(getattr(debt, "balance"))
        if explicit is not None and float(explicit) > 0:
            return min(float(explicit), balance)
        return min(max(balance * 0.02, 25.0), balance)

    def _apply_upfront_cash(
        self,
        debts: list[_DebtState],
        upfront_cash: float,
        method: Literal["avalanche", "snowball"],
    ) -> float:
        applied = 0.0
        while upfront_cash > 0.005:
            active = [debt for debt in debts if debt.balance > 0.005]
            if not active:
                break
            target = self._target(active, method)
            payment = min(upfront_cash, target.balance)
            target.balance -= payment
            upfront_cash -= payment
            applied += payment
            if target.balance <= 0.005 and target.payoff_month is None:
                target.balance = 0.0
                target.payoff_month = 0
        return applied

    def _is_eligible_for_aggressive_payoff(
        self,
        debt: Any,
        include_mortgage: bool,
        mortgage_apr_threshold: float,
    ) -> bool:
        if float(getattr(debt, "balance", 0.0)) <= 0:
            return False
        kind = str(getattr(debt, "kind", getattr(debt, "type", "other"))).lower()
        apr = float(getattr(debt, "apr", getattr(debt, "rate", 0.0)))
        if kind == "mortgage":
            return include_mortgage or apr >= mortgage_apr_threshold
        return kind in AGGRESSIVE_PAYOFF_KINDS
