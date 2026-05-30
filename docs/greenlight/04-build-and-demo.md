# Greenlight — Build Plan & Demo Script (Focused MVP)

**Status:** Design v2 (post-review) · **Date:** 2026-05-30 · **Window:** ~24 hours, 3–4 people

This document is the execution plan. It commits to the **Focused MVP** strategy from the three-agent review: build the differentiator (the gate) and one robust optimizer **live**, **pre-bake or simulate** the plumbing, and pour the saved time into **UI polish** and the **demo**. The architecture is in [01-e2e-design.md](./01-e2e-design.md); the rationale/citations in [02-research-foundations.md](./02-research-foundations.md).

**Why focus:** the strategy and feasibility reviews independently estimated **~25–35%** win-probability if we build/demo everything live vs. **~55–70%** if we ruthlessly focus. The most likely failure mode is not a bad idea — it's a *rushed, unfocused demo* of a great one.

---

## 1. The demo-winning minimal build

**Live, always working:**
1. **Responsibility Gate** — fully real, heavily tested (TDD). The halt and the gate-flip. Zero external deps; must be flawless.
2. **Two-axis risk profile** → γ **band** via a disclosed lookup table → target volatility. Keep `min(capacity, tolerance)` (the visible rigor); drop live Merton w* and the U-shaped glidepath.
3. **One optimizer:** ERC on Ledoit-Wolf covariance (**riskfolio-lib**), blended toward bonds/cash along the capital-allocation line to hit target vol, on **cached prices**.
4. **Monte Carlo goal-success** (stationary block bootstrap) → P(success) + fan chart, with the Gaussian "optimistic" toggle. ~tens of lines of NumPy.
5. **Affordability Sizer** → dollar buys (makes it concrete).
6. **In-process broker simulator** → positions table + portfolio value.
7. **Frontend:** three perfected screens + the red→green gate-flip animation + the transparent parameter panel; runs offline.

