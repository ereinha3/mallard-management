# Smoke tests

End-to-end smoke tests that exercise the backend against **real data** and the
**live LLM**. They are intentionally **not** part of the default pytest suite
(`backend/tests`, `engine/tests`) because they require the real market-data DB
and/or network access and are non-deterministic by design. The deterministic
unit/integration suites stay green and offline; these prove the real demo works.

| Script | Proves | Requires |
|---|---|---|
| `realdata_pipeline_smoke.py` | Full test-user journey (register → onboard → portfolio → projection → rebalance → tax → backtest) on real 20-yr market data, incl. Module E fused γ and Module F backtest | `engine/data/greenlight.db` (real) |
| `gemini_elicitation_smoke.py` | Live `gemini-2.5-flash` collects the Module-E Dohmen + loss-aversion signals and emits a complete `submit_profile` | `GOOGLE_API_KEY` in `backend/.env` |

Each prints per-check `PASS`/`FAIL` and exits `0` on success, `1` on failure,
and `0` with a `SKIP:` line when its prerequisite is absent.

## Prerequisites

### Real market-data DB (for the pipeline smoke)
Build it once (needs network — yfinance + FRED, no API key required):

```bash
env -u GREENLIGHT_DB_URL PYTHONPATH=engine \
  python -m data.ingest.refresh --db "sqlite:///$(pwd)/engine/data/greenlight.db"
```

This pulls ~20 years of real prices for the 8-ETF universe + the FRED `DGS3MO`
risk-free series. `greenlight.db` is gitignored.

### Live LLM key (for the elicitation smoke)
Put your key in `backend/.env` (gitignored). The code reads **`GOOGLE_API_KEY`**
(not `GEMINI_API_KEY`):

```bash
echo 'GOOGLE_API_KEY=your-key-here' > backend/.env
```

## Running

From the repo root:

```bash
PYTHONPATH=backend:engine python scripts/smoke/realdata_pipeline_smoke.py
PYTHONPATH=backend:engine python scripts/smoke/gemini_elicitation_smoke.py
```
