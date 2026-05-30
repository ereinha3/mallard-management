import { FilingStatus, State } from "./types";
import { Bracket } from "./constants";

// ── State Tax Configurations ───────────────────────────────────────────────
// Coverage strategy:
//   - All 9 no-income-tax states: $0
//   - High-population / high-rate states: full bracket tables
//   - Remaining states: flat-rate approximation noted as such

interface StateConfig {
  brackets: Record<FilingStatus, Bracket[]> | Bracket[]; // single set if flat / no distinction
  flatDeduction?: Record<FilingStatus, number>; // standard deduction if any
  note?: string;
}

// Helper: single bracket array used for all filing statuses
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

// ── State Definitions ──────────────────────────────────────────────────────

export const STATE_CONFIGS: Partial<Record<State, StateConfig>> = {
  // No income tax
  AK: { brackets: zero() },
  FL: { brackets: zero() },
  NV: { brackets: zero() },
  NH: { brackets: zero() }, // taxes interest/dividends only — simplified to 0 for wages
  SD: { brackets: zero() },
  TN: { brackets: zero() }, // Hall tax repealed 2021
  TX: { brackets: zero() },
  WA: { brackets: zero() },
  WY: { brackets: zero() },

  // ── Full bracket states ────────────────────────────────────────────────

  CA: {
    brackets: {
      single: [
        { rate: 0.01, min: 0 },
        { rate: 0.02, min: 10_412 },
        { rate: 0.04, min: 24_684 },
        { rate: 0.06, min: 38_959 },
        { rate: 0.08, min: 54_081 },
        { rate: 0.093, min: 68_350 },
        { rate: 0.103, min: 349_137 },
        { rate: 0.113, min: 418_961 },
        { rate: 0.123, min: 698_274 },
        { rate: 0.133, min: 1_000_000 },
      ],
      married_filing_jointly: [
        { rate: 0.01, min: 0 },
        { rate: 0.02, min: 20_824 },
        { rate: 0.04, min: 49_368 },
        { rate: 0.06, min: 77_918 },
        { rate: 0.08, min: 108_162 },
        { rate: 0.093, min: 136_700 },
        { rate: 0.103, min: 698_274 },
        { rate: 0.113, min: 837_922 },
        { rate: 0.123, min: 1_000_000 },
        { rate: 0.133, min: 1_396_542 },
      ],
      married_filing_separately: [
        { rate: 0.01, min: 0 },
        { rate: 0.02, min: 10_412 },
        { rate: 0.04, min: 24_684 },
        { rate: 0.06, min: 38_959 },
        { rate: 0.08, min: 54_081 },
        { rate: 0.093, min: 68_350 },
        { rate: 0.103, min: 349_137 },
        { rate: 0.113, min: 418_961 },
        { rate: 0.123, min: 698_274 },
        { rate: 0.133, min: 1_000_000 },
      ],
      head_of_household: [
        { rate: 0.01, min: 0 },
        { rate: 0.02, min: 20_839 },
        { rate: 0.04, min: 49_371 },
        { rate: 0.06, min: 63_644 },
        { rate: 0.08, min: 78_765 },
        { rate: 0.093, min: 93_037 },
        { rate: 0.103, min: 474_824 },
        { rate: 0.113, min: 569_790 },
        { rate: 0.123, min: 949_649 },
        { rate: 0.133, min: 1_000_000 },
      ],
    },
    flatDeduction: {
      single: 5_202,
      married_filing_jointly: 10_404,
      married_filing_separately: 5_202,
      head_of_household: 10_404,
    },
  },

  NY: {
    brackets: {
      single: [
        { rate: 0.04, min: 0 },
        { rate: 0.045, min: 8_500 },
        { rate: 0.0525, min: 11_700 },
        { rate: 0.055, min: 13_900 },
        { rate: 0.06, min: 21_400 },
        { rate: 0.0685, min: 80_650 },
        { rate: 0.0965, min: 215_400 },
        { rate: 0.103, min: 1_077_550 },
        { rate: 0.109, min: 5_000_000 },
        { rate: 0.1090, min: 25_000_000 },
      ],
      married_filing_jointly: [
        { rate: 0.04, min: 0 },
        { rate: 0.045, min: 17_150 },
        { rate: 0.0525, min: 23_600 },
        { rate: 0.055, min: 27_900 },
        { rate: 0.06, min: 43_000 },
        { rate: 0.0685, min: 161_550 },
        { rate: 0.0965, min: 323_200 },
        { rate: 0.103, min: 2_155_350 },
        { rate: 0.109, min: 5_000_000 },
        { rate: 0.1090, min: 25_000_000 },
      ],
      married_filing_separately: [
        { rate: 0.04, min: 0 },
        { rate: 0.045, min: 8_500 },
        { rate: 0.0525, min: 11_700 },
        { rate: 0.055, min: 13_900 },
        { rate: 0.06, min: 21_400 },
        { rate: 0.0685, min: 80_650 },
        { rate: 0.0965, min: 215_400 },
        { rate: 0.103, min: 1_077_550 },
        { rate: 0.109, min: 5_000_000 },
      ],
      head_of_household: [
        { rate: 0.04, min: 0 },
        { rate: 0.045, min: 12_800 },
        { rate: 0.0525, min: 17_650 },
        { rate: 0.055, min: 20_900 },
        { rate: 0.06, min: 32_200 },
        { rate: 0.0685, min: 107_650 },
        { rate: 0.0965, min: 269_300 },
        { rate: 0.103, min: 1_616_450 },
        { rate: 0.109, min: 5_000_000 },
      ],
    },
    flatDeduction: {
      single: 8_000,
      married_filing_jointly: 16_050,
      married_filing_separately: 8_000,
      head_of_household: 11_200,
    },
  },

  OR: {
    brackets: {
      single: [
        { rate: 0.0475, min: 0 },
        { rate: 0.0675, min: 18_400 },
        { rate: 0.0875, min: 46_200 },
        { rate: 0.099, min: 250_000 },
      ],
      married_filing_jointly: [
        { rate: 0.0475, min: 0 },
        { rate: 0.0675, min: 36_800 },
        { rate: 0.0875, min: 92_400 },
        { rate: 0.099, min: 500_000 },
      ],
      married_filing_separately: [
        { rate: 0.0475, min: 0 },
        { rate: 0.0675, min: 18_400 },
        { rate: 0.0875, min: 46_200 },
        { rate: 0.099, min: 250_000 },
      ],
      head_of_household: [
        { rate: 0.0475, min: 0 },
        { rate: 0.0675, min: 24_550 },
        { rate: 0.0875, min: 62_200 },
        { rate: 0.099, min: 250_000 },
      ],
    },
    flatDeduction: {
      single: 2_420,
      married_filing_jointly: 4_840,
      married_filing_separately: 2_420,
      head_of_household: 4_840,
    },
  },

  // ── Flat-rate / simple-bracket states ─────────────────────────────────

  CO: { brackets: flat(0.044), note: "Flat 4.4% rate" },
  IL: { brackets: flat(0.0495), note: "Flat 4.95% rate" },
  IN: { brackets: flat(0.0305), note: "Flat 3.05% rate" },
  KY: { brackets: flat(0.045), note: "Flat 4.5% rate" },
  MA: { brackets: flat(0.05), note: "Flat 5% rate (5.85% on income over $1M)" },
  MI: { brackets: flat(0.0425), note: "Flat 4.25% rate" },
  NC: { brackets: flat(0.0475), note: "Flat 4.75% rate" },
  PA: { brackets: flat(0.0307), note: "Flat 3.07% rate" },
  UT: { brackets: flat(0.0465), note: "Flat 4.65% rate" },

  // Multi-bracket approximations for remaining states
  AZ: {
    brackets: {
      single: [
        { rate: 0.025, min: 0 },
        { rate: 0.028, min: 28_653 },
      ],
      married_filing_jointly: [
        { rate: 0.025, min: 0 },
        { rate: 0.028, min: 57_305 },
      ],
      married_filing_separately: [
        { rate: 0.025, min: 0 },
        { rate: 0.028, min: 28_653 },
      ],
      head_of_household: [
        { rate: 0.025, min: 0 },
        { rate: 0.028, min: 28_653 },
      ],
    },
  },

  MN: {
    brackets: {
      single: [
        { rate: 0.0535, min: 0 },
        { rate: 0.068, min: 30_070 },
        { rate: 0.0785, min: 98_760 },
        { rate: 0.0985, min: 183_340 },
      ],
      married_filing_jointly: [
        { rate: 0.0535, min: 0 },
        { rate: 0.068, min: 43_950 },
        { rate: 0.0785, min: 174_610 },
        { rate: 0.0985, min: 304_970 },
      ],
      married_filing_separately: [
        { rate: 0.0535, min: 0 },
        { rate: 0.068, min: 21_975 },
        { rate: 0.0785, min: 87_305 },
        { rate: 0.0985, min: 152_485 },
      ],
      head_of_household: [
        { rate: 0.0535, min: 0 },
        { rate: 0.068, min: 37_010 },
        { rate: 0.0785, min: 118_190 },
        { rate: 0.0985, min: 244_150 },
      ],
    },
  },

  NJ: {
    brackets: {
      single: [
        { rate: 0.014, min: 0 },
        { rate: 0.0175, min: 20_000 },
        { rate: 0.035, min: 35_000 },
        { rate: 0.05525, min: 40_000 },
        { rate: 0.0637, min: 75_000 },
        { rate: 0.0897, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
      married_filing_jointly: [
        { rate: 0.014, min: 0 },
        { rate: 0.0175, min: 20_000 },
        { rate: 0.035, min: 50_000 },
        { rate: 0.05525, min: 70_000 },
        { rate: 0.0637, min: 80_000 },
        { rate: 0.0897, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
      married_filing_separately: [
        { rate: 0.014, min: 0 },
        { rate: 0.0175, min: 20_000 },
        { rate: 0.035, min: 35_000 },
        { rate: 0.05525, min: 40_000 },
        { rate: 0.0637, min: 75_000 },
        { rate: 0.0897, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
      head_of_household: [
        { rate: 0.014, min: 0 },
        { rate: 0.0175, min: 20_000 },
        { rate: 0.035, min: 50_000 },
        { rate: 0.05525, min: 70_000 },
        { rate: 0.0637, min: 80_000 },
        { rate: 0.0897, min: 500_000 },
        { rate: 0.1075, min: 1_000_000 },
      ],
    },
  },

  // Remaining states — best-effort flat approximation (mark as approximate)
  AL: { brackets: flat(0.05), note: "Approximate: top marginal rate" },
  AR: { brackets: flat(0.0475), note: "Approximate: top marginal rate" },
  CT: { brackets: flat(0.0699), note: "Approximate: top marginal rate" },
  DE: { brackets: flat(0.066), note: "Approximate: top marginal rate" },
  GA: { brackets: flat(0.0549), note: "Approximate: top marginal rate (5.49% flat from 2024)" },
  HI: { brackets: flat(0.11), note: "Approximate: top marginal rate" },
  ID: { brackets: flat(0.058), note: "Approximate: top marginal rate" },
  IA: { brackets: flat(0.06), note: "Approximate: top marginal rate" },
  KS: { brackets: flat(0.057), note: "Approximate: top marginal rate" },
  LA: { brackets: flat(0.06), note: "Approximate: top marginal rate" },
  ME: { brackets: flat(0.0715), note: "Approximate: top marginal rate" },
  MD: { brackets: flat(0.0575), note: "Approximate: top marginal rate" },
  MS: { brackets: flat(0.05), note: "Approximate: flat 5%" },
  MO: { brackets: flat(0.0495), note: "Approximate: top marginal rate" },
  MT: { brackets: flat(0.0675), note: "Approximate: top marginal rate" },
  NE: { brackets: flat(0.0664), note: "Approximate: top marginal rate" },
  NM: { brackets: flat(0.059), note: "Approximate: top marginal rate" },
  ND: { brackets: flat(0.029), note: "Approximate: top marginal rate" },
  OH: { brackets: flat(0.035), note: "Approximate: top marginal rate" },
  OK: { brackets: flat(0.0475), note: "Approximate: top marginal rate" },
  RI: { brackets: flat(0.0599), note: "Approximate: top marginal rate" },
  SC: { brackets: flat(0.065), note: "Approximate: top marginal rate" },
  VT: { brackets: flat(0.0875), note: "Approximate: top marginal rate" },
  VA: { brackets: flat(0.0575), note: "Approximate: top marginal rate" },
  WV: { brackets: flat(0.065), note: "Approximate: top marginal rate" },
  WI: { brackets: flat(0.0765), note: "Approximate: top marginal rate" },
  DC: { brackets: flat(0.1075), note: "Approximate: top marginal rate" },
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