**Pre-baked / faked (shown, not computed live):**
- **Black-Litterman + CVaR** → alternate weight vectors behind a toggle (judges see the donut change; we don't debug three live optimizers).
- **Out-of-sample backtest** → computed offline, rendered from static JSON (equity curve, drawdown, Deflated Sharpe with logged trial count).
- **Tax layer (T4)** → hard-coded positions/basis so the $420 harvestable-loss flag + wash-sale caveat render deterministically; the *logic* is real.
- **Drift-band rebalance (T2)** → real logic on a simulated "fast-forward a quarter" clock with seeded prices.
- **LLM intake** → guided form + narrated veneer (tool-calling JSON), with both personas' responses cached for offline.

**Cut from the demo entirely (roadmap):** live Alpaca trading, free-form LLM dialogue as the primary path, live backtest, live BL/CVaR optimization, Merton w*, U-shaped bond-tent, live cost-basis derivation, real money movement, bank linking.

---

## 2. Per-component go/no-go (24h window)

| Component (Design §3.x) | Verdict |
|---|---|
| Responsibility Gate (3.4) | **GO** — build first, test hardest |
| Profile Validation Gate (3.2) | **GO** — cheap airlock (Pydantic) |
| Risk Profiler 2-axis → γ band (3.3) | **GO (simplified)** — keep `min()` + γ table; drop Merton/bond-tent live |
| LLM Elicitation (3.1) | **CONDITIONAL GO** — guided form + narrated veneer + JSON tool-calling; **NO-GO** as live free-form primary |
| Explanation Agent (3.13) | **GO** — narration only, grounded, anti-sycophancy |
| Universe Builder (3.5) | **GO** — static ticker→sleeve→ESG table (+ market-cap weights for BL prior) |
| Optimizer ERC core (3.6) | **GO (one method)** — riskfolio-lib ERC on Ledoit-Wolf, cached prices |
| Optimizer BL + CVaR (3.6) | **GO as pre-baked toggle** — **NO-GO live** |
| Glide-Path (3.7) | **GO (linear)** — U-shape as a research slide only |
| Monte Carlo Goal-Success (3.8) | **GO** — block bootstrap; headline feature |
| Affordability Sizer (3.9) | **GO** — cheap, concrete |
| Broker Adapter (3.10) | **GO as in-process simulator** — Alpaca paper **NO-GO live** (talking point only) |
| Rebalancer drift bands (3.11) | **GO** — simulated clock |
| Tax Layer (3.12) | **GO as pre-baked scenario** — logic real, basis hard-coded |
| Backtest (9) | **GO pre-computed offline** — **NO-GO live** |
| State Store (3.14) | **GO** — SQLite/JSON, pre-seeded |
| Frontend 3 screens (10) | **GO** — parallel track, biggest judging lever, must run offline |

---

## 3. Build order (~24h, 3–4 people)

**Hour 0–1 (everyone): freeze the contract.** Define `UserProfile` + all downstream object schemas (Design §4) as Pydantic models. Stand up a FastAPI skeleton returning **static mocked JSON** for every endpoint so the frontend never blocks on the backend.

**Workstream A — Engine (1–2 devs, Python)**
- H1–3: **Responsibility Gate** + Validation Gate (TDD — the differentiator). End-to-end with a hardcoded profile by H3.
- H3–6: Risk Profiler (simplified γ band table) + Universe Builder (static table) + Affordability Sizer.
- H6–12: Optimizer — **riskfolio-lib ERC on Ledoit-Wolf**, cached prices, CAL blend to target vol. Pre-bake BL/CVaR alternate weight vectors. Monte Carlo block-bootstrap success engine.
- Offline (anytime): fetch cached price CSVs via yfinance with retries/sleeps; run the walk-forward backtest; dump results to JSON.

**Workstream B — Frontend (1–2 devs, React/shadcn)**
- H0: **Define the Greenlight visual identity first** (color/type system, the red→green light as the brand motif) — a 30–60 min decision that prevents generic-shadcn look, the biggest UI-polish risk. Lock it before building screens.
- H0–2: Scaffold, routing, three screens as static shells against mocked JSON.
- H2–10: Gate-result view (the math + harm-prevented number — the centerpiece), parameter panel, allocation donut, Monte Carlo fan chart, backtest charts (static JSON).
- H10–16: The **re-run / gate-flip** interaction (red→green) and polish; the optional rebalance/tax panel.

**Workstream C — LLM layer (~0.5 dev, shared)**
- H2–5: Elicitation tool-calling schema + Validation Gate integration + guided-form fallback.
- H5–8: Explanation Agent narration (anti-sycophancy, grounded on engine JSON); cache both personas' responses.

**Integration & hardening**
- H16–20: Wire real engine to frontend; build the two scripted personas (halt + greenlight + flip).
- H20–23: **Rehearse**, record the happy-path video with narration, verify full offline mode, test fallbacks.
- H23–24: Buffer (there is always a fire).

**Guiding rule:** a shippable demo exists by **H3** (gate only) and only gets richer. Never be in a state where nothing works.

---

## 4. Demo-safety checklist

- [ ] Prices for the full universe cached to CSV the night before; **yfinance never called live** (rate-limited / IP-banned in 2026).
- [ ] Demo runs with **wifi physically off** (rehearsed) — forces finding every hidden network call (LLM, Alpaca, fonts).
- [ ] Both personas' **LLM responses pre-recorded/cached** so the demo survives offline.
- [ ] State store **pre-seeded** so T2/T3/T4 render without replaying T0–T1 live.
- [ ] All Python/JS deps **pinned in a lockfile** installed the night before. Don't pin `solver="ECOS"` (dropped in CVXPY 1.6); use default Clarabel/SCS.
- [ ] Frontend served from **localhost**; **no CDN** dependency for shadcn/fonts (self-host).
- [ ] In-process broker simulator is the **primary** path; Alpaca paper is optional and off the live path.
- [ ] **Screen-recorded walkthrough with audio narration** as the ultimate fallback if everything fails.
- [ ] Two scripted personas ready: one that **halts** (debt/no-savings) and one that **greenlights**, plus the re-input that flips the first.

---

## 5. Tech/library notes (validated current as of 2026)

- **riskfolio-lib** (committed): native risk parity (`rp`), CVaR, Black-Litterman, shrinkage; v7.2.x, maintained; depends on CVXPY.
- **PyPortfolioOpt** (fallback only): native Ledoit-Wolf + Black-Litterman + HRP, **but no true ERC** — do not rely on it for the core allocator.
- **CVXPY**: v1.5 switched default solver ECOS→Clarabel; **v1.6 dropped ECOS**. Don't pin ECOS; default solvers are fine for these convex problems.
- **alpaca-py** (optional): official SDK; paper API identical to live. The legacy `alpaca-trade-api-python` is deprecated — use `alpaca-py`. (Moot since the simulator is primary.)
- **yfinance**: functional but rate-limited/IP-banned; **build-time fetch only**, with retries/sleeps.
- **React + shadcn/ui**: standard; self-host fonts to survive offline.

---

## 6. The pitch (60 seconds)

> "Every robo-advisor assumes you should invest and only asks *how much* — because they make money when you do, even if you're carrying 22% credit-card debt that's quietly destroying more wealth than any portfolio could build.
>
> **Greenlight is the first one with the spine to tell you: not yet.**
>
> Meet Maya. She wants to invest aggressively. We build her financial picture and run a responsibility gate *before* we ever build a portfolio. Tonight the gate says: *Not yet — pay off that 22% card and build a 3-month safety net first. Here's the math.* Paying that debt is a **guaranteed, tax-free 22% return.** No portfolio beats that.
>
> Then Maya does it. And the light turns green. *Now* we build her a research-grade, risk-parity portfolio sized to what she can afford — with an AI that talks to her but never touches the numbers, so it can't hallucinate her life savings.
>
> The halt isn't us losing a customer. It's how we *earn* one. Greenlight: the advisor that's on your side before you've given it a dime."

---

## 7. The demo (3 minutes, timed)

- **0:00–0:20 — Hook + villain.** "Robo-advisors profit when you invest, even when you shouldn't. We built the one that tells you the truth first." One speaker, no slides.
- **0:20–0:45 — Maya + the AI doing what a form can't.** Guided intake; the **transparent parameter panel** populates live. The AI **catches a contradiction** (she said "moderate-aggressive" but "I'd sell at −20%"). "Our AI elicits and flags — but never computes a number. A deterministic engine does that."
- **0:45–1:30 — THE HALT (centerpiece, give it room).** Calm screen: **"Not yet — and here's why."** $9,600 emergency-fund target; the 22%-debt math (*guaranteed tax-free 22% vs. uncertain taxed ~7%*); the **harm-prevented number**. Beat of silence. "No robo-advisor on earth shows you this screen, because it costs them your money."
- **1:30–2:00 — THE FLIP (payoff).** "Maya pays the card and builds her fund. She comes back." Re-run → red→**GREEN** animation. "That flip is our conversion event. We didn't lose her — we earned her."
- **2:00–2:40 — The competent payoff, shown fast.** Allocation donut animates in (ESG-screened, age-tilted). The **Monte Carlo fan chart**: "**82% chance** of funding retirement" + the Gaussian "optimistic" contrast. Then the **pre-computed backtest** beating 60/40 with the **Deflated Sharpe** visible. "Risk-parity, no fragile forecasts, tested out-of-sample with overfitting-aware metrics."
- **2:40–3:00 — Close on the line they'll remember.** "Greenlight is the advisor that's on your side before you've given it a dime — and the only one brave enough to say *not yet.*" Stop.

**One sentence (not a beat) covering the rest:** "And once you're invested, it rebalances with drift bands to avoid needless fees and flags tax-loss-harvesting opportunities with the wash-sale guardrail" + one screenshot. Depth on judge request only.

---

## 8. Top feasibility risks & mitigations

1. **LLM structured-output unreliability live** → guided form primary + tool-calling JSON + Validation Gate airlock + cached persona responses.
2. **yfinance 429 / IP-ban kills data** → cached CSV the night before; never live.
3. **Optimizer scope eats the schedule** → ONE live method (riskfolio-lib ERC); pre-bake BL/CVaR; pick the lib in hour 1.
4. **React↔Python integration friction** → freeze the typed contract hour 1; mock API with static JSON; wire real engine last; rehearse.
5. **Dependency/solver churn** → lockfile installed the night before; don't pin ECOS; test a full offline install before stage.
