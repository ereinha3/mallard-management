# Greenlight — Design Documentation

> A responsible automated investing agent that decides **whether** you should be investing before deciding **what** to buy.

Most robo-advisors assume you should invest and only ask *how much*. Greenlight is the one with the spine to tell you **not yet** — and to show you the math on why. It takes your full financial picture (income, expenses, debt, emergency savings, age, goals), runs a **responsibility gate** first, and only once you're cleared does it build a risk-calibrated, age-appropriate portfolio sized to what you can actually afford, then maintains it automatically.

## Document index

| # | Document | Purpose |
|---|----------|---------|
| 1 | [01-e2e-design.md](./01-e2e-design.md) | **End-to-end system design.** Components, boundaries, data flow, reallocation, loan linking, payments, execution. The architectural source of truth. |
| 2 | [02-research-foundations.md](./02-research-foundations.md) | **Literature foundations.** Every design decision tied to peer-reviewed research (risk allocation, optimization, Monte Carlo, taxes, regulation), with confidence flags. What we cite to judges. |
| 3 | [03-dataflow-usecase.md](./03-dataflow-usecase.md) | **Worked use case + data-flow diagrams.** "Maya" traced through debt payoff, greenlight unlock, allocation, Monte Carlo projection, rebalance, preference change, and year-end tax handling. |
| 4 | [04-build-and-demo.md](./04-build-and-demo.md) | **Build plan & demo script (Focused MVP).** Per-component go/no-go, hour-by-hour build order, demo-safety checklist, library choices, and the 60-second pitch + timed 3-minute demo script. |
| 5 | [05-contracts.md](./05-contracts.md) | **Data contracts, API & worked examples.** Exact schemas for every object, the FastAPI endpoint list, the risky/safe CAL-blend math, the universe table, fixtures, repo layout, and numeric worked examples that pin behavior. The precision layer agents build from. |
| 6 | [06-implementation-plan.md](./06-implementation-plan.md) | **Implementation plan.** Bite-sized, TDD-pinned tasks (engine) + acceptance-criteria tasks (LLM/frontend), phased, with real test code tied to the worked examples. The hand-off artifact for implementing agents. |

> **Version:** Design **v2** (post three-agent review). Key v2 moves: ruthless **Focused-MVP** scope; corrected the γ→volatility→ERC math; committed **riskfolio-lib**; added a **Monte Carlo goal-success** headline feature; explicit no-return-prediction ML stance; honest backtest (transaction costs, Deflated Sharpe, modest claims); the halt reframed as **deferred conversion**.

## Core design commitments (the non-negotiables)

These thread through all three documents:

1. **Responsibility-first.** The gate runs before any optimization. It can halt the entire pipeline. This is the differentiator and it is pure, dependency-free logic — built first, built solid.
2. **LLM elicits and explains; a deterministic engine decides.** The conversational agent never computes a number or makes an allocation. It populates a validated, typed profile; an auditable engine produces every figure. (This is the published correct pattern for regulated domains and our defense against hallucination/sycophancy.)
3. **Capacity caps tolerance.** We never recommend more risk than the user can *afford*, even if they're willing to take it. Two independent axes, combined with `min()`.
4. **Robust-by-construction optimization.** Risk-parity / equal-risk-contribution core (needs no fragile return forecasts; no faked ML alpha), not naive mean-variance. Backtested out-of-sample against honest benchmarks (1/N, 60/40, target-date) with overfitting-aware metrics.
5. **The halt is deferred conversion, not refusal.** Telling a user "not yet" is a trust-first acquisition funnel; the gate-flip is the conversion event. A business-model strength, not a non-product.
6. **Demo-safe by design.** Simulated execution, cached prices, pre-seeded state, offline-capable, recorded fallback. Nothing in the live demo depends on a network call we can't survive losing.

## Status

Design phase. Not yet implemented. This is **not financial advice** and the system is a demonstration; see the compliance section of the E2E design for the disclaimer posture.

## Naming

The product is **Greenlight**. (The earlier working name "Citadel Securities" collides with an existing major financial firm and must not be used.)
