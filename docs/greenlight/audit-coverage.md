# Greenlight — Implementation Coverage Audit

> **Purpose.** A complete, evidence-backed map of every component proposed in `docs/greenlight/` (the design specs) against what is actually implemented in this repo. Built so an implementing agent can read it cold, locate any gap by `file:line`, understand the precise spec-vs-code delta, and act.
>
> **How this was produced.** Six read-only Codex auditors, one per domain, each (1) read the relevant spec docs, (2) enumerated every proposed component, (3) verified it against the code with `file:line` evidence. No files were modified during the audit. This document consolidates and deepens their findings.
>
> **Repo / branch:** `mallard-management-active-v2` @ `ethan3`.
> **Audit date:** 2026-05-31.
> **Spec source of truth:** `docs/greenlight/01-e2e-design.md` (architecture), `05-contracts.md` (contracts + endpoint list), `02-research-foundations.md` (research), `07-elicitation-and-fusion.md` (risk fusion), `06-implementation-plan.md` (tasks), `03-dataflow-usecase.md`, `04-build-and-demo.md`, `data-bom.md`.

---

## How an agent should use this document

1. **To verify a claim "X is built":** find X in the per-domain tables (§3–§8). The `Evidence` column is the authoritative pointer.
2. **To fix a gap:** go to the **Gap Registry** (§10). Each gap has an ID (`G-NN`), severity, the exact files to touch, the required behavior, and acceptance criteria. Gaps are also cross-referenced from the domain tables.
3. **Before editing:** line numbers are *as-of the audit commit* and drift. Re-confirm with `rg`/`nl -ba` on the cited file before editing. Symbols (function/class names) are stable; prefer them as anchors.
4. **Scope guard:** the frontend (`client/`) is a teammate-owned lane — coordinate before editing. The engine test suite is gospel; any engine change must keep `PYTHONPATH=engine pytest engine -q` green.

### Status legend

| Symbol | Meaning |
|---|---|
| `INTEGRATED` | Proposed component is implemented and wired into the live path. |
| `PARTIAL` | Implemented but incomplete vs spec, or implemented but not reachable on the live path, or deviates materially. |
| `MISSING` | No implementation found in any capacity in this repo. |
| `DRIFT` | Implemented and functional, but deviates from the *named* spec mechanism (different library, route shape, or data source). |
| `DEFERRED` | Absent, but the spec itself marks it roadmap / post-MVP — not a true gap. |

---

## 1. Executive summary

**Nearly every proposed *capability* exists in some form.** The engine (gate, risk fusion, ERC/CAL optimization, Monte Carlo, backtest) and the backend API are substantially complete and largely faithful to the specs. Exposure is concentrated in three places:

1. **Frontend ↔ backend wiring.** Three client SDK wrappers (`postProjection`, `postRebalance`, `postTaxReport`) are not exported, so the Monte Carlo fan chart, rebalance panel, and tax panel are built but **cannot call the live engine**. This is the single highest-impact gap — real engine output is invisible in the UI. → `G-01`.
2. **Backtest API hides the credibility metrics.** The engine computes Deflated Sharpe, CAGR, drawdown curve, and `naive_mvo`, but the API report drops them — undermining the "honest backtest" headline (02 §8). → `G-02`.
3. **Spec drift the judges may check.** `riskfolio-lib`/`cvxpy`/`sklearn` were committed in the specs but never used (all custom NumPy); "MCP integration" is realized as Gemini function-tools, not a literal MCP server; several `/api/*` contract routes exist only under renamed `/api/v1/*` equivalents.

**True zero-coverage items** (not built in any capacity here): momentum/volatility tilt, min-var/max-div ERC ensemble, loss-aversion downstream allocation shading, `/api/sim/fast-forward`, Politis-White automatic block-length. Stripe/ACH-payments and external loan-linking are absent **but spec-deferred** (roadmap), so they are not counted as gaps.

### Coverage tally (approximate, by component)

| Domain | INTEGRATED | PARTIAL | MISSING | DRIFT/DEFERRED |
|---|---|---|---|---|
| 1. Gate + Risk Profiling + Fusion | 16 | 9 | 3 | — |
| 2. Optimization | 5 | 3 | 3 | 2 |
| 3. Monte Carlo + Backtest | 13 | 5 | — | — |
| 4. Data / Universe / Tax / Rebalance / Execution | 8 | 6 | 2 | (2 deferred) |
| 5. Backend API + LLM/MCP + Persistence | ~22 live | 5 | 13 standalone routes | (most superseded) |
| 6. Frontend wiring | 3 live | 8 | 3 wrappers | — |

---

## 1a. Re-audit delta — 2026-05-31 (post-merge into `main`)

Re-verified by two read-only Codex re-auditors after merging recent work (`2ade255 Hybrid elicitation`, `9460314 Editable settings`, `ethan2`). **The in-flight backtest / Monte-Carlo agent has NOT landed in this repo** — zero commits to `engine/backtest` or `engine/montecarlo`, working tree clean — so all engine MC/backtest gaps (`G-02`, `G-23`, `G-24`, `G-25`) and the other engine gaps (`G-03`, `G-04`) are **unchanged**.

**Closed / improved**
- ✅ **Elicitation MVP constraint (01 §3.1) — CLOSED.** Intake is now a server-driven hybrid question order via `backend/llm/instrument.py` (`SCRIPT`: `income_stability`, GL1–GL13, loss-scenario, Dohmen, loss-aversion, goal, prefs). Order is driven by `step_from_messages` selecting `SCRIPT[step]` (`instrument.py:184,203`) + an injected turn-control block (`elicitation.py:386`); GL item order pinned + tested (`test_instrument.py:60`). *(Caveat: stateless turn-count control, not content-aware completion.)*
- 🟡 **G-07 improved → still PARTIAL.** Exact GL1–GL13 order now pinned in code (`instrument.py:23`, presented "VERBATIM" `instrument.py:224`), but the **13–47 scoring-range mismatch remains** (schema allows 1–4 ×13 = max 52 at `backend/models.py:110,141`).

**Still open**
- ❌ **G-01 — STILL OPEN (top priority).** `greenlightClient.js` was edited (added `getActiveOnboarding`, address in `register`) but **`postProjection` / `postRebalance` / `postTaxReport` are still absent and `postPortfolio` still posts a raw `profile` body** (`greenlightClient.js:137,141`). MC fan chart / rebalance / tax panels still cannot reach the engine; consumers still guard against the missing wrappers (`Dashboard.jsx:225`, `RebalancePanel.jsx:355`).
- ❌ **G-05** (validity firewall still not enforced before `profile_ready` — `elicitation.py:440` emits straight from `function_call_args`; range/length checks only later at `/onboard`), **G-06** (raw `RiskSignals` contract still not modeled), **G-09** (engine builds the re-ask note at `fusion.py:87` but the chat stream never re-asks — `v1.py:1604`) — **unchanged**.
- ❌ **G-02, G-04, G-23, G-24, G-25** — unchanged (no commits in those areas).
- ✅ **G-03 — CLOSED (this session, `ethan3`).** Bracket-aware tax + gate math implemented: new `engine/tax/rates.py` (ordinary→LTCG map, loss-offset caps), `bracket` threaded through `tax_report`/`evaluate_gate`/`_debt_math` and the API (`/tax/report`, `/onboard`, gate). Adversarial Codex test pass surfaced + fixed a real bug (`TaxReportRequest.bracket` was missing `le=1`, accepting `1.01`) and added engine-boundary hardening (clamp + NaN→None). Engine 69 / backend 57 green; regression tests added.

