import {
  TaxInput,
  TaxSummary,
  FederalTaxResult,
  FICAResult,
  StateTaxResult,
  CapitalGainsTaxResult,
} from "./types";
import {
  FEDERAL_BRACKETS,
  STANDARD_DEDUCTIONS,
  ADDITIONAL_STANDARD_DEDUCTION_65,
  SALT_CAP,
  SS_WAGE_BASE,
  SS_RATE,
  MEDICARE_RATE,
  ADDITIONAL_MEDICARE_RATE,
  ADDITIONAL_MEDICARE_THRESHOLD,
  SE_TAX_RATE,
  SE_DEDUCTIBLE_PORTION,
  LTCG_BRACKETS,
  NIIT_RATE,
  NIIT_THRESHOLD,
  CONTRIBUTION_LIMITS,
} from "./constants";
import { applyBrackets } from "./brackets";
import { getStateBrackets, getStateDeduction } from "./stateTax";

// ── Federal Income Tax ─────────────────────────────────────────────────────

function computeFederalTax(input: TaxInput): FederalTaxResult {
  const {
    grossIncome,
    filingStatus,
    age,
    traditional401kContributions,
    hsaContributions,
    studentLoanInterestPaid,
    mortgageInterestPaid,
    charitableContributions,
    stateAndLocalTaxesPaid,
    isSelfEmployed,
    shortTermCapitalGains,
  } = input;

  // SE tax deduction (half of self-employment tax, computed on net SE income)
  const seTaxDeduction = isSelfEmployed
    ? grossIncome * SE_TAX_RATE * SE_DEDUCTIBLE_PORTION
    : 0;

  // Student loan interest is capped and phases out at higher incomes
  // Phase-out: single $75k–$90k, MFJ $155k–$185k (2024)
  const slInterestPhaseout = computeStudentLoanPhaseout(
    grossIncome,
    filingStatus,
    studentLoanInterestPaid
  );

  // AGI: gross minus above-the-line deductions
  const agi =
    grossIncome -
    Math.min(traditional401kContributions, getMaxTraditional401k(age)) -
    Math.min(hsaContributions, getMaxHSA(input)) -
    slInterestPhaseout -
    seTaxDeduction;

  // Standard deduction (including 65+ adjustment)
  let standardDeduction = STANDARD_DEDUCTIONS[filingStatus];
  if (age >= 65) {
    standardDeduction += ADDITIONAL_STANDARD_DEDUCTION_65[filingStatus];
  }

  // Itemized deduction
  const saltCapped = Math.min(stateAndLocalTaxesPaid, SALT_CAP);
  const itemizedDeduction =
    saltCapped + mortgageInterestPaid + charitableContributions;

  const useItemized = itemizedDeduction > standardDeduction;
  const deductionAmount = useItemized ? itemizedDeduction : standardDeduction;
  const deductionType = useItemized ? "itemized" : "standard";

  // Taxable income (can't be negative)
  // Short-term cap gains are already part of gross income / treated as ordinary income
  const taxableIncome = Math.max(0, agi - deductionAmount);

  const brackets = FEDERAL_BRACKETS[filingStatus];
  const { tax, breakdown, marginalRate } = applyBrackets(taxableIncome, brackets);

  return {
    grossIncome,
    adjustedGrossIncome: agi,
    deductionType,
    deductionAmount,
    taxableIncome,
    regularTax: tax,
    bracketBreakdown: breakdown,
    effectiveRate: grossIncome > 0 ? tax / grossIncome : 0,
    marginalRate,
  };
}

// ── FICA ───────────────────────────────────────────────────────────────────

function computeFICA(input: TaxInput): FICAResult {
  const { grossIncome, filingStatus, isSelfEmployed } = input;

  let ssTax: number;
  let medicareTax: number;

  if (isSelfEmployed) {
    // Self-employed pays both sides but on 92.35% of net SE income
    const netSEIncome = grossIncome * 0.9235;
    ssTax = Math.min(netSEIncome, SS_WAGE_BASE) * SS_RATE * 2; // both halves
    medicareTax = netSEIncome * MEDICARE_RATE * 2;
  } else {
    ssTax = Math.min(grossIncome, SS_WAGE_BASE) * SS_RATE;
    medicareTax = grossIncome * MEDICARE_RATE;
  }

  const additionalMedicareThreshold = ADDITIONAL_MEDICARE_THRESHOLD[filingStatus];
  const additionalMedicareTax =
    grossIncome > additionalMedicareThreshold
      ? (grossIncome - additionalMedicareThreshold) * ADDITIONAL_MEDICARE_RATE
      : 0;

  const totalFICA = ssTax + medicareTax + additionalMedicareTax;

  return {
    socialSecurityTax: ssTax,
    medicareTax,
    additionalMedicareTax,
    totalFICA,
    effectiveRate: grossIncome > 0 ? totalFICA / grossIncome : 0,
  };
}

