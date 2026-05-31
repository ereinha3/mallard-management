#!/usr/bin/env python3
"""Live advisor tool-calling smoke test (MCP explainability).

Verifies that the real LLM (gemini-2.5-flash) advisor, when asked to explain a
user's portfolio and the research behind it, actually INVOKES the read-only
explainability tools (explain_portfolio / get_method_citations / etc.), that the
tool loop dispatches them with the SERVER-SIDE user_email (never a model-supplied
one), and that the model then narrates the returned numbers.

This hits the live Google API and is NOT collected by the default pytest run.
Run it explicitly (needs the real market DB + a key):

    PYTHONPATH=backend:engine python scripts/smoke/advisor_tools_smoke.py

Prerequisites:
  - GOOGLE_API_KEY in backend/.env (gitignored) or the environment.
  - engine/data/greenlight.db (real) so a portfolio can be built for the persona.
Exit code 0 = pass, 1 = fail, 0 (SKIP) = missing prerequisite.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND, ENGINE = ROOT / "backend", ROOT / "engine"
for _p in (BACKEND, ENGINE):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

REAL_DB = ENGINE / "data" / "greenlight.db"
if not os.environ.get("GOOGLE_API_KEY"):
    print("SKIP: GOOGLE_API_KEY not set (put it in backend/.env). See module docstring.")
    sys.exit(0)
if not REAL_DB.exists():
    print(f"SKIP: real DB not found at {REAL_DB}. Build it first (see realdata smoke docstring).")
    sys.exit(0)

# Real market DB + throwaway app DB — set BEFORE importing the app/persistence.
os.environ["GREENLIGHT_DB_URL"] = f"sqlite:///{REAL_DB}"
os.environ["MALLARD_DB_URL"] = f"sqlite:///{Path(tempfile.mkdtemp()) / 'mallard_app.db'}"

from api.v1 import _run_pipeline  # noqa: E402
from llm import advisor, explain_tools  # noqa: E402
from models import ChatMessage, UserProfileInput  # noqa: E402
from persistence import create_user, get_password_hash, init_db, upsert_profile, get_session  # noqa: E402


def _seed_user() -> str:
    """Store a greenlit onboard result so the explainability tools can read it."""
    email = f"advisor-smoke-{uuid.uuid4().hex}@example.com"
    persona = json.loads((ENGINE / "fixtures" / "persona_greenlight.json").read_text())
    profile_input = UserProfileInput.model_validate(persona)
    onboard = _run_pipeline(profile_input)
    init_db()
    db = get_session()
    try:
        create_user(db, email, "Advisor Smoke", get_password_hash("correct-horse"))
        upsert_profile(db, email, profile_input.model_dump_json(), onboard.model_dump_json())
        db.commit()
    finally:
        db.close()
    return email


async def _run() -> int:
    email = _seed_user()

    # Wrap the dispatcher so we can observe real tool invocations + the email they ran under.
    calls: list[dict] = []
    original = explain_tools.dispatch_explain_tool

    def _spy(name, args, user_email):
        calls.append({"name": name, "args": args, "user_email": user_email})
        return original(name, args, user_email)

    advisor.explain_tools.dispatch_explain_tool = _spy

    messages = [
        ChatMessage(
            role="user",
            content=(
                "Why did you recommend this specific portfolio for me? Reference my actual "
                "allocation and risk numbers, and tell me what academic research backs your "
                "risk and optimization methodology."
            ),
        )
    ]

    tokens, errors = [], []
    try:
        async for ev in advisor.stream_advisor(messages, context=None, user_email=email):
            t = ev.get("type")
            if t == "token":
                tokens.append(ev.get("content", ""))
            elif t == "error":
                errors.append(ev.get("content"))
    finally:
        advisor.explain_tools.dispatch_explain_tool = original

    narration = "".join(tokens)
    tool_names = [c["name"] for c in calls]
    scoped = [c for c in calls if c["name"] != "get_method_citations"]
    all_server_scoped = all(c["user_email"] == email for c in scoped)
    model_supplied_email = any(
        isinstance(c["args"], dict) and ("email" in c["args"] or "user_email" in c["args"])
        for c in calls
    )

    print("\n===== ADVISOR TOOL SMOKE =====")
    print(f"user_email (server-side): {email}")
    print(f"tools invoked: {tool_names or '<none>'}")
    if errors:
        print("ERRORS:", errors)
    print(f"\nNARRATION ({len(narration)} chars):\n{narration[:900]}{'...' if len(narration) > 900 else ''}")

    checks = {
        "no stream errors": not errors,
        "at least one tool invoked": len(calls) >= 1,
        "user-scoped tools ran under server-side email": all_server_scoped,
        "model did not supply its own email arg": not model_supplied_email,
        "model produced narration": len(narration.strip()) > 0,
    }
    print("\n--- checks ---")
    for name, ok in checks.items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")

    ok = all(checks.values())
    print(f"\nRESULT: {'PASS' if ok else 'FAIL'} — live advisor tool-calling validated: {ok}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_run()))
