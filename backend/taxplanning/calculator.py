import os

from google import genai

from .lookup import TaxLookup
from .models import TaxBreakdown


class TaxCalculator:
    def __init__(self, lookup=None):
        self.lookup = lookup or TaxLookup(
            client=genai.Client(api_key=os.environ.get("GOOGLE_API_KEY", ""))
        )

    async def calculate(
        self,
        gross_income,
        filing_status,
        zip_code,
        pretax_401k=0.0,
        pretax_ira=0.0,
        pretax_hsa=0.0,
        tax_year=2025,
    ) -> TaxBreakdown:
        tax_rate_bundle = await self._get_tax_rate_bundle(zip_code, filing_status, tax_year)
        federal = tax_rate_bundle.federal
        state = tax_rate_bundle.state
        local = tax_rate_bundle.local

        pretax_deductions = pretax_401k + pretax_ira + pretax_hsa
        agi = gross_income - pretax_deductions
        federal_taxable = max(0, agi - federal.standard_deduction)
        federal_income_tax = self._apply_progressive_brackets(
            federal_taxable, federal.brackets
        )

        state_taxable = max(0, agi - state.standard_deduction)
        if state.no_income_tax:
            state_income_tax = 0
        elif state.has_flat_rate:
            state_income_tax = state.flat_rate * agi
        else:
            state_income_tax = self._apply_progressive_brackets(
                state_taxable, state.brackets
            )

        local_tax = gross_income * local.local_tax_rate
        fica_social_security = (
            min(gross_income, federal.fica_social_security_wage_base)
            * federal.fica_social_security_rate
        )
        fica_medicare = gross_income * federal.fica_medicare_rate
        additional_medicare = (
            max(0, gross_income - federal.additional_medicare_threshold)
            * federal.additional_medicare_rate
        )
        total_tax = (
            federal_income_tax
            + state_income_tax
            + local_tax
            + fica_social_security
            + fica_medicare
            + additional_medicare
        )
        effective_tax_rate = total_tax / gross_income if gross_income > 0 else 0
        net_income = gross_income - total_tax - pretax_deductions

        return TaxBreakdown(
            gross_income=gross_income,
            pretax_deductions=pretax_deductions,
            agi=agi,
            federal_income_tax=federal_income_tax,
            state_income_tax=state_income_tax,
            local_tax=local_tax,
            fica_social_security=fica_social_security,
            fica_medicare=fica_medicare,
            additional_medicare=additional_medicare,
            total_tax=total_tax,
            effective_tax_rate=effective_tax_rate,
            net_income=net_income,
            tax_rate_bundle=tax_rate_bundle,
        )

    def _apply_progressive_brackets(self, taxable_income, brackets):
        tax = 0
        for bracket in brackets:
            lower_bound = self._value(bracket, "lower_bound", self._value(bracket, "min_income", 0))
            upper_bound = self._value(bracket, "upper_bound", self._value(bracket, "max_income", None))
            if taxable_income <= lower_bound:
                continue
            bracket_top = upper_bound if upper_bound is not None else taxable_income
            taxed_amount = min(taxable_income, bracket_top) - lower_bound
            tax += taxed_amount * self._value(bracket, "rate", 0)
            if upper_bound is None or taxable_income <= upper_bound:
                break
        return tax

    async def _get_tax_rate_bundle(self, zip_code, filing_status, tax_year):
        if hasattr(self.lookup, "get_tax_rates"):
            return await self.lookup.get_tax_rates(zip_code, filing_status, tax_year)
        return await self.lookup.lookup(zip_code, filing_status, tax_year)

    def _value(self, obj, name, default=None):
        if isinstance(obj, dict):
            return obj.get(name, default)
        return getattr(obj, name, default)
