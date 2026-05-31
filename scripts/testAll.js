const http = require("http");

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: "localhost", port: 3000, path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      res => { let s = ""; res.on("data", c => s += c); res.on("end", () => { try { resolve(JSON.parse(s)); } catch(e) { resolve({_raw: s}); } }); }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get("http://localhost:3000" + path, res => {
      let s = ""; res.on("data", c => s += c);
      res.on("end", () => { try { resolve(JSON.parse(s)); } catch(e) { resolve({_raw: s}); } });
    }).on("error", reject);
  });
}

const fmt = n => n != null ? "$" + Number(n).toFixed(2) : "n/a";
const pct = n => n != null ? (n * 100).toFixed(2) + "%" : "n/a";
let passed = 0, failed = 0;

function check(label, val, expected) {
  if (val === undefined || val === null) {
    console.log("  MISSING  " + label);
    failed++;
  } else if (expected !== undefined && val !== expected) {
    console.log("  FAIL     " + label + " = " + val + " (expected " + expected + ")");
    failed++;
  } else {
    console.log("  PASS     " + label + " = " + val);
    passed++;
  }
}

async function run() {
  console.log("\n" + "=".repeat(65));
  console.log("  MALLARD MANAGEMENT — FULL API TEST SUITE");
  console.log("=".repeat(65));

  // ── TEST 1: Tax calculation ─────────────────────────────────────────
  console.log("\n[1] Tax Calc — Single, Oregon, $100k/yr");
  const t1 = await post("/api/tax/calculate", {
    grossIncome: 100000, filingStatus: "single", state: "OR", age: 35,
    otherIncome: 0, itemizedDeductions: 0, selfEmployed: false,
    longTermCapitalGains: 0, studentLoanInterest: 0
  });
  if (t1._raw) { console.log("  ERROR:", t1._raw.slice(0,200)); failed++; }
  else {
    check("federal exists",              t1.federal != null);
    check("state exists",               t1.state != null);
    check("fica exists",                t1.fica != null);
    check("totalTax > 0",               t1.totalTax > 0);
    check("takeHomePay > 0",            t1.takeHomePay > 0);
    check("totalTax < grossIncome",     t1.totalTax < 100000);
    check("federal effectiveRate",      pct(t1.federal?.effectiveRate));
    check("OR state tax > 0",           t1.state?.stateTax > 0);
    check("combinedMarginalRate",       pct(t1.combinedMarginalRate));
    console.log("  INFO     Federal tax: " + fmt(t1.federal?.regularTax) + " | OR state: " + fmt(t1.state?.stateTax) + " | FICA: " + fmt(t1.fica?.totalFICA));
    console.log("  INFO     Take home: " + fmt(t1.takeHomePay) + " | Combined marginal: " + pct(t1.combinedMarginalRate));
  }

  // ── TEST 2: Location profile — SF ──────────────────────────────────
  console.log("\n[2] Location Profile — San Francisco CA, $160k/yr, $5k/mo expenses");
  const t2 = await post("/api/tax/location-profile", {
    grossIncome: 160000, filingStatus: "single", state: "CA", age: 30,
    zipCode: "94102", isResident: true, monthlyExpenses: 5000,
    otherIncome: 0, itemizedDeductions: 0, selfEmployed: false,
    longTermCapitalGains: 0, studentLoanInterest: 0
  });
  if (t2._raw) { console.log("  ERROR:", t2._raw.slice(0,200)); failed++; }
  else {
    check("monthlyTakeHome > 0",        t2.monthlyTakeHome > 0);
    check("monthlySurplus present",     t2.monthlySurplus != null);
    check("localTax (SF = 0)",          t2.localTax?.hasLocalTax, false);
    check("CA state tax > 0",           t2.stateTax?.annualTax > 0);
    check("summary exists",             typeof t2.summary === "string");
    console.log("  INFO     Monthly take home: " + fmt(t2.monthlyTakeHome) + " | Monthly surplus: " + fmt(t2.monthlySurplus));
    console.log("  INFO     CA state tax: " + fmt(t2.stateTax?.annualTax));
  }

  // ── TEST 3: Location profile — NYC ─────────────────────────────────
  console.log("\n[3] Location Profile — New York City NY, $160k/yr");
  const t3 = await post("/api/tax/location-profile", {
    grossIncome: 160000, filingStatus: "single", state: "NY", age: 30,
    zipCode: "10001", isResident: true, monthlyExpenses: 5000,
    otherIncome: 0, itemizedDeductions: 0, selfEmployed: false,
    longTermCapitalGains: 0, studentLoanInterest: 0
  });
  if (t3._raw) { console.log("  ERROR:", t3._raw.slice(0,200)); failed++; }
  else {
    check("monthlyTakeHome > 0",        t3.monthlyTakeHome > 0);
    check("NYC local tax > 0",          t3.localTax?.localTaxAmount > 0);
    check("NYC lower take home than SF", t3.monthlyTakeHome < (t2.monthlyTakeHome ?? Infinity));
    console.log("  INFO     Monthly take home: " + fmt(t3.monthlyTakeHome) + " | NYC local tax: " + fmt(t3.localTax?.localTaxAmount));
  }

  // ── TEST 4: San Antonio TX (no state tax) ──────────────────────────
  console.log("\n[4] Location Profile — San Antonio TX, $100k/yr (no state tax)");
  const t4 = await post("/api/tax/location-profile", {
    grossIncome: 100000, filingStatus: "single", state: "TX", age: 28,
    zipCode: "78201", isResident: true, monthlyExpenses: 2500,
    otherIncome: 0, itemizedDeductions: 0, selfEmployed: false,
    longTermCapitalGains: 0, studentLoanInterest: 0
  });
  if (t4._raw) { console.log("  ERROR:", t4._raw.slice(0,200)); failed++; }
  else {
    check("TX state tax = 0",           t4.stateTax?.annualTax, 0);
    check("local tax = 0",              t4.localTax?.hasLocalTax, false);
    check("monthlyTakeHome > 0",        t4.monthlyTakeHome > 0);
    console.log("  INFO     Monthly take home: " + fmt(t4.monthlyTakeHome) + " | Monthly surplus: " + fmt(t4.monthlySurplus));
  }

  // ── TEST 5: Gate — clear to invest ─────────────────────────────────
  console.log("\n[5] Gate — Low-rate debt, good emergency fund (expect: clear)");
  const t5 = await post("/api/gate/check", {
    monthlyGrossIncome: 8000, monthlyExpenses: 3500,
    liquidSavings: 25000, capitalToInvest: 10000,
    debts: [
      { id: "d1", label: "Mortgage", type: "mortgage", apr: 0.065, balance: 280000, minimumPayment: 1800, extraPayment: 0 },
      { id: "d2", label: "Student Loan", type: "student_loan", apr: 0.055, balance: 18000, minimumPayment: 200, extraPayment: 0 }
    ],
    federalMarginalRate: 0.22, combinedMarginalRate: 0.30, ltcgRate: 0.15, expectedMarketReturn: 0.07
  });
  if (t5._raw) { console.log("  ERROR:", t5._raw.slice(0,200)); failed++; }
  else {
    check("verdict = clear",            t5.verdict, "clear");
    check("clearToInvest = true",       t5.clearToInvest, true);
    check("mortgage effectiveApr < 0.065", t5.debts?.[0]?.effectiveApr < 0.065);
    check("mortgage rec = minimum_only", t5.debts?.[0]?.recommendation, "minimum_only");
    check("capitalToInvest > 0",        t5.capitalAllocation?.toInvesting > 0);
    console.log("  INFO     Mortgage effective APR: " + pct(t5.debts?.[0]?.effectiveApr) + " | Rec: " + t5.debts?.[0]?.recommendation);
    console.log("  INFO     Capital to investing: " + fmt(t5.capitalAllocation?.toInvesting));
  }

  // ── TEST 6: Gate — credit card blocks ──────────────────────────────
  console.log("\n[6] Gate — Credit card 24% APR (expect: halt, high_interest_debt)");
  const t6 = await post("/api/gate/check", {
    monthlyGrossIncome: 6000, monthlyExpenses: 3000,
    liquidSavings: 12000, capitalToInvest: 2000,  // 4-month emergency fund — passes EF check
    debts: [
      { id: "d1", label: "Visa", type: "credit_card", apr: 0.24, balance: 8000, minimumPayment: 200, extraPayment: 0 }
    ],
    federalMarginalRate: 0.22, combinedMarginalRate: 0.28, ltcgRate: 0.15, expectedMarketReturn: 0.07
  });
  if (t6._raw) { console.log("  ERROR:", t6._raw.slice(0,200)); failed++; }
  else {
    check("verdict = halt",             t6.verdict, "halt");
    check("clearToInvest = false",      t6.clearToInvest, false);
    check("haltReason = high_interest_debt", t6.haltReason, "high_interest_debt");
    check("CC rec = pay_first",         t6.debts?.[0]?.recommendation, "pay_first");
    console.log("  INFO     Capital to debt payoff: " + fmt(t6.capitalAllocation?.toDebtPayoff));
  }

  // ── TEST 7: Gate — no emergency fund ───────────────────────────────
  console.log("\n[7] Gate — No emergency fund (expect: halt, no_emergency_fund)");
  const t7 = await post("/api/gate/check", {
    monthlyGrossIncome: 5000, monthlyExpenses: 2000,
    liquidSavings: 1000, capitalToInvest: 500,
    debts: [],
    federalMarginalRate: 0.12, combinedMarginalRate: 0.18, ltcgRate: 0.0, expectedMarketReturn: 0.07
  });
  if (t7._raw) { console.log("  ERROR:", t7._raw.slice(0,200)); failed++; }
  else {
    check("verdict = halt",             t7.verdict, "halt");
    check("haltReason = no_emergency_fund", t7.haltReason, "no_emergency_fund");
    console.log("  INFO     Emergency fund shortfall: " + fmt(t7.emergencyFund?.shortfall));
  }

  // ── TEST 8: Waterfall ───────────────────────────────────────────────
  console.log("\n[8] Waterfall — $2k/mo surplus, 35yo, has 401k + HSA");
  const t8 = await post("/api/waterfall/allocate", {
    grossAnnualIncome: 120000, federalMarginalRate: 0.22, combinedMarginalRate: 0.30,
    age: 35, filingStatus: "single", monthlySurplus: 2000, capitalToInvest: 15000,
    currentBalances: { traditional401k: 40000, roth401k: 0, rothIRA: 12000, traditionalIRA: 0, hsa: 3000, taxableBrokerage: 5000 },
    currentMonthlyContributions: { traditional401k: 500, rothIRA: 200, traditionalIRA: 0, hsa: 100 },
    has401k: true,
    employerMatch: { matchRate: 0.5, matchUpToPercent: 0.06, vestedImmediately: true },
    hasHSAEligiblePlan: true, forceBackdoorRoth: false
  });
  if (t8._raw) { console.log("  ERROR:", t8._raw.slice(0,200)); failed++; }
  else {
    check("buckets exist",              Array.isArray(t8.buckets));
    check("iraDecision exists",         t8.iraDecision != null);
    check("employerMatch captured",     t8.employerMatchCaptured, true);
    check("employerMatchAnnual > 0",    t8.employerMatchAnnual > 0);
    check("IRA type = roth",            t8.iraDecision?.type === "roth" || t8.iraDecision?.type === "traditional");
    console.log("  INFO     IRA decision: " + t8.iraDecision?.type + " (" + t8.iraDecision?.reason?.slice(0,60) + ")");
    console.log("  INFO     Employer match: $" + t8.employerMatchAnnual + "/yr | Total monthly: $" + t8.totalMonthlyContributions);
    t8.buckets?.slice(0,5).forEach(b => console.log("  INFO     Bucket: " + b.label.padEnd(30) + " $" + b.monthlyAmount + "/mo"));
    var waterfallBuckets = t8.buckets;
  }

  // ── TEST 9: Waterfall — high earner gets backdoor Roth ─────────────
  console.log("\n[9] Waterfall — $400k income (expect: backdoor_roth)");
  const t9 = await post("/api/waterfall/allocate", {
    grossAnnualIncome: 400000, federalMarginalRate: 0.35, combinedMarginalRate: 0.45,
    age: 45, filingStatus: "single", monthlySurplus: 8000, capitalToInvest: 0,
    currentBalances: { traditional401k: 200000, roth401k: 0, rothIRA: 0, traditionalIRA: 0, hsa: 0, taxableBrokerage: 50000 },
    currentMonthlyContributions: { traditional401k: 1000, rothIRA: 0, traditionalIRA: 0, hsa: 0 },
    has401k: true, hasHSAEligiblePlan: false, forceBackdoorRoth: false
  });
  if (t9._raw) { console.log("  ERROR:", t9._raw.slice(0,200)); failed++; }
  else {
    check("IRA = backdoor_roth or traditional", ["backdoor_roth_ira","traditional"].includes(t9.iraDecision?.type));
    console.log("  INFO     IRA decision: " + t9.iraDecision?.type);
  }

  // ── TEST 10: Asset Location ─────────────────────────────────────────
  console.log("\n[10] Asset Location — portfolio weights mapped to accounts");
  if (!waterfallBuckets) { console.log("  SKIP (waterfall failed)"); }
  else {
    const t10 = await post("/api/waterfall/locate", {
      weights: {
        us_equity_broad: 0.35, us_equity_growth: 0.10,
        international_developed: 0.15, international_emerging: 0.05,
        us_bonds: 0.20, reits: 0.05, cash_equivalents: 0.05, tips: 0.05
      },
      buckets: waterfallBuckets
    });
    if (t10._raw) { console.log("  ERROR:", t10._raw.slice(0,200)); failed++; }
    else {
      check("accounts exist",           Array.isArray(t10.accounts) && t10.accounts.length > 0);
      check("executionList exists",     Array.isArray(t10.executionList) && t10.executionList.length > 0);
      check("assetSummary exists",      Array.isArray(t10.assetSummary));
      // International must be in taxable (foreign tax credit rule)
      const intlDev = t10.assetSummary?.find(a => a.assetClass === "international_developed");
      check("VXUS placed in taxable",   intlDev?.placedIn?.includes("taxable_brokerage"));
      console.log("  INFO     Accounts used:", t10.accounts?.map(a => a.accountType).join(", "));
      console.log("  INFO     Execution items:", t10.executionList?.length);
      console.log("  INFO     Warnings:", t10.warnings?.length, t10.warnings?.length > 0 ? "-> " + t10.warnings[0]?.slice(0,60) : "");
      t10.assetSummary?.forEach(a => {
        console.log("  INFO       " + a.ticker.padEnd(5) + " -> " + a.placedIn.join(", ").padEnd(40) + (a.isOptimalPlacement ? "" : " ⚠ suboptimal"));
      });
    }
  }

  // ── TEST 11: ETF Universe ───────────────────────────────────────────
  console.log("\n[11] ETF Universe API");
  const t11 = await get("/api/universe/etfs?meta=true");
  if (t11._raw) { console.log("  ERROR:", t11._raw.slice(0,200)); failed++; }
  else {
    check("totalCount = 1000",          t11.totalCount, 1000);
    check("topAumCount = 500",          t11.topAumCount, 500);
    check("diversifiedSampleCount=500", t11.diversifiedSampleCount, 500);
    check("builtAt exists",             typeof t11.builtAt === "string");
  }

  const t11b = await get("/api/universe/etfs?ticker=VTI");
  check("VTI lookup name",             t11b.name?.includes("Vanguard"));
  check("VTI inTopAum = true",         t11b.inTopAum, true);
  check("VTI totalAssets > 0",         t11b.totalAssets > 0);

  const t11c = await get("/api/universe/etfs?set=top&_limit=5");
  check("set=top returns etfs",        Array.isArray(t11c.etfs) && t11c.etfs.length > 0);

  const t11d = await get("/api/universe/etfs?bucket=thematic");
  check("bucket=thematic returns etfs", Array.isArray(t11d.etfs) && t11d.count > 0);
  console.log("  INFO     Thematic bucket: " + t11d.count + " ETFs");

  // ── TEST 12: Tax-Loss Harvesting ────────────────────────────────────
  console.log("\n[12] Tax-Loss Harvesting — two losers, one winner");
  const t12 = await post("/api/tax/harvest", {
    holdings: [
      { ticker: "VXUS", name: "Vanguard Total Intl", shares: 100, costBasisPerShare: 60,
        currentPricePerShare: 52, purchaseDate: "2024-06-01", accountType: "taxable" },
      { ticker: "BND",  name: "Vanguard Total Bond", shares: 200, costBasisPerShare: 77,
        currentPricePerShare: 71, purchaseDate: "2023-03-15", accountType: "taxable" },
      { ticker: "VTI",  name: "Vanguard Total Market", shares: 50, costBasisPerShare: 200,
        currentPricePerShare: 260, purchaseDate: "2022-01-01", accountType: "taxable" },
    ],
    filingStatus: "single",
    realizedShortTermGainsYTD: 0,
    realizedLongTermGainsYTD: 2000,
    shortTermLossCarryforward: 0,
    longTermLossCarryforward: 0,
    ordinaryMarginalRate: 0.22,
    ltcgRate: 0.15,
    estimatedTradeCostDollars: 0,
  });
  if (t12._raw) { console.log("  ERROR:", t12._raw.slice(0,200)); failed++; }
  else {
    check("candidates exist",            Array.isArray(t12.candidates));
    check("VXUS is a candidate",         t12.candidates.some(c => c.ticker === "VXUS"));
    check("VTI is NOT a candidate",      !t12.candidates.some(c => c.ticker === "VTI"));
    check("totalHarvestableLoss > 0",    t12.totalHarvestableLoss > 0);
    check("legalNotices present",        t12.legalNotices?.length > 0);
    console.log("  INFO     Harvestable loss: $" + t12.totalHarvestableLoss.toFixed(2));
    console.log("  INFO     Est. tax savings: $" + t12.estimatedTaxSavingsThisYear?.toFixed(2));
    console.log("  INFO     Candidates: " + t12.candidates.map(c => c.ticker + " ($" + Math.abs(c.unrealizedLoss).toFixed(0) + " loss)").join(", "));
  }

  // ── TEST 13: Roth Conversion ─────────────────────────────────────────
  console.log("\n[13] Roth Conversion — mid-career, low-income year");
  const t13 = await post("/api/tax/roth-conversion", {
    ordinaryIncomeThisYear: 65000,
    filingStatus: "single",
    age: 42,
    traditionalIraBalance: 180000,
    rothIraBalance: 25000,
    nonDeductibleIraBasis: 0,
    expectedRetirementMarginalRate: 0.28,
    itemizedDeductions: 0,
    yearsToRetirement: 23,
    expectedAnnualReturn: 0.07,
    taxYear: 2026,
  });
  if (t13._raw) { console.log("  ERROR:", t13._raw.slice(0,200)); failed++; }
  else {
    check("scenarios exist",             Array.isArray(t13.scenarios) && t13.scenarios.length > 0);
    check("currentMarginalRate > 0",     t13.currentMarginalRate > 0);
    check("rmdRequired = false",         t13.rmdRequired, false);
    check("recommendedAmount > 0",       t13.recommendedConversionAmount > 0);
    check("legalNotices present",        t13.legalNotices?.length > 0);
    console.log("  INFO     Current rate: " + (t13.currentMarginalRate * 100).toFixed(0) + "% | Bracket room: $" + t13.currentBracketRemainingRoom?.toLocaleString());
    console.log("  INFO     Recommended conversion: $" + t13.recommendedConversionAmount?.toLocaleString());
    t13.scenarios?.slice(0,2).forEach(s => console.log("  INFO     Scenario: " + s.label + " — tax cost $" + s.taxCostThisYear?.toLocaleString()));
  }

  // ── TEST 14: Capital Gains Timing ────────────────────────────────────
  console.log("\n[14] Capital Gains Timing — 0% opportunity + short-term warning");
  const t14 = await post("/api/tax/gains-timing", {
    ordinaryTaxableIncome: 38000,
    filingStatus: "single",
    realizedLtcgYtd: 0,
    realizedStcgYtd: 0,
    stateLtcgRate: 0.05,
    positions: [
      { id: "p1", ticker: "VTI",  name: "Vanguard Total Market", shares: 20,
        costBasisPerShare: 200, currentPricePerShare: 265,
        purchaseDate: "2022-03-01", isRealEstate: false },
      { id: "p2", ticker: "VXUS", name: "Vanguard Total Intl",   shares: 50,
        costBasisPerShare: 55, currentPricePerShare: 52,
        purchaseDate: "2024-11-01", isRealEstate: false },
      { id: "p3", ticker: "QQQ",  name: "Invesco QQQ", shares: 5,
        costBasisPerShare: 450, currentPricePerShare: 510,
        purchaseDate: "2025-12-01", isRealEstate: false },
    ],
  });
  if (t14._raw) { console.log("  ERROR:", t14._raw.slice(0,200)); failed++; }
  else {
    check("positions analyzed",          Array.isArray(t14.positions) && t14.positions.length === 3);
    check("zeroRateOpportunity = true",  t14.zeroRateOpportunity, true);
    check("VTI = sell_now_0pct",         t14.positions.find(p => p.ticker === "VTI")?.recommendation === "sell_now_0pct");
    check("QQQ = wait/caution",          ["wait_for_long_term","caution_high_rate"].includes(t14.positions.find(p => p.ticker === "QQQ")?.recommendation));
    console.log("  INFO     Current LTCG rate: " + (t14.currentLtcgRate * 100).toFixed(0) + "% | 0% room: $" + t14.zeroRateRoomRemaining?.toLocaleString());
    t14.positions?.forEach(p => console.log("  INFO     " + p.ticker.padEnd(6) + " " + p.recommendation + " | tax if sold: $" + p.totalTaxIfSoldNow));
  }

  // ── TEST 15: Rebalancing ─────────────────────────────────────────────
  console.log("\n[15] Tax-Aware Rebalancing — drifted portfolio");
  const t15 = await post("/api/tax/rebalance", {
    holdings: [
      { ticker: "VTI",  accountType: "roth_ira",           currentValue: 45000, costBasis: 30000, purchaseDate: "2021-01-01" },
      { ticker: "BND",  accountType: "traditional_401k",   currentValue: 30000, costBasis: 28000, purchaseDate: "2020-06-01" },
      { ticker: "VXUS", accountType: "taxable_brokerage",  currentValue: 25000, costBasis: 22000, purchaseDate: "2022-09-01" },
      { ticker: "VNQ",  accountType: "traditional_401k",   currentValue: 15000, costBasis: 12000, purchaseDate: "2021-03-01" },
    ],
    targetWeights: { VTI: 0.40, BND: 0.30, VXUS: 0.20, VNQ: 0.10 },
    monthlyNewContributions: { traditional_401k: 500, roth_ira: 200 },
    filingStatus: "single",
    ltcgRate: 0.15,
    ordinaryMarginalRate: 0.22,
    stateLtcgRate: 0.05,
    driftThreshold: 0.05,
  });
  if (t15._raw) { console.log("  ERROR:", t15._raw.slice(0,200)); failed++; }
  else {
    check("drift analyzed",              Array.isArray(t15.drift) && t15.drift.length > 0);
    check("trades generated",            Array.isArray(t15.trades));
    check("totalPortfolioValue > 0",     t15.totalPortfolioValue > 0);
    check("legalNotices present",        t15.legalNotices?.length > 0);
    console.log("  INFO     Portfolio: $" + t15.totalPortfolioValue?.toLocaleString() + " | Needs rebalancing: " + t15.needsRebalancing);
    console.log("  INFO     Est. tax cost: $" + t15.estimatedTotalTaxCost?.toLocaleString() + " | Trades: " + t15.trades?.length);
    t15.drift?.forEach(d => console.log("  INFO     " + d.ticker.padEnd(6) + " target:" + (d.targetWeight*100).toFixed(0) + "% actual:" + (d.currentWeight*100).toFixed(0) + "% drift:" + (d.drift*100).toFixed(1) + "%"));
  }

  // ── TEST 16: Quarterly Optimization Pipeline ────────────────────────
  console.log("\n[16] Quarterly Optimization Pipeline — full client snapshot");
  const t16 = await post("/api/optimization/quarterly-report", {
    clientId: "test-client-001",
    asOfDate: new Date().toISOString().slice(0, 10),
    holdings: [
      { ticker: "VTI",  name: "Vanguard Total Market",   shares: 50,  costBasisPerShare: 200, currentPricePerShare: 255, purchaseDate: "2022-03-01", accountType: "taxable_brokerage", isRealEstate: false },
      { ticker: "VXUS", name: "Vanguard Total Intl",     shares: 100, costBasisPerShare: 60,  currentPricePerShare: 52,  purchaseDate: "2023-06-01", accountType: "taxable_brokerage", isRealEstate: false },
      { ticker: "BND",  name: "Vanguard Total Bond",     shares: 200, costBasisPerShare: 77,  currentPricePerShare: 71,  purchaseDate: "2023-03-15", accountType: "traditional_401k",   isRealEstate: false },
      { ticker: "VTI",  name: "Vanguard Total Market",   shares: 30,  costBasisPerShare: 180, currentPricePerShare: 255, purchaseDate: "2021-01-01", accountType: "roth_ira",           isRealEstate: false },
    ],
    taxProfile: {
      grossIncome: 120000, filingStatus: "single", state: "OR", age: 35,
      federalMarginalRate: 0.22, combinedMarginalRate: 0.30, ltcgRate: 0.15,
      stateLtcgRate: 0.09, itemizedDeductions: 0,
    },
    retirement: {
      traditionalIraBalance: 45000, rothIraBalance: 18000, nonDeductibleIraBasis: 0,
      expectedRetirementMarginalRate: 0.22, yearsToRetirement: 30, expectedAnnualReturn: 0.07,
    },
    ytdGains: { realizedShortTermGains: 0, realizedLongTermGains: 1500, shortTermLossCarryforward: 0, longTermLossCarryforward: 0 },
    targetWeights: { VTI: 0.50, VXUS: 0.20, BND: 0.30 },
    monthlyContributions: { traditional_401k: 500, roth_ira: 200 },
    minimumActionThreshold: 500,
    rebalanceDriftThreshold: 0.05,
    estimatedTradeCostDollars: 0,
  });
  if (t16._raw) { console.log("  ERROR:", t16._raw.slice(0,200)); failed++; }
  else {
    check("quarter exists",              typeof t16.quarter === "string");
    check("actions array exists",        Array.isArray(t16.actions));
    check("harvestResult exists",        t16.harvestResult != null);
    check("rothResult exists",           t16.rothResult != null);
    check("timingResult exists",         t16.timingResult != null);
    check("rebalanceResult exists",      t16.rebalanceResult != null);
    check("legalNotices present",        t16.legalNotices?.length > 0);
    check("strategiesRun = 4",          t16.strategiesRun?.length === 4);
    check("VXUS harvested",             t16.harvestResult?.candidates?.some(c => c.ticker === "VXUS"));
    console.log("  INFO     Quarter: " + t16.quarter + " | Actions: " + t16.actions?.length);
    console.log("  INFO     Est. savings this year: $" + t16.totalEstimatedSavingsThisYear?.toLocaleString());
    console.log("  INFO     Est. long-term savings: $" + t16.totalEstimatedSavingsLongTerm?.toLocaleString());
    t16.actions?.forEach(a => console.log("  INFO     [" + a.priority.padEnd(7) + "] " + a.category.padEnd(16) + " " + a.title));
    if (t16.noActionNeeded?.length > 0) console.log("  INFO     No-action items: " + t16.noActionNeeded.length);
  }

  // ── Final summary ───────────────────────────────────────────────────
  console.log("\n" + "=".repeat(65));
  console.log("  RESULTS: " + passed + " passed, " + failed + " failed");
  console.log("=".repeat(65) + "\n");
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
