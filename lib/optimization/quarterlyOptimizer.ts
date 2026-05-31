/**
 * Quarterly Tax Optimization Pipeline
 *
 * Runs all four tax optimization strategies in the correct dependency order
 * for a single client snapshot. Designed to be called once per quarter —
 * at the same time the portfolio is rebalanced and tax constants are refreshed.
 *
 * PIPELINE ORDER (order is not arbitrary — each stage informs the next):
 *
 *   1. Capital Gains Timing
 *      → Identifies positions that should NOT be sold this quarter
 *        (short-term, would cross a bracket, or have 0% opportunity to capture)
 *      → Output: "do not sell" list, 0% harvest candidates, bracket position
 *
 *   2. Tax-Loss Harvesting
 *      → Scans taxable holdings for realizable losses
 *      → Avoids selling anything the timing stage said to hold
 *      → Nets losses against YTD gains and calculates remaining bracket room
 *        AFTER harvest losses reduce ordinary income (up to $3k)
 *      → Output: sell candidates, ordinary income offset, updated income base
 *
 *   3. Roth Conversion
 *      → Uses the income base AFTER harvest losses are applied
 *        (harvest losses can free up bracket room for a larger conversion)
 *      → Calculates the optimal conversion amount for this year
 *      → Output: recommended conversion amount, tax cost, future value
 *
 *   4. Tax-Aware Rebalancing
 *      → Uses harvest sell proceeds to fund rebalancing buys
 *      → Avoids re-buying harvested tickers within 30 days (wash-sale)
 *      → Prioritizes contribution-first and tax-advantaged rebalancing
 *      → Output: ordered trade list with tax costs
 *
 * LEGAL BASIS:
 *   All strategies are explicitly legal IRS-recognized tax planning:
 *   IRC §1091 (wash-sale), §1211–§1212 (loss deduction), §408A (Roth),
 *   §1(h) (LTCG rates), §1001 (realization principle).
 *   Nothing here constitutes tax evasion — only timing and structural choices
 *   explicitly permitted by the Internal Revenue Code.
 *
 * DISCLAIMER: Output is informational tax planning analysis, not personalized
 * tax or investment advice. Users should consult a CPA before executing.
 */

import {
  ClientSnapshot,
  OptimizationAction,
  QuarterlyOptimizationReport,
  ActionCategory,
  ActionPriority,
} from "./types";

import {
  analyzeHarvestOpportunities,
  HarvestResult,
  HoldingSchema as HarvestHoldingSchema,
} from "../tax/taxLossHarvesting";

import {
  analyzeRothConversion,
  RothConversionResult,
} from "../tax/rothConversion";

import {
  analyzeCapitalGainsTiming,
  GainsTimingResult,
} from "../tax/capitalGainsTiming";

import {
  analyzeRebalancing,
  RebalanceResult,
} from "../tax/rebalancing";

// ── Helpers ────────────────────────────────────────────────────────────────

function quarter(dateStr: string): string {
  const month = new Date(dateStr).getMonth() + 1;
  const year = new Date(dateStr).getFullYear();
  const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return `Q${q} ${year}`;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(Math.abs(n));
}

let actionIdCounter = 0;
function nextId(category: ActionCategory): string {
  return `${category}_${++actionIdCounter}`;
}

// ── Stage 1: Capital Gains Timing ─────────────────────────────────────────

