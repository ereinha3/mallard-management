import json

import pytest

from tax.lookup import TaxLookup, TaxLookupError
from tax.models import TaxRateBundle


class MockResponse:
    def __init__(self, text):
        self.text = text


class MockModels:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return MockResponse(self.responses.pop(0))


class MockAio:
    def __init__(self, responses):
        self.models = MockModels(responses)


class MockClient:
    def __init__(self, responses):
        self.aio = MockAio(responses)


def federal_json():
    return json.dumps(
        {
            "year": 2024,
            "filing_status": "single",
            "brackets": [
                {"rate": 0.1, "min_income": 0, "max_income": 11600},
                {"rate": 0.12, "min_income": 11600, "max_income": 47150},
            ],
            "standard_deduction": 14600,
            "fica_social_security_rate": 0.062,
            "fica_social_security_wage_base": 168600,
            "fica_medicare_rate": 0.0145,
            "additional_medicare_rate": 0.009,
            "additional_medicare_threshold": 200000,
        }
    )


def state_json():
    return json.dumps(
        {
            "year": 2024,
            "state_code": "CA",
            "filing_status": "single",
            "brackets": [
                {"rate": 0.01, "min_income": 0, "max_income": 10756},
                {"rate": 0.02, "min_income": 10756, "max_income": 25499},
            ],
            "standard_deduction": 5363,
            "has_flat_rate": False,
            "flat_rate": None,
            "no_income_tax": False,
        }
    )


def local_json():
    return json.dumps(
        {
            "zip_code": "94105",
            "city": "San Francisco",
            "county": "San Francisco",
            "state_code": "CA",
            "local_tax_rate": 0,
            "notes": "No city or county income tax.",
        }
    )


def make_lookup(responses):
    lookup = TaxLookup(client=MockClient(responses))
    lookup.model = "gemini-test"
    return lookup


@pytest.mark.asyncio
async def test_cache_hit_avoids_second_gemini_call():
    lookup = make_lookup([federal_json(), state_json(), local_json()])

    first = await lookup.get_tax_rates("94105", "single", 2024)
    second = await lookup.get_tax_rates("94105", "single", 2024)

    assert first is second
    assert len(lookup.client.aio.models.calls) == 3


@pytest.mark.asyncio
async def test_federal_state_local_data_parses_into_bundle():
    lookup = make_lookup([federal_json(), state_json(), local_json()])

    bundle = await lookup.get_tax_rates("94105", "single", 2024)

    assert isinstance(bundle, TaxRateBundle)
    assert bundle.federal.standard_deduction == 14600
    assert bundle.federal.brackets[0].rate == 0.1
    assert bundle.state.state_code == "CA"
    assert bundle.state.brackets[1].max_income == 25499
    assert bundle.local.city == "San Francisco"
    assert bundle.local.local_tax_rate == 0
    assert bundle.tax_year == 2024


@pytest.mark.asyncio
async def test_lookup_error_is_raised_on_bad_json():
    lookup = make_lookup(["not json"])

    with pytest.raises(TaxLookupError) as exc_info:
        await lookup._fetch_local_rates("94105")

    assert "not json" in str(exc_info.value)
