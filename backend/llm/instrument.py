from __future__ import annotations

from dataclasses import dataclass
from typing import Optional  # noqa: F401


@dataclass(frozen=True)
class ScriptItem:
    key: str
    kind: str  # "instrument" | "soft"
    text: str


SCRIPT: list[ScriptItem] = [
    ScriptItem(
        key="goals_horizon",
        kind="soft",
        text=(
            "their primary financial goal(s) and the number of years until they "
            "need the money (their investment time horizon)"
        ),
    ),
    ScriptItem(
        key="debts",
        kind="soft",
        text=(
            "any outstanding debts — for each, the balance, APR, and type "
            "(credit_card / student / mortgage / auto / personal / other). "
            "This drives the responsibility gate, so it matters. The intake form "
            "did not capture debts."
        ),
    ),
    ScriptItem(
        key="GL1",
        kind="instrument",
        text="""Ask: How would you describe your attitude toward financial risk in general?
1 = Very cautious, avoid all risk
2 = Somewhat cautious, prefer safe options
3 = Comfortable with moderate risk for better returns
4 = Enjoy taking financial risks for potentially higher rewards""",
    ),
    ScriptItem(
        key="GL2",
        kind="instrument",
        text="""Ask: Have you invested in stocks, bonds, or mutual funds before?
1 = Never and not comfortable with it
2 = Never but open to learning
3 = Some experience, comfortable with basics
4 = Experienced investor""",
    ),
    ScriptItem(
        key="GL3",
        kind="instrument",
        text="""Ask: If the market dropped 15% right after you invested, what would you do?
1 = Sell everything to cut losses
2 = Sell some to reduce exposure
3 = Hold and wait for recovery
4 = Buy more while prices are lower""",
    ),
    ScriptItem(
        key="GL4",
        kind="instrument",
        text="""Ask: If your employer let you put part of your retirement into company stock?
1 = Definitely not — too risky
2 = A small amount only
3 = A moderate amount
4 = A large portion — I believe in where I work""",
    ),
    ScriptItem(
        key="GL5",
        kind="instrument",
        text="""Ask: If an investment fell significantly in value, how would you feel and act?
1 = Very anxious, would sell immediately
2 = Worried, would likely reduce my position
3 = Accept it as normal volatility and hold
4 = See it as a buying opportunity""",
    ),
    ScriptItem(
        key="GL6",
        kind="instrument",
        text="""Ask: If you inherited $100,000 unexpectedly, where would most of it go?
1 = Savings account or CDs
2 = Mostly bonds or low-risk investments
3 = Diversified mix of stocks and bonds
4 = Mostly growth stocks or aggressive investments""",
    ),
    ScriptItem(
        key="GL7",
        kind="instrument",
        text="""Ask: If you unexpectedly received $20,000, what would you do?
1 = Pay off debt or put it in savings
2 = Low-risk, income-producing investments
3 = A mix of low and moderate-risk investments
4 = Growth-oriented, higher-risk assets""",
    ),
    ScriptItem(
        key="GL8",
        kind="instrument",
        text="""Ask: How would you describe yourself as a financial risk taker?
1 = Very conservative
2 = Conservative
3 = Moderate risk taker
4 = Aggressive risk taker""",
    ),
    ScriptItem(
        key="GL9",
        kind="instrument",
        text="""Ask: When you hear "financial risk," what comes to mind?
1 = Loss or danger — something to avoid
2 = Something mostly negative
3 = Uncertainty with mixed possibilities
4 = Opportunity and potential gain""",
    ),
    ScriptItem(
        key="GL10",
        kind="instrument",
        text="""Ask: Experts predict a sector will surge next year. Your money isn't there. What do you do?
1 = Nothing — stay in my conservative mix
2 = Move a small amount just in case
3 = Shift a moderate amount there
4 = Move aggressively toward that opportunity""",
    ),
    ScriptItem(
        key="GL11",
        kind="instrument",
        text="""Ask: An investment jumped 25% and hit your advisor's target price. What do you do?
1 = Sell everything and lock in the gain
2 = Sell most of it
3 = Hold and see where it goes
4 = Buy more — momentum is working""",
    ),
    ScriptItem(
        key="GL12",
        kind="instrument",
        text="""Ask: Would you rather have $1,000 today or wait a year for potentially $1,200?
1 = Definitely take $1,000 now
2 = Slight preference for now
3 = Slight preference to wait
4 = Definitely wait for the larger amount""",
    ),
    ScriptItem(
        key="GL13",
        kind="instrument",
        text="""Ask: Imagine you unexpectedly come into some extra money — say $100 — and you have a few options
     for what to do with it. Which sounds most like you? A: Keep the full $100, no risk.
     B: Try something where you might walk away with $250, but there's an equal chance you end up
     with nothing. C: Go for a shot at $750, though it's more likely you'd end up with nothing.
     D: Take a long-shot chance at $3,000, knowing the odds are heavily against you.
A → 1, B → 2, C → 3, D → 4""",
    ),
    ScriptItem(
        key="loss_scenario",
        kind="instrument",
        text="""Ask explicitly: "If your actual investment portfolio dropped 20% in a single year —
a scenario that has happened historically — what would you realistically do?"
sell_all  = would sell everything
sell_some = would sell part
hold      = would hold and wait
buy_more  = would invest more""",
    ),
    ScriptItem(
        key="dohmen",
        kind="instrument",
        text='''Ask: "On a scale from 0 to 10, where 0 means not at all willing to take risks
and 10 means very willing, how willing are you to take risks in general?"''',
    ),
    ScriptItem(
        key="loss_aversion",
        kind="instrument",
        text='''Ask: "Say something came up where you stood to lose $100 — maybe a purchase that might not pan out,
or a small investment that could go sideways. What's the smallest potential gain that would make it
feel worth the risk to you? In other words, if there's a 50-50 chance of losing $100, how much would
you need to potentially win before you'd seriously consider it?"''',
    ),
    ScriptItem(
        key="goal_target",
        kind="soft",
        text=(
            "roughly how much money they would need at their goal/retirement date "
            "to feel secure."
        ),
    ),
    ScriptItem(
        key="preferences",
        kind="soft",
        text=(
            "investment preferences: ETF-only / individual stocks / mix; any "
            "sectors to exclude for ethical reasons; any sectors to tilt toward."
        ),
    ),
]


