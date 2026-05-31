import { z } from "zod";
import { lookupZip } from "./zipLookup";
import { calculateLocalTax, LocalTaxResult } from "./localTax";
import { calculateTax } from "../tax/calculator";
import { TaxInputSchema } from "../tax/types";
import { State } from "../tax/types";

export const LocationTaxInputSchema = TaxInputSchema.extend({
  zipCode: z.string().regex(/^\d{5}$/, "Must be a 5-digit ZIP code"),
  isResident: z.boolean().default(true),
  monthlyExpenses: z.number().nonnegative().default(0),
});
export type LocationTaxInput = z.infer<typeof LocationTaxInputSchema>;

export interface LocationTaxProfile {
  // Location
  zip: string;
  city: string;
  state: State;

  // Tax breakdown — what you owe, line by line
  federal: {
    annualTax: number;
    monthlyTax: number;
    effectiveRate: number;
    marginalRate: number;
  };
  stateTax: {
    annualTax: number;
    monthlyTax: number;
    effectiveRate: number;
    marginalRate: number;
  };
  localTax: LocalTaxResult;
  fica: {
    socialSecurity: number;
    medicare: number;
    additionalMedicare: number;
    annualTax: number;
    monthlyTax: number;
    effectiveRate: number;
  };

  // What you actually keep
  totalAnnualTax: number;
  totalMonthlyTax: number;
  totalEffectiveRate: number;
  annualTakeHome: number;
  monthlyTakeHome: number;

  // Cash flow after expenses
  monthlyExpenses: number;
  monthlySurplus: number;
  annualSurplus: number;

  // Key rates — passed downstream to gate and optimizer
  combinedMarginalRate: number;
  federalMarginalRate: number;

  // Plain-English receipt
  summary: string;
}

export function buildLocationTaxProfile(input: LocationTaxInput): LocationTaxProfile {
  // 1. Zip → city/state
  const zipInfo = lookupZip(input.zipCode);
  const city = zipInfo?.city ?? "Unknown";
  const state = (zipInfo?.state ?? input.state) as State;

  // 2. Tax calculation
  const taxInput = { ...input, state };
  const taxSummary = calculateTax(taxInput);

  // 3. Local income tax
  const localTax = calculateLocalTax(city, taxSummary.federal.taxableIncome, input.isResident);

  // 4. Totals
  const totalAnnualTax = taxSummary.totalTax + localTax.localTaxAmount;
  const totalMonthlyTax = Math.round(totalAnnualTax / 12);
  const annualTakeHome = input.grossIncome - totalAnnualTax;
  const monthlyTakeHome = Math.round(annualTakeHome / 12);
  const totalEffectiveRate = input.grossIncome > 0 ? totalAnnualTax / input.grossIncome : 0;

  // 5. Cash flow
  const monthlySurplus = monthlyTakeHome - input.monthlyExpenses;
  const annualSurplus = monthlySurplus * 12;

  const summary = buildSummary({
    city, state,
    grossIncome: input.grossIncome,
    annualTakeHome, monthlyTakeHome,
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
      monthlyTax: Math.round(taxSummary.federal.regularTax / 12),
      effectiveRate: taxSummary.federal.effectiveRate,
      marginalRate: taxSummary.federal.marginalRate,
    },
    stateTax: {
      annualTax: taxSummary.state.stateTax,
      monthlyTax: Math.round(taxSummary.state.stateTax / 12),
      effectiveRate: taxSummary.state.effectiveRate,
      marginalRate: taxSummary.state.marginalRate,
    },
    localTax,
    fica: {
      socialSecurity: taxSummary.fica.socialSecurityTax,
      medicare: taxSummary.fica.medicareTax,
      additionalMedicare: taxSummary.fica.additionalMedicareTax,
      annualTax: taxSummary.fica.totalFICA,
      monthlyTax: Math.round(taxSummary.fica.totalFICA / 12),
      effectiveRate: taxSummary.fica.effectiveRate,
    },
    totalAnnualTax,
    totalMonthlyTax,
    totalEffectiveRate,
    annualTakeHome,
    monthlyTakeHome,
    monthlyExpenses: input.monthlyExpenses,
    monthlySurplus,
    annualSurplus,
    combinedMarginalRate: taxSummary.combinedMarginalRate,
    federalMarginalRate: taxSummary.federalMarginalRate,
    summary,
  };
}

function buildSummary(p: {
  city: string; state: string;
  grossIncome: number; annualTakeHome: number; monthlyTakeHome: number;
  totalEffectiveRate: number; localTaxRate: number;
  monthlyExpenses: number; monthlySurplus: number;
}): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

  const localNote = p.localTaxRate > 0 ? ` plus ${pct(p.localTaxRate)} ${p.city} local income tax` : "";
  const surplusNote = p.monthlyExpenses > 0
    ? ` After ${fmt(p.monthlyExpenses)}/month in expenses, you have ${fmt(p.monthlySurplus)}/month ${p.monthlySurplus >= 0 ? "remaining" : "shortfall"}.`
    : "";

  return (
    `On a ${fmt(p.grossIncome)} salary in ${p.city}, ${p.state}, your effective tax rate is ${pct(p.totalEffectiveRate)}${localNote}. ` +
    `Take-home: ${fmt(p.annualTakeHome)}/year (${fmt(p.monthlyTakeHome)}/month).` +
    surplusNote
  );
}
