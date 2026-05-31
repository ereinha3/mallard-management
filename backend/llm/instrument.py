"""Ordered elicitation script for the onboarding interview.

Design: the SERVER owns the interview. Each item carries
  - `ask`:   a conversational question to show the user — NEVER any numbered
             options / scale anchors (those make it feel like a form/quiz).
  - `score_kind`: how the user's free-text answer is mapped to a value
             ("scale4" 1-4, "scale10" 0-10, "enum", "dollar", "freeform").
  - `rubric`: HIDDEN scoring guidance for the scorer LLM (the original
             validated anchors / extraction spec). Never shown to the user.
  - `gl_index`: for Grable-Lytton items, the canonical 0-12 slot in
             `risk_instrument_responses`. The ASK order below is reordered
             (vivid/behavioral first, less repetitive) but each GL answer is
             stored at its canonical index, so the validated 13-item sum and
             its population norms are preserved.

`step_from_messages` / `next_directive` are retained for the interim prompt
path; the score-gated orchestration consumes `score_kind`/`rubric`/`gl_index`.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ScriptItem:
    key: str
    score_kind: str          # "scale4" | "scale10" | "enum" | "dollar" | "freeform"
    ask: str                 # conversational prompt shown to the user (no anchors/numbers)
    rubric: str = ""         # hidden scorer guidance (validated anchors / extraction spec)
    gl_index: int | None = None      # 0-12 canonical slot for Grable-Lytton items
    enum_values: tuple[str, ...] = field(default_factory=tuple)

    # Back-compat shim: older code referenced `.kind` ("instrument" | "soft").
    @property
    def kind(self) -> str:
        return "soft" if self.score_kind == "freeform" else "instrument"


# Ask order: warm-up (goals, debts) -> vivid behavioral risk scenarios -> the
# remaining/self-report items -> corroborating signals -> goal amount, prefs.
SCRIPT: list[ScriptItem] = [
    ScriptItem(
        key="goals_horizon",
        score_kind="freeform",
        ask="What are you investing toward, and roughly how many years until you'll want to use the money?",
        rubric="Extract primary goal(s) and horizon_years (integer years). null if neither is given.",
    ),
    ScriptItem(
        key="debts",
        score_kind="freeform",
        ask="Before we talk markets — do you have any debts hanging over you right now (cards, student loans, car, mortgage)? If so, roughly how much and at what rate?",
        rubric="Extract a list of {balance, apr (decimal), kind in credit_card|student|mortgage|auto|personal|other}. If the user clearly has none, return []. null only if they didn't address it.",
    ),
    ScriptItem(
        key="loss_scenario",
        score_kind="enum",
        ask="Imagine your portfolio dropped 20% in a single year — something that genuinely happens. Picture actually seeing that balance. What would you really do?",
        rubric="Map to one of: sell_all (sell everything), sell_some (sell part), hold (hold and wait), buy_more (invest more). null if unclear.",
        enum_values=("sell_all", "sell_some", "hold", "buy_more"),
    ),
    ScriptItem(
        key="GL3", score_kind="scale4", gl_index=2,
        ask="Say you invest, and almost immediately the market falls 15%. Gut reaction — what do you do?",
        rubric="1=sell everything to cut losses; 2=sell some to reduce exposure; 3=hold and wait for recovery; 4=buy more while cheaper.",
    ),
    ScriptItem(
        key="GL5", score_kind="scale4", gl_index=4,
        ask="When something you own drops a lot in value, how does that actually sit with you — and what do you tend to do about it?",
        rubric="1=very anxious, sell immediately; 2=worried, likely reduce; 3=accept as normal volatility, hold; 4=see it as a buying opportunity.",
    ),
    ScriptItem(
        key="GL13", score_kind="scale4", gl_index=12,
        ask="Say $100 lands in your lap. Which feels most like you: keep it safe; take a coin-flip shot at turning it into $250 (or nothing); a longer shot at $750; or a real long shot at $3,000?",
        rubric="A keep $100 safe ->1; B 50/50 for $250 ->2; C shot at $750 ->3; D long-shot $3000 ->4.",
    ),
    ScriptItem(
        key="GL6", score_kind="scale4", gl_index=5,
        ask="If $100,000 unexpectedly landed in your account tomorrow, where would most of it end up?",
        rubric="1=savings/CDs; 2=mostly bonds/low-risk; 3=diversified stocks+bonds; 4=mostly growth/aggressive.",
    ),
    ScriptItem(
        key="GL7", score_kind="scale4", gl_index=6,
        ask="Smaller version: an unexpected $20,000. What's your instinct for it?",
        rubric="1=pay off debt or save; 2=low-risk income investments; 3=mix of low/moderate risk; 4=growth-oriented/higher risk.",
    ),
    ScriptItem(
        key="GL10", score_kind="scale4", gl_index=9,
        ask="Suppose smart people are convinced a certain sector will take off next year, and you're not in it. Do you chase it — and how hard?",
        rubric="1=nothing, stay put; 2=move a small amount; 3=shift a moderate amount; 4=move aggressively toward it.",
    ),
    ScriptItem(
        key="GL11", score_kind="scale4", gl_index=10,
        ask="An investment of yours just jumped 25% and hit the target price. What do you do now?",
        rubric="1=sell all, lock the gain; 2=sell most; 3=hold and see; 4=buy more, momentum's working.",
    ),
    ScriptItem(
        key="GL12", score_kind="scale4", gl_index=11,
        ask="Would you rather take $1,000 today, or wait a year for a shot at $1,200?",
        rubric="1=definitely $1000 now; 2=slight preference for now; 3=slight preference to wait; 4=definitely wait for more.",
    ),
    ScriptItem(
        key="GL4", score_kind="scale4", gl_index=3,
        ask="If your employer let you put part of your retirement savings into the company's own stock, how much would you be comfortable putting in?",
        rubric="1=none, too risky; 2=a small amount; 3=a moderate amount; 4=a large portion.",
    ),
    ScriptItem(
        key="GL2", score_kind="scale4", gl_index=1,
        ask="How much investing have you actually done before — stocks, funds, that kind of thing?",
        rubric="1=never and uncomfortable; 2=never but open; 3=some experience, comfortable with basics; 4=experienced.",
    ),
    ScriptItem(
        key="GL1", score_kind="scale4", gl_index=0,
        ask="Stepping back — how would you describe your overall relationship with financial risk?",
        rubric="1=very cautious, avoid all risk; 2=somewhat cautious, prefer safe; 3=comfortable with moderate risk for better returns; 4=enjoy risk for higher rewards.",
    ),
    ScriptItem(
        key="GL8", score_kind="scale4", gl_index=7,
        ask="If you had to label yourself as a risk taker with money, where would you land?",
        rubric="1=very conservative; 2=conservative; 3=moderate risk taker; 4=aggressive risk taker.",
    ),
    ScriptItem(
        key="GL9", score_kind="scale4", gl_index=8,
        ask="When you hear the words “financial risk,” what's the first thing that comes to mind?",
        rubric="1=loss/danger to avoid; 2=mostly negative; 3=uncertainty, mixed; 4=opportunity/potential gain.",
    ),
    ScriptItem(
        key="dohmen", score_kind="scale10",
        ask="On a scale of 0 to 10, how willing are you to take risks in general — not just money, life in general?",
        rubric="Record the integer 0-10 the user gives (0=not at all willing, 10=very willing). null if no number.",
    ),
    ScriptItem(
        key="loss_aversion", score_kind="dollar",
        ask="Last one like this: if there were a 50-50 chance of losing $100, how big would the potential win need to be before you'd take that bet?",
        rubric="Record the dollar amount (number). Neutral ~100, loss-averse ~200+. null if no amount.",
    ),
    ScriptItem(
        key="goal_target",
        score_kind="freeform",
        ask="Roughly what number would you need at your goal — retirement or otherwise — to feel genuinely secure? A ballpark is fine.",
        rubric="Extract goal_target as a dollar number. 0 if they truly have no idea. null if unaddressed.",
    ),
    ScriptItem(
        key="preferences",
        score_kind="freeform",
        ask="Finally, any preferences on how it's invested — ETFs vs individual stocks, anything you'd want to avoid for ethical reasons, or any areas you'd lean into?",
        rubric="Extract universe_pref (etf|stock|mix), esg_exclusions (list), sector_tilts (list). Empty/none is valid; null if unaddressed.",
    ),
]

GL_COUNT = sum(1 for item in SCRIPT if item.gl_index is not None)


def step_from_messages(messages) -> int:
    """Interim stateless step = (#user messages) - 1, clamped to [0, len(SCRIPT)].

    Retained for the legacy prompt path; the score-gated orchestration uses
    persisted state instead.
    """
    user_messages = 0
    for message in messages:
        role = message.get("role") if isinstance(message, dict) else getattr(message, "role", None)
        if role == "user":
            user_messages += 1
    return min(max(user_messages - 1, 0), len(SCRIPT))


def current_item(step: int) -> ScriptItem | None:
    if 0 <= step < len(SCRIPT):
        return SCRIPT[step]
    return None


def next_directive(step: int) -> str | None:
    """Interim directive: render the conversational `ask` with NO numbered options.

    The full orchestration replaces this with explicit score->render calls.
    """
    item = current_item(step)
    if item is None:
        return None
    return (
        "ASK NEXT — ask the user this, conversationally, as a single question, in your own warm "
        "words. Do NOT show any numbered options, letter choices, or scale anchors; let them answer "
        f"naturally. Do not ask anything already answered earlier:\n\n{item.ask}"
    )
