"""
LLM elicitation layer — Greenlight intake agent.

Conducts a natural conversation using Gemini to gather the user's full
financial picture and risk profile. Emits a structured UserProfileInput
via function call when enough information is collected. Streams tokens
to the caller so the chat UI can render them in real time.

The LLM elicits and explains; it never computes a number or makes an
allocation. All calculations happen in the deterministic engine.
"""

import asyncio
import json
import os
import threading
from typing import Any, AsyncGenerator, Generator

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

from models import ChatMessage
from llm import interview_state
from llm.instrument import next_directive, step_from_messages

# ── Gemini model ──────────────────────────────────────────────────────────────

GEMINI_MODEL = "gemini-3.5-flash"

# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """
You are Greenlight's intake specialist. Your job is to conduct a warm, efficient
conversation that gathers a user's complete financial profile so Greenlight's
analysis engine can determine whether they are ready to invest — and, if so, how
to build an appropriate portfolio.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR ROLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You gather information. You do NOT:
• Tell the user whether they should invest
• Recommend any investment products
• Compute returns, portfolio values, or projections
• Give financial, tax, or legal advice
• Validate or praise their financial choices
• Agree with self-assessments without probing them (anti-sycophancy)

Tone: Professional, warm, and direct. Ask ONE question at a time — never bundle
multiple questions into a single message. After the user answers, ask the next one.
Vary your phrasing — never read from a list. When answers are vague, ask for
specifics. Never lead the user toward a particular answer.
Questions should feel like natural conversation, not a quiz or economics exam.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TO GATHER — in roughly this order
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The user has ALREADY completed a structured intake FORM. The FIRST message in
this conversation contains all of the data below — treat it as final and
authoritative, use it ONLY as context, and NEVER ask the user for any of it (or
anything trivially derivable from it). Tax profile fields (ZIP, state, filing
status, 401k/IRA/HSA contributions, employer match) are also pre-filled and
must not be asked. Do NOT open with questions about their job, income, or
finances — that part is done. Ask exactly ONE question per message — never
bundle. Vary your phrasing so it feels human, not like a form.

ALREADY CAPTURED BY THE FORM — never ask about any of these:
   • Annual household income, monthly essential expenses, liquid capital, emergency fund
   • Age, tax filing status, number of dependents
   • Employment: employer, job title, tenure, company size, employment type

INCOME STABILITY (income_stability) — do NOT ask about this. INFER it from the
employment fields already provided and set it directly in submit_profile:
   • bond_like: very stable — government, tenured, large-employer salaried, long tenure
   • mixed: moderately stable — professional with variable bonus, steady contractor
   • stock_like: volatile — freelancer, commission-based, startup, self-employed, short tenure

WHAT TO ELICIT IN THE CHAT — only what the form could not capture:
   • Primary goal(s) and the number of years until the money is needed (time horizon)
   • Any outstanding debts — for each: balance, APR, and type
     (credit_card | student | mortgage | auto | personal | other). The form did not capture debts.
   • A rough goal target dollar amount
   • Investment preferences: ETF-only / individual stocks / mix; sectors to exclude
     for ethical reasons; sectors to tilt toward
   • The risk-tolerance instrument below — this is the heart of the conversation

