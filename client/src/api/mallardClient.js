// Mallard Management — API client for Gilbert's backend
// Drop this file into client/src/api/mallardClient.js

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `API error ${res.status}`);
  }

  return res.json();
}

/**
 * POST /api/financial-profile
 *
 * Send a full user profile, get back everything the dashboard needs:
 * monthlySnapshot, assets, liabilities, retirementScore, projections, taxSummary.
 *
 * @param {import('./types').FinancialProfileInput} profileInput
 * @returns {Promise<import('./types').FinancialProfileOutput>}
 */
export function fetchFinancialProfile(profileInput) {
  return post("/api/financial-profile", profileInput);
}

/**
 * POST /api/tax/calculate
 * Lower-level endpoint if you only need tax numbers.
 */
export function fetchTaxCalculation(taxInput) {
  return post("/api/tax/calculate", taxInput);
}
