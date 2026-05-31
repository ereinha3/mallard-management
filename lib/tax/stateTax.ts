import { FilingStatus, State } from "./types";
import { Bracket } from "./constants";

// ── 2026 State Income Tax Configurations ──────────────────────────────────
// Source: Tax Foundation 2026 State Tax Data, individual state revenue depts
// https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/
// Last updated: May 2026
//
// Coverage:
//   - All 9 no-income-tax states: rate = 0
//   - All 15 flat-rate states: exact 2026 flat rate
//   - All graduated-bracket states: full bracket tables
//   - Washington: capital gains tax only (not ordinary income)

interface StateConfig {
  brackets: Record<FilingStatus, Bracket[]> | Bracket[];
  flatDeduction?: Record<FilingStatus, number>;
  note?: string;
}

function flat(rate: number): Record<FilingStatus, Bracket[]> {
  const b = [{ rate, min: 0 }];
  return {
    single: b,
    married_filing_jointly: b,
    married_filing_separately: b,
    head_of_household: b,
  };
}

function zero(): Record<FilingStatus, Bracket[]> {
  return flat(0);
}

// MFJ brackets are typically double the single thresholds unless noted
function mfs(brackets: Bracket[]): Bracket[] {
  // MFS mirrors single for most states
  return brackets;
}

