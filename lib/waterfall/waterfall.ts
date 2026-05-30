import {
  WaterfallInput,
  WaterfallResult,
  WaterfallBucket,
  AccountType,
  IRADecision,
  LumpSumAllocation,
} from "./types";
import { CONTRIBUTION_LIMITS, ROTH_IRA_PHASEOUT } from "../tax/constants";

// ── 2024 contribution limits ───────────────────────────────────────────────

function get401kLimit(age: number): number {
  return age >= 50
    ? CONTRIBUTION_LIMITS.traditional401k + CONTRIBUTION_LIMITS.catchUp401k
    : CONTRIBUTION_LIMITS.traditional401k;
}

function getIRALimit(age: number): number {
  return age >= 50
    ? CONTRIBUTION_LIMITS.ira + CONTRIBUTION_LIMITS.catchUpIra
    : CONTRIBUTION_LIMITS.ira;
}

function getHSALimit(age: number): number {
  // Using single limit — in production, pass family flag
  return age >= 55
    ? CONTRIBUTION_LIMITS.hsaSingle + CONTRIBUTION_LIMITS.hsaCatchUp
    : CONTRIBUTION_LIMITS.hsaSingle;
}

// ── Roth vs Traditional IRA decision ──────────────────────────────────────
// This is pure tax math — no investment opinion.
// Rule: if you expect to be in a higher bracket in retirement → pay tax now (Roth)
//       if you expect to be in a lower bracket in retirement → defer tax (Traditional)
// Heuristic: combined marginal rate < 25% → Roth beats Traditional in most cases
//             combined marginal rate > 32% → Traditional usually better
//             in between → depends on state, age, expected retirement income

const ROTH_PREFERRED_BELOW = 0.25;   // clear Roth territory
const TRADITIONAL_PREFERRED_ABOVE = 0.32; // clear Traditional territory

function decideIRA(input: WaterfallInput): IRADecision {
  const { combinedMarginalRate, grossAnnualIncome, filingStatus, forceBackdoorRoth, age } = input;
  const phaseout = ROTH_IRA_PHASEOUT[filingStatus];
  const incomeOverLimit = grossAnnualIncome > phaseout.end;

  if (incomeOverLimit || forceBackdoorRoth) {
    return {
      type: "backdoor_roth",
      marginalRate: combinedMarginalRate,
      threshold: ROTH_PREFERRED_BELOW,
      reason:
        `Your income (${fmt(grossAnnualIncome)}) exceeds the Roth IRA limit for ${filingStatus} filers ` +
        `(${fmt(phaseout.end)}). A Backdoor Roth — contribute to a Traditional IRA then convert — ` +
        `achieves the same tax-free growth outcome.`,
      incomeOverLimit: true,
    };
  }

  if (combinedMarginalRate <= ROTH_PREFERRED_BELOW) {
    return {
      type: "roth",
      marginalRate: combinedMarginalRate,
      threshold: ROTH_PREFERRED_BELOW,
      reason:
        `Your combined marginal rate is ${fmtPct(combinedMarginalRate)}, below the ${fmtPct(ROTH_PREFERRED_BELOW)} threshold. ` +
        `Paying tax now at ${fmtPct(combinedMarginalRate)} and getting tax-free growth beats deferring ` +
        `if your retirement rate is similar or higher.`,
      incomeOverLimit: false,
    };
  }

  if (combinedMarginalRate >= TRADITIONAL_PREFERRED_ABOVE) {
    return {
      type: "traditional",
      marginalRate: combinedMarginalRate,
      threshold: TRADITIONAL_PREFERRED_ABOVE,
      reason:
        `Your combined marginal rate is ${fmtPct(combinedMarginalRate)}, above the ${fmtPct(TRADITIONAL_PREFERRED_ABOVE)} threshold. ` +
        `Deferring tax now saves ${fmtPct(combinedMarginalRate)} today. Most retirees draw at a lower effective rate, ` +
        `so paying less now and more later is the better mathematical outcome.`,
      incomeOverLimit: false,
    };
  }

  // Between thresholds — lean Roth for flexibility (Roth has no RMDs, more optionality)
  return {
    type: "roth",
    marginalRate: combinedMarginalRate,
    threshold: ROTH_PREFERRED_BELOW,
    reason:
      `Your combined marginal rate is ${fmtPct(combinedMarginalRate)}, in the judgment zone between ` +
      `${fmtPct(ROTH_PREFERRED_BELOW)} and ${fmtPct(TRADITIONAL_PREFERRED_ABOVE)}. ` +
      `Roth is favored here for tax diversification — no required minimum distributions, ` +
      `and withdrawals don't affect taxable Social Security income in retirement.`,
    incomeOverLimit: false,
  };
}

