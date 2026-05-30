# Codex Task 06 — `backtest` package (credibility proof, offline)

Implement `engine/backtest/{metrics,run}.py`. **Read `05` §2.11, §7.5 and `06` Phase 6 (Task 6.2); `02` §8.** Import constants from `engine/schemas/constants.py`.

## metrics.py (build + test these FIRST — they're independent of the optimizer)
- `max_drawdown(equity)`, `sortino(returns)`, `calmar(returns)` — standard definitions, pinned to known vectors.
- `deflated_sharpe(returns, sr_hat, n_trials)` per 05 §7.5: `DSR = Φ((SR̂-SR0)·√(T-1) / √(1 - γ3·SR0 + ((γ4-1)/4)·SR0²))` where **the variance term uses SR0, not SR̂** (γ3=skew, γ4=kurtosis). `SR0 = √Var · [(1-ζ)·Φ⁻¹(1-1/N) + ζ·Φ⁻¹(1-1/(N·e))]`, ζ=0.5772. Test on a known vector.

## run.py — `run_backtest(...) -> BacktestResult` (offline; writes `engine/data/backtest.json`)
Walk-forward: rolling 36–60mo covariance window, quarterly rebalance, charge `TX_COST_BPS` per trade. Strategies: `greenlight_erc` (calls `engine.optimizer.build_target_weights`), `one_over_n`, `sixty_forty`, `target_date`, `naive_mvo`. For each: equity_curve, drawdown_curve, metrics (cagr, sharpe, deflated_sharpe with `n_trials`=real count of configs tried, sortino, max_drawdown, calmar, turnover). Write `BacktestResult` to `engine/data/backtest.json`.
**Honest claim in output/README: "better drawdown/Sortino/Calmar + lower turnover," NOT "beats 1/N Sharpe."**

## Sequencing note
`metrics.py` has no optimizer dependency — implement/test it immediately. `run.py` imports `engine.optimizer.build_target_weights`; if that module isn't merged yet when you start, stub the `greenlight_erc` strategy behind a try/except and leave a clear TODO, but fully implement the other 4 strategies + all metrics.

## Rules
TDD; tests in `engine/tests/test_backtest.py`. Green. No git commit. Match 05 exactly.