export const STATE_CONFIGS: Partial<Record<State, StateConfig>> = {

  // ── No income tax (9 states) ──────────────────────────────────────────
  AK: { brackets: zero() },
  FL: { brackets: zero() },
  NV: { brackets: zero() },
  NH: { brackets: zero(), note: "No wage/salary income tax" },
  SD: { brackets: zero() },
  TN: { brackets: zero(), note: "Hall Tax on dividends/interest repealed 2021" },
  TX: { brackets: zero() },
  WY: { brackets: zero() },
  // Washington has NO ordinary income tax but DOES have a capital gains tax
  // We model it as 0 for wages (the CGT is handled via LTCG path)
  WA: { brackets: zero(), note: "No income tax on wages. 7% CGT on LTCG over ~$262k; 9.9% over $1M (SB 5813, 2025)" },

  // ── Flat-rate states (15) ─────────────────────────────────────────────
  AZ: { brackets: flat(0.025),  note: "Flat 2.5% (Prop 132, 2022)" },
  CO: { brackets: flat(0.044),  note: "Flat 4.4%" },
  GA: { brackets: flat(0.0519), note: "Flat 5.19% (phasedown to 4.99% by 2029)" },
  ID: { brackets: flat(0.053),  note: "Flat 5.3%" },
  IL: { brackets: flat(0.0495), note: "Flat 4.95%" },
  IN: { brackets: flat(0.0295), note: "Flat 2.95% (phasedown to 2.9%)" },
  IA: { brackets: flat(0.038),  note: "Flat 3.8% (phasedown to 3.5% by 2027)" },
  KY: { brackets: flat(0.035),  note: "Flat 3.5% (reduced from 4.0% Jan 2026)" },
  LA: { brackets: flat(0.03),   note: "Flat 3.0% (HB 10, 2024)" },
  MI: { brackets: flat(0.0425), note: "Flat 4.25%" },
  MS: { brackets: flat(0.04),   note: "Flat 4.0% (phasedown toward 0%)" },
  NC: { brackets: flat(0.0399), note: "Flat 3.99% (reduced from 4.25% Jan 2026)" },
  PA: { brackets: flat(0.0307), note: "Flat 3.07%" },
  UT: { brackets: flat(0.045),  note: "Flat 4.5%" },
  OH: { brackets: flat(0.0275), note: "Flat 2.75% (reduced from 3.5%)" },

  // ── Full graduated-bracket states ────────────────────────────────────

  AL: {
    note: "2026 brackets",
    brackets: {
      single: [
        { rate: 0.02, min: 0 },
        { rate: 0.04, min: 500 },
        { rate: 0.05, min: 3_000 },
      ],
      married_filing_jointly: [
        { rate: 0.02, min: 0 },
        { rate: 0.04, min: 1_000 },
        { rate: 0.05, min: 6_000 },
      ],
      married_filing_separately: [
        { rate: 0.02, min: 0 },
        { rate: 0.04, min: 500 },
        { rate: 0.05, min: 3_000 },
      ],
      head_of_household: [
        { rate: 0.02, min: 0 },
        { rate: 0.04, min: 1_000 },
        { rate: 0.05, min: 6_000 },
      ],
    },
  },

  AR: {
    note: "2026 brackets (simplified 2-bracket system post-2023 reform)",
    brackets: {
      single: [
        { rate: 0.02, min: 0 },
        { rate: 0.039, min: 4_600 },
      ],
      married_filing_jointly: [
        { rate: 0.02, min: 0 },
        { rate: 0.039, min: 4_600 },
      ],
      married_filing_separately: [
        { rate: 0.02, min: 0 },
        { rate: 0.039, min: 4_600 },
      ],
      head_of_household: [
        { rate: 0.02, min: 0 },
        { rate: 0.039, min: 4_600 },
      ],
    },
  },

  CA: {
    note: "2026 California brackets (inflation-adjusted annually by CA FTB)",
    flatDeduction: {
      single: 5_540,
      married_filing_jointly: 11_080,
      married_filing_separately: 5_540,
      head_of_household: 11_080,
    },
    brackets: {
      single: [
        { rate: 0.01,  min: 0 },
        { rate: 0.02,  min: 11_079 },
        { rate: 0.04,  min: 26_264 },
        { rate: 0.06,  min: 41_452 },
        { rate: 0.08,  min: 57_542 },
        { rate: 0.093, min: 72_724 },
        { rate: 0.103, min: 371_479 },
        { rate: 0.113, min: 445_771 },
        { rate: 0.123, min: 742_953 },
        { rate: 0.133, min: 1_000_000 },
      ],
      married_filing_jointly: [
        { rate: 0.01,  min: 0 },
        { rate: 0.02,  min: 22_108 },
        { rate: 0.04,  min: 52_478 },
        { rate: 0.06,  min: 82_854 },
        { rate: 0.08,  min: 115_048 },
        { rate: 0.093, min: 145_448 },
        { rate: 0.103, min: 742_906 },
        { rate: 0.113, min: 891_542 },
        { rate: 0.123, min: 1_000_000 },
        { rate: 0.133, min: 1_485_812 },
      ],
      married_filing_separately: [
        { rate: 0.01,  min: 0 },
        { rate: 0.02,  min: 11_079 },
        { rate: 0.04,  min: 26_264 },
        { rate: 0.06,  min: 41_452 },
        { rate: 0.08,  min: 57_542 },
        { rate: 0.093, min: 72_724 },
        { rate: 0.103, min: 371_479 },
        { rate: 0.113, min: 445_771 },
        { rate: 0.123, min: 742_953 },
        { rate: 0.133, min: 1_000_000 },
      ],
      head_of_household: [
        { rate: 0.01,  min: 0 },
        { rate: 0.02,  min: 22_123 },
        { rate: 0.04,  min: 52_484 },
        { rate: 0.06,  min: 67_670 },
        { rate: 0.08,  min: 83_728 },
        { rate: 0.093, min: 98_912 },
        { rate: 0.103, min: 504_779 },
        { rate: 0.113, min: 605_761 },
        { rate: 0.123, min: 1_000_000 },
        { rate: 0.133, min: 1_010_428 },
      ],
    },
  },

  CT: {
    note: "2026 Connecticut brackets",
    brackets: {
      single: [
        { rate: 0.02,   min: 0 },
        { rate: 0.045,  min: 10_000 },
        { rate: 0.055,  min: 50_000 },
        { rate: 0.06,   min: 100_000 },
        { rate: 0.065,  min: 200_000 },
        { rate: 0.069,  min: 250_000 },
        { rate: 0.0699, min: 500_000 },
      ],
      married_filing_jointly: [
        { rate: 0.02,   min: 0 },
        { rate: 0.045,  min: 20_000 },
        { rate: 0.055,  min: 100_000 },
        { rate: 0.06,   min: 200_000 },
        { rate: 0.065,  min: 400_000 },
        { rate: 0.069,  min: 500_000 },
        { rate: 0.0699, min: 1_000_000 },
      ],
      married_filing_separately: [
        { rate: 0.02,   min: 0 },
        { rate: 0.045,  min: 10_000 },
        { rate: 0.055,  min: 50_000 },
        { rate: 0.06,   min: 100_000 },
        { rate: 0.065,  min: 200_000 },
        { rate: 0.069,  min: 250_000 },
        { rate: 0.0699, min: 500_000 },
      ],
      head_of_household: [
        { rate: 0.02,   min: 0 },
        { rate: 0.045,  min: 16_000 },
        { rate: 0.055,  min: 80_000 },
        { rate: 0.06,   min: 160_000 },
        { rate: 0.065,  min: 320_000 },
        { rate: 0.069,  min: 400_000 },
        { rate: 0.0699, min: 800_000 },
      ],
    },
  },

  DC: {
    note: "2026 Washington DC brackets",
    brackets: {
      single: [
        { rate: 0.04,   min: 0 },
        { rate: 0.06,   min: 10_000 },
        { rate: 0.065,  min: 40_000 },
        { rate: 0.085,  min: 60_000 },
        { rate: 0.0925, min: 250_000 },
        { rate: 0.0975, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
      married_filing_jointly: [
        { rate: 0.04,   min: 0 },
        { rate: 0.06,   min: 10_000 },
        { rate: 0.065,  min: 40_000 },
        { rate: 0.085,  min: 60_000 },
        { rate: 0.0925, min: 250_000 },
        { rate: 0.0975, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
      married_filing_separately: [
        { rate: 0.04,   min: 0 },
        { rate: 0.06,   min: 10_000 },
        { rate: 0.065,  min: 40_000 },
        { rate: 0.085,  min: 60_000 },
        { rate: 0.0925, min: 250_000 },
        { rate: 0.0975, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
      head_of_household: [
        { rate: 0.04,   min: 0 },
        { rate: 0.06,   min: 10_000 },
        { rate: 0.065,  min: 40_000 },
        { rate: 0.085,  min: 60_000 },
        { rate: 0.0925, min: 250_000 },
        { rate: 0.0975, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
    },
  },

  DE: {
    note: "2026 Delaware brackets",
    brackets: {
      single: [
        { rate: 0.022, min: 2_000 },
        { rate: 0.039, min: 5_000 },
        { rate: 0.048, min: 10_000 },
        { rate: 0.052, min: 20_000 },
        { rate: 0.0555, min: 25_000 },
        { rate: 0.066,  min: 60_000 },
      ],
      married_filing_jointly: [
        { rate: 0.022, min: 2_000 },
        { rate: 0.039, min: 5_000 },
        { rate: 0.048, min: 10_000 },
        { rate: 0.052, min: 20_000 },
        { rate: 0.0555, min: 25_000 },
        { rate: 0.066,  min: 60_000 },
      ],
      married_filing_separately: [
        { rate: 0.022, min: 2_000 },
        { rate: 0.039, min: 5_000 },
        { rate: 0.048, min: 10_000 },
        { rate: 0.052, min: 20_000 },
        { rate: 0.0555, min: 25_000 },
        { rate: 0.066,  min: 60_000 },
      ],
      head_of_household: [
        { rate: 0.022, min: 2_000 },
        { rate: 0.039, min: 5_000 },
        { rate: 0.048, min: 10_000 },
        { rate: 0.052, min: 20_000 },
        { rate: 0.0555, min: 25_000 },
        { rate: 0.066,  min: 60_000 },
      ],
    },
  },

  HI: {
    note: "2026 Hawaii brackets (12 brackets, highest top rate in US at 11%)",
    brackets: {
      single: [
        { rate: 0.014, min: 0 },
        { rate: 0.032, min: 9_600 },
        { rate: 0.055, min: 14_400 },
        { rate: 0.064, min: 19_200 },
        { rate: 0.068, min: 24_000 },
        { rate: 0.072, min: 36_000 },
        { rate: 0.076, min: 48_000 },
        { rate: 0.079, min: 125_000 },
        { rate: 0.0825, min: 175_000 },
        { rate: 0.09,   min: 225_000 },
        { rate: 0.10,   min: 275_000 },
        { rate: 0.11,   min: 325_000 },
      ],
      married_filing_jointly: [
        { rate: 0.014, min: 0 },
        { rate: 0.032, min: 19_200 },
        { rate: 0.055, min: 28_800 },
        { rate: 0.064, min: 38_400 },
        { rate: 0.068, min: 48_000 },
        { rate: 0.072, min: 72_000 },
        { rate: 0.076, min: 96_000 },
        { rate: 0.079, min: 250_000 },
        { rate: 0.0825, min: 350_000 },
        { rate: 0.09,   min: 450_000 },
        { rate: 0.10,   min: 550_000 },
        { rate: 0.11,   min: 650_000 },
      ],
      married_filing_separately: [
        { rate: 0.014, min: 0 },
        { rate: 0.032, min: 9_600 },
        { rate: 0.055, min: 14_400 },
        { rate: 0.064, min: 19_200 },
        { rate: 0.068, min: 24_000 },
        { rate: 0.072, min: 36_000 },
        { rate: 0.076, min: 48_000 },
        { rate: 0.079, min: 125_000 },
        { rate: 0.0825, min: 175_000 },
        { rate: 0.09,   min: 225_000 },
        { rate: 0.10,   min: 275_000 },
        { rate: 0.11,   min: 325_000 },
      ],
      head_of_household: [
        { rate: 0.014, min: 0 },
        { rate: 0.032, min: 14_400 },
        { rate: 0.055, min: 21_600 },
        { rate: 0.064, min: 28_800 },
        { rate: 0.068, min: 36_000 },
        { rate: 0.072, min: 54_000 },
        { rate: 0.076, min: 72_000 },
        { rate: 0.079, min: 187_500 },
        { rate: 0.0825, min: 262_500 },
        { rate: 0.09,   min: 337_500 },
        { rate: 0.10,   min: 412_500 },
        { rate: 0.11,   min: 487_500 },
      ],
    },
  },

  KS: {
    note: "2026 Kansas brackets",
    brackets: {
      single: [
        { rate: 0.052, min: 0 },
        { rate: 0.0558, min: 23_000 },
      ],
      married_filing_jointly: [
        { rate: 0.052, min: 0 },
        { rate: 0.0558, min: 46_000 },
      ],
      married_filing_separately: [
        { rate: 0.052, min: 0 },
        { rate: 0.0558, min: 23_000 },
      ],
      head_of_household: [
        { rate: 0.052, min: 0 },
        { rate: 0.0558, min: 23_000 },
      ],
    },
  },

  ME: {
    note: "2026 Maine brackets",
    brackets: {
      single: [
        { rate: 0.058,  min: 0 },
        { rate: 0.0675, min: 27_399 },
        { rate: 0.0715, min: 64_849 },
      ],
      married_filing_jointly: [
        { rate: 0.058,  min: 0 },
        { rate: 0.0675, min: 54_999 },
        { rate: 0.0715, min: 129_899 },
      ],
      married_filing_separately: [
        { rate: 0.058,  min: 0 },
        { rate: 0.0675, min: 27_399 },
        { rate: 0.0715, min: 64_849 },
      ],
      head_of_household: [
        { rate: 0.058,  min: 0 },
        { rate: 0.0675, min: 40_999 },
        { rate: 0.0715, min: 97_399 },
      ],
    },
  },

  MD: {
    note: "2026 Maryland state brackets (county/city piggyback tax added separately via localTax)",
    brackets: {
      single: [
        { rate: 0.02,   min: 0 },
        { rate: 0.03,   min: 1_000 },
        { rate: 0.04,   min: 2_000 },
        { rate: 0.0475, min: 3_000 },
        { rate: 0.05,   min: 100_000 },
        { rate: 0.0525, min: 125_000 },
        { rate: 0.055,  min: 150_000 },
        { rate: 0.0575, min: 250_000 },
        { rate: 0.0625, min: 500_000 },
        { rate: 0.065,  min: 1_000_000 },
      ],
      married_filing_jointly: [
        { rate: 0.02,   min: 0 },
        { rate: 0.03,   min: 1_000 },
        { rate: 0.04,   min: 2_000 },
        { rate: 0.0475, min: 3_000 },
        { rate: 0.05,   min: 150_000 },
        { rate: 0.0525, min: 175_000 },
        { rate: 0.055,  min: 225_000 },
        { rate: 0.0575, min: 300_000 },
        { rate: 0.0625, min: 500_000 },
        { rate: 0.065,  min: 1_000_000 },
      ],
      married_filing_separately: [
        { rate: 0.02,   min: 0 },
        { rate: 0.03,   min: 1_000 },
        { rate: 0.04,   min: 2_000 },
        { rate: 0.0475, min: 3_000 },
        { rate: 0.05,   min: 100_000 },
        { rate: 0.0525, min: 125_000 },
        { rate: 0.055,  min: 150_000 },
        { rate: 0.0575, min: 250_000 },
        { rate: 0.0625, min: 500_000 },
        { rate: 0.065,  min: 1_000_000 },
      ],
      head_of_household: [
        { rate: 0.02,   min: 0 },
        { rate: 0.03,   min: 1_000 },
        { rate: 0.04,   min: 2_000 },
        { rate: 0.0475, min: 3_000 },
        { rate: 0.05,   min: 125_000 },
        { rate: 0.0525, min: 150_000 },
        { rate: 0.055,  min: 175_000 },
        { rate: 0.0575, min: 275_000 },
        { rate: 0.0625, min: 500_000 },
        { rate: 0.065,  min: 1_000_000 },
      ],
    },
  },

  MA: {
    note: "2026: 5% flat + 9% surtax on income over $1,083,150 (Millionaires Tax, Question 1 2022)",
    brackets: {
      single: [
        { rate: 0.05, min: 0 },
        { rate: 0.09, min: 1_083_150 },
      ],
      married_filing_jointly: [
        { rate: 0.05, min: 0 },
        { rate: 0.09, min: 1_083_150 },
      ],
      married_filing_separately: [
        { rate: 0.05, min: 0 },
        { rate: 0.09, min: 541_575 },
      ],
      head_of_household: [
        { rate: 0.05, min: 0 },
        { rate: 0.09, min: 1_083_150 },
      ],
    },
  },

  MN: {
    note: "2026 Minnesota brackets",
    brackets: {
      single: [
        { rate: 0.0535, min: 0 },
        { rate: 0.068,  min: 33_310 },
        { rate: 0.0785, min: 109_430 },
        { rate: 0.0985, min: 203_150 },
      ],
      married_filing_jointly: [
        { rate: 0.0535, min: 0 },
        { rate: 0.068,  min: 47_050 },
        { rate: 0.0785, min: 187_150 },
        { rate: 0.0985, min: 338_700 },
      ],
      married_filing_separately: [
        { rate: 0.0535, min: 0 },
        { rate: 0.068,  min: 23_525 },
        { rate: 0.0785, min: 93_575 },
        { rate: 0.0985, min: 169_350 },
      ],
      head_of_household: [
        { rate: 0.0535, min: 0 },
        { rate: 0.068,  min: 40_150 },
        { rate: 0.0785, min: 148_300 },
        { rate: 0.0985, min: 270_900 },
      ],
    },
  },

  MO: {
    note: "2026 Missouri brackets (top rate 4.7%)",
    brackets: {
      single: [
        { rate: 0.02,  min: 1_348 },
        { rate: 0.025, min: 2_696 },
        { rate: 0.03,  min: 4_044 },
        { rate: 0.035, min: 5_392 },
        { rate: 0.04,  min: 6_740 },
        { rate: 0.045, min: 8_088 },
        { rate: 0.047, min: 9_436 },
      ],
      married_filing_jointly: [
        { rate: 0.02,  min: 1_348 },
        { rate: 0.025, min: 2_696 },
        { rate: 0.03,  min: 4_044 },
        { rate: 0.035, min: 5_392 },
        { rate: 0.04,  min: 6_740 },
        { rate: 0.045, min: 8_088 },
        { rate: 0.047, min: 9_436 },
      ],
      married_filing_separately: [
        { rate: 0.02,  min: 1_348 },
        { rate: 0.025, min: 2_696 },
        { rate: 0.03,  min: 4_044 },
        { rate: 0.035, min: 5_392 },
        { rate: 0.04,  min: 6_740 },
        { rate: 0.045, min: 8_088 },
        { rate: 0.047, min: 9_436 },
      ],
      head_of_household: [
        { rate: 0.02,  min: 1_348 },
        { rate: 0.025, min: 2_696 },
        { rate: 0.03,  min: 4_044 },
        { rate: 0.035, min: 5_392 },
        { rate: 0.04,  min: 6_740 },
        { rate: 0.045, min: 8_088 },
        { rate: 0.047, min: 9_436 },
      ],
    },
  },

  MT: {
    note: "2026 Montana brackets (reduced top rate 5.65%)",
    brackets: {
      single: [
        { rate: 0.047, min: 0 },
        { rate: 0.0565, min: 47_500 },
      ],
      married_filing_jointly: [
        { rate: 0.047, min: 0 },
        { rate: 0.0565, min: 95_000 },
      ],
      married_filing_separately: [
        { rate: 0.047, min: 0 },
        { rate: 0.0565, min: 47_500 },
      ],
      head_of_household: [
        { rate: 0.047, min: 0 },
        { rate: 0.0565, min: 71_250 },
      ],
    },
  },

  NE: {
    note: "2026 Nebraska brackets (top rate reduced to 4.55%)",
    brackets: {
      single: [
        { rate: 0.0246, min: 0 },
        { rate: 0.0351, min: 4_130 },
        { rate: 0.0455, min: 24_760 },
      ],
      married_filing_jointly: [
        { rate: 0.0246, min: 0 },
        { rate: 0.0351, min: 8_260 },
        { rate: 0.0455, min: 49_520 },
      ],
      married_filing_separately: [
        { rate: 0.0246, min: 0 },
        { rate: 0.0351, min: 4_130 },
        { rate: 0.0455, min: 24_760 },
      ],
      head_of_household: [
        { rate: 0.0246, min: 0 },
        { rate: 0.0351, min: 6_195 },
        { rate: 0.0455, min: 37_140 },
      ],
    },
  },

  NJ: {
    note: "2026 New Jersey brackets",
    brackets: {
      single: [
        { rate: 0.014,  min: 0 },
        { rate: 0.0175, min: 20_000 },
        { rate: 0.035,  min: 35_000 },
        { rate: 0.05525, min: 40_000 },
        { rate: 0.0637, min: 75_000 },
        { rate: 0.0897, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
      married_filing_jointly: [
        { rate: 0.014,  min: 0 },
        { rate: 0.0175, min: 20_000 },
        { rate: 0.035,  min: 50_000 },
        { rate: 0.05525, min: 70_000 },
        { rate: 0.0637, min: 80_000 },
        { rate: 0.0897, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
      married_filing_separately: [
        { rate: 0.014,  min: 0 },
        { rate: 0.0175, min: 20_000 },
        { rate: 0.035,  min: 35_000 },
        { rate: 0.05525, min: 40_000 },
        { rate: 0.0637, min: 75_000 },
        { rate: 0.0897, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
      head_of_household: [
        { rate: 0.014,  min: 0 },
        { rate: 0.0175, min: 20_000 },
        { rate: 0.035,  min: 50_000 },
        { rate: 0.05525, min: 70_000 },
        { rate: 0.0637, min: 80_000 },
        { rate: 0.0897, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
    },
  },

  NM: {
    note: "2026 New Mexico brackets",
    brackets: {
      single: [
        { rate: 0.015, min: 0 },
        { rate: 0.032, min: 5_500 },
        { rate: 0.043, min: 16_500 },
        { rate: 0.047, min: 33_500 },
        { rate: 0.049, min: 66_500 },
        { rate: 0.059, min: 210_000 },
      ],
      married_filing_jointly: [
        { rate: 0.015, min: 0 },
        { rate: 0.032, min: 8_000 },
        { rate: 0.043, min: 24_000 },
        { rate: 0.047, min: 48_000 },
        { rate: 0.049, min: 100_000 },
        { rate: 0.059, min: 315_000 },
      ],
      married_filing_separately: [
        { rate: 0.015, min: 0 },
        { rate: 0.032, min: 5_500 },
        { rate: 0.043, min: 16_500 },
        { rate: 0.047, min: 33_500 },
        { rate: 0.049, min: 66_500 },
        { rate: 0.059, min: 210_000 },
      ],
      head_of_household: [
        { rate: 0.015, min: 0 },
        { rate: 0.032, min: 8_000 },
        { rate: 0.043, min: 24_000 },
        { rate: 0.047, min: 48_000 },
        { rate: 0.049, min: 100_000 },
        { rate: 0.059, min: 315_000 },
      ],
    },
  },

  NY: {
    note: "2026 New York state brackets",
    flatDeduction: {
      single: 8_000,
      married_filing_jointly: 16_050,
      married_filing_separately: 8_000,
      head_of_household: 11_200,
    },
    brackets: {
      single: [
        { rate: 0.039,  min: 0 },
        { rate: 0.044,  min: 8_500 },
        { rate: 0.0515, min: 11_700 },
        { rate: 0.054,  min: 13_900 },
        { rate: 0.059,  min: 80_650 },
        { rate: 0.0685, min: 215_400 },
        { rate: 0.0965, min: 1_077_550 },
        { rate: 0.103,  min: 5_000_000 },
        { rate: 0.109,  min: 25_000_000 },
      ],
      married_filing_jointly: [
        { rate: 0.039,  min: 0 },
        { rate: 0.044,  min: 17_150 },
        { rate: 0.0515, min: 23_600 },
        { rate: 0.054,  min: 27_900 },
        { rate: 0.059,  min: 161_550 },
        { rate: 0.0685, min: 323_200 },
        { rate: 0.0965, min: 2_155_350 },
        { rate: 0.103,  min: 5_000_000 },
        { rate: 0.109,  min: 25_000_000 },
      ],
      married_filing_separately: [
        { rate: 0.039,  min: 0 },
        { rate: 0.044,  min: 8_500 },
        { rate: 0.0515, min: 11_700 },
        { rate: 0.054,  min: 13_900 },
        { rate: 0.059,  min: 80_650 },
        { rate: 0.0685, min: 215_400 },
        { rate: 0.0965, min: 1_077_550 },
        { rate: 0.103,  min: 5_000_000 },
      ],
      head_of_household: [
        { rate: 0.039,  min: 0 },
        { rate: 0.044,  min: 12_800 },
        { rate: 0.0515, min: 17_650 },
        { rate: 0.054,  min: 20_900 },
        { rate: 0.059,  min: 107_650 },
        { rate: 0.0685, min: 269_300 },
        { rate: 0.0965, min: 1_616_450 },
        { rate: 0.103,  min: 5_000_000 },
        { rate: 0.109,  min: 25_000_000 },
      ],
    },
  },

  ND: {
    note: "2026 North Dakota — income below $48,475 (single) is 0%",
    brackets: {
      single: [
        { rate: 0.00,   min: 0 },
        { rate: 0.0195, min: 48_475 },
        { rate: 0.025,  min: 244_825 },
      ],
      married_filing_jointly: [
        { rate: 0.00,   min: 0 },
        { rate: 0.0195, min: 73_350 },
        { rate: 0.025,  min: 329_650 },
      ],
      married_filing_separately: [
        { rate: 0.00,   min: 0 },
        { rate: 0.0195, min: 48_475 },
        { rate: 0.025,  min: 244_825 },
      ],
      head_of_household: [
        { rate: 0.00,   min: 0 },
        { rate: 0.0195, min: 48_475 },
        { rate: 0.025,  min: 244_825 },
      ],
    },
  },

  OK: {
    note: "2026 Oklahoma brackets",
    brackets: {
      single: [
        { rate: 0.025, min: 3_750 },
        { rate: 0.035, min: 4_900 },
        { rate: 0.045, min: 7_200 },
      ],
      married_filing_jointly: [
        { rate: 0.025, min: 7_500 },
        { rate: 0.035, min: 9_800 },
        { rate: 0.045, min: 14_400 },
      ],
      married_filing_separately: [
        { rate: 0.025, min: 3_750 },
        { rate: 0.035, min: 4_900 },
        { rate: 0.045, min: 7_200 },
      ],
      head_of_household: [
        { rate: 0.025, min: 3_750 },
        { rate: 0.035, min: 4_900 },
        { rate: 0.045, min: 7_200 },
      ],
    },
  },

  OR: {
    note: "2026 Oregon brackets",
    flatDeduction: {
      single: 2_620,
      married_filing_jointly: 5_235,
      married_filing_separately: 2_620,
      head_of_household: 5_235,
    },
    brackets: {
      single: [
        { rate: 0.0475, min: 0 },
        { rate: 0.0675, min: 4_550 },
        { rate: 0.0875, min: 11_400 },
        { rate: 0.099,  min: 125_000 },
      ],
      married_filing_jointly: [
        { rate: 0.0475, min: 0 },
        { rate: 0.0675, min: 9_100 },
        { rate: 0.0875, min: 22_800 },
        { rate: 0.099,  min: 250_000 },
      ],
      married_filing_separately: [
        { rate: 0.0475, min: 0 },
        { rate: 0.0675, min: 4_550 },
        { rate: 0.0875, min: 11_400 },
        { rate: 0.099,  min: 125_000 },
      ],
      head_of_household: [
        { rate: 0.0475, min: 0 },
        { rate: 0.0675, min: 7_100 },
        { rate: 0.0875, min: 17_800 },
        { rate: 0.099,  min: 125_000 },
      ],
    },
  },

  RI: {
    note: "2026 Rhode Island brackets",
    brackets: {
      single: [
        { rate: 0.0375, min: 0 },
        { rate: 0.0475, min: 82_050 },
        { rate: 0.0599, min: 186_450 },
      ],
      married_filing_jointly: [
        { rate: 0.0375, min: 0 },
        { rate: 0.0475, min: 164_100 },
        { rate: 0.0599, min: 372_900 },
      ],
      married_filing_separately: [
        { rate: 0.0375, min: 0 },
        { rate: 0.0475, min: 82_050 },
        { rate: 0.0599, min: 186_450 },
      ],
      head_of_household: [
        { rate: 0.0375, min: 0 },
        { rate: 0.0475, min: 123_075 },
        { rate: 0.0599, min: 279_675 },
      ],
    },
  },

  SC: {
    note: "2026 South Carolina brackets (top rate 6%)",
    brackets: {
      single: [
        { rate: 0.00, min: 0 },
        { rate: 0.03, min: 3_640 },
        { rate: 0.06, min: 18_230 },
      ],
      married_filing_jointly: [
        { rate: 0.00, min: 0 },
        { rate: 0.03, min: 3_640 },
        { rate: 0.06, min: 18_230 },
      ],
      married_filing_separately: [
        { rate: 0.00, min: 0 },
        { rate: 0.03, min: 3_640 },
        { rate: 0.06, min: 18_230 },
      ],
      head_of_household: [
        { rate: 0.00, min: 0 },
        { rate: 0.03, min: 3_640 },
        { rate: 0.06, min: 18_230 },
      ],
    },
  },

  VT: {
    note: "2026 Vermont brackets",
    brackets: {
      single: [
        { rate: 0.0335, min: 0 },
        { rate: 0.066,  min: 49_400 },
        { rate: 0.076,  min: 119_700 },
        { rate: 0.0875, min: 249_700 },
      ],
      married_filing_jointly: [
        { rate: 0.0335, min: 0 },
        { rate: 0.066,  min: 82_400 },
        { rate: 0.076,  min: 199_450 },
        { rate: 0.0875, min: 259_500 },
      ],
      married_filing_separately: [
        { rate: 0.0335, min: 0 },
        { rate: 0.066,  min: 49_400 },
        { rate: 0.076,  min: 119_700 },
        { rate: 0.0875, min: 249_700 },
      ],
      head_of_household: [
        { rate: 0.0335, min: 0 },
        { rate: 0.066,  min: 65_900 },
        { rate: 0.076,  min: 159_575 },
        { rate: 0.0875, min: 254_600 },
      ],
    },
  },

  VA: {
    note: "2026 Virginia brackets",
    brackets: {
      single: [
        { rate: 0.02,   min: 0 },
        { rate: 0.03,   min: 3_000 },
        { rate: 0.05,   min: 5_000 },
        { rate: 0.0575, min: 17_000 },
      ],
      married_filing_jointly: [
        { rate: 0.02,   min: 0 },
        { rate: 0.03,   min: 3_000 },
        { rate: 0.05,   min: 5_000 },
        { rate: 0.0575, min: 17_000 },
      ],
      married_filing_separately: [
        { rate: 0.02,   min: 0 },
        { rate: 0.03,   min: 3_000 },
        { rate: 0.05,   min: 5_000 },
        { rate: 0.0575, min: 17_000 },
      ],
      head_of_household: [
        { rate: 0.02,   min: 0 },
        { rate: 0.03,   min: 3_000 },
        { rate: 0.05,   min: 5_000 },
        { rate: 0.0575, min: 17_000 },
      ],
    },
  },

  WV: {
    note: "2026 West Virginia brackets",
    brackets: {
      single: [
        { rate: 0.0222, min: 0 },
        { rate: 0.0296, min: 10_000 },
        { rate: 0.0333, min: 25_000 },
        { rate: 0.0444, min: 40_000 },
        { rate: 0.0482, min: 60_000 },
      ],
      married_filing_jointly: [
        { rate: 0.0222, min: 0 },
        { rate: 0.0296, min: 10_000 },
        { rate: 0.0333, min: 25_000 },
        { rate: 0.0444, min: 40_000 },
        { rate: 0.0482, min: 60_000 },
      ],
      married_filing_separately: [
        { rate: 0.0222, min: 0 },
        { rate: 0.0296, min: 10_000 },
        { rate: 0.0333, min: 25_000 },
        { rate: 0.0444, min: 40_000 },
        { rate: 0.0482, min: 60_000 },
      ],
      head_of_household: [
        { rate: 0.0222, min: 0 },
        { rate: 0.0296, min: 10_000 },
        { rate: 0.0333, min: 25_000 },
        { rate: 0.0444, min: 40_000 },
        { rate: 0.0482, min: 60_000 },
      ],
    },
  },

  WI: {
    note: "2026 Wisconsin brackets",
    brackets: {
      single: [
        { rate: 0.035,  min: 0 },
        { rate: 0.044,  min: 15_110 },
        { rate: 0.053,  min: 51_950 },
        { rate: 0.0765, min: 332_720 },
      ],
      married_filing_jointly: [
        { rate: 0.035,  min: 0 },
        { rate: 0.044,  min: 20_150 },
        { rate: 0.053,  min: 69_270 },
        { rate: 0.0765, min: 443_630 },
      ],
      married_filing_separately: [
        { rate: 0.035,  min: 0 },
        { rate: 0.044,  min: 15_110 },
        { rate: 0.053,  min: 51_950 },
        { rate: 0.0765, min: 332_720 },
      ],
      head_of_household: [
        { rate: 0.035,  min: 0 },
        { rate: 0.044,  min: 15_110 },
        { rate: 0.053,  min: 51_950 },
        { rate: 0.0765, min: 332_720 },
      ],
    },
  },
};

export function getStateBrackets(state: State, filingStatus: FilingStatus): Bracket[] {
  const config = STATE_CONFIGS[state];
  if (!config) return [{ rate: 0, min: 0 }];
  const b = config.brackets as Record<FilingStatus, Bracket[]>;
  return b[filingStatus] ?? b["single"] ?? [{ rate: 0, min: 0 }];
}

export function getStateDeduction(state: State, filingStatus: FilingStatus): number {
  const config = STATE_CONFIGS[state];
  return config?.flatDeduction?.[filingStatus] ?? 0;
}

export function getStateNote(state: State): string | undefined {
  return STATE_CONFIGS[state]?.note;
}
