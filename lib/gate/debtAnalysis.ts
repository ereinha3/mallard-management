import { DebtInput, DebtAnalysis } from "./types";

// Which debt types benefit from a tax deduction on interest
const DEDUCTIBLE_TYPES = new Set(["student_loan", "mortgage"]);

/**
 * Compute the true after-tax cost of a debt.
 * Deductible debt (mortgage, student loan) reduces taxable income,
 * so the real cost is lower than the face APR.
 */
export function effectiveApr(debt: DebtInput, marginalRate: number): number {
  if (DEDUCTIBLE_TYPES.has(debt.type)) {
    return debt.apr * (1 - marginalRate);
  }
  return debt.apr;
}

/**
 * Month-by-month payoff simulation.
 * Returns months to zero balance and total interest paid.
 */
export function simulatePayoff(
  balance: number,
  apr: number,
  monthlyPayment: number
): { months: number; totalInterest: number } {
  const monthlyRate = apr / 12;

  // If payment doesn't cover monthly interest, debt never paid off
  const monthlyInterest = balance * monthlyRate;
  if (monthlyPayment <= monthlyInterest && monthlyInterest > 0) {
    return { months: Infinity, totalInterest: Infinity };
  }

  if (monthlyRate === 0) {
    const months = Math.ceil(balance / monthlyPayment);
    return { months, totalInterest: 0 };
  }

  // Standard amortization: n = -log(1 - i*B/P) / log(1+i)
  const n = -Math.log(1 - (monthlyRate * balance) / monthlyPayment) / Math.log(1 + monthlyRate);
  const months = Math.ceil(n);
  const totalPaid = monthlyPayment * months;
  const totalInterest = totalPaid - balance;

  return { months, totalInterest: Math.max(0, totalInterest) };
}

/**
 * Full analysis of a single debt against the after-tax market return.
 */
export function analyzeDebt(
  debt: DebtInput,
  combinedMarginalRate: number,
  afterTaxMarketReturn: number
): DebtAnalysis {
  const isDeductible = DEDUCTIBLE_TYPES.has(debt.type);
  const effApr = effectiveApr(debt, combinedMarginalRate);
  const monthlyPayment = debt.minimumPayment + debt.extraPayment;
  const { months, totalInterest } = simulatePayoff(debt.balance, debt.apr, monthlyPayment);
  const spread = effApr - afterTaxMarketReturn;

  // Decision thresholds:
  // effectiveApr > afterTaxMarketReturn + 1%  → pay first (clear winner)
  // effectiveApr > afterTaxMarketReturn - 1%  → caution, pay alongside
  // effectiveApr <= afterTaxMarketReturn - 1% → minimum only, invest the rest
  let recommendation: DebtAnalysis["recommendation"];
  let rationale: string;

  const fmt = (r: number) => `${(r * 100).toFixed(2)}%`;
  const fmtDollar = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  if (effApr > afterTaxMarketReturn + 0.01) {
    recommendation = "pay_first";
    rationale =
      `Your ${debt.label} costs ${fmt(effApr)} after tax${isDeductible ? ` (${fmt(debt.apr)} face rate, deductible)` : ""}. ` +
      `Paying it off is a guaranteed ${fmt(effApr)} return. ` +
      `The market is expected to return ${fmt(afterTaxMarketReturn)} after tax. ` +
      `Paying this debt beats investing by ${fmt(spread)} — allocate extra cash here first.`;
  } else if (effApr > afterTaxMarketReturn - 0.01) {
    recommendation = "pay_alongside";
    rationale =
      `Your ${debt.label} at ${fmt(effApr)} effective rate is close to the expected after-tax market ` +
      `return of ${fmt(afterTaxMarketReturn)}. Split extra cash between paydown and investing.`;
  } else {
    recommendation = "minimum_only";
    rationale =
      `Your ${debt.label} at ${fmt(effApr)} effective rate is below the expected after-tax market ` +
      `return of ${fmt(afterTaxMarketReturn)}. Make minimum payments and invest the rest.`;
  }

  if (months !== Infinity) {
    rationale += ` At current payments, this debt is paid off in ${months} months with ${fmtDollar(totalInterest)} in total interest.`;
  }

  return {
    id: debt.id,
    label: debt.label,
    type: debt.type,
    balance: debt.balance,
    apr: debt.apr,
    effectiveApr: effApr,
    isDeductible,
    monthlyPayment,
    minimumPayment: debt.minimumPayment,
    monthsToPayoff: months,
    totalInterestRemaining: totalInterest,
    afterTaxMarketReturn,
    spreadVsMarket: spread,
    recommendation,
    rationale,
  };
}