**Mitigated (not closed as written)**
- 🟡 **G-38.** `SettingsView` still ignores `onboardResult` (`SettingsView.jsx:49` destructures only `user`/handlers), but a **new editable `ProfileView`** consumes `validated_profile ?? profile` and saves via `postUpdateProfile` (`ProfileView.jsx:45,451`) — the product need (edit the validated profile) is now met on a different screen. Settings became editable for account fields.
- 🟡 **G-36.** `PortfolioView` now attempts a live `postPortfolio` fetch when `onboardResult.portfolio` is absent (`PortfolioView.jsx:231`), but the hardcoded `GLIDEPATH` (`PortfolioView.jsx:28`) and estimated-metric fallback (`engineData.js:245`) remain.

**New undocumented additions (decide: document in specs or remove)**
- `backend/llm/instrument.py` — hybrid-elicitation `SCRIPT` controller (`ScriptItem`/`SCRIPT` at `instrument.py:7`).
- **Advisor account tools** — `get_account_summary`, `get_my_settings`, `get_my_profile_inputs` (`advisor.py:125`, impls `explain_tools.py:245,264,313`, tested `test_account_tools.py:56`). Expands function-tool explainability; **`G-31` (MCP) still open** — still Gemini function-tools, not MCP.
- New endpoint `GET /api/v1/users/{email}/active-onboarding` + client `getActiveOnboarding`.
- New editable `ProfileView` (tag/dropdown controls) saving via `postUpdateProfile`; address capture in signup.
- LLM model pinned to `gemini-3.5-flash` (`elicitation.py:31`, `advisor.py:31`) — config, not in specs.

> **Net:** of the two in-flight agents, the **chat-intake agent's guided-order work is merged and closes the 01 §3.1 intake constraint**; the **backtest/MC agent's work is not in this repo yet**. The single highest-impact gap (`G-01`) is **still open** — the frontend remains unable to call the live Projection/Rebalance/Tax endpoints despite `greenlightClient.js` being touched.

---

## 1b. Post-merge re-audit — HEAD `0ba5ca0` (supersedes earlier statuses)

After the `ethan` merge (DB universe seed, bucket allocation, `tilt.py`, BL/CVaR, JNLC) + the `G-01` SDK wiring + `G-03`. Re-verified read-only by Codex against current HEAD. **Owner** = the in-flight workstream that will close it (ModuleA–G engine remediation, or CHAT = the elicitation-convergence agent); **UNOWNED** = needs separate work.

**✅ Now CLOSED:** `G-01` (SDK wrappers + `{profile,method}` body), `G-03` (bracket-aware tax+gate), `G-36` (live portfolio fetch; hardcoded GLIDEPATH gone). Plus the 01 §3.1 guided-intake constraint (§1a).

**Owned by in-flight agents (tracked, not actionable by us):**

| Gap | Status | Owner | Note |
|---|---|---|---|
| G-02 | PARTIAL | ModuleB | backtest improved (ragged/SPY); **API still drops CAGR/DSR/drawdown/`naive_mvo`** |
| G-04 | PARTIAL | ModuleA | pref/theme filters exist; bundled universe ETF-only so `stock` pref can't yield stock-only |
| G-05 | OPEN | CHAT | `profile_ready` still emits raw fn-args before server GL firewall |
| G-06 | OPEN | CHAT | raw auditable `RiskSignals` contract still unmodeled |
| G-07 | PARTIAL | CHAT | GL order pinned; scoring still 13×(1–4)=52 max vs spec 13–47 |
| G-09 | OPEN | CHAT | engine requests clarification; chat doesn't re-administer conflicting items |
| G-17/D-1 | PARTIAL | ModuleC1 | custom NumPy vs riskfolio/sklearn/cvxpy commitment |
| G-18 | OPEN | ModuleC2 | glide still ignores `horizon` |
| G-19 | PARTIAL | ModuleC2 | optimizer consumes only `target_vol_band.mid` |
| G-20/D-5 | PARTIAL | ModuleG | BL/CVaR backend live; full-sleeve replacement, no frontend toggle |
| G-21 | PARTIAL | ModuleD | `tilt.py` wired; signal still rewards positive raw-vol z-score |
| G-25 | PARTIAL | ModuleB | DSR uses static trial count; no experiment log |

**❌ REMAINS UNOWNED (actionable backlog):**

| Gap | Status | Note |
|---|---|---|
| G-08 | OPEN | signal variances hardcoded; missing loss-probe defaults to 100.0 (`v1.py:137`) |
| G-10 | OPEN | capacity formula deviates from 02 §3.1 |
| G-11/D-6 | OPEN | `tolerance_score` is raw GL sum, not normalized 0–100 |
| G-12/D-4 | PARTIAL | standalone §6 routes absent (capability under `/api/v1/*`) — doc reconcile |
| G-13 | PARTIAL | `path_to_greenlight` exists; no conversion-event state machine |
| G-14 | PARTIAL | no cached/offline LLM fallback (demo-safety) |
| G-15 | PARTIAL | `/config` exposes only gate+market, not GL/γ/SR_REF/capacity weights |
| G-16 | OPEN | loss-aversion not applied as a downstream optimizer shade |
| G-22 | OPEN | no min-var/max-div ERC ensemble |
| G-23 | OPEN | bootstrap fixed `BLOCK_L=12`; no Politis-White auto length |
| G-24 | OPEN | API randomizes first no-seed projection |
| G-26/D-3 | PARTIAL | risk-free is FRED `DGS3MO` vs documented `^IRX` — doc reconcile |
| G-27 | OPEN | no generic event/audit-history table |
| G-28 | OPEN | execution endpoints force `monthly_surplus=0.0` (DCA bypassed) |
| G-29 | PARTIAL | Alpaca broker best-effort fills; no lifecycle reconciliation |
| G-30 | PARTIAL | JNLC service landed but **no API route** wires it |
| G-31/D-2 | PARTIAL | explainability is Gemini function-tools; no MCP server (chosen: **re-document**) |
| G-32 | OPEN | auth returns `mock-token-*`; routes unprotected |
| G-33 | OPEN | no `/sim/fast-forward` (or live quarterly trigger) |
| G-35 | PARTIAL | backend returns checks; UI keeps hardcoded fallback gate cards |
| G-37 | OPEN | `AlertsView` reads `gate.path_to_greenlight`; backend path under `financial_analysis` |
| G-38 | PARTIAL | `SettingsView` ignores `onboardResult` (mitigated by editable `ProfileView`) |

### Our pick from the remainder — **Portfolio maintenance: quarterly rebalance + elevate-to-active** (in build)

Highest pitch value: it makes the README's "**then maintains it automatically**" claim real and demoable, and closes the *execution* half (touches `G-28`, `G-33`, and the 01 §6 event-driven reallocation). Demo-safe build (confirmed): manual quarterly trigger endpoint, live data refresh with timeout→cached fallback, simulator execution (Alpaca behind flag). Lives in `backend/api/v1.py` (new routes) + `engine/rebalance/` + `engine/broker/` + `engine/data/ingest/refresh.py` + `backend/persistence.py` — collision-free vs ModuleA–G and CHAT.

---

## 2. Cross-cutting verdict by spec principle

The README names six non-negotiable commitments. Status of each:

