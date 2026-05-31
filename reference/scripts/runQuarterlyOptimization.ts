/**
 * Quarterly Tax Optimization Runner
 *
 * Reads client portfolio snapshots from data/clients/*.json,
 * runs the full four-stage optimization pipeline on each client,
 * writes results to data/optimization-reports/<clientId>-<quarter>.json,
 * and prints a summary to stdout.
 *
 * Run manually:
 *   npx ts-node --project tsconfig.json scripts/runQuarterlyOptimization.ts
 *
 * Run dry (analyze only, no files written):
 *   npx ts-node --project tsconfig.json scripts/runQuarterlyOptimization.ts --dry-run
 *
 * GitHub Actions cron (quarterly — Jan 1, Apr 1, Jul 1, Oct 1 at 9am UTC):
 *   schedule:
 *     - cron: '0 9 1 1,4,7,10 *'
 *
 * Client snapshot files live at data/clients/<clientId>.json
 * and follow the ClientSnapshot schema from lib/optimization/types.ts.
 * They are gitignored — never commit client data.
 *
 * IMPORTANT: Client data files may contain sensitive financial information.
 * Ensure data/clients/ is in .gitignore and that file permissions restrict
 * access appropriately in production environments.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { ClientSnapshotSchema } from "../lib/optimization/types";
import { runQuarterlyOptimization } from "../lib/optimization/quarterlyOptimizer";
import type { QuarterlyOptimizationReport } from "../lib/optimization/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const CLIENTS_DIR = path.join(ROOT, "data", "clients");
const REPORTS_DIR = path.join(ROOT, "data", "optimization-reports");

const DRY_RUN = process.argv.includes("--dry-run");

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function quarterSlug(dateStr: string): string {
  const month = new Date(dateStr).getMonth() + 1;
  const year = new Date(dateStr).getFullYear();
  const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return `Q${q}-${year}`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"═".repeat(65)}`);
  console.log(`  Quarterly Tax Optimization Runner`);
  console.log(`  ${DRY_RUN ? "DRY RUN — reports will not be written" : "LIVE — reports will be written"}`);
  console.log(`  ${new Date().toISOString()}`);
  console.log(`${"═".repeat(65)}\n`);

  // Ensure directories exist
  if (!fs.existsSync(CLIENTS_DIR)) {
    console.log(`  No clients directory found at data/clients/`);
    console.log(`  Create data/clients/<clientId>.json files to run optimization.\n`);
    console.log(`  Example client snapshot: data/clients/example-client.json`);
    writeExampleClient();
    return;
  }

  if (!DRY_RUN && !fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  // Load all client snapshot files
  const clientFiles = fs.readdirSync(CLIENTS_DIR).filter((f) => f.endsWith(".json"));

  if (clientFiles.length === 0) {
    console.log(`  No client JSON files found in data/clients/\n`);
    return;
  }

  console.log(`  Found ${clientFiles.length} client snapshot(s)\n`);

  const results: Array<{
    clientId: string;
    success: boolean;
    report?: QuarterlyOptimizationReport;
    error?: string;
  }> = [];

  for (const file of clientFiles) {
    const filePath = path.join(CLIENTS_DIR, file);
    console.log(`── Client: ${file} ──────────────────────────────`);

    // Parse and validate snapshot
    let rawData: unknown;
    try {
      rawData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      console.error(`  ✗ Failed to parse JSON: ${file}`);
      results.push({ clientId: file, success: false, error: "JSON parse error" });
      continue;
    }

    const parsed = ClientSnapshotSchema.safeParse(rawData);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      console.error(`  ✗ Schema validation failed:`);
      for (const [field, errs] of Object.entries(issues)) {
        console.error(`    ${field}: ${errs?.join(", ")}`);
      }
      results.push({ clientId: file, success: false, error: "Schema validation failed" });
      continue;
    }

    const snapshot = parsed.data;
    console.log(`  Client ID: ${snapshot.clientId}`);
    console.log(`  As-of date: ${snapshot.asOfDate}`);
    console.log(`  Holdings: ${snapshot.holdings.length} positions`);

    // Run optimization pipeline
    let report: QuarterlyOptimizationReport;
    try {
      report = runQuarterlyOptimization(snapshot);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ Optimization failed: ${msg}`);
      results.push({ clientId: snapshot.clientId, success: false, error: msg });
      continue;
    }

    // Print summary
    console.log(`\n  ── ${report.quarter} Optimization Summary ──`);
    console.log(`  Estimated savings this year:  ${fmt(report.totalEstimatedSavingsThisYear)}`);
    console.log(`  Estimated long-term savings:  ${fmt(report.totalEstimatedSavingsLongTerm)}`);
    console.log(`  Actions recommended:          ${report.actions.length}`);

    const urgent = report.actions.filter((a) => a.priority === "urgent");
    const high   = report.actions.filter((a) => a.priority === "high");
    if (urgent.length > 0) console.log(`  🚨 Urgent actions:            ${urgent.length}`);
    if (high.length > 0)   console.log(`  ⚡ High-priority actions:     ${high.length}`);

    console.log(`\n  Actions:`);
    for (const action of report.actions) {
      const icon = action.priority === "urgent" ? "🚨" : action.priority === "high" ? "⚡" : "·";
      console.log(`  ${icon} [${action.category.padEnd(16)}] ${action.title}`);
      console.log(`    Impact: ${action.impactLabel}${action.deadline ? ` | Deadline: ${action.deadline}` : ""}`);
    }

    if (report.noActionNeeded.length > 0) {
      console.log(`\n  ✓ No action needed:`);
      for (const item of report.noActionNeeded) {
        console.log(`    · ${item}`);
      }
    }

    console.log(`\n  Processing notes:`);
    for (const note of report.processingNotes) {
      console.log(`    · ${note}`);
    }

    // Write report
    if (!DRY_RUN) {
      const slug = quarterSlug(snapshot.asOfDate);
      const reportPath = path.join(REPORTS_DIR, `${snapshot.clientId}-${slug}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
      console.log(`\n  ✓ Report written: ${path.relative(ROOT, reportPath)}`);
    } else {
      console.log(`\n  (dry run — report not written)`);
    }

    results.push({ clientId: snapshot.clientId, success: true, report });
    console.log();
  }

  // ── Final summary ──────────────────────────────────────────────────────
  console.log(`${"═".repeat(65)}`);
  console.log(`  Summary: ${results.filter((r) => r.success).length}/${results.length} clients processed successfully`);
  for (const r of results) {
    const icon = r.success ? "✓" : "✗";
    const savings = r.report ? `  ${fmt(r.report.totalEstimatedSavingsThisYear)} savings identified` : "";
    console.log(`  ${icon}  ${r.clientId}${savings}${r.error ? `  ERROR: ${r.error}` : ""}`);
  }
  console.log(`${"═".repeat(65)}\n`);
}

// ── Example client file ────────────────────────────────────────────────────

function writeExampleClient() {
  const exampleDir = path.join(ROOT, "data", "clients");
  fs.mkdirSync(exampleDir, { recursive: true });

  const example = {
    clientId: "example-client",
    asOfDate: new Date().toISOString().slice(0, 10),
    holdings: [
      {
        ticker: "VTI", name: "Vanguard Total Market ETF",
        shares: 50, costBasisPerShare: 200, currentPricePerShare: 255,
        purchaseDate: "2022-03-01", accountType: "taxable_brokerage",
        isRealEstate: false, depreciationTaken: 0,
      },
      {
        ticker: "VXUS", name: "Vanguard Total International ETF",
        shares: 100, costBasisPerShare: 60, currentPricePerShare: 52,
        purchaseDate: "2023-06-01", accountType: "taxable_brokerage",
        isRealEstate: false, depreciationTaken: 0,
      },
      {
        ticker: "BND", name: "Vanguard Total Bond ETF",
        shares: 200, costBasisPerShare: 77, currentPricePerShare: 71,
        purchaseDate: "2023-03-15", accountType: "traditional_401k",
        isRealEstate: false, depreciationTaken: 0,
      },
      {
        ticker: "VTI", name: "Vanguard Total Market ETF",
        shares: 30, costBasisPerShare: 180, currentPricePerShare: 255,
        purchaseDate: "2021-01-01", accountType: "roth_ira",
        isRealEstate: false, depreciationTaken: 0,
      },
    ],
    taxProfile: {
      grossIncome: 120000,
      filingStatus: "single",
      state: "OR",
      age: 35,
      federalMarginalRate: 0.22,
      combinedMarginalRate: 0.30,
      ltcgRate: 0.15,
      stateLtcgRate: 0.09,
      itemizedDeductions: 0,
    },
    retirement: {
      traditionalIraBalance: 45000,
      rothIraBalance: 18000,
      nonDeductibleIraBasis: 0,
      expectedRetirementMarginalRate: 0.22,
      yearsToRetirement: 30,
      expectedAnnualReturn: 0.07,
    },
    ytdGains: {
      realizedShortTermGains: 0,
      realizedLongTermGains: 1500,
      shortTermLossCarryforward: 0,
      longTermLossCarryforward: 0,
    },
    targetWeights: { VTI: 0.50, VXUS: 0.20, BND: 0.30 },
    monthlyContributions: { traditional_401k: 500, roth_ira: 200 },
    minimumActionThreshold: 500,
    rebalanceDriftThreshold: 0.05,
    estimatedTradeCostDollars: 0,
  };

  const examplePath = path.join(exampleDir, "example-client.json");
  fs.writeFileSync(examplePath, JSON.stringify(example, null, 2), "utf-8");
  console.log(`  ✓ Example client file written: data/clients/example-client.json`);
  console.log(`  Edit it with real client data, then re-run this script.\n`);
}

main().catch((err) => {
  console.error("Runner failed:", err.message);
  process.exit(1);
});
