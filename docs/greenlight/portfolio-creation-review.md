# Portfolio-creation review

Review of the portfolio creation/editing surface after kimball's "Streamline
portfolio creation" merge (risk dial + grouped sliders + `PortfolioEditor`).
Read-only assessment of the backend math and its consistency with the engine.

**Surface reviewed**
- `POST /api/v1/portfolio` — build target portfolio (ERC + CAL).
- `POST /api/v1/portfolio/reoptimize` — profile + `risk_dial` (0–1) → portfolio + `risk_summary`.
- `POST /api/v1/portfolio/analyze-weights` — profile + user-edited weights → normalized weights + metrics + validation.
- `client/src/components/greenlight/{PortfolioEditor,PortfolioView}.jsx`, `engineData.js`.

Overall the surface is well-architected and reuses the real engine
(`build_target_weights`, ERC, Ledoit-Wolf covariance, `risk_contributions`).
The findings below are about **numeric consistency**, not structural problems.

---

## #1 — Divergent volatility numbers in `/portfolio/reoptimize`  — ✅ FIXED

**Was:** the route reported `risk_summary.target_volatility_pct` from the
**γ-derived band** (`_target_vol_for_dial`), but built the portfolio at a
**different** target from the **empirical safe/risky σ frontier**
(`_optimizer_target_vol_for_dial`), and `portfolio.metrics.expected_vol` was a
third, realized number. The displayed "target volatility" could therefore
disagree with the portfolio the user was actually shown.

**Fix:** `risk_summary` now reports the portfolio's **realized**
`metrics.expected_vol` (and `estimated_max_loss_1yr_pct = 2 × realized_vol`), so
the headline matches the portfolio exactly. The dial still drives the optimizer
across the empirical frontier (responsive); the now-unused `_target_vol_for_dial`
helper was removed. `backend/api/v1.py`.

**Verification:** `scripts/smoke/realdata_pipeline_smoke.py` now asserts
`shown target == realized vol` across dials 0.0 / 0.5 / 1.0 (real data:
5.8% / 9.9% / 14.0%, each matching exactly). Backend tests stay green (13).

---

## #2 — `estimated_max_loss_1yr_pct = 2 × vol` is a rough heuristic — OPEN (low)

A 2σ normal approximation understates fat tails (2008/2020/2022 all exceeded it).
Acceptable as a demo estimate; if you want it defensible, derive it from the
Monte Carlo 5th-percentile 1-yr terminal or the backtest max-drawdown instead.
Now at least it uses the realized vol (post-#1). **Owner:** backend.

## #3 — `sum_risky_within_bucket` / `sum_safe_within_bucket` are trivially 1.0 — OPEN (low)

In `_portfolio_weight_validation`, `Σ(by_sleeve[s] / bucket_total)` over a bucket
is **1.0 by construction** whenever the bucket is non-empty, so these two
validation fields carry no information. Either drop them or redefine them to
something meaningful (e.g., per-sleeve concentration / HHI within the bucket).
**Owner:** backend.

## #4 — Frontend hardcoded fallback allocation — OPEN (low, frontend)

`client/src/components/greenlight/engineData.js` `normalizeSleeveWeights()` falls
back to a fixed allocation (`us_equity 0.38, intl 0.2, bonds 0.18, tips 0.08,
gold 0.08, reits 0.08`) when weights are empty, and `portfolioSplit()` defaults
to `{risky 0.5, safe 0.5}`. If `onboardResult.portfolio` is ever null, the UI
silently renders these fake numbers instead of an empty state. Prefer an explicit
"no portfolio yet" state. **Owner:** frontend.

## #5 — UI not yet wired to backtest / portfolio endpoints — OPEN (info, frontend)

`greenlightClient.js` has `postReoptimize` + `postAnalyzeWeights`, but **no**
`postBacktest` or `postPortfolio` wrappers — so the Module-F backtest and the
foundation `/portfolio` endpoint aren't consumed by the UI yet. This is the
concrete remaining frontend wiring. See `docs/greenlight/05-contracts.md`
§UI-Contract for the wrapper specs. **Owner:** frontend.

---

## Note: two *legitimately* different "target volatility" numbers

Don't conflate these — both are correct:
- **Profile-level** `RiskSummary.target_volatility_pct` (onboarding) = the γ-band
  **mid**. This is "based on your risk profile, your target vol is ~X%" — a
  descriptor of the *person*, independent of any built portfolio. Left as-is.
- **Portfolio-level** `PortfolioRiskSummary.target_volatility_pct` (reoptimize) =
  the **realized** vol of the *built portfolio* (post-#1 fix).