function runTimingStage(
  snapshot: ClientSnapshot,
  notes: string[]
): { result: GainsTimingResult; doNotSellIds: Set<string> } {
  // Only taxable positions with gains are timing candidates
  const taxableWithGains = snapshot.holdings
    .filter((h) => {
      const gain = h.shares * (h.currentPricePerShare - h.costBasisPerShare);
      return h.accountType === "taxable_brokerage" && gain > 0;
    })
    .map((h, i) => ({
      id: `timing_${i}_${h.ticker}`,
      ticker: h.ticker,
      name: h.name,
      shares: h.shares,
      costBasisPerShare: h.costBasisPerShare,
      currentPricePerShare: h.currentPricePerShare,
      purchaseDate: h.purchaseDate,
      isRealEstate: h.isRealEstate,
      depreciationTaken: h.depreciationTaken,
    }));

  if (taxableWithGains.length === 0) {
    notes.push("Gains timing: no taxable positions with unrealized gains — skipped.");
    return {
      result: {
        currentLtcgRate: snapshot.taxProfile.ltcgRate,
        roomUntilNextLtcgBracket: 0,
        nextLtcgRate: 0.20,
        zeroRateOpportunity: false,
        zeroRateRoomRemaining: 0,
        zeroRateExplanation: "No taxable gain positions.",
        positions: [],
        projectedTotalLtcg: snapshot.ytdGains.realizedLongTermGains,
        projectedLtcgRate: snapshot.taxProfile.ltcgRate,
        suggestedSellOrder: [],
        legalNotices: [],
      },
      doNotSellIds: new Set(),
    };
  }

  // Ordinary taxable income after deductions (rough — we don't have full tax calc here)
  // Use combined marginal rate to back-estimate taxable income from bracket tables
  // Simpler: pass ordinaryTaxableIncome as (grossIncome * (1 - effectiveTaxRate))
  // Actually we use federal marginal rate to find which bracket we're in from constants
  // For now, approximate: use gross income minus standard deduction as taxable income
  const STANDARD_DEDUCTIONS: Record<string, number> = {
    single: 16_100, married_filing_jointly: 32_200,
    married_filing_separately: 16_100, head_of_household: 24_150,
  };
  const standardDeduction = STANDARD_DEDUCTIONS[snapshot.taxProfile.filingStatus] ?? 16_100;
  const ordinaryTaxableIncome = Math.max(
    0,
    snapshot.taxProfile.grossIncome - Math.max(standardDeduction, snapshot.taxProfile.itemizedDeductions)
  );

  const result = analyzeCapitalGainsTiming({
    ordinaryTaxableIncome,
    filingStatus: snapshot.taxProfile.filingStatus,
    realizedLtcgYtd: snapshot.ytdGains.realizedLongTermGains,
    realizedStcgYtd: snapshot.ytdGains.realizedShortTermGains,
    stateLtcgRate: snapshot.taxProfile.stateLtcgRate,
    positions: taxableWithGains,
    asOfDate: snapshot.asOfDate,
  });

  // Build "do not sell" set — short-term and high-rate positions
  const doNotSellIds = new Set(
    result.positions
      .filter((p) =>
        p.recommendation === "wait_for_long_term" ||
        p.recommendation === "caution_high_rate" ||
        p.recommendation === "wait_for_lower_income_year"
      )
      .map((p) => p.ticker)
  );

  notes.push(
    `Gains timing: analyzed ${taxableWithGains.length} taxable gain position(s). ` +
    `Do-not-sell list: [${[...doNotSellIds].join(", ") || "none"}].`
  );

  return { result, doNotSellIds };
}

// ── Stage 2: Tax-Loss Harvesting ──────────────────────────────────────────

