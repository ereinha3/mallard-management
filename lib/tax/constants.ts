import { FilingStatus } from "./types";

// ── 2024 Tax Year Constants ────────────────────────────────────────────────

export const TAX_YEAR = 2024;

// Federal income tax brackets [rate, lower_bound] — upper bound is next row's lower bound
// Format: { rate: 0.xx, min: number }
export interface Bracket {
  rate: number;
  min: number;
}

export const FEDERAL_BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { rate: 0.10, min: 0 },
    { rate: 0.12, min: 11_600 },
    { rate: 0.22, min: 47_150 },
    { rate: 0.24, min: 100_525 },
    { rate: 0.32, min: 191_950 },
    { rate: 0.35, min: 243_725 },
    { rate: 0.37, min: 609_350 },
  ],
  married_filing_jointly: [
    { rate: 0.10, min: 0 },
    { rate: 0.12, min: 23_200 },
    { rate: 0.22, min: 94_300 },
    { rate: 0.24, min: 201_050 },
    { rate: 0.32, min: 383_900 },
    { rate: 0.35, min: 487_450 },
    { rate: 0.37, min: 731_200 },
  ],
  married_filing_separately: [
    { rate: 0.10, min: 0 },
    { rate: 0.12, min: 11_600 },
    { rate: 0.22, min: 47_150 },
    { rate: 0.24, min: 100_525 },
    { rate: 0.32, min: 191_950 },
    { rate: 0.35, min: 243_725 },
    { rate: 0.37, min: 365_600 },
  ],
  head_of_household: [
    { rate: 0.10, min: 0 },
    { rate: 0.12, min: 16_550 },
    { rate: 0.22, min: 63_100 },
    { rate: 0.24, min: 100_500 },
    { rate: 0.32, min: 191_950 },
    { rate: 0.35, min: 243_700 },
    { rate: 0.37, min: 609_350 },
  ],
};

export const STANDARD_DEDUCTIONS: Record<FilingStatus, number> = {
  single: 14_600,
  married_filing_jointly: 29_200,
  married_filing_separately: 14_600,
  head_of_household: 21_900,
};

// Additional standard deduction for age 65+ or blind
export const ADDITIONAL_STANDARD_DEDUCTION_65: Record<FilingStatus, number> = {
  single: 1_950,
  married_filing_jointly: 1_550, // per qualifying person
  married_filing_separately: 1_550,
  head_of_household: 1_950,
};

export const SALT_CAP = 10_000;

// FICA
export const SS_WAGE_BASE = 168_600;
export const SS_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;
export const ADDITIONAL_MEDICARE_RATE = 0.009;
export const ADDITIONAL_MEDICARE_THRESHOLD: Record<FilingStatus, number> = {
  single: 200_000,
  married_filing_jointly: 250_000,
  married_filing_separately: 125_000,
  head_of_household: 200_000,
};

// Self-employment: pays both employee + employer halves
export const SE_TAX_RATE = 0.153; // 12.4% SS + 2.9% Medicare
export const SE_DEDUCTIBLE_PORTION = 0.5; // 50% of SE tax is deductible above-the-line

// LTCG / Qualified Dividend brackets (2024)
export interface LtcgBracket {
  rate: number;
  min: number; // min taxable income (not LTCG income — it's stacked on top of ordinary income)
}
export const LTCG_BRACKETS: Record<FilingStatus, LtcgBracket[]> = {
  single: [
    { rate: 0.00, min: 0 },
    { rate: 0.15, min: 47_025 },
    { rate: 0.20, min: 518_900 },
  ],
  married_filing_jointly: [
    { rate: 0.00, min: 0 },
    { rate: 0.15, min: 94_050 },
    { rate: 0.20, min: 583_750 },
  ],
  married_filing_separately: [
    { rate: 0.00, min: 0 },
    { rate: 0.15, min: 47_025 },
    { rate: 0.20, min: 291_850 },
  ],
  head_of_household: [
    { rate: 0.00, min: 0 },
    { rate: 0.15, min: 63_000 },
    { rate: 0.20, min: 551_350 },
  ],
};

// Net Investment Income Tax
export const NIIT_RATE = 0.038;
export const NIIT_THRESHOLD: Record<FilingStatus, number> = {
  single: 200_000,
  married_filing_jointly: 250_000,
  married_filing_separately: 125_000,
  head_of_household: 200_000,
};

// Contribution limits 2024
export const CONTRIBUTION_LIMITS = {
  traditional401k: 23_000,
  catchUp401k: 7_500, // age 50+
  ira: 7_000,
  catchUpIra: 1_000, // age 50+
  hsaSingle: 4_150,
  hsaFamily: 8_300,
  hsaCatchUp: 1_000, // age 55+
  studentLoanInterestDeduction: 2_500,
};

// Roth IRA income phaseout 2024
export const ROTH_IRA_PHASEOUT: Record<string, { start: number; end: number }> = {
  single: { start: 146_000, end: 161_000 },
  married_filing_jointly: { start: 230_000, end: 240_000 },
  married_filing_separately: { start: 0, end: 10_000 },
  head_of_household: { start: 146_000, end: 161_000 },
};
