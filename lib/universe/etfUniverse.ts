/**
 * ETF Universe — runtime access layer
 *
 * Reads the pre-built data/etf-universe.json cache at startup.
 * All API routes import from here — never read the file directly.
 */

import * as fs from "fs";
import * as path from "path";

// ── Types (re-exported so API routes can use them) ────────────────────────

export interface EtfEntry {
  ticker: string;
  name: string;
  totalAssets: number | null;
  expenseRatio: number | null;
  category: string | null;
  exchange: string | null;
  inTopAum: boolean;
}

export interface EtfUniverse {
  builtAt: string;
  totalCount: number;
  topAumCount: number;
  randomSampleCount: number;
  etfs: EtfEntry[];
}

// ── Cache ─────────────────────────────────────────────────────────────────

let _cache: EtfUniverse | null = null;

function load(): EtfUniverse {
  if (_cache) return _cache;

  const filePath = path.join(process.cwd(), "data", "etf-universe.json");

  if (!fs.existsSync(filePath)) {
    throw new Error(
      "ETF universe not built yet. Run: npx ts-node scripts/buildEtfUniverse.ts"
    );
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  _cache = JSON.parse(raw) as EtfUniverse;
  return _cache;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Full universe */
export function getEtfUniverse(): EtfUniverse {
  return load();
}

/** All ETF entries */
export function getAllEtfs(): EtfEntry[] {
  return load().etfs;
}

/** Top 500 by AUM only */
export function getTopAumEtfs(): EtfEntry[] {
  return load().etfs.filter((e) => e.inTopAum);
}

/** Random sample only */
export function getRandomSampleEtfs(): EtfEntry[] {
  return load().etfs.filter((e) => !e.inTopAum);
}

/** Lookup a single ETF by ticker */
export function getEtfByTicker(ticker: string): EtfEntry | null {
  const upper = ticker.toUpperCase();
  return load().etfs.find((e) => e.ticker.toUpperCase() === upper) ?? null;
}

/** Filter by category (case-insensitive substring match) */
export function getEtfsByCategory(category: string): EtfEntry[] {
  const lower = category.toLowerCase();
  return load().etfs.filter((e) => e.category?.toLowerCase().includes(lower));
}

/** Universe metadata (counts, build timestamp) */
export function getUniverseMeta(): Omit<EtfUniverse, "etfs"> {
  const { etfs: _, ...meta } = load();
  return meta;
}

/** Invalidate the in-memory cache (use after rebuilding) */
export function invalidateCache(): void {
  _cache = null;
}
