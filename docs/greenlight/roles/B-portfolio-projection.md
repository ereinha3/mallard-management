# Role: Module B — Portfolio & Projection (MARQUEE)

## Mission
Replace the hardcoded portfolio + projection visuals with the real ERC/CAL allocation and live Monte Carlo. This is the headline demo screen.

## Owns (exclusive write)
- `client/src/components/greenlight/PortfolioView.jsx`
- `client/src/components/Dashboard.jsx`
- `client/src/components/ProjectionChart.jsx`

## Do NOT touch
`greenlightClient.js` (call existing + Module-0 wrappers only), engine/backend, other components.

## Depends on
Module 0 (`postPortfolio`, `postProjection` wrappers; contract).

## Contract (05-contracts §UI-Contract)
- Real allocation already lives at `onboardResult.portfolio.{ weights.by_ticker, weights.by_sleeve, weights.blend_alpha, weights.method, universe, metrics.expected_vol, metrics.expected_shortfall_95, metrics.risk_contributions }`. **Use it directly.** If `onboardResult.portfolio` is absent (e.g., a portfolio-only view), call `postPortfolio(profile)`.
- Monte Carlo: `postProjection({ weights: onboardResult.portfolio.weights, horizon_years, monthly_contribution, capital_on_hand, goal_target, generator:"stationary_bootstrap", n_paths:10000 })` → `{ p_success, percentile_paths:{p5,p25,p50,p75,p95}, median_terminal, bad_case_terminal }`. Pull `horizon_years`/contribution/capital from `onboardResult.optimizer_input` / `validated_profile`.

## Tasks
1. **PortfolioView:** delete `ILLUSTRATIVE_ALLOCATION` and `GLIDEPATH`; render the allocation donut from `weights.by_sleeve` (and ticker breakdown from `by_ticker`); show real `metrics` (expected vol, ES95, risk contributions) and `method`/`blend_alpha`.
2. **Projection fan chart (ProjectionChart):** drive it from `postProjection` output — percentile bands (p5–p95), median line, `p_success` headline, and the 5th-percentile bad-case callout.
3. **Dashboard:** stop expecting a `projection` field on `OnboardResponse`; instead call `postProjection` (guard for non-greenlit/no-portfolio states with a graceful empty state).
4. Keep the visual design; only change the data source. Handle the halt/no-portfolio case cleanly (no crash when `portfolio` is null).

## Verify
- `npm --prefix client run build` green.
- Live smoke: greenlight persona shows real sleeve weights that **sum to ~1.0**, real risk metrics, and a populated fan chart. Cross-check the numbers against `curl -s -X POST :8000/api/v1/portfolio -d '{"profile":<persona>}'` and `.../projection`.

## Seed prompt
> You are implementing **Module B (Portfolio & Projection)** for Mallard Management at `/home/ethan/documents/personal/github/mallard-management-active`. Edit ONLY `client/src/components/greenlight/PortfolioView.jsx`, `client/src/components/Dashboard.jsx`, `client/src/components/ProjectionChart.jsx`. Use Module-0 wrappers `postPortfolio`/`postProjection` and the existing `onboardResult` prop. (1) Remove `ILLUSTRATIVE_ALLOCATION`/`GLIDEPATH`; render the donut + ticker breakdown from `onboardResult.portfolio.weights.by_sleeve`/`by_ticker` and show real `metrics` (expected_vol, expected_shortfall_95, risk_contributions) + `method`/`blend_alpha`. (2) Drive the Monte Carlo fan chart from `postProjection({weights: onboardResult.portfolio.weights, horizon_years, monthly_contribution, capital_on_hand, goal_target, generator:'stationary_bootstrap', n_paths:10000})` — percentile bands, median, p_success headline, bad-case. (3) Dashboard calls `postProjection` instead of expecting a projection field; graceful empty state when there's no portfolio (halt). Preserve the visuals. Verify: client build; greenlight persona shows weights summing ~1.0 + live fan chart matching `curl` to `/portfolio` and `/projection`. Do not touch engine/backend or `greenlightClient.js`. Do not commit.
