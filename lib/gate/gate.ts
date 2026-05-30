import {
  GateInput,
  GateResult,
  GateVerdict,
  HaltReason,
  EmergencyFundCheck,
  SurplusCheck,
  CapitalAllocation,
} from "./types";
import { analyzeDebt } from "./debtAnalysis";

const EMERGENCY_FUND_MONTHS = 3;   // minimum before investing
const HIGH_RATE_THRESHOLD = 0.08;  // debts above this always block investing

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtPct = (r: number) => `${(r * 100).toFixed(2)}%`;

// ── Gate checks ────────────────────────────────────────────────────────────

function checkSurplus(input: GateInput): SurplusCheck {
  const monthlyMinDebt = input.debts.reduce((s, d) => s + d.minimumPayment, 0);
  const monthlySurplus = input.monthlyGrossIncome - input.monthlyExpenses - monthlyMinDebt;
  return {
    passed: monthlySurplus >= 0,
    monthlySurplus,
    monthlyMinDebtPayments: monthlyMinDebt,
  };
}

function checkEmergencyFund(input: GateInput, surplus: SurplusCheck): EmergencyFundCheck {
  const targetSavings = input.monthlyExpenses * EMERGENCY_FUND_MONTHS;
  const monthsCovered = targetSavings > 0
    ? input.liquidSavings / input.monthlyExpenses
    : EMERGENCY_FUND_MONTHS; // no expenses → technically fine
  const shortfall = Math.max(0, targetSavings - input.liquidSavings);
  const monthsToTarget =
    shortfall > 0 && surplus.monthlySurplus > 0
      ? Math.ceil(shortfall / surplus.monthlySurplus)
      : null;

  return {
    passed: monthsCovered >= EMERGENCY_FUND_MONTHS,
    monthsCovered: parseFloat(monthsCovered.toFixed(1)),
    targetMonths: EMERGENCY_FUND_MONTHS,
    currentSavings: input.liquidSavings,
    targetSavings,
    shortfall,
    monthsToTarget,
  };
}

// ── Capital allocation ─────────────────────────────────────────────────────

function allocateCapital(
  input: GateInput,
  emergencyFund: EmergencyFundCheck,
  blockingDebts: ReturnType<typeof analyzeDebt>[]
): CapitalAllocation {
  let remaining = input.capitalToInvest;
  let toEmergencyFund = 0;
  let toDebtPayoff = 0;
  let toInvesting = 0;
  const notes: string[] = [];

  // 1. Fill emergency fund first
  if (!emergencyFund.passed && emergencyFund.shortfall > 0) {
    toEmergencyFund = Math.min(remaining, emergencyFund.shortfall);
    remaining -= toEmergencyFund;
    notes.push(`${fmt(toEmergencyFund)} → emergency fund (${EMERGENCY_FUND_MONTHS}-month target)`);
  }

  // 2. Highest-rate blocking debt next (avalanche order)
  const sortedBlocking = [...blockingDebts].sort((a, b) => b.effectiveApr - a.effectiveApr);
  for (const debt of sortedBlocking) {
    if (remaining <= 0) break;
    const payoff = Math.min(remaining, debt.balance);
    toDebtPayoff += payoff;
    remaining -= payoff;
    notes.push(`${fmt(payoff)} → ${debt.label} (${fmtPct(debt.effectiveApr)} effective rate)`);
  }

  // 3. Whatever's left can be invested
  toInvesting = remaining;
  if (toInvesting > 0) {
    notes.push(`${fmt(toInvesting)} → available to invest`);
  }

  return {
    toEmergencyFund,
    toDebtPayoff,
    toInvesting,
    rationale: notes.join(" · "),
  };
}

// ── Main gate function ─────────────────────────────────────────────────────

export function runResponsibilityGate(input: GateInput): GateResult {
  // After-tax expected market return: nominal return minus cap gains tax on gains
  // Assumption: 60% of return is realized as LTCG each year (realistic for index funds)
  const taxDragOnGains = input.ltcgRate * 0.6;
  const afterTaxMarketReturn = input.expectedMarketReturn * (1 - taxDragOnGains);

  // Analyze all debts
  const debtAnalyses = input.debts.map((d) =>
    analyzeDebt(d, input.combinedMarginalRate, afterTaxMarketReturn)
  );

  const blockingDebts = debtAnalyses.filter((d) => d.recommendation === "pay_first");
  const allowedDebts = debtAnalyses.filter((d) => d.recommendation !== "pay_first");

  // Run ordered checks
  const surplusCheck = checkSurplus(input);
  const emergencyFund = checkEmergencyFund(input, surplusCheck);
  const capital = allocateCapital(input, emergencyFund, blockingDebts);

  // Determine verdict — halt on first failed check
  let verdict: GateVerdict = "clear";
  let haltReason: HaltReason | null = null;

  if (!surplusCheck.passed) {
    verdict = "halt";
    haltReason = "negative_surplus";
  } else if (!emergencyFund.passed) {
    verdict = "halt";
    haltReason = "no_emergency_fund";
  } else if (blockingDebts.length > 0) {
    verdict = "halt";
    haltReason = "high_interest_debt";
  } else if (allowedDebts.some((d) => d.recommendation === "pay_alongside")) {
    verdict = "caution";
  }

  const clearToProceed = verdict === "clear";

  // Build human-readable output
  const { headline, explanation, actionItems } = buildNarrative(
    verdict,
    haltReason,
    surplusCheck,
    emergencyFund,
    blockingDebts,
    allowedDebts,
    capital,
    afterTaxMarketReturn,
    input
  );

  return {
    verdict,
    haltReason,
    clearToProceed,
    surplusCheck,
    emergencyFund,
    debts: debtAnalyses,
    blockingDebts,
    allowedDebts,
    capitalAllocation: capital,
    afterTaxMarketReturn,
    expectedMarketReturn: input.expectedMarketReturn,
    headline,
    explanation,
    actionItems,
  };
}

