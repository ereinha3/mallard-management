# Sharpe Audit — why greenlight_erc trails SPY (2026-05-31)

**Trigger:** 21-year walk-forward backtest (2005–2026) showed `greenlight_erc`
Sharpe 0.68 vs SPY 0.78, despite our risk-aware thesis. Three independent
Codex auditors ran read-only diagnostics against `engine/data/greenlight.db`
with the *identical* prompt. They converged strongly. This file is the
canonical record + the parallel remediation plan.

## Backtest result under audit

| strategy | CAGR | Sharpe | Sortino | maxDD | Calmar |
|---|---|---|---|---|---|
| greenlight_erc | 3.4% | 0.68 | 1.14 | **−14.3%** | 0.24 |
| SPY (100% S&P 500) | 11.2% | **0.78** | 1.19 | −50.8% | 0.22 |
| 60/40 | 7.3% | 0.69 | 1.01 | −44.3% | 0.16 |
| target_date | 7.2% | 0.61 | 0.88 | −47.9% | 0.15 |
| naive_mvo (in-sample) | 3.7% | 1.02 | 1.59 | −10.7% | 0.35 |

## Root cause (3/3 auditors, DB-verified)

**The CAL "safe" sleeve is not safe, so the two-fund blend collapses.**
`solve_blend_alpha` (`engine/optimizer/blend.py:38`) returns `0.0` whenever
`target_vol ≤ safe_vol`. The "safe" sleeve includes long Treasuries, high
yield, EM debt, IG credit, MBS, munis, TIPS — measured vol **~21%** (auditor 3),
above the 14.5% target in **67 of 84 rebalances** (auditor 2). Net result: the
strategy averaged **~3.3% risky exposure / ~95% bonds**. We are not losing on
Sharpe because risk-parity is inferior — we are ~95% in mislabeled bonds.

> **Counterfactual (auditor 3, read-only):** swapping in a genuine
> cash/short-duration defensive sleeve lifted **Sharpe to ~1.0–1.2 with
> maxDD ~−6%** — i.e. it flips us to beating SPY's Sharpe while cutting
> drawdown ~8×.

## Consensus findings

| # | Sev | Finding | Agree | Evidence | Class |
|---|-----|---------|-------|----------|-------|
| 1 | 🔴 | CAL "safe" sleeve credit/duration-heavy → α≈0 → ~95% bonds | 3/3 | `blend.py:38,272`; `universe_seed.py:83-93` | genuine flaw |
| 2 | 🔴 | Backtest profile has no `gamma_band` → tilt silently DISABLED → never tested the shipped pipeline | 3/3 | `run.py:107`; `blend.py:86`; `tilt.py:107` | genuine flaw |
| 3 | 🟠 | Flat ERC over 42 buckets dilutes broad beta (`us_total_market`~1.8% vs `gold` 8%, `bank_loans` 7.9%, `em_bonds` 4.8%) | 3/3 | `erc.py:137`; `blend.py:239` | genuine flaw |
| 4 | 🟠 | Missing `market_weight` defaults to `1.0` → explicit weights (BND 0.20→1.9%, TIP 0.05→0.4%) diluted | 3/3 | `loaders.py:195,200,212` | genuine flaw |
| 5 | 🟠 | Covariance drops any-NaN rows (`_finite_return_values`) → collapses to ~2013 common interval; sleeve-fallback fabricates histories | 3/3 | `erc.py:11`; `loaders.py:251`; `blend.py:143` | genuine flaw |
| 6 | 🟡 | Low-Sharpe satellites get equal risk budget (clean energy Sharpe 0.10/maxDD −91%, commodities 0.12/−83%, China 0.34); expense/AUM/ADV metadata unused in selection | 3/3 | `universe_seed.py:63-105` | genuine flaw |
| 7 | 🟡 | Tilt signal = `z(momentum) + z(volatility)` → rewards raw vol, not risk-adjusted return | 3/3 | `tilt.py:113-115` | genuine flaw (when enabled) |
| 8 | 🟡 | ERC has no return/Sharpe awareness; only `naive_mvo` does (overfits) | #3 | `erc.py:129` | genuine flaw |

**Disagreement:** Auditor #2 claimed preference→vol is too conservative
(neutral→11.5%). Auditors #1 & #3 checked the math and disagreed — GL-30 → 14.5%,
aggressive >20%, which is reasonable; the mapping is fine, the *safe sleeve* is
what makes the target unreachable. **Resolution: do NOT change the gamma→vol
mapping; fix the sleeve.**

**Era verdict (unanimous):** trailing SPY on Sharpe over 2005–26 is *partly*
defensible (US large-growth anomaly; we win drawdown −14% vs −51% and Calmar
0.24 vs 0.22), **but that is not cover for the construction flaws** — the Sharpe
shortfall indicts the implementation more than the thesis.

---

## Parallel remediation plan (collision-free Codex modules)

Naive "one agent per finding" collides badly: `loaders.py` is touched by 1/2/5/6,
`blend.py` by 3/5/8. The decomposition below assigns **exclusive file ownership**
so write-agents never touch the same file. Codex `--write` agents edit disjoint
files in the main tree, **do not run git, do not commit, and add new tests in NEW
files** (flag any needed change to a shared existing test to the orchestrator).
Orchestrator validates + commits per module.

### ✅ Wave 0 — FROZEN CONTRACT (landed 2026-05-31)

This is the stable contract Wave-1 agents code against. **Do not change these
without orchestrator sign-off.**