5. RISK TOLERANCE — 13-item Grable-Lytton instrument
   Ask these conversationally. Weave multiple items into a single prompt when natural.
   Score each 1–4 where 4 = most risk tolerant. Map the user's response to the score.

   GL1 — General risk attitude
     Ask: How would you describe your attitude toward financial risk in general?
     1 = Very cautious, avoid all risk
     2 = Somewhat cautious, prefer safe options
     3 = Comfortable with moderate risk for better returns
     4 = Enjoy taking financial risks for potentially higher rewards

   GL2 — Investment experience
     Ask: Have you invested in stocks, bonds, or mutual funds before?
     1 = Never and not comfortable with it
     2 = Never but open to learning
     3 = Some experience, comfortable with basics
     4 = Experienced investor

   GL3 — Market drop reaction
     Ask: If the market dropped 15% right after you invested, what would you do?
     1 = Sell everything to cut losses
     2 = Sell some to reduce exposure
     3 = Hold and wait for recovery
     4 = Buy more while prices are lower

   GL4 — Company stock willingness
     Ask: If your employer let you put part of your retirement into company stock?
     1 = Definitely not — too risky
     2 = A small amount only
     3 = A moderate amount
     4 = A large portion — I believe in where I work

   GL5 — Reaction to falling investment
     Ask: If an investment fell significantly in value, how would you feel and act?
     1 = Very anxious, would sell immediately
     2 = Worried, would likely reduce my position
     3 = Accept it as normal volatility and hold
     4 = See it as a buying opportunity

   GL6 — Inheritance windfall
     Ask: If you inherited $100,000 unexpectedly, where would most of it go?
     1 = Savings account or CDs
     2 = Mostly bonds or low-risk investments
     3 = Diversified mix of stocks and bonds
     4 = Mostly growth stocks or aggressive investments

   GL7 — Smaller windfall
     Ask: If you unexpectedly received $20,000, what would you do?
     1 = Pay off debt or put it in savings
     2 = Low-risk, income-producing investments
     3 = A mix of low and moderate-risk investments
     4 = Growth-oriented, higher-risk assets

   GL8 — Self-described risk identity
     Ask: How would you describe yourself as a financial risk taker?
     1 = Very conservative
     2 = Conservative
     3 = Moderate risk taker
     4 = Aggressive risk taker

   GL9 — Word association with "risk"
     Ask: When you hear "financial risk," what comes to mind?
     1 = Loss or danger — something to avoid
     2 = Something mostly negative
     3 = Uncertainty with mixed possibilities
     4 = Opportunity and potential gain

   GL10 — Speculative action
     Ask: Experts predict a sector will surge next year. Your money isn't there. What do you do?
     1 = Nothing — stay in my conservative mix
     2 = Move a small amount just in case
     3 = Shift a moderate amount there
     4 = Move aggressively toward that opportunity

   GL11 — Profit-taking
     Ask: An investment jumped 25% and hit your advisor's target price. What do you do?
     1 = Sell everything and lock in the gain
     2 = Sell most of it
     3 = Hold and see where it goes
     4 = Buy more — momentum is working

   GL12 — Time preference for money
     Ask: Would you rather have $1,000 today or wait a year for potentially $1,200?
     1 = Definitely take $1,000 now
     2 = Slight preference for now
     3 = Slight preference to wait
     4 = Definitely wait for the larger amount

   GL13 — Lottery/gamble choice
     Ask: Imagine you unexpectedly come into some extra money — say $100 — and you have a few options
          for what to do with it. Which sounds most like you? A: Keep the full $100, no risk.
          B: Try something where you might walk away with $250, but there's an equal chance you end up
          with nothing. C: Go for a shot at $750, though it's more likely you'd end up with nothing.
          D: Take a long-shot chance at $3,000, knowing the odds are heavily against you.
     A → 1, B → 2, C → 3, D → 4

6. BEHAVIORAL SCENARIO — loss_scenario_response (separate from GL3/GL5)
   Ask explicitly: "If your actual investment portfolio dropped 20% in a single year —
   a scenario that has happened historically — what would you realistically do?"
   sell_all  = would sell everything
   sell_some = would sell part
   hold      = would hold and wait
   buy_more  = would invest more

7. DOHMEN SINGLE-ITEM RISK — dohmen_risk
   Ask: "On a scale from 0 to 10, where 0 means not at all willing to take risks
   and 10 means very willing, how willing are you to take risks in general?"
   Record the integer 0-10. This is an independent corroborating signal; do not
   combine it with the Grable-Lytton answers.

8. LOSS-AVERSION PROBE — loss_aversion_probe
   Ask: "Say something came up where you stood to lose $100 — maybe a purchase that might not pan out,
   or a small investment that could go sideways. What's the smallest potential gain that would make it
   feel worth the risk to you? In other words, if there's a 50-50 chance of losing $100, how much would
   you need to potentially win before you'd seriously consider it?"
   Record the dollar amount. Neutral answer = $100. Loss-averse (λ ≈ 2) ≈ $200.