| # | Principle | Status | Notes |
|---|---|---|---|
| 1 | Responsibility-first gate runs before optimization | INTEGRATED | `engine/gate/responsibility.py`; `/onboard` builds portfolio only if greenlit (`backend/api/v1.py:1421`). |
| 2 | LLM elicits/explains; deterministic engine decides | INTEGRATED (with caveat) | Engine computes all numbers; advisor uses function-tools for figures. Caveat: GL-13 firewall is prompt-only, not enforced (`G-05`). |
| 3 | Capacity caps tolerance via min() | INTEGRATED | `engine/profiler/profile.py:50` (`max(γ_tol, γ_cap)` — higher γ = more conservative). |
| 4 | Robust-by-construction (ERC, not naive MVO); honest backtest | PARTIAL | ERC/LW integrated; honest-backtest metrics not surfaced via API (`G-02`). |
| 5 | Halt = deferred conversion | PARTIAL | `path_to_greenlight` + `/gate/recheck` exist; no explicit conversion-event state machine (`G-13`). |
| 6 | Demo-safe (simulated exec, cached prices, offline) | PARTIAL | Simulator solid; **no cached LLM offline fallback** found in `backend/llm` (`G-14`). |

---

## 3. Domain 1 — Responsibility Gate + Risk Profiling + Signal Fusion

Auditor: P1. Specs: 01 §3.1–3.4/§5, 02 §2–§4, 05 §2.1–2.4/§7, 07 (all).

| Component | Spec ref | Status | Evidence | Delta / Notes |
|---|---|---|---|---|
| `UserProfile` / `UserProfileInput` contract | 05 UI §2.1 | INTEGRATED | `engine/schemas/models.py:38`, `backend/models.py:88`, `backend/llm/elicitation.py:279` | All financial + risk fields present. |
| Elicitation function-call boundary | 01 §3.1; 07 §2,§5 | PARTIAL | `backend/llm/elicitation.py:34,263,413` | Gemini function call + `profile_ready`; **GL validity firewall + category confirmation are prompt-only, not enforced**. → `G-05` |
| Profile validation gate | 01 §3.2; 05 §2.2 | INTEGRATED | `engine/profiler/validate.py:31,36`, `backend/api/v1.py:898` | Pydantic ranges + clarification for aggressive questionnaire / panic-sell contradiction. |
| Raw `RiskSignals` LLM contract (07 §3) | 07 §3 | PARTIAL | `engine/schemas/models.py:108`, `backend/models.py:182`, `backend/llm/elicitation.py:299` | Code does **not** model `gl_responses` / `per_signal_confidence` / `unresolved_flags` as a raw `RiskSignals` object; raw signals live on `UserProfile`, engine `RiskSignals` is already mapped to γ/variance. → `G-06` |
| Grable-Lytton 13 collection | 07 §1–3; 02 §2 | PARTIAL | `backend/models.py:110,141`, `backend/llm/elicitation.py:84` | 13 scored items present, **but prompt rewords/merges items and schema allows 1–4 each (max 52) vs spec's exact-item / 13–47 score**. → `G-07` |
| GL score → percentile → γ band w/ SEM | 02 §2.1; 05 §7.2 | INTEGRATED | `engine/profiler/tolerance.py:31,34`, `engine/schemas/constants.py:8` | GL mean/SD/alpha; log γ range [1.5, 8.0]. |
| Dohmen single-item signal | 07 §1,§4 | PARTIAL | `backend/models.py:115`, `engine/profiler/tolerance.py:50` | γ map exists; **variance hardcoded `DOHMEN_VAR=1.0`**, not tied to published reliability. → `G-08` |
| Loss-aversion probe signal | 07 §1,§4 | PARTIAL | `backend/models.py:122`, `engine/profiler/tolerance.py:59`, `engine/profiler/profile.py:71` | Maps to γ/variance + flag; **backend silently defaults missing probe to `100.0`** (`backend/api/v1.py:133`). → `G-08` |
| Per-signal variances | 07 §4 Step A | PARTIAL | `engine/profiler/tolerance.py:9,10,42` | Variance fields exist; Dohmen/loss-aversion variances are fixed local constants. → `G-08` |
| Inverse-variance pooling | 07 §4 Step B | INTEGRATED | `engine/profiler/fusion.py:56,58`, `engine/tests/test_fusion.py:9` | Fixed-effect IV γ, tested. |
| DerSimonian-Laird random-effects τ² | 07 §4 Step B | INTEGRATED | `engine/profiler/fusion.py:67,69,71` | Computes τ², RE weights, combined variance. |
| Cochran Q / I² contradiction trigger | 07 §4 Step B | PARTIAL | `engine/profiler/fusion.py:59,82`, `engine/profiler/profile.py:43` | Engine returns clarification when Q/I² trip; **no automatic LLM re-ask loop** in elicitation/API. → `G-09` |
| Fused tolerance γ band | 07 §4 Step C; 05 §2.3 | INTEGRATED | `engine/profiler/fusion.py:77,80` | Posture-keyed aggressive/mid/conservative band from fused γ ± SE. |
| Capacity score | 02 §3.1; 01 §3.3 | PARTIAL | `engine/profiler/capacity.py:77,81`, `engine/schemas/constants.py:14` | **Formula differs from spec**: savings uses `min(projected rate, capital/income)`; debt denominator uses income+EF+capital, not debt-to-income. → `G-10` |
| Capacity γ | 02 §3.1 | INTEGRATED | `engine/profiler/capacity.py:91`, `engine/profiler/profile.py:47` | 0–100 → γ via log map. |
| Capacity caps tolerance via min() | 01 §3.3; 02 §2.1/3.1; 07 §4 | INTEGRATED | `engine/profiler/profile.py:50,55`, `engine/tests/test_profiler.py:66` | `max(γ_tol, γ_cap)` (higher γ = safer). |
| `RiskProfile` contract | 05 §2.3 | PARTIAL | `engine/schemas/models.py:123`, `engine/profiler/profile.py:57` | **`tolerance_score` is raw GL sum (`profile.py:36`), not normalized 0–100** as schema text implies. → `G-11` |
| `GammaBand` schema | 05 §2.3 | INTEGRATED | `engine/schemas/models.py:90`, `backend/models.py:164` | Engine enforces order+range; backend looser. |
| `TargetVolBand` schema | 05 §2.3; 02 §2.1 | INTEGRATED | `engine/schemas/models.py:102`, `backend/models.py:176` | Present both layers. |
| `SR_REF / γ` target-vol band | 02 §2.1; 05 §7.2 | INTEGRATED | `engine/schemas/constants.py:13`, `engine/profiler/profile.py:64` | Implemented. |
| Gate orchestration (runs first) | 01 §3.4,§5; 05 §2.4 | INTEGRATED | `engine/gate/responsibility.py:30`, `backend/api/v1.py:920` | Accepts `ValidatedProfile`; gate doesn't depend on risk. |
| Emergency-fund halt | 01 §5; 05 §7.1 | INTEGRATED | `engine/gate/responsibility.py:33,35`, `engine/tests/test_gate.py:6` | Halts <3 months; returns target. |
| High-interest-debt halt + gate math | 01 §5; 02 §4; 05 §2.4/§7.1 | PARTIAL | `engine/gate/responsibility.py:18,44`, `backend/api/v1.py:290` | Net-advantage math present but **uses fixed `LTCG_RATE=0.15`, not user bracket**. → `G-03` |
| Low-interest-debt note | 01 §5; 02 §4 | INTEGRATED | `engine/gate/responsibility.py:55`, `engine/tests/test_gate.py:44` | Sub-`LOW_APR` noted, no halt. |
| `GateResult` engine contract | 05 §2.4 | INTEGRATED | `engine/schemas/models.py:136,145` | Flat `GateMath` matches §2.4. |
| API `GateResult` UI contract | 05 UI | INTEGRATED | `backend/models.py:232,241,264`, `backend/api/v1.py:240` | Nested `emergency_fund.target_balance`, checks, preview checks. |
| Deferred-conversion framing / path-to-greenlight | 01 §1.5,§5 | PARTIAL | `backend/models.py:689`, `backend/api/v1.py:438,1437` | `path_to_greenlight` steps + `/gate/recheck`; **no explicit conversion-event state / coaching workflow**. → `G-13` |
| `/onboard` full pipeline | 05 UI | INTEGRATED | `backend/api/v1.py:889,1407,1421` | Validate→risk→gate→portfolio-if-greenlit. |
| Standalone profile/risk/gate endpoints | 05 §6.1 | MISSING | route list ~`backend/api/v1.py:1407` | No `/profile/extract|validate`, `/risk/profile`, `/gate/evaluate`; folded into `/onboard`. → `G-12` (DRIFT — capability present) |
| Disclosed/configurable constants | 01 §5; 02 §2.1; 05 §10 | PARTIAL | `engine/schemas/constants.py:3`, `backend/api/v1.py:1715` | `/config` exposes gate + market only; **GL mean/SD/alpha, γ range, SR_REF, CAPACITY_WEIGHTS not exposed**. → `G-15` |
| Loss-aversion downstream allocation shading | 07 §4 Step C | MISSING | searched `engine/optimizer/blend.py:149`, `rg loss_aversion` | Folded into fusion + shown as flag; **optimizer applies no separate conservative shade**. → `G-16` |

