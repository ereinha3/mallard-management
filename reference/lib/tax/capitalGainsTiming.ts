/**
 * Capital Gains Timing Engine
 *
 * Legal basis: IRC §1(h) — Maximum capital gains tax rates.
 *              IRC §1222 — Holding period definitions.
 *
 * Strategy: Help users time the realization of capital gains to minimize tax
 * by staying within favorable LTCG rate brackets, harvesting gains when the
 * rate is 0%, and avoiding inadvertent bracket crossings.
 *
 * KEY LEGAL CONSTRAINTS ENFORCED HERE:
 *  1. Long-term treatment requires holding MORE than one year (IRC §1222(3)).
 *     Day of purchase does not count; day of sale does.
 *  2. LTCG brackets are based on TOTAL TAXABLE INCOME including the gains
 *     (gains are "stacked on top" of ordinary income for bracket determination).
 *  3. 0% LTCG rate applies to gains up to the 15% bracket threshold.
 *     This is a legal, IRS-recognized tax planning opportunity often called
 *     "gain harvesting" — there is no "wash-sale" rule for gains.
 *  4. NIIT (3.8%) applies to net investment income above $200k/$250k MAGI
 *     regardless of LTCG rate (IRC §1411).
 *  5. Depreciation recapture (§1250): Real estate gains attributable to
 *     depreciation are taxed at max 25%, not LTCG rates. Flagged but not
 *     calculated here (requires property-specific data).
 *  6. State capital gains: Most states tax capital gains as ordinary income.
 *     We surface this but users need their state rate from the tax calculator.
 *
 * DISCLAIMER: This is informational tax planning analysis, not personalized tax advice.
 */

import { z } from "zod";
import { FilingStatus, FilingStatusSchema } from "./types";
import { LTCG_BRACKETS, NIIT_RATE, NIIT_THRESHOLD } from "./constants";

// ── Input ──────────────────────────────────────────────────────────────────

export const CapitalGainsTimingInputSchema = z.object({
  // Ordinary taxable income this year (AFTER deductions, BEFORE gains)
  ordinaryTaxableIncome: z.number().nonnegative(),
  filingStatus: FilingStatusSchema,

  // Gains already realized this year
  realizedLtcgYtd: z.number().default(0),
  realizedStcgYtd: z.number().default(0),

  // Positions the user is CONSIDERING selling (unrealized gains)
  positions: z.array(z.object({
    id: z.string(),
    ticker: z.string(),
    name: z.string().default(""),
    shares: z.number().positive(),
    costBasisPerShare: z.number().nonnegative(),
    currentPricePerShare: z.number().nonnegative(),
    purchaseDate: z.string(),       // ISO "YYYY-MM-DD"
    isRealEstate: z.boolean().default(false),
    depreciationTaken: z.number().nonnegative().default(0),  // §1250 recapture amount
  })),

  // State capital gains rate (pass from tax calculator — most states = ordinary rate)
  stateLtcgRate: z.number().min(0).max(0.20).default(0),

  asOfDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
});
export type CapitalGainsTimingInput = z.infer<typeof CapitalGainsTimingInputSchema>;

export interface PositionAnalysis {
  id: string;
  ticker: string;
  name: string;
  shares: number;
  costBasis: number;
  currentValue: number;
  unrealizedGain: number;
  isLongTerm: boolean;
  holdingDays: number;
  daysUntilLongTerm: number | null;  // null if already long-term

  // If sold TODAY
  federalLtcgRate: number;           // 0, 0.15, or 0.20
  niitApplies: boolean;
  effectiveFederalRate: number;      // ltcgRate + niitRate if applicable
  totalFederalTax: number;
  totalStateTax: number;
  totalTaxIfSoldNow: number;

  // Timing recommendation
  recommendation: "sell_now_0pct" | "wait_for_long_term" | "wait_for_lower_income_year" | "sell_now_acceptable" | "caution_high_rate";
  recommendationDetail: string;

