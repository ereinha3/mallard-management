# Greenlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Greenlight Focused-MVP — a responsible robo-advisor whose responsibility gate decides *whether* to invest before a risk-parity engine decides *what*, with a Monte Carlo success projection and an offline backtest, demoed via a polished React UI.

**Architecture:** Deterministic Python engine (the brain) behind a FastAPI; an LLM layer that only elicits/explains (never computes); a React/shadcn frontend. Hard boundary: every number originates in the engine. Pipeline: profile → gate → universe → optimizer (ERC + CAL-blend) → glide → Monte Carlo → sizing → simulated execution. See [01-e2e-design.md](./01-e2e-design.md), exact contracts in [05-contracts.md](./05-contracts.md).

**Tech Stack:** Python 3.12, Pydantic v2, FastAPI, riskfolio-lib + cvxpy + numpy/pandas, scikit-learn (LedoitWolf), pytest. Frontend: React + Vite + TypeScript + shadcn/ui + a charting lib (recharts). LLM via tool-calling/JSON-schema.

**Granularity note:** Phases 0–6 (engine) are full TDD with real test code, pinned to the worked examples in `05-contracts.md` §7. Phases 7–9 (LLM, frontend, integration) are task-decomposed with acceptance criteria and key snippets — they are IO/visual and verified by integration checks rather than unit assertions.

**Definition of done (whole plan):** the two scripted personas run end-to-end **offline**; the halt persona shows the math, the greenlight persona produces an allocation + Monte Carlo % + renders the static backtest; the red→green gate-flip works on re-input.

---

## Phase 0 — Scaffolding & contracts

### Task 0.1: Repo skeleton + tooling
**Files:** Create `engine/pyproject.toml`, `engine/README.md`, `frontend/` (Vite scaffold), `engine/data/.gitkeep`, `engine/fixtures/.gitkeep`.

- [ ] **Step 1: Create the Python package & deps.** `pyproject.toml` with pinned deps:
```toml
[project]
name = "greenlight-engine"
requires-python = ">=3.12"
dependencies = [
  "pydantic>=2.6", "fastapi>=0.110", "uvicorn>=0.29",
  "numpy>=1.26", "pandas>=2.2", "scikit-learn>=1.4",
  "riskfolio-lib>=7.2", "cvxpy>=1.6", "scipy>=1.12",
]
[project.optional-dependencies]
dev = ["pytest>=8.0", "httpx>=0.27"]
```
- [ ] **Step 2: Verify install** — Run `cd engine && pip install -e ".[dev]"`. Expected: resolves without pinning `solver="ECOS"` anywhere (CVXPY 1.6 dropped it; default Clarabel/SCS is used).
- [ ] **Step 3: Commit** — `git add engine frontend && git commit -m "chore: scaffold engine and frontend"`

### Task 0.2: Pydantic schemas (the source of truth)
**Files:** Create `engine/schemas/models.py`, `engine/tests/test_schemas.py`.

- [ ] **Step 1: Write failing test** for the core enums/objects from `05-contracts.md` §2:
```python
from schemas.models import UserProfile, Debt, Sleeve
def test_userprofile_roundtrips_and_rejects_bad_enum():
    p = UserProfile(household_income=78000, monthly_expenses=3200, capital_on_hand=6000,
        emergency_fund=1500, debts=[Debt(balance=9000, apr=0.22, kind="credit_card")],
        age=28, horizon_years=37, goals=["retirement"], goal_target=1_000_000, dependents=0,
        filing_status="single", risk_instrument_responses=[2]*13,
        loss_scenario_response="sell_some", loss_aversion_probe=250.0,
        income_stability="mixed", universe_pref="etf", esg_exclusions=["fossil_fuels"],
        sector_theme_tilts=[], confidence={}, uncertainty_flags=[])
    assert p.debts[0].apr == 0.22
    import pytest
    with pytest.raises(Exception):
        Debt(balance=1, apr=0.1, kind="bitcoin")   # invalid enum
```
- [ ] **Step 2: Run** `pytest engine/tests/test_schemas.py -v` → FAIL (module missing).
- [ ] **Step 3: Implement** all §2 objects as Pydantic v2 models with the exact fields, enums (use `Literal[...]`), and constraints (`Field(ge=0)`, ranges). Include `UserProfile, Debt, ValidatedProfile, RiskProfile, GateResult, Universe, TargetWeights, RiskMetrics, Projection, OrderPlan, Fill, Position, Positions, RebalanceDecision, TaxReport, BacktestResult` and the `Sleeve` Literal.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(schemas): contract models per 05-contracts §2"`

