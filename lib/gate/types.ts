import { z } from "zod";

export const DebtInputSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["credit_card", "student_loan", "mortgage", "auto", "medical", "other"]),
  balance: z.number().nonnegative(),
  apr: z.number().nonnegative(),        // as decimal: 0.24 = 24%
  minimumPayment: z.number().nonnegative(),
  extraPayment: z.number().nonnegative().default(0),
});
export type DebtInput = z.infer<typeof DebtInputSchema>;

export const GateInputSchema = z.object({
  // Financial position
  monthlyGrossIncome: z.number().nonnegative(),
  monthlyExpenses: z.number().nonnegative(),  // actual user-input expenses
  liquidSavings: z.number().nonnegative(),    // cash in checking/savings right now
  capitalToInvest: z.number().nonnegative(),  // lump sum available to invest or pay debt

  // Debts
  debts: z.array(DebtInputSchema).default([]),

  // Tax context (from Gilbert's tax engine output)
  federalMarginalRate: z.number().min(0).max(1),
  combinedMarginalRate: z.number().min(0).max(1),
  ltcgRate: z.number().min(0).max(1).default(0.15),  // long-term cap gains rate

  // Market assumption
  expectedMarketReturn: z.number().default(0.07),  // 7% nominal, user can override
});
export type GateInput = z.infer<typeof GateInputSchema>;

// ── Output types ──────────────────────────────────────────────────────────

export type GateVerdict = "halt" | "caution" | "clear";
export type HaltReason = "no_emergency_fund" | "high_interest_debt" | "negative_surplus";

export interface DebtAnalysis {
  id: string;
  label: string;
  type: string;
  balance: number;
  apr: number;
  effectiveApr: number;           // after-tax rate (lower for deductible debt)
  isDeductible: boolean;
  monthlyPayment: number;         // min + extra
  minimumPayment: number;
  monthsToPayoff: number;
  totalInterestRemaining: number;
  // The core comparison
  afterTaxMarketReturn: number;   // what investing earns after tax
  spreadVsMarket: number;         // effectiveApr - afterTaxMarketReturn (positive = pay debt)
  recommendation: "pay_first" | "pay_alongside" | "minimum_only";
  rationale: string;
}

export interface EmergencyFundCheck {
  passed: boolean;
  monthsCovered: number;
  targetMonths: number;
  currentSavings: number;
  targetSavings: number;
  shortfall: number;
  monthsToTarget: number | null;  // how long to build it at current surplus
}

export interface SurplusCheck {
  passed: boolean;
  monthlySurplus: number;         // income - expenses - minimum debt payments
  monthlyMinDebtPayments: number;
}

export interface GateResult {
  verdict: GateVerdict;
  haltReason: HaltReason | null;
  clearToProceed: boolean;
  clearToInvest: boolean;   // alias for clearToProceed — used by frontend

  // Ordered gate checks
  surplusCheck: SurplusCheck;
  emergencyFund: EmergencyFundCheck;

  // Debt analysis
  debts: DebtAnalysis[];
  blockingDebts: DebtAnalysis[];   // must pay before investing
  allowedDebts: DebtAnalysis[];    // ok to carry while investing

  // What to do with capital on hand
  capitalAllocation: CapitalAllocation;

  // Math shown to user
  afterTaxMarketReturn: number;
  expectedMarketReturn: number;

  // Summary text for Ben's UI
  headline: string;
  explanation: string;
  actionItems: string[];
}

export interface CapitalAllocation {
  toEmergencyFund: number;
  toDebtPayoff: number;    // recommended lump-sum toward blocking debt
  toInvesting: number;
  rationale: string;
}
