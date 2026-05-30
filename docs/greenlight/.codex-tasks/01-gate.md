# Codex Task 01 — `gate` package (the differentiator)

Implement `engine/gate/responsibility.py` (fill the skeleton). **Read `docs/greenlight/06-implementation-plan.md` Phase 1 (Tasks 1.1–1.3) and `docs/greenlight/05-contracts.md` §5, §7.1, §2.4.** Import all thresholds from `engine/schemas/constants.py` — no hardcoded magic numbers.

## Implement `evaluate_gate(profile: ValidatedProfile) -> GateResult` (single pinned signature)
Ordered checks; first failure halts:
1. **Emergency fund:** `required = EF_MONTHS * monthly_expenses`. If `emergency_fund < required` → halt, `failed_check="emergency_fund"`, `math.target_amount=required`. `>=` passes (boundary: exactly 3 months passes).
2. **High-interest debt:** any `debt.apr > HIGH_APR` → halt, `failed_check="high_interest_debt"`, `math.guaranteed_return=apr`, `math.expected_after_tax_market_return=EXPECTED_MARKET_RETURN*(1-LTCG_RATE)`, `math.interest_accruing_annual=balance*apr`, `math.net_advantage_annual=balance*(apr-expected_after_tax_market_return)`. Boundary: `apr == HIGH_APR` does NOT halt.
3. **Low-interest debt:** `apr < LOW_APR` → append a `notes` entry; do not halt.
4. All clear → `status="greenlight"`, `failed_check="none"`, `math=None`, `recommended_action=""`.

## Tests (TDD — write first, in `engine/tests/test_gate.py`)
Use `tests.factories.maya_t0()` / `maya_greenlit()`. Pin EXACTLY to 05 §7.1:
- halt on EF: `target_amount==9600`; boundary 9600 passes EF check.
- halt on 22% debt: `interest_accruing_annual==1980.0`, `round(net_advantage_annual,1)==1444.5`, `round(expected_after_tax_market_return,4)==0.0595`.
- `apr==0.08` does not halt; `apr==0.045` greenlights with a note.
- greenlight returns `failed_check=="none"`, `math is None`.

## Rules
TDD (failing test → implement → pass). Run `pytest engine/tests/test_gate.py -v` and ensure green. Do NOT git commit. Match 05 §2.4 exactly.
