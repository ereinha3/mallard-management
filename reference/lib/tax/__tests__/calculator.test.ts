import { calculateTax, analyzeTaxSavings } from "../calculator";
import { TaxInput } from "../types";

const base: TaxInput = {
  grossIncome: 100_000,
  filingStatus: "single",
  state: "CA",
  age: 35,
  traditional401kContributions: 0,
  hsaContributions: 0,
  studentLoanInterestPaid: 0,
  mortgageInterestPaid: 0,
  charitableContributions: 0,
  stateAndLocalTaxesPaid: 0,
  shortTermCapitalGains: 0,
  longTermCapitalGains: 0,
  qualifiedDividends: 0,
  ordinaryDividends: 0,
  isSelfEmployed: false,
};

describe("calculateTax", () => {
  it("single filer $100k CA — sanity checks", () => {
    const result = calculateTax(base);

    // AGI = gross (no above-the-line deductions)
    expect(result.federal.adjustedGrossIncome).toBe(100_000);

    // Standard deduction single 2024
    expect(result.federal.deductionType).toBe("standard");
    expect(result.federal.deductionAmount).toBe(14_600);

    // Taxable income
    expect(result.federal.taxableIncome).toBe(85_400);

    // Federal tax: manual calc
    // 10% on $11,600 = $1,160
    // 12% on ($47,150 - $11,600) = $4,266
    // 22% on ($85,400 - $47,150) = $8,415
    const expectedFederal = 1_160 + 4_266 + 8_415;
    expect(result.federal.regularTax).toBeCloseTo(expectedFederal, 0);

    // Marginal rate should be 22%
    expect(result.federal.marginalRate).toBe(0.22);

    // FICA: SS on full $100k, Medicare on full
    expect(result.fica.socialSecurityTax).toBeCloseTo(100_000 * 0.062, 2);
    expect(result.fica.medicareTax).toBeCloseTo(100_000 * 0.0145, 2);
    expect(result.fica.additionalMedicareTax).toBe(0); // under $200k

    // State tax (CA) should be positive
    expect(result.state.stateTax).toBeGreaterThan(0);

    // Take-home should be less than gross
    expect(result.takeHomePay).toBeLessThan(100_000);
    expect(result.takeHomePay).toBeGreaterThan(0);
  });

  it("no-income-tax state (TX) — state tax is zero", () => {
    const result = calculateTax({ ...base, state: "TX" });
    expect(result.state.stateTax).toBe(0);
  });

  it("401k contributions reduce AGI", () => {
    const result = calculateTax({ ...base, traditional401kContributions: 10_000 });
    expect(result.federal.adjustedGrossIncome).toBe(90_000);
  });

  it("above-$200k single — additional Medicare tax applies", () => {
    const result = calculateTax({ ...base, grossIncome: 250_000 });
    expect(result.fica.additionalMedicareTax).toBeCloseTo((250_000 - 200_000) * 0.009, 2);
  });

  it("LTCG at low income gets 0% rate", () => {
    const result = calculateTax({
      ...base,
      grossIncome: 30_000,
      longTermCapitalGains: 5_000,
    });
    // $30k ordinary + $5k LTCG — all under $47,025 LTCG threshold
    expect(result.capitalGains.ltcgRate).toBe(0);
  });

  it("itemized deduction used when larger than standard", () => {
    const result = calculateTax({
      ...base,
      mortgageInterestPaid: 20_000,
      stateAndLocalTaxesPaid: 15_000, // capped at $10k
      charitableContributions: 3_000,
    });
    // Itemized: $10k SALT + $20k mortgage + $3k charity = $33k > $14,600 standard
    expect(result.federal.deductionType).toBe("itemized");
    expect(result.federal.deductionAmount).toBe(33_000);
  });

  it("analyzeTaxSavings — Roth recommended at low rate", () => {
    const result = calculateTax({ ...base, grossIncome: 50_000 });
    const savings = analyzeTaxSavings({ ...base, grossIncome: 50_000 }, result);
    expect(savings.rothRecommended).toBe(true);
  });

  it("analyzeTaxSavings — Traditional recommended at high rate", () => {
    const result = calculateTax({ ...base, grossIncome: 500_000, state: "CA" });
    const savings = analyzeTaxSavings({ ...base, grossIncome: 500_000, state: "CA" }, result);
    expect(savings.rothRecommended).toBe(false);
    expect(savings.backdoorRothNeeded).toBe(true);
  });

  it("Oregon adds Roth note to reason", () => {
    const result = calculateTax({ ...base, state: "OR" });
    const savings = analyzeTaxSavings({ ...base, state: "OR" }, result);
    expect(savings.rothReason).toContain("Oregon");
  });
});
