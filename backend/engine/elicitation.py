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

from google import genai
from google.genai import types

from models import ChatMessage

# ── Gemini model ──────────────────────────────────────────────────────────────

GEMINI_MODEL = "gemini-2.5-flash"

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

Tone: Professional, warm, and direct. Ask multiple related questions together.
Vary your phrasing — never read from a list. When answers are vague, ask for
specifics. Never lead the user toward a particular answer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TO GATHER — in roughly this order
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FINANCIAL BASICS
   • Annual household income (gross)
   • Monthly essential expenses — housing, food, utilities, transport, insurance,
     debt minimums. Exclude discretionary spending like dining out or streaming.
   • Liquid capital available to invest (cash/savings, NOT retirement accounts)
   • Emergency fund balance (savings explicitly set aside for emergencies)
   • All debts: for each → outstanding balance, APR, type
     Types: credit_card | student | mortgage | auto | personal | other

2. LIFE SITUATION
   • Age
   • Years until they need the money (retirement or primary goal)
   • Primary financial goals (retirement / home purchase / education / other)
   • Number of financial dependents
   • Tax filing status: single | married_joint | married_separate | head_of_household

3. INCOME STABILITY — classify as one of:
   • bond_like: very stable — government, tenured teacher, large-employer salary
   • mixed: moderately stable — professional with variable bonus, steady contractor
   • stock_like: volatile — freelancer, commission-based, startup, self-employment

4. RISK TOLERANCE — 13-item Grable-Lytton instrument
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
     Ask: On a game show, which do you choose? A: $100 guaranteed. B: 50% chance of $250 or nothing.
          C: 20% chance of $750 or nothing. D: 5% chance of $3,000 or nothing.
     A → 1, B → 2, C → 3, D → 4

5. BEHAVIORAL SCENARIO — loss_scenario_response (separate from GL3/GL5)
   Ask explicitly: "If your actual investment portfolio dropped 20% in a single year —
   a scenario that has happened historically — what would you realistically do?"
   sell_all  = would sell everything
   sell_some = would sell part
   hold      = would hold and wait
   buy_more  = would invest more

6. LOSS-AVERSION PROBE — loss_aversion_probe (optional)
   Ask: "Suppose you have a 50/50 coin flip — heads you WIN $X, tails you LOSE $100.
   What's the smallest X that would make you want to take that bet?"
   Record the dollar amount. Neutral answer = $100. Loss-averse (λ ≈ 2) ≈ $200.
   Skip if the conversation is already long or the user is impatient.

7. GOAL TARGET — goal_target
   Ask: "Roughly how much money would you need at retirement (or your goal date) to feel
   financially secure? Even a rough number helps." If they have no idea, use 0.
   Record in dollars (e.g. 1000000 for $1M).

8. INVESTMENT PREFERENCES
   • ETF-only, individual stocks, or a mix
   • Any sectors/industries to exclude for ethical reasons (e.g. fossil fuels, weapons, tobacco)
   • Any sectors they want to tilt toward

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRADICTION DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If the user's behavioral responses (GL3, GL5, loss scenario) contradict their
self-rating (GL1, GL8), probe it once, neutrally:
"You described yourself as [X], but also said you'd [Y behavior] in a market drop.
That's worth exploring — in the moment, do you think you'd really follow through?"
Score based on behavioral evidence, not the self-rating. Set loss_aversion_flag if
the probe or scenario suggests meaningfully higher loss aversion than the self-rating.

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
  loss_scenario_response, income_stability.

Before calling, send a brief message: "I have everything I need — let me pass this to
the analysis engine now."
""".strip()

# ── Tool definition ───────────────────────────────────────────────────────────

def _debt_schema() -> types.Schema:
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


SUBMIT_PROFILE_TOOL = types.Tool(
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
                    "household_income":  types.Schema(type="NUMBER", description="Annual household income in dollars"),
                    "monthly_expenses":  types.Schema(type="NUMBER", description="Total monthly essential expenses"),
                    "capital_on_hand":   types.Schema(type="NUMBER", description="Liquid capital available to invest"),
                    "emergency_fund":    types.Schema(type="NUMBER", description="Current emergency fund balance"),
                    "debts":             types.Schema(
                        type="ARRAY",
                        items=_debt_schema(),
                        description="All debts; empty list if none",
                    ),
                    # Lifecycle
                    "age":            types.Schema(type="INTEGER"),
                    "horizon_years":  types.Schema(type="INTEGER", description="Years to retirement or primary goal"),
                    "goals":          types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
                    "goal_target":    types.Schema(type="NUMBER", description="Target terminal wealth in dollars; 0 if unknown"),
                    "dependents":     types.Schema(type="INTEGER"),
                    "filing_status":  types.Schema(
                        type="STRING",
                        enum=["single", "married_joint", "married_separate", "head_of_household"],
                    ),
                    # Risk tolerance
                    "risk_instrument_responses": types.Schema(
                        type="ARRAY",
                        items=types.Schema(type="INTEGER"),
                        description="13 Grable-Lytton scores in order GL1–GL13, each 1–4",
                    ),
                    "loss_scenario_response": types.Schema(
                        type="STRING",
                        enum=["sell_all", "sell_some", "hold", "buy_more"],
                    ),
                    "loss_aversion_probe": types.Schema(
                        type="NUMBER",
                        description="Minimum $ win to accept 50/50 bet against $100 loss; null if not asked",
                    ),
                    # Capacity
                    "income_stability": types.Schema(
                        type="STRING",
                        enum=["bond_like", "mixed", "stock_like"],
                    ),
                    # Preferences
                    "universe_pref":        types.Schema(type="STRING", enum=["etf", "stock", "mix"]),
                    "esg_exclusions":       types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
                    "sector_theme_tilts":   types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
                    # LLM metadata
                    "confidence":        types.Schema(type="OBJECT", description="Per-field confidence 0–1"),
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
                    "loss_scenario_response", "income_stability",
                ],
            ),
        )
    ]
)

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

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        tools=[SUBMIT_PROFILE_TOOL],
        temperature=0.4,
        max_output_tokens=2048,
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