### Task 0.3: Universe data + cached prices (build-time fetch)
**Files:** Create `engine/data/universe.csv` (per `05` §5), `engine/scripts/fetch_prices.py`, `engine/data/prices.csv`.

- [ ] **Step 1:** Write `universe.csv` with the six sleeves/tickers/market_weights/esg substitution columns from `05` §5.
- [ ] **Step 2:** Write `fetch_prices.py` using yfinance **with retries/sleeps** (yfinance is rate-limited; this is build-time only). Save `date,ticker,adj_close` for the full backtest window.
- [ ] **Step 3: Run once** `python engine/scripts/fetch_prices.py` → `prices.csv` populated. Commit the CSV (so runtime never calls yfinance).
- [ ] **Step 4: Commit** — `git commit -am "data: universe table + cached prices (offline runtime)"`

---

## Phase 1 — Responsibility Gate (the differentiator: build first, test hardest)

### Task 1.1: Emergency-fund check
**Files:** Create `engine/gate/responsibility.py`, `engine/tests/test_gate.py`.

- [ ] **Step 1: Write failing tests** (pinned to `05` §7.1 + boundaries):
```python
from gate.responsibility import evaluate_gate
from tests.factories import maya_t0, maya_greenlit   # helper builders
def test_halt_when_emergency_fund_below_three_months():
    r = evaluate_gate(maya_t0())   # ef=1500, expenses=3200
    assert r.status == "halt"
    assert r.failed_check == "emergency_fund"
    assert r.math.target_amount == 9600          # 3 * 3200
def test_boundary_exactly_three_months_passes_ef_check():
    p = maya_t0(); p.emergency_fund = 9600
    r = evaluate_gate(p)
    assert r.failed_check != "emergency_fund"     # >= passes
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `evaluate_gate` step 1 only: `required = 3*monthly_expenses`; if `emergency_fund < required` return halt with `target_amount=required`. `>=` passes.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.**

### Task 1.2: High-interest debt check + harm-prevented math
**Files:** Modify `engine/gate/responsibility.py`; Modify `engine/tests/test_gate.py`.

- [ ] **Step 1: Write failing tests** (pinned to `05` §7.1):
```python
def test_halt_on_high_apr_with_harm_math():
    p = maya_greenlit()                 # ef ok
    p.debts = [Debt(balance=9000, apr=0.22, kind="credit_card")]
    r = evaluate_gate(p, bracket=0.22, expected_market_return=0.07)
    assert r.status == "halt" and r.failed_check == "high_interest_debt"
    assert r.math.guaranteed_return == 0.22
    assert round(r.math.expected_after_tax_market_return, 4) == 0.0595   # 0.07*(1-0.15)
    assert r.math.harm_prevented_annual == 1980.0                        # 9000*0.22
def test_boundary_apr_exactly_threshold_does_not_halt():
    p = maya_greenlit(); p.debts = [Debt(balance=5000, apr=0.08, kind="personal")]
    assert evaluate_gate(p).failed_check != "high_interest_debt"          # >8% halts, ==8% does not
def test_low_interest_debt_noted_not_halted():
    p = maya_greenlit(); p.debts = [Debt(balance=14000, apr=0.045, kind="student")]
    r = evaluate_gate(p)
    assert r.status == "greenlight" and any("student" in n or "4.5" in n for n in r.notes)
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:** after EF passes, scan debts; `apr > 0.08` → halt with `harm_prevented_annual = balance*apr`, `expected_after_tax_market_return = expected_market_return*(1-0.15)`. `apr < 0.05` → append a note. Ordering: EF check first, then debt. Long-term-cap-gains rate `0.15` is a module constant.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.**

