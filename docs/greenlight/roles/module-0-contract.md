# Role: Module 0 — Integration Contract & Client SDK (FOUNDATION)

## Mission
Lock the API↔UI contract and add the missing client wrappers so every Wave-1 role only *calls* the SDK and never re-edits shared plumbing.

## Owns (exclusive write)
- `client/src/api/greenlightClient.js` (add wrappers)
- `backend/api/v1.py` — only the `_to_api_gate` builder (add derived `checks`)
- `backend/models.py` — only the `GateResult` model (add `checks` field)
- `docs/greenlight/05-contracts.md` — add the **§UI-Contract** section

## Do NOT touch
Any component file, any engine package, the engine pipeline functions in `v1.py` other than `_to_api_gate`. This is plumbing only.

## Depends on
Nothing. **Lands first.** All Wave-1 modules block on this.

## Contract (publish these as 05-contracts §UI-Contract — the single source of truth)
Backend already returns these (verified). UI must consume them verbatim:
- `OnboardResponse`: `{ status: "greenlight"|"halt"|"needs_clarification", validated_profile, risk_profile, gate_result, financial_analysis, optimizer_input, portfolio, clarification_requests }`
- `gate_result`: `{ status, failed_check, reason, recommended_action, notes[], preview_next_checks[], math:{ check, emergency_fund:{ current_balance, monthly_expenses, months_covered, required_months, target_balance, shortfall }, debt:{ debt_balance, apr, debt_kind, interest_accruing_annual, net_advantage_annual, verdict } } }` — **note `target_balance` (NOT `target_amount`)**.
- `portfolio` (greenlit only): `{ universe, weights:{ by_ticker:{T:w}, by_sleeve:{S:w}, blend_alpha, method }, metrics:{ expected_vol, expected_shortfall_95, risk_contributions:{S:rc} } }`
- `POST /portfolio` body `{ profile: UserProfileInput }` → `PortfolioResponse` (same `{universe,weights,metrics}`).
- `POST /projection` body `{ weights:TargetWeights, horizon_years, monthly_contribution, capital_on_hand, goal_target, generator:"stationary_bootstrap"|"gaussian", seed?, n_paths }` → `{ p_success, generator, horizon_years, percentile_paths:{p5,p25,p50,p75,p95:number[]}, bad_case_terminal, median_terminal, n_paths }`.
- `POST /rebalance` body `{ positions:{ items:[{ticker,shares,avg_cost,market_value}], portfolio_value, cash }, weights:TargetWeights }` → `{ action:"none"|"steer"|"trade", drifts:{S:{current,target,drift_pp}}, steer?, trades:[{ticker,side,shares}] }`.
- `POST /tax/report` body `{ positions, cost_basis:{T:number}, filing_status, bracket? }` → `{ harvestable:[{ticker,unrealized_loss,note}], wash_sale_warnings:[{ticker,window_days,suggested_replacement}], after_tax_notes[] }`.

## Tasks
1. In `greenlightClient.js`, add (reuse the existing `BASE` + fetch/error pattern; keep the host-relative `BASE` already there). Add a tiny shared `jsonOrThrow(res,label)` helper if not present:
   - `postPortfolio(profile)` → `POST /api/v1/portfolio` with body `{ profile }`.
   - `postProjection(input)` → `POST /api/v1/projection`.
   - `postRebalance(input)` → `POST /api/v1/rebalance`.
   - `postTaxReport(input)` → `POST /api/v1/tax/report`.
2. In `backend/models.py` add `GateCheck { key:str, status:Literal["pass","fail","warn"], detail:str }` and `GateResult.checks: List[GateCheck] = []`.
3. In `backend/api/v1.py` `_to_api_gate(...)`, populate `checks` from the data already computed: an `emergency_fund` check (pass/fail vs required months) and a `high_interest_debt` check (pass/fail vs HIGH_APR), each with a human `detail`. Do not change any other behavior or field.
4. Write `05-contracts.md` §UI-Contract with the shapes above as the canonical reference the other charters link to.

## Verify
- `npm --prefix client run build` green; `grep -nE "postPortfolio|postProjection|postRebalance|postTaxReport" client/src/api/greenlightClient.js` shows all four.
- `PYTHONPATH=backend:engine python3 -m pytest backend/tests -q` green; greenlight persona `/onboard` response now includes `gate_result.checks` and still includes `portfolio`.
- `PYTHONPATH=engine python3 -m pytest engine -q` ≥42.

## Seed prompt
> You are implementing **Module 0 (Integration Contract & Client SDK)** for Mallard Management at `/home/ethan/documents/personal/github/mallard-management-active`. Edit ONLY `client/src/api/greenlightClient.js`, the `_to_api_gate` builder + `GateResult` model in `backend/api/v1.py`/`backend/models.py`, and `docs/greenlight/05-contracts.md`. Do not touch any component or engine package. (1) Add client wrappers `postPortfolio(profile)`→POST `/api/v1/portfolio` body `{profile}`, `postProjection`, `postRebalance`, `postTaxReport`, mirroring the existing fetch/error pattern and the host-relative `BASE`. (2) Add `GateCheck{key,status,detail}` + `GateResult.checks: List[GateCheck]=[]` and populate `checks` in `_to_api_gate` from the already-computed emergency-fund and high-APR-debt results (do not change other fields). (3) Document all consumed shapes (from this charter's Contract section) in `05-contracts.md` §UI-Contract. Verify: client build green; backend tests green; greenlight persona `/onboard` returns `gate_result.checks` + `portfolio`; engine 42 tests green. Do not commit.
