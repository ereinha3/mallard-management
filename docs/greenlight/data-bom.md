# Greenlight — Data Bill of Materials (free / yfinance + FRED)

**Goal:** gather everything the risk engine needs from free sources (primarily `yfinance`), in formats that drop straight into the engine's CSV loaders. **Refresh cadence: quarterly. Data granularity: daily history over a long lookback** (see the frequency note in the design discussion — rebalancing quarterly does NOT mean sampling quarterly; covariance/Monte-Carlo/backtest need many observations).

There are **four datasets**. (1) is fully automatable from yfinance; (4) uses yfinance for benchmarks and FRED for the risk-free series. (3) is mostly automatable (with gaps). (2) — the bucket classification — is the one genuinely manual sheet, and it's the most important one for the hierarchical model.

---

## Dataset 1 — Price history (AUTOMATED via yfinance)

One row per (ticker, date). The engine's `data/loaders.py` already expects this shape.

| Column | Type | Source | Notes |
|---|---|---|---|
| `date` | YYYY-MM-DD | yfinance index | trading days |
| `ticker` | str | — | |
| `adj_close` | float | yfinance `Close` with `auto_adjust=True` | **total-return** adjusted (dividends + splits folded in) — required for correct returns |
| `volume` | int | yfinance `Volume` | used for the liquidity filter |

- **Frequency:** daily (`interval="1d"`). **Lookback:** `period="max"` (we'll use the longest window where ALL universe members exist; aim ≥10y).
- **Recipe:**
  ```python
  import yfinance as yf
  df = yf.download(TICKERS, period="max", interval="1d", auto_adjust=True, group_by="ticker")
  # reshape to long: date, ticker, adj_close, volume  -> prices.csv
  ```
- **Output file:** `engine/data/prices.csv` with columns `date,ticker,adj_close,volume`.

---

## Dataset 2 — Bucket classification (CURATED SHEET — the hierarchy; mostly manual)

This **defines the bucket model.** yfinance's ETF metadata (`.info["category"]`, `["fundFamily"]`) is partial and does NOT reliably give the underlying index, so this is best maintained as a hand-curated CSV (you can fill it from issuer pages / ETF.com / Morningstar "category"). One row per ETF.

| Column | Example | Why it's needed |
|---|---|---|
| `ticker` | `XLK` | — |
| `asset_class` | `equity` / `bond` / `commodity` / `real_estate` | top of the hierarchy (maps to existing sleeves) |
| `bucket` | `us_equity_tech_largecap` | **the leaf bucket** — the optimizer's unit; sector × size × style (or region for intl, duration/credit for bonds) |
| `region` | `us` / `developed_intl` / `em` | |
| `size` | `large` / `mid` / `small` / `na` | size factor (Fama-French SMB) |
| `style` | `blend` / `growth` / `value` / `na` | |
| `underlying_index` | `S&P 500 Information Technology` | **critical for wash-sale**: harvesting partners must share the bucket but track a DIFFERENT index |
| `issuer` | `SSGA` / `Vanguard` / `iShares` | secondary distinctness check |

- **Output file:** `engine/data/classification.csv`.
- **Coverage target:** every ticker in the universe. Aim for **≥2 members per bucket with *different* `underlying_index`** so the tax engine always has a clean (non-substantially-identical) replacement.

---

## Dataset 3 — Selection & liquidity metadata (SEMI-AUTOMATED; expect gaps)

Used to (a) filter the raw pool down to liquid/cheap funds and (b) pick the 1–2 representatives per bucket deterministically. One row per ETF.

| Column | Type | yfinance `.info` key (verify per ticker) | Fallback if missing |
|---|---|---|---|
| `expense_ratio` | float | `netExpenseRatio` / `annualReportExpenseRatio` | issuer page / manual |
| `aum` | float (USD) | `totalAssets` | issuer page |
| `avg_dollar_volume` | float | `averageVolume` × price | compute from Dataset 1 (`volume × adj_close`, 3-mo mean) — **most reliable** |
| `inception_date` | date | `fundInceptionDate` (epoch) | issuer page |
| `quote_type` | str | `quoteType` (expect `ETF`) | — |

- `avg_dollar_volume` is best computed directly from Dataset 1 (always available) rather than trusting `.info`.
- **Output file:** `engine/data/selection_meta.csv`.
- **Liquidity filter (defaults, tunable):** keep ETFs with `aum ≥ $100M`, `avg_dollar_volume ≥ $5M/day`, `inception_date ≤ backtest_start`. This is what trims the raw ~500–1000 pool to the investable set.

---

## Dataset 4 — Benchmarks & risk-free rate (AUTOMATED via yfinance + FRED)

For the backtest comparison and Sharpe/Deflated-Sharpe.

| Series | Source / ticker | Use |
|---|---|---|
| US total market | `VTI` (or `SPY`) | equity benchmark / 60-40 equity leg |
| US aggregate bonds | `BND` (or `AGG`) | 60/40 bond leg |
| Target-date fund | `VTTSX` (Vanguard Target 2060) | a real "balanced fund" benchmark |
| Risk-free | FRED `DGS3MO` (3-month Treasury constant maturity, annual %) | Sharpe / cash-rate input (`rf_daily = DGS3MO/100/252`) |

- Benchmarks use the same daily yfinance history as Dataset 1. The implemented risk-free ingest uses `engine/data/ingest/fred_source.py` and `DEFAULT_RISK_FREE_SERIES = "DGS3MO"` in `engine/data/ingest/refresh.py`, storing values in the engine `macro_series` table.
- **Original plan:** yfinance `^IRX` was the first documented source; it is superseded by FRED `DGS3MO` in the current implementation.
- **Output:** benchmarks fold into price history; risk-free observations are stored as `series_id=DGS3MO`, `date`, `value` in `macro_series`.

---

## What we are NOT getting from free data (disclose these)

- **Survivorship bias:** yfinance only returns *surviving* funds — delisted/closed ETFs are absent. The backtest will be mildly optimistic. **Mitigation:** disclose it in the backtest output, and prefer long-lived large funds (the liquidity filter already biases toward survivors). Acceptable for a hackathon; a paid point-in-time source (Sharadar/Norgate) would fix it later.
- **Intraday / real-time prices, holdings-level data, true bid-ask** — not needed for a quarterly-rebalanced, paper-traded MVP.

---

## Frequency & refresh summary

- **Pull:** daily history, `period="max"` (use the common window across the universe).
- **Refresh:** quarterly (re-run the fetch; append new daily rows). Sustainable on free yfinance.
- **The optimizer/Monte-Carlo/backtest run on the daily series; the *decisions* (rebalance) happen quarterly.**

## Suggested gather order
1. Curate `classification.csv` (Dataset 2) → this defines the universe + buckets.
2. From its ticker list, auto-fetch `prices.csv` (Dataset 1) + benchmarks from yfinance and `DGS3MO` from FRED (Dataset 4).
3. Compute/fetch `selection_meta.csv` (Dataset 3); apply the liquidity filter.
4. Hand back; the engine ingests these four files directly.
