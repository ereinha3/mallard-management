# Role: Module C — Rebalance & Tax

## Mission
Make the rebalance + tax-loss-harvesting panel show live engine output instead of illustrative constants.

## Owns (exclusive write)
- `client/src/components/greenlight/RebalancePanel.jsx`
- `client/src/data/seedPositions.js` (new — the demo positions/cost-basis fixture)

## Do NOT touch
`greenlightClient.js` (call Module-0 wrappers only), engine/backend, other components.

## Depends on
Module 0 (`postRebalance`, `postTaxReport` wrappers; contract).

## Contract (05-contracts §UI-Contract)
- `postRebalance({ positions, weights })` → `{ action, drifts:{S:{current,target,drift_pp}}, steer?, trades:[{ticker,side,shares}] }`.
- `postTaxReport({ positions, cost_basis, filing_status, bracket? })` → `{ harvestable:[{ticker,unrealized_loss,note}], wash_sale_warnings:[{ticker,window_days,suggested_replacement}], after_tax_notes[] }`.
- `weights` comes from `onboardResult.portfolio.weights`. `positions`/`cost_basis` come from the seed fixture (a realistic demo holding with at least one unrealized loss, e.g. a bond ETF, to trigger TLH — matches the planned $420 bond-loss demo scenario).

## Tasks
1. Create `client/src/data/seedPositions.js`: a `Positions` object (`items[{ticker,shares,avg_cost,market_value}]`, `portfolio_value`, `cash`) + a `cost_basis` map, engineered so `/tax/report` flags ≥1 harvestable loss and a wash-sale warning.
2. **RebalancePanel:** delete `ILLUSTRATIVE_SLEEVES` / `ILLUSTRATIVE_TAX_FLAGS`; render drift bars from `postRebalance(...).drifts`, the action/steer/trades, and the TLH flags + wash-sale warnings from `postTaxReport(...)`.
3. Keep the visual design; graceful empty/loading + halt states.

## Verify
- `npm --prefix client run build` green.
- Live smoke: panel drift bars + trades match `curl .../rebalance`; TLH section shows the seeded harvestable loss + wash-sale replacement matching `curl .../tax/report`.

## Seed prompt
> You are implementing **Module C (Rebalance & Tax)** for Mallard Management at `/home/ethan/documents/personal/github/mallard-management-active`. Edit ONLY `client/src/components/greenlight/RebalancePanel.jsx` and a new `client/src/data/seedPositions.js`. Use Module-0 wrappers `postRebalance`/`postTaxReport`. (1) Build `seedPositions.js`: a realistic `Positions` object + `cost_basis` map with ≥1 unrealized loss (e.g. a bond ETF) so `/tax/report` flags a harvestable loss + wash-sale warning. (2) Remove `ILLUSTRATIVE_SLEEVES`/`ILLUSTRATIVE_TAX_FLAGS`; render drift bars from `postRebalance({positions, weights: onboardResult.portfolio.weights}).drifts`, plus action/steer/trades, and TLH flags + wash-sale warnings from `postTaxReport({positions, cost_basis, filing_status})`. Preserve visuals; handle loading/halt states. Verify: client build; panel matches `curl` to `/rebalance` and `/tax/report`. Do not touch engine/backend or `greenlightClient.js`. Do not commit.