### Task 1.3: Greenlight path + deferred-conversion framing string
- [ ] **Step 1: Test** that a clean profile returns `status=greenlight`, `failed_check="none"`, `math=None`, and `recommended_action==""`.
- [ ] **Step 2–4:** Implement/verify.
- [ ] **Step 5: Commit.** (`tests/factories.py` builds `maya_t0` and `maya_greenlit` from the §8 personas — create it in this task if not present.)

---

## Phase 2 — Risk Profiler & γ calibration

### Task 2.1: Tolerance score → γ band (pinned to `05` §7.2)
**Files:** Create `engine/profiler/tolerance.py`, `engine/tests/test_tolerance.py`.

- [ ] **Step 1: Write failing test:**
```python
from profiler.tolerance import score_to_gamma_band
def test_gamma_band_matches_worked_example():
    band = score_to_gamma_band(raw_score=30.0)   # constants per 05 §2.1
    assert round(band.mid, 2) == 2.75
    assert round(band.low, 2) == 2.11    # aggressive bound (score+SEM)
    assert round(band.high, 2) == 3.78   # conservative bound (score-SEM)
    assert band.low <= band.mid <= band.high
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** using constants mean=28.27, sd=4.94, alpha=0.77, GAMMA_MIN=1.5, GAMMA_MAX=8.0:
```python
from math import log, exp, sqrt
from scipy.stats import norm
def _gamma_at(score):
    p = norm.cdf((score-28.27)/4.94)
    return exp(log(8.0) - p*(log(8.0)-log(1.5)))
def score_to_gamma_band(raw_score):
    sem = 4.94*sqrt(1-0.77)                     # ~2.369
    return GammaBand(mid=_gamma_at(raw_score),
                     low=_gamma_at(raw_score+sem),   # higher score -> lower gamma
                     high=_gamma_at(raw_score-sem))
```
- [ ] **Step 4: Run** → PASS (tolerances allow ±0.01).
- [ ] **Step 5: Commit.**

### Task 2.2: Capacity score → γ floor, and `min(capacity,tolerance)` combine
**Files:** Create `engine/profiler/capacity.py`, `engine/profiler/profile.py`; tests.

- [ ] **Step 1: Test** capacity weighting (horizon 30%, income-stability 25%, EF 15%, savings 15%, debt 15% per `02` §3) and the combine rule: `gamma_used = max(tolerance_gamma, capacity_gamma)`; `binding_axis` is whichever is larger. Pin Maya: horizon 37 → high capacity → `capacity_gamma≈2.0` → tolerance binds (`binding_axis=="tolerance"`).
```python
def test_capacity_does_not_bind_for_long_horizon():
    rp = build_risk_profile(maya_greenlit())
    assert rp.binding_axis == "tolerance"
    assert rp.gamma_band.mid == rp.tolerance_gamma.mid    # capacity floor below tolerance
def test_short_horizon_capacity_caps():
    p = maya_greenlit(); p.horizon_years = 1
    rp = build_risk_profile(p)
    assert rp.binding_axis == "capacity" and rp.gamma_band.mid >= rp.tolerance_gamma.mid
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the weighted 0–100 capacity score, map to `capacity_gamma` via the same log map, combine with `max`, set `target_vol_band = SR_ref/gamma` with `SR_ref=0.4`. **Step 4:** PASS. **Step 5: Commit.**

---

## Phase 3 — Universe & Optimizer (ERC + CAL-blend)

### Task 3.1: Universe builder
**Files:** Create `engine/universe/builder.py`, tests.

- [ ] **Step 1: Test** that ESG exclusions swap tickers (e.g. `fossil_fuels` → VTI→ESGV) and that `risky_sleeves={us_equity,intl_equity,reits,gold}`, `safe_sleeves={bonds,tips}`, `market_weights` sum to 1.0 (per `05` §4–5).
- [ ] **Step 2–4:** Implement from `universe.csv`. **Step 5: Commit.**

### Task 3.2: ERC over risky sleeves (riskfolio-lib) + Ledoit-Wolf covariance
**Files:** Create `engine/optimizer/erc.py`, tests.

