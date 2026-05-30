import { z } from "zod";
import { lookupZip } from "./zipLookup";
import { calculateLocalTax, LocalTaxResult } from "./localTax";
import { calculateTax, analyzeTaxSavings } from "../tax/calculator";
import { TaxInputSchema } from "../tax/types";
import { State } from "../tax/types";

export const LocationTaxInputSchema = TaxInputSchema.extend({
  zipCode: z.string().regex(/^\d{5}$/, "Must be a 5-digit ZIP code"),
  isResident: z.boolean().default(true),
  monthlyExpenses: z.number().nonnegative().default(0), // user-input actual expenses
});
export type LocationTaxInput = z.infer<typeof LocationTaxInputSchema>;

export interface LocationTaxProfile {
  // Location
  zip: string;
  city: string;
  state: State;

  // Tax breakdown
  federal: {
    annualTax: number;
    effectiveRate: number;
    marginalRate: number;
  };
  stateTax: {
    annualTax: number;
    effectiveRate: number;
    marginalRate: number;
  };
  localTax: LocalTaxResult;
  fica: {
    annualTax: number;
    effectiveRate: number;
  };

  // Totals
  totalAnnualTax: number;
  totalEffectiveRate: number;
  annualTakeHome: number;
  monthlyTakeHome: number;

  // Cash flow — take-home minus what they actually spend
  monthlyExpenses: number;
  monthlySurplus: number;   // what's left after taxes AND expenses
  annualSurplus: number;

  // Recommendations
  combinedMarginalRate: number;
  recommendations: {
    rothRecommended: boolean;
    rothReason: string;
    backdoorRothNeeded: boolean;
  };

  summary: string;
}

export function buildLocationTaxProfile(input: LocationTaxInput): LocationTaxProfile {
  // 1. Zip → city/state
  const zipInfo = lookupZip(input.zipCode);
  const city = zipInfo?.city ?? "Unknown";
  const state = (zipInfo?.state ?? input.state) as State;

  // 2. Tax calculation (state derived from zip)
  const taxInput = { ...input, state };
  const taxSummary = calculateTax(taxInput);
  const savings = analyzeTaxSavings(taxInput, taxSummary);

  // 3. Local income tax
  const localTax = calculateLocalTax(city, taxSummary.federal.taxableIncome, input.isResident);

  // 4. Totals
  const totalAnnualTax = taxSummary.totalTax + localTax.localTaxAmount;
  const annualTakeHome = input.grossIncome - totalAnnualTax;
  const monthlyTakeHome = Math.round(annualTakeHome / 12);
  const totalEffectiveRate = input.grossIncome > 0 ? totalAnnualTax / input.grossIncome : 0;

  // 5. Real cash flow using actual user expenses
  const monthlySurplus = monthlyTakeHome - input.monthlyExpenses;
  const annualSurplus = monthlySurplus * 12;

  const summary = buildSummary({
    city,
    state,
    grossIncome: input.grossIncome,
    annualTakeHome,
    monthlyTakeHome,
    totalEffectiveRate,
    localTaxRate: localTax.localTaxRate,
    monthlyExpenses: input.monthlyExpenses,
    monthlySurplus,
  });

  return {
    zip: input.zipCode,
    city,
    state,
    federal: {
      annualTax: taxSummary.federal.regularTax,
      effectiveRate: taxSummary.federal.effectiveRate,
      marginalRate: taxSummary.federal.marginalRate,
    },
    stateTax: {
      annualTax: taxSummary.state.stateTax,
      effectiveRate: taxSummary.state.effectiveRate,
      marginalRate: taxSummary.state.marginalRate,
    },
    localTax,
    fica: {
      annualTax: taxSummary.fica.totalFICA,
      effectiveRate: taxSummary.fica.effectiveRate,
    },
    totalAnnualTax,
    totalEffectiveRate,
    annualTakeHome,
    monthlyTakeHome,
    monthlyExpenses: input.monthlyExpenses,
    monthlySurplus,
    annualSurplus,
    combinedMarginalRate: taxSummary.combinedMarginalRate,
    recommendations: {
      rothRecommended: savings.rothRecommended,
      rothReason: savings.rothReason,
      backdoorRothNeeded: savings.backdoorRothNeeded,
    },
    summary,
  };
}

function buildSummary(p: {
  city: string;
  state: string;
  grossIncome: number;
  annualTakeHome: number;
  monthlyTakeHome: number;
  totalEffectiveRate: number;
  localTaxRate: number;
  monthlyExpenses: number;
  monthlySurplus: number;
}): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

  const localNote = p.localTaxRate > 0
    ? ` plus ${pct(p.localTaxRate)} ${p.city} local income tax`
    : "";

  const surplusNote = p.monthlyExpenses > 0
    ? ` After your ${fmt(p.monthlyExpenses)}/month in expenses, you have ${fmt(p.monthlySurplus)}/month ${p.monthlySurplus >= 0 ? "left to save or invest" : "shortfall"}.`
    : "";

  return (
    `On a ${fmt(p.grossIncome)} salary in ${p.city}, ${p.state}, your effective tax rate is ${pct(p.totalEffectiveRate)}${localNote}. ` +
    `Take-home: ${fmt(p.annualTakeHome)}/year (${fmt(p.monthlyTakeHome)}/month).` +
    surplusNote
  );
}
