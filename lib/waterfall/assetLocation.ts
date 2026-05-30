/**
 * Asset Location Engine
 *
 * Takes portfolio weights from the optimizer (what to buy)
 * and account buckets from the waterfall (where money lives)
 * and outputs exactly what gets purchased in each account.
 *
 * Core rule: match the tax characteristic of each asset
 * to the tax treatment of each account to minimize annual tax drag.
 */

import { z } from "zod";
import { AccountType, WaterfallBucket } from "./types";

// ── Asset classes the optimizer can output ─────────────────────────────────

export const AssetClassSchema = z.enum([
  "us_equity_broad",        // VTI, SPY — low turnover, qualified dividends
  "us_equity_growth",       // QQQ, VUG — high appreciation, low dividends
  "us_equity_value",        // VTV — moderate dividends, qualified
  "international_developed", // VXUS, EFA — foreign tax credit eligible
  "international_emerging",  // VWO — foreign tax credit eligible
  "us_bonds",               // BND, AGG — interest = ordinary income
  "international_bonds",    // BNDX — interest = ordinary income
  "tips",                   // VTIP — inflation-protected bonds
  "high_yield_bonds",       // HYG, JNK — high ordinary income
  "reits",                  // VNQ — non-qualified dividends
  "commodities",            // PDBC — complex tax, K-1 issues
  "cash_equivalents",       // SGOV, USFR — ordinary income
]);
export type AssetClass = z.infer<typeof AssetClassSchema>;

export const PortfolioWeightsSchema = z.record(z.string(), z.number().min(0).max(1));
export type PortfolioWeights = z.infer<typeof PortfolioWeightsSchema>;

// ── Tax efficiency scoring ─────────────────────────────────────────────────
// Score 1 (most tax-inefficient) → 10 (most tax-efficient)
// Low score = must go in tax-advantaged
// High score = fine in taxable brokerage

const TAX_EFFICIENCY: Record<AssetClass, number> = {
  us_bonds:              1,  // interest taxed as ordinary income every year
  high_yield_bonds:      1,  // same, plus higher yield = more taxable income
  tips:                  2,  // phantom income (taxed on inflation adjustment)
  international_bonds:   2,  // ordinary income, no foreign tax credit benefit
  reits:                 3,  // non-qualified dividends = ordinary income rates
  cash_equivalents:      3,  // interest = ordinary income
  commodities:           4,  // complex — K-1, 60/40 rule, unpredictable
  us_equity_value:       6,  // moderate qualified dividends
  us_equity_broad:       8,  // low turnover, mostly qualified dividends
  us_equity_growth:      8,  // minimal dividends, mostly unrealized gains
  international_developed: 9, // foreign tax credit — MUST be in taxable to claim it
  international_emerging:  9, // same — credit wasted inside tax-advantaged
};

// Preferred account for each asset class (ideal world, before capacity constraints)
const PREFERRED_ACCOUNT: Record<AssetClass, AccountType[]> = {
  // Bonds → traditional tax-deferred (ordinary income sheltered)
  us_bonds:              ["traditional_401k_match", "traditional_401k_beyond", "traditional_ira"],
  high_yield_bonds:      ["traditional_401k_match", "traditional_401k_beyond", "traditional_ira"],
  tips:                  ["traditional_401k_match", "traditional_401k_beyond", "traditional_ira"],
  international_bonds:   ["traditional_401k_match", "traditional_401k_beyond", "traditional_ira"],

  // REITs → any tax-advantaged (non-qualified dividends)
  reits:                 ["traditional_401k_match", "traditional_401k_beyond", "roth_ira", "traditional_ira"],
  cash_equivalents:      ["traditional_401k_match", "traditional_401k_beyond", "traditional_ira"],
  commodities:           ["traditional_401k_beyond", "traditional_ira", "roth_ira"],

  // Value → Roth or traditional (moderate dividends)
  us_equity_value:       ["roth_ira", "backdoor_roth_ira", "hsa"],

  // Growth equities → Roth (highest appreciation = best use of tax-free growth)
  us_equity_broad:       ["roth_ira", "backdoor_roth_ira", "hsa", "taxable_brokerage"],
  us_equity_growth:      ["roth_ira", "backdoor_roth_ira", "hsa"],

  // International → taxable ONLY (foreign tax credit unusable inside tax-advantaged)
  international_developed: ["taxable_brokerage"],
  international_emerging:  ["taxable_brokerage"],
};