function runHarvestStage(
  snapshot: ClientSnapshot,
  doNotSellTickers: Set<string>,
  notes: string[]
): { result: HarvestResult; ordinaryIncomeFreed: number } {
  // Only taxable positions with losses, not in the do-not-sell list
  const harvestCandidates = snapshot.holdings.filter((h) => {
    const loss = h.shares * (h.currentPricePerShare - h.costBasisPerShare);
    return (
      h.accountType === "taxable_brokerage" &&
      loss < 0 &&
      !doNotSellTickers.has(h.ticker)
    );
  });

  if (harvestCandidates.length === 0) {
    notes.push("Tax-loss harvesting: no taxable positions with unrealized losses — skipped.");
    return {
      result: {
        candidates: [],
        totalHarvestableLoss: 0,
        shortTermLossesAvailable: 0,
        longTermLossesAvailable: 0,
        netShortTermPosition: snapshot.ytdGains.realizedShortTermGains,
        netLongTermPosition: snapshot.ytdGains.realizedLongTermGains,
        ordinaryIncomeOffset: 0,
        lossCarryforward: 0,
        estimatedTaxSavingsThisYear: 0,
        estimatedTaxSavingsFromCarryforward: 0,
        legalNotices: [],
      },
      ordinaryIncomeFreed: 0,
    };
  }

  const result = analyzeHarvestOpportunities({
    holdings: harvestCandidates.map((h) => ({
      ticker: h.ticker,
      name: h.name,
      shares: h.shares,
      costBasisPerShare: h.costBasisPerShare,
      currentPricePerShare: h.currentPricePerShare,
      purchaseDate: h.purchaseDate,
      accountType: "taxable" as const,
    })),
    filingStatus: snapshot.taxProfile.filingStatus,
    realizedShortTermGainsYTD: snapshot.ytdGains.realizedShortTermGains,
    realizedLongTermGainsYTD: snapshot.ytdGains.realizedLongTermGains,
    shortTermLossCarryforward: snapshot.ytdGains.shortTermLossCarryforward,
    longTermLossCarryforward: snapshot.ytdGains.longTermLossCarryforward,
    ordinaryMarginalRate: snapshot.taxProfile.federalMarginalRate,
    ltcgRate: snapshot.taxProfile.ltcgRate,
    estimatedTradeCostDollars: snapshot.estimatedTradeCostDollars,
    asOfDate: snapshot.asOfDate,
  });

  // Ordinary income freed = the $3k deduction that reduces taxable ordinary income
  // This creates more bracket room for the Roth conversion stage
  const ordinaryIncomeFreed = result.ordinaryIncomeOffset;

  notes.push(
    `Tax-loss harvesting: ${result.candidates.filter((c) => c.worthHarvesting).length} position(s) ` +
    `worth harvesting. Total loss: ${fmt(result.totalHarvestableLoss)}. ` +
    `Ordinary income freed: ${fmt(ordinaryIncomeFreed)} (creates additional Roth conversion room).`
  );

  return { result, ordinaryIncomeFreed };
}

// ── Stage 3: Roth Conversion ──────────────────────────────────────────────

function runRothStage(
  snapshot: ClientSnapshot,
  ordinaryIncomeFreed: number,
  notes: string[]
): RothConversionResult | null {
  if (snapshot.retirement.traditionalIraBalance <= 0) {
    notes.push("Roth conversion: no traditional IRA balance — skipped.");
    return null;
  }

  // Key insight: harvest losses reduced ordinary income by up to $3k,
  // which frees that much more bracket room for conversion
  // We adjust the reported income downward by the harvest offset
  const adjustedIncome = Math.max(
    0,
    snapshot.taxProfile.grossIncome - ordinaryIncomeFreed
  );

  const result = analyzeRothConversion({
    ordinaryIncomeThisYear: adjustedIncome,
    filingStatus: snapshot.taxProfile.filingStatus,
    age: snapshot.taxProfile.age,
    traditionalIraBalance: snapshot.retirement.traditionalIraBalance,
    rothIraBalance: snapshot.retirement.rothIraBalance,
    nonDeductibleIraBasis: snapshot.retirement.nonDeductibleIraBasis,
    expectedRetirementMarginalRate: snapshot.retirement.expectedRetirementMarginalRate,
    itemizedDeductions: snapshot.taxProfile.itemizedDeductions,
    yearsToRetirement: snapshot.retirement.yearsToRetirement,
    expectedAnnualReturn: snapshot.retirement.expectedAnnualReturn,
    taxYear: new Date(snapshot.asOfDate).getFullYear(),
  });

  notes.push(
    `Roth conversion: recommended ${fmt(result.recommendedConversionAmount)} at ` +
    `${(result.currentMarginalRate * 100).toFixed(0)}% (income adjusted -${fmt(ordinaryIncomeFreed)} from harvest). ` +
    `${result.rmdRequired ? "⚠ RMD required first." : ""}`
  );

  return result;
}

// ── Stage 4: Tax-Aware Rebalancing ────────────────────────────────────────

