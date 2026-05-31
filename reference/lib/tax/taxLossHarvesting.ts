/**
 * Tax-Loss Harvesting Engine
 *
 * Legal basis: IRC §1211–§1212 (capital loss deduction), IRC §1091 (wash-sale rule)
 *
 * Strategy: Realize losses in taxable accounts to offset capital gains and up to
 * $3,000 of ordinary income per year. Losses carry forward indefinitely.
 *
 * KEY LEGAL CONSTRAINTS ENFORCED HERE:
 *  1. Wash-sale rule (IRC §1091): Cannot buy a "substantially identical" security
 *     within 30 days BEFORE or AFTER the loss sale. Disallowed loss is added to
 *     the replacement security's cost basis (it's not lost, just deferred).
 *  2. Short-term losses (held <1 year) offset short-term gains first, then long-term.
 *     Long-term losses offset long-term gains first, then short-term.
 *     (IRS Publication 550, Netting Rules)
 *  3. Max ordinary income deduction: $3,000/year ($1,500 MFS). Excess carries forward.
 *  4. Loss from a taxable account sale + purchase of same/substantially identical
 *     security in an IRA within the window = wash sale (Rev. Rul. 2008-5).
 *
 * DISCLAIMER: This is informational tax planning analysis, not personalized tax advice.
 * Users should consult a CPA or tax advisor before executing any tax strategy.
 */

import { z } from "zod";
import { FilingStatus, FilingStatusSchema } from "./types";

// ── Constants ──────────────────────────────────────────────────────────────

const WASH_SALE_WINDOW_DAYS = 30;          // 30 days before AND after sale
const MAX_ORDINARY_INCOME_DEDUCTION = 3_000; // IRC §1211(b)
const MAX_ORDINARY_INCOME_DEDUCTION_MFS = 1_500;

// ── Suggested wash-sale-safe replacement ETFs ─────────────────────────────
// These are not "substantially identical" to the originals — different fund family
// or sufficiently different index methodology. Gray areas are flagged with a note.
// Source: general tax planning practice; IRS has not issued a comprehensive list.
// NOTE: "Substantially identical" is a facts-and-circumstances test. Similar ETFs
// tracking the same index from different providers are generally (not guaranteed)
// considered non-identical by practitioners. Advise user to confirm with CPA.

export const WASH_SALE_REPLACEMENTS: Record<string, { ticker: string; name: string; note?: string }[]> = {
  VTI:  [{ ticker: "SCHB", name: "Schwab U.S. Broad Market ETF" },
         { ticker: "ITOT", name: "iShares Core S&P Total U.S. Stock Market ETF" }],
  VOO:  [{ ticker: "IVV",  name: "iShares Core S&P 500 ETF" },
         { ticker: "SPLG", name: "SPDR Portfolio S&P 500 ETF" }],
  SPY:  [{ ticker: "IVV",  name: "iShares Core S&P 500 ETF" },
         { ticker: "VOO",  name: "Vanguard S&P 500 ETF" }],
  QQQ:  [{ ticker: "QQQM", name: "Invesco NASDAQ 100 ETF", note: "Same index — gray area; confirm with CPA" },
         { ticker: "ONEQ", name: "Fidelity NASDAQ Composite Index ETF" }],
  VXUS: [{ ticker: "IXUS", name: "iShares Core MSCI Total International Stock ETF" },
         { ticker: "SCHI", name: "Schwab International Equity ETF" }],
  BND:  [{ ticker: "AGG",  name: "iShares Core U.S. Aggregate Bond ETF" },
         { ticker: "SCHZ", name: "Schwab U.S. Aggregate Bond ETF" }],
  VNQ:  [{ ticker: "SCHH", name: "Schwab U.S. REIT ETF" },
         { ticker: "IYR",  name: "iShares U.S. Real Estate ETF" }],
  SGOV: [{ ticker: "BIL",  name: "SPDR Bloomberg 1-3 Month T-Bill ETF" },
         { ticker: "GBIL", name: "Goldman Sachs Access Treasury 0-1 Year ETF" }],
  VUG:  [{ ticker: "SCHG", name: "Schwab U.S. Large-Cap Growth ETF" },
         { ticker: "IVW",  name: "iShares S&P 500 Growth ETF" }],
  VWO:  [{ ticker: "IEMG", name: "iShares Core MSCI Emerging Markets ETF" },
         { ticker: "SCHE", name: "Schwab Emerging Markets Equity ETF" }],
};

// ── Input / Output types ───────────────────────────────────────────────────