def step_from_messages(messages) -> int:
    """
    Stateless step counter. step = (number of user-role messages) - 1, clamped to [0, len(SCRIPT)].
    The first user message is the pre-filled intake-form seed (not an answer), hence the -1.
    Accepts both pydantic objects with a .role attribute AND plain dicts with ["role"].
    Never returns a negative value.
    """
    user_messages = 0
    for message in messages:
        if isinstance(message, dict):
            role = message.get("role")
        else:
            role = getattr(message, "role", None)
        if role == "user":
            user_messages += 1

    return min(max(user_messages - 1, 0), len(SCRIPT))


def current_item(step: int) -> ScriptItem | None:
    """Return SCRIPT[step] if 0 <= step < len(SCRIPT), else None."""
    if 0 <= step < len(SCRIPT):
        return SCRIPT[step]
    return None


def next_directive(step: int) -> str | None:
    """
    - If step >= len(SCRIPT): return None (caller will instruct the model to call submit_profile).
    - For kind=="instrument": return exactly:
        "ASK NEXT — present this question VERBATIM as essentially your entire next message. "
        "You may prepend at most one short, warm lead-in sentence, but do NOT reword, merge, "
        "or omit the question or any of its options/scale:\n\n<item.text>"
    - For kind=="soft": return exactly:
        "ASK NEXT — ask the user, conversationally and as a single question, about: <item.text>"
    """
    item = current_item(step)
    if item is None:
        return None

    if item.kind == "instrument":
        return (
            "ASK NEXT — present this question VERBATIM as essentially your entire next message. "
            "You may prepend at most one short, warm lead-in sentence, but do NOT reword, merge, "
            f"or omit the question or any of its options/scale:\n\n{item.text}"
        )

    return f"ASK NEXT — ask the user, conversationally and as a single question, about: {item.text}"
