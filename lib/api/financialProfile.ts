import { z } from "zod";
import { calculateTax, analyzeTaxSavings } from "../tax/calculator";
import { TaxInputSchema } from "../tax/types";

// ── Debt input ─────────────────────────────────────────────────────────────

export const DebtSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["credit_card", "student_loan", "mortgage", "auto", "medical", "other"]),
  balance: z.number().nonnegative(),
  apr: z.number().nonnegative(),
  minimumPayment: z.number().nonnegative(),
});
export type Debt = z.infer<typeof DebtSchema>;

// ── Full profile input ─────────────────────────────────────────────────────

export const FinancialProfileInputSchema = z.object({
  tax: TaxInputSchema,
  debts: z.array(DebtSchema).default([]),
  assets: z
    .object({
      retirement401k: z.number().nonnegative().default(0),
      primaryHome: z.number().nonnegative().default(0),
      brokerage: z.number().nonnegative().default(0),
      savingsCash: z.number().nonnegative().default(0),
      vehicle: z.number().nonnegative().default(0),
      other: z.number().nonnegative().default(0),
    })
    .default({ retirement401k: 0, primaryHome: 0, brokerage: 0, savingsCash: 0, vehicle: 0, other: 0 }),
  monthlySavingsContribution: z.number().nonnegative().default(0),
  retirementTargetYear: z.number().int().default(2041),
});
export type FinancialProfileInput = z.infer<typeof FinancialProfileInputSchema>;

// ── Output types (consumed by Ben's UI) ───────────────────────────────────

export interface MonthlySnapshotRow {
  label: string;
  value: number; // negative = expense
  positive: boolean;
}

export interface AssetRow {
  label: string;
  value: number;
  percent: number;
  type: string;
}

export interface LiabilityRow {
  id: string;
  label: string;
  balance: number;
  apr: number;
  effectiveApr: number; // after-tax rate (lower for deductible debt)
  monthlyPayment: number;
  type: string;
}

export interface ProjectionPoint {
  year: string;
  conservative: number;
  base: number;
  optimistic: number;
}

export interface FinancialProfileOutput {
  monthlySnapshot: MonthlySnapshotRow[];
  netCashFlow: number;
  assets: AssetRow[];
  totalAssets: number;
  totalNetWorth: number;
  liabilities: LiabilityRow[];
  totalLiabilities: number;
  retirementScore: number;
  projections: ProjectionPoint[];
  taxSummary: {
    effectiveFederalRate: number;
    effectiveStateRate: number;
    federalMarginalRate: number;
    combinedMarginalRate: number;
    annualTax: number;
    monthlyTax: number;
    takeHomePay: number;
    monthlyTakeHome: number;
  };
  recommendations: {
    rothRecommended: boolean;
    rothReason: string;
    backdoorRothNeeded: boolean;
    additionalSavings401k: number | null;
    savings401kValue: number;
    savingsHSAValue: number;
  };
}

// ── Effective APR after tax deductions ────────────────────────────────────

function effectiveDebtRate(debt: Debt, marginalRate: number): number {
  if (debt.type === "student_loan") return debt.apr * (1 - marginalRate);
  if (debt.type === "mortgage") return debt.apr * (1 - marginalRate);
  return debt.apr; // credit card, auto, medical — not deductible
}

// ── Retirement score heuristic (0–100) ────────────────────────────────────
// Factors: savings rate, debt-to-income, net worth vs income, on-track for target

function computeRetirementScore(
  input: FinancialProfileInput,
  annualTakeHome: number,
  totalAssets: number,
  totalDebt: number
): number {
  const grossIncome = input.tax.grossIncome;
  const age = input.tax.age;
  const yearsToRetirement = Math.max(1, input.retirementTargetYear - new Date().getFullYear());

  // Savings rate: 15%+ is healthy, score 0–25
  const savingsRate =
    grossIncome > 0 ? (input.monthlySavingsContribution * 12) / grossIncome : 0;
  const savingsScore = Math.min(25, (savingsRate / 0.15) * 25);

  // Debt-to-income: below 36% is healthy, score 0–25
  const annualDebtPayments = input.debts.reduce((s, d) => s + d.minimumPayment * 12, 0);
  const dti = grossIncome > 0 ? annualDebtPayments / grossIncome : 1;
  const debtScore = Math.min(25, ((1 - Math.min(dti / 0.36, 1)) * 25));

  // Net worth vs income multiple (rule of thumb: 1× income by 30, 3× by 40, etc.)
  const targetMultiple = Math.max(1, (age - 20) / 5);
  const actualMultiple = grossIncome > 0 ? (totalAssets - totalDebt) / grossIncome : 0;
  const networthScore = Math.min(25, (actualMultiple / targetMultiple) * 25);

  // Time-adjusted trajectory: can they plausibly hit 25× income by retirement?
  const targetNestEgg = grossIncome * 25;
  const currentNestEgg = totalAssets - totalDebt;
  const annualContribution = input.monthlySavingsContribution * 12;
  const projectedAtRetirement =
    currentNestEgg * Math.pow(1.07, yearsToRetirement) +
    annualContribution * ((Math.pow(1.07, yearsToRetirement) - 1) / 0.07);
  const trajectoryScore = Math.min(25, (projectedAtRetirement / targetNestEgg) * 25);

  return Math.round(savingsScore + debtScore + networthScore + trajectoryScore);
}