- [ ] **Step 1: Test** that ERC weights over the risky sleeves are positive, sum to 1, and that **risk contributions are approximately equal** (the defining ERC property — assert pairwise within 1e-3 of each other on cached returns).
```python
def test_erc_risk_contributions_are_equal():
    w = erc_weights(returns_risky())          # pandas DataFrame from prices.csv
    rc = risk_contributions(w, cov_ledoit_wolf(returns_risky()))
    assert max(rc) - min(rc) < 1e-3
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** using `riskfolio.Portfolio(...).rp_optimization(model="Classic", rm="MV")` with the covariance set to `sklearn.covariance.LedoitWolf().fit(returns).covariance_`. Provide `risk_contributions` and `cov_ledoit_wolf` helpers. **Step 4:** PASS. **Step 5: Commit.**

### Task 3.3: CAL-blend to target vol + glide (pinned to `05` §7.3)
**Files:** Create `engine/optimizer/blend.py`, tests.

- [ ] **Step 1: Test:**
```python
def test_cal_blend_hits_target_vol():
    a = solve_blend_alpha(sigma_risky=0.16, sigma_safe=0.05, rho=0.15, sigma_target=0.145)
    assert 0.86 <= a <= 0.90                     # ~0.88, no clamp
def test_clamp_when_target_exceeds_risky():
    assert solve_blend_alpha(0.16, 0.05, 0.15, 0.20) == 1.0
def test_glide_factor_reduces_alpha_with_age():
    assert glide_factor(age=28, horizon=37) > glide_factor(age=60, horizon=5)
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** bisection on `σ_blend(a)` with the §4 formula; clamp rules; `glide_factor = clamp(1-max(0,age-25)/100, 0.3, 1.0)`; `a_final = a*·glide_factor`; assemble final `TargetWeights` (`by_sleeve`, `by_ticker`, `blend_alpha`, `method="erc"`). **Step 4:** PASS. **Step 5: Commit.**

### Task 3.4: Pre-bake BL/CVaR toggle weights (fixture generator)
**Files:** Create `engine/scripts/gen_toggle_weights.py`, output `engine/fixtures/toggle_weights.json`.

- [ ] **Step 1:** Script computes Black-Litterman (riskfolio BL with the §5 `market_weights` equilibrium prior + a sample ESG view) and mean-CVaR (`rm="CVaR"` on the historical scenario set) weight vectors, writes them as two `TargetWeights`. **Step 2: Run** → JSON written. **Step 3: Commit** (these are *shown* via toggle, not computed live).

---

## Phase 4 — Monte Carlo goal-success

### Task 4.1: Stationary block bootstrap + wealth sim (pinned to `05` §7.4)
**Files:** Create `engine/montecarlo/projection.py`, tests.

