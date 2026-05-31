# Role: Module D — Peripheral Pages (Accounts / Alerts / Settings / Risk)

## Mission
Bind the secondary pages to real `onboardResult` data, remove field mismatches, and clearly label the genuinely-stubbed bits (account linking) so nothing looks broken in the demo.

## Owns (exclusive write)
- `client/src/components/AccountsTab.jsx`
- `client/src/components/AlertsView.jsx`
- `client/src/components/SettingsView.jsx`
- `client/src/components/RiskView.jsx`

## Do NOT touch
`greenlightClient.js`, engine/backend, other components.

## Depends on
Module 0 (`gate_result.checks`; confirmed field names).

## Contract (05-contracts §UI-Contract)
All four render from the `onboardResult` prop:
- `AccountsTab`: `validated_profile` (income, debts) + `financial_analysis.debt`. Account-linking stays a labeled stub (no Plaid).
- `AlertsView`: `gate_result.checks[]` (the new derived list) + `financial_analysis` + `path_to_greenlight`. Do **not** read a non-existent `gate_result.checks.*` nested shape — it's a flat list of `{key,status,detail}`.
- `SettingsView`: read-only render from `user` + `validated_profile`. Save/update is **Wave 3** — leave inputs read-only or disabled with a clear note; do not invent a save endpoint.
- `RiskView`: already wired — confirm it reads `risk_profile` / `financial_analysis.risk` correctly and shows the γ band + capacity/tolerance scores.

## Tasks
1. Audit each page for any field the backend doesn't provide (per the audit: `gate_result.checks.*`); rebind to the real shapes.
2. AlertsView: drive alerts from `gate_result.checks` (fail/warn) + `path_to_greenlight.steps`.
3. AccountsTab: render real debts/income; keep "Link Account" as an explicit "Coming soon / demo" labeled control (no dead fetch).
4. SettingsView: read-only; mark editable-later fields plainly.
5. RiskView: verify-only; fix any stale field reads.

## Verify
- `npm --prefix client run build` green.
- Live smoke: log in as a persona with a saved profile → each page renders real numbers, no blank/NaN, no console errors, no nav item that 404s its data. Account-linking shows a labeled stub, not an error.

## Seed prompt
> You are implementing **Module D (Peripheral Pages)** for Mallard Management at `/home/ethan/documents/personal/github/mallard-management-active`. Edit ONLY `client/src/components/{AccountsTab,AlertsView,SettingsView,RiskView}.jsx`; render from the existing `onboardResult` prop (no new API calls). (1) Replace any read of a non-existent field (e.g. nested `gate_result.checks.*`) with the real shapes: AlertsView uses the flat `gate_result.checks[] = {key,status,detail}` + `path_to_greenlight.steps`; AccountsTab uses `validated_profile` + `financial_analysis.debt` and keeps "Link Account" as a clearly-labeled demo stub (no dead fetch); SettingsView is read-only (save is Wave 3 — disable with a note); RiskView is verify-only — confirm it shows `risk_profile` γ band + capacity/tolerance scores. Preserve visuals. Verify: client build; each page renders real numbers with no console errors and no broken nav. Do not touch engine/backend or `greenlightClient.js`. Do not commit.