function runRebalanceStage(
  snapshot: ClientSnapshot,
  harvestedTickers: string[],
  notes: string[]
): RebalanceResult {
  if (Object.keys(snapshot.targetWeights).length === 0) {
    notes.push("Rebalancing: no target weights provided — skipped.");
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

  const result = analyzeRebalancing({
    holdings: snapshot.holdings.map((h) => ({
      ticker: h.ticker,
      accountType: h.accountType,
      currentValue: h.shares * h.currentPricePerShare,
      costBasis: h.shares * h.costBasisPerShare,
      purchaseDate: h.purchaseDate,
    })),
    targetWeights: snapshot.targetWeights,
    monthlyNewContributions: snapshot.monthlyContributions,
    filingStatus: snapshot.taxProfile.filingStatus,
    ltcgRate: snapshot.taxProfile.ltcgRate,
    ordinaryMarginalRate: snapshot.taxProfile.federalMarginalRate,
    stateLtcgRate: snapshot.taxProfile.stateLtcgRate,
    driftThreshold: snapshot.rebalanceDriftThreshold,
    asOfDate: snapshot.asOfDate,
  });

  // Add wash-sale note if any harvested tickers appear in the buy list
  const washSaleConflicts = result.trades.filter(
    (t) => t.action === "buy" && harvestedTickers.includes(t.ticker)
  );

  if (washSaleConflicts.length > 0) {
    const conflictTickers = [...new Set(washSaleConflicts.map((t) => t.ticker))];
    notes.push(
      `⚠ Wash-sale conflict: rebalancer wants to BUY [${conflictTickers.join(", ")}] ` +
      `but those were just harvested for a loss. Wait 30 days or use replacement ETFs ` +
      `(see harvest candidates for suggestions). IRC §1091.`
    );
    // Mark those trades with elevated wash-sale risk
    for (const trade of washSaleConflicts) {
      trade.washSaleRisk = true;
      trade.rationale =
        `⚠ WASH-SALE RISK: ${trade.ticker} was harvested this quarter. ` +
        `Wait 30 days from harvest sale date or use replacement ETF. ` + trade.rationale;
    }
  }

  notes.push(
    `Rebalancing: ${result.needsRebalancing ? `${result.trades.length} trade(s) recommended` : "portfolio within threshold — no trades needed"}. ` +
    `Est. tax cost: ${fmt(result.estimatedTotalTaxCost)}.`
  );

  return result;
}

// ── Action builder ─────────────────────────────────────────────────────────

function buildActions(
  harvestResult: HarvestResult,
  rothResult: RothConversionResult | null,
  timingResult: GainsTimingResult,
  rebalanceResult: RebalanceResult,
  snapshot: ClientSnapshot
): OptimizationAction[] {
  const actions: OptimizationAction[] = [];
  const threshold = snapshot.minimumActionThreshold;
  const yearEnd = `Before Dec 31, ${new Date(snapshot.asOfDate).getFullYear()}`;

  // ── Harvest actions ──────────────────────────────────────────────────
  for (const c of harvestResult.candidates.filter(
    (c) => c.worthHarvesting && Math.abs(c.unrealizedLoss) >= threshold
  )) {
    const replacements = c.replacements.map((r) => r.ticker).join(" or ");
    actions.push({
      id: nextId("harvest"),
      category: "harvest",
      priority: Math.abs(c.unrealizedLoss) > 5000 ? "urgent" : "high",
      title: `Harvest loss in ${c.ticker}`,
      detail:
        `Sell ${c.shares} shares of ${c.ticker} (${c.isLongTerm ? "long-term" : "short-term"}, ` +
        `held ${c.holdingDays} days). Unrealized loss: ${fmt(c.unrealizedLoss)}. ` +
        `Estimated tax savings: ${fmt(c.estimatedTaxSavings)}. ` +
        (replacements
          ? `Replace with ${replacements} to maintain market exposure without triggering wash-sale rule.`
          : "No standard replacement available — wait 30 days to rebuy.") +
        (c.washSaleWarning ? ` ⚠ ${c.washSaleWarning}` : ""),
      estimatedDollarImpact: c.estimatedTaxSavings,
      impactLabel: `${fmt(c.estimatedTaxSavings)} tax savings`,
      tickers: [c.ticker, ...c.replacements.map((r) => r.ticker)],
      deadline: yearEnd,
      requiresCpa: false,
      legalBasis: "IRC §1091 (wash-sale), §1211–§1212 (loss deduction)",
    });
  }

  if (harvestResult.ordinaryIncomeOffset > 0) {
    actions.push({
      id: nextId("harvest"),
      category: "harvest",
      priority: "medium",
      title: `Apply ${fmt(harvestResult.ordinaryIncomeOffset)} harvest loss to ordinary income`,
      detail:
        `Net losses after offsetting capital gains: ${fmt(harvestResult.ordinaryIncomeOffset)} ` +
        `reduces your ordinary taxable income this year. ` +
        `Remaining ${fmt(harvestResult.lossCarryforward)} carries forward to future years indefinitely.`,
      estimatedDollarImpact: harvestResult.ordinaryIncomeOffset * snapshot.taxProfile.federalMarginalRate,
      impactLabel: `${fmt(harvestResult.ordinaryIncomeOffset * snapshot.taxProfile.federalMarginalRate)} ordinary income tax savings`,
      tickers: [],
      deadline: yearEnd,
      requiresCpa: false,
      legalBasis: "IRC §1211(b) — $3,000 annual ordinary income offset",
    });
  }

  // ── Roth conversion action ────────────────────────────────────────────
  if (rothResult && rothResult.recommendedConversionAmount >= threshold) {
    const scenario = rothResult.scenarios.find(
      (s) => s.conversionAmount === rothResult.recommendedConversionAmount
    ) ?? rothResult.scenarios[0];

    actions.push({
      id: nextId("roth_conversion"),
      category: "roth_conversion",
      priority: rothResult.rmdRequired ? "urgent" : "high",
      title: `Convert ${fmt(rothResult.recommendedConversionAmount)} Traditional IRA → Roth`,
      detail:
        `${rothResult.rmdRequired ? `⚠ Take your RMD (~${fmt(rothResult.rmdEstimate ?? 0)}) FIRST before converting. ` : ""}` +
        `Convert ${fmt(rothResult.recommendedConversionAmount)} at your current ${(rothResult.currentMarginalRate * 100).toFixed(0)}% ` +
        `marginal rate. Tax cost this year: ${fmt(scenario?.taxCostThisYear ?? 0)}. ` +
        `Projected tax-free value at retirement: ${fmt(scenario?.projectedFutureValue ?? 0)}. ` +
        `${rothResult.proRataWarning ? "⚠ Pro-rata rule applies — see CPA." : ""}` +
        `${rothResult.fiveYearRuleNote ? " 5-year rule: converted principal locked for 5 years if under 59½." : ""}`,
      estimatedDollarImpact: scenario?.projectedFutureValue
        ? scenario.projectedFutureValue * (rothResult.scenarios[0]?.marginalRateOnConversion ?? 0) -
          (scenario?.taxCostThisYear ?? 0)
        : 0,
      impactLabel: `${fmt(scenario?.taxCostThisYear ?? 0)} tax now → ${fmt(scenario?.projectedFutureValue ?? 0)} tax-free`,
      tickers: [],
      deadline: yearEnd,
      requiresCpa: !!rothResult.proRataWarning || rothResult.rmdRequired,
      legalBasis: "IRC §408A(d)(3) — Roth conversion",
    });
  }

  // ── Gains timing actions ──────────────────────────────────────────────
  for (const pos of timingResult.positions.filter(
    (p) => p.recommendation === "sell_now_0pct" && p.unrealizedGain >= threshold
  )) {
    actions.push({
      id: nextId("gains_timing"),
      category: "gains_timing",
      priority: "high",
      title: `Harvest GAIN in ${pos.ticker} at 0% federal rate`,
      detail:
        `You are in the 0% LTCG bracket with ${fmt(timingResult.zeroRateRoomRemaining)} of headroom. ` +
        `Selling ${pos.shares} shares of ${pos.ticker} realizes a ${fmt(pos.unrealizedGain)} gain ` +
        `TAX-FREE federally (${fmt(pos.totalStateTax)} state tax applies). ` +
        `This resets your cost basis to current market price, ` +
        `permanently reducing future taxable gains. You can immediately rebuy — no wash-sale rule for gains.`,
      estimatedDollarImpact: pos.unrealizedGain * pos.federalLtcgRate,
      impactLabel: `${fmt(pos.unrealizedGain)} gain realized at 0% federal LTCG rate`,
      tickers: [pos.ticker],
      deadline: yearEnd,
      requiresCpa: false,
      legalBasis: "IRC §1(h) — 0% LTCG rate",
    });
  }

  for (const pos of timingResult.positions.filter(
    (p) =>
      p.recommendation === "wait_for_long_term" &&
      p.daysUntilLongTerm !== null &&
      p.daysUntilLongTerm <= 90 &&
      p.unrealizedGain >= threshold
  )) {
    actions.push({
      id: nextId("gains_timing"),
      category: "gains_timing",
      priority: "medium",
      title: `Wait ${pos.daysUntilLongTerm} days before selling ${pos.ticker}`,
      detail:
        `${pos.ticker} becomes long-term in ${pos.daysUntilLongTerm} days ` +
        `(held ${pos.holdingDays} days so far, need 366). ` +
        `Selling now at short-term rates costs ~${fmt(pos.unrealizedGain * snapshot.taxProfile.federalMarginalRate)}. ` +
        `Waiting saves ~${fmt(pos.unrealizedGain * (snapshot.taxProfile.federalMarginalRate - pos.federalLtcgRate))} ` +
        `in federal tax alone.`,
      estimatedDollarImpact: pos.unrealizedGain * (snapshot.taxProfile.federalMarginalRate - pos.federalLtcgRate),
      impactLabel: `${fmt(pos.unrealizedGain * (snapshot.taxProfile.federalMarginalRate - pos.federalLtcgRate))} saved by waiting`,
      tickers: [pos.ticker],
      deadline: `In ${pos.daysUntilLongTerm} days`,
      requiresCpa: false,
      legalBasis: "IRC §1222 — long-term capital gains holding period",
    });
  }

  // ── Rebalancing actions ───────────────────────────────────────────────
  for (const trade of rebalanceResult.trades.filter(
    (t) => t.amountDollars >= threshold
  )) {
    const isUrgent = trade.priority <= 2; // no-tax methods
    actions.push({
      id: nextId("rebalance"),
      category: "rebalance",
      priority: isUrgent ? "medium" : trade.washSaleRisk ? "urgent" : "low",
      title:
        trade.action === "redirect_contributions"
          ? `Direct contributions to ${trade.ticker} (${trade.accountType})`
          : `${trade.action === "buy" ? "Buy" : "Sell"} ${fmt(trade.amountDollars)} of ${trade.ticker} in ${trade.accountType}`,
      detail: trade.rationale,
      estimatedDollarImpact: -trade.taxCost,
      impactLabel:
        trade.taxCost === 0
          ? "No tax cost"
          : `${fmt(trade.taxCost)} tax cost (${trade.taxType?.replace("_", " ")})`,
      tickers: [trade.ticker],
      deadline: trade.washSaleRisk ? "Within 30 days of harvest sale" : null,
      requiresCpa: false,
      legalBasis:
        trade.taxType === "none"
          ? "IRC §1001 — no realization inside tax-advantaged accounts"
          : "IRC §1001 — realization on taxable account sale",
    });
  }

  // Sort: urgent → high → medium → low → monitor
  const priorityOrder: Record<ActionPriority, number> = {
    urgent: 0, high: 1, medium: 2, low: 3, monitor: 4,
  };
  actions.sort((a, b) => {
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pd !== 0) return pd;
    return b.estimatedDollarImpact - a.estimatedDollarImpact;
  });

  return actions;
}

