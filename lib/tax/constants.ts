import { FilingStatus } from "./types";

// ── 2026 Tax Year Constants ────────────────────────────────────────────────
// Source: IRS Rev. Proc. 2025-32, IRS Notice 2025-67, IRS newsroom 2025-11
// https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026
// https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500
// Last updated: May 2026

export const TAX_YEAR = 2026;

// Federal income tax brackets [rate, lower_bound] — upper bound is next row's lower bound
export interface Bracket {
  rate: number;
  min: number;
}

export const FEDERAL_BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { rate: 0.10, min: 0 },
    { rate: 0.12, min: 12_400 },
    { rate: 0.22, min: 50_400 },
    { rate: 0.24, min: 105_700 },
    { rate: 0.32, min: 201_775 },
    { rate: 0.35, min: 256_225 },
    { rate: 0.37, min: 640_600 },
  ],
  married_filing_jointly: [
    { rate: 0.10, min: 0 },
    { rate: 0.12, min: 24_800 },
    { rate: 0.22, min: 100_800 },
    { rate: 0.24, min: 211_400 },
    { rate: 0.32, min: 403_550 },
    { rate: 0.35, min: 512_450 },
    { rate: 0.37, min: 768_700 },
  ],
  // MFS brackets mirror single except top bracket splits MFJ in half
  married_filing_separately: [
    { rate: 0.10, min: 0 },
    { rate: 0.12, min: 12_400 },
    { rate: 0.22, min: 50_400 },
    { rate: 0.24, min: 105_700 },
    { rate: 0.32, min: 201_775 },
    { rate: 0.35, min: 256_225 },
    { rate: 0.37, min: 384_350 },  // half of MFJ 768,700
  ],
  head_of_household: [
    { rate: 0.10, min: 0 },
    { rate: 0.12, min: 17_700 },
    { rate: 0.22, min: 67_450 },
    { rate: 0.24, min: 105_700 },
    { rate: 0.32, min: 201_775 },
    { rate: 0.35, min: 256_200 },
    { rate: 0.37, min: 640_600 },
  ],
};

export const STANDARD_DEDUCTIONS: Record<FilingStatus, number> = {
  single: 16_100,
  married_filing_jointly: 32_200,
  married_filing_separately: 16_100,
  head_of_household: 24_150,
};

// Additional standard deduction for age 65+ or blind (per qualifying person)
export const ADDITIONAL_STANDARD_DEDUCTION_65: Record<FilingStatus, number> = {
  single: 2_050,
  married_filing_jointly: 1_650,
  married_filing_separately: 1_650,
  head_of_household: 2_050,
};

// SALT deduction cap (unchanged since TCJA 2017, made permanent by OBBBA 2025)
export const SALT_CAP = 10_000;

// ── FICA ──────────────────────────────────────────────────────────────────
export const SS_WAGE_BASE = 184_500;           // up from $176,100 in 2025
export const SS_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;
export const ADDITIONAL_MEDICARE_RATE = 0.009;
// Additional Medicare threshold — NOT inflation-adjusted (frozen since 2013)
export const ADDITIONAL_MEDICARE_THRESHOLD: Record<FilingStatus, number> = {
  single: 200_000,
  married_filing_jointly: 250_000,
  married_filing_separately: 125_000,
  head_of_household: 200_000,
};

// Self-employment: pays both employee + employer halves
export const SE_TAX_RATE = 0.153;             // 12.4% SS + 2.9% Medicare
export const SE_DEDUCTIBLE_PORTION = 0.5;     // 50% of SE tax is deductible above-the-line

// ── Long-Term Capital Gains / Qualified Dividends ─────────────────────────
// Brackets are based on total taxable income (LTCG stacked on top of ordinary income)
export interface LtcgBracket {
  rate: number;
  min: number;
}
export const LTCG_BRACKETS: Record<FilingStatus, LtcgBracket[]> = {
  single: [
    { rate: 0.00, min: 0 },
    { rate: 0.15, min: 49_450 },
    { rate: 0.20, min: 545_500 },
  ],
  married_filing_jointly: [
    { rate: 0.00, min: 0 },
    { rate: 0.15, min: 98_900 },
    { rate: 0.20, min: 613_700 },
  ],
  married_filing_separately: [
    { rate: 0.00, min: 0 },
    { rate: 0.15, min: 49_450 },
    { rate: 0.20, min: 306_850 },  // half of MFJ 613,700
  ],
  head_of_household: [
    { rate: 0.00, min: 0 },
    { rate: 0.15, min: 66_200 },
    { rate: 0.20, min: 579_600 },
  ],
};

// Net Investment Income Tax (3.8%) — threshold NOT inflation-adjusted
export const NIIT_RATE = 0.038;
export const NIIT_THRESHOLD: Record<FilingStatus, number> = {
  single: 200_000,
  married_filing_jointly: 250_000,
  married_filing_separately: 125_000,
  head_of_household: 200_000,
};

// ── Retirement Contribution Limits 2026 ───────────────────────────────────
export const CONTRIBUTION_LIMITS = {
  traditional401k: 24_500,          // up from $23,500 in 2025
  catchUp401k: 8_000,               // age 50–59 and 64+; up from $7,500
  superCatchUp401k: 11_250,         // age 60–63 only (SECURE 2.0)
  ira: 7_500,                       // up from $7,000 in 2025
  catchUpIra: 1_100,                // age 50+; up from $1,000
  hsaSingle: 4_400,                 // up from $4,300 in 2025
  hsaFamily: 8_750,                 // up from $8,550 in 2025
  hsaCatchUp: 1_000,                // age 55+; unchanged
  studentLoanInterestDeduction: 2_500, // unchanged
};

// ── Roth IRA Income Phase-Out 2026 ────────────────────────────────────────
export const ROTH_IRA_PHASEOUT: Record<string, { start: number; end: number }> = {
  single:                   { start: 153_000, end: 168_000 },
  married_filing_jointly:   { start: 242_000, end: 252_000 },
  married_filing_separately:{ start: 0,       end: 10_000  }, // effectively eliminated for MFS
  head_of_household:        { start: 153_000, end: 168_000 },
};
