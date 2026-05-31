from taxplanning.bucket_optimizer import BucketOptimizer
from taxplanning.models import (
    FederalTaxInfo,
    LocalTaxInfo,
    StateTaxInfo,
    TaxBracket,
    TaxRateBundle,
)


def construct(model, **kwargs):
    if hasattr(model, "model_construct"):
        return model.model_construct(**kwargs)
    return model.construct(**kwargs)


def make_bundle():
    return construct(
        TaxRateBundle,
        federal=construct(
            FederalTaxInfo,
            standard_deduction=15_000,
            brackets=[
                construct(TaxBracket, min_income=0, max_income=50_000, rate=0.12),
                construct(TaxBracket, min_income=50_000, max_income=150_000, rate=0.22),
                construct(TaxBracket, min_income=150_000, max_income=None, rate=0.32),
            ],
            fica_social_security_rate=0.062,
            fica_social_security_wage_base=176_100,
            fica_medicare_rate=0.0145,
            additional_medicare_rate=0.009,
            additional_medicare_threshold=200_000,
        ),
        state=construct(
            StateTaxInfo,
            standard_deduction=5_000,
            brackets=[
                construct(TaxBracket, min_income=0, max_income=60_000, rate=0.04),
                construct(TaxBracket, min_income=60_000, max_income=None, rate=0.06),
            ],
            has_flat_rate=False,
            flat_rate=0,
            no_income_tax=False,
        ),
        local=construct(
            LocalTaxInfo,
            local_tax_rate=0.0,
        ),
    )


def by_name(plan):
    return {bucket.name: bucket for bucket in plan.buckets}


def test_high_earner_with_surplus_maxes_available_buckets_and_routes_taxable():
    plan = BucketOptimizer().optimize(
        gross_income=120_000,
        filing_status="married_joint",
        age=45,
        monthly_surplus=6_000,
        employer_match_rate=0.5,
        employer_match_cap_pct=0.05,
        has_hsa=True,
        hsa_coverage="family",
        tax_brackets=make_bundle(),
    )

    buckets = by_name(plan)
    assert buckets["401k employer match"].annual_contribution == 6_000
    assert buckets["HSA"].annual_contribution == 8_550
    assert buckets["401k max remainder"].annual_contribution == 17_500
    assert buckets["Traditional IRA"].annual_contribution == 7_000
    assert buckets["Taxable brokerage"].annual_contribution == 32_950
    assert plan.total_pretax_contributions == 39_050
    assert plan.total_tax_savings > 0


def test_low_earner_can_only_capture_employer_match():
    plan = BucketOptimizer().optimize(
        gross_income=60_000,
        filing_status="single",
        age=30,
        monthly_surplus=250,
        employer_match_rate=0.5,
        employer_match_cap_pct=0.05,
        has_hsa=True,
        hsa_coverage="self_only",
        tax_brackets=make_bundle(),
    )

    buckets = by_name(plan)
    assert buckets["401k employer match"].annual_contribution == 3_000
    assert buckets["401k employer match"].is_maxed
    assert buckets["HSA"].annual_contribution == 0
    assert buckets["401k max remainder"].annual_contribution == 0
    assert plan.remaining_annual_surplus_for_taxable == 0


def test_roth_ira_used_when_traditional_ira_is_not_deductible():
    plan = BucketOptimizer().optimize(
        gross_income=140_000,
        filing_status="single",
        age=40,
        monthly_surplus=4_000,
        employer_match_rate=0.5,
        employer_match_cap_pct=0.05,
        has_hsa=False,
        hsa_coverage=None,
        tax_brackets=make_bundle(),
    )

    buckets = by_name(plan)
    assert buckets["Traditional IRA"].annual_contribution == 0
    assert "above the deductible IRA range" in buckets["Traditional IRA"].notes
    assert buckets["Roth IRA"].annual_contribution == 7_000
    assert buckets["Roth IRA"].tax_savings == 0


def test_hsa_skipped_without_eligible_plan():
    plan = BucketOptimizer().optimize(
        gross_income=100_000,
        filing_status="single",
        age=35,
        monthly_surplus=3_000,
        employer_match_rate=0.5,
        employer_match_cap_pct=0.05,
        has_hsa=False,
        hsa_coverage="self_only",
        tax_brackets=make_bundle(),
    )

    hsa = by_name(plan)["HSA"]
    assert hsa.annual_contribution == 0
    assert not hsa.is_maxed
    assert "Skipped" in hsa.notes
