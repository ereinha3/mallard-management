/**
 * Tax-Aware Rebalancing Engine
 *
 * Legal basis: IRC §1001 (realization principle — tax triggered only on sale),
 *              IRC §1(h) (LTCG rates), standard portfolio rebalancing principles.
 *
 * Strategy: When a portfolio drifts from its target allocation, determine the
 * lowest-tax path to restore balance. Priority order:
 *   1. Use NEW CONTRIBUTIONS to buy underweight assets (zero tax cost)
 *   2. Redirect dividends/distributions to underweight assets (zero tax cost)
 *   3. In TAX-ADVANTAGED accounts, sell overweight and buy underweight freely
 *      (no capital gains tax inside 401k/IRA/HSA)
 *   4. In TAXABLE accounts, evaluate the tax cost of selling vs. staying misaligned:
 *      - If loss → harvest it (also covered by taxLossHarvesting module)
 *      - If short-term gain → strongly prefer to wait (high ordinary rate)
 *      - If long-term gain → calculate tax cost vs. tracking error cost
 *
 * KEY LEGAL CONSTRAINTS:
 *  1. No wash-sale concern for rebalancing WITHIN tax-advantaged accounts
 *     (no capital gains recognition inside IRA/401k/HSA).
 *  2. Sales in taxable accounts trigger capital gains/losses — always real.
 *  3. Moving assets BETWEEN accounts (e.g., sell in taxable, buy in IRA) is
 *     not a wash sale by itself, but selling at a loss in taxable and buying
 *     the same security in an IRA within 30 days IS a wash sale (Rev. Rul. 2008-5).
 *  4. In-kind transfers between taxable accounts do not trigger tax;
 *     liquidating and redepositing does.
 *
 * DISCLAIMER: This is informational analysis, not personalized tax or investment advice.
 */

import { z } from "zod";
import { FilingStatusSchema } from "./types";

// ── Input ──────────────────────────────────────────────────────────────────

const AccountTypeSchema = z.enum([
  "traditional_401k",
  "roth_401k",
  "traditional_ira",
  "roth_ira",
  "hsa",
  "taxable_brokerage",
]);
type AccountType = z.infer<typeof AccountTypeSchema>;

const TAXABLE_ACCOUNTS = new Set<AccountType>(["taxable_brokerage"]);
const TAX_ADVANTAGED_ACCOUNTS = new Set<AccountType>([
  "traditional_401k", "roth_401k", "traditional_ira", "roth_ira", "hsa",
]);

export const RebalanceHoldingSchema = z.object({
  ticker: z.string(),
  accountType: AccountTypeSchema,
  currentValue: z.number().nonnegative(),
  costBasis: z.number().nonnegative(),          // 0 for tax-advantaged (irrelevant inside)
  purchaseDate: z.string(),                      // ISO date — for holding period
});

export const RebalanceInputSchema = z.object({
  // Current holdings
  holdings: z.array(RebalanceHoldingSchema),

  // Target portfolio weights (tickers → 0–1 fractions, must sum to ~1.0)
  targetWeights: z.record(z.string(), z.number().min(0).max(1)),

  // Monthly new contributions by account (used in contribution-first rebalancing)
  monthlyNewContributions: z.record(z.string(), z.number().nonnegative()).default({}),

  // Tax context
  filingStatus: FilingStatusSchema,
  ltcgRate: z.number().min(0).max(0.238),       // federal + NIIT if applicable
  ordinaryMarginalRate: z.number().min(0).max(1),
  stateLtcgRate: z.number().min(0).max(0.20).default(0),

  // Acceptable drift threshold before action recommended (e.g., 0.05 = 5%)
  driftThreshold: z.number().min(0.01).max(0.25).default(0.05),

  asOfDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
});
export type RebalanceInput = z.infer<typeof RebalanceInputSchema>;

// ── Output ─────────────────────────────────────────────────────────────────

export interface DriftAnalysis {
  ticker: string;
  targetWeight: number;
  currentWeight: number;
  drift: number;                   // current − target (positive = overweight)
  driftDollars: number;
  isOutsideThreshold: boolean;
  action: "overweight" | "underweight" | "on_target";
}

