from datetime import datetime
from typing import List, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class TaxBracket(BaseModel):
    model_config = ConfigDict(extra="allow")

    rate: float
    min_income: float = Field(validation_alias=AliasChoices("min_income", "lower_bound"))
    max_income: Optional[float] = Field(validation_alias=AliasChoices("max_income", "upper_bound"))


class FederalTaxInfo(BaseModel):
    year: int
    filing_status: str
    brackets: List[TaxBracket]
    standard_deduction: float
    fica_social_security_rate: float
    fica_social_security_wage_base: float
    fica_medicare_rate: float
    additional_medicare_rate: float
    additional_medicare_threshold: float


class StateTaxInfo(BaseModel):
    year: int
    state_code: str
    filing_status: str
    brackets: List[TaxBracket]
    standard_deduction: float
    has_flat_rate: bool
    flat_rate: Optional[float]
    no_income_tax: bool


class LocalTaxInfo(BaseModel):
    zip_code: str
    city: str
    county: str
    state_code: str
    local_tax_rate: float
    notes: str


class TaxRateBundle(BaseModel):
    federal: FederalTaxInfo
    state: StateTaxInfo
    local: LocalTaxInfo
    retrieved_at: datetime
    tax_year: int


class TaxBreakdown(BaseModel):
    gross_income: float
    pretax_deductions: float
    agi: float
    federal_income_tax: float
    state_income_tax: float
    local_tax: float
    fica_social_security: float
    fica_medicare: float
    additional_medicare: float
    total_tax: float
    effective_tax_rate: float
    net_income: float
    tax_rate_bundle: TaxRateBundle
