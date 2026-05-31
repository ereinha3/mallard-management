from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .models import BucketAllocation, BucketPlan


EMPLOYEE_401K_LIMIT_UNDER_50 = 23_500.0
EMPLOYEE_401K_LIMIT_50_PLUS = 31_000.0
IRA_LIMIT_UNDER_50 = 7_000.0
IRA_LIMIT_50_PLUS = 8_000.0
HSA_SELF_ONLY_LIMIT = 4_300.0
HSA_FAMILY_LIMIT = 8_550.0
HSA_CATCH_UP_55_PLUS = 1_000.0

TRAD_IRA_PHASEOUT = {
    "single": (79_000.0, 89_000.0),
    "head_of_household": (79_000.0, 89_000.0),
    "married_joint": (123_000.0, 143_000.0),
}
ROTH_IRA_PHASEOUT = {
    "single": (150_000.0, 165_000.0),
    "head_of_household": (150_000.0, 165_000.0),
    "married_joint": (236_000.0, 246_000.0),
}


@dataclass(frozen=True)
class _TaxContext:
    federal_brackets: list[Any]
    federal_standard_deduction: float
    state_brackets: list[Any]
    state_standard_deduction: float
    state_flat_rate: float | None
    state_no_income_tax: bool
    local_tax_rate: float