// ── State Tax ──────────────────────────────────────────────────────────────

function computeStateTax(input: TaxInput, federalAGI: number): StateTaxResult {
  const { state, filingStatus } = input;

  const stateDeduction = getStateDeduction(state, filingStatus);
  const taxableIncome = Math.max(0, federalAGI - stateDeduction);

  const brackets = getStateBrackets(state, filingStatus);
  const { tax, marginalRate } = applyBrackets(taxableIncome, brackets);

  return {
    state,
    taxableIncome,
    stateTax: tax,
    effectiveRate: federalAGI > 0 ? tax / federalAGI : 0,
    marginalRate,
  };
}

// ── Capital Gains & NIIT ───────────────────────────────────────────────────

function computeCapitalGainsTax(
  input: TaxInput,
  federalResult: FederalTaxResult
): CapitalGainsTaxResult {
  const { filingStatus, longTermCapitalGains, qualifiedDividends, ordinaryDividends } = input;

  // Short-term gains already taxed as ordinary income — no double-count
  const shortTermGainsTax = 0; // taxed in federal brackets above

  // LTCG & qualified dividends: stacked on top of ordinary taxable income
  const ordinaryTaxableIncome =
    federalResult.taxableIncome - Math.max(0, longTermCapitalGains + qualifiedDividends);
  const ltcgIncome = longTermCapitalGains + qualifiedDividends;

  let ltcgTax = 0;
  let ltcgRate = 0;

  if (ltcgIncome > 0) {
    // Find LTCG rate based on total taxable income (ordinary + LTCG)
    const ltcgBrackets = LTCG_BRACKETS[filingStatus];

    // Tax each dollar of LTCG at its appropriate rate, stacked on top of ordinary income
    let remainingLtcg = ltcgIncome;
    let ordinaryBase = Math.max(0, ordinaryTaxableIncome);

    for (let i = ltcgBrackets.length - 1; i >= 0; i--) {
      const bracket = ltcgBrackets[i];
      const nextMin = ltcgBrackets[i + 1]?.min ?? Infinity;

      const roomInBracket = Math.max(
        0,
        Math.min(ordinaryBase + remainingLtcg, nextMin) - Math.max(ordinaryBase, bracket.min)
      );

      if (roomInBracket > 0) {
        ltcgTax += roomInBracket * bracket.rate;
        ltcgRate = bracket.rate; // highest rate touched
        remainingLtcg -= roomInBracket;
      }

      if (remainingLtcg <= 0) break;
    }
  }

  // NIIT: 3.8% on net investment income if AGI exceeds threshold
  const niitThreshold = NIIT_THRESHOLD[filingStatus];
  const totalInvestmentIncome =
    longTermCapitalGains + qualifiedDividends + (ordinaryDividends - qualifiedDividends);
  const niit =
    federalResult.adjustedGrossIncome > niitThreshold
      ? Math.min(
          totalInvestmentIncome,
          federalResult.adjustedGrossIncome - niitThreshold
        ) * NIIT_RATE
      : 0;

  return {
    shortTermGainsTax,
    longTermGainsTax: ltcgTax,
    qualifiedDividendsTax: 0, // already folded into ltcgTax above
    niit,
    ltcgRate,
    totalCapitalGainsTax: ltcgTax + niit,
  };
}

// ── Main Entry Point ───────────────────────────────────────────────────────

export function calculateTax(input: TaxInput): TaxSummary {
  const federal = computeFederalTax(input);
  const fica = computeFICA(input);
  const state = computeStateTax(input, federal.adjustedGrossIncome);
  const capitalGains = computeCapitalGainsTax(input, federal);

  const totalTax =
    federal.regularTax + fica.totalFICA + state.stateTax + capitalGains.totalCapitalGainsTax;

  const combinedMarginalRate = federal.marginalRate + state.marginalRate;

  return {
    input,
    federal,
    fica,
    state,
    capitalGains,
    totalTax,
    effectiveTotalRate: input.grossIncome > 0 ? totalTax / input.grossIncome : 0,
    federalMarginalRate: federal.marginalRate,
    combinedMarginalRate,
    takeHomePay: input.grossIncome - totalTax,
  };
}

