# Codex Task 03 — `universe` + `optimizer` packages (technical centerpiece)

Implement `engine/universe/builder.py` and `engine/optimizer/{erc,blend}.py`. **Read `05` §4, §5, §7.3 and `06` Phase 3 (Tasks 3.1–3.3); `02` §5.** Import constants from `engine/schemas/constants.py`. If the foundation's Spike A note says riskfolio-lib failed, the hand-rolled ERC is already in `erc.py` — keep/extend it; otherwise use riskfolio-lib.

## universe/builder.py — `build_universe(prefs) -> Universe`
From `engine/data/universe.csv`: apply ESG exclusions (swap tickers per the substitution columns), set `risky_sleeves={us_equity,intl_equity,reits,gold}`, `safe_sleeves={bonds,tips}`, `market_weights` (sum to 1.0). Test: exclusions swap tickers; weights sum to 1.

## optimizer/erc.py
- `cov_ledoit_wolf(returns)` → Ledoit-Wolf shrunk covariance (sklearn `LedoitWolf`), returned as a DataFrame with ticker/sleeve labels.
- `erc_weights(returns) -> dict` → equal-risk-contribution weights (riskfolio-lib `rp_optimization(model="Classic", rm="MV")` with the shrunk cov injected via `port.cov`; or the hand-rolled fallback). 
- `risk_contributions(w, cov)` → per-asset risk contribution (variance share).
- Test: contributions pairwise-equal within 1e-3.

## optimizer/blend.py
- `solve_blend_alpha(sigma_risky, sigma_safe, rho, sigma_target) -> float` → bisection on `σ_blend(a)=sqrt(a²σr²+(1-a)²σs²+2a(1-a)ρσrσs)`; clamp a∈[0,1]; if `sigma_target>=sigma_risky` return 1.0; if `<=sigma_safe` return 0.0. **Pin (05 §7.3): `solve_blend_alpha(0.16,0.05,0.15,0.145)` in [0.89,0.91] (~0.90).** Clamp test: target 0.20 → 1.0.
- `glide_factor(age, horizon)` = `clamp(1 - max(0, age-GLIDE_BASE_AGE)/100, GLIDE_FLOOR, 1.0)`. Monotonic decreasing in age.
- `build_target_weights(risk_profile, universe, prices) -> TargetWeights` → ERC over risky sleeves; compute σ_risky/σ_safe/ρ from the shrunk cov of the realized risky/safe sleeve portfolios; `a* = solve_blend_alpha(..., risk_profile.target_vol_band.mid)`; `a_final = a*·glide_factor(...)`; final = `a_final·w_risky + (1-a_final)·w_safe` (freed mass → safe). Set `blend_alpha=a_final`, `method="erc"`. **Invariant test: `abs(sum(by_ticker.values())-1.0) < 1e-6`.**

## Rules
TDD; tests in `engine/tests/test_optimizer.py`. Use cached/synthetic prices (offline). `pytest engine/tests/test_optimizer.py -v` green. No git commit. Match 05 exactly.
