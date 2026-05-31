# Role: Module E — Risk Elicitation & Fusion (doc-07)

## Mission
Build the headline "principled risk" differentiator: fuse multiple validated risk instruments into one CRRA γ with honest uncertainty, and trigger a clarification turn when signals disagree.

## Owns (exclusive write)
- `engine/profiler/` (add a `fusion.py`; extend `profile.py` tolerance path)
- `engine/schemas/models.py` (add `RiskSignals`)
- `engine/tests/` (new fusion tests — TDD)
- `backend/llm/elicitation.py` (collect Dohmen + loss-aversion conversationally)
- `backend/models.py` (mirror `RiskSignals`)
- `client/src/components/RiskView.jsx` (display fused γ + per-signal confidence) — coordinate with Module D; if both run, Module D defers RiskView to Module E.

## Do NOT touch
Other engine packages (optimizer, gate, montecarlo), other components, `greenlightClient.js`.

## Depends on
Module 0 contract. Reference `docs/greenlight/07-elicitation-and-fusion.md` (the spec) and `02-research-foundations.md`.

## Contract
- `RiskSignals = { gl13_gamma, gl13_var, dohmen_gamma, dohmen_var, loss_aversion_gamma?, loss_aversion_var?, ... }` — each instrument mapped INDEPENDENTLY to a CRRA γ with a variance.
- Fusion output extends the existing `RiskProfile`: fused `gamma_band`, `binding_axis`, plus `signal_confidence` and an optional `contradiction_note`. Capacity still caps tolerance (`max(tolerance_γ, capacity_γ)`), unchanged.
- LLM still **elicits/explains only** — it never computes γ. The Gemini `submit_profile` function adds `dohmen_risk` (0–10) and the loss-aversion gamble result as fields; the engine does the math.

## Tasks (TDD — write engine tests first)
1. `engine/schemas`: add `RiskSignals`.
2. `engine/profiler/fusion.py`: map each instrument → (γ, variance); **inverse-variance pooling** for the point estimate; **DerSimonian–Laird** random-effects τ² when signals disagree; **Cochran's Q / I²** to decide "agree → fuse" vs "disagree → clarify". Return fused γ band + confidence + contradiction note. Unit-test with known inputs → known fused γ, τ², Q.
3. `engine/profiler/profile.py`: route the tolerance axis through `fusion.py` (preserve the capacity floor + `max()` cap). Keep the GL-13 path as one signal.
4. `backend/llm/elicitation.py`: extend the conversational flow to collect the Dohmen 0–10 item and the loss-aversion gamble; add them to `submit_profile`. Preserve neutral framing; one question at a time.
5. `backend/models.py`: mirror `RiskSignals`; stop forcing `loss_aversion_flag=False` where a real signal exists.
6. `RiskView.jsx`: show the fused γ band, per-signal contributions/confidence, and the contradiction note when present.

## Verify
- `PYTHONPATH=engine python3 -m pytest engine -q` — existing 42 still pass + new fusion tests pass.
- A disagreeing-signals fixture yields a clarification (not a profile); an agreeing fixture yields a tight fused band.
- `/onboard` returns the fused γ; RiskView renders it. Live elicitation collects Dohmen + gamble (manual Gemini smoke by orchestrator).

## Seed prompt
> You are implementing **Module E (Risk Elicitation & Fusion, doc-07)** for Mallard Management at `/home/ethan/documents/personal/github/mallard-management-active`. Read `docs/greenlight/07-elicitation-and-fusion.md` first. Engine is gospel — keep the 42 tests green and use TDD for new code. Edit ONLY `engine/profiler/` (+ new `fusion.py`), `engine/schemas/models.py`, `engine/tests/`, `backend/llm/elicitation.py`, `backend/models.py`, and `client/src/components/RiskView.jsx`. Build: `RiskSignals` (GL-13, Dohmen 0–10, loss-aversion gamble — each independently mapped to a CRRA γ + variance); `fusion.py` doing inverse-variance pooling + DerSimonian–Laird random-effects τ² + Cochran's Q/I² to trigger a clarification turn when signals disagree; route the tolerance axis in `profile.py` through it (preserve capacity floor + `max()` cap). Extend `elicitation.py` to conversationally collect Dohmen + the gamble and add them to the `submit_profile` function (LLM elicits only, never computes γ). Surface fused γ band + per-signal confidence + contradiction note in RiskView. Write engine tests FIRST (known inputs → known fused γ/τ²/Q; disagreeing fixture → clarification). Verify engine 42 + new tests green; `/onboard` returns fused γ. Do not touch other engine packages or `greenlightClient.js`. Do not commit.