  // Bracket impact
  wouldCrossBracketBoundary: boolean;
  gainThatCrossesBoundary: number;   // dollars crossing into higher rate
  bracketWarning: string | null;

  // §1250 depreciation recapture (real estate only)
  depreciationRecaptureWarning: string | null;
}

export interface GainsTimingResult {
  // Current bracket position
  currentLtcgRate: number;
  roomUntilNextLtcgBracket: number;    // dollars of additional LTCG before rate increases
  nextLtcgRate: number;

  // 0% opportunity
  zeroRateOpportunity: boolean;
  zeroRateRoomRemaining: number;       // how many more dollars of gains at 0%
  zeroRateExplanation: string;

  // Per-position analysis
  positions: PositionAnalysis[];

  // Year-end projection
  projectedTotalLtcg: number;         // YTD + all candidate positions
  projectedLtcgRate: number;          // rate on last dollar of gain

  // Optimal sell order (sort by tax efficiency)
  suggestedSellOrder: string[];       // position ids in recommended order

  legalNotices: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function getLtcgRate(totalTaxableIncome: number, filingStatus: FilingStatus): number {
  const brackets = LTCG_BRACKETS[filingStatus];
  let rate = 0;
  for (const b of brackets) {
    if (totalTaxableIncome >= b.min) rate = b.rate;
    else break;
  }
  return rate;
}

function getNextLtcgBracket(totalTaxableIncome: number, filingStatus: FilingStatus): {
  nextRate: number;
  room: number;
} {
  const brackets = LTCG_BRACKETS[filingStatus];
  for (let i = 0; i < brackets.length - 1; i++) {
    if (totalTaxableIncome >= brackets[i].min && totalTaxableIncome < brackets[i + 1].min) {
      return { nextRate: brackets[i + 1].rate, room: brackets[i + 1].min - totalTaxableIncome };
    }
  }
  return { nextRate: brackets[brackets.length - 1].rate, room: Infinity };
}

// ── Main function ──────────────────────────────────────────────────────────

export function analyzeCapitalGainsTiming(input: CapitalGainsTimingInput): GainsTimingResult {
  const niitThreshold = NIIT_THRESHOLD[input.filingStatus];

  // Current income base: ordinary income + gains already realized
  const currentIncomeBase = input.ordinaryTaxableIncome + input.realizedLtcgYtd + input.realizedStcgYtd;
  const currentLtcgRate = getLtcgRate(currentIncomeBase, input.filingStatus);
  const { nextRate: nextLtcgRate, room: roomUntilNext } = getNextLtcgBracket(currentIncomeBase, input.filingStatus);

  // 0% rate opportunity
  const zeroRateBracketEnd = LTCG_BRACKETS[input.filingStatus].find((b) => b.rate === 0.15)?.min ?? 0;
  const zeroRateRoomRemaining = Math.max(0, zeroRateBracketEnd - currentIncomeBase);
  const zeroRateOpportunity = currentLtcgRate === 0 && zeroRateRoomRemaining > 0;

  // Analyze each position
  const positions: PositionAnalysis[] = input.positions.map((pos) => {
    const costBasis = pos.shares * pos.costBasisPerShare;
    const currentValue = pos.shares * pos.currentPricePerShare;
    const unrealizedGain = currentValue - costBasis;

    const holdingDays = daysBetween(pos.purchaseDate, input.asOfDate);
    const isLongTerm = holdingDays > 365;
    const daysUntilLongTerm = isLongTerm ? null : 366 - holdingDays;

    // Tax if sold today
    const incomeWithGain = currentIncomeBase + (isLongTerm ? unrealizedGain : 0);
    const federalLtcgRate = isLongTerm
      ? getLtcgRate(incomeWithGain, input.filingStatus)
      : 0; // short-term gains taxed as ordinary income — use ordinary bracket

    const niitApplies = isLongTerm && incomeWithGain > niitThreshold;
    const effectiveFederalRate = isLongTerm
      ? federalLtcgRate + (niitApplies ? NIIT_RATE : 0)
      : 0; // short-term handled separately — not LTCG rates

    const longTermGainTax = isLongTerm ? unrealizedGain * effectiveFederalRate : 0;
    const totalStateTax = isLongTerm ? unrealizedGain * input.stateLtcgRate : 0;
    const totalTaxIfSoldNow = longTermGainTax + totalStateTax;

    // Check bracket crossing
    const { nextRate: rateAfterSale } = getNextLtcgBracket(incomeWithGain, input.filingStatus);
    const { room: roomBefore } = getNextLtcgBracket(currentIncomeBase, input.filingStatus);
    const wouldCrossBracketBoundary = isLongTerm && unrealizedGain > roomBefore && roomBefore < Infinity;
    const gainThatCrossesBoundary = wouldCrossBracketBoundary ? Math.max(0, unrealizedGain - roomBefore) : 0;

    let bracketWarning: string | null = null;
    if (wouldCrossBracketBoundary) {
      bracketWarning =
        `Selling this position pushes $${gainThatCrossesBoundary.toLocaleString()} of gains ` +
        `into the ${(rateAfterSale * 100).toFixed(0)}% LTCG bracket. ` +
        `Consider selling only $${Math.round(roomBefore).toLocaleString()} in gains this year ` +
        `and the remainder next year to stay in the ${(currentLtcgRate * 100).toFixed(0)}% bracket.`;
    }

    // §1250 depreciation recapture
    let depreciationRecaptureWarning: string | null = null;
    if (pos.isRealEstate && pos.depreciationTaken > 0) {
      depreciationRecaptureWarning =
        `Real estate §1250 depreciation recapture: $${pos.depreciationTaken.toLocaleString()} of your ` +
        `gain is taxed at a maximum 25% rate (not the LTCG rate), regardless of your bracket. ` +
        `The remaining gain qualifies for LTCG rates. Consult a CPA for the full calculation.`;
    }

    // Recommendation
    let recommendation: PositionAnalysis["recommendation"];
    let recommendationDetail: string;

    if (!isLongTerm && daysUntilLongTerm !== null && daysUntilLongTerm <= 90) {
      recommendation = "wait_for_long_term";
      recommendationDetail =
        `${daysUntilLongTerm} days until long-term treatment (366-day threshold). ` +
        `Waiting converts ordinary-income tax to LTCG rate — saves ` +
        `${((0.37 - federalLtcgRate) * 100).toFixed(0)}+ percentage points on this gain.`;
    } else if (isLongTerm && currentLtcgRate === 0 && unrealizedGain > 0) {
      recommendation = "sell_now_0pct";
      recommendationDetail =
        `Your LTCG rate is currently 0%. This is a gain-harvesting opportunity — ` +
        `you can realize $${Math.min(unrealizedGain, zeroRateRoomRemaining).toLocaleString()} ` +
        `in gains tax-free. Step up your cost basis now to reduce future taxable gains.`;
    } else if (isLongTerm && federalLtcgRate <= 0.15 && !wouldCrossBracketBoundary) {
      recommendation = "sell_now_acceptable";
      recommendationDetail =
        `15% LTCG rate (+ ${(input.stateLtcgRate * 100).toFixed(1)}% state). ` +
        `Timing is acceptable — no bracket crossing. Total tax: $${totalTaxIfSoldNow.toLocaleString()}.`;
    } else if (isLongTerm && federalLtcgRate === 0.20) {
      recommendation = "wait_for_lower_income_year";
      recommendationDetail =
        `Your income puts you in the 20% LTCG bracket. If income will be lower next year ` +
        `(e.g., partial-year work, gap year, early retirement), deferring this sale could ` +
        `drop the rate to 15%, saving $${Math.round(unrealizedGain * 0.05).toLocaleString()}.`;
    } else {
      recommendation = "caution_high_rate";
      recommendationDetail =
        `Short-term gain — taxed as ordinary income at up to ${(effectiveFederalRate * 100).toFixed(0)}%. ` +
        `Consider holding until long-term if investment thesis remains intact.`;
    }

    return {
      id: pos.id,
      ticker: pos.ticker,
      name: pos.name,
      shares: pos.shares,
      costBasis: Math.round(costBasis),
      currentValue: Math.round(currentValue),
      unrealizedGain: Math.round(unrealizedGain),
      isLongTerm,
      holdingDays,
      daysUntilLongTerm,
      federalLtcgRate,
      niitApplies,
      effectiveFederalRate,
      totalFederalTax: Math.round(longTermGainTax),
      totalStateTax: Math.round(totalStateTax),
      totalTaxIfSoldNow: Math.round(totalTaxIfSoldNow),
      recommendation,
      recommendationDetail,
      wouldCrossBracketBoundary,
      gainThatCrossesBoundary: Math.round(gainThatCrossesBoundary),
      bracketWarning,
      depreciationRecaptureWarning,
    };
  });

  // Suggested sell order: 0% opportunities first, then lowest rate, then by size
  const priority: Record<PositionAnalysis["recommendation"], number> = {
    sell_now_0pct: 0,
    wait_for_long_term: 3,
    sell_now_acceptable: 1,
    wait_for_lower_income_year: 2,
    caution_high_rate: 4,
  };
  const suggestedSellOrder = [...positions]
    .sort((a, b) => priority[a.recommendation] - priority[b.recommendation] || a.totalTaxIfSoldNow - b.totalTaxIfSoldNow)
    .map((p) => p.id);

  const projectedTotalLtcg =
    input.realizedLtcgYtd +
    positions.filter((p) => p.isLongTerm && p.unrealizedGain > 0).reduce((s, p) => s + p.unrealizedGain, 0);
  const projectedLtcgRate = getLtcgRate(
    input.ordinaryTaxableIncome + projectedTotalLtcg,
    input.filingStatus
  );

  const legalNotices = [
    "Long-term capital gains treatment requires holding MORE than 365 days (one year). Short-term gains are taxed as ordinary income at rates up to 37%.",
    "LTCG brackets are based on total taxable income including the gains. A large gain can push ordinary income dollars into higher ordinary brackets via the 'stacking' rules.",
    zeroRateOpportunity
      ? `You currently have $${zeroRateRoomRemaining.toLocaleString()} of room at the 0% LTCG rate. Gain harvesting (realizing gains at 0% to reset cost basis) is legal and has no wash-sale equivalent for gains.`
      : null,
    "NIIT (3.8%) applies to net investment income above $200,000 (single) / $250,000 (MFJ) MAGI, in addition to regular LTCG rates (IRC §1411).",
    "State taxes: most states tax capital gains as ordinary income. Factor your state rate into the total tax calculation.",
    "This analysis is informational only and does not constitute personalized tax advice. Consult a CPA or tax advisor before executing any sale.",
  ].filter(Boolean) as string[];

  return {
    currentLtcgRate,
    roomUntilNextLtcgBracket: Math.round(Math.min(roomUntilNext, 1_000_000)),
    nextLtcgRate,
    zeroRateOpportunity,
    zeroRateRoomRemaining: Math.round(zeroRateRoomRemaining),
    zeroRateExplanation: zeroRateOpportunity
      ? `You are in the 0% LTCG bracket with $${zeroRateRoomRemaining.toLocaleString()} of headroom. ` +
        `Selling appreciated positions now realizes gains TAX-FREE federally. This resets your cost basis ` +
        `(reduces future gains) at zero tax cost — a legal planning opportunity with no wash-sale restrictions.`
      : `You are not in the 0% LTCG bracket. Your current rate is ${(currentLtcgRate * 100).toFixed(0)}%.`,
    positions,
    projectedTotalLtcg: Math.round(projectedTotalLtcg),
    projectedLtcgRate,
    suggestedSellOrder,
    legalNotices,
  };
}
