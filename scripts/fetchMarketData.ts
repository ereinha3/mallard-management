/**
 * Historical Market Data Fetcher
 *
 * Fetches 20 years of daily OHLCV data for all 1,000 ETFs in the universe
 * using yahoo-finance2. Outputs one CSV per ticker to data/market-data/.
 *
 * Run:
 *   npx ts-node --project tsconfig.json scripts/fetchMarketData.ts
 *
 * Resume after interruption (skips already-downloaded files):
 *   npx ts-node --project tsconfig.json scripts/fetchMarketData.ts
 *
 * Force re-download everything:
 *   npx ts-node --project tsconfig.json scripts/fetchMarketData.ts --force
 *
 * Test with first 10 ETFs only:
 *   npx ts-node --project tsconfig.json scripts/fetchMarketData.ts --limit 10
 *
 * Output layout:
 *   data/market-data/<TICKER>.csv     — daily OHLCV + adjClose, one row per day
 *   data/market-data/manifest.json    — metadata: date range, row count, status per ticker
 *
 * CSV columns: date,open,high,low,close,adjClose,volume
 *
 * Rate limiting:
 *   Fetches 5 tickers at a time, 1.2s pause between batches.
 *   Each ticker retried up to 3 times with exponential backoff on failure.
 *   ~1,000 tickers takes roughly 30–45 minutes total.
 *
 * NOTE: data/market-data/ is gitignored — never commit market data to the repo.
 *       Share the output directory directly with Ethan (zip or shared drive).
 */

import YahooFinanceModule from "yahoo-finance2";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.join(__dirname, "..");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const YahooFinance = YahooFinanceModule as any;
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

// ── Config ─────────────────────────────────────────────────────────────────

const UNIVERSE_FILE  = path.join(ROOT, "data", "etf-universe.json");
const OUTPUT_DIR     = path.join(ROOT, "data", "market-data");
const MANIFEST_FILE  = path.join(OUTPUT_DIR, "manifest.json");

const FORCE_REDOWNLOAD = process.argv.includes("--force");
const LIMIT_ARG        = process.argv.indexOf("--limit");
const MAX_TICKERS      = LIMIT_ARG !== -1 ? parseInt(process.argv[LIMIT_ARG + 1], 10) : Infinity;

// Date range: 20 years back from today
const TODAY      = new Date();
const PERIOD_END = TODAY.toISOString().slice(0, 10);
const PERIOD_START = new Date(
  TODAY.getFullYear() - 20, TODAY.getMonth(), TODAY.getDate()
).toISOString().slice(0, 10);

const BATCH_SIZE       = 5;      // tickers fetched in parallel per batch
const BATCH_PAUSE_MS   = 1200;   // pause between batches (ms) — keeps Yahoo happy
const MAX_RETRIES      = 3;
const RETRY_BASE_MS    = 2000;   // base backoff — doubles each retry

// ── Types ──────────────────────────────────────────────────────────────────

interface ManifestEntry {
  ticker: string;
  status: "success" | "failed" | "empty" | "skipped";
  rows: number;
  startDate: string | null;
  endDate: string | null;
  downloadedAt: string;
  error?: string;
}