// ── Output types ───────────────────────────────────────────────────────────

export interface AccountHolding {
  assetClass: AssetClass;
  ticker: string;           // suggested ETF ticker
  allocationWithinAccount: number;  // % of this account's total
  monthlyDollarAmount: number;
  annualDollarAmount: number;
  taxRationale: string;
}

export interface AccountAllocation {
  accountType: AccountType;
  label: string;
  totalMonthly: number;
  holdings: AccountHolding[];
}

export interface AssetLocationResult {
  accounts: AccountAllocation[];
  // Per-asset summary: where each asset class ended up and why
  assetSummary: AssetLocationSummary[];
  // Warnings about suboptimal placement (e.g., bonds forced into taxable)
  warnings: string[];
  // What Ethan/Kimball's execution layer receives: flat buy list
  executionList: ExecutionItem[];
}

export interface AssetLocationSummary {
  assetClass: AssetClass;
  ticker: string;
  totalMonthly: number;
  placedIn: AccountType[];
  isOptimalPlacement: boolean;
  note: string;
}

export interface ExecutionItem {
  accountType: AccountType;
  ticker: string;
  assetClass: AssetClass;
  monthlyAmount: number;
  weight: number;           // fraction of total portfolio
}

// ── Suggested ETF tickers ──────────────────────────────────────────────────

const SUGGESTED_TICKER: Record<AssetClass, string> = {
  us_equity_broad:         "VTI",
  us_equity_growth:        "VUG",
  us_equity_value:         "VTV",
  international_developed: "VXUS",
  international_emerging:  "VWO",
  us_bonds:                "BND",
  international_bonds:     "BNDX",
  tips:                    "VTIP",
  high_yield_bonds:        "VWEHX",
  reits:                   "VNQ",
  commodities:             "PDBC",
  cash_equivalents:        "SGOV",
};

const TAX_RATIONALE: Record<AssetClass, string> = {
  us_bonds:              "Bond interest is taxed as ordinary income annually — sheltered here, you pay no tax until withdrawal",
  high_yield_bonds:      "High-yield bonds generate substantial ordinary income — must be sheltered to avoid annual tax drag",
  tips:                  "TIPS have phantom income (taxed on inflation adjustments even without cash distribution) — shelter this",
  international_bonds:   "Ordinary income, no foreign tax credit benefit, belongs in tax-deferred",
  reits:                 "REIT dividends are non-qualified and taxed at ordinary income rates — sheltered here",
  cash_equivalents:      "Interest income taxed as ordinary income — sheltered where possible",
  commodities:           "Complex tax treatment (K-1, 60/40 rules) — simpler inside a tax-advantaged wrapper",
  us_equity_value:       "Moderate qualified dividends — tax-free or tax-deferred growth maximizes compounding",
  us_equity_broad:       "Low turnover, qualified dividends — tax-efficient but Roth growth is still better long-term",
  us_equity_growth:      "Highest expected appreciation goes in Roth — the tax-free compounding is most valuable on the biggest gains",
  international_developed: "Foreign tax credit (worth ~0.5%/yr) is only claimable in a taxable account — placing here captures that credit",
  international_emerging:  "Same as international developed — foreign tax credit requires taxable account placement",
};

// ── Main function ──────────────────────────────────────────────────────────