**Undocumented additions (this domain):** `RiskFusionInternals`/`RiskSignalComponent` explanation surface (`backend/models.py:210,216`, `backend/llm/explain_tools.py:288`); rich `FinancialAnalysis` models (`backend/models.py:640,653,671,695,707`); risk labels + 1-yr est. max-loss (`backend/api/v1.py:88,425`); risk-dial reoptimize + analyze-weights (`backend/api/v1.py:1464,1506`); **silent `loss_aversion_probe` default to 100.0** (`backend/api/v1.py:133`).

---

## 4. Domain 2 — Portfolio Optimization

Auditor: P2. Specs: 01 §3.6–3.7, 02 §5, 05 §4/§5/§6/§7.3, 06 Tasks 3.1–3.4.

| Component | Spec ref | Status | Evidence | Delta / Notes |
|---|---|---|---|---|
| ERC / equal-risk-contribution | 01 §3.6; 02 §5; 06 T3.2 | INTEGRATED | `engine/optimizer/erc.py:129`, `engine/optimizer/blend.py:153`, `engine/tests/test_optimizer.py:58` | Custom NumPy coordinate solve; default path runs ERC over `universe.risky_sleeves`. |
| Ledoit-Wolf constant-correlation shrinkage | 01 §3.6; 02 §5; 06 T3.2 | INTEGRATED / DRIFT | `engine/optimizer/erc.py:35,66,100` | Custom constant-corr target + estimated δ. **Deviates from 06:238 `sklearn.covariance.LedoitWolf()`**. → `G-17` (drift) |
| CAL two-fund blend | 05 §4/§7.3; 06 T3.3 | INTEGRATED | `engine/optimizer/blend.py:17,162,178` | Bisection + clamps; risky→ERC sleeve, residual→safe. |
| Age glide path | 01 §3.7; 05 §4; 06 T3.3 | INTEGRATED | `engine/optimizer/blend.py:52,176` | Linear age rule. **`horizon` accepted but ignored**; no human-capital-β. → `G-18` |
| γ → target-vol mapping (`SR_REF`) | 02 §2.1/§5; 05 §2.3/§7.2 | PARTIAL | `engine/schemas/constants.py:13`, `engine/profiler/profile.py:64`, `engine/optimizer/blend.py:66` | Full `target_vol_band` computed, but **optimizer consumes only `.mid`**; no aggressive/mid/conservative allocation range produced. → `G-19` |
| Black-Litterman view layer | 01 §3.6; 02 §5; 05 §4/§6; 06 T3.4 | PARTIAL / DRIFT | `engine/optimizer/black_litterman.py:83,109`, `backend/api/v1.py:626` | Custom NumPy, **live API-computed (not pre-baked fixture), and replaces full sleeve weights rather than only risky-sleeve construction w/ CAL unchanged**. → `G-20` |
| CVaR / downside objective | 01 §3.6; 02 §5; 05 §2.6/§4; 06 T3.4 | PARTIAL / DRIFT | `engine/optimizer/cvar.py:87,122`, `backend/api/v1.py:635` | Bootstrap scenarios + projected-gradient NumPy (not cvxpy LP), live not pre-baked. → `G-20` |
| Momentum / volatility tilt | allocation/preferences | MISSING | `engine/schemas/models.py:57`, `black_litterman.py:54` | **No `engine/optimizer/tilt.py`; no momentum/low-vol factor optimizer.** Only free-form `sector_theme_tilts` → BL text tilts. → `G-21` |
| Riskfolio-lib commitment | 01 §3.6; 02 §5; 06 stack | MISSING / DRIFT | `engine/optimizer/erc.py:5`, `engine/pyproject.toml:10`, `backend/requirements.txt:1` | **`riskfolio-lib`, `cvxpy`, `sklearn`, `LedoitWolf` not used or declared** — replaced by custom NumPy. → `G-17` |
| Universe table / risky-safe sleeves | 05 §4/§5; 06 T3.1 | INTEGRATED | `engine/data/universe.csv:1`, `engine/data/loaders.py:17`, `engine/schemas/models.py:159` | Sleeve split + market weights validated. |
| `TargetWeights` contract | 05 §2.6; 06 P0/3.3 | INTEGRATED | `engine/schemas/models.py:174`, `engine/optimizer/blend.py:193`, `backend/models.py:311` | Sum + method-enum enforced. |
| Light ERC/min-var/max-div ensemble | 01 §3.6; 02 §5 | MISSING | searched `engine/optimizer/*` | No min-variance / max-diversification / averaging / dispersion band. → `G-22` |

**Undocumented additions:** BL/CVaR live via `POST /portfolio` (`backend/models.py:407`, `backend/api/v1.py:957`); BL hardcoded view constants + ESG defensive tilts (`black_litterman.py:12,69`); reoptimize uses `risk_dial → realized frontier vol` not `SR_REF/γ` (`backend/api/v1.py:662`); CVaR reuses MC stationary bootstrap (`cvar.py:10,50`).

---

## 5. Domain 3 — Monte Carlo Projection + Backtest

Auditor: P3. Specs: 01 §3.8/§9, 02 §6/§8, 06 Phase 4.1/6.2.