// ── Tax Savings Analysis ───────────────────────────────────────────────────

export interface TaxSavingsAnalysis {
  additionalTraditional401k: number | null; // how much more can be contributed
  savings401k: number; // tax savings from maxing 401k
  savingsHSA: number; // tax savings from maxing HSA
  savingsStudentLoanDeduction: number; // marginal value of the deduction
  rothRecommended: boolean;
  rothReason: string;
  backdoorRothNeeded: boolean;
}

export function analyzeTaxSavings(input: TaxInput, summary: TaxSummary): TaxSavingsAnalysis {
  const { age, filingStatus, state, isSelfEmployed } = input;
  const marginalRate = summary.combinedMarginalRate;

  const max401k =
    getMaxTraditional401k(age) - (input.traditional401kContributions ?? 0);
  const maxHSA = getMaxHSA(input) - (input.hsaContributions ?? 0);

  const savings401k = Math.max(0, max401k) * marginalRate;
  const savingsHSA = Math.max(0, maxHSA) * marginalRate;
  const savingsStudentLoanDeduction =
    Math.min(input.studentLoanInterestPaid, CONTRIBUTION_LIMITS.studentLoanInterestDeduction) *
    marginalRate;

  // Roth vs Traditional: if current marginal < expected retirement marginal → Roth
  // We use a heuristic: < 22% combined marginal → lean Roth
  const rothRecommended = marginalRate < 0.32;
  const rothReason = rothRecommended
    ? `Your combined marginal rate (${formatPct(marginalRate)}) is relatively low. Roth contributions lock in today's lower rate; withdrawals in retirement will be tax-free.`
    : `Your combined marginal rate (${formatPct(marginalRate)}) is high. Traditional (pre-tax) contributions reduce your tax bill today; you'll pay tax on withdrawals in what may be a lower bracket.`;

  // Backdoor Roth check
  const { start: phaseoutStart } = getRothPhaseout(filingStatus);
  const backdoorRothNeeded = input.grossIncome > phaseoutStart;

  // Oregon note
  let finalRothReason = rothReason;
  if (state === "OR") {
    finalRothReason +=
      " Note: Oregon taxes Traditional IRA/401k withdrawals but Roth withdrawals are Oregon tax-free — this strengthens the case for Roth.";
  }

  return {
    additionalTraditional401k: Math.max(0, max401k),
    savings401k,
    savingsHSA,
    savingsStudentLoanDeduction,
    rothRecommended,
    rothReason: finalRothReason,
    backdoorRothNeeded,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getMaxTraditional401k(age: number): number {
  return age >= 50
    ? CONTRIBUTION_LIMITS.traditional401k + CONTRIBUTION_LIMITS.catchUp401k
    : CONTRIBUTION_LIMITS.traditional401k;
}

function getMaxHSA(input: TaxInput): number {
  // Simplified: use single limit; in production you'd pass a hasFamily flag
  const base = CONTRIBUTION_LIMITS.hsaSingle;
  const catchUp = input.age >= 55 ? CONTRIBUTION_LIMITS.hsaCatchUp : 0;
  return base + catchUp;
}

function computeStudentLoanPhaseout(
  grossIncome: number,
  filingStatus: FilingStatus,
  interestPaid: number
): number {
  if (interestPaid <= 0) return 0;

  const phaseouts: Record<string, { start: number; end: number }> = {
    single: { start: 75_000, end: 90_000 },
    married_filing_jointly: { start: 155_000, end: 185_000 },
    married_filing_separately: { start: 0, end: 0 }, // not eligible
    head_of_household: { start: 75_000, end: 90_000 },
  };

  const { start, end } = phaseouts[filingStatus];
  if (filingStatus === "married_filing_separately") return 0;
  if (grossIncome >= end) return 0;

  const cap = Math.min(interestPaid, CONTRIBUTION_LIMITS.studentLoanInterestDeduction);
  if (grossIncome <= start) return cap;

  const phaseoutFraction = (grossIncome - start) / (end - start);
  return cap * (1 - phaseoutFraction);
}

function getRothPhaseout(filingStatus: FilingStatus): { start: number; end: number } {
  const phaseouts: Record<string, { start: number; end: number }> = {
    single: { start: 146_000, end: 161_000 },
    married_filing_jointly: { start: 230_000, end: 240_000 },
    married_filing_separately: { start: 0, end: 10_000 },
    head_of_household: { start: 146_000, end: 161_000 },
  };
  return phaseouts[filingStatus];
}

type FilingStatus = TaxInput["filingStatus"];

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
