# Codex Task 02 — `profiler` package (risk scoring)

Implement `engine/profiler/{tolerance,capacity,validate,profile}.py` (fill skeletons). **Read `06` Phase 2 + Phase 7 Task 7.3, and `05` §2.1, §2.3, §7.2; `02-research-foundations.md` §2.1, §3.1.** Import constants from `engine/schemas/constants.py`.

## tolerance.py — `score_to_gamma_band(raw_score) -> GammaBand`
Per 05 §2.1 / §7.2: `p = Φ((score-GL_MEAN)/GL_SD)`; `_gamma_at(score) = exp(ln(GAMMA_MAX) - p·(ln(GAMMA_MAX)-ln(GAMMA_MIN)))`; `SEM = GL_SD·sqrt(1-GL_ALPHA)`. Return `GammaBand(mid=_gamma_at(score), aggressive=_gamma_at(score+SEM), conservative=_gamma_at(score-SEM))`.
Pin (06 Task 2.1): score=30 → mid≈2.75, aggressive≈2.11, conservative≈3.78; assert `aggressive<=mid<=conservative`.

## capacity.py — `capacity_score(profile)->float`, `capacity_to_gamma(score)->float`
Per 02 §3.1: weighted 0–100 from horizon (0.30), income_stability (0.25), ef months (0.15), savings rate (0.15), debt (0.15) using `CAPACITY_WEIGHTS`; sub-score rules exactly as 02 §3.1. `capacity_to_gamma` uses the same log map with `p_cap=score/100`. Pin Maya T1: `capacity_score≈73`, `capacity_gamma≈2.36`.

## validate.py — `validate_profile(up: UserProfile)`
Range/enum/completeness checks → `ValidatedProfile` (compute `derived.required_emergency_fund` and `derived.monthly_surplus = household_income/12 - monthly_expenses`). **Contradiction rule (06 Task 7.3, full TDD):** if `loss_scenario_response in {"sell_some","sell_all"}` while the instrument score implies aggressive tolerance → return a clarification request instead of a profile. This is business logic — unit-test it.

## profile.py — `build_risk_profile(vp) -> RiskProfile`
Combine ELEMENTWISE: `gamma_band = max(tolerance_gamma_elt, capacity_gamma)` per element; `binding_axis` = axis setting the mid (tolerance if `tolerance.mid >= capacity_gamma` else capacity). Set posture-keyed `target_vol_band` (`aggressive=SR_REF/gamma_band.aggressive`, etc.). Pin Maya T1 (06 Task 2.2): `binding_axis=="tolerance"`, `gamma_band.mid==tolerance_gamma.mid`; short-horizon variant → `binding_axis=="capacity"`.

## Rules
TDD; tests in `engine/tests/test_profiler.py`. `pytest engine/tests/test_profiler.py -v` green. No git commit. Match 05 exactly.