// ── No-action reassurances ─────────────────────────────────────────────────

function buildNoActionList(
  harvestResult: HarvestResult,
  rothResult: RothConversionResult | null,
  timingResult: GainsTimingResult,
  rebalanceResult: RebalanceResult
): string[] {
  const items: string[] = [];

  if (harvestResult.candidates.filter((c) => c.worthHarvesting).length === 0) {
    items.push("Tax-loss harvesting: no positions with net-positive harvesting opportunities this quarter.");
  }
  if (!rothResult) {
    items.push("Roth conversion: no traditional IRA balance to convert.");
  } else if (rothResult.recommendedConversionAmount === 0) {
    items.push("Roth conversion: current marginal rate exceeds expected retirement rate — conversion not recommended this year.");
  }
  if (timingResult.positions.filter((p) => p.recommendation === "sell_now_0pct").length === 0) {
    items.push("Gain harvesting (0% rate): not applicable this quarter — not in 0% LTCG bracket or no qualifying positions.");
  }
  if (!rebalanceResult.needsRebalancing) {
    items.push("Portfolio rebalancing: all positions within acceptable drift thresholds. No trades needed.");
  }

  return items;
}

// ── Main export ────────────────────────────────────────────────────────────

export function runQuarterlyOptimization(snapshot: ClientSnapshot): QuarterlyOptimizationReport {
  // Reset action ID counter each run
  actionIdCounter = 0;

  const processingNotes: string[] = [];
  const strategiesRun: ActionCategory[] = [];

  // ── Stage 1: Gains Timing ──────────────────────────────────────────────
  const { result: timingResult, doNotSellIds } = runTimingStage(snapshot, processingNotes);
  strategiesRun.push("gains_timing");

  // ── Stage 2: Tax-Loss Harvesting ──────────────────────────────────────
  const { result: harvestResult, ordinaryIncomeFreed } = runHarvestStage(
    snapshot, doNotSellIds, processingNotes
  );
  strategiesRun.push("harvest");

  // Track which tickers were harvested for wash-sale protection in rebalancer
  const harvestedTickers = harvestResult.candidates
    .filter((c) => c.worthHarvesting)
    .map((c) => c.ticker);

  // ── Stage 3: Roth Conversion ───────────────────────────────────────────
  const rothResult = runRothStage(snapshot, ordinaryIncomeFreed, processingNotes);
  strategiesRun.push("roth_conversion");

  // ── Stage 4: Rebalancing ───────────────────────────────────────────────
  const rebalanceResult = runRebalanceStage(snapshot, harvestedTickers, processingNotes);
  strategiesRun.push("rebalance");

  // ── Build action list ──────────────────────────────────────────────────
  const actions = buildActions(
    harvestResult, rothResult, timingResult, rebalanceResult, snapshot
  );

  // ── Totals ─────────────────────────────────────────────────────────────
  const totalEstimatedSavingsThisYear = actions
    .filter((a) => a.estimatedDollarImpact > 0 && (a.category === "harvest" || a.category === "gains_timing"))
    .reduce((s, a) => s + a.estimatedDollarImpact, 0);

  const totalEstimatedSavingsLongTerm =
    totalEstimatedSavingsThisYear +
    harvestResult.estimatedTaxSavingsFromCarryforward +
    (rothResult?.scenarios[0]?.projectedFutureValue
      ? rothResult.scenarios[0].projectedFutureValue * rothResult.currentMarginalRate -
        (rothResult.scenarios[0]?.taxCostThisYear ?? 0)
      : 0);

  // ── Consolidated legal notices ─────────────────────────────────────────
  const legalNotices = [
    ...new Set([
      ...harvestResult.legalNotices,
      ...(rothResult?.legalNotices ?? []),
      ...timingResult.legalNotices,
      ...rebalanceResult.legalNotices,
      "This quarterly optimization report is informational tax planning analysis only. " +
      "It does not constitute personalized tax, legal, or investment advice. " +
      "All strategies described are explicitly permitted by the Internal Revenue Code. " +
      "Consult a licensed CPA or financial advisor before executing any recommendation.",
    ]),
  ];

  return {
    clientId: snapshot.clientId,
    asOfDate: snapshot.asOfDate,
    quarter: quarter(snapshot.asOfDate),

    actions,
    totalEstimatedSavingsThisYear: Math.round(totalEstimatedSavingsThisYear),
    totalEstimatedSavingsLongTerm: Math.round(totalEstimatedSavingsLongTerm),

    harvestResult,
    rothResult,
    timingResult,
    rebalanceResult,

    noActionNeeded: buildNoActionList(harvestResult, rothResult, timingResult, rebalanceResult),
    legalNotices,
    strategiesRun,
    processingNotes,
  };
}
