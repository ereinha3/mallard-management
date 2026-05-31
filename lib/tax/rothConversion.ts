/**
 * Roth Conversion Ladder Engine
 *
 * Legal basis: IRC §408(d)(3) — IRA-to-IRA rollovers and conversions.
 *              IRC §408A(d)(3) — Roth conversion rules.
 *              IRC §72(t) — 10% early withdrawal penalty exceptions.
 *
 * Strategy: Convert traditional IRA / pre-tax 401k to Roth in years when
 * income is lower than normal, paying tax at today's (lower) marginal rate
 * to achieve tax-free growth and withdrawals in retirement.
 *
 * KEY LEGAL CONSTRAINTS ENFORCED HERE:
 *  1. No income limit on conversions (only on DIRECT Roth contributions).
 *     Anyone can convert regardless of income. (IRC §408A(c)(3)(B) repealed 2010)
 *  2. Converted amounts are added to ordinary income in the year of conversion.
 *     This can push the user into a higher bracket — we calculate the bracket cliff.
 *  3. Five-year rule (IRC §408A(d)(2)(B)): Each conversion starts its own 5-year
 *     clock. If under 59½, the converted PRINCIPAL (not earnings) can be withdrawn
 *     penalty-free only after 5 years from Jan 1 of the conversion year.
 *     Earnings always follow the standard 5-year Roth rule.
 *  4. Pro-rata rule (IRC §408(d)(2)): If the user has any non-deductible (after-tax)
 *     basis in traditional IRAs, conversions are pro-rated between pre-tax and
 *     after-tax dollars. We flag this but do not calculate it — CPA required.
 *  5. RMDs must be taken BEFORE conversion if age 73+ (IRC §401(a)(9)).
 *     You cannot convert an RMD amount.
 *  6. 10% early withdrawal penalty does NOT apply to conversions (IRC §72(t)(2)(D)),
 *     but the 5-year rule still governs penalty-free access to converted principal.
 *  7. No 60-day rollover limit: direct trustee-to-trustee transfers are preferred
 *     (not subject to 20% mandatory withholding or the one-per-year rollover limit).
 *
 * DISCLAIMER: This is informational tax planning analysis, not personalized tax advice.
 */

import { z } from "zod";
import { FilingStatus, FilingStatusSchema } from "./types";
import {
  FEDERAL_BRACKETS,
  STANDARD_DEDUCTIONS,
  ROTH_IRA_PHASEOUT,
  NIIT_THRESHOLD,
  NIIT_RATE,
} from "./constants";

// ── Input ──────────────────────────────────────────────────────────────────

export const RothConversionInputSchema = z.object({
  // Current year income (BEFORE conversion)
  ordinaryIncomeThisYear: z.number().nonnegative(),
  filingStatus: FilingStatusSchema,
  age: z.number().int().min(0).max(120),

  // IRA balances
  traditionalIraBalance: z.number().nonnegative(),
  rothIraBalance: z.number().nonnegative().default(0),
  // After-tax (non-deductible) basis in traditional IRA — triggers pro-rata rule
  nonDeductibleIraBasis: z.number().nonnegative().default(0),

  // Expected future marginal rate (user's estimate of retirement rate)
  expectedRetirementMarginalRate: z.number().min(0).max(1),

  // Already-planned deductions this year (standard assumed if 0)
  itemizedDeductions: z.number().nonnegative().default(0),

  // Years until retirement
  yearsToRetirement: z.number().int().min(0).max(50),

  // Assumed investment growth rate (for future value calc)
  expectedAnnualReturn: z.number().min(0).max(0.30).default(0.07),

  // Current year (defaults to today)
  taxYear: z.number().int().default(() => new Date().getFullYear()),
});
export type RothConversionInput = z.infer<typeof RothConversionInputSchema>;

export interface ConversionScenario {
  conversionAmount: number;
  label: string;                        // "Fill to 22% bracket", "Fill to 24% bracket", etc.
  incomeAfterConversion: number;
  marginalRateOnConversion: number;     // rate paid on the converted dollars
  taxCostThisYear: number;              // dollars owed on the conversion
  projectedFutureValue: number;         // tax-free value at retirement
  breakEvenYears: number | null;        // how long until Roth wins (null if it always wins)
  worthConverting: boolean;
  bracketWarning: string | null;        // warns if conversion crosses a bracket cliff
  niitWarning: string | null;           // warns if conversion triggers NIIT
}

