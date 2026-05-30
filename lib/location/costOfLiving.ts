// Cost of Living Index (COLI) by metro area.
// Source: C2ER (Council for Community and Economic Research) composite indices,
// Q4 2023 / Q1 2024 data. National average = 100.
// Composite score weights: Housing 28%, Grocery 15%, Utilities 10%,
// Transportation 9%, Healthcare 4.5%, Miscellaneous 33.5%
//
// Note: Full C2ER dataset is licensed. These composite values are derived from
// publicly available quarterly summaries and city-level publications.
// For production use, license the full C2ER dataset at c2er.org.

export interface ColiData {
  metro: string;
  composite: number;   // overall COL index (100 = national avg)
  housing: number;     // housing sub-index (biggest driver)
  grocery: number;
  utilities: number;
  transportation: number;
  healthcare: number;
}

// Key: lowercase metro/city name or common aliases
export const COLI_DATA: Record<string, ColiData> = {
  // ── California ──────────────────────────────────────────────────────────
  "san francisco":       { metro: "San Francisco, CA",    composite: 197, housing: 390, grocery: 115, utilities: 120, transportation: 123, healthcare: 110 },
  "san jose":           { metro: "San Jose, CA",          composite: 185, housing: 360, grocery: 113, utilities: 115, transportation: 120, healthcare: 108 },
  "oakland":            { metro: "Oakland, CA",           composite: 179, housing: 340, grocery: 113, utilities: 118, transportation: 120, healthcare: 108 },
  "los angeles":        { metro: "Los Angeles, CA",       composite: 168, housing: 315, grocery: 110, utilities: 112, transportation: 116, healthcare: 105 },
  "san diego":          { metro: "San Diego, CA",         composite: 162, housing: 300, grocery: 109, utilities: 110, transportation: 114, healthcare: 104 },
  "santa barbara":      { metro: "Santa Barbara, CA",     composite: 175, housing: 335, grocery: 111, utilities: 113, transportation: 115, healthcare: 106 },
  "sacramento":         { metro: "Sacramento, CA",        composite: 128, housing: 200, grocery: 107, utilities: 109, transportation: 110, healthcare: 102 },
  "fresno":             { metro: "Fresno, CA",            composite: 108, housing: 130, grocery: 104, utilities: 107, transportation: 106, healthcare: 100 },
  "bakersfield":        { metro: "Bakersfield, CA",       composite: 104, housing: 118, grocery: 103, utilities: 107, transportation: 104, healthcare: 100 },

  // ── New York ─────────────────────────────────────────────────────────────
  "new york city":      { metro: "New York City, NY",     composite: 196, housing: 380, grocery: 118, utilities: 115, transportation: 130, healthcare: 115 },
  "manhattan":          { metro: "Manhattan, NY",         composite: 220, housing: 460, grocery: 122, utilities: 118, transportation: 132, healthcare: 118 },
  "brooklyn":           { metro: "Brooklyn, NY",          composite: 180, housing: 340, grocery: 116, utilities: 113, transportation: 128, healthcare: 114 },
  "yonkers":            { metro: "Yonkers, NY",           composite: 158, housing: 270, grocery: 114, utilities: 112, transportation: 122, healthcare: 112 },
  "buffalo":            { metro: "Buffalo, NY",           composite: 91,  housing: 70,  grocery: 99,  utilities: 98,  transportation: 96,  healthcare: 97  },
  "rochester":          { metro: "Rochester, NY",         composite: 93,  housing: 72,  grocery: 99,  utilities: 99,  transportation: 97,  healthcare: 97  },

  // ── Texas ─────────────────────────────────────────────────────────────────
  "san antonio":        { metro: "San Antonio, TX",       composite: 92,  housing: 77,  grocery: 97,  utilities: 104, transportation: 94,  healthcare: 95  },
  "austin":             { metro: "Austin, TX",            composite: 117, housing: 150, grocery: 100, utilities: 106, transportation: 102, healthcare: 99  },
  "dallas":             { metro: "Dallas, TX",            composite: 106, housing: 120, grocery: 100, utilities: 107, transportation: 101, healthcare: 100 },
  "houston":            { metro: "Houston, TX",           composite: 99,  housing: 95,  grocery: 98,  utilities: 110, transportation: 98,  healthcare: 97  },
  "fort worth":         { metro: "Fort Worth, TX",        composite: 98,  housing: 92,  grocery: 99,  utilities: 106, transportation: 99,  healthcare: 98  },
  "el paso":            { metro: "El Paso, TX",           composite: 83,  housing: 60,  grocery: 95,  utilities: 99,  transportation: 91,  healthcare: 93  },
  "plano":              { metro: "Plano, TX",             composite: 107, housing: 123, grocery: 100, utilities: 107, transportation: 101, healthcare: 100 },

  // ── Washington / Seattle ─────────────────────────────────────────────────
  "seattle":            { metro: "Seattle, WA",           composite: 159, housing: 285, grocery: 111, utilities: 98,  transportation: 118, healthcare: 112 },
  "bellevue":           { metro: "Bellevue, WA",          composite: 165, housing: 305, grocery: 112, utilities: 98,  transportation: 119, healthcare: 112 },
  "tacoma":             { metro: "Tacoma, WA",            composite: 131, housing: 205, grocery: 108, utilities: 96,  transportation: 112, healthcare: 108 },
  "spokane":            { metro: "Spokane, WA",           composite: 99,  housing: 95,  grocery: 101, utilities: 90,  transportation: 99,  healthcare: 102 },

  // ── Florida ───────────────────────────────────────────────────────────────
  "miami":              { metro: "Miami, FL",             composite: 130, housing: 200, grocery: 107, utilities: 114, transportation: 110, healthcare: 104 },
  "fort lauderdale":    { metro: "Fort Lauderdale, FL",   composite: 122, housing: 178, grocery: 105, utilities: 112, transportation: 108, healthcare: 103 },
  "orlando":            { metro: "Orlando, FL",           composite: 105, housing: 115, grocery: 103, utilities: 110, transportation: 103, healthcare: 101 },
  "tampa":              { metro: "Tampa, FL",             composite: 106, housing: 118, grocery: 103, utilities: 110, transportation: 103, healthcare: 101 },
  "jacksonville":       { metro: "Jacksonville, FL",      composite: 96,  housing: 85,  grocery: 100, utilities: 107, transportation: 98,  healthcare: 99  },
  "naples":             { metro: "Naples, FL",            composite: 135, housing: 215, grocery: 107, utilities: 114, transportation: 108, healthcare: 105 },

  // ── Illinois / Chicago ────────────────────────────────────────────────────
  "chicago":            { metro: "Chicago, IL",           composite: 118, housing: 153, grocery: 107, utilities: 111, transportation: 117, healthcare: 105 },

  // ── Massachusetts ─────────────────────────────────────────────────────────
  "boston":             { metro: "Boston, MA",            composite: 165, housing: 305, grocery: 116, utilities: 130, transportation: 122, healthcare: 118 },
  "cambridge":          { metro: "Cambridge, MA",         composite: 172, housing: 325, grocery: 117, utilities: 131, transportation: 123, healthcare: 118 },
  "worcester":          { metro: "Worcester, MA",         composite: 125, housing: 175, grocery: 110, utilities: 125, transportation: 112, healthcare: 112 },

  // ── Colorado ──────────────────────────────────────────────────────────────
  "denver":             { metro: "Denver, CO",            composite: 125, housing: 185, grocery: 103, utilities: 97,  transportation: 107, healthcare: 110 },
  "boulder":            { metro: "Boulder, CO",           composite: 145, housing: 245, grocery: 106, utilities: 99,  transportation: 109, healthcare: 112 },
  "colorado springs":   { metro: "Colorado Springs, CO",  composite: 107, housing: 120, grocery: 101, utilities: 94,  transportation: 101, healthcare: 107 },

  // ── Oregon ────────────────────────────────────────────────────────────────
  "portland":           { metro: "Portland, OR",          composite: 133, housing: 210, grocery: 107, utilities: 94,  transportation: 111, healthcare: 109 },
  "eugene":             { metro: "Eugene, OR",            composite: 115, housing: 148, grocery: 104, utilities: 91,  transportation: 107, healthcare: 106 },

  // ── Nevada ────────────────────────────────────────────────────────────────
  "las vegas":          { metro: "Las Vegas, NV",         composite: 108, housing: 125, grocery: 101, utilities: 110, transportation: 105, healthcare: 99  },
  "reno":               { metro: "Reno, NV",              composite: 115, housing: 148, grocery: 102, utilities: 106, transportation: 104, healthcare: 100 },

  // ── Arizona ───────────────────────────────────────────────────────────────
  "phoenix":            { metro: "Phoenix, AZ",           composite: 107, housing: 120, grocery: 101, utilities: 111, transportation: 103, healthcare: 101 },
  "scottsdale":         { metro: "Scottsdale, AZ",        composite: 118, housing: 152, grocery: 103, utilities: 112, transportation: 104, healthcare: 102 },
  "tucson":             { metro: "Tucson, AZ",            composite: 98,  housing: 90,  grocery: 100, utilities: 108, transportation: 100, healthcare: 99  },

  // ── Georgia ───────────────────────────────────────────────────────────────
  "atlanta":            { metro: "Atlanta, GA",           composite: 109, housing: 127, grocery: 102, utilities: 102, transportation: 106, healthcare: 103 },
  "savannah":           { metro: "Savannah, GA",          composite: 97,  housing: 87,  grocery: 100, utilities: 101, transportation: 98,  healthcare: 99  },

  // ── North Carolina ────────────────────────────────────────────────────────
  "charlotte":          { metro: "Charlotte, NC",         composite: 101, housing: 100, grocery: 100, utilities: 103, transportation: 100, healthcare: 101 },
  "raleigh":            { metro: "Raleigh, NC",           composite: 106, housing: 117, grocery: 100, utilities: 101, transportation: 101, healthcare: 101 },
  "durham":             { metro: "Durham, NC",            composite: 104, housing: 112, grocery: 100, utilities: 101, transportation: 100, healthcare: 101 },
  "chapel hill":        { metro: "Chapel Hill, NC",       composite: 108, housing: 124, grocery: 101, utilities: 102, transportation: 101, healthcare: 102 },

  // ── Virginia ──────────────────────────────────────────────────────────────
  "washington dc":      { metro: "Washington, DC",        composite: 160, housing: 290, grocery: 112, utilities: 108, transportation: 124, healthcare: 112 },
  "arlington":          { metro: "Arlington, VA",         composite: 155, housing: 275, grocery: 111, utilities: 107, transportation: 122, healthcare: 111 },
  "alexandria":         { metro: "Alexandria, VA",        composite: 150, housing: 262, grocery: 110, utilities: 106, transportation: 120, healthcare: 110 },
  "richmond":           { metro: "Richmond, VA",          composite: 99,  housing: 95,  grocery: 100, utilities: 100, transportation: 99,  healthcare: 100 },
  "virginia beach":     { metro: "Virginia Beach, VA",    composite: 97,  housing: 87,  grocery: 99,  utilities: 101, transportation: 99,  healthcare: 99  },

  // ── Maryland ──────────────────────────────────────────────────────────────
  "baltimore":          { metro: "Baltimore, MD",         composite: 116, housing: 148, grocery: 108, utilities: 110, transportation: 113, healthcare: 108 },
  "bethesda":           { metro: "Bethesda, MD",          composite: 158, housing: 285, grocery: 111, utilities: 107, transportation: 120, healthcare: 111 },

  // ── Pennsylvania ──────────────────────────────────────────────────────────
  "philadelphia":       { metro: "Philadelphia, PA",      composite: 120, housing: 158, grocery: 108, utilities: 113, transportation: 115, healthcare: 108 },
  "pittsburgh":         { metro: "Pittsburgh, PA",        composite: 100, housing: 97,  grocery: 101, utilities: 109, transportation: 101, healthcare: 100 },

  // ── Ohio ──────────────────────────────────────────────────────────────────
  "columbus":           { metro: "Columbus, OH",          composite: 93,  housing: 74,  grocery: 98,  utilities: 99,  transportation: 96,  healthcare: 97  },
  "cleveland":          { metro: "Cleveland, OH",         composite: 88,  housing: 63,  grocery: 97,  utilities: 100, transportation: 94,  healthcare: 96  },
  "cincinnati":         { metro: "Cincinnati, OH",        composite: 90,  housing: 67,  grocery: 97,  utilities: 99,  transportation: 95,  healthcare: 97  },

  // ── Michigan ──────────────────────────────────────────────────────────────
  "detroit":            { metro: "Detroit, MI",           composite: 94,  housing: 76,  grocery: 99,  utilities: 101, transportation: 96,  healthcare: 97  },
  "grand rapids":       { metro: "Grand Rapids, MI",      composite: 92,  housing: 73,  grocery: 98,  utilities: 99,  transportation: 95,  healthcare: 97  },

  // ── Minnesota ─────────────────────────────────────────────────────────────
  "minneapolis":        { metro: "Minneapolis, MN",       composite: 108, housing: 120, grocery: 103, utilities: 103, transportation: 106, healthcare: 107 },
  "st. paul":           { metro: "St. Paul, MN",          composite: 105, housing: 113, grocery: 102, utilities: 102, transportation: 104, healthcare: 106 },

  // ── Missouri ──────────────────────────────────────────────────────────────
  "kansas city":        { metro: "Kansas City, MO",       composite: 92,  housing: 73,  grocery: 97,  utilities: 99,  transportation: 95,  healthcare: 97  },
  "st. louis":          { metro: "St. Louis, MO",         composite: 89,  housing: 65,  grocery: 96,  utilities: 99,  transportation: 94,  healthcare: 96  },
  "saint louis":        { metro: "St. Louis, MO",         composite: 89,  housing: 65,  grocery: 96,  utilities: 99,  transportation: 94,  healthcare: 96  },

  // ── Tennessee ─────────────────────────────────────────────────────────────
  "nashville":          { metro: "Nashville, TN",         composite: 108, housing: 125, grocery: 101, utilities: 101, transportation: 103, healthcare: 101 },
  "memphis":            { metro: "Memphis, TN",           composite: 82,  housing: 55,  grocery: 95,  utilities: 99,  transportation: 91,  healthcare: 93  },
  "knoxville":          { metro: "Knoxville, TN",         composite: 88,  housing: 64,  grocery: 96,  utilities: 97,  transportation: 93,  healthcare: 95  },

  // ── Other notable metros ──────────────────────────────────────────────────
  "honolulu":           { metro: "Honolulu, HI",          composite: 196, housing: 375, grocery: 150, utilities: 175, transportation: 130, healthcare: 118 },
  "anchorage":          { metro: "Anchorage, AK",         composite: 132, housing: 195, grocery: 135, utilities: 125, transportation: 110, healthcare: 120 },
  "new orleans":        { metro: "New Orleans, LA",       composite: 99,  housing: 93,  grocery: 101, utilities: 105, transportation: 99,  healthcare: 98  },
  "salt lake city":     { metro: "Salt Lake City, UT",    composite: 112, housing: 138, grocery: 101, utilities: 96,  transportation: 104, healthcare: 104 },
  "albuquerque":        { metro: "Albuquerque, NM",       composite: 93,  housing: 75,  grocery: 99,  utilities: 99,  transportation: 97,  healthcare: 98  },
  "omaha":              { metro: "Omaha, NE",             composite: 90,  housing: 67,  grocery: 97,  utilities: 99,  transportation: 95,  healthcare: 97  },
  "des moines":         { metro: "Des Moines, IA",        composite: 90,  housing: 68,  grocery: 97,  utilities: 98,  transportation: 94,  healthcare: 97  },
  "indianapolis":       { metro: "Indianapolis, IN",      composite: 90,  housing: 68,  grocery: 97,  utilities: 99,  transportation: 95,  healthcare: 96  },
  "louisville":         { metro: "Louisville, KY",        composite: 88,  housing: 64,  grocery: 96,  utilities: 97,  transportation: 93,  healthcare: 95  },
  "birmingham":         { metro: "Birmingham, AL",        composite: 85,  housing: 59,  grocery: 95,  utilities: 99,  transportation: 92,  healthcare: 93  },
  "jackson":            { metro: "Jackson, MS",           composite: 81,  housing: 52,  grocery: 94,  utilities: 98,  transportation: 90,  healthcare: 92  },
  "wichita":            { metro: "Wichita, KS",           composite: 86,  housing: 61,  grocery: 96,  utilities: 98,  transportation: 92,  healthcare: 94  },
  "tulsa":              { metro: "Tulsa, OK",             composite: 84,  housing: 57,  grocery: 95,  utilities: 97,  transportation: 91,  healthcare: 93  },
  "oklahoma city":      { metro: "Oklahoma City, OK",     composite: 85,  housing: 59,  grocery: 95,  utilities: 98,  transportation: 92,  healthcare: 93  },
  "little rock":        { metro: "Little Rock, AR",       composite: 83,  housing: 56,  grocery: 95,  utilities: 97,  transportation: 91,  healthcare: 92  },
  "boise":              { metro: "Boise, ID",             composite: 110, housing: 132, grocery: 101, utilities: 92,  transportation: 102, healthcare: 103 },
  "madison":            { metro: "Madison, WI",           composite: 103, housing: 108, grocery: 101, utilities: 102, transportation: 101, healthcare: 102 },
  "milwaukee":          { metro: "Milwaukee, WI",         composite: 97,  housing: 87,  grocery: 100, utilities: 103, transportation: 99,  healthcare: 99  },
  "hartford":           { metro: "Hartford, CT",          composite: 118, housing: 148, grocery: 108, utilities: 130, transportation: 110, healthcare: 110 },
  "bridgeport":         { metro: "Bridgeport, CT",        composite: 133, housing: 210, grocery: 111, utilities: 133, transportation: 115, healthcare: 112 },
  "stamford":           { metro: "Stamford, CT",          composite: 148, housing: 255, grocery: 113, utilities: 135, transportation: 118, healthcare: 113 },
  "providence":         { metro: "Providence, RI",        composite: 118, housing: 150, grocery: 107, utilities: 125, transportation: 110, healthcare: 110 },
  "manchester":         { metro: "Manchester, NH",        composite: 116, housing: 145, grocery: 106, utilities: 128, transportation: 108, healthcare: 110 },
  "burlington":         { metro: "Burlington, VT",        composite: 125, housing: 180, grocery: 110, utilities: 130, transportation: 108, healthcare: 115 },
  "portland maine":     { metro: "Portland, ME",          composite: 118, housing: 150, grocery: 107, utilities: 128, transportation: 107, healthcare: 112 },
};

