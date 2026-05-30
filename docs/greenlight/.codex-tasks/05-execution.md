# Codex Task 05 — `broker` + `sizing` + `rebalance` + `tax` packages (execution & positions)

Implement `engine/broker/{base,simulator}.py`, `engine/sizing/sizer.py`, `engine/rebalance/rebalancer.py`, `engine/tax/report.py`. **Read `06` Phase 5 + 6.1, and `05` §2.8–2.10, §8; `02` §8 (tax rules).** Import constants from `engine/schemas/constants.py`.

## sizing/sizer.py — `size_orders(weights, capital_on_hand, monthly_surplus) -> OrderPlan`
weights→dollars vs `capital_on_hand`; fractional shares = `dollars/price`; `method="dca"` if `monthly_surplus>0` else `"lump_sum"`; build a contribution `schedule` for dca. Test: dollars/fractional/method logic.

## broker/base.py + simulator.py
`BrokerAdapter` Protocol (`place_order(OrderPlan)->list[Fill]`, `read_positions()->Positions`). `SimulatorBroker`: in-process; fills at cached prices; tracks shares + `avg_cost`; `read_positions` returns `Positions` with `portfolio_value = sum(market_value)+cash`. Test: fills@price, avg_cost, pv.

## rebalance/rebalancer.py — `decide_rebalance(positions, weights) -> RebalanceDecision`
Per-sleeve drift vs target; within `DRIFT_BAND_PP` (±5pp) → `action="steer"` (no trades, steer next contribution to underweight); breach → `action="trade"` minimal corrective trade; all on target → `action="none"`. Test all three branches.

## tax/report.py — `tax_report(positions, cost_basis, filing_status) -> TaxReport` (read-only, advisory)
- `harvestable`: positions below cost_basis → entry with `unrealized_loss`.
- `wash_sale_warnings`: for each harvestable, a warning with `window_days=30` and a `suggested_replacement` ticker that is NOT the same ticker.
- `after_tax_notes`: include the $3,000 ordinary-income offset cap line (per 02 §8). **Structural rules only; leave any rate parameters as constants for the tax-research team to fill.** Do NOT auto-execute anything.
Test: harvestable detection, 30-day window, replacement differs, $3k note present.

## Rules
TDD; tests under `engine/tests/` (one file per module is fine). All green. No git commit. Match 05 exactly.
