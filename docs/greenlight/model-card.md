# Greenlight Model Card

Status: implementation artifact, 2026-05-31. Scope: deterministic backend/engine portfolio construction, projection, and risk-summary metrics.

## Summary

Greenlight keeps the LLM out of numerical decisions. The engine converts a validated profile into a capacity-capped gamma band, builds long-only portfolio weights, evaluates downside risk from historical/bootstrap scenarios, and serves typed API responses. The public field `estimated_max_loss_1yr_pct` is backward-compatible in name but now means deterministic 95% one-year scenario VaR: the loss at the 5th percentile of bootstrapped one-year compounded portfolio returns.

## Components

| Component | Defaults / constants | Citation basis | Determinism |
|---|---|---|---|
| Risk tolerance and fusion | Grable-Lytton mean 28.27, SD 4.94, alpha 0.77; gamma range 1.5-8.0; Dohmen and loss-aversion signals fused by inverse-variance / random-effects pooling | Grable & Lytton 1999; Kuzniak et al. 2015; Kimball, Sahm & Shapiro 2008; Brown et al. 2024; fusion form documented in 07 as inverse-variance, DerSimonian-Laird, Cochran Q | Pure deterministic scoring from typed inputs; no LLM arithmetic |
| Capacity to gamma | `CAPACITY_WEIGHTS`: horizon 0.30, income stability 0.25, emergency fund 0.15, savings 0.15, debt 0.15; capacity gamma uses same log map as tolerance | Bodie, Merton & Samuelson 1992; Ibbotson, Chen, Milevsky & Zhu 2006/2007; capacity-caps-tolerance practice | Pure deterministic scoring |
| ERC allocator | Equal-risk-contribution on risky sleeves; no expected-return forecast | Maillard, Roncalli & Teiletche 2010; DeMiguel, Garlappi & Uppal 2009 caution against forecast-heavy optimizers | Deterministic coordinate solve |
| Ledoit-Wolf covariance | Linear shrinkage covariance from cached sleeve returns | Ledoit & Wolf 2004 | Deterministic sample estimate |
| CAL blend | `SR_REF=0.4`; gamma maps to target volatility label, then long-only blend between ERC risky portfolio and safe sleeve; no leverage | Merton 1969 for gamma/vol relation limits; capital-allocation-line / two-fund separation; corrected mechanism in 02 §5 | Deterministic bisection |
| Stationary bootstrap projection | `BLOCK_L=12`, `N_PATHS=10000`; generator `stationary_bootstrap`; Gaussian available only as contrast | Politis & Romano 1994; Politis & White 2004; Pfau 2010 / Kitces left-tail caution | Caller-provided seed for projections; same seed gives same fan chart |
| Black-Litterman toggle | Market-weight equilibrium prior; profile views with confidence | Black & Litterman 1992 | Deterministic matrix solve |
| CVaR toggle | 95% CVaR over historical/bootstrap scenario set; optimizer default seed 17 when scenario expansion is needed | Rockafellar & Uryasev 2000 | Fixed seed in backend toggle path |
| Risk fusion output | `gamma_band = max(tolerance_gamma, capacity_gamma)` element-wise; contradiction note from heterogeneous signals | 02 §2.1, 02 §3.1, 07 §4 | Deterministic from signals |
| Capacity / gamma display | `GAMMA_MIN=1.5`, `GAMMA_MAX=8.0`, `SR_REF=0.4` | 02 §2.1 and 05 §10 | Deterministic |
| One-year VaR metric | 95% VaR, not ES: compound one year of stationary-bootstrap portfolio returns and report `max(0, quantile(losses, 0.95))`; backend seed `20240531`; `BLOCK_L=12`; `N_PATHS=10000` | Politis & Romano 1994 for scenarios; Pfau 2010 / Kitces for Gaussian left-tail understatement; VaR selected because the API label is an estimated one-year max-loss percentile | Fixed internal seed, stable across identical inputs |

## Data

Runtime market data comes from the committed cache `engine/data/prices.csv`, currently 2020-01-02 through 2025-12-31 with 1,565 trading dates. Sleeve returns are daily percentage changes averaged across available tickers in each sleeve. Annualization and one-year scenario length infer periods per year from the return index; unlabeled arrays default to 12 periods per year for monthly fixtures.

## Reproduce

1. Seed/read cached data through the normal backend path; no network is required.
2. Build a portfolio with `POST /api/v1/portfolio` or `POST /api/v1/portfolio/reoptimize`.
3. Recompute VaR directly with `montecarlo.downside.scenario_var_1yr_loss(weights.by_sleeve, returns_matrix(universe.sleeves), seed=20240531, block_l=12, n_scenarios=10000)`.
4. Verify with:

```bash
PYTHONPATH=engine python3 -m pytest engine -q
PYTHONPATH=backend:engine python3 -m pytest backend/tests -q
```