// ── Projection chart data ──────────────────────────────────────────────────

function buildProjections(
  input: FinancialProfileInput,
  currentNetWorth: number
): ProjectionPoint[] {
  const currentYear = new Date().getFullYear();
  const endYear = Math.max(input.retirementTargetYear + 10, currentYear + 30);
  const annualContribution = input.monthlySavingsContribution * 12;

  const points: ProjectionPoint[] = [];

  for (let year = currentYear; year <= endYear; year += 2) {
    const t = year - currentYear;
    const base = currentNetWorth * Math.pow(1.07, t) + annualContribution * ((Math.pow(1.07, t) - 1) / 0.07);
    const optimistic = currentNetWorth * Math.pow(1.10, t) + annualContribution * ((Math.pow(1.10, t) - 1) / 0.10);
    const conservative = currentNetWorth * Math.pow(1.04, t) + annualContribution * ((Math.pow(1.04, t) - 1) / 0.04);

    points.push({
      year: String(year),
      base: Math.round(base),
      optimistic: Math.round(optimistic),
      conservative: Math.round(conservative),
    });
  }

  return points;
}

// ── Main builder ───────────────────────────────────────────────────────────

export function buildFinancialProfile(input: FinancialProfileInput): FinancialProfileOutput {
  const taxSummary = calculateTax(input.tax);
  const savings = analyzeTaxSavings(input.tax, taxSummary);

  const monthlyTax = taxSummary.totalTax / 12;
  const monthlyGross = input.tax.grossIncome / 12;
  const monthlyTakeHome = taxSummary.takeHomePay / 12;

  // Monthly snapshot rows (matching Ben's component shape)
  const fixedExpenses = input.debts.reduce((s, d) => s + d.minimumPayment, 0);
  const monthlySnapshot: MonthlySnapshotRow[] = [
    { label: "Gross Income", value: Math.round(monthlyGross), positive: true },
    { label: "Tax Withheld", value: -Math.round(monthlyTax), positive: false },
    { label: "Debt Payments", value: -Math.round(fixedExpenses), positive: false },
    { label: "Investments", value: -input.monthlySavingsContribution, positive: false },
  ];
  const netCashFlow = Math.round(monthlyTakeHome - fixedExpenses - input.monthlySavingsContribution);

  // Assets
  const a = input.assets;
  const assetValues: [string, number, string][] = [
    ["401(k) / IRA", a.retirement401k, "retirement"],
    ["Primary Home", a.primaryHome, "home"],
    ["Brokerage", a.brokerage, "brokerage"],
    ["Savings / Cash", a.savingsCash, "savings"],
    ["Vehicle", a.vehicle, "vehicle"],
    ["Other", a.other, "other"],
  ];
  const totalAssets = assetValues.reduce((s, [, v]) => s + v, 0);
  const assetRows: AssetRow[] = assetValues
    .filter(([, v]) => v > 0)
    .map(([label, value, type]) => ({
      label,
      value,
      percent: totalAssets > 0 ? (value / totalAssets) * 100 : 0,
      type,
    }));

  // Liabilities
  const combinedMarginalRate = taxSummary.combinedMarginalRate;
  const totalLiabilities = input.debts.reduce((s, d) => s + d.balance, 0);
  const liabilityRows: LiabilityRow[] = input.debts.map((d) => ({
    id: d.id,
    label: d.label,
    balance: d.balance,
    apr: d.apr,
    effectiveApr: effectiveDebtRate(d, combinedMarginalRate),
    monthlyPayment: d.minimumPayment,
    type: d.type,
  }));

  const totalNetWorth = totalAssets - totalLiabilities;

  // Retirement score
  const retirementScore = computeRetirementScore(input, taxSummary.takeHomePay, totalAssets, totalLiabilities);

  // Projections
  const projections = buildProjections(input, totalNetWorth);

  return {
    monthlySnapshot,
    netCashFlow,
    assets: assetRows,
    totalAssets,
    totalNetWorth,
    liabilities: liabilityRows,
    totalLiabilities,
    retirementScore,
    projections,
    taxSummary: {
      effectiveFederalRate: taxSummary.federal.effectiveRate,
      effectiveStateRate: taxSummary.state.effectiveRate,
      federalMarginalRate: taxSummary.federalMarginalRate,
      combinedMarginalRate: taxSummary.combinedMarginalRate,
      annualTax: taxSummary.totalTax,
      monthlyTax: Math.round(monthlyTax),
      takeHomePay: taxSummary.takeHomePay,
      monthlyTakeHome: Math.round(monthlyTakeHome),
    },
    recommendations: {
      rothRecommended: savings.rothRecommended,
      rothReason: savings.rothReason,
      backdoorRothNeeded: savings.backdoorRothNeeded,
      additionalSavings401k: savings.additionalTraditional401k,
      savings401kValue: savings.savings401k,
      savingsHSAValue: savings.savingsHSA,
    },
  };
}
