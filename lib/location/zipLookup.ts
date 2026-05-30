// eslint-disable-next-line @typescript-eslint/no-require-imports
const zipcodes = require("zipcodes");

export interface ZipInfo {
  zip: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

export function lookupZip(zip: string): ZipInfo | null {
  const result = zipcodes.lookup(zip);
  if (!result) return null;
  return {
    zip: result.zip,
    city: result.city,
    state: result.state,
    latitude: result.latitude,
    longitude: result.longitude,
  };
}