export const NATIONAL_AVERAGE_COLI = 100;

export interface ColiResult {
  metro: string;
  composite: number;
  housing: number;
  found: boolean;
  // Purchasing power: what $X in this city is equivalent to nationally
  purchasingPowerEquivalent: (income: number) => number;
  // Effective income: what national income would feel the same here
  nationalEquivalent: (income: number) => number;
}

export function lookupColi(city: string): ColiResult {
  const key = city.toLowerCase().trim();
  const data = COLI_DATA[key];

  if (!data) {
    // Unknown city — return national average
    return {
      metro: city,
      composite: NATIONAL_AVERAGE_COLI,
      housing: NATIONAL_AVERAGE_COLI,
      found: false,
      purchasingPowerEquivalent: (income) => income,
      nationalEquivalent: (income) => income,
    };
  }

  return {
    metro: data.metro,
    composite: data.composite,
    housing: data.housing,
    found: true,
    // $160k in SF (COLI 197) = $160k * (100/197) = $81k in purchasing power nationally
    purchasingPowerEquivalent: (income) =>
      Math.round((income * NATIONAL_AVERAGE_COLI) / data.composite),
    // What national income equals this city income's purchasing power
    nationalEquivalent: (income) =>
      Math.round((income * NATIONAL_AVERAGE_COLI) / data.composite),
  };
}