9. GOAL TARGET — goal_target
   Ask: "Roughly how much money would you need at retirement (or your goal date) to feel
   financially secure? Even a rough number helps." If they have no idea, use 0.
   Record in dollars (e.g. 1000000 for $1M).

10. INVESTMENT PREFERENCES
   • ETF-only, individual stocks, or a mix
   • Any industries or areas they want to avoid. Ask this as one focused,
     conversational question, for example: "Are there any industries or areas
     you'd rather avoid in your portfolio, such as oil & gas / fossil fuels,
     defense / weapons, tobacco, or gambling?"
     Record only these canonical esg_exclusions values:
       fossil_fuels, weapons, tobacco, gambling
     Map synonyms naturally: oil, gas, coal, oil & gas, and fossil fuels →
     fossil_fuels; defense, military contractors, arms, and weapons → weapons.
     If they say no, none, no preference, or that they do not care, record
     empty exclusions: [].
   • Any sectors they want to tilt toward

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRADICTION DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If the user's behavioral responses (GL3, GL5, loss scenario) contradict their
self-rating (GL1, GL8), probe it once, neutrally:
"You described yourself as [X], but also said you'd [Y behavior] in a market drop.
That's worth exploring — in the moment, do you think you'd really follow through?"
Score based on behavioral evidence, not the self-rating. Never compute gamma,
loss-aversion flags, volatility, or allocation; the deterministic engine does that.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONFIDENCE SCORING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Track confidence per field (0.0–1.0):
  1.0   = clear, specific, consistent answer
  0.7–0.9 = clear but could be misread
  0.5–0.7 = vague, some inference required
  0.3–0.5 = contradictory or very vague
  <0.3  = essentially unknown

List fields with confidence < 0.6 in uncertainty_flags.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHEN TO CALL submit_profile
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Call submit_profile when you have ALL of:
  household_income, monthly_expenses, capital_on_hand, emergency_fund,
  age, horizon_years, filing_status, all 13 GL item scores,
  loss_scenario_response, dohmen_risk, loss_aversion_probe, income_stability,
  and esg_exclusions (including [] for no preference).

