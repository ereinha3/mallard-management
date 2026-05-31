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
from llm import explain_tools

GEMINI_MODEL = "gemini-2.5-pro"
_MAX_TOOL_TURNS = 5

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

You have read-only tools for live Greenlight engine data, deterministic projections,
portfolio/risk internals, and research citations. Use tools for user-specific numbers
and method backing. The tools return numbers; you narrate them. Do not compute new
allocations, projections, risk scores, or advice yourself.

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
        summary = {
            "status": data.get("status"),
            "gate_status": (data.get("gate_result") or {}).get("status"),
            "failed_check": (data.get("gate_result") or {}).get("failed_check"),
            "risk": (data.get("financial_analysis") or {}).get("risk"),
            "portfolio_method": (
                ((data.get("portfolio") or {}).get("weights") or {}).get("method")
            ),
        }
        return (
            "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "THIN CONTEXT SUMMARY\n"
            "Use tools for live user-specific detail; do not infer missing numbers.\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            + json.dumps(summary, indent=2, default=str)
        )
    except Exception:
        return ""


def _build_advisor_tools() -> Any:
    if types is None:
        return None

    empty_params = types.Schema(type="OBJECT", properties={})
    method_schema = types.Schema(
        type="STRING",
        enum=["erc", "black_litterman", "cvar"],
        description="Portfolio construction method to explain.",
    )
    citation_method_schema = types.Schema(
        type="STRING",
        enum=list(explain_tools.CITATION_METHODS),
        description="Greenlight method area whose research backing should be cited.",
    )
    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="get_my_gate_status",
                description="Read the requesting user's responsibility-gate status, checks, and supporting math.",
                parameters=empty_params,
            ),
            types.FunctionDeclaration(
                name="explain_portfolio",
                description="Read the requesting user's target portfolio weights, blend, risk metrics, contributions, and exclusions.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={"method": method_schema},
                ),
            ),
            types.FunctionDeclaration(
                name="explain_risk_fusion",
                description="Read the requesting user's gamma signal fusion internals and resulting gamma band.",
                parameters=empty_params,
            ),
            types.FunctionDeclaration(
                name="get_projection_percentiles",
                description="Run a deterministic, seeded projection explanation for the requesting user's current portfolio.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "horizon_years": types.Schema(type="INTEGER", description="Optional projection horizon in years."),
                        "n_paths": types.Schema(type="INTEGER", description="Number of Monte Carlo paths. Use modest values for explanations."),
                        "seed": types.Schema(type="INTEGER", description="Seed for stable explanations."),
                        "generator": types.Schema(
                            type="STRING",
                            enum=["stationary_bootstrap", "gaussian"],
                        ),
                    },
                ),
            ),
            types.FunctionDeclaration(
                name="get_method_citations",
                description="Fetch research citations and a concise summary for a Greenlight method.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={"method": citation_method_schema},
                    required=["method"],
                ),
            ),
        ]
    )


ADVISOR_TOOLS = _build_advisor_tools()


def _to_python(val: Any) -> Any:
    if val is None:
        return val
    if hasattr(val, "items"):
        return {k: _to_python(v) for k, v in val.items()}
    if (
        hasattr(val, "__iter__")
        and not isinstance(val, (str, bytes, int, float, bool))
    ):
        return [_to_python(v) for v in val]
    return val


def _function_response_content(name: str, response: dict[str, Any]) -> Any:
    return types.Content(
        role="tool",
        parts=[types.Part.from_function_response(name=name, response=response)],
    )


def _stream_sync(
    messages: list[ChatMessage],
    context: Optional[Any],
    user_email: Optional[str] = None,
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
        tools=[ADVISOR_TOOLS] if ADVISOR_TOOLS is not None else None,
        temperature=0.5,
        max_output_tokens=1024,
    )

    for _ in range(_MAX_TOOL_TURNS):
        function_calls: list[tuple[str, dict[str, Any]]] = []
        model_tool_content = None

        for chunk in client.models.generate_content_stream(
            model=GEMINI_MODEL,
            contents=contents,
            config=config,
        ):
            if chunk.text:
                yield {"type": "token", "content": chunk.text}

            if not getattr(chunk, "candidates", None):
                continue
            for candidate in chunk.candidates:
                content = getattr(candidate, "content", None)
                if not (content and getattr(content, "parts", None)):
                    continue
                for part in content.parts:
                    fc = getattr(part, "function_call", None)
                    if not (fc and getattr(fc, "name", None)):
                        continue
                    model_tool_content = content
                    function_calls.append((fc.name, _to_python(getattr(fc, "args", None))))

        if not function_calls:
            return

        if model_tool_content is not None:
            contents.append(model_tool_content)
        for name, args in function_calls:
            try:
                result = explain_tools.dispatch_explain_tool(name, args, user_email)
            except Exception as exc:
                result = {"error": str(exc)}
            contents.append(_function_response_content(name, result))

    yield {"type": "error", "content": "Advisor tool-call loop exceeded its maximum depth."}


async def stream_advisor(
    messages: list[ChatMessage],
    context: Optional[Any] = None,
    user_email: Optional[str] = None,
) -> AsyncGenerator[dict, None]:
    loop = asyncio.get_event_loop()
    q: asyncio.Queue = asyncio.Queue()

    def _produce() -> None:
        try:
            for event in _stream_sync(messages, context, user_email):
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