// ── Employer match calculation ─────────────────────────────────────────────

function calcEmployerMatch(input: WaterfallInput): {
  annualMatch: number;
  monthlyContributionToCapture: number;
} {
  if (!input.has401k || !input.employerMatch) return { annualMatch: 0, monthlyContributionToCapture: 0 };

  const { matchRate, matchUpToPercent } = input.employerMatch;
  const annualContributionNeeded = input.grossAnnualIncome * matchUpToPercent;
  const annualMatch = annualContributionNeeded * matchRate;
  const monthlyContributionToCapture = annualContributionNeeded / 12;

  return { annualMatch, monthlyContributionToCapture };
}

// ── Main waterfall ─────────────────────────────────────────────────────────

export function runWaterfall(input: WaterfallInput): WaterfallResult {
  const {
    grossAnnualIncome, age, monthlySurplus, capitalToInvest,
    currentMonthlyContributions: existing, has401k, hasHSAEligiblePlan,
  } = input;

  let remainingSurplus = monthlySurplus;
  let remainingCapital = capitalToInvest;
  const buckets: WaterfallBucket[] = [];
  const lumpSum: LumpSumAllocation[] = [];

  const limit401k = get401kLimit(age);
  const limitIRA = getIRALimit(age);
  const limitHSA = getHSALimit(age);
  const iraDecision = decideIRA(input);
  const { annualMatch, monthlyContributionToCapture } = calcEmployerMatch(input);

  // ── Priority 1: 401k to employer match ──────────────────────────────────
  if (has401k && input.employerMatch && monthlyContributionToCapture > 0) {
    const alreadyContributing = existing.traditional401k;
    const alreadyAnnual = alreadyContributing * 12;
    const neededAnnual = input.grossAnnualIncome * input.employerMatch.matchUpToPercent;
    const additionalAnnual = Math.max(0, neededAnnual - alreadyAnnual);
    const additionalMonthly = additionalAnnual / 12;
    const allocated = Math.min(additionalMonthly, remainingSurplus);

    buckets.push({
      priority: 1,
      accountType: "traditional_401k_match",
      label: "401k — capture employer match",
      monthlyAmount: alreadyContributing + allocated,
      annualAmount: (alreadyContributing + allocated) * 12,
      annualLimit: limit401k,
      alreadyContributing: alreadyContributing * 12,
      additionalNeeded: additionalAnnual,
      remainingCapacity: limit401k - alreadyAnnual,
      isMaxed: alreadyAnnual >= neededAnnual,
      taxTreatment: "Pre-tax — reduces taxable income today",
      whyThisOrder:
        `Employer matches ${fmtPct(input.employerMatch.matchRate)} of contributions up to ${fmtPct(input.employerMatch.matchUpToPercent)} of salary. ` +
        `That's a ${fmtPct(input.employerMatch.matchRate * 100)} guaranteed return before any market returns. ` +
        `Annual match value: ${fmt(annualMatch)}.`,
    });

    remainingSurplus -= allocated;

    // Lump sum: also use capital to fully capture match if not already there
    if (additionalAnnual > 0 && remainingCapital > 0) {
      const lumpNeeded = Math.min(additionalAnnual, remainingCapital);
      lumpSum.push({
        accountType: "traditional_401k_match",
        label: "401k — employer match contribution",
        amount: lumpNeeded,
        reason: `Ensures full employer match of ${fmt(annualMatch)}/year is captured`,
      });
      remainingCapital -= lumpNeeded;
    }
  }

  // ── Priority 2: HSA ─────────────────────────────────────────────────────
  if (hasHSAEligiblePlan) {
    const alreadyMonthly = existing.hsa;
    const alreadyAnnual = alreadyMonthly * 12;
    const capacityAnnual = Math.max(0, limitHSA - alreadyAnnual);
    const capacityMonthly = capacityAnnual / 12;
    const allocated = Math.min(capacityMonthly, remainingSurplus);

    if (capacityAnnual > 0) {
      buckets.push({
        priority: 2,
        accountType: "hsa",
        label: "HSA — Health Savings Account",
        monthlyAmount: alreadyMonthly + allocated,
        annualAmount: (alreadyMonthly + allocated) * 12,
        annualLimit: limitHSA,
        alreadyContributing: alreadyAnnual,
        additionalNeeded: capacityAnnual,
        remainingCapacity: capacityAnnual,
        isMaxed: alreadyAnnual >= limitHSA,
        taxTreatment: "Triple tax advantage: pre-tax contributions, tax-free growth, tax-free withdrawals for medical",
        whyThisOrder:
          `HSA has triple tax advantage — the only account that's pre-tax going in, grows tax-free, ` +
          `and comes out tax-free (for medical). After 65 it works like a Traditional IRA for any expense. ` +
          `2024 limit: ${fmt(limitHSA)}.`,
      });

      remainingSurplus -= allocated;

      if (capacityAnnual > 0 && remainingCapital > 0) {
        const lumpNeeded = Math.min(capacityAnnual, remainingCapital);
        lumpSum.push({
          accountType: "hsa",
          label: "HSA — max annual contribution",
          amount: lumpNeeded,
          reason: `HSA triple tax advantage — highest tax efficiency of any account`,
        });
        remainingCapital -= lumpNeeded;
      }
    }
  }

  // ── Priority 3: IRA (Roth or Traditional based on marginal rate) ─────────
  {
    const iraType: AccountType =
      iraDecision.type === "traditional" ? "traditional_ira"
      : iraDecision.type === "backdoor_roth" ? "backdoor_roth_ira"
      : "roth_ira";

    const alreadyMonthly =
      iraDecision.type === "traditional" ? existing.traditionalIRA : existing.rothIRA;
    const alreadyAnnual = alreadyMonthly * 12;
    const capacityAnnual = Math.max(0, limitIRA - alreadyAnnual);
    const capacityMonthly = capacityAnnual / 12;
    const allocated = Math.min(capacityMonthly, remainingSurplus);

    const iraLabel =
      iraDecision.type === "backdoor_roth" ? "Backdoor Roth IRA"
      : iraDecision.type === "traditional" ? "Traditional IRA"
      : "Roth IRA";

    if (capacityAnnual > 0) {
      buckets.push({
        priority: 3,
        accountType: iraType,
        label: iraLabel,
        monthlyAmount: alreadyMonthly + allocated,
        annualAmount: (alreadyMonthly + allocated) * 12,
        annualLimit: limitIRA,
        alreadyContributing: alreadyAnnual,
        additionalNeeded: capacityAnnual,
        remainingCapacity: capacityAnnual,
        isMaxed: alreadyAnnual >= limitIRA,
        taxTreatment:
          iraDecision.type === "traditional"
            ? "Pre-tax — reduces taxable income today, taxed on withdrawal"
            : "Post-tax — tax-free growth and tax-free withdrawal in retirement",
        whyThisOrder: iraDecision.reason,
      });

      remainingSurplus -= allocated;

      if (capacityAnnual > 0 && remainingCapital > 0) {
        const lumpNeeded = Math.min(capacityAnnual, remainingCapital);
        lumpSum.push({
          accountType: iraType,
          label: iraLabel,
          amount: lumpNeeded,
          reason: iraDecision.reason,
        });
        remainingCapital -= lumpNeeded;
      }
    }
  }

  // ── Priority 4: Remaining 401k (beyond match, up to annual limit) ────────
  if (has401k && remainingSurplus > 0) {
    const alreadyAnnual = existing.traditional401k * 12;
    // How much is already going toward the match contribution
    const matchContrib = input.employerMatch
      ? input.grossAnnualIncome * input.employerMatch.matchUpToPercent
      : 0;
    const totalAlreadyAnnual = Math.max(alreadyAnnual, matchContrib);
    const capacityAnnual = Math.max(0, limit401k - totalAlreadyAnnual);
    const capacityMonthly = capacityAnnual / 12;
    const allocated = Math.min(capacityMonthly, remainingSurplus);

    if (capacityAnnual > 0) {
      buckets.push({
        priority: 4,
        accountType: "traditional_401k_beyond",
        label: "401k — max beyond employer match",
        monthlyAmount: allocated,
        annualAmount: allocated * 12,
        annualLimit: limit401k,
        alreadyContributing: totalAlreadyAnnual,
        additionalNeeded: capacityAnnual,
        remainingCapacity: capacityAnnual,
        isMaxed: totalAlreadyAnnual >= limit401k,
        taxTreatment: "Pre-tax — reduces taxable income today",
        whyThisOrder:
          `After maxing the IRA, continue filling the 401k up to the ${fmt(limit401k)} annual limit. ` +
          `Still pre-tax, still reduces your taxable income by ${fmtPct(input.combinedMarginalRate)} on every dollar.`,
      });

      remainingSurplus -= allocated;

      if (capacityAnnual > 0 && remainingCapital > 0) {
        const lumpNeeded = Math.min(capacityAnnual, remainingCapital);
        lumpSum.push({
          accountType: "traditional_401k_beyond",
          label: "401k — beyond match",
          amount: lumpNeeded,
          reason: `Pre-tax at ${fmtPct(input.combinedMarginalRate)} combined marginal rate`,
        });
        remainingCapital -= lumpNeeded;
      }
    }
  }

  // ── Priority 5: Taxable brokerage — anything left ─────────────────────────
  if (remainingSurplus > 0 || remainingCapital > 0) {
    buckets.push({
      priority: 5,
      accountType: "taxable_brokerage",
      label: "Taxable brokerage",
      monthlyAmount: Math.max(0, remainingSurplus),
      annualAmount: Math.max(0, remainingSurplus) * 12,
      annualLimit: Infinity,
      alreadyContributing: 0,
      additionalNeeded: 0,
      remainingCapacity: Infinity,
      isMaxed: false,
      taxTreatment: "Post-tax contributions, capital gains taxed on withdrawal — use tax-efficient funds here",
      whyThisOrder:
        `All tax-advantaged space is filled. Taxable brokerage has no contribution limits. ` +
        `Use low-turnover index ETFs here to minimize annual tax drag.`,
    });

    if (remainingCapital > 0) {
      lumpSum.push({
        accountType: "taxable_brokerage",
        label: "Taxable brokerage",
        amount: remainingCapital,
        reason: "All tax-advantaged accounts fully funded — remainder goes to taxable brokerage",
      });
      remainingCapital = 0;
    }

    remainingSurplus = 0;
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalMonthlyContributions = buckets.reduce((s, b) => s + b.monthlyAmount, 0);
  const surplusAfterContributions = monthlySurplus - totalMonthlyContributions;
  const annualTaxAdvantaged = buckets
    .filter((b) => b.accountType !== "taxable_brokerage")
    .reduce((s, b) => s + b.annualAmount, 0);
  const annualTaxable = buckets
    .filter((b) => b.accountType === "taxable_brokerage")
    .reduce((s, b) => s + b.annualAmount, 0);

  const summary = buildSummary(
    buckets, totalMonthlyContributions, monthlySurplus,
    annualMatch, iraDecision, capitalToInvest, lumpSum
  );

  return {
    buckets,
    totalMonthlyContributions,
    surplusAfterContributions,
    lumpSumAllocation: lumpSum,
    capitalRemaining: remainingCapital,
    iraDecision,
    employerMatchAnnual: annualMatch,
    employerMatchCaptured: annualMatch > 0,
    annualTaxAdvantaged,
    annualTaxable,
    summary,
  };
}

// ── Summary ────────────────────────────────────────────────────────────────

function buildSummary(
  buckets: WaterfallBucket[],
  totalMonthly: number,
  surplus: number,
  employerMatch: number,
  iraDecision: IRADecision,
  capital: number,
  lumpSum: LumpSumAllocation[]
): string {
  const lines: string[] = [];

  lines.push(`Monthly surplus: ${fmt(surplus)}`);
  lines.push(`Allocated across ${buckets.length} account${buckets.length !== 1 ? "s" : ""}: ${fmt(totalMonthly)}/month`);

  if (employerMatch > 0) {
    lines.push(`Employer match captured: ${fmt(employerMatch)}/year in free contributions`);
  }

  lines.push(
    `IRA type: ${iraDecision.type === "backdoor_roth" ? "Backdoor Roth" : iraDecision.type === "traditional" ? "Traditional" : "Roth"} — ${iraDecision.reason}`
  );

  if (capital > 0) {
    const totalLump = lumpSum.reduce((s, l) => s + l.amount, 0);
    lines.push(`Lump sum of ${fmt(capital)}: ${lumpSum.map((l) => `${fmt(l.amount)} → ${l.label}`).join(", ")}`);
  }

  return lines.join(". ");
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(r: number): string {
  return `${(r * 100).toFixed(1)}%`;
}