// ── Narrative builder ──────────────────────────────────────────────────────

function buildNarrative(
  verdict: GateVerdict,
  haltReason: HaltReason | null,
  surplus: SurplusCheck,
  emergency: EmergencyFundCheck,
  blocking: ReturnType<typeof analyzeDebt>[],
  allowed: ReturnType<typeof analyzeDebt>[],
  capital: CapitalAllocation,
  afterTaxMarketReturn: number,
  input: GateInput
): { headline: string; explanation: string; actionItems: string[] } {
  const actions: string[] = [];

  if (haltReason === "negative_surplus") {
    const deficit = Math.abs(surplus.monthlySurplus);
    return {
      headline: "🔴 Not ready to invest — you're spending more than you earn",
      explanation:
        `After income, expenses, and minimum debt payments, you're ${fmt(deficit)}/month in the hole. ` +
        `There's nothing to invest with until that gap is closed. Cut expenses or increase income first.`,
      actionItems: [
        `Close the ${fmt(deficit)}/month deficit before anything else`,
        "Review fixed expenses — housing, subscriptions, insurance",
        "Minimum debt payments are non-negotiable — focus on discretionary spending",
      ],
    };
  }

  if (haltReason === "no_emergency_fund") {
    actions.push(
      `Build ${fmt(emergency.shortfall)} more in liquid savings to hit your ${EMERGENCY_FUND_MONTHS}-month target (${fmt(emergency.targetSavings)} total)`
    );
    if (emergency.monthsToTarget) {
      actions.push(
        `At your ${fmt(surplus.monthlySurplus)}/month surplus, you'll reach it in ${emergency.monthsToTarget} months`
      );
    }
    if (capital.toEmergencyFund > 0) {
      actions.push(`Put ${fmt(capital.toEmergencyFund)} of your capital toward the emergency fund now`);
    }
    actions.push("Once funded, re-run Greenlight to proceed to investing");

    return {
      headline: `🔴 Not ready to invest — you only have ${emergency.monthsCovered} months of expenses saved`,
      explanation:
        `You have ${fmt(emergency.currentSavings)} in savings but need ${fmt(emergency.targetSavings)} ` +
        `(${EMERGENCY_FUND_MONTHS} months × ${fmt(input.monthlyExpenses)}/month). ` +
        `Investing without a safety net means you'd have to sell positions — potentially at a loss — ` +
        `the moment an emergency hits. Build the cushion first.`,
      actionItems: actions,
    };
  }

  if (haltReason === "high_interest_debt") {
    const worstDebt = blocking[0];
    actions.push(
      ...blocking.map(
        (d) =>
          `Pay off ${d.label}: ${fmtPct(d.effectiveApr)} guaranteed return vs ${fmtPct(afterTaxMarketReturn)} from market — ${fmtPct(d.spreadVsMarket)} better`
      )
    );
    if (capital.toDebtPayoff > 0) {
      actions.push(`Apply ${fmt(capital.toDebtPayoff)} of your capital to eliminate blocking debt now`);
    }
    actions.push("Re-run Greenlight after paying off high-rate debt");

    return {
      headline: `🔴 Not ready to invest — high-interest debt cancels out any market gains`,
      explanation:
        `You have ${blocking.length} debt${blocking.length > 1 ? "s" : ""} costing more than the market is expected to return. ` +
        `The market's expected after-tax return is ${fmtPct(afterTaxMarketReturn)}. ` +
        `Your ${worstDebt.label} costs ${fmtPct(worstDebt.effectiveApr)} — paying it off is a ` +
        `guaranteed ${fmtPct(worstDebt.spreadVsMarket)} better return than investing right now.`,
      actionItems: actions,
    };
  }

  if (verdict === "caution") {
    const cautiousDebts = allowed.filter((d) => d.recommendation === "pay_alongside");
    actions.push(
      `Split surplus between investing and paying down: ${cautiousDebts.map((d) => d.label).join(", ")}`
    );
    actions.push("Prioritize tax-advantaged accounts first (401k to match, HSA, IRA)");
    if (capital.toInvesting > 0) {
      actions.push(`${fmt(capital.toInvesting)} of your capital is cleared to invest`);
    }

    return {
      headline: "🟡 Greenlight with caution — some moderate-rate debt worth watching",
      explanation:
        `You're cleared to invest, but you have debt in the ${fmtPct(afterTaxMarketReturn - 0.01)}–${fmtPct(afterTaxMarketReturn + 0.01)} range ` +
        `where paydown and investing have similar expected returns. Split your surplus between both.`,
      actionItems: actions,
    };
  }

  // Full clear
  if (capital.toInvesting > 0) {
    actions.push(`${fmt(capital.toInvesting)} cleared for investing`);
  }
  if (allowed.length > 0) {
    actions.push(`Continue minimum payments on: ${allowed.map((d) => d.label).join(", ")}`);
  }

  return {
    headline: "🟢 Greenlight — you're ready to invest",
    explanation:
      `Emergency fund is solid (${emergency.monthsCovered} months covered). ` +
      `${input.debts.length === 0 ? "No debt. " : "All debt is below the paydown-vs-invest threshold. "}` +
      `${fmt(surplus.monthlySurplus)}/month surplus and ${fmt(capital.toInvesting)} in capital are cleared.`,
    actionItems: actions,
  };
}