export interface RebalanceTrade {
  step: number;
  action: "buy" | "sell" | "redirect_contributions";
  ticker: string;
  accountType: AccountType;
  amountDollars: number;
  taxCost: number;                 // $0 for tax-advantaged or buys
  taxType: "none" | "long_term_gain" | "short_term_gain" | "loss" | "not_applicable";
  isLongTerm: boolean | null;
  daysHeld: number | null;
  priority: number;                // 1 = no tax, 2 = tax-advantaged, 3 = taxable
  rationale: string;
  washSaleRisk: boolean;
}

export interface RebalanceResult {
  totalPortfolioValue: number;
  needsRebalancing: boolean;
  drift: DriftAnalysis[];

  // Ordered trades — execute in this order for lowest tax impact
  trades: RebalanceTrade[];

  // Summary by method
  contributionRebalancingAmount: number;    // done via new money (no tax)
  taxAdvantagedRebalancingAmount: number;   // done inside IRA/401k (no tax)
  taxableRebalancingAmount: number;         // requires selling in taxable (has tax cost)

  estimatedTotalTaxCost: number;
  estimatedTaxCostIfIgnoredDrift: number;  // cost of NOT rebalancing (tracking error est.)

  legalNotices: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

// ── Main function ──────────────────────────────────────────────────────────

export function analyzeRebalancing(input: RebalanceInput): RebalanceResult {
  // ── Step 1: Calculate current portfolio value and weights ─────────────
  const totalPortfolioValue = input.holdings.reduce((s, h) => s + h.currentValue, 0);
  if (totalPortfolioValue === 0) {
    return {
      totalPortfolioValue: 0,
      needsRebalancing: false,
      drift: [],
      trades: [],
      contributionRebalancingAmount: 0,
      taxAdvantagedRebalancingAmount: 0,
      taxableRebalancingAmount: 0,
      estimatedTotalTaxCost: 0,
      estimatedTaxCostIfIgnoredDrift: 0,
      legalNotices: [],
    };
  }

  // Aggregate by ticker across all accounts
  const currentByTicker: Record<string, number> = {};
  for (const h of input.holdings) {
    currentByTicker[h.ticker] = (currentByTicker[h.ticker] ?? 0) + h.currentValue;
  }

  // Build drift analysis
  const allTickers = new Set([
    ...Object.keys(input.targetWeights),
    ...Object.keys(currentByTicker),
  ]);

  const drift: DriftAnalysis[] = [];
  for (const ticker of allTickers) {
    const targetWeight = input.targetWeights[ticker] ?? 0;
    const currentValue = currentByTicker[ticker] ?? 0;
    const currentWeight = currentValue / totalPortfolioValue;
    const driftVal = currentWeight - targetWeight;

    drift.push({
      ticker,
      targetWeight,
      currentWeight,
      drift: driftVal,
      driftDollars: driftVal * totalPortfolioValue,
      isOutsideThreshold: Math.abs(driftVal) >= input.driftThreshold,
      action: Math.abs(driftVal) < 0.001 ? "on_target" : driftVal > 0 ? "overweight" : "underweight",
    });
  }

  const needsRebalancing = drift.some((d) => d.isOutsideThreshold);

  if (!needsRebalancing) {
    return {
      totalPortfolioValue,
      needsRebalancing: false,
      drift,
      trades: [],
      contributionRebalancingAmount: 0,
      taxAdvantagedRebalancingAmount: 0,
      taxableRebalancingAmount: 0,
      estimatedTotalTaxCost: 0,
      estimatedTaxCostIfIgnoredDrift: 0,
      legalNotices: ["Portfolio is within acceptable drift thresholds. No rebalancing action needed."],
    };
  }

  // ── Step 2: Build trade list (priority: no-tax methods first) ─────────
  const trades: RebalanceTrade[] = [];
  let stepCounter = 1;

  // Priority 1: Direct new contributions to underweight assets (zero tax)
  const totalMonthlyContributions = Object.values(input.monthlyNewContributions).reduce((s, v) => s + v, 0);
  const underweightAssets = drift.filter((d) => d.action === "underweight" && d.isOutsideThreshold);

  if (totalMonthlyContributions > 0 && underweightAssets.length > 0) {
    const totalShortfall = underweightAssets.reduce((s, d) => s + Math.abs(d.driftDollars), 0);
    for (const asset of underweightAssets) {
      const contributionShare = (Math.abs(asset.driftDollars) / totalShortfall) * totalMonthlyContributions;
      // Find best account for this ticker based on existing holdings
      const existingHolding = input.holdings.find((h) => h.ticker === asset.ticker);
      const targetAccount = existingHolding?.accountType ?? "taxable_brokerage";

      trades.push({
        step: stepCounter++,
        action: "redirect_contributions",
        ticker: asset.ticker,
        accountType: targetAccount,
        amountDollars: Math.round(contributionShare),
        taxCost: 0,
        taxType: "not_applicable",
        isLongTerm: null,
        daysHeld: null,
        priority: 1,
        rationale:
          `Direct $${Math.round(contributionShare).toLocaleString()}/month of new contributions to ` +
          `${asset.ticker} (${(asset.drift * -100).toFixed(1)}% underweight). Zero tax cost.`,
        washSaleRisk: false,
      });
    }
  }

  // Priority 2: Sell overweight / buy underweight inside tax-advantaged accounts (zero tax)
  const overweightAssets = drift.filter((d) => d.action === "overweight" && d.isOutsideThreshold);

  for (const over of overweightAssets) {
    // Find tax-advantaged holdings of this ticker
    const taxAdvHoldings = input.holdings.filter(
      (h) => h.ticker === over.ticker && TAX_ADVANTAGED_ACCOUNTS.has(h.accountType)
    );

    for (const holding of taxAdvHoldings) {
      const sellAmount = Math.min(holding.currentValue, over.driftDollars);
      if (sellAmount < 100) continue;

      trades.push({
        step: stepCounter++,
        action: "sell",
        ticker: over.ticker,
        accountType: holding.accountType,
        amountDollars: Math.round(sellAmount),
        taxCost: 0,                          // NO tax inside IRA/401k/HSA
        taxType: "none",
        isLongTerm: null,
        daysHeld: null,
        priority: 2,
        rationale:
          `Sell $${Math.round(sellAmount).toLocaleString()} of ${over.ticker} inside ` +
          `${holding.accountType} — no capital gains tax inside tax-advantaged accounts. ` +
          `${(over.drift * 100).toFixed(1)}% overweight.`,
        washSaleRisk: false,
      });

      // Pair with buy of most underweight asset
      if (underweightAssets.length > 0) {
        const buyTarget = underweightAssets[0];
        trades.push({
          step: stepCounter++,
          action: "buy",
          ticker: buyTarget.ticker,
          accountType: holding.accountType,
          amountDollars: Math.round(sellAmount),
          taxCost: 0,
          taxType: "none",
          isLongTerm: null,
          daysHeld: null,
          priority: 2,
          rationale:
            `Buy $${Math.round(sellAmount).toLocaleString()} of ${buyTarget.ticker} inside ` +
            `${holding.accountType} with proceeds. ` +
            `${(buyTarget.drift * -100).toFixed(1)}% underweight. Zero tax.`,
          washSaleRisk: false,
        });
      }
    }
  }

  // Priority 3: Taxable account sells — only if still overweight after above
  let estimatedTotalTaxCost = 0;

  for (const over of overweightAssets) {
    const taxableHoldings = input.holdings.filter(
      (h) => h.ticker === over.ticker && TAXABLE_ACCOUNTS.has(h.accountType)
    );

    for (const holding of taxableHoldings) {
      const gainPerDollar = holding.costBasis > 0
        ? (holding.currentValue - holding.costBasis) / holding.currentValue
        : 0;
      const unrealizedGainPerDollar = gainPerDollar;
      const daysHeld = daysBetween(holding.purchaseDate, input.asOfDate);
      const isLongTerm = daysHeld > 365;
      const sellAmount = Math.min(holding.currentValue, over.driftDollars);

      const gain = sellAmount * unrealizedGainPerDollar;
      const isLoss = gain < 0;

      let taxCost = 0;
      let taxType: RebalanceTrade["taxType"] = "none";

      if (isLoss) {
        taxCost = 0;               // loss = tax benefit, not cost
        taxType = "loss";
      } else if (isLongTerm) {
        taxCost = gain * (input.ltcgRate + input.stateLtcgRate);
        taxType = "long_term_gain";
      } else {
        taxCost = gain * (input.ordinaryMarginalRate + input.stateLtcgRate);
        taxType = "short_term_gain";
      }

      estimatedTotalTaxCost += Math.max(0, taxCost);

      // Wash-sale risk: if this is a loss and user might rebuy within 30 days
      const washSaleRisk = isLoss && !isLongTerm;

      const rationale = isLoss
        ? `Sell $${Math.round(sellAmount).toLocaleString()} of ${over.ticker} in taxable — ` +
          `LOSS position, harvests a loss. Wait 30+ days before rebuying or use a replacement ETF.`
        : isLongTerm
        ? `Sell $${Math.round(sellAmount).toLocaleString()} of ${over.ticker} in taxable — ` +
          `long-term gain, est. tax cost $${Math.round(taxCost).toLocaleString()} ` +
          `(${(input.ltcgRate * 100).toFixed(0)}% LTCG + ${(input.stateLtcgRate * 100).toFixed(1)}% state).`
        : `⚠ SHORT-TERM GAIN: Selling $${Math.round(sellAmount).toLocaleString()} of ${over.ticker} ` +
          `(held ${daysHeld} days) triggers ordinary income tax. ` +
          `Wait ${366 - daysHeld} more days for long-term treatment to save ` +
          `~$${Math.round(gain * (input.ordinaryMarginalRate - input.ltcgRate)).toLocaleString()}.`;

      trades.push({
        step: stepCounter++,
        action: "sell",
        ticker: over.ticker,
        accountType: holding.accountType,
        amountDollars: Math.round(sellAmount),
        taxCost: Math.round(Math.max(0, taxCost)),
        taxType,
        isLongTerm,
        daysHeld,
        priority: taxType === "short_term_gain" ? 4 : 3,
        rationale,
        washSaleRisk,
      });
    }
  }

  // Sort trades by priority then step
  trades.sort((a, b) => a.priority - b.priority || a.step - b.step);
  trades.forEach((t, i) => { t.step = i + 1; });

  // Summarize by method
  const contributionRebalancingAmount = trades
    .filter((t) => t.action === "redirect_contributions")
    .reduce((s, t) => s + t.amountDollars, 0);
  const taxAdvantagedRebalancingAmount = trades
    .filter((t) => t.priority === 2)
    .reduce((s, t) => s + t.amountDollars, 0);
  const taxableRebalancingAmount = trades
    .filter((t) => t.priority >= 3 && t.action === "sell")
    .reduce((s, t) => s + t.amountDollars, 0);

  // Rough cost of ignoring drift: tracking error of ~0.5%/yr per 10% drift
  const maxDrift = Math.max(...drift.map((d) => Math.abs(d.drift)));
  const estimatedTaxCostIfIgnoredDrift = maxDrift * totalPortfolioValue * 0.005;

  const legalNotices = [
    "Selling inside traditional 401k, Roth 401k, IRA, or HSA has NO capital gains tax consequences. Rebalance freely within these accounts.",
    "Selling in a taxable brokerage account triggers capital gains or losses. Short-term gains (held ≤1 year) are taxed as ordinary income — up to 37% federal.",
    "Wash-sale rule (IRC §1091): If selling at a loss, do not repurchase the same or substantially identical security within 30 days in ANY account, including IRAs (Rev. Rul. 2008-5).",
    "Contribution-first rebalancing (directing new money to underweight assets) has zero tax cost and should always be exhausted before selling existing positions.",
    "This analysis is informational only and does not constitute personalized tax or investment advice. Consult a CPA or financial advisor before executing trades.",
  ];

  return {
    totalPortfolioValue: Math.round(totalPortfolioValue),
    needsRebalancing,
    drift,
    trades,
    contributionRebalancingAmount,
    taxAdvantagedRebalancingAmount,
    taxableRebalancingAmount,
    estimatedTotalTaxCost: Math.round(estimatedTotalTaxCost),
    estimatedTaxCostIfIgnoredDrift: Math.round(estimatedTaxCostIfIgnoredDrift),
    legalNotices,
  };
}
