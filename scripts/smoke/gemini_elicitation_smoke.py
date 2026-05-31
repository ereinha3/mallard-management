#!/usr/bin/env python3
"""Live Gemini elicitation smoke test (Module E).

Verifies that the real LLM (gemini-2.5-flash) conversationally collects the
Module-E risk signals — the Dohmen 0-10 item and the loss-aversion probe — and
emits a complete `submit_profile` function call containing them.

This hits the live Google API and is NOT collected by the default pytest run.
Run it explicitly:

    PYTHONPATH=backend:engine python scripts/smoke/gemini_elicitation_smoke.py

Prerequisite: GOOGLE_API_KEY in backend/.env (gitignored) or the environment.
Exit code 0 = pass, 1 = fail, 0 (SKIP) = no key.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND, ENGINE = ROOT / "backend", ROOT / "engine"
for _p in (BACKEND, ENGINE):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

if not os.environ.get("GOOGLE_API_KEY"):
    print("SKIP: GOOGLE_API_KEY not set (put it in backend/.env). See module docstring.")
    sys.exit(0)

from llm.elicitation import stream_elicitation  # noqa: E402
from models import ChatMessage  # noqa: E402

COMPLETE = (
    "Hi, I want to set up my investment profile. Here's everything about me:\n"
    "- Age 34, single filing status.\n"
    "- Household income $120,000/year, very stable (tenured software engineer).\n"
    "- Monthly expenses $4,000.\n"
    "- Cash on hand to invest: $60,000.\n"
    "- Emergency fund: $25,000 (about 6 months of expenses).\n"
    "- No high-interest debt; only a 3.5% mortgage with an outstanding balance of $280,000.\n"
    "- No financial dependents.\n"
    "- Goal: retire in 30 years; I'd need about $2,000,000 to feel secure. Horizon 30 years.\n\n"
    "My answers to all 13 Grable-Lytton items (1-4): GL1:3, GL2:3, GL3:3, GL4:2, GL5:3, "
    "GL6:3, GL7:2, GL8:3, GL9:3, GL10:3, GL11:3, GL12:3, GL13: option C (the $750 shot).\n"
    "Behavioral loss scenario: if my portfolio dropped 20% in a year I would hold and wait.\n"
    "Dohmen 0-10 willingness to take risks: 6.\n"
    "Loss-aversion: with a 50-50 chance of losing $100, I'd need to be able to win about $220 "
    "before seriously considering it.\n"
    "Income stability: very stable.\n"
    "Preferences: ETF-only; exclude tobacco and weapons; no particular tilt.\n"
    "That should be everything — please pass it to the analysis engine."
)


async def _run_turn(messages):
    tokens, profile, errors = [], None, []
    async for ev in stream_elicitation(messages):
        t = ev.get("type")
        if t == "token":
            tokens.append(ev.get("content", ""))
        elif t == "profile_ready":
            profile = ev.get("profile")
        elif t == "error":
            errors.append(ev.get("content"))
    return "".join(tokens), profile, errors


async def _main() -> int:
    history = [ChatMessage(role="user", content=COMPLETE)]
    for turn in range(1, 4):
        text, profile, errors = await _run_turn(history)
        print(f"\n===== TURN {turn} =====")
        if errors:
            print("ERRORS:", errors)
            return 1
        print("ASSISTANT:", (text[:300] + ("..." if len(text) > 300 else "")) or "<no text>")
        if profile is not None:
            print("\n*** submit_profile CALLED ***")
            for k in ("dohmen_risk", "loss_aversion_probe", "loss_scenario_response",
                      "household_income", "monthly_expenses", "emergency_fund",
                      "horizon_years", "goal_target", "income_stability"):
                print(f"  {k:24s} = {profile.get(k)!r}")
            ok = profile.get("dohmen_risk") is not None and profile.get("loss_aversion_probe") is not None
            print(f"\nRESULT: {'PASS' if ok else 'FAIL'} — E fields (dohmen_risk + loss_aversion_probe) present: {ok}")
            return 0 if ok else 1
        history.append(ChatMessage(role="assistant", content=text))
        history.append(ChatMessage(role="user",
                                   content="That's everything I have — please submit the profile to the engine now."))
    print("\nRESULT: FAIL — no submit_profile after 3 turns")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