export const HoldingSchema = z.object({
  ticker: z.string(),
  name: z.string().default(""),
  shares: z.number().positive(),
  costBasisPerShare: z.number().nonnegative(),  // average cost basis per share
  currentPricePerShare: z.number().nonnegative(),
  purchaseDate: z.string(),                      // ISO date "YYYY-MM-DD"
  accountType: z.literal("taxable"),             // harvesting only applies to taxable accounts
});
export type Holding = z.infer<typeof HoldingSchema>;

export const HarvestInputSchema = z.object({
  holdings: z.array(HoldingSchema),
  filingStatus: FilingStatusSchema,
  // Gains already realized this year (affects netting order)
  realizedShortTermGainsYTD: z.number().default(0),
  realizedLongTermGainsYTD: z.number().default(0),
  // Carry-forward losses from prior years
  shortTermLossCarryforward: z.number().nonnegative().default(0),
  longTermLossCarryforward: z.number().nonnegative().default(0),
  // Tax rates (from tax calculator output)
  ordinaryMarginalRate: z.number().min(0).max(1),
  ltcgRate: z.number().min(0).max(1),
  // Estimated transaction cost per trade (brokerage commission + bid-ask)
  estimatedTradeCostDollars: z.number().nonnegative().default(0),
  // Today's date for wash-sale window and holding period calculation
  asOfDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
});
export type HarvestInput = z.infer<typeof HarvestInputSchema>;

export interface HarvestCandidate {
  ticker: string;
  name: string;
  shares: number;
  costBasis: number;
  currentValue: number;
  unrealizedLoss: number;           // always negative
  isLongTerm: boolean;              // held > 1 year
  holdingDays: number;
  estimatedTaxSavings: number;      // dollars saved at user's rate
  netBenefit: number;               // tax savings minus trade cost
  worthHarvesting: boolean;         // net benefit positive
  replacements: { ticker: string; name: string; note?: string }[];
  washSaleWarning: string | null;
}

export interface HarvestResult {
  // Candidates to harvest (sorted by net benefit descending)
  candidates: HarvestCandidate[];

  // Post-harvest projection
  totalHarvestableLoss: number;
  shortTermLossesAvailable: number;
  longTermLossesAvailable: number;

  // How the losses net against gains (IRS netting rules)
  netShortTermPosition: number;     // negative = net loss
  netLongTermPosition: number;
  ordinaryIncomeOffset: number;     // up to $3k reduces ordinary income
  lossCarryforward: number;         // excess carried to next year

  // Dollar impact
  estimatedTaxSavingsThisYear: number;
  estimatedTaxSavingsFromCarryforward: number;