Before calling, send a brief message: "I have everything I need — let me pass this to
the analysis engine now."
""".strip()

# ── Tool definition ───────────────────────────────────────────────────────────

def _debt_schema() -> Any:
    return types.Schema(
        type="OBJECT",
        properties={
            "balance": types.Schema(type="NUMBER", description="Outstanding balance in dollars"),
            "apr":     types.Schema(type="NUMBER", description="Annual rate as decimal, e.g. 0.22 for 22%"),
            "kind":    types.Schema(
                type="STRING",
                description="Debt type",
                enum=["credit_card", "student", "mortgage", "auto", "personal", "other"],
            ),
        },
        required=["balance", "apr", "kind"],
    )


def _build_submit_profile_tool() -> Any:
    if types is None:
        return None

    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="submit_profile",
                description=(
                    "Submit the completed user financial profile once all required fields "
                    "have been gathered through conversation."
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        # Financials
                        "household_income": types.Schema(type="NUMBER", description="Annual household income in dollars"),
                        "monthly_expenses": types.Schema(type="NUMBER", description="Total monthly essential expenses"),
                        "capital_on_hand": types.Schema(type="NUMBER", description="Liquid capital available to invest"),
                        "emergency_fund": types.Schema(type="NUMBER", description="Current emergency fund balance"),
                        "debts": types.Schema(
                            type="ARRAY",
                            items=_debt_schema(),
                            description="All debts; empty list if none",
                        ),
                        # Lifecycle
                        "age": types.Schema(type="INTEGER"),
                        "horizon_years": types.Schema(type="INTEGER", description="Years to retirement or primary goal"),
                        "goals": types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
                        "goal_target": types.Schema(type="NUMBER", description="Target terminal wealth in dollars; 0 if unknown"),
                        "dependents": types.Schema(type="INTEGER"),
                        "filing_status": types.Schema(
                            type="STRING",
                            enum=["single", "married_joint", "married_separate", "head_of_household"],
                        ),
                        # Tax details
                        "zip_code": types.Schema(
                            type="STRING",
                            description="Optional 5-digit ZIP code for tax lookup",
                        ),
                        "state": types.Schema(
                            type="STRING",
                            description="Optional two-letter state abbreviation",
                        ),
                        "pretax_401k": types.Schema(
                            type="NUMBER",
                            description="Optional annual 401k contribution; default 0",
                        ),
                        "pretax_ira": types.Schema(
                            type="NUMBER",
                            description="Optional annual traditional IRA contribution; default 0",
                        ),
                        "pretax_hsa": types.Schema(
                            type="NUMBER",
                            description="Optional annual HSA contribution; default 0",
                        ),
                        "employer_match_rate": types.Schema(
                            type="NUMBER",
                            description="Optional employer match rate as decimal, e.g. 0.5 for 50%",
                        ),
                        "employer_match_cap_pct": types.Schema(
                            type="NUMBER",
                            description="Optional employer match cap as decimal share of salary, e.g. 0.05 for 5%",
                        ),
                        "has_hsa_eligible_plan": types.Schema(
                            type="BOOLEAN",
                            description="Whether the user has an HSA-eligible plan",
                        ),
                        "hsa_coverage": types.Schema(
                            type="STRING",
                            description="Optional HSA coverage type",
                            enum=["self_only", "family"],
                        ),
                        # Risk tolerance
                        "risk_instrument_responses": types.Schema(
                            type="ARRAY",
                            items=types.Schema(type="INTEGER"),
                            description="13 Grable-Lytton scores in order GL1-GL13, each 1-4",
                        ),
                        "loss_scenario_response": types.Schema(
                            type="STRING",
                            enum=["sell_all", "sell_some", "hold", "buy_more"],
                        ),
                        "dohmen_risk": types.Schema(
                            type="INTEGER",
                            description="Dohmen general willingness-to-take-risk response, integer 0-10",
                        ),
                        "loss_aversion_probe": types.Schema(
                            type="NUMBER",
                            description="Minimum $ win to accept 50/50 bet against $100 loss",
                        ),
                        # Capacity
                        "income_stability": types.Schema(
                            type="STRING",
                            enum=["bond_like", "mixed", "stock_like"],
                        ),
                        # Preferences
                        "universe_pref": types.Schema(type="STRING", enum=["etf", "stock", "mix"]),
                        "esg_exclusions": types.Schema(
                            type="ARRAY",
                            items=types.Schema(
                                type="STRING",
                                enum=["fossil_fuels", "weapons", "tobacco", "gambling"],
                            ),
                            description=(
                                "Canonical industries the user wants excluded; use an empty "
                                "list for no preference. Map oil, gas, coal, oil & gas, and "
                                "fossil fuels to fossil_fuels; map defense, military "
                                "contractors, arms, and weapons to weapons."
                            ),
                        ),
                        "sector_theme_tilts": types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
                        # LLM metadata
                        "confidence": types.Schema(type="OBJECT", description="Per-field confidence 0-1"),
                        "uncertainty_flags": types.Schema(
                            type="ARRAY",
                            items=types.Schema(type="STRING"),
                            description="Fields with confidence < 0.6",
                        ),
                    },
                    required=[
                        "household_income", "monthly_expenses", "capital_on_hand",
                        "emergency_fund", "debts", "age", "horizon_years",
                        "filing_status", "risk_instrument_responses",
                        "loss_scenario_response", "dohmen_risk",
                        "loss_aversion_probe", "income_stability", "esg_exclusions",
                    ],
                ),
            )
        ]
    )


SUBMIT_PROFILE_TOOL = _build_submit_profile_tool()

# ── Proto → Python conversion ─────────────────────────────────────────────────

def _to_python(val: Any) -> Any:
    """Recursively convert proto MapComposite / RepeatedComposite to plain Python."""
    if val is None:
        return val
    cls = type(val).__name__
    if "Map" in cls or hasattr(val, "items"):
        return {k: _to_python(v) for k, v in val.items()}
    if "Repeated" in cls or (hasattr(val, "__iter__") and not isinstance(val, (str, bytes, int, float, bool))):
        return [_to_python(v) for v in val]
    return val

# ── Core streaming function (sync) ───────────────────────────────────────────

def _stream_sync(messages: list[ChatMessage]) -> Generator[dict, None, None]:
    """
    Synchronous generator. Yields token/profile_ready/error dicts.
    Run this in a thread; bridge to async via _stream_async below.
    """
    if genai is None or types is None:
        yield {"type": "error", "content": "google-genai is not installed."}
        return

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        yield {"type": "error", "content": "GOOGLE_API_KEY is not set."}
        return

    client = genai.Client(api_key=api_key)

    # Convert roles: assistant → model for Gemini
    contents: list[types.Content] = []
    for msg in messages:
        role = "model" if msg.role == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=msg.content)]))

    step = step_from_messages(messages)
    directive = next_directive(step)
    if directive is not None:
        turn_control_block = (
            "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "TURN CONTROL — THIS OVERRIDES THE ORDERING GUIDANCE ABOVE. OBEY EXACTLY.\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "Ask EXACTLY ONE question this turn — the one specified below. Do NOT ask\n"
            "anything else, do NOT skip ahead, and do NOT re-ask anything already answered\n"
            "earlier in this conversation. If the user's previous answer was too vague to\n"
            "score, you may briefly re-ask THIS item for clarification instead — but never\n"
            "switch to a different topic.\n\n"
            f"{directive}"
        )
    else:
        turn_control_block = (
            "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "TURN CONTROL — SCRIPT COMPLETE\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "Every scripted question has been asked. Do NOT ask anything further. Map the\n"
            "full conversation to the structured fields and call the submit_profile\n"
            "function now."
        )
    effective_system = SYSTEM_PROMPT + turn_control_block

    config = types.GenerateContentConfig(
        system_instruction=effective_system,
        tools=[SUBMIT_PROFILE_TOOL],
        temperature=0.4,
        max_output_tokens=2048,
        thinking_config=types.ThinkingConfig(thinking_budget=0),  # disable thinking to preserve streaming + function-calling
    )

    function_call_args = None

    for chunk in client.models.generate_content_stream(
        model=GEMINI_MODEL,
        contents=contents,
        config=config,
    ):
        # Stream text tokens
        if chunk.text:
            yield {"type": "token", "content": chunk.text}

        # Detect function call (may arrive in any chunk, usually the last)
        if chunk.candidates:
            for candidate in chunk.candidates:
                if not (candidate.content and candidate.content.parts):
                    continue
                for part in candidate.content.parts:
                    fc = getattr(part, "function_call", None)
                    if fc and getattr(fc, "name", None) == "submit_profile":
                        function_call_args = _to_python(fc.args)

    if function_call_args is not None:
        yield {"type": "profile_ready", "profile": function_call_args}


# ── Async bridge ──────────────────────────────────────────────────────────────

async def stream_elicitation(
    messages: list[ChatMessage],
) -> AsyncGenerator[dict, None]:
    """
    Async generator that bridges the sync Gemini stream to async FastAPI.
    Puts events into an asyncio.Queue from a background thread.
    """
    loop = asyncio.get_event_loop()
    q: asyncio.Queue = asyncio.Queue()

    def _produce() -> None:
        try:
            for event in _stream_sync(messages):
                loop.call_soon_threadsafe(q.put_nowait, event)
        except Exception as exc:
            loop.call_soon_threadsafe(
                q.put_nowait, {"type": "error", "content": str(exc)}
            )
        finally:
            loop.call_soon_threadsafe(q.put_nowait, None)  # sentinel

    threading.Thread(target=_produce, daemon=True).start()

    while True:
        event = await q.get()
        if event is None:
            break
        yield event


def _message_role_content(message: Any) -> tuple[str, str]:
    if isinstance(message, dict):
        role = message.get("role", "user")
        content = message.get("content", "")
    else:
        role = getattr(message, "role", "user")
        content = getattr(message, "content", "")
    return str(role or "user"), str(content or "")


def _has_prior_assistant_message(messages: list[ChatMessage]) -> bool:
    return any(
        _message_role_content(message)[0] == "assistant" for message in messages[:-1]
    )


def _stream_interview_sync(
    messages: list[ChatMessage],
    session_id: str | None,
) -> Generator[dict, None, None]:
    try:
        from persistence import (  # noqa: PLC0415
            get_session,
            get_session_elicitation_state,
            set_session_elicitation_state,
        )
        from llm import scoring  # noqa: PLC0415
    except Exception as exc:
        yield {"type": "error", "content": str(exc)}
        return

    db = get_session()
    try:
        state = (
            get_session_elicitation_state(db, session_id)
            or interview_state.initial_state()
        )
        if messages:
            last_role, last_content = _message_role_content(messages[-1])
            item = interview_state.current(state)
            if (
                item is not None
                and last_role == "user"
                and _has_prior_assistant_message(messages)
            ):
                try:
                    score = scoring.score_answer(item, last_content, messages)
                except Exception as exc:
                    yield {"type": "error", "content": str(exc)}
                    return
                state = interview_state.record_and_advance(state, score)

        set_session_elicitation_state(db, session_id, state)
        db.commit()
    except Exception as exc:
        db.rollback()
        yield {"type": "error", "content": str(exc)}
        return
    finally:
        db.close()

    if interview_state.is_complete(state):
        try:
            profile = scoring.assemble_profile(
                messages,
                interview_state.collected_scores(state),
            )
        except Exception as exc:
            yield {"type": "error", "content": str(exc)}
            return

        try:
            from api.v1 import _run_pipeline  # noqa: PLC0415
            import models as api_models  # noqa: PLC0415

            profile_input = api_models.UserProfileInput(**profile)
            result = _run_pipeline(profile_input)
            if (
                result.status == "needs_clarification"
                and interview_state.re_ask_count(state) < 1
            ):
                state = interview_state.reset_risk_items(state)
                db = get_session()
                try:
                    set_session_elicitation_state(db, session_id, state)
                    db.commit()
                except Exception:
                    db.rollback()
                    raise
                finally:
                    db.close()

                yield {
                    "type": "token",
                    "content": (
                        "A couple of those answers pointed in different directions "
                        "— let me revisit a few questions.\n\n"
                    ),
                }
                for chunk in scoring.render_question(
                    interview_state.current(state),
                    messages,
                ):
                    yield {"type": "token", "content": chunk}
                return
        except Exception:
            yield {"type": "profile_ready", "profile": profile}
            return

        yield {"type": "profile_ready", "profile": profile}
        return

    item = interview_state.current(state)
    if item is None:
        yield {"type": "error", "content": "Interview state is invalid."}
        return

    try:
        for chunk in scoring.render_question(item, messages):
            yield {"type": "token", "content": chunk}
    except Exception as exc:
        yield {"type": "error", "content": str(exc)}


async def stream_interview(
    messages: list[ChatMessage],
    session_id: str | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Async generator for the score-gated onboarding interview.
    Uses the same thread/queue bridge as the legacy Gemini elicitation stream.
    """
    loop = asyncio.get_event_loop()
    q: asyncio.Queue = asyncio.Queue()

    def _produce() -> None:
        try:
            for event in _stream_interview_sync(messages, session_id):
                loop.call_soon_threadsafe(q.put_nowait, event)
        except Exception as exc:
            loop.call_soon_threadsafe(
                q.put_nowait, {"type": "error", "content": str(exc)}
            )
        finally:
            loop.call_soon_threadsafe(q.put_nowait, None)  # sentinel

    threading.Thread(target=_produce, daemon=True).start()

    while True:
        event = await q.get()
        if event is None:
            break
        yield event