| Component | Spec ref | Status | Evidence | Delta / Notes |
|---|---|---|---|---|
| Stationary bootstrap (Politis-Romano), block length | 01 §3.8; 02 §6; 06 P4.1 | PARTIAL | `engine/montecarlo/projection.py:74`, `engine/schemas/constants.py:23` (`BLOCK_L=12`) | Geometric-block bootstrap present; **Politis-White automatic block-length selection not found** (fixed L=12). → `G-23` |
| Number of paths | 06 P4.1 | INTEGRATED | `engine/schemas/constants.py:24` (`N_PATHS=10000`), `projection.py:125` | API also defaults 10k. |
| End-of-month contributions | 01 §3.8; 06 P4.1 | INTEGRATED | `projection.py:107,111` | `W = W*(1+r) + contribution`. |
| Goal-success `p_success` | 01 §3.8; 02 §6 | INTEGRATED | `projection.py:157`, `engine/schemas/models.py:198` | mean(terminal ≥ goal). |
| Percentile bands p5–p95 | 01 §3.8; 06 P4.1 | INTEGRATED | `projection.py:14,150` | Yearly bands. |
| Bad-case + median terminal | 01 §3.8; 06 P4.1 | INTEGRATED | `projection.py:161`, `models.py:203` | p5 / p50 terminal. |
| Deterministic seeding | 06 P4.1 | PARTIAL | `projection.py:138`, `backend/api/v1.py:1538` | Engine deterministic w/ seed; **API generates fresh random seed when omitted** (echoes it for replay) → not deterministic on first no-seed call. → `G-24` |
| Backtest walk-forward engine | 01 §9; 02 §8; 06 P6.2 | INTEGRATED | `engine/backtest/run.py:130,148` | Rolling window, rebalance, evaluate. |
| 36–60mo window + quarterly rebalance | 01 §9; 06 P6.2 | INTEGRATED | `run.py:24,223` | Default 36mo / quarterly. |
| 1/N benchmark | 01 §9; 02 §8 | INTEGRATED | `run.py:21,115` | In engine + report. |
| 60/40 benchmark | 01 §9; 02 §8 | INTEGRATED | `run.py:117` | VTI/VEA/BND/TIP. |
| Target-date glidepath benchmark | 01 §9; 02 §8 | INTEGRATED | `run.py:65,119` | Declining risky fraction over 37y. |
| Naive MVO benchmark | 01 §3.6/§9; 06 P6.2 | PARTIAL | `run.py:78,315` | In engine/static JSON, **omitted from API `benchmarks`**. → `G-02` |
| CAGR metric | 06 P6.2 | PARTIAL | `run.py:189`, `backend/models.py:436` | Computed, **omitted from API response**. → `G-02` |
| Sharpe | 01 §9; 02 §8 | INTEGRATED | `run.py:186`, `backend/models.py:437` | Exposed. |
| Deflated Sharpe | 01 §9; 02 §8; 06 P6.2 | PARTIAL | `engine/backtest/metrics.py:83`, `run.py:191`, `backend/models.py:436` | Computed, **omitted from API** — headline credibility metric not renderable. → `G-02` |
| Sortino | 01 §9; 02 §8 | INTEGRATED | `metrics.py:120`, `run.py:192` | Exposed. |
| Max drawdown | 01 §9; 02 §8 | INTEGRATED (metric) / PARTIAL (curve) | `metrics.py:136`, `run.py:193` | Metric exposed; **drawdown curve omitted from API**. → `G-02` |
| Calmar | 01 §9; 02 §8 | INTEGRATED | `metrics.py:147`, `run.py:194` | Exposed. |
| Turnover | 01 §9; 02 §8 | INTEGRATED | `run.py:144,195` | Exposed. |
| Transaction costs | 01 §9; 02 §8; 06 P6.2 | INTEGRATED | `engine/schemas/constants.py:22` (`TX_COST_BPS=10`), `run.py:146,163` | Applied at rebalance. |
| Backtest API route | 01 §9/§10; 06 P8.5 | PARTIAL | `backend/api/v1.py:1449`, `run.py:289,297` | Serves cached report but **omits `drawdown_curve`, `cagr`, `deflated_sharpe`, `naive_mvo`; `profile/weights/start/end` accepted then ignored**. → `G-02` |

**Undocumented additions:** `scenario_var_1yr_loss` downside helper (`engine/montecarlo/downside.py:33`); projection response includes replay seed (`backend/models.py:541`); backtest supports monthly rebalance too (`run.py:26,225`).

**Auditor note (credibility risk):** the cached `engine/data/backtest.json` shows `greenlight_erc` with better max-drawdown but **worse Sortino/Calmar and higher turnover** than several benchmarks — reconcile the artifact with the "modest, honest claims" framing before demoing. `n_trials` for DSR is currently `len(STRATEGY_NAMES)==5` with no persisted experiment log. → `G-25`.

---

## 6. Domain 4 — Data / Universe / Tax / Rebalance / Execution / Loans-Payments

Auditor: P4. Specs: 01 §3.5/3.9–3.12/§6–§8/§13, 03, 05 §2.5/2.8–2.10/§5, data-bom.

| Component | Spec ref | Status | Evidence | Delta / Notes |
|---|---|---|---|---|
| yfinance price/volume ingest | data-bom D1; 01 §11 | INTEGRATED | `engine/data/ingest/yfinance_source.py:19,145,167`, `ingest/refresh.py:359` | `adj_close`+`volume`, retry/batch. |
| FRED risk-free / macro ingest | data-bom D4 (spec said `^IRX`) | PARTIAL / DRIFT | `ingest/fred_source.py:15,29`, `refresh.py:22,361`, `db.py:63` | FRED `DGS3MO` stored as `macro_series`; **differs from documented yfinance `^IRX`**; broader macro not ingested. → `G-26` |
| SQLite / SQLAlchemy data store | 01 §3.14; 03 | INTEGRATED | `engine/data/db.py:14,21,43,52,63`, `repository.py:40` | Instruments/prices/meta/macro. Backend app DB separate (`backend/persistence.py:18`). **No engine-side event-history table** (see `G-27`). |
| ETF universe table | 05 §2.5/§5; data-bom D2 | INTEGRATED | `engine/data/universe.csv:1`, `classification.csv:1`, `db.py:21`, `repository.py:98` | Starter + richer classification; ESG columns in schema. |
| Universe preference gating | 01 §3.5; 05 §2.1/§2.5 | PARTIAL | `engine/universe/builder.py:14,31`, `backend/api/v1.py:571` | ESG consumed, but **`universe_pref` (ETF/stock/mix) + `sector_theme_tilts` passed then ignored** by `build_universe`. → `G-04` |
| ESG exclusions / substitution | 01 §3.5; 05 §5 | INTEGRATED | `engine/data/loaders.py:38,55,58,75`, `universe/builder.py:24` | VTI→ESGV, VEA→ESGD. |
| Position sizing / `OrderPlan` | 01 §3.9; 05 §2.8 | PARTIAL | `engine/sizing/sizer.py:9,15,21,23`, `backend/api/v1.py:1255` | Fractional buys + 12-mo DCA when `monthly_surplus>0`; **execution endpoints pass `monthly_surplus=0.0` → lump-sum only**. → `G-28` |
| Tax-loss harvesting | 01 §3.12; 03 T4; 05 §2.10 | PARTIAL | `engine/tax/report.py:48,54,59`, `backend/api/v1.py:1568` | Flags below-basis; **ignores `bracket`; no after-tax debt-vs-gains math**. → `G-03` |
| Correlated replacement for TLH | data-bom D2; 03 T4 | PARTIAL | `engine/tax/report.py:20,28,35,42` | Prefers same bucket/sleeve, different index; falls back to hardcoded replacements. |
| Wash-sale 30-day warning | 01 §3.12; 05 §2.10 | INTEGRATED | `engine/tax/report.py:70,73,90`, `models.py:274` | 30-day warning + advisory note. |
| Dynamic rebalancing (drift/steer/trades) | 01 §3.11/§6; 03 T2; 05 §2.9 | INTEGRATED | `engine/rebalance/rebalancer.py:41,61,65,76,95` | Core decision present; **quarterly/event trigger is orchestration-level, not encoded**. |
| Simulated execution engine | 01 §3.10/§8; 05 §2.8 | INTEGRATED | `engine/broker/base.py:8`, `simulator.py:12,27,49,90` | Orders, rebalance trades, positions/cash. |
| Real execution via Alpaca Broker API | 01 §8/§13 | PARTIAL | `engine/broker/alpaca_broker.py:66,95,117,134`, `backend/broker_factory.py:30` | Multi-account adapter behind `BROKER_PROVIDER=alpaca_broker`; **best-effort market fills, no order-lifecycle reconciliation**. → `G-29` |
| Alpaca paper execution | 01 §3.10/§8 | INTEGRATED | `engine/broker/alpaca.py:16,43,66,92`, `broker_factory.py:25` | Optional paper adapter. |
| Brokerage account lifecycle | (beyond MVP) | PARTIAL | `backend/brokerage.py:107,124`, `backend/api/v1.py:1182`, `persistence.py:85` | Sandbox account creation + stored `alpaca_account_id`. |
| Account funding: ACH relationship/deposit | 01 §7 (roadmap) | PARTIAL | `backend/brokerage.py:135,145`, `backend/api/v1.py:1202,1229` | ACH relationship + inbound deposit wired; exceeds MVP, no full funding lifecycle. |
| Account funding: JNLC journal | (user-enumerated) | MISSING | searched `engine/`,`backend/` for `JNLC`/`journal` | **No journal API here** *(exists in the `-active` repo, not `-v2`)*. → `G-30` |
| Loan/debt linking | 01 §7 (manual only in MVP) | DEFERRED | `backend/models.py:82`, `engine/schemas/models.py:32`, `engine/gate/responsibility.py:44,56` | Manual debts modeled + used by gate; no external linking — **per spec**. |
| ACH payments / Stripe | 01 §7 roadmap | DEFERRED | searched; `backend/api/v1.py:1164` says mock-only | **No Stripe / ACH debt-payment** — per spec roadmap. |