  // Legal notices — always show these to the user
  legalNotices: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

function isLongTerm(purchaseDate: string, asOfDate: string): boolean {
  // Long-term = held MORE than 1 year (366+ days)
  // IRC §1222 — "more than 1 year"
  return daysBetween(purchaseDate, asOfDate) > 365;
}

// ── Main function ──────────────────────────────────────────────────────────

export function analyzeHarvestOpportunities(input: HarvestInput): HarvestResult {
  const maxOrdinaryOffset =
    input.filingStatus === "married_filing_separately"
      ? MAX_ORDINARY_INCOME_DEDUCTION_MFS
      : MAX_ORDINARY_INCOME_DEDUCTION;

  const candidates: HarvestCandidate[] = [];

  for (const h of input.holdings) {
    const costBasis = h.shares * h.costBasisPerShare;
    const currentValue = h.shares * h.currentPricePerShare;
    const unrealizedLoss = currentValue - costBasis;

    // Only harvest losses
    if (unrealizedLoss >= 0) continue;

    const longTerm = isLongTerm(h.purchaseDate, input.asOfDate);
    const holdingDays = daysBetween(h.purchaseDate, input.asOfDate);

    // Tax savings: long-term losses save at LTCG rate (when offsetting LT gains)
    // but if they offset ordinary income, they save at ordinary rate.
    // Conservative estimate: use LTCG rate for LT losses, ordinary rate for ST.
    const savingsRate = longTerm ? input.ltcgRate : input.ordinaryMarginalRate;
    const lossAbs = Math.abs(unrealizedLoss);
    const estimatedTaxSavings = lossAbs * savingsRate;
    const netBenefit = estimatedTaxSavings - input.estimatedTradeCostDollars * 2; // sell + buy replacement

    // Wash-sale warning: flag if holding period is very new (recently purchased,
    // user might have bought same security <30 days ago elsewhere)
    let washSaleWarning: string | null = null;
    if (holdingDays <= WASH_SALE_WINDOW_DAYS) {
      washSaleWarning =
        `Purchased ${holdingDays} days ago. If you bought this or a substantially identical ` +
        `security within 30 days before today, selling now would trigger the wash-sale rule (IRC §1091) ` +
        `and disallow this loss.`;
    }

    const replacements = WASH_SALE_REPLACEMENTS[h.ticker] ?? [];

    candidates.push({
      ticker: h.ticker,
      name: h.name,
      shares: h.shares,
      costBasis,
      currentValue,
      unrealizedLoss,
      isLongTerm: longTerm,
      holdingDays,
      estimatedTaxSavings,
      netBenefit,
      worthHarvesting: netBenefit > 0,
      replacements,
      washSaleWarning,
    });
  }

  // Sort by net benefit (highest savings first)
  candidates.sort((a, b) => b.netBenefit - a.netBenefit);

  // Separate ST and LT losses
  const stLosses = candidates
    .filter((c) => !c.isLongTerm && c.worthHarvesting)
    .reduce((s, c) => s + Math.abs(c.unrealizedLoss), 0);
  const ltLosses = candidates
    .filter((c) => c.isLongTerm && c.worthHarvesting)
    .reduce((s, c) => s + Math.abs(c.unrealizedLoss), 0);

  const totalHarvestableLoss = stLosses + ltLosses;

  // ── IRS netting rules (IRS Pub 550) ───────────────────────────────────
  // Step 1: Add carryforwards
  let netST = input.realizedShortTermGainsYTD - stLosses - input.shortTermLossCarryforward;
  let netLT = input.realizedLongTermGainsYTD - ltLosses - input.longTermLossCarryforward;

  // Step 2: Cross-net (loss in one category offsets gain in the other)
  let netShortTermPosition = netST;
  let netLongTermPosition = netLT;
  if (netST < 0 && netLT > 0) {
    const cross = Math.min(Math.abs(netST), netLT);
    netShortTermPosition = netST + cross;
    netLongTermPosition = netLT - cross;
  } else if (netLT < 0 && netST > 0) {
    const cross = Math.min(Math.abs(netLT), netST);
    netLongTermPosition = netLT + cross;
    netShortTermPosition = netST - cross;
  }

  // Step 3: Net loss offsets up to $3k ordinary income
  const combinedNetLoss = Math.min(0, netShortTermPosition) + Math.min(0, netLongTermPosition);
  const ordinaryIncomeOffset = Math.min(maxOrdinaryOffset, Math.abs(Math.min(0, combinedNetLoss)));

  // Step 4: Remainder carries forward
  const lossCarryforward = Math.max(0, Math.abs(Math.min(0, combinedNetLoss)) - ordinaryIncomeOffset);

  // Savings estimate
  const estimatedTaxSavingsThisYear =
    candidates
      .filter((c) => c.worthHarvesting)
      .reduce((s, c) => s + c.estimatedTaxSavings, 0) +
    ordinaryIncomeOffset * input.ordinaryMarginalRate;

  const estimatedTaxSavingsFromCarryforward = lossCarryforward * input.ltcgRate;

  const legalNotices = [
    "Wash-sale rule (IRC §1091): Do NOT repurchase the same or a substantially identical security within 30 days before or after the sale date, in any account including IRAs (Rev. Rul. 2008-5). Violation disallows the loss.",
    `Maximum ordinary income offset: $${maxOrdinaryOffset.toLocaleString()}/year. Excess losses carry forward indefinitely (IRC §1212).`,
    "Short-term losses (held ≤1 year) offset short-term gains first; long-term losses offset long-term gains first. Remaining net losses cross-offset the other category (IRS Pub. 550).",
    "Replacement ETF suggestions are based on common practitioner guidance. 'Substantially identical' is a facts-and-circumstances test — confirm choices with a CPA before executing.",
    "This analysis is informational only and does not constitute personalized tax advice. Consult a licensed CPA or tax advisor before executing any harvesting strategy.",
  ];

  return {
    candidates,
    totalHarvestableLoss,
    shortTermLossesAvailable: stLosses,
    longTermLossesAvailable: ltLosses,
    netShortTermPosition,
    netLongTermPosition,
    ordinaryIncomeOffset,
    lossCarryforward,
    estimatedTaxSavingsThisYear,
    estimatedTaxSavingsFromCarryforward,
    legalNotices,
  };
}
