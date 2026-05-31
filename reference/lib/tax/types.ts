import { z } from "zod";

export const FilingStatusSchema = z.enum([
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household",
]);
export type FilingStatus = z.infer<typeof FilingStatusSchema>;

export const StateSchema = z.enum([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
]);
export type State = z.infer<typeof StateSchema>;

export const TaxInputSchema = z.object({
  grossIncome: z.number().nonnegative(),
  filingStatus: FilingStatusSchema,
  state: StateSchema,
  age: z.number().int().min(0).max(120),

  // Above-the-line deductions
  traditional401kContributions: z.number().nonnegative().default(0),
  hsaContributions: z.number().nonnegative().default(0),
  studentLoanInterestPaid: z.number().nonnegative().default(0),

  // Itemized deduction inputs (optional — we compare to standard)
  mortgageInterestPaid: z.number().nonnegative().default(0),
  charitableContributions: z.number().nonnegative().default(0),
  stateAndLocalTaxesPaid: z.number().nonnegative().default(0), // SALT (capped at $10k)

  // Investment income (for NIIT / LTCG calc)
  shortTermCapitalGains: z.number().default(0),
  longTermCapitalGains: z.number().default(0),
  qualifiedDividends: z.number().nonnegative().default(0),
  ordinaryDividends: z.number().nonnegative().default(0),

  // Self-employment flag — changes FICA math
  isSelfEmployed: z.boolean().default(false),
});

export type TaxInput = z.infer<typeof TaxInputSchema>;

export interface BracketResult {
  rate: number;
  taxableInThisBracket: number;
  taxFromBracket: number;
}

export interface FederalTaxResult {
  grossIncome: number;
  adjustedGrossIncome: number;
  deductionType: "standard" | "itemized";
  deductionAmount: number;
  taxableIncome: number;
  regularTax: number;
  bracketBreakdown: BracketResult[];
  effectiveRate: number;
  marginalRate: number;
}

export interface FICAResult {
  socialSecurityTax: number;
  medicareTax: number;
  additionalMedicareTax: number;
  totalFICA: number;
  effectiveRate: number;
}

export interface StateTaxResult {
  state: State;
  taxableIncome: number;
  stateTax: number;
  effectiveRate: number;
  marginalRate: number;
}

export interface CapitalGainsTaxResult {
  shortTermGainsTax: number; // taxed as ordinary income (already in federal calc)
  longTermGainsTax: number;
  qualifiedDividendsTax: number;
  niit: number; // Net Investment Income Tax (3.8%)
  ltcgRate: number; // 0, 0.15, or 0.20
  totalCapitalGainsTax: number;
}

export interface TaxSummary {
  input: TaxInput;
  federal: FederalTaxResult;
  fica: FICAResult;
  state: StateTaxResult;
  capitalGains: CapitalGainsTaxResult;
  totalTax: number;
  effectiveTotalRate: number;
  federalMarginalRate: number;
  combinedMarginalRate: number; // federal + state (used for optimization decisions)
  takeHomePay: number;
}