**Undocumented additions:** FRED default risk-free (`fred_source.py:15`); runtime `/data/refresh` endpoint (`engine/api/data_routes.py:40`) vs cached-runtime posture; Alpaca Broker onboarding/funding; mock ACH funding ledger (`backend/persistence.py:95,318`); separate backend app DB (`persistence.py:18,85`).

---

## 7. Domain 5 — Backend API + LLM / MCP + Persistence

Auditor: P5. Specs: 01 (all §3), 05 (UI-Contract + §6 endpoint list). All `/api/v1` routes mounted at `backend/main.py:44`.

### 7.1 Live UI-contract routes (INTEGRATED unless noted)

| Route | Spec | Status | Evidence | Notes |
|---|---|---|---|---|
| `POST /api/v1/onboard` | 05 UI 71–120 | INTEGRATED | `backend/api/v1.py:1407,889`, `models.py:717` | Validate→risk→gate→portfolio. Extra `session_id` query. |
| `POST /api/v1/gate/recheck` | 01 §6 | INTEGRATED | `backend/api/v1.py:1437` | Not in 05 list but valid. |
| `POST /api/v1/portfolio` | 05 UI 122–134 | INTEGRATED | `backend/api/v1.py:1443`, `models.py:407` | `erc`/`black_litterman`/`cvar`; requires gate pass. |
| `POST /api/v1/backtest` | 05 UI 136–174 | PARTIAL | `backend/api/v1.py:1449`, `models.py:418` | Shape matches UI contract; **drops metrics** → `G-02`. |
| `POST /api/v1/projection` | 05 UI 176–199 | PARTIAL | `backend/api/v1.py:1533`, `models.py:522,533` | Extra `seed` field; first no-seed call nondeterministic → `G-24`. |
| `POST /api/v1/rebalance` | 05 UI 201–213 | INTEGRATED | `backend/api/v1.py:1555`, `models.py:585` | Engine `decide_rebalance`. |
| `POST /api/v1/tax/report` | 05 UI 215–230 | PARTIAL | `backend/api/v1.py:1568,1574`, `models.py:622` | Accepts `bracket`, **uses only `filing_status`** → `G-03`. |
| `GET /api/v1/profile/{email}` | 05 UI 232–234 | INTEGRATED | `backend/api/v1.py:1335`, `persistence.py:205` | `no_profile` if absent. |
| `GET /api/v1/users/{email}/record` | 05 UI 236–255 | INTEGRATED | `backend/api/v1.py:1659`, `models.py:67` | Account+profile+chats. |
| `GET /api/v1/users/{email}/chats` | 05 UI 257 | INTEGRATED | `backend/api/v1.py:1681,1689` | `kind` is plain `str`, not enum. |
| `GET /api/v1/config` | 05 UI 259–274 | INTEGRATED | `backend/api/v1.py:1715`, `backend/config.py:13` | Gate + market only (see `G-15`). |
| `POST /api/v1/chat` (SSE) | 05 276–298 | INTEGRATED | `backend/api/v1.py:1580`, `llm/elicitation.py:419` | `session`/`token`/`profile_ready`/`error`/`[DONE]`. |
| `POST /api/v1/advisor/chat` (SSE) | 05 300–318 | INTEGRATED | `backend/api/v1.py:1617`, `llm/advisor.py:262` | Explainability function tools. |

### 7.2 LLM / MCP / Persistence

| Component | Spec | Status | Evidence | Delta |
|---|---|---|---|---|
| Elicitation LLM (Gemini) | 01 §3.1 | PARTIAL | `llm/elicitation.py:30,34,263,394` | Live free-form LLM, **not the "guided form w/ narrated veneer" MVP constraint; no cached offline fallback**. → `G-14` |
| Advisor LLM (Gemini) | 01 §3.13 | INTEGRATED | `llm/advisor.py:29,32,215` | Constrained to explanation; tools for numbers. |
| MCP explainability tools | user-req; 01 §3.13 | PARTIAL / DRIFT | `llm/advisor.py:120`, `llm/explain_tools.py:270,288,342` | `explain_portfolio`/`explain_risk_fusion`/projection exist **as Gemini function tools; no MCP server/protocol**. → `G-31` |
| Persistence: users + PBKDF2 | user-req | INTEGRATED | `persistence.py:27,152,163` | `pbkdf2_hmac`, 200k iters. |
| Persistence: profiles | 01 §3.14 | INTEGRATED | `persistence.py:36,189`, `backend/api/v1.py:1423` | Input + serialized result. |
| Persistence: chat sessions/messages | 05 243–252 | INTEGRATED | `persistence.py:55,74`, `backend/api/v1.py:1084` | User/assistant + extracted profile. |
| Auth token | user-req | PARTIAL | `backend/api/v1.py:1137,1150`, `models.py:15` | `mock-token-<email>`; **no persistence/expiry/verification/protected routes**. → `G-32` |
| State-store event history | 01 §3.14 | PARTIAL | `persistence.py:36,55,85,95` | Profile/chat/accounts/funding stored; **no generic event-history/audit table** for gate/allocation/rebalance/profile-change events. → `G-27` |

### 7.3 Missing standalone contract routes (05 §6.1–6.3) — capability superseded by `/api/v1/*`

All of the following §6 routes are **not registered**; each has a live equivalent (so the *capability* is present — these are DRIFT, not capability gaps). → `G-12`.

| 05 §6 route | Live equivalent |
|---|---|
| `POST /api/profile/extract` | SSE `POST /api/v1/chat` |
| `POST /api/profile/validate` | inside `/onboard` |
| `POST /api/risk/profile` | inside `/onboard` |
| `POST /api/gate/evaluate` | `/api/v1/gate/recheck` (takes `UserProfileInput`, not `{profile,risk}`) |
| `POST /api/portfolio/build` | `POST /api/v1/portfolio` |
| `POST /api/projection/montecarlo` | `POST /api/v1/projection` |
| `POST /api/sizing` | `POST /api/v1/execution/preview` |
| `POST /api/execute` | `POST /api/v1/execution/submit` |
| `GET /api/positions` | `GET /api/v1/positions/{user_email}` |
| `GET /api/backtest` | `POST /api/v1/backtest` |
| `POST /api/narrate` | advisor SSE (no standalone narrate) |
| `POST /api/run` | `POST /api/v1/onboard` |
| `POST /api/sim/fast-forward` | **none** — genuinely MISSING → `G-33` |

