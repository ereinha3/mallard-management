# Role: Module G — Black-Litterman / CVaR Toggles (STRETCH, cut-if-behind)

## Mission
Add the Black-Litterman ESG/preference view layer and a CVaR downside toggle as alternative weightings the user can flip to. Pre-baked toggle weights are acceptable (matches the original MVP intent).

## Owns (exclusive write)
- `engine/optimizer/` (add `black_litterman.py`, `cvar.py`; do not alter the ERC/CAL default path)
- `engine/tests/`
- a toggle control in `PortfolioView` (coordinate with Module B — land after B; expose as a prop/sub-component)
- `backend/api/v1.py` `/portfolio` (append an optional `method` param) + `backend/models.py`

## Do NOT touch
The default ERC+CAL path (it stays the headline), gate, montecarlo, profiler, fusion.

## Depends on
Module B (PortfolioView), Module F (covariance) ideally landed first. This is **cut-if-behind** — only start if Waves 1–2 are solid.

## Contract
- `/portfolio` gains optional `method: "erc" | "black_litterman" | "cvar"` (default `erc`). Response shape unchanged (`{universe,weights,metrics}`); `weights.method` reflects the choice.
- BL: market-cap equilibrium prior from sleeve `market_weights`, blended with ESG/preference views from the profile. CVaR: minimize historical/bootstrap CVaR at 95%.

## Tasks
1. `engine/optimizer/black_litterman.py`: equilibrium prior + view blend → weights. Test on a fixture.
2. `engine/optimizer/cvar.py`: CVaR-min weights over bootstrap scenarios (pure numpy LP/heuristic). Test.
3. `/portfolio`: honor optional `method`; default unchanged.
4. PortfolioView: a small toggle (ERC / BL / CVaR) that re-fetches `postPortfolio({...profile, method})` and re-renders the donut + metrics. Pre-baked/cached weights acceptable if live solve is too slow for the demo.

## Verify
- `PYTHONPATH=engine python3 -m pytest engine -q` — 42 green + new optimizer tests.
- Toggling method in the UI changes weights coherently and keeps weights summing to ~1.0.

## Seed prompt
> You are implementing **Module G (Black-Litterman / CVaR toggles — STRETCH)** for Mallard Management at `/home/ethan/documents/personal/github/mallard-management-active`. Only start if Waves 1–2 are solid. Engine is gospel — keep 42 tests green, TDD, pure numpy, and DO NOT alter the default ERC+CAL path. (1) Add `engine/optimizer/black_litterman.py` (market-cap equilibrium prior from sleeve market_weights + ESG/preference view blend) and `engine/optimizer/cvar.py` (CVaR-95 minimization over bootstrap scenarios), each tested on a fixture. (2) Give `/portfolio` an optional `method: erc|black_litterman|cvar` (default erc, response shape unchanged, `weights.method` reflects choice). (3) Add an ERC/BL/CVaR toggle in PortfolioView (coordinate with Module B) that re-fetches `postPortfolio({...profile, method})`; pre-baked/cached weights acceptable if live solve is slow. Verify engine 42 + new tests; toggling changes weights coherently (sum ~1.0). Do not commit.
