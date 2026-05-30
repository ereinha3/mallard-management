# Codex Task 04 — `montecarlo` package (goal-success projection)

Implement `engine/montecarlo/projection.py`. **Read `05` §2.7, §7.4 and `06` Phase 4 (Task 4.1); `02` §6.** Import constants from `engine/schemas/constants.py`.

## `project(weights, returns, horizon_years, capital, monthly_contribution, goal, generator, seed, n_paths) -> Projection`
1. Portfolio monthly return series `r_p = weights · returns` (returns = sleeve/ticker monthly return matrix).
2. `generator="stationary_bootstrap"` (default, headline): geometric-block resampling with expected block length `BLOCK_L`; generate `n_paths` paths of length `horizon_years*12` (random start index, geometric(BLOCK_L) block length, concatenate). Use `numpy.random.default_rng(seed)` — seeded for determinism.
3. `generator="gaussian"` toggle: draw `r ~ Normal(mean(r_p), var(r_p))` i.i.d.
4. Wealth sim per path: `W=capital`; each month `W = W*(1+r) + monthly_contribution`.
5. Output `Projection`: `p_success = mean(W_terminal >= goal)`; `percentile_paths` (p5/p25/p50/p75/p95 wealth by year); `bad_case_terminal = 5th pct terminal`; `median_terminal`; `n_paths`; `generator`.

## Tests (06 Task 4.1) — `engine/tests/test_montecarlo.py`
- seeded determinism; `0<=p_success<=1`; `bad_case_terminal <= median_terminal`.
- On an EXPLICITLY negatively-skewed toy series: `bootstrap.bad_case_terminal < gaussian.bad_case_terminal` (bootstrap preserves the fat left tail). **Do NOT assert `gaussian.p_success >= bootstrap.p_success` unconditionally** (05 §7.4 — conditional).
- Vectorize so 10k paths × long horizon runs fast (<2s ideal).

## Rules
TDD; `pytest engine/tests/test_montecarlo.py -v` green. No git commit. Match 05 §2.7 exactly.