interface Manifest {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  totalTickers: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalRows: number;
  entries: ManifestEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function csvEscape(v: string | number): string {
  return String(v);
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "date,open,high,low,close,adjClose,volume\n";
  const lines = ["date,open,high,low,close,adjClose,volume"];
  for (const row of rows) {
    const d = row.date instanceof Date
      ? (row.date as Date).toISOString().slice(0, 10)
      : String(row.date).slice(0, 10);
    lines.push(
      [
        d,
        csvEscape((row.open as number)?.toFixed(4) ?? ""),
        csvEscape((row.high as number)?.toFixed(4) ?? ""),
        csvEscape((row.low  as number)?.toFixed(4) ?? ""),
        csvEscape((row.close as number)?.toFixed(4) ?? ""),
        csvEscape((row.adjClose as number)?.toFixed(4) ?? ""),
        csvEscape(String(row.volume ?? 0)),
      ].join(",")
    );
  }
  return lines.join("\n") + "\n";
}

function loadManifest(): Manifest {
  if (fs.existsSync(MANIFEST_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8")) as Manifest;
    } catch { /* fall through */ }
  }
  return {
    generatedAt: new Date().toISOString(),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    totalTickers: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    totalRows: 0,
    entries: [],
  };
}

function saveManifest(manifest: Manifest) {
  manifest.generatedAt = new Date().toISOString();
  manifest.succeeded   = manifest.entries.filter((e) => e.status === "success").length;
  manifest.failed      = manifest.entries.filter((e) => e.status === "failed" || e.status === "empty").length;
  manifest.skipped     = manifest.entries.filter((e) => e.status === "skipped").length;
  manifest.totalRows   = manifest.entries.reduce((s, e) => s + e.rows, 0);
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf-8");
}

// ── Fetch one ticker ───────────────────────────────────────────────────────

async function fetchTicker(ticker: string): Promise<ManifestEntry> {
  const outFile = path.join(OUTPUT_DIR, `${ticker}.csv`);

  // Skip if already downloaded (unless --force)
  if (!FORCE_REDOWNLOAD && fs.existsSync(outFile)) {
    const existing = fs.readFileSync(outFile, "utf-8").trim().split("\n");
    const rows = existing.length - 1; // minus header
    if (rows > 0) {
      const dates = existing.slice(1).map((l) => l.split(",")[0]);
      return {
        ticker,
        status: "skipped",
        rows,
        startDate: dates[0] ?? null,
        endDate: dates[dates.length - 1] ?? null,
        downloadedAt: new Date().toISOString(),
      };
    }
  }

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any[] = await yf.historical(ticker, {
        period1: PERIOD_START,
        period2: PERIOD_END,
        interval: "1d",
      });

      if (!data || data.length === 0) {
        return {
          ticker,
          status: "empty",
          rows: 0,
          startDate: null,
          endDate: null,
          downloadedAt: new Date().toISOString(),
          error: "Yahoo returned 0 rows (ETF may be too new or delisted)",
        };
      }

      // Sort ascending by date
      data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const csv = rowsToCsv(data as Record<string, unknown>[]);
      fs.writeFileSync(outFile, csv, "utf-8");

      const dates = data.map((r) =>
        (r.date instanceof Date ? r.date : new Date(r.date)).toISOString().slice(0, 10)
      );

      return {
        ticker,
        status: "success",
        rows: data.length,
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        downloadedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        await sleep(backoff);
      }
    }
  }

  return {
    ticker,
    status: "failed",
    rows: 0,
    startDate: null,
    endDate: null,
    downloadedAt: new Date().toISOString(),
    error: lastError,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"═".repeat(65)}`);
  console.log(`  Historical Market Data Fetcher`);
  console.log(`  Period: ${PERIOD_START} → ${PERIOD_END}  (20 years)`);
  console.log(`  Force re-download: ${FORCE_REDOWNLOAD}`);
  if (MAX_TICKERS !== Infinity) console.log(`  Limit: first ${MAX_TICKERS} tickers`);
  console.log(`${"═".repeat(65)}\n`);

  // Load ETF universe
  if (!fs.existsSync(UNIVERSE_FILE)) {
    console.error(`  ✗ ETF universe not found: ${UNIVERSE_FILE}`);
    console.error(`  Run: npm run build-etf-universe first`);
    process.exit(1);
  }
  const universe = JSON.parse(fs.readFileSync(UNIVERSE_FILE, "utf-8"));
  const allTickers: string[] = universe.etfs.map((e: { ticker: string }) => e.ticker);
  const tickers = MAX_TICKERS === Infinity ? allTickers : allTickers.slice(0, MAX_TICKERS);

  console.log(`  Universe: ${allTickers.length} ETFs total`);
  console.log(`  Processing: ${tickers.length} tickers`);
  console.log(`  Output: ${OUTPUT_DIR}\n`);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load existing manifest (for resume support)
  const manifest = loadManifest();
  manifest.totalTickers = tickers.length;
  manifest.periodStart  = PERIOD_START;
  manifest.periodEnd    = PERIOD_END;

  // Build index of already-processed tickers from manifest
  const processed = new Map<string, ManifestEntry>(
    manifest.entries.map((e) => [e.ticker, e])
  );

  // Determine which tickers still need fetching
  const toFetch = FORCE_REDOWNLOAD
    ? tickers
    : tickers.filter((t) => {
        const existing = processed.get(t);
        // Re-fetch if previously failed or empty; skip if success or skipped
        return !existing || existing.status === "failed";
      });

  const alreadyDone = tickers.length - toFetch.length;
  if (alreadyDone > 0) {
    console.log(`  Resuming: ${alreadyDone} already downloaded, ${toFetch.length} remaining\n`);
  }

  if (toFetch.length === 0) {
    console.log("  All tickers already downloaded. Use --force to re-download.\n");
    saveManifest(manifest);
    printSummary(manifest);
    return;
  }

  // Estimated time
  const batchCount = Math.ceil(toFetch.length / BATCH_SIZE);
  const estimatedMinutes = Math.round((batchCount * BATCH_PAUSE_MS) / 60000 + toFetch.length * 1.5 / 60);
  console.log(`  Batches: ${batchCount} × ${BATCH_SIZE} tickers  |  Est. time: ~${estimatedMinutes} min\n`);

  let done = alreadyDone;
  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);

    // Fetch batch in parallel
    const results = await Promise.all(batch.map((ticker) => fetchTicker(ticker)));

    // Update manifest
    for (const entry of results) {
      processed.set(entry.ticker, entry);
      done++;

      const icon =
        entry.status === "success" ? "✓" :
        entry.status === "skipped" ? "·" :
        entry.status === "empty"   ? "○" : "✗";

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rowInfo = entry.rows > 0 ? `  ${entry.rows} rows  ${entry.startDate}→${entry.endDate}` : "";
      const errInfo = entry.error ? `  ⚠ ${entry.error.slice(0, 60)}` : "";
      console.log(
        `  ${icon} [${String(done).padStart(4)}/${tickers.length}] ${entry.ticker.padEnd(8)}` +
        `${rowInfo}${errInfo}  (${elapsed}s elapsed)`
      );
    }

    // Save manifest after every batch so progress survives interruption
    manifest.entries = [...processed.values()].filter((e) => tickers.includes(e.ticker));
    saveManifest(manifest);

    // Rate-limit pause between batches (skip after last batch)
    if (i + BATCH_SIZE < toFetch.length) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  console.log(`\n${"─".repeat(65)}`);
  printSummary(manifest);
}

function printSummary(manifest: Manifest) {
  console.log(`${"═".repeat(65)}`);
  console.log(`  Summary`);
  console.log(`  ✓ Succeeded:  ${manifest.succeeded.toString().padStart(5)} tickers`);
  console.log(`  · Skipped:    ${manifest.skipped.toString().padStart(5)} (already downloaded)`);
  console.log(`  ✗ Failed:     ${manifest.failed.toString().padStart(5)} tickers`);
  console.log(`  Total rows:   ${manifest.totalRows.toLocaleString()} data points`);
  console.log(`  Manifest:     data/market-data/manifest.json`);

  // Estimate compressed size
  const approxMB = Math.round(manifest.totalRows * 52 / 1_000_000);
  console.log(`  Est. size:    ~${approxMB} MB uncompressed CSV`);

  if (manifest.failed > 0) {
    const failed = manifest.entries.filter((e) => e.status === "failed" || e.status === "empty");
    console.log(`\n  Failed tickers (re-run script to retry):`);
    for (const f of failed.slice(0, 20)) {
      console.log(`    ✗ ${f.ticker.padEnd(8)} ${f.error?.slice(0, 60) ?? ""}`);
    }
    if (failed.length > 20) console.log(`    ... and ${failed.length - 20} more`);
  }

  console.log(`${"═".repeat(65)}\n`);
  console.log(`  Next steps:`);
  console.log(`  1. Zip data/market-data/ and share with Ethan`);
  console.log(`  2. manifest.json lists every ticker, row count, and date range`);
  console.log(`  3. Re-run this script anytime to fetch missing tickers\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
