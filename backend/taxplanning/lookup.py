import json
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Tuple

from google import genai
from pydantic import ValidationError

from taxplanning.models import FederalTaxInfo, LocalTaxInfo, StateTaxInfo, TaxRateBundle

GEMINI_MODEL = "gemini-2.5-pro"


class TaxLookupError(Exception):
    pass


CacheKey = Tuple[str, str, int]


class TaxLookup:
    def __init__(self, client=None) -> None:
        self.client = client or genai.Client(api_key=os.environ.get("GOOGLE_API_KEY", ""))
        self.model = GEMINI_MODEL
        self._cache: Dict[CacheKey, Tuple[datetime, TaxRateBundle]] = {}
        self._cache_ttl = timedelta(hours=24)

    async def get_tax_rates(
        self, zip_code: str | None, filing_status: str, tax_year: int, state_code: str | None = None
    ) -> TaxRateBundle:
        normalized_zip = (zip_code or "").strip()
        normalized_status = (filing_status or "single").strip() or "single"
        normalized_state = (state_code or "").strip().upper()
        cache_key = (normalized_zip or normalized_state, normalized_status, tax_year)
        cached = self._cache.get(cache_key)
        now = datetime.now(timezone.utc)

        if cached and now - cached[0] < self._cache_ttl:
            return cached[1]

        resolved_state_code = normalized_state or self._zip_to_state(normalized_zip)
        federal = await self._safe_fetch(
            self._fetch_federal_rates(normalized_status, tax_year),
            self._default_federal(normalized_status, tax_year),
        )
        state = await self._safe_fetch(
            self._fetch_state_rates(resolved_state_code, normalized_status, tax_year),
            self._default_state(resolved_state_code, normalized_status, tax_year),
        )
        local = await self._safe_fetch(
            self._fetch_local_rates(normalized_zip, resolved_state_code),
            self._default_local(normalized_zip, resolved_state_code),
        )
        bundle = TaxRateBundle(
            federal=federal,
            state=state,
            local=local,
            retrieved_at=now,
            tax_year=tax_year,
        )
        self._cache[cache_key] = (now, bundle)
        return bundle

    async def _fetch_federal_rates(
        self, filing_status: str, tax_year: int
    ) -> FederalTaxInfo:
        prompt = (
            "Return valid JSON only, with no markdown fences or explanatory text. "
            "Use this exact object shape: "
            '{"year": int, "filing_status": str, "brackets": [{"rate": float, '
            '"min_income": float, "max_income": float or null}], '
            '"standard_deduction": float, "fica_social_security_rate": float, '
            '"fica_social_security_wage_base": float, "fica_medicare_rate": float, '
            '"additional_medicare_rate": float, '
            '"additional_medicare_threshold": float}. '
            f"Retrieve IRS federal income tax brackets, standard deduction, FICA "
            f"Social Security rate and wage base, Medicare rate, additional "
            f"Medicare rate, and additional Medicare threshold for tax year "
            f"{tax_year} and filing status {filing_status}."
        )
        return await self._generate_json(prompt, FederalTaxInfo)

    async def _fetch_state_rates(
        self, state_code: str, filing_status: str, tax_year: int
    ) -> StateTaxInfo:
        prompt = (
            "Return valid JSON only, with no markdown fences or explanatory text. "
            "Use this exact object shape: "
            '{"year": int, "state_code": str, "filing_status": str, '
            '"brackets": [{"rate": float, "min_income": float, '
            '"max_income": float or null}], "standard_deduction": float, '
            '"has_flat_rate": bool, "flat_rate": float or null, '
            '"no_income_tax": bool}. '
            f"Retrieve state income tax brackets, standard deduction, flat-rate "
            f"status, flat rate, and no-income-tax flag for {state_code}, tax "
            f"year {tax_year}, filing status {filing_status}."
        )
        return await self._generate_json(prompt, StateTaxInfo)

    async def _fetch_local_rates(self, zip_code: str, state_code: str | None = None) -> LocalTaxInfo:
        prompt = (
            "Return valid JSON only, with no markdown fences or explanatory text. "
            "Use this exact object shape: "
            '{"zip_code": str, "city": str, "county": str, "state_code": str, '
            '"local_tax_rate": float, "notes": str}. '
            f"Retrieve city and county local earned income or local income tax "
            f"rate for ZIP code {zip_code or 'unknown'}"
            f"{f' in state {state_code}' if state_code else ''}. If there is no local income tax, "
            f"return local_tax_rate as 0 and explain briefly in notes."
        )
        return await self._generate_json(prompt, LocalTaxInfo)

    def _zip_to_state(self, zip_code: str) -> str:
        if not zip_code or len(zip_code) < 5 or not zip_code[:5].isdigit():
            return ""
        zip_int = int(zip_code[:5])
        ranges = [
            (35000, 36999, "AL"),
            (99500, 99999, "AK"),
            (85000, 86999, "AZ"),
            (71600, 72999, "AR"),
            (90000, 96699, "CA"),
            (80000, 81999, "CO"),
            (6000, 6999, "CT"),
            (19700, 19999, "DE"),
            (20000, 20599, "DC"),
            (32000, 34999, "FL"),
            (30000, 31999, "GA"),
            (96700, 96999, "HI"),
            (83200, 83999, "ID"),
            (60000, 62999, "IL"),
            (46000, 47999, "IN"),
            (50000, 52999, "IA"),
            (66000, 67999, "KS"),
            (40000, 42999, "KY"),
            (70000, 71599, "LA"),
            (3900, 4999, "ME"),
            (20600, 21999, "MD"),
            (1000, 2799, "MA"),
            (48000, 49999, "MI"),
            (55000, 56999, "MN"),
            (38600, 39999, "MS"),
            (63000, 65999, "MO"),
            (59000, 59999, "MT"),
            (68000, 69999, "NE"),
            (88900, 89999, "NV"),
            (3000, 3899, "NH"),
            (7000, 8999, "NJ"),
            (87000, 88499, "NM"),
            (10000, 14999, "NY"),
            (27000, 28999, "NC"),
            (58000, 58999, "ND"),
            (43000, 45999, "OH"),
            (73000, 74999, "OK"),
            (97000, 97999, "OR"),
            (15000, 19699, "PA"),
            (300, 999, "PR"),
            (2800, 2999, "RI"),
            (29000, 29999, "SC"),
            (57000, 57999, "SD"),
            (37000, 38599, "TN"),
            (75000, 79999, "TX"),
            (88500, 88599, "TX"),
            (84000, 84999, "UT"),
            (5000, 5999, "VT"),
            (22000, 24699, "VA"),
            (98000, 99499, "WA"),
            (24700, 26999, "WV"),
            (53000, 54999, "WI"),
            (82000, 83199, "WY"),
        ]
        for start, end, state_code in ranges:
            if start <= zip_int <= end:
                return state_code
        return ""

    async def _generate_json(self, prompt: str, model_class):
        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=prompt,
        )
        raw_text = response.text or ""

        try:
            data = json.loads(self._strip_json_fences(raw_text))
            if hasattr(model_class, "model_validate"):
                return model_class.model_validate(data)
            return model_class.parse_obj(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise TaxLookupError(f"Unable to parse Gemini tax response: {raw_text}") from exc

    async def _safe_fetch(self, awaitable, default):
        try:
            return await awaitable
        except Exception:
            return default

    def _strip_json_fences(self, raw_text: str) -> str:
        text = raw_text.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].strip().startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        return text

    def _default_federal(self, filing_status: str, tax_year: int) -> FederalTaxInfo:
        return FederalTaxInfo(
            year=tax_year,
            filing_status=filing_status,
            brackets=[],
            standard_deduction=0.0,
            fica_social_security_rate=0.062,
            fica_social_security_wage_base=176100.0,
            fica_medicare_rate=0.0145,
            additional_medicare_rate=0.009,
            additional_medicare_threshold=250000.0
            if filing_status == "married_joint"
            else 125000.0
            if filing_status == "married_separate"
            else 200000.0,
        )

    def _default_state(self, state_code: str, filing_status: str, tax_year: int) -> StateTaxInfo:
        return StateTaxInfo(
            year=tax_year,
            state_code=state_code,
            filing_status=filing_status,
            brackets=[],
            standard_deduction=0.0,
            has_flat_rate=False,
            flat_rate=None,
            no_income_tax=True,
        )

    def _default_local(self, zip_code: str, state_code: str) -> LocalTaxInfo:
        return LocalTaxInfo(
            zip_code=zip_code,
            city="",
            county="",
            state_code=state_code,
            local_tax_rate=0.0,
            notes="Defaulted to no local income tax because lookup data was unavailable.",
        )