- [ ] **Step 1: Test** determinism with a seeded RNG and known short series:
```python
def test_p_success_deterministic_and_in_range():
    proj = project(weights=fixed_weights(), returns=toy_returns(), horizon_years=10,
                   capital=10000, monthly_contribution=500, goal=120000,
                   generator="stationary_bootstrap", n_paths=2000, seed=42)
    assert 0.0 <= proj.p_success <= 1.0
    assert proj.median_terminal > 0 and proj.bad_case_terminal <= proj.median_terminal
def test_gaussian_is_more_optimistic_on_fat_tailed_series():
    boot = project(..., generator="stationary_bootstrap", seed=1).p_success
    gauss = project(..., generator="gaussian", seed=1).p_success
    assert gauss >= boot   # Gaussian ignores fat tails -> optimistic (05 §7.4)
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** geometric-block resampling (default `L=12`), per-path monthly wealth accumulation with contributions, percentile paths (p5/25/50/75/95), `p_success`, `bad_case_terminal`. RNG seeded (`numpy.random.default_rng(seed)`) — required for resumable/repeatable runs. **Step 4:** PASS. **Step 5: Commit.**

---

## Phase 5 — Sizing, broker simulator, rebalancer

### Task 5.1: Affordability sizer
**Files:** `engine/sizing/sizer.py`, tests.
- [ ] **Step 1: Test** weights→dollars against `capital_on_hand`, fractional shares = `dollars/price`, `method=dca` when `monthly_surplus>0` else `lump_sum`, schedule length sane. **Step 2–4.** **Step 5: Commit.**

### Task 5.2: In-process broker simulator behind the adapter interface
**Files:** `engine/broker/base.py` (interface), `engine/broker/simulator.py`, tests.
- [ ] **Step 1: Test** `place_order(OrderPlan)` returns fills at cached prices; `read_positions()` reflects them with correct `avg_cost`/`market_value`; `portfolio_value` = positions + cash. **Step 2–4.** **Step 5: Commit.** (Alpaca adapter is a later optional stub implementing the same `base.py`.)

### Task 5.3: Drift-band rebalancer
**Files:** `engine/rebalance/rebalancer.py`, tests.
- [ ] **Step 1: Test:** drift within ±5pp → `action="steer"` (no trades); a sleeve at +6pp → `action="trade"` with a minimal corrective trade; all on target → `action="none"`. **Step 2–4.** **Step 5: Commit.**

---

## Phase 6 — Tax layer & offline backtest

### Task 6.1: Tax report (read-only)
**Files:** `engine/tax/report.py`, tests.
- [ ] **Step 1: Test** from seeded positions/cost-basis: positions below basis appear in `harvestable` with correct `unrealized_loss`; each gets a `wash_sale_warnings` entry with `window_days=30` and a `suggested_replacement` that is **not** the same ticker; an `after_tax_notes` line states the $3,000 ordinary-offset cap. **Step 2–4.** **Step 5: Commit.**

### Task 6.2: Offline walk-forward backtest + Deflated Sharpe (pinned to `05` §7.5)
**Files:** `engine/backtest/run.py`, `engine/backtest/metrics.py`, output `engine/data/backtest.json`, tests for metrics.
- [ ] **Step 1: Test metrics:** `deflated_sharpe(returns, sr_hat, n_trials)` matches the §7.5 formula on a known vector; `max_drawdown`, `sortino`, `calmar` on known vectors.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** walk-forward (36–60mo window, quarterly rebalance, `tx_cost_bps=10`) over strategies {greenlight_erc, one_over_n, sixty_forty, target_date, naive_mvo}; compute metrics incl. Deflated Sharpe with `n_trials` = the real count of configs tried; write `backtest.json` (`BacktestResult`). **Step 4:** PASS. **Step 5: Commit.**
- [ ] **Step 6: Honesty check** — the README of the backtest output states the claim as "better drawdown/Sortino/Calmar + lower turnover," not "beats 1/N Sharpe."

---

## Phase 7 — LLM layer (interface only)

*Verified by integration assertions (valid schema out, contradiction caught), not unit math.*

### Task 7.1: Structured extraction with JSON-schema/tool-calling
**Files:** `engine/api/llm/extract.py`, `engine/tests/test_extract_contract.py`.
- [ ] **Step 1:** Define the tool/function schema = `UserProfile` (§2.1). The LLM call must use constrained output; on parse, run through the Validation Gate (Task 7.3).
- [ ] **Step 2: Acceptance test (mocked LLM):** feed the cached `llm_*.json` response → returns a schema-valid `UserProfile`; a deliberately malformed response → raises and routes to clarification. **Step 3: Commit.**

### Task 7.2: Guided-form fallback
- [ ] Build a deterministic form→`UserProfile` mapper so the demo never depends on a live LLM call. **Acceptance:** form payload → identical `UserProfile`. **Commit.**

### Task 7.3: Validation gate + contradiction detection
**Files:** `engine/profiler/validate.py`, tests.
- [ ] **Step 1: Test** range/enum/completeness rules reject bad profiles; **contradiction rule**: `loss_scenario_response in {sell_some,sell_all}` while self-rating is aggressive → emits a `clarification_request` (the SEC-critique answer). **Step 2–4.** **Step 5: Commit.**

### Task 7.4: Explanation agent (narration, grounded)
- [ ] Narrate a given engine object in plain language with an **anti-sycophancy** system prompt; **must not** introduce numbers absent from the payload. **Acceptance (mocked):** narration of a `GateResult` contains only figures present in the object. **Commit.**

---

## Phase 8 — API & Frontend

### Task 8.1: FastAPI wiring (§6 endpoints)
**Files:** `engine/api/main.py`, `engine/tests/test_api.py`.
- [ ] **Step 1: Test** each §6 endpoint with `httpx` against fixtures: `/gate/evaluate` halt persona → `status=halt`; `/run` greenlight persona → includes `weights` + `projection`; error shape (§6.4) on bad input → 422. **Step 2–4.** **Step 5: Commit.**

### Task 8.2: Frontend scaffold + visual identity (hour-0)
**Files:** `frontend/` Vite+TS+shadcn, `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts` (mirror §2), `frontend/src/fixtures/*.json`.
- [ ] **Acceptance:** a committed **visual identity** (color/type tokens, the red→green light motif) in `frontend/src/theme`; app renders against mocked fixtures with no backend. **Commit.**

### Task 8.3: Screen 1 — Guided intake + transparent parameter panel
- [ ] **Acceptance:** as answers arrive, the side panel shows the populating `UserProfile` fields; the contradiction-catch surfaces a follow-up. Renders from fixtures. **Commit.**

### Task 8.4: Screen 2 — Gate result (the centerpiece) + gate-flip
- [ ] **Acceptance:** halt persona renders the EF target, the debt math, and the **harm-prevented dollar figure**; a re-run with the greenlight persona triggers the **red→green animation**. **Commit.**

### Task 8.5: Screen 3 — Portfolio: donut + Monte Carlo fan chart + backtest
- [ ] **Acceptance:** animated allocation donut from `TargetWeights`; **Monte Carlo fan chart** with the `p_success` headline and a bootstrap↔Gaussian toggle; static **backtest** equity/drawdown charts with the **Deflated Sharpe** number visible. **Commit.**

### Task 8.6: Screen 4 (lower priority) — Rebalance + tax panel
- [ ] **Acceptance:** drift bars, `RebalanceDecision`, read-only TLH flags + wash-sale caveat. **Commit.**

---

## Phase 9 — Integration, personas & demo hardening

### Task 9.1: Persona fixtures + seeded state
- [ ] Author `persona_halt.json`, `persona_greenlight.json`, `state_seed.json`, cached `llm_*.json` (§8). **Acceptance:** both personas run end-to-end through the real engine. **Commit.**

### Task 9.2: Offline-mode verification
- [ ] **Acceptance:** with **wifi off**, the full demo runs (cached prices, cached LLM responses, simulator broker, static backtest, self-hosted fonts). Document any network call found and remove it. **Commit.**

### Task 9.3: Demo dress rehearsal + recorded fallback
- [ ] Run the 3-minute script from [04-build-and-demo.md](./04-build-and-demo.md) §7 end-to-end; record a narrated screen-capture as the ultimate fallback. **Commit.**

### Task 9.4: Dependency lockfile
- [ ] Freeze a lockfile for Python + JS; verify a clean offline install. **Commit.**

---

## Self-review notes (coverage vs. spec)

- Every component in `01` §3 maps to a task: gate (P1), profiler/γ (P2), universe+optimizer+CAL-blend (P3), Monte Carlo (P4), sizer/broker/rebalancer (P5), tax/backtest (P6), LLM layer (P7), API/frontend (P8), integration (P9). Pre-baked BL/CVaR (3.4), backtest (6.2), tax scenario (6.1 + 9.1 seed) per the Focused-MVP cut list (`04`).
- Worked examples in `05` §7 are each turned into a pinning test (gate 1.1–1.2, γ 2.1, CAL 3.3, MC 4.1, Deflated Sharpe 6.2).
- Demo-safety items from `04` §4 are tasks 9.2–9.4.
- **Known intentional gap:** literal frontend component code is not enumerated step-by-step (Phase 8 uses acceptance criteria) — visual work is verified by rendering against fixtures, not unit assertions. Flag for reviewers if more granularity is wanted.
