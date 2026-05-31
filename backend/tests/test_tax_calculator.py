import pytest

import tax.calculator as calculator_module
from tax.calculator import TaxCalculator
from tax.models import (
    FederalTaxInfo,
    LocalTaxInfo,
    StateTaxInfo,
    TaxBracket,
    TaxRateBundle,
)


class MockTaxLookup:
    def __init__(self, bundle):
        self.bundle = bundle

    async def lookup(self, zip_code, filing_status, tax_year):
        return self.bundle


def make_bundle(no_income_tax=False):
    def construct(model, **kwargs):
        if hasattr(model, "model_construct"):
            return model.model_construct(**kwargs)
        return model.construct(**kwargs)

    return construct(
        TaxRateBundle,
        federal=construct(
            FederalTaxInfo,
            standard_deduction=15000,
            brackets=[
                construct(TaxBracket, lower_bound=0, upper_bound=10000, rate=0.1),
                construct(TaxBracket, lower_bound=10000, upper_bound=None, rate=0.2),
            ],
            fica_social_security_rate=0.062,
            fica_social_security_wage_base=176100,
            fica_medicare_rate=0.0145,
            additional_medicare_rate=0.009,
            additional_medicare_threshold=200000,
        ),
        state=construct(
            StateTaxInfo,
            state="CA",
            standard_deduction=5000,
            brackets=[
                construct(TaxBracket, lower_bound=0, upper_bound=10000, rate=0.04),
                construct(TaxBracket, lower_bound=10000, upper_bound=None, rate=0.06),
            ],
            has_flat_rate=False,
            flat_rate=0,
            no_income_tax=no_income_tax,
        ),
        local=construct(
            LocalTaxInfo,
            locality="Test",
            local_tax_rate=0.01,
        ),
    )


@pytest.mark.asyncio
async def test_full_gross_to_net_with_all_pretax_deductions(monkeypatch):
    monkeypatch.setattr(calculator_module.genai, "Client", lambda api_key: None)
    calculator = TaxCalculator()
    calculator.lookup = MockTaxLookup(make_bundle())

    result = await calculator.calculate(
        gross_income=100000,
        filing_status="single",
        zip_code="94105",
        pretax_401k=10000,
        pretax_ira=5000,
        pretax_hsa=3000,
    )

    assert result.pretax_deductions == 18000
    assert result.agi == 82000
    assert result.federal_income_tax == 12400
    assert result.state_income_tax == 4420
    assert result.local_tax == 1000
    assert result.fica_social_security == 6200
    assert result.fica_medicare == 1450
    assert result.additional_medicare == 0
    assert result.total_tax == 25470
    assert result.effective_tax_rate == 0.2547
    assert result.net_income == 56530


@pytest.mark.asyncio
async def test_zero_pretax_deductions(monkeypatch):
    monkeypatch.setattr(calculator_module.genai, "Client", lambda api_key: None)
    calculator = TaxCalculator()
    calculator.lookup = MockTaxLookup(make_bundle())

    result = await calculator.calculate(
        gross_income=50000,
        filing_status="single",
        zip_code="94105",
    )

    assert result.pretax_deductions == 0
    assert result.agi == 50000
    assert result.federal_income_tax == 6000
    assert result.state_income_tax == 2500
    assert result.local_tax == 500
    assert result.fica_social_security == 3100
    assert result.fica_medicare == 725
    assert result.total_tax == 12825
    assert result.net_income == 37175


@pytest.mark.asyncio
async def test_no_income_tax_state_case(monkeypatch):
    monkeypatch.setattr(calculator_module.genai, "Client", lambda api_key: None)
    calculator = TaxCalculator()
    calculator.lookup = MockTaxLookup(make_bundle(no_income_tax=True))

    result = await calculator.calculate(
        gross_income=50000,
        filing_status="single",
        zip_code="98101",
    )

    assert result.state_income_tax == 0
    assert result.total_tax == 10325
    assert result.net_income == 39675
