// ── 2026 Local / City Income Tax Rates ────────────────────────────────────
// Source: levyio.com/blog/local-income-tax-2026, individual city revenue depts
// Last updated: May 2026
//
// ~17 US states authorize local income taxes. Only cities/counties that levy
// a meaningful personal income tax are listed here.
// Key: lowercase city name (or "county: X" for county-level taxes)

export interface LocalTaxConfig {
  cityName: string;
  rate: number;           // effective rate used for calculations (resident rate)
  type: "flat" | "bracket";
  residentRate: number;
  nonResidentRate: number;
  note?: string;
}

export const LOCAL_TAX_RATES: Record<string, LocalTaxConfig> = {

  // ── New York ──────────────────────────────────────────────────────────
  // NYC has graduated brackets: 3.078% / 3.762% / 3.819% / 3.876%
  // We use top rate (3.876%) as the effective rate for high earners.
  // Non-residents: NYC does NOT tax non-residents.
  "new york city": {
    cityName: "New York City",
    type: "bracket",
    rate: 0.03876,
    residentRate: 0.03876,
    nonResidentRate: 0,
    note: "Graduated 3.078%–3.876% on top of NY state. Non-residents not taxed.",
  },
  "nyc": {
    cityName: "New York City",
    type: "bracket",
    rate: 0.03876,
    residentRate: 0.03876,
    nonResidentRate: 0,
    note: "Alias for 'new york city'",
  },
  "yonkers": {
    cityName: "Yonkers",
    type: "flat",
    rate: 0.01650,
    residentRate: 0.01650,
    nonResidentRate: 0.00502,
    note: "Yonkers resident surcharge 1.65% of NY state tax liability",
  },

  // ── Pennsylvania ──────────────────────────────────────────────────────
  "philadelphia": {
    cityName: "Philadelphia",
    type: "flat",
    rate: 0.0375,
    residentRate: 0.0375,
    nonResidentRate: 0.0344,
    note: "2026: 3.75% residents, 3.44% non-residents (Wage Tax)",
  },
  "pittsburgh": {
    cityName: "Pittsburgh",
    type: "flat",
    rate: 0.03,
    residentRate: 0.03,
    nonResidentRate: 0.01,
  },
  "scranton": {
    cityName: "Scranton",
    type: "flat",
    rate: 0.034,
    residentRate: 0.034,
    nonResidentRate: 0.01,
  },
  "allentown": {
    cityName: "Allentown",
    type: "flat",
    rate: 0.01975,
    residentRate: 0.01975,
    nonResidentRate: 0.01975,
  },
  "reading": {
    cityName: "Reading",
    type: "flat",
    rate: 0.03,
    residentRate: 0.03,
    nonResidentRate: 0.01,
  },
  "erie": {
    cityName: "Erie",
    type: "flat",
    rate: 0.01,
    residentRate: 0.01,
    nonResidentRate: 0.01,
  },

  // ── Ohio (nearly every city has a local tax) ──────────────────────────
  "cleveland": {
    cityName: "Cleveland",
    type: "flat",
    rate: 0.025,
    residentRate: 0.025,
    nonResidentRate: 0.025,
  },
  "columbus": {
    cityName: "Columbus",
    type: "flat",
    rate: 0.025,
    residentRate: 0.025,
    nonResidentRate: 0.025,
  },
  "cincinnati": {
    cityName: "Cincinnati",
    type: "flat",
    rate: 0.018,
    residentRate: 0.018,
    nonResidentRate: 0.018,
    note: "Reduced to 1.8% from 2.1% (2024)",
  },
  "toledo": {
    cityName: "Toledo",
    type: "flat",
    rate: 0.0225,
    residentRate: 0.0225,
    nonResidentRate: 0.0225,
  },
  "akron": {
    cityName: "Akron",
    type: "flat",
    rate: 0.025,
    residentRate: 0.025,
    nonResidentRate: 0.025,
  },
  "dayton": {
    cityName: "Dayton",
    type: "flat",
    rate: 0.025,
    residentRate: 0.025,
    nonResidentRate: 0.025,
  },
  "youngstown": {
    cityName: "Youngstown",
    type: "flat",
    rate: 0.026,
    residentRate: 0.026,
    nonResidentRate: 0.026,
  },
  "canton": {
    cityName: "Canton",
    type: "flat",
    rate: 0.02,
    residentRate: 0.02,
    nonResidentRate: 0.02,
  },

  // ── Michigan ──────────────────────────────────────────────────────────
  "detroit": {
    cityName: "Detroit",
    type: "flat",
    rate: 0.024,
    residentRate: 0.024,
    nonResidentRate: 0.012,
  },
  "grand rapids": {
    cityName: "Grand Rapids",
    type: "flat",
    rate: 0.015,
    residentRate: 0.015,
    nonResidentRate: 0.0075,
  },
  "lansing": {
    cityName: "Lansing",
    type: "flat",
    rate: 0.01,
    residentRate: 0.01,
    nonResidentRate: 0.005,
  },
  "flint": {
    cityName: "Flint",
    type: "flat",
    rate: 0.015,
    residentRate: 0.015,
    nonResidentRate: 0.0075,
  },
  "saginaw": {
    cityName: "Saginaw",
    type: "flat",
    rate: 0.015,
    residentRate: 0.015,
    nonResidentRate: 0.0075,
  },
  "muskegon": {
    cityName: "Muskegon",
    type: "flat",
    rate: 0.01,
    residentRate: 0.01,
    nonResidentRate: 0.005,
  },
  "walker": {
    cityName: "Walker",
    type: "flat",
    rate: 0.01,
    residentRate: 0.01,
    nonResidentRate: 0.005,
  },

  // ── Kentucky (occupational/net profits tax) ───────────────────────────
  "louisville": {
    cityName: "Louisville",
    type: "flat",
    rate: 0.0228,
    residentRate: 0.0228,
    nonResidentRate: 0.0228,
    note: "Jefferson County Occupational Tax 2.28%",
  },
  "lexington": {
    cityName: "Lexington",
    type: "flat",
    rate: 0.0225,
    residentRate: 0.0225,
    nonResidentRate: 0.0225,
    note: "Fayette County Occupational Tax 2.25%",
  },
  "covington": {
    cityName: "Covington",
    type: "flat",
    rate: 0.025,
    residentRate: 0.025,
    nonResidentRate: 0.025,
  },
  "bowling green": {
    cityName: "Bowling Green",
    type: "flat",
    rate: 0.0195,
    residentRate: 0.0195,
    nonResidentRate: 0.0195,
  },

  // ── Missouri ──────────────────────────────────────────────────────────
  "kansas city": {
    cityName: "Kansas City",
    type: "flat",
    rate: 0.01,
    residentRate: 0.01,
    nonResidentRate: 0.01,
    note: "1% earnings tax on residents and non-residents working in KC",
  },
  "st. louis": {
    cityName: "St. Louis",
    type: "flat",
    rate: 0.01,
    residentRate: 0.01,
    nonResidentRate: 0.005,
    note: "1% earnings tax residents; 0.5% non-residents",
  },
  "saint louis": {
    cityName: "St. Louis",
    type: "flat",
    rate: 0.01,
    residentRate: 0.01,
    nonResidentRate: 0.005,
  },

  // ── Maryland (county piggyback taxes on state income tax liability) ───
  // Baltimore City
  "baltimore": {
    cityName: "Baltimore",
    type: "flat",
    rate: 0.032,
    residentRate: 0.032,
    nonResidentRate: 0,
    note: "Baltimore City: 3.2% county piggyback tax on MD state income tax liability",
  },
  // Montgomery County
  "montgomery county": {
    cityName: "Montgomery County, MD",
    type: "flat",
    rate: 0.032,
    residentRate: 0.032,
    nonResidentRate: 0,
    note: "3.2% county piggyback on MD state tax",
  },
  // Prince George's County
  "prince georges county": {
    cityName: "Prince George's County, MD",
    type: "flat",
    rate: 0.032,
    residentRate: 0.032,
    nonResidentRate: 0,
  },
  // Howard County
  "howard county": {
    cityName: "Howard County, MD",
    type: "flat",
    rate: 0.032,
    residentRate: 0.032,
    nonResidentRate: 0,
  },

  // ── Indiana (county income taxes) ────────────────────────────────────
  // Marion County (Indianapolis)
  "indianapolis": {
    cityName: "Indianapolis",
    type: "flat",
    rate: 0.0202,
    residentRate: 0.0202,
    nonResidentRate: 0.0202,
    note: "Marion County Local Income Tax 2.02%",
  },
  // Hamilton County (Carmel/Fishers)
  "carmel": {
    cityName: "Carmel (Hamilton County, IN)",
    type: "flat",
    rate: 0.011,
    residentRate: 0.011,
    nonResidentRate: 0.011,
  },

  // ── Delaware ──────────────────────────────────────────────────────────
  "wilmington": {
    cityName: "Wilmington",
    type: "flat",
    rate: 0.0125,
    residentRate: 0.0125,
    nonResidentRate: 0.0125,
    note: "Wilmington Earned Income Tax 1.25%",
  },

  // ── Alabama (occupational license taxes) ─────────────────────────────
  "birmingham": {
    cityName: "Birmingham",
    type: "flat",
    rate: 0.01,
    residentRate: 0.01,
    nonResidentRate: 0.01,
    note: "Birmingham occupational tax 1%",
  },
  "bessemer": {
    cityName: "Bessemer",
    type: "flat",
    rate: 0.02,
    residentRate: 0.02,
    nonResidentRate: 0.02,
  },
  "gadsden": {
    cityName: "Gadsden",
    type: "flat",
    rate: 0.02,
    residentRate: 0.02,
    nonResidentRate: 0.02,
  },

  // ── Oregon (Metro/Multnomah County taxes) ────────────────────────────
  "portland": {
    cityName: "Portland",
    type: "flat",
    rate: 0.01,
    residentRate: 0.01,
    nonResidentRate: 0.01,
    note: "Portland Metro Supportive Housing tax 1% on income >$125k single/$200k MFJ. " +
          "Multnomah County Preschool for All: 1.5% >$125k, 3% >$250k (single).",
  },

  // ── California — San Francisco has NO personal income tax ─────────────
  "san francisco": {
    cityName: "San Francisco",
    type: "flat",
    rate: 0,
    residentRate: 0,
    nonResidentRate: 0,
    note: "SF has no personal income tax. Payroll tax is on employers only.",
  },

  // ── Washington DC is treated as a state (handled in stateTax.ts) ──────
  // No additional local layer needed for DC residents.
};

export interface LocalTaxResult {
  cityName: string;
  localTaxRate: number;
  localTaxAmount: number;
  hasLocalTax: boolean;
  note?: string;
}

export function calculateLocalTax(
  city: string,
  taxableIncome: number,
  isResident: boolean = true
): LocalTaxResult {
  const key = city.toLowerCase().trim();
  const config = LOCAL_TAX_RATES[key];

  if (!config || config.rate === 0) {
    return {
      cityName: city,
      localTaxRate: 0,
      localTaxAmount: 0,
      hasLocalTax: false,
      note: config?.note,
    };
  }

  const rate = isResident ? config.residentRate : config.nonResidentRate;
  const localTaxAmount = taxableIncome * rate;

  return {
    cityName: config.cityName,
    localTaxRate: rate,
    localTaxAmount,
    hasLocalTax: rate > 0,
    note: config.note,
  };
}
