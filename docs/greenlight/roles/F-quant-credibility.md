# Role: Module F — Quant Credibility (Ledoit-Wolf + Backtest)

## Mission
Upgrade the covariance estimator to real Ledoit-Wolf and expose the walk-forward backtest as a credibility panel (vs 1/N, 60/40, target-date). These are the "technical complexity" judging points.

## Owns (exclusive write)
- `engine/optimizer/erc.py` (covariance estimator only)
- `engine/backtest/` (expose results)
- `engine/tests/` (covariance + backtest tests)
- `backend/api/v1.py` — add ONE route `POST /api/v1/backtest` (append-only; coordinate sequencing with Module 0/E if they're editing v1.py)
- `backend/models.py` — add `BacktestRequest`/`BacktestResponse`
- `client/src/api/greenlightClient.js` — add ONE wrapper `postBacktest` (append-only; sequence after Module 0)
- a new `client/src/components/BacktestPanel.jsx` + mount point in `PortfolioView` (coordinate with Module B — Module B owns PortfolioView, so expose the panel as a self-contained component Module B imports, OR land after B)

## Do NOT touch
ERC weight logic itself (only the covariance input), gate, montecarlo, profiler.

## Depends on
Module 0 (client SDK pattern). Soft-coordinates with B (PortfolioView mount) and E (v1.py edits).

## Contract
- `POST /api/v1/backtest` body `{ profile | weights, start?, end? }` → `{ equity_curve:[{date,value}], metrics:{sharpe,sortino,max_drawdown,calmar,turnover}, benchmarks:{ one_over_n, sixty_forty, target_date }:{equity_curve,metrics} }`. Precomputed/cached JSON is acceptable per the MVP plan.

## Tasks (TDD)
1. `engine/optimizer/erc.py`: replace the hardcoded constant-correlation shrink (`0.2`) with **estimated Ledoit-Wolf** shrinkage intensity (Ledoit-Wolf 2004 honey-I-shrunk-the-covariance, pure numpy — no sklearn). Keep the ERC solve unchanged. Re-validate: the 42 engine tests must still pass; add a test asserting the shrinkage intensity is data-derived (0<δ<1) and the cov is PSD.
2. `engine/backtest/`: expose the existing walk-forward runner via a clean function returning equity curve + Sharpe/Sortino/maxDD/Calmar/turnover and the three benchmark curves; cache to JSON for fast serving.
3. `backend`: add `POST /api/v1/backtest` + models; serve cached results.
4. `client`: `postBacktest` wrapper + `BacktestPanel.jsx` (equity curves overlay + metrics table). Mount in PortfolioView via Module B coordination.

## Verify
- `PYTHONPATH=engine python3 -m pytest engine -q` — 42 still green + new covariance/backtest tests.
- `curl -s -X POST :8000/api/v1/backtest ...` returns well-formed metrics + curves; panel renders the overlay + table.

## Seed prompt
> You are implementing **Module F (Quant Credibility: Ledoit-Wolf + Backtest)** for Mallard Management at `/home/ethan/documents/personal/github/mallard-management-active`. Engine is gospel — keep the 42 tests green, TDD new code, pure numpy (no sklearn). (1) In `engine/optimizer/erc.py` replace the hardcoded `0.2` constant-correlation shrink with **estimated Ledoit-Wolf** shrinkage intensity (LW 2004); leave the ERC solve unchanged; add a test that δ is data-derived in (0,1) and the covariance is PSD. (2) Expose the existing `engine/backtest/` walk-forward runner as a function returning equity curve + Sharpe/Sortino/maxDD/Calmar/turnover plus 1/N, 60/40, and target-date benchmark curves; cache to JSON. (3) Add `POST /api/v1/backtest` (+ `BacktestRequest`/`BacktestResponse` models) serving the cached result; add a `postBacktest` client wrapper; build `client/src/components/BacktestPanel.jsx` (curve overlay + metrics table) and mount it in PortfolioView (coordinate with Module B). Verify engine 42 + new tests; `curl /api/v1/backtest` well-formed; panel renders. Append-only edits to shared `v1.py`/`greenlightClient.js` (sequence after Module 0). Do not commit.