**Sleeve literal** (`engine/schemas/models.py` + `backend/models.py`, kept in
sync) — now:
```
us_equity, intl_equity, gold, reits, real_assets,   # equities + real assets
bonds, tips,                                          # back-compat (legacy)
cash_like, core_bonds, credit, duration_hedge, inflation  # NEW fixed-income split
```
**Role principle (Module A implements):** only `cash_like` (T-bills / short
Treasury / floating-rate, e.g. SHV/BIL/SHY/VGSH/FLOT) is `role=safe` and serves
as the CAL risk-free leg. `core_bonds`, `credit`, `duration_hedge`, `inflation`
are `role=risky` *diversifiers* with caps. A may retire the legacy `bonds`/`tips`
sleeves once instruments are remapped.

**Frozen `Universe` interface** (loaders.py output, consumed by C1/C2/B): must
keep exposing `tickers`, `sleeves`, `buckets`, `risky_sleeves`, `safe_sleeves`,
`risky_buckets`, `safe_buckets`, `market_weights`, `bucket_market_weights`,
`excluded`. Risky/safe partition flows from instrument `role` → agents read the
partition, never hardcode it.

**Frozen public signatures** (internals may change, signatures may NOT):
`erc_weights(returns)`, `cov_ledoit_wolf(returns)`, `risk_contributions(...)`,
`build_target_weights(risk_profile, universe, prices)`,
`solve_blend_alpha(sigma_risky, sigma_safe, rho, sigma_target)`,
`momentum_vol_tilt(erc_weights, sleeve_returns, gamma, *, lookback_months, lam)`.

**Status:** Sleeve literal extended; 72 engine + 45 backend tests green. Wave 1
(A, B, C1, C2, D) + Module G may now fan out in parallel.

---

### Wave 0 — Contract freeze (orchestrator, ~15 min, BLOCKS Wave 1)
Freeze the `Universe` interface and add new sleeve names so agents code against a
stable contract.
- **Owns:** `engine/schemas/models.py` (`Sleeve` literal), `backend/models.py`
  (`Sleeve`), this doc's "Universe contract" note.
- **Action:** extend `Sleeve` with `cash_like`, `credit`, `duration_hedge`
  (keep `bonds`/`tips` for back-compat). Guarantee `Universe` still exposes
  `risky_buckets`, `safe_buckets`, `market_weights`, `bucket_market_weights`,
  `sleeves`, `buckets`. Public optimizer signatures (`erc_weights`,
  `cov_ledoit_wolf`, `build_target_weights`, `solve_blend_alpha`,
  `momentum_vol_tilt`) are FROZEN — internals may change, signatures may not.

### Wave 1 — Parallel implementation (5 disjoint write-agents)

| Mod | Fixes | Owns (exclusive write) | New tests | Notes |
|-----|-------|------------------------|-----------|-------|
| **A — Defensive sleeve + weights + screens** ⭐ | 1, 2, 6 | `engine/data/universe_seed.py`, `engine/data/loaders.py` | `test_safe_sleeve.py`, `test_universe_weights.py` | THE win. Reclassify bonds: only cash/short-duration (SHY/VGSH/FLOT/VTIP-like) stay `role=safe`; long-duration/credit/HY/EM-debt → `risky` diversifiers (capped). Fix `market_weight` default `1.0`→missing. Add liquidity/expense/min-history screens using existing metadata. |
| **B — Backtest harness + real profile + diagnostics** | 3 | `engine/backtest/run.py` | extend `test_backtest.py` (B owns it) | Build a real `RiskProfile` (with `gamma_band`) per rebalance; emit α, risky/safe vol, tilt turnover into the artifact. The MEASUREMENT module. |
| **C1 — Ragged-history covariance** | 5 | `engine/optimizer/erc.py` | `test_ragged_cov.py` | Pairwise-complete covariance + constant-corr target + Ledoit-Wolf shrinkage + PSD repair; complete matrices unchanged (72 tests stay green). |
| **C2 — Hierarchical ERC + Sharpe-aware overlay** | 3-share, 8 | `engine/optimizer/blend.py` | `test_hierarchical_erc.py` | Core/satellite risk budgeting: allocate across sleeves first, cap sectors/themes; optional return-floor / max-diversification haircut for chronic low-Sharpe buckets. Keep `_group_returns` ragged (`how="all"`). |
| **D — Risk-adjusted tilt** | 7 | `engine/optimizer/tilt.py` | extend `test_tilt.py` (D owns it) | Replace `z(mom)+z(vol)` with risk-adjusted momentum + trend filter + per-bucket caps; never boost on raw vol. |

All five files are disjoint → true 5-way parallelism after Wave 0.

### Wave 2 — Integration (orchestrator)
Files are disjoint so merges are conflict-free. Commit **A first**, re-run the
backtest (using B's harness) and re-measure Sharpe — A alone should flip the
result. Then layer C1, C2, D, re-measuring after each. Run 72 engine + 45 backend
tests at every step. Iterate.

### Dependency notes
- Wave 0 blocks Wave 1 (sleeve literal + contract).
- Within Wave 1: file-disjoint, so technically independent. Logical coupling
  (A's taxonomy ↔ C2's hierarchy) is resolved by the frozen `Universe` contract;
  the real interaction surfaces only in Wave 2 integration.
- **Module G (Black-Litterman / CVaR)** can run in parallel too, BUT it must own
  only `engine/optimizer/black_litterman.py`, `engine/optimizer/cvar.py`, and the
  frontend toggle — it must NOT edit `blend.py` (owned by C2). The one-line BL/CVaR
  hookup into `build_target_weights` is deferred to Wave 2 integration.

### Honest caveats
- A is dominant; C1/C2/D are incremental (+0.05–0.20 Sharpe each per auditors).
  If an agent fails, A alone likely beats SPY's Sharpe.
- C2 is the riskiest (allocation redesign); scope conservatively (core/satellite
  caps) to keep `test_optimizer.py` green.
- With <6h, A+B+C1 are the safe critical path; C2/D/G are stretch.