export interface RothConversionResult {
  currentMarginalRate: number;
  currentBracketRemainingRoom: number;  // dollars until next bracket
  nextBracketRate: number;

  // RMD gate — must clear before analyzing
  rmdRequired: boolean;
  rmdEstimate: number | null;           // rough estimate only; actual requires IRS tables

  // Pro-rata flag
  proRataWarning: string | null;

  // Under-59½ flag
  fiveYearRuleNote: string | null;

  // Conversion scenarios in order of aggressiveness
  scenarios: ConversionScenario[];

  // Best recommendation
  recommendedConversionAmount: number;
  recommendedReason: string;

  legalNotices: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getMarginalRate(taxableIncome: number, filingStatus: FilingStatus): number {
  const brackets = FEDERAL_BRACKETS[filingStatus];
  let rate = brackets[0].rate;
  for (const b of brackets) {
    if (taxableIncome >= b.min) rate = b.rate;
    else break;
  }
  return rate;
}

function getNextBracketThreshold(taxableIncome: number, filingStatus: FilingStatus): {
  nextRate: number;
  roomToNextBracket: number;
} {
  const brackets = FEDERAL_BRACKETS[filingStatus];
  for (let i = 0; i < brackets.length - 1; i++) {
    if (taxableIncome >= brackets[i].min && taxableIncome < brackets[i + 1].min) {
      return {
        nextRate: brackets[i + 1].rate,
        roomToNextBracket: brackets[i + 1].min - taxableIncome,
      };
    }
  }
  // Already in top bracket
  return { nextRate: brackets[brackets.length - 1].rate, roomToNextBracket: Infinity };
}

function calcTaxOnSlice(from: number, amount: number, filingStatus: FilingStatus): number {
  const brackets = FEDERAL_BRACKETS[filingStatus];
  let remaining = amount;
  let tax = 0;
  let position = from;

  for (let i = 0; i < brackets.length; i++) {
    const bracketMax = i < brackets.length - 1 ? brackets[i + 1].min : Infinity;
    if (position >= bracketMax) continue;
    const roomInBracket = bracketMax - Math.max(position, brackets[i].min);
    const taxedHere = Math.min(remaining, roomInBracket);
    tax += taxedHere * brackets[i].rate;
    remaining -= taxedHere;
    position += taxedHere;
    if (remaining <= 0) break;
  }
  return tax;
}

// ── Main function ──────────────────────────────────────────────────────────

export function analyzeRothConversion(input: RothConversionInput): RothConversionResult {
  const deduction = Math.max(
    STANDARD_DEDUCTIONS[input.filingStatus],
    input.itemizedDeductions
  );
  const currentTaxableIncome = Math.max(0, input.ordinaryIncomeThisYear - deduction);
  const currentMarginalRate = getMarginalRate(currentTaxableIncome, input.filingStatus);
  const { nextRate, roomToNextBracket } = getNextBracketThreshold(currentTaxableIncome, input.filingStatus);

  // ── RMD gate ──────────────────────────────────────────────────────────
  // Required Minimum Distributions must be taken before any conversion (IRC §401(a)(9))
  const rmdRequired = input.age >= 73;
  // Rough RMD estimate using Uniform Lifetime Table divisor ≈ 26.5 at age 73
  // IMPORTANT: actual RMD requires Dec 31 prior-year balance and IRS life expectancy table
  const rmdDivisors: Record<number, number> = {
    73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0,
    79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8,
    85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2,
  };
  const rmdEstimate = rmdRequired
    ? Math.round(input.traditionalIraBalance / (rmdDivisors[input.age] ?? 12.2))
    : null;

  // ── Pro-rata warning ──────────────────────────────────────────────────
  const proRataWarning =
    input.nonDeductibleIraBasis > 0
      ? `You have $${input.nonDeductibleIraBasis.toLocaleString()} in non-deductible (after-tax) ` +
        `IRA basis. Conversions must be pro-rated across ALL traditional IRA funds — you cannot ` +
        `convert only the pre-tax dollars. The taxable portion = ` +
        `(pre-tax balance / total balance) × conversion amount. Consult a CPA to calculate this correctly (IRC §408(d)(2)).`
      : null;

  // ── 5-year rule note ──────────────────────────────────────────────────
  const fiveYearRuleNote =
    input.age < 59.5
      ? `You are under 59½. Each Roth conversion starts its own 5-year clock from ` +
        `January 1 of the conversion year. Withdrawing converted principal before 5 years ` +
        `triggers a 10% penalty (IRC §408A(d)(3)(F)). Plan to leave converted funds untouched ` +
        `for at least 5 years, or until age 59½ — whichever is later for penalty-free access.`
      : null;

  // ── Build conversion scenarios ────────────────────────────────────────

  const scenarios: ConversionScenario[] = [];
  const niitThreshold = NIIT_THRESHOLD[input.filingStatus];

  // Build candidate conversion amounts
  const conversionAmounts: { amount: number; label: string }[] = [];

  // Option 1: Fill current bracket only (safest — no bracket crossing)
  if (roomToNextBracket > 0 && roomToNextBracket < Infinity) {
    const fillCurrent = Math.min(roomToNextBracket, input.traditionalIraBalance);
    if (fillCurrent > 1000) {
      conversionAmounts.push({
        amount: fillCurrent,
        label: `Fill current ${(currentMarginalRate * 100).toFixed(0)}% bracket (stay under ${(nextRate * 100).toFixed(0)}%)`,
      });
    }
  }

  // Option 2: Fill through next bracket
  const brackets = FEDERAL_BRACKETS[input.filingStatus];
  for (let i = 0; i < brackets.length - 1; i++) {
    const bracket = brackets[i + 1];
    if (bracket.min > currentTaxableIncome) {
      const nextNextBracketMin = i + 2 < brackets.length ? brackets[i + 2].min : Infinity;
      const fillThrough = Math.min(
        (nextNextBracketMin === Infinity ? bracket.min + 200_000 : nextNextBracketMin) - currentTaxableIncome,
        input.traditionalIraBalance
      );
      if (fillThrough > roomToNextBracket + 1000) {
        conversionAmounts.push({
          amount: Math.min(fillThrough, input.traditionalIraBalance),
          label: `Convert through ${(bracket.rate * 100).toFixed(0)}% bracket`,
        });
      }
      if (conversionAmounts.length >= 3) break;
    }
  }

  // Option 3: Full conversion
  if (input.traditionalIraBalance > 0) {
    const alreadyHave = conversionAmounts.some((c) => c.amount >= input.traditionalIraBalance);
    if (!alreadyHave) {
      conversionAmounts.push({
        amount: input.traditionalIraBalance,
        label: "Full conversion (entire traditional IRA balance)",
      });
    }
  }

  for (const { amount, label } of conversionAmounts) {
    const incomeAfterConversion = currentTaxableIncome + amount;
    const taxCostThisYear = calcTaxOnSlice(currentTaxableIncome, amount, input.filingStatus);
    const marginalRateOnConversion = getMarginalRate(incomeAfterConversion, input.filingStatus);

    // Future value of Roth (tax-free at retirement)
    const futureValueRoth =
      amount * Math.pow(1 + input.expectedAnnualReturn, input.yearsToRetirement);

    // Future value of traditional (taxed at retirement rate on withdrawal)
    const futureValueTraditional =
      amount * Math.pow(1 + input.expectedAnnualReturn, input.yearsToRetirement) *
      (1 - input.expectedRetirementMarginalRate);

    // Break-even: years for Roth advantage to exceed conversion cost
    // Roth net = FV × 1 (no tax) − conversion tax paid today (compounded opportunity cost)
    // Traditional net = FV × (1 − retirementRate)
    // Break-even year: (amount − taxCost) × (1+r)^t = amount × (1+r)^t × (1 − retirementRate)
    // Simplifies to: (1 − taxCost/amount) = (1 − retirementRate)  — check annually
    let breakEvenYears: number | null = null;
    if (marginalRateOnConversion < input.expectedRetirementMarginalRate) {
      breakEvenYears = 0; // Roth wins immediately if converting at lower rate
    } else if (amount > 0 && taxCostThisYear < amount) {
      // Roth wins when: (amount - taxCost) × (1+r)^t > amount × (1+r)^t × (1 - retirementRate)
      // => (1 - taxCost/amount) > (1 - retirementRate)  — this is time-independent when rates are key
      // If current rate < retirement rate → always worth it; else marginal
      const conversionEffectiveRate = taxCostThisYear / amount;
      if (conversionEffectiveRate < input.expectedRetirementMarginalRate) {
        breakEvenYears = 0;
      } else {
        // Break-even in years: opportunity cost of tax payment vs. tax savings
        // Approx: years = log(savings/cost) / log(1 + r)
        const annualSavingRate = input.expectedRetirementMarginalRate - conversionEffectiveRate;
        breakEvenYears = annualSavingRate > 0
          ? null  // never breaks even
          : Math.ceil(Math.log(1 + conversionEffectiveRate / input.expectedRetirementMarginalRate) / Math.log(1 + input.expectedAnnualReturn));
      }
    }

    const worthConverting =
      marginalRateOnConversion <= input.expectedRetirementMarginalRate ||
      (taxCostThisYear / (amount || 1)) < input.expectedRetirementMarginalRate;

    // Bracket crossing warning
    let bracketWarning: string | null = null;
    const rateOnLastDollar = getMarginalRate(incomeAfterConversion, input.filingStatus);
    if (rateOnLastDollar > currentMarginalRate) {
      bracketWarning =
        `This conversion crosses into the ${(rateOnLastDollar * 100).toFixed(0)}% bracket. ` +
        `Dollars above $${(currentTaxableIncome + roomToNextBracket).toLocaleString()} are taxed at ` +
        `${(rateOnLastDollar * 100).toFixed(0)}% instead of ${(currentMarginalRate * 100).toFixed(0)}%. ` +
        `Consider limiting conversion to $${Math.round(roomToNextBracket).toLocaleString()} to avoid this.`;
    }

    // NIIT warning
    let niitWarning: string | null = null;
    if (
      input.ordinaryIncomeThisYear < niitThreshold &&
      input.ordinaryIncomeThisYear + amount > niitThreshold
    ) {
      niitWarning =
        `This conversion pushes total income above the $${niitThreshold.toLocaleString()} NIIT threshold. ` +
        `Investment income above this level is subject to an additional ${(NIIT_RATE * 100).toFixed(1)}% ` +
        `Net Investment Income Tax (IRC §1411).`;
    }

    scenarios.push({
      conversionAmount: Math.round(amount),
      label,
      incomeAfterConversion: Math.round(incomeAfterConversion),
      marginalRateOnConversion,
      taxCostThisYear: Math.round(taxCostThisYear),
      projectedFutureValue: Math.round(futureValueRoth),
      breakEvenYears,
      worthConverting,
      bracketWarning,
      niitWarning,
    });
  }

  // ── Recommendation ────────────────────────────────────────────────────

  const worthwhile = scenarios.filter((s) => s.worthConverting && !s.bracketWarning);
  const recommended = worthwhile[0] ?? scenarios[0];

  let recommendedReason: string;
  if (!recommended) {
    recommendedReason = "No traditional IRA balance to convert.";
  } else if (recommended.worthConverting && recommended.marginalRateOnConversion <= input.expectedRetirementMarginalRate) {
    recommendedReason =
      `Converting at ${(recommended.marginalRateOnConversion * 100).toFixed(0)}% today beats ` +
      `your expected ${(input.expectedRetirementMarginalRate * 100).toFixed(0)}% retirement rate. ` +
      `Tax-free growth for ${input.yearsToRetirement} years projects to ` +
      `$${recommended.projectedFutureValue.toLocaleString()}.`;
  } else {
    recommendedReason =
      `Converting at ${(recommended.marginalRateOnConversion * 100).toFixed(0)}% today may not beat ` +
      `your expected ${(input.expectedRetirementMarginalRate * 100).toFixed(0)}% retirement rate. ` +
      `Consider a smaller conversion to hedge tax-rate uncertainty.`;
  }

  const legalNotices = [
    "Roth conversions are irrevocable since 2018 (re-characterization eliminated by Tax Cuts and Jobs Act). You cannot undo a conversion.",
    rmdRequired
      ? `You are 73+. RMDs (~$${rmdEstimate?.toLocaleString()}) must be distributed BEFORE converting (IRC §401(a)(9)). You cannot convert your RMD amount.`
      : "No RMD required — you may convert freely.",
    "Conversion income may affect Medicare IRMAA surcharges (based on income 2 years prior), Roth IRA contribution eligibility for the tax year, and ACA premium tax credits if applicable.",
    "State income tax applies to conversions in most states — factor in your state rate.",
    "This analysis is informational only and does not constitute personalized tax advice. Consult a CPA or tax advisor before executing a Roth conversion.",
  ].filter(Boolean) as string[];

  return {
    currentMarginalRate,
    currentBracketRemainingRoom: Math.round(Math.min(roomToNextBracket, input.traditionalIraBalance)),
    nextBracketRate: nextRate,
    rmdRequired,
    rmdEstimate,
    proRataWarning,
    fiveYearRuleNote,
    scenarios,
    recommendedConversionAmount: recommended?.conversionAmount ?? 0,
    recommendedReason,
    legalNotices,
  };
}