**Undocumented additions:** `GET /health` (`main.py:52`); `auth/register|login` (`v1.py:1137,1150`); `funding/mock/deposit` + `funding/account/{email}` (`v1.py:1159,1171`); `brokerage/account|ach-relationship|deposit` (`v1.py:1182,1202,1229`); `execution/preview|submit|rebalance/submit` (`v1.py:1250,1261,1285`); `positions/{user_email}` (`v1.py:1324`); `portfolio/save` (`v1.py:1344`); `profile/update` (`v1.py:1373`); `portfolio/reoptimize` + `portfolio/analyze-weights` (`v1.py:1464,1506`, documented in `portfolio-creation-review.md`, not 05).

---

## 8. Domain 6 — Frontend / Client UI Wiring

Auditor: P6. Specs: 01 (UI journey), roles/A–D, roles/module-0-contract. **Teammate-owned lane — coordinate before editing.**

| Component | Spec | Status | Evidence | Delta |
|---|---|---|---|---|
| Onboarding chat | role A; 01 UI_Chat | PARTIAL | `client/src/components/OnboardingChat.jsx:248,225` | Main chat live + persisted. Greenlight-tab `IntakeChat.jsx:161` calls `postOnboard(profileData, userEmail)` **without `sessionId`**; dev-skip injects dummy data (`OnboardingChat.jsx:378`). → `G-34` |
| Gate screen (halt + flip) | role A; 01 §5 | PARTIAL | `GateScreen.jsx:45,135`, `GreenlightFlow.jsx:30` | Live `gate_result.status` drives flow; **fallback inferred/hardcoded check cards when `gate_result.checks` absent** (`GateScreen.jsx:242,463`). → `G-35` |
| Portfolio view (donut + metrics) | role B; 01 §3.6 | PARTIAL | `PortfolioView.jsx:185,243,411` | Live when `onboardResult.portfolio` exists; **hardcoded `GLIDEPATH` (`PortfolioView.jsx:28`) + estimated-metric fallback (`engineData.js:245`)**; `postPortfolio` posts raw profile not `{profile}` (`greenlightClient.js:137`). → `G-01`,`G-36` |
| Monte Carlo fan chart | role B; 01 §3.8 | PARTIAL (blocked) | `ProjectionChart.jsx:127,192`, `Dashboard.jsx:225` | UI renders `p_success`/bands if data arrives, **but `postProjection` is not exported by `greenlightClient.js` → live MC cannot run**. → `G-01` |
| Rebalance panel (drift/steer/trades) | role C; 01 §3.11 | PARTIAL (blocked) | `RebalancePanel.jsx:3,355,460`, `seedPositions.js:1` | UI structured for live output, **`postRebalance` missing from SDK**; holdings seeded by design. → `G-01` |
| Tax panel (harvest + wash-sale) | role C; 01 §3.12 | PARTIAL (blocked) | `RebalancePanel.jsx:225,356` | No illustrative constants, **but `postTaxReport` missing → live tax cannot run**. → `G-01` |
| Accounts page | role D | INTEGRATED-LIVE | `AccountsTab.jsx:147,117` | Reads `validated_profile`/`financial_analysis.debt`; Plaid stub labeled (matches spec). |
| Alerts page | role D | PARTIAL | `AlertsView.jsx:13,11` | Reads `gate_result.checks[]`, **but path-to-greenlight reads `gate.path_to_greenlight?.steps`; spec says `financial_analysis.path_to_greenlight.steps`**. → `G-37` |
| Settings page | role D | PARTIAL | `SettingsView.jsx:27`, `App.jsx:135` | Consumes only signed-in `user`; **ignores `onboardResult`** → renders no validated-profile fields. → `G-38` |
| Risk view | role D; 01 §3.3 | INTEGRATED-LIVE | `RiskView.jsx:25` | γ, γ band, target vol, capacity/tolerance, binding axis. |
| Surfacing selected ETFs | role B; 01 §3.5/3.6 | PARTIAL | `PortfolioView.jsx:257,521`, `PortfolioEditor.jsx:86` | Live from `by_ticker`; editor has hardcoded fallback tickers if no base portfolio. |

**Client SDK wrappers** (`client/src/api/greenlightClient.js:62`): present — `streamChat`, `postOnboard`, `postPortfolio` (+ auth/profile/advisor/update/save). **Missing — `postProjection`, `postRebalance`, `postTaxReport`** (`G-01`). Dummy paths remain via `DUMMY_ONBOARD_RESULT` in `App.jsx` / `OnboardingChat.jsx`.

---

## 9. Spec-drift register (functional, but deviates from the named mechanism)

These are not capability gaps — the function works — but a judge or new engineer reading the spec will find a different implementation than promised. Decide per item: update the code to match the doc, or update the doc to match reality.

| ID | Drift | Spec said | Code does | Recommendation |
|---|---|---|---|---|
| D-1 | Optimization libraries | `riskfolio-lib` + `cvxpy` + `sklearn.LedoitWolf` (06:238) | Custom NumPy for ERC/LW/BL/CVaR | **Update the docs** — the NumPy path is dependency-light and tested; reframe spec as "custom implementations of these methods." (`G-17`) |
| D-2 | Explainability transport | "MCP integration" | Gemini function-tools (`explain_tools.py`) | Either build a thin MCP server exposing the same tools, or **rename the claim to "tool-use / function-calling explainability."** (`G-31`) |
| D-3 | Risk-free source | yfinance `^IRX` (data-bom) | FRED `DGS3MO` | Update data-bom; FRED is the better source. (`G-26`) |
| D-4 | API route shape | `/api/*` §6 routes | `/api/v1/*` consolidated | Update 05 §6 to match the live `/api/v1` UI-contract. (`G-12`) |
| D-5 | BL/CVaR delivery | pre-baked toggle fixtures (MVP) | live custom endpoints | Acceptable upgrade; note it. (`G-20`) |
| D-6 | `tolerance_score` | normalized 0–100 | raw GL sum | Normalize or fix schema text. (`G-11`) |

---

## 10. Gap Registry (agent-actionable backlog)

Severity: **P0** blocks the proposed demo / a headline claim · **P1** material spec fidelity · **P2** polish / nice-to-have. Each gap: where it is, the required behavior, the files to touch, and acceptance criteria. Re-confirm line numbers before editing.

### P0 — blocks the demo or a headline claim

**G-01 · Frontend cannot reach the live Projection / Rebalance / Tax endpoints**
- **Domain:** 6 (frontend) + module-0 contract.
- **Now:** `greenlightClient.js` exports `postPortfolio` but **not** `postProjection`, `postRebalance`, `postTaxReport`; `postPortfolio` posts a raw `profile` body instead of `{ profile }`.
- **Required:** add the three wrappers mirroring the existing `postPortfolio`/fetch pattern (host-relative `BASE`), posting to `POST /api/v1/projection`, `/rebalance`, `/tax/report` with the documented request bodies (05 UI §). Fix `postPortfolio` to send `{ profile }`.
- **Files:** `client/src/api/greenlightClient.js`; consumers already exist (`ProjectionChart.jsx`, `RebalancePanel.jsx`, `Dashboard.jsx`).
- **Acceptance:** with backend running, the MC fan chart, rebalance panel, and tax panel render values that match a direct `curl` to each endpoint; `npm --prefix client run build` green.

**G-02 · Backtest API drops the honest-claim metrics**
- **Domain:** 3/5. **Now:** engine computes `cagr`, `deflated_sharpe`, `drawdown_curve`, and the `naive_mvo` strategy (`engine/backtest/run.py:189,191,193,315`), but the API report (`backend/api/v1.py:1449`; response model `backend/models.py:418/436`) omits them; request `profile/weights/start/end` are accepted then ignored.
- **Required:** surface `cagr`, `deflated_sharpe`, `drawdown_curve` per strategy and include `naive_mvo` in `benchmarks`; honor (or explicitly document as ignored) the request params.
- **Files:** `backend/models.py` (BacktestStrategy/Metrics response), `backend/api/v1.py` backtest route + the `run_backtest_report` shaping in `engine/backtest/run.py:289`.
- **Acceptance:** `POST /api/v1/backtest` returns Deflated Sharpe + CAGR + drawdown curve for `greenlight_erc` and all four benchmarks; a UI credibility panel can render the equity + drawdown curves and the DSR.