class BucketOptimizer:
    def optimize(
        self,
        gross_income: float,
        filing_status: str,
        age: int,
        monthly_surplus: float,
        employer_match_rate: float = 0.5,
        employer_match_cap_pct: float = 0.05,
        has_hsa: bool = False,
        hsa_coverage: str | None = None,
        tax_brackets: Any = None,
    ) -> BucketPlan:
        annual_surplus = max(0.0, float(monthly_surplus) * 12.0)
        remaining = annual_surplus
        taxable_remaining = 0.0
        buckets: list[BucketAllocation] = []
        pretax_total = 0.0
        used_401k = 0.0
        used_ira = 0.0

        tax_context = self._tax_context(tax_brackets)
        tax_before = self._estimate_tax(gross_income, 0.0, tax_context)

        def pretax_savings(contribution: float, previous_pretax: float) -> float:
            if contribution <= 0:
                return 0.0
            before = self._estimate_tax(gross_income, previous_pretax, tax_context)
            after = self._estimate_tax(gross_income, previous_pretax + contribution, tax_context)
            return max(0.0, before - after)

        def add_bucket(name: str, desired: float, limit: float, pretax: bool, notes: str) -> float:
            nonlocal remaining, pretax_total
            contribution = min(max(desired, 0.0), max(limit, 0.0), remaining)
            savings = pretax_savings(contribution, pretax_total) if pretax else 0.0
            if pretax:
                pretax_total += contribution
            remaining -= contribution
            buckets.append(
                BucketAllocation(
                    name=name,
                    annual_contribution=round(contribution, 2),
                    tax_savings=round(savings, 2),
                    is_maxed=limit > 0 and contribution >= limit - 0.01,
                    notes=notes,
                )
            )
            return contribution

        limit_401k = EMPLOYEE_401K_LIMIT_50_PLUS if age >= 50 else EMPLOYEE_401K_LIMIT_UNDER_50
        match_capture_limit = min(limit_401k, gross_income * max(0.0, employer_match_cap_pct))
        match_contribution = add_bucket(
            "401k employer match",
            match_capture_limit,
            match_capture_limit,
            True,
            (
                f"Contribute up to {employer_match_cap_pct * 100:.1f}% of salary to capture "
                f"an estimated {employer_match_rate * 100:.0f}% employer match."
            ),
        )
        used_401k += match_contribution

        hsa_limit = self._hsa_limit(age, has_hsa, hsa_coverage)
        add_bucket(
            "HSA",
            hsa_limit,
            hsa_limit,
            True,
            "Triple tax-advantaged bucket." if hsa_limit else "Skipped: no HSA-eligible HDHP coverage.",
        )

        remaining_401k_limit = max(0.0, limit_401k - used_401k)
        remainder_401k = add_bucket(
            "401k max remainder",
            remaining_401k_limit,
            remaining_401k_limit,
            True,
            "Additional employee deferral after capturing the employer match.",
        )
        used_401k += remainder_401k

        ira_limit = IRA_LIMIT_50_PLUS if age >= 50 else IRA_LIMIT_UNDER_50
        trad_ira_limit = self._trad_ira_deductible_limit(
            filing_status,
            gross_income - pretax_total,
            ira_limit,
        )
        trad_ira = add_bucket(
            "Traditional IRA",
            trad_ira_limit,
            ira_limit,
            True,
            "Deductible based on 2025 MAGI phase-out." if trad_ira_limit else "Skipped: MAGI is above the deductible IRA range.",
        )
        used_ira += trad_ira

        roth_limit = max(0.0, ira_limit - used_ira)
        roth_allowed = self._roth_ira_allowed_limit(filing_status, gross_income - pretax_total, roth_limit)
        add_bucket(
            "Roth IRA",
            roth_allowed,
            roth_limit,
            False,
            "Post-tax Roth contribution after Traditional IRA deductibility is limited."
            if roth_allowed
            else "Skipped: MAGI is above the direct Roth IRA range.",
        )

        if remaining > 0:
            taxable_remaining = remaining
            buckets.append(
                BucketAllocation(
                    name="Taxable brokerage",
                    annual_contribution=round(remaining, 2),
                    tax_savings=0.0,
                    is_maxed=False,
                    notes="Remainder after available tax-advantaged buckets.",
                )
            )
            remaining = 0.0

        tax_after = self._estimate_tax(gross_income, pretax_total, tax_context)
        return BucketPlan(
            buckets=buckets,
            total_pretax_contributions=round(pretax_total, 2),
            total_tax_savings=round(sum(bucket.tax_savings for bucket in buckets), 2),
            effective_tax_rate_before=round(tax_before / gross_income, 4) if gross_income > 0 else 0.0,
            effective_tax_rate_after=round(tax_after / gross_income, 4) if gross_income > 0 else 0.0,
            remaining_annual_surplus_for_taxable=round(taxable_remaining, 2),
        )

    def _trad_ira_deductible_limit(self, filing_status: str, magi: float, ira_limit: float) -> float:
        phaseout = TRAD_IRA_PHASEOUT.get(filing_status)
        if phaseout is None:
            return 0.0
        start, end = phaseout
        if magi <= start:
            return ira_limit
        if magi >= end:
            return 0.0
        return ira_limit * ((end - magi) / (end - start))

    def _roth_ira_allowed_limit(self, filing_status: str, magi: float, ira_limit: float) -> float:
        phaseout = ROTH_IRA_PHASEOUT.get(filing_status)
        if phaseout is None:
            return 0.0
        start, end = phaseout
        if magi <= start:
            return ira_limit
        if magi >= end:
            return 0.0
        return ira_limit * ((end - magi) / (end - start))

    def _hsa_limit(self, age: int, has_hsa: bool, hsa_coverage: str | None) -> float:
        if not has_hsa:
            return 0.0
        normalized = (hsa_coverage or "self_only").strip().lower().replace("-", "_")
        limit = HSA_FAMILY_LIMIT if normalized in {"family", "household"} else HSA_SELF_ONLY_LIMIT
        if age >= 55:
            limit += HSA_CATCH_UP_55_PLUS
        return limit

    def _tax_context(self, tax_brackets: Any) -> _TaxContext | None:
        if tax_brackets is None:
            return None
        bundle = getattr(tax_brackets, "tax_rate_bundle", tax_brackets)
        federal = getattr(bundle, "federal", None)
        state = getattr(bundle, "state", None)
        local = getattr(bundle, "local", None)
        if federal is None:
            return None
        return _TaxContext(
            federal_brackets=list(getattr(federal, "brackets", []) or []),
            federal_standard_deduction=float(getattr(federal, "standard_deduction", 0.0) or 0.0),
            state_brackets=list(getattr(state, "brackets", []) or []) if state is not None else [],
            state_standard_deduction=float(getattr(state, "standard_deduction", 0.0) or 0.0) if state is not None else 0.0,
            state_flat_rate=getattr(state, "flat_rate", None) if state is not None and getattr(state, "has_flat_rate", False) else None,
            state_no_income_tax=bool(getattr(state, "no_income_tax", False)) if state is not None else True,
            local_tax_rate=float(getattr(local, "local_tax_rate", 0.0) or 0.0) if local is not None else 0.0,
        )

    def _estimate_tax(self, gross_income: float, pretax_deductions: float, context: _TaxContext | None) -> float:
        if context is None:
            return 0.0
        agi = max(0.0, gross_income - pretax_deductions)
        federal_taxable = max(0.0, agi - context.federal_standard_deduction)
        federal_tax = self._apply_progressive_brackets(federal_taxable, context.federal_brackets)
        if context.state_no_income_tax:
            state_tax = 0.0
        elif context.state_flat_rate is not None:
            state_tax = agi * float(context.state_flat_rate)
        else:
            state_taxable = max(0.0, agi - context.state_standard_deduction)
            state_tax = self._apply_progressive_brackets(state_taxable, context.state_brackets)
        return federal_tax + state_tax + (gross_income * context.local_tax_rate)

    def _apply_progressive_brackets(self, taxable_income: float, brackets: list[Any]) -> float:
        tax = 0.0
        for bracket in brackets:
            lower = self._value(bracket, "lower_bound", self._value(bracket, "min_income", 0.0))
            upper = self._value(bracket, "upper_bound", self._value(bracket, "max_income", None))
            lower = float(lower or 0.0)
            if taxable_income <= lower:
                continue
            top = float(upper) if upper is not None else taxable_income
            tax += (min(taxable_income, top) - lower) * float(self._value(bracket, "rate", 0.0) or 0.0)
            if upper is None or taxable_income <= top:
                break
        return tax

    def _value(self, obj: Any, name: str, default: Any = None) -> Any:
        if isinstance(obj, dict):
            return obj.get(name, default)
        return getattr(obj, name, default)
