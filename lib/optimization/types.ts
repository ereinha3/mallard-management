/**
 * Quarterly Optimization — Shared Types
 *
 * A ClientSnapshot is everything we need to run all four tax optimization
 * strategies for one client in one quarterly pass. Ben's frontend collects
 * this and POSTs it; the quarterly script reads it from a JSON file per client.
 */

import { z } from "zod";
import { FilingStatusSchema, StateSchema } from "../tax/types";

// ── Holdings ───────────────────────────────────────────────────────────────

export const AccountTypeSchema = z.enum([
  "traditional_401k",
  "roth_401k",
  "traditional_ira",
  "roth_ira",
  "hsa",
  "taxable_brokerage",
]);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const HoldingSchema = z.object({
  ticker: z.string(),
  name: z.string().default(""),
  shares: z.number().positive(),
  costBasisPerShare: z.number().nonnegative(),
  currentPricePerShare: z.number().nonnegative(),
  purchaseDate: z.string(),           // ISO "YYYY-MM-DD"
  accountType: AccountTypeSchema,
  isRealEstate: z.boolean().default(false),
  depreciationTaken: z.number().nonnegative().default(0),
});
export type Holding = z.infer<typeof HoldingSchema>;

// ── Tax profile ────────────────────────────────────────────────────────────

export const ClientTaxProfileSchema = z.object({
  grossIncome: z.number().nonnegative(),
  filingStatus: FilingStatusSchema,
  state: StateSchema,
  age: z.number().int().min(18).max(120),

  // Rates (pass from /api/tax/calculate output — keeps this module decoupled)
  federalMarginalRate: z.number().min(0).max(1),
  combinedMarginalRate: z.number().min(0).max(1),
  ltcgRate: z.number().min(0).max(0.238),
  stateLtcgRate: z.number().min(0).max(0.20).default(0),

  // Deductions this year
  itemizedDeductions: z.number().nonnegative().default(0),
});
export type ClientTaxProfile = z.infer<typeof ClientTaxProfileSchema>;

// ── IRA / retirement context ───────────────────────────────────────────────

export const RetirementContextSchema = z.object({
  traditionalIraBalance: z.number().nonnegative().default(0),
  rothIraBalance: z.number().nonnegative().default(0),
  nonDeductibleIraBasis: z.number().nonnegative().default(0),
  expectedRetirementMarginalRate: z.number().min(0).max(1).default(0.22),
  yearsToRetirement: z.number().int().min(0).max(50).default(20),
  expectedAnnualReturn: z.number().min(0).max(0.30).default(0.07),
});
export type RetirementContext = z.infer<typeof RetirementContextSchema>;

// ── YTD realized gain/loss context ────────────────────────────────────────

export const YtdGainsSchema = z.object({
  realizedShortTermGains: z.number().default(0),
  realizedLongTermGains: z.number().default(0),
  shortTermLossCarryforward: z.number().nonnegative().default(0),
  longTermLossCarryforward: z.number().nonnegative().default(0),
});
export type YtdGains = z.infer<typeof YtdGainsSchema>;

// ── Portfolio target weights ───────────────────────────────────────────────

// Monthly contributions by account (used by rebalancer for contribution-first rebalancing)
export const MonthlyContributionsSchema = z.record(z.string(), z.number().nonnegative()).default({});

// ── Full client snapshot ───────────────────────────────────────────────────

export const ClientSnapshotSchema = z.object({
  // Client identifier (no PII — just an ID for logging)
  clientId: z.string(),

  // As-of date for this snapshot (defaults to today)
  asOfDate: z.string().default(() => new Date().toISOString().slice(0, 10)),

  // All positions across all accounts
  holdings: z.array(HoldingSchema),

  // Tax profile for this year
  taxProfile: ClientTaxProfileSchema,

  // IRA / retirement data
  retirement: RetirementContextSchema,

  // Gains/losses realized so far this calendar year
  ytdGains: YtdGainsSchema,

  // Target portfolio weights (ticker → fraction, should sum to ~1.0)
  targetWeights: z.record(z.string(), z.number().min(0).max(1)),

  // Monthly contributions flowing into accounts
  monthlyContributions: MonthlyContributionsSchema,

  // Minimum dollar amount worth acting on (filters out tiny recommendations)
  minimumActionThreshold: z.number().nonnegative().default(500),

  // Drift threshold before rebalancing is triggered
  rebalanceDriftThreshold: z.number().min(0.01).max(0.25).default(0.05),

  // Optional: estimated transaction cost per trade (for net-benefit calc)
  estimatedTradeCostDollars: z.number().nonnegative().default(0),
});
export type ClientSnapshot = z.infer<typeof ClientSnapshotSchema>;

// ── Output types ───────────────────────────────────────────────────────────

export type ActionPriority = "urgent" | "high" | "medium" | "low" | "monitor";
export type ActionCategory = "harvest" | "roth_conversion" | "gains_timing" | "rebalance";

export interface OptimizationAction {
  id: string;
  category: ActionCategory;
  priority: ActionPriority;
  title: string;
  detail: string;
  estimatedDollarImpact: number;    // positive = savings, negative = cost
  impactLabel: string;              // human-readable e.g. "$1,200 tax savings"
  tickers: string[];                // positions involved
  deadline: string | null;          // "Before Dec 31, 2026" / "Within 30 days" / null
  requiresCpa: boolean;             // flag for actions needing professional review
  legalBasis: string;               // short citation e.g. "IRC §1091"
}

export interface QuarterlyOptimizationReport {
  clientId: string;
  asOfDate: string;
  quarter: string;                  // e.g. "Q2 2026"

  // Ordered action list — execute top to bottom
  actions: OptimizationAction[];

  // Summary metrics
  totalEstimatedSavingsThisYear: number;
  totalEstimatedSavingsLongTerm: number;

  // Breakdowns from each strategy (full detail for Ben's UI)
  harvestResult: import("../tax/taxLossHarvesting").HarvestResult | null;
  rothResult: import("../tax/rothConversion").RothConversionResult | null;
  timingResult: import("../tax/capitalGainsTiming").GainsTimingResult | null;
  rebalanceResult: import("../tax/rebalancing").RebalanceResult | null;

  // Anything that was checked and is fine — reassures the user
  noActionNeeded: string[];

  // All legal notices consolidated
  legalNotices: string[];

  // Metadata
  strategiesRun: ActionCategory[];
  processingNotes: string[];        // internal notes about why something was skipped
}
