# Codex Task 00 — Greenlight engine FOUNDATION (barrier; build before all package tasks)

You are implementing the foundation of a Python risk engine. **Read `docs/greenlight/05-contracts.md` (esp. §2 schemas, §5 universe, §8 fixtures, §9 layout, §10 constants) and `docs/greenlight/06-implementation-plan.md` Phase 0 — they are the source of truth.** Build to spec exactly; do not invent fields or rename anything.

## Deliverables (all under `engine/`)

1. **`engine/pyproject.toml`** — package `greenlight-engine`, Python ≥3.12. Deps: `pydantic>=2.6, fastapi>=0.110, uvicorn>=0.29, numpy>=1.26, pandas>=2.2, scikit-learn>=1.4, riskfolio-lib>=7.2, cvxpy>=1.6, scipy>=1.12`. Dev extras: `pytest>=8.0, httpx>=0.27`.

2. **`engine/schemas/models.py`** — every object in 05 §2 as Pydantic v2 models with EXACT field names, types, enums (`Literal[...]`), and constraints (`Field(ge=0)`, ranges). MUST include: `GammaBand` (fields `aggressive, mid, conservative`), `UserProfile`, `Debt`, `ValidatedProfile` (+ `derived`), `RiskProfile` (uses `GammaBand`, has `tolerance_gamma`, `capacity_gamma`, `target_vol_band`, `binding_axis`), `GateResult` (with `failed_check`, `notes`, and `math.interest_accruing_annual` + `math.net_advantage_annual`), `Universe` (+ `risky_sleeves`, `safe_sleeves`, `market_weights`), `TargetWeights` (+ `blend_alpha`, `method`), `RiskMetrics`, `Projection`, `OrderPlan`, `Fill`, `Position`, `Positions`, `RebalanceDecision`, `TaxReport`, `BacktestResult`, and a `Sleeve` Literal (`us_equity|intl_equity|bonds|tips|gold|reits`).

3. **`engine/schemas/constants.py`** — every value from 05 §10 as module constants: `EF_MONTHS=3, HIGH_APR=0.08, LOW_APR=0.05, LTCG_RATE=0.15, EXPECTED_MARKET_RETURN=0.07, GAMMA_MIN=1.5, GAMMA_MAX=8.0, GL_MEAN=28.27, GL_SD=4.94, GL_ALPHA=0.77, SR_REF=0.4, CAPACITY_WEIGHTS={"horizon":0.30,"income_stability":0.25,"ef":0.15,"savings":0.15,"debt":0.15}, DRIFT_BAND_PP=5, TX_COST_BPS=10, BLOCK_L=12, N_PATHS=10000, GLIDE_BASE_AGE=25, GLIDE_FLOOR=0.3`.

4. **`engine/data/universe.csv`** — the six sleeves per 05 §5 (sleeve, ticker, role[risky|safe], esg_tags, market_weight) plus ESG substitution columns (e.g. fossil_fuels→ESGV/ESGD). **`engine/data/prices.csv`** — generate a SYNTHETIC daily price history (~6 years) for all tickers so tests run fully offline (do NOT call yfinance). Make returns realistic-ish (equities ~16% annual vol, bonds ~5%, gold ~15%, with a mild negative skew on equities).

5. **`engine/data/loaders.py`** — `load_prices()->DataFrame`, `returns_matrix(sleeves)->DataFrame`, `sleeve_returns(weights)->Series`, `load_universe(esg_exclusions)->Universe`.

6. **`engine/fixtures/persona_halt.json`** + **`persona_greenlight.json`** — `UserProfile` JSON for Maya T0 (halt: ef=1500, expenses=3200, $9000@22% card) and T1 (greenlight: ef=10000, card paid, $14000@4.5% student loan, capital 7500). Match 05 §8 / 03 persona table.

7. **`engine/tests/factories.py`** — `maya_t0()` and `maya_greenlit()` loading those fixtures as `UserProfile`.

8. **EMPTY module skeletons** — create each module with the EXACT public function signatures from 06 (type-hinted, docstring referencing the contract section, body `raise NotImplementedError`). These define the import surface so parallel agents don't conflict:
   - `engine/gate/responsibility.py`: `evaluate_gate(profile: ValidatedProfile) -> GateResult`
   - `engine/profiler/tolerance.py`: `score_to_gamma_band(raw_score: float) -> GammaBand`
   - `engine/profiler/capacity.py`: `capacity_score(profile) -> float`, `capacity_to_gamma(score: float) -> float`
   - `engine/profiler/validate.py`: `validate_profile(up: UserProfile)`
   - `engine/profiler/profile.py`: `build_risk_profile(vp: ValidatedProfile) -> RiskProfile`
   - `engine/universe/builder.py`: `build_universe(prefs) -> Universe`
   - `engine/optimizer/erc.py`: `cov_ledoit_wolf(returns)`, `erc_weights(returns) -> dict`, `risk_contributions(w, cov)`
   - `engine/optimizer/blend.py`: `solve_blend_alpha(sigma_risky, sigma_safe, rho, sigma_target) -> float`, `glide_factor(age, horizon) -> float`, `build_target_weights(risk_profile, universe, prices) -> TargetWeights`
   - `engine/montecarlo/projection.py`: `project(weights, returns, horizon_years, capital, monthly_contribution, goal, generator, seed, n_paths) -> Projection`
   - `engine/sizing/sizer.py`: `size_orders(weights, capital_on_hand, monthly_surplus) -> OrderPlan`
   - `engine/broker/base.py`: `BrokerAdapter` Protocol (`place_order`, `read_positions`); `engine/broker/simulator.py`: `SimulatorBroker`
   - `engine/rebalance/rebalancer.py`: `decide_rebalance(positions, weights) -> RebalanceDecision`
   - `engine/tax/report.py`: `tax_report(positions, cost_basis, filing_status) -> TaxReport`
   - `engine/backtest/metrics.py`: `deflated_sharpe(returns, sr_hat, n_trials)`, `sortino`, `max_drawdown`, `calmar`; `engine/backtest/run.py`: `run_backtest(...) -> BacktestResult`
   - Add `__init__.py` to every package.

9. **`engine/tests/test_schemas.py`** — the Task 0.2 test (roundtrip a `UserProfile`, reject a bad enum). Ensure `pytest` COLLECTS the whole suite (skeleton tests may xfail/skip but collection must succeed).

## Spikes (run and report results in your final summary)
- Create a venv at `engine/.venv` and `pip install -e ".[dev]"`. **Report whether `riskfolio-lib` + `cvxpy` install cleanly on Python 3.12.**
- **Spike A:** write a throwaway script that builds ERC weights on 4 synthetic sleeves via riskfolio-lib and checks risk contributions are equal within 1e-3. Report PASS/FAIL. **If riskfolio-lib fails to install or ERC doesn't converge, implement a 20-line hand-rolled ERC (cyclical coordinate descent on a Ledoit-Wolf covariance) in `engine/optimizer/erc.py` as the real implementation and note this.**
- **Spike D:** verify `solve_blend_alpha(0.16, 0.05, 0.15, 0.145)` ≈ 0.90 (you may implement this one function to test it). Report the value.

## Rules
- Do NOT implement package logic beyond the skeletons (other agents will). EXCEPTION: you may fully implement `solve_blend_alpha` (tiny) for Spike D, and the hand-rolled ERC only if riskfolio fails.
- Do NOT commit — leave changes in the working tree; the orchestrator commits.
- Match 05 exactly. Report: install result, Spike A result, Spike D value, and any deviations you had to make.