**G-03 · Tax `bracket` ignored; gate debt-math uses fixed LTCG**
- **Domain:** 1/4. **Now:** `/tax/report` accepts `bracket` but calls `tax_report(..., filing_status)` only (`backend/api/v1.py:1574`); gate net-advantage uses `LTCG_RATE=0.15` (`engine/gate/responsibility.py:18,44`).
- **Required:** thread `bracket` into `engine/tax/report.py` after-tax math and into the gate's expected-after-tax-market-return / debt comparison.
- **Files:** `engine/tax/report.py`, `engine/gate/responsibility.py`, `backend/api/v1.py:1568`. TDD in `engine/tests/test_gate.py` + a tax test.
- **Acceptance:** changing `bracket`/`filing_status` changes harvest value and the gate's `net_advantage_annual`; engine tests green.

### P1 — material spec fidelity

**G-04 · `universe_pref` + `sector_theme_tilts` ignored** — `engine/universe/builder.py` drops both (`backend/api/v1.py:571` passes them). Implement ETF/stock/mix gating and theme tilt filtering in `build_universe`. Acceptance: a `stock`-pref profile yields a stock-only universe; a "technology" tilt reweights/filters toward tech sleeve. *(Note: the `-active` repo has a `_quote_type_allowed` + `_apply_theme_tilts` implementation in `engine/data/loaders.py` that can be ported.)*

**G-05 · GL-13 elicitation firewall is prompt-only** — `backend/llm/elicitation.py:34` relies on the prompt to preserve item validity. Add server-side validation that the 13 responses are present and in range before emitting `profile_ready`. Acceptance: malformed GL responses produce a clarification, not a profile.

**G-06 · Raw `RiskSignals` (07 §3) not modeled** — add `gl_responses`, `per_signal_confidence`, `unresolved_flags` to the LLM-emitted contract (`backend/models.py:182`, `llm/elicitation.py:299`) so the fusion inputs are auditable end-to-end.

**G-07 · GL-13 scoring range** — schema allows 1–4 ×13 (max 52); spec says 13–47 with exact items. Pin the item set + scoring map (`backend/models.py:110`, `engine/profiler/tolerance.py`).

**G-08 · Signal variances hardcoded** — `DOHMEN_VAR=1.0`, loss-aversion variance fixed (`engine/profiler/tolerance.py:9,10`); backend defaults missing probe to `100.0` (`backend/api/v1.py:133`). Tie variances to published reliabilities (cite in 07) and stop silently defaulting the probe — mark it unresolved instead.

**G-09 · No automatic re-ask on Q/I² contradiction** — `engine/profiler/fusion.py:59` returns clarification, but `backend/llm/elicitation.py` has no loop to re-administer the conflicting instrument. Wire the clarification back into the chat turn.

**G-10 · Capacity formula deviates from 02 §3.1** — `engine/profiler/capacity.py:77` uses a different savings/debt formulation. Either align to the documented formula or update 02 §3.1 + model-card to match; add a worked-example test.

**G-11 · `tolerance_score` not normalized 0–100** — `engine/profiler/profile.py:36` stores the raw GL sum. Normalize, or correct the `RiskProfile` schema text (05 §2.3).

**G-16 · Loss-aversion not applied downstream** — fusion folds it in + sets a flag, but `engine/optimizer/blend.py` applies no extra conservative shade (07 §4C). Add an optional γ shade gated on the loss-aversion flag, or document that fusion already absorbs it.

**G-17 / D-1 · riskfolio-lib commitment unmet** — reconcile docs vs the custom NumPy reality (06 stack, `engine/pyproject.toml`).

**G-20 · BL/CVaR shape** — they replace full sleeve weights and run live; spec wanted risky-sleeve-only construction with CAL unchanged, pre-baked for the demo. Decide: keep live (update docs) or constrain to the risky sleeve.

**G-26 / D-3 · Risk-free source drift** — FRED `DGS3MO` vs documented `^IRX`; update data-bom.

**G-27 · No event-history/audit table** — 01 §3.14 wants every gate/allocation/rebalance/profile-change event logged. `backend/persistence.py` stores profiles/chats/accounts/funding only. Add an `events` table if the audit-trail claim is to hold.

**G-31 / D-2 · "MCP" is function-tools** — build a thin MCP server over `backend/llm/explain_tools.py`, or rename the claim.

**G-34..G-38 · Frontend polish** — IntakeChat missing `sessionId` (`G-34`); GateScreen hardcoded fallback cards when `checks` absent (`G-35`); PortfolioView hardcoded `GLIDEPATH`/metric fallback (`G-36`); AlertsView reads wrong path-to-greenlight object (`G-37`); SettingsView ignores `onboardResult` (`G-38`).

### P2 — polish / enhancements (several are net-new vs MVP)

- **G-12 / D-4** — reconcile 05 §6 route list with live `/api/v1/*`.
- **G-13** — explicit deferred-conversion state machine beyond `path_to_greenlight`.
- **G-14** — cached LLM offline fallback for demo-safety (01 principle 6).
- **G-15** — expose GL/γ/SR_REF/CAPACITY_WEIGHTS via `/config` (05 §10).
- **G-18** — glide ignores `horizon`/human-capital-β (linear age only).
- **G-19** — optimizer consumes only `target_vol_band.mid`; produce an allocation range.
- **G-21** — **momentum/volatility tilt: not built here** (exists in `-active` repo; port `engine/optimizer/tilt.py`).
- **G-22** — min-var/max-div ERC ensemble not built.
- **G-23** — Politis-White automatic block-length (currently fixed `BLOCK_L=12`).
- **G-24** — API projection nondeterministic on first no-seed call (generates a fresh seed).
- **G-25** — reconcile cached `engine/data/backtest.json` (ERC worse Sortino/Calmar/turnover than benchmarks) with honest-claims framing; persist a real DSR trial log.
- **G-28** — backend execution forces `monthly_surplus=0.0` (DCA bypassed → lump-sum only).
- **G-29** — Alpaca Broker API lacks order-lifecycle/status reconciliation.
- **G-30** — JNLC instant-funding journal not present here (exists in `-active`).
- **G-32** — auth is `mock-token-<email>`; no persistence/expiry/verification/protected routes.
- **G-33** — `/api/sim/fast-forward` simulated clock missing (05 §6.3).

---

## 11. Deferred-by-spec (absent, but NOT gaps)

The specs explicitly mark these roadmap / post-MVP; their absence is correct for the current scope:

- **Stripe / ACH debt-payment flow** (01 §7 roadmap) — `backend/api/v1.py:1164` is mock-only by design.
- **External loan/debt account linking** (01 §7) — manual debt ingestion is the MVP posture.
- **Full production funding lifecycle** (01 §7/§13) — sandbox ACH/account creation exceeds MVP already.
- **Live brokerage / "we could but won't" execution** (01 §8/§13) — simulator is the demo default; Alpaca adapters are opt-in.

---

## 12. Provenance

Generated from six independent read-only Codex audits (one per domain), each anchored to the cited spec docs and verified against the code with `file:line` evidence. Auditors did not modify files or run tests. This document is a consolidation; line numbers are as-of the `ethan3` audit commit and should be re-confirmed before editing.
