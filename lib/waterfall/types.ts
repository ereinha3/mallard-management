import { z } from "zod";
import { CONTRIBUTION_LIMITS } from "../tax/constants";

// ── Input ──────────────────────────────────────────────────────────────────

export const AccountBalancesSchema = z.object({
  traditional401k: z.number().nonnegative().default(0),
  roth401k: z.number().nonnegative().default(0),
  rothIRA: z.number().nonnegative().default(0),
  traditionalIRA: z.number().nonnegative().default(0),
  hsa: z.number().nonnegative().default(0),
  taxableBrokerage: z.number().nonnegative().default(0),
}).default({ traditional401k: 0, roth401k: 0, rothIRA: 0, traditionalIRA: 0, hsa: 0, taxableBrokerage: 0 });
export type AccountBalances = z.infer<typeof AccountBalancesSchema>;

export const EmployerMatchSchema = z.object({
  matchRate: z.number().min(0).max(1),         // e.g. 0.50 = 50% match
  matchUpToPercent: z.number().min(0).max(1),  // e.g. 0.06 = up to 6% of salary
  vestedImmediately: z.boolean().default(true),
});
export type EmployerMatch = z.infer<typeof EmployerMatchSchema>;

export const WaterfallInputSchema = z.object({
  // From tax engine
  grossAnnualIncome: z.number().nonnegative(),
  federalMarginalRate: z.number().min(0).max(1),
  combinedMarginalRate: z.number().min(0).max(1),
  age: z.number().int().min(0),
  filingStatus: z.enum(["single", "married_filing_jointly", "married_filing_separately", "head_of_household"]),

  // From gate / location profile
  monthlySurplus: z.number(),          // can be negative (gate should have caught this)
  capitalToInvest: z.number().nonnegative().default(0),  // lump sum available now

  // Account setup
  currentBalances: AccountBalancesSchema,
  currentMonthlyContributions: z.object({
    traditional401k: z.number().nonnegative().default(0),
    rothIRA: z.number().nonnegative().default(0),
    traditionalIRA: z.number().nonnegative().default(0),
    hsa: z.number().nonnegative().default(0),
  }).default({ traditional401k: 0, rothIRA: 0, traditionalIRA: 0, hsa: 0 }),

  // Employer
  has401k: z.boolean().default(false),
  employerMatch: EmployerMatchSchema.optional(),
  hasHSAEligiblePlan: z.boolean().default(false),

  // Roth IRA income limit override (if user already knows they need backdoor)
  forceBackdoorRoth: z.boolean().default(false),
});
export type WaterfallInput = z.infer<typeof WaterfallInputSchema>;

// ── Output ─────────────────────────────────────────────────────────────────

export type AccountType =
  | "emergency_fund"
  | "traditional_401k_match"    // 401k only up to employer match
  | "traditional_401k_beyond"   // 401k past the match
  | "roth_ira"
  | "traditional_ira"
  | "backdoor_roth_ira"
  | "hsa"
  | "taxable_brokerage";

export interface WaterfallBucket {
  priority: number;
  accountType: AccountType;
  label: string;
  monthlyAmount: number;
  annualAmount: number;
  annualLimit: number;            // 2024 IRS limit for this account
  alreadyContributing: number;    // what they put in now
  additionalNeeded: number;       // how much more they should add
  remainingCapacity: number;      // annual limit - already contributing
  isMaxed: boolean;
  taxTreatment: string;           // plain English: "Pre-tax", "Post-tax (tax-free growth)", etc.
  whyThisOrder: string;           // the math reason
}

export interface IRADecision {
  type: "roth" | "traditional" | "backdoor_roth" | "ineligible";
  marginalRate: number;
  threshold: number;              // the rate used to make the call
  reason: string;                 // plain-English tax math, no opinions
  incomeOverLimit: boolean;
}

export interface WaterfallResult {
  // The ordered allocation
  buckets: WaterfallBucket[];

  // Monthly totals
  totalMonthlyContributions: number;
  surplusAfterContributions: number;   // what's left after filling all buckets

  // Lump sum allocation (capital on hand)
  lumpSumAllocation: LumpSumAllocation[];
  capitalRemaining: number;

  // IRA decision
  iraDecision: IRADecision;

  // Employer match capture
  employerMatchAnnual: number;         // free money from employer per year
  employerMatchCaptured: boolean;

  // Annual contribution totals
  annualTaxAdvantaged: number;         // total going into tax-sheltered accounts
  annualTaxable: number;               // total going into taxable brokerage

  // Summary for Ben's UI
  summary: string;
}

export interface LumpSumAllocation {
  accountType: AccountType;
  label: string;
  amount: number;
  reason: string;
}
