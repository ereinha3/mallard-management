/**
 * Quarterly Tax Constants Updater
 *
 * Uses Google Gemini to research the latest IRS tax data and automatically
 * patch lib/tax/constants.ts, lib/tax/stateTax.ts, and lib/location/localTax.ts
 * with current-year figures.
 *
 * Designed to run as part of the quarterly portfolio rebalance job.
 * Requires GEMINI_API_KEY in .env.local (never commit the key).
 *
 * Run with:
 *   npx ts-node --project tsconfig.json scripts/updateTaxConstants.ts
 *
 * What it does:
 *   1. Asks Gemini to research current IRS tax constants for the current year
 *   2. Asks Gemini to research current state income tax rates
 *   3. Asks Gemini to generate updated TypeScript for each constants file
 *   4. Writes the updated files (with a dry-run mode to preview first)
 *   5. Runs tsc --noEmit to confirm no type errors before saving
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

// ── Load env ───────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found — add GEMINI_API_KEY=your-key to it");
  }
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
}

// ── Paths ──────────────────────────────────────────────────────────────────

const FILES = {
  constants:  path.join(ROOT, "lib/tax/constants.ts"),
  stateTax:   path.join(ROOT, "lib/tax/stateTax.ts"),
  localTax:   path.join(ROOT, "lib/location/localTax.ts"),
};

// ── Prompts ────────────────────────────────────────────────────────────────

function buildFederalPrompt(currentYear: number, currentSource: string): string {
  return `
You are a US tax law expert and TypeScript developer.
Today's date is ${new Date().toISOString().slice(0, 10)}.
The current tax year is ${currentYear}.

Your job is to update the TypeScript file below with the most current IRS tax constants.
Research the latest IRS figures for tax year ${currentYear} and update every number accordingly.

Key things to update:
- Federal income tax brackets for all 4 filing statuses (single, MFJ, MFS, HOH)
- Standard deductions for all filing statuses
- Additional standard deduction for age 65+
- Social Security wage base
- LTCG / Qualified dividend brackets for all filing statuses
- NIIT threshold (check if still $200k/$250k or if Congress changed it)
- 401k contribution limit and catch-up amounts
- IRA contribution limit and catch-up amount
- HSA limits (individual, family, catch-up)
- Roth IRA income phase-out ranges for all filing statuses
- TAX_YEAR constant

Rules:
- Return ONLY the complete updated TypeScript file contents, no explanation, no markdown fences
- Preserve all existing imports, interfaces, and exported function signatures exactly
- Update ONLY the numeric constants — do not change the structure, comments format, or logic
- Add a comment on the first line: // Updated by Gemini on ${new Date().toISOString().slice(0, 10)}
- If a value is unchanged from last year, keep it but note "// unchanged" inline
- Every bracket threshold must be accurate to the dollar

CURRENT FILE CONTENTS:
${currentSource}
`;
}

function buildStatePrompt(currentYear: number, currentSource: string): string {
  return `
You are a US state tax law expert and TypeScript developer.
Today's date is ${new Date().toISOString().slice(0, 10)}.
The current tax year is ${currentYear}.

Your job is to update the TypeScript file below with the most current state income tax rates for all 50 states + DC.

Key things to check and update for EACH state:
- Any flat-rate changes (many states have been cutting rates with phasedown schedules)
- Any bracket threshold inflation adjustments
- States that changed from graduated to flat (like Arizona, Iowa)
- New states with no income tax
- Washington state: note current capital gains tax tiers and thresholds
- Massachusetts: confirm millionaires tax surtax threshold
- State-specific deduction amounts

Rules:
- Return ONLY the complete updated TypeScript file contents, no explanation, no markdown fences
- Preserve all existing imports, interfaces, and exported function signatures exactly
- Update ONLY the numeric constants and notes — do not change the function logic
- Add a comment on the first line: // Updated by Gemini on ${new Date().toISOString().slice(0, 10)}
- Every rate and threshold must be accurate for tax year ${currentYear}
- For states you're not certain about, keep existing values and add a // NOTE: verify comment

CURRENT FILE CONTENTS:
${currentSource}
`;
}

function buildLocalPrompt(currentYear: number, currentSource: string): string {
  return `
You are a US local/city tax law expert and TypeScript developer.
Today's date is ${new Date().toISOString().slice(0, 10)}.
The current tax year is ${currentYear}.

Your job is to update the TypeScript file below with the most current city/local income tax rates.

Key things to check:
- Philadelphia wage tax (changes annually — check official city rate)
- NYC local tax brackets
- Any Ohio cities that changed rates
- Any Michigan cities that changed rates
- Any new cities that have adopted a local income tax
- Kentucky occupational taxes
- Portland OR Metro and Multnomah County rates (these have changed recently)

Rules:
- Return ONLY the complete updated TypeScript file contents, no explanation, no markdown fences
- Preserve all existing imports, interfaces, and exported function signatures exactly
- Update ONLY the rate values and notes — do not change the function logic
- Add a comment on the first line: // Updated by Gemini on ${new Date().toISOString().slice(0, 10)}
- For rates you're not certain about, keep existing values and add a // NOTE: verify comment

CURRENT FILE CONTENTS:
${currentSource}
`;
}

// ── Gemini call ────────────────────────────────────────────────────────────

async function askGemini(genAI: GoogleGenerativeAI, prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    generationConfig: {
      temperature: 0.1,   // low temperature — we want factual accuracy, not creativity
      maxOutputTokens: 16_000,
    },
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ── TypeScript validation ──────────────────────────────────────────────────

function validateTypeScript(tempFilePath: string): boolean {
  try {
    execSync(`npx tsc --noEmit --skipLibCheck ${tempFilePath}`, {
      cwd: ROOT,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

// ── Write with backup ──────────────────────────────────────────────────────

function writeWithBackup(filePath: string, newContent: string) {
  const backupPath = filePath + `.backup-${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  fs.writeFileSync(filePath, newContent, "utf-8");
  console.log(`  ✓ Written: ${path.relative(ROOT, filePath)}`);
  console.log(`  ↩ Backup:  ${path.relative(ROOT, backupPath)}`);
}

// ── Strip markdown fences if Gemini wraps in them ─────────────────────────

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:typescript|ts)?\n/m, "")
    .replace(/\n```\s*$/m, "")
    .trim();
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const DRY_RUN = process.argv.includes("--dry-run");
  const currentYear = new Date().getFullYear();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Quarterly Tax Constants Updater`);
  console.log(`  Tax year: ${currentYear}  |  ${DRY_RUN ? "DRY RUN — no files written" : "LIVE — will write files"}`);
  console.log(`${"═".repeat(60)}\n`);

  loadEnv();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your-new-key-here") {
    throw new Error("GEMINI_API_KEY not set in .env.local");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const results: Array<{ file: string; success: boolean; reason?: string }> = [];

  // ── Update each file ─────────────────────────────────────────────────

  const targets: Array<{
    key: keyof typeof FILES;
    label: string;
    buildPrompt: (year: number, src: string) => string;
  }> = [
    { key: "constants",  label: "Federal constants",  buildPrompt: buildFederalPrompt },
    { key: "stateTax",   label: "State tax rates",    buildPrompt: buildStatePrompt },
    { key: "localTax",   label: "Local/city tax rates", buildPrompt: buildLocalPrompt },
  ];

  for (const target of targets) {
    console.log(`\n── ${target.label} ──────────────────────────────`);
    const filePath = FILES[target.key];
    const currentSource = fs.readFileSync(filePath, "utf-8");

    console.log("  Asking Gemini for updated ${currentYear} values...");
    let updated: string;
    try {
      const raw = await askGemini(genAI, target.buildPrompt(currentYear, currentSource));
      updated = stripCodeFences(raw);
    } catch (err: any) {
      console.error(`  ✗ Gemini error: ${err.message}`);
      results.push({ file: target.key, success: false, reason: `Gemini error: ${err.message}` });
      continue;
    }

    if (DRY_RUN) {
      const previewLines = updated.split("\n").slice(0, 20).join("\n");
      console.log(`  Preview (first 20 lines):\n${previewLines}\n  ...`);
      results.push({ file: target.key, success: true, reason: "dry-run — not written" });
      continue;
    }

    // Validate TypeScript before writing
    const tempPath = filePath + ".tmp";
    fs.writeFileSync(tempPath, updated, "utf-8");
    const valid = validateTypeScript(tempPath);
    fs.unlinkSync(tempPath);

    if (!valid) {
      console.error(`  ✗ TypeScript validation failed — keeping original file`);
      results.push({ file: target.key, success: false, reason: "TypeScript errors in generated output" });
      continue;
    }

    writeWithBackup(filePath, updated);
    results.push({ file: target.key, success: true });

    // Brief pause between Gemini calls to avoid rate limiting
    await new Promise((r) => setTimeout(r, 2_000));
  }

  // ── Final tsc check on whole project ─────────────────────────────────

  if (!DRY_RUN) {
    console.log("\n── Full project TypeScript check ────────────────────");
    try {
      execSync("npx tsc --noEmit", { cwd: ROOT, stdio: "pipe" });
      console.log("  ✓ No TypeScript errors");
    } catch (err: any) {
      console.error("  ✗ TypeScript errors found — check files and backups");
      console.error(err.stdout?.toString() ?? err.message);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────

  console.log(`\n${"═".repeat(60)}`);
  console.log("  Summary:");
  for (const r of results) {
    const icon = r.success ? "✓" : "✗";
    console.log(`  ${icon}  ${r.file.padEnd(12)}  ${r.reason ?? "updated"}`);
  }
  console.log(`${"═".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("Update failed:", err.message);
  process.exit(1);
});
