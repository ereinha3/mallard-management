import { z } from "zod";
import { lookupZip } from "./zipLookup";
import { calculateLocalTax, LocalTaxResult } from "./localTax";
import { lookupColi, ColiResult } from "./costOfLiving";
import { calculateTax, analyzeTaxSavings } from "../tax/calculator";
import { TaxInputSchema } from "../tax/types";
import { State } from "../tax/types";

export const LocationTaxInputSchema = TaxInputSchema.extend({
  zipCode: z.string().regex(/^\d{5}$/, "Must be a 5-digit ZIP code"),
  isResident: z.boolean().default(true), // resident vs non-resident for local tax
});
export type LocationTaxInput = z.infer<typeof LocationTaxInputSchema>;

export interface LocationTaxProfile {
  // Location info
  zip: string;
  city: string;
  state: State;
  metro: string;

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

  // Cost of living
  coli: {
    composite: number;
    housing: number;
    found: boolean;
    metro: string;
  };
  purchasingPowerEquivalent: number; // take-home normalized to national avg COL
  nationalEquivalentSalary: number;  // what gross salary in avg-COL city feels the same

  // Comparison-ready string
  summary: string;

  // Recommendations
  recommendations: {
    rothRecommended: boolean;
    rothReason: string;
    backdoorRothNeeded: boolean;
  };
}

export function buildLocationTaxProfile(input: LocationTaxInput): LocationTaxProfile {
  // 1. Zip lookup — override state if zip provides it
  const zipInfo = lookupZip(input.zipCode);
  const city = zipInfo?.city ?? "Unknown";
  const state = (zipInfo?.state ?? input.state) as State;

  // Use zip-derived state in tax calculation if available
  const taxInput = { ...input, state };
  const taxSummary = calculateTax(taxInput);
  const savings = analyzeTaxSavings(taxInput, taxSummary);

  // 2. Local income tax
  const localTax = calculateLocalTax(city, taxSummary.federal.taxableIncome, input.isResident);

  // 3. Total tax including local
  const totalAnnualTax = taxSummary.totalTax + localTax.localTaxAmount;
  const annualTakeHome = input.grossIncome - totalAnnualTax;
  const monthlyTakeHome = Math.round(annualTakeHome / 12);
  const totalEffectiveRate = input.grossIncome > 0 ? totalAnnualTax / input.grossIncome : 0;

  // 4. Cost of living
  const coli = lookupColi(city);
  const purchasingPowerEquivalent = coli.purchasingPowerEquivalent(annualTakeHome);
  const nationalEquivalentSalary = coli.nationalEquivalent(input.grossIncome);

  // 5. Human-readable summary
  const summary = buildSummary({
    city,
    state,
    grossIncome: input.grossIncome,
    annualTakeHome,
    totalEffectiveRate,
    coli: coli.composite,
    purchasingPowerEquivalent,
    nationalEquivalentSalary,
    localTaxRate: localTax.localTaxRate,
  });

  return {
    zip: input.zipCode,
    city,
    state,
    metro: coli.metro,
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
    coli: {
      composite: coli.composite,
      housing: coli.housing,
      found: coli.found,
      metro: coli.metro,
    },
    purchasingPowerEquivalent,
    nationalEquivalentSalary,
    summary,
    recommendations: {
      rothRecommended: savings.rothRecommended,
      rothReason: savings.rothReason,
      backdoorRothNeeded: savings.backdoorRothNeeded,
    },
  };
}

function buildSummary(p: {
  city: string;
  state: string;
  grossIncome: number;
  annualTakeHome: number;
  totalEffectiveRate: number;
  coli: number;
  purchasingPowerEquivalent: number;
  nationalEquivalentSalary: number;
  localTaxRate: number;
}): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

  const localNote =
    p.localTaxRate > 0
      ? ` plus a ${pct(p.localTaxRate)} ${p.city} local income tax`
      : "";

  const colNote =
    p.coli !== 100
      ? ` Cost of living in ${p.city} is ${p.coli > 100 ? p.coli - 100 : 100 - p.coli}% ${p.coli > 100 ? "above" : "below"} the national average (index: ${p.coli}). Your ${fmt(p.annualTakeHome)} take-home has the purchasing power of ${fmt(p.purchasingPowerEquivalent)} in an average-cost city.`
      : "";

  return (
    `On a ${fmt(p.grossIncome)} gross salary in ${p.city}, ${p.state}, your total effective tax rate is ${pct(p.totalEffectiveRate)}${localNote}. ` +
    `After all taxes, you take home ${fmt(p.annualTakeHome)}/year (${fmt(Math.round(p.annualTakeHome / 12))}/month).` +
    colNote
  );
}
