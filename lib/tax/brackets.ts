import { Bracket } from "./constants";
import { BracketResult as TaxBracketResult } from "./types";

/**
 * Apply a bracket table to a taxable income figure.
 * Returns total tax and a per-bracket breakdown.
 */
export function applyBrackets(
  taxableIncome: number,
  brackets: Bracket[]
): { tax: number; breakdown: TaxBracketResult[]; marginalRate: number } {
  if (taxableIncome <= 0) return { tax: 0, breakdown: [], marginalRate: brackets[0]?.rate ?? 0 };

  let tax = 0;
  const breakdown: TaxBracketResult[] = [];

  for (let i = 0; i < brackets.length; i++) {
    const bracket = brackets[i];
    const nextMin = brackets[i + 1]?.min ?? Infinity;
    const bracketMin = bracket.min;

    if (taxableIncome <= bracketMin) break;

    const taxableInThisBracket = Math.min(taxableIncome, nextMin) - bracketMin;
    const taxFromBracket = taxableInThisBracket * bracket.rate;

    tax += taxFromBracket;
    breakdown.push({
      rate: bracket.rate,
      taxableInThisBracket,
      taxFromBracket,
    });
  }

  // Marginal rate: the rate of the highest bracket reached
  const marginalRate = brackets
    .slice()
    .reverse()
    .find((b) => taxableIncome > b.min)?.rate ?? brackets[0].rate;

  return { tax, breakdown, marginalRate };
}