export function locateAssets(
  weights: PortfolioWeights,
  buckets: WaterfallBucket[]
): AssetLocationResult {
  const warnings: string[] = [];
  const accountAllocations: Map<AccountType, AccountHolding[]> = new Map();
  const assetSummary: AssetLocationSummary[] = [];
  const executionItems: ExecutionItem[] = [];

  // Total monthly investment across all buckets
  const totalMonthly = buckets.reduce((s, b) => s + b.monthlyAmount, 0);

  // Available capacity per account (monthly dollars)
  const accountCapacity = new Map<AccountType, number>(
    buckets.map((b) => [b.accountType, b.monthlyAmount])
  );

  // Sort assets: most tax-inefficient first (they get priority for tax-advantaged space)
  const sortedAssets = (Object.entries(weights) as [AssetClass, number][])
    .filter(([, w]) => w > 0)
    .sort(([a], [b]) => TAX_EFFICIENCY[a] - TAX_EFFICIENCY[b]);

  for (const [assetClass, weight] of sortedAssets) {
    const monthlyForAsset = totalMonthly * weight;
    const ticker = SUGGESTED_TICKER[assetClass];
    const preferred = PREFERRED_ACCOUNT[assetClass];
    let remaining = monthlyForAsset;
    const placedIn: AccountType[] = [];
    let isOptimal = true;

    // Try to place in preferred accounts first, then fall through
    const placementOrder = [
      ...preferred,
      // Fallback: any remaining tax-advantaged space
      "traditional_401k_match" as AccountType,
      "traditional_401k_beyond" as AccountType,
      "traditional_ira" as AccountType,
      "roth_ira" as AccountType,
      "backdoor_roth_ira" as AccountType,
      "hsa" as AccountType,
      // Last resort: taxable
      "taxable_brokerage" as AccountType,
    ].filter((v, i, a) => a.indexOf(v) === i); // dedupe while preserving order

    for (const accountType of placementOrder) {
      if (remaining <= 0.01) break;

      const capacity = accountCapacity.get(accountType) ?? 0;
      if (capacity <= 0) continue;

      const allocated = Math.min(remaining, capacity);
      accountCapacity.set(accountType, capacity - allocated);
      remaining -= allocated;

      if (!placedIn.includes(accountType)) placedIn.push(accountType);

      // Check if this is suboptimal placement
      if (!preferred.includes(accountType)) {
        isOptimal = false;
        if (accountType === "taxable_brokerage" && TAX_EFFICIENCY[assetClass] <= 3) {
          warnings.push(
            `${ticker} (${assetClass}) placed in taxable brokerage due to capacity constraints — ` +
            `this generates ordinary income that will be taxed annually. Consider increasing tax-advantaged contributions.`
          );
        }
      }

      // Add to account holdings
      if (!accountAllocations.has(accountType)) accountAllocations.set(accountType, []);
      const existing = accountAllocations.get(accountType)!.find((h) => h.assetClass === assetClass);
      if (existing) {
        existing.monthlyDollarAmount += allocated;
        existing.annualDollarAmount += allocated * 12;
      } else {
        accountAllocations.get(accountType)!.push({
          assetClass,
          ticker,
          allocationWithinAccount: 0, // calculated after all assets placed
          monthlyDollarAmount: allocated,
          annualDollarAmount: allocated * 12,
          taxRationale: TAX_RATIONALE[assetClass],
        });

        executionItems.push({
          accountType,
          ticker,
          assetClass,
          monthlyAmount: allocated,
          weight,
        });
      }
    }

    if (remaining > 0.01) {
      warnings.push(`Could not fully place ${ticker} — ${remaining.toFixed(2)} unallocated (not enough account capacity)`);
    }

    assetSummary.push({
      assetClass,
      ticker,
      totalMonthly: monthlyForAsset,
      placedIn,
      isOptimalPlacement: isOptimal,
      note: TAX_RATIONALE[assetClass],
    });
  }

  // Calculate within-account weights
  const accounts: AccountAllocation[] = [];
  for (const bucket of buckets) {
    const holdings = accountAllocations.get(bucket.accountType) ?? [];
    const accountTotal = holdings.reduce((s, h) => s + h.monthlyDollarAmount, 0);
    holdings.forEach((h) => {
      h.allocationWithinAccount = accountTotal > 0 ? h.monthlyDollarAmount / accountTotal : 0;
    });
    if (holdings.length > 0) {
      accounts.push({
        accountType: bucket.accountType,
        label: bucket.label,
        totalMonthly: bucket.monthlyAmount,
        holdings,
      });
    }
  }

  return { accounts, assetSummary, warnings, executionList: executionItems };
}
