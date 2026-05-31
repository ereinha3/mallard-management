"""
Financial advisor chat — Greenlight's general Q&A agent.

Separate from the intake elicitation agent. This agent:
- Has access to the user's already-computed financial analysis
- Answers questions, explains concepts, contextualises numbers
- Never computes new figures or gives specific investment advice
- Is grounded strictly in the engine's output and general financial literacy

Same streaming architecture as the elicitation agent (sync Gemini → async queue).
"""

import asyncio
import json
import os
import threading
from typing import Any, AsyncGenerator, Generator, Optional

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

from models import ChatMessage

GEMINI_MODEL = "gemini-2.5-flash"

_ADVISOR_SYSTEM_PROMPT = """
You are Greenlight's financial advisor chatbot. You help users understand their
financial situation and the results of Greenlight's analysis.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR ROLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You explain, contextualize, and answer questions. You do NOT:
• Recommend specific investments or securities
• Compute new financial projections or returns
• Override or second-guess the analysis engine's numbers
• Give tax, legal, or personalized investment advice
• Agree with the user's self-assessments without basis (anti-sycophancy)

Always end responses with a one-line reminder:
"This is educational only — not financial, tax, or investment advice."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT YOU CAN DO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Explain what a gate result means and why the math works that way
• Walk through the debt-vs-invest comparison in plain language
• Explain risk concepts (gamma, volatility, capacity vs. tolerance)
• Answer "what if" questions conceptually ("what if I paid off the card faster?")
• Explain the emergency fund logic and why 3 months is the threshold
• Help the user understand their path to greenlight
• Explain financial concepts relevant to their situation
• Discuss the analysis numbers that are already computed (reference them directly)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Clear, warm, honest. Use plain language. When something is uncertain or
contested, say so. Never flatter. Be concise — 2-4 sentences for simple
questions, more only when the topic genuinely requires it.
""".strip()


def _build_context_block(context: Optional[Any]) -> str:
    if context is None:
        return ""
    try:
        if hasattr(context, "model_dump"):
            data = context.model_dump()
        elif isinstance(context, dict):
            data = context
        else:
            return ""
        return (
            "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "USER'S FINANCIAL ANALYSIS (from the Greenlight engine)\n"
            "Reference these numbers directly when answering. Do not invent others.\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            + json.dumps(data, indent=2, default=str)
        )
    except Exception:
        return ""


def _stream_sync(
    messages: list[ChatMessage],
    context: Optional[Any],
) -> Generator[dict, None, None]:
    if genai is None or types is None:
        yield {"type": "error", "content": "google-genai is not installed."}
        return

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        yield {"type": "error", "content": "GOOGLE_API_KEY is not set."}
        return

    client = genai.Client(api_key=api_key)

    system = _ADVISOR_SYSTEM_PROMPT + _build_context_block(context)

    contents: list[types.Content] = []
    for msg in messages:
        role = "model" if msg.role == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=msg.content)]))

    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=0.5,
        max_output_tokens=1024,
    )

    for chunk in client.models.generate_content_stream(
        model=GEMINI_MODEL,
        contents=contents,
        config=config,
    ):
        if chunk.text:
            yield {"type": "token", "content": chunk.text}


async def stream_advisor(
    messages: list[ChatMessage],
    context: Optional[Any] = None,
) -> AsyncGenerator[dict, None]:
    loop = asyncio.get_event_loop()
    q: asyncio.Queue = asyncio.Queue()

    def _produce() -> None:
        try:
            for event in _stream_sync(messages, context):
                loop.call_soon_threadsafe(q.put_nowait, event)
        except Exception as exc:
            loop.call_soon_threadsafe(
                q.put_nowait, {"type": "error", "content": str(exc)}
            )
        finally:
            loop.call_soon_threadsafe(q.put_nowait, None)

    threading.Thread(target=_produce, daemon=True).start()

    while True:
        event = await q.get()
        if event is None:
            break
        yield event
