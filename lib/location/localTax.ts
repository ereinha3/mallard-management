// Local income tax rates for US cities that levy them.
// Source: each city's revenue/finance department, 2024 rates.
// Only ~25 US cities/counties have a meaningful personal income tax.

export interface LocalTaxConfig {
  cityName: string;
  rate: number;           // flat rate or effective top rate
  type: "flat" | "bracket";
  residentRate: number;   // rate for residents
  nonResidentRate: number;// rate for non-residents (workers who don't live there)
  note?: string;
}

// Key: lowercase city name
export const LOCAL_TAX_RATES: Record<string, LocalTaxConfig> = {
  // New York
  "new york city": {
    cityName: "New York City",
    type: "bracket",
    rate: 0.03876,
    residentRate: 0.03876,   // top bracket
    nonResidentRate: 0,       // NYC only taxes residents
    note: "NYC resident tax: 3.078%–3.876% on top of NY state",
  },
  "yonkers": {
    cityName: "Yonkers",
    type: "flat",
    rate: 0.01975,
    residentRate: 0.01975,
    nonResidentRate: 0.00502,
  },

  // Pennsylvania
  "philadelphia": {
    cityName: "Philadelphia",
    type: "flat",
    rate: 0.038712,
    residentRate: 0.038712,
    nonResidentRate: 0.034481,
  },
  "pittsburgh": {
    cityName: "Pittsburgh",
    type: "flat",
    rate: 0.03,
    residentRate: 0.03,
    nonResidentRate: 0.01,
  },
  "allentown": { cityName: "Allentown", type: "flat", rate: 0.01975, residentRate: 0.01975, nonResidentRate: 0.01975 },
  "erie": { cityName: "Erie", type: "flat", rate: 0.01, residentRate: 0.01, nonResidentRate: 0.01 },
  "reading": { cityName: "Reading", type: "flat", rate: 0.03, residentRate: 0.03, nonResidentRate: 0.01 },
  "scranton": { cityName: "Scranton", type: "flat", rate: 0.0334, residentRate: 0.0334, nonResidentRate: 0.01 },

  // Ohio — nearly every city has a local income tax
  "columbus": { cityName: "Columbus", type: "flat", rate: 0.025, residentRate: 0.025, nonResidentRate: 0.025 },
  "cleveland": { cityName: "Cleveland", type: "flat", rate: 0.025, residentRate: 0.025, nonResidentRate: 0.025 },
  "cincinnati": { cityName: "Cincinnati", type: "flat", rate: 0.018, residentRate: 0.018, nonResidentRate: 0.018 },
  "toledo": { cityName: "Toledo", type: "flat", rate: 0.0225, residentRate: 0.0225, nonResidentRate: 0.0225 },
  "akron": { cityName: "Akron", type: "flat", rate: 0.025, residentRate: 0.025, nonResidentRate: 0.025 },
  "dayton": { cityName: "Dayton", type: "flat", rate: 0.025, residentRate: 0.025, nonResidentRate: 0.025 },

  // Michigan
  "detroit": { cityName: "Detroit", type: "flat", rate: 0.024, residentRate: 0.024, nonResidentRate: 0.012 },
  "grand rapids": { cityName: "Grand Rapids", type: "flat", rate: 0.015, residentRate: 0.015, nonResidentRate: 0.0075 },
  "lansing": { cityName: "Lansing", type: "flat", rate: 0.01, residentRate: 0.01, nonResidentRate: 0.005 },
  "flint": { cityName: "Flint", type: "flat", rate: 0.015, residentRate: 0.015, nonResidentRate: 0.0075 },
  "saginaw": { cityName: "Saginaw", type: "flat", rate: 0.015, residentRate: 0.015, nonResidentRate: 0.0075 },

  // Kentucky — cities piggyback an "occupational tax"
  "louisville": { cityName: "Louisville", type: "flat", rate: 0.0228, residentRate: 0.0228, nonResidentRate: 0.0228 },
  "lexington": { cityName: "Lexington", type: "flat", rate: 0.02, residentRate: 0.02, nonResidentRate: 0.02 },
  "covington": { cityName: "Covington", type: "flat", rate: 0.025, residentRate: 0.025, nonResidentRate: 0.025 },

  // Missouri
  "kansas city": { cityName: "Kansas City", type: "flat", rate: 0.01, residentRate: 0.01, nonResidentRate: 0.01 },
  "st. louis": { cityName: "St. Louis", type: "flat", rate: 0.01, residentRate: 0.01, nonResidentRate: 0.005 },
  "saint louis": { cityName: "St. Louis", type: "flat", rate: 0.01, residentRate: 0.01, nonResidentRate: 0.005 },

  // Maryland — counties, not cities, levy a local piggyback tax on state income tax
  // These are county rates as a % of MD state tax liability
  // Baltimore City
  "baltimore": { cityName: "Baltimore", type: "flat", rate: 0.032, residentRate: 0.032, nonResidentRate: 0, note: "Baltimore City local piggyback tax" },

  // Indiana — counties levy local income tax
  // Marion County (Indianapolis)
  "indianapolis": { cityName: "Indianapolis", type: "flat", rate: 0.0202, residentRate: 0.0202, nonResidentRate: 0.0202, note: "Marion County local income tax" },

  // California — SF has NO personal income tax (employer payroll tax only)
  "san francisco": { cityName: "San Francisco", type: "flat", rate: 0, residentRate: 0, nonResidentRate: 0, note: "SF has no personal income tax; payroll tax is on employers only" },
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
