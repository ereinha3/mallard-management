# Mallard Management — Role Charters

These charters split the remaining work into **feature-vertical modules**. Each charter is a self-contained **seed instruction**: hand it to a dev (or paste its `Seed prompt` into their coding agent) and they can execute independently. Ethan/lead controls these seeds.

Full rationale and the audit that produced them: `/home/ethan/.claude/plans/dapper-scribbling-sedgewick.md`.

## The one fact that drives everything
The engine + backend are **largely real**; the marquee UI screens render **hardcoded examples** and ignore the real backend data. So Wave 1 is mostly *wiring*, not new engine code.

## Waves (sequencing)
- **Module 0 — Contract & Client SDK** — FOUNDATION. Lands first, freezes the API↔UI contract + adds the missing client wrappers. Everyone else depends on it.
- **Wave 1 (parallel) — make the demo real:** A Onboarding+Gate · B Portfolio+Projection (marquee) · C Rebalance+Tax · D Peripheral pages.
- **Wave 2 — differentiators:** E Risk Fusion (doc-07) · F Quant Credibility (Ledoit-Wolf + Backtest).
- **Wave 3 — stretch (cut-if-behind):** G Black-Litterman / CVaR toggles.

## Hard rules (every role)
- **Engine is gospel.** `engine/` 42 tests must stay green. Only the module that *owns* an engine package may change it, and only with new/updated tests.
- **Stay in your lane.** Write only the files under your `Owns` list. Shared plumbing (`client/src/api/greenlightClient.js`, `backend/api/v1.py`, `backend/models.py`, `App.jsx`) is owned by Module 0; touch it only via the small, append-only additions your charter explicitly authorizes, and never concurrently with another role.
- **Contract is law.** Consume the exact shapes in `docs/greenlight/05-contracts.md` §UI-Contract (published by Module 0). If you think the contract is wrong, raise it with the lead — don't fork it.
- **No Claude attribution in git.** Branch off `main` (`feature/<module-id>`), never commit to `main` directly. One focused commit per module.
- **Verify before "done":** `PYTHONPATH=engine python3 -m pytest engine -q` (≥42) · `PYTHONPATH=backend:engine python3 -m pytest backend/tests -q` · `npm --prefix client run build`, plus your charter's smoke step.

## Run the stack locally (for smoke testing)
```bash
# backend (real data + GEMINI key in .env; 0.0.0.0 for Tailscale/OOB)
cd backend && GREENLIGHT_DB_URL=sqlite:///$(pwd)/../engine/data/greenlight.db \
  python -m uvicorn main:app --host 0.0.0.0 --port 8000
# client
npm --prefix client run dev -- --host    # open localhost:5173 or the Tailscale IP
```

## Charter template
```
# Role: <Module name>
## Mission         — one sentence
## Owns            — exact files/dirs this role may write (exclusive)
## Do NOT touch    — engine gospel; other modules' files; Module-0 plumbing
## Depends on      — Module 0 (+ any module)
## Contract        — exact request/response shapes (link 05-contracts §)
## Tasks           — bite-sized, ordered checklist; TDD where engine code changes
## Verify          — exact commands: engine/backend tests, client build, curl/Playwright smoke
## Seed prompt     — ready-to-paste brief, with all of the above baked in
```

## Index
| ID | Charter | Wave |
|----|---------|------|
| 0 | `module-0-contract.md` | Foundation |
| A | `A-onboarding-gate.md` | 1 |
| B | `B-portfolio-projection.md` | 1 |
| C | `C-rebalance-tax.md` | 1 |
| D | `D-peripheral-pages.md` | 1 |
| E | `E-risk-fusion.md` | 2 |
| F | `F-quant-credibility.md` | 2 |
| G | `G-bl-cvar.md` | 3 |
