import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models import AdvisorChatRequest, ChatRequest, OnboardResponse, UserProfileInput
from engine.elicitation import stream_elicitation
from engine.advisor import stream_advisor
from engine.validator import validate_profile
from engine.risk_profiler import compute_risk_profile
from engine.gate import run_gate, build_optimizer_input
from engine.analyzer import compute_financial_analysis
from config import EF_MONTHS, HIGH_APR, LOW_APR, EXPECTED_MARKET_RETURN, LTCG_RATE

router = APIRouter()


def _run_pipeline(profile_input: UserProfileInput) -> OnboardResponse:
    validated, issues = validate_profile(profile_input)
    if issues:
        return OnboardResponse(status="needs_clarification", clarification_requests=issues)

    risk_profile = compute_risk_profile(validated)
    gate_result = run_gate(validated, risk_profile)
    financial_analysis = compute_financial_analysis(validated, risk_profile, gate_result)

    optimizer_input = None
    if gate_result.status == "greenlight":
        optimizer_input = build_optimizer_input(validated, risk_profile, gate_result)

    return OnboardResponse(
        status=gate_result.status,
        validated_profile=validated,
        risk_profile=risk_profile,
        gate_result=gate_result,
        financial_analysis=financial_analysis,
        optimizer_input=optimizer_input,
    )


@router.post("/onboard", response_model=OnboardResponse, summary="Full intake pipeline")
def onboard(profile_input: UserProfileInput) -> OnboardResponse:
    """
    Validate profile → compute risk profile → run responsibility gate.
    Returns a halt with math or a greenlight with a packaged OptimizerInput.
    """
    return _run_pipeline(profile_input)


@router.post("/gate/recheck", response_model=OnboardResponse, summary="Re-run gate on updated profile")
def recheck(profile_input: UserProfileInput) -> OnboardResponse:
    """Re-run after the user has paid off debt or built their emergency fund."""
    return _run_pipeline(profile_input)


@router.post("/chat", summary="Elicitation chat — streams tokens then emits profile_ready")
async def chat(request: ChatRequest) -> StreamingResponse:
    """
    Intake elicitation. Streams SSE:
      {"type": "token",        "content": "..."}
      {"type": "profile_ready","profile": {...}}   — submit to /onboard when received
      {"type": "error",        "content": "..."}
      [DONE]
    """
    async def event_stream():
        async for event in stream_elicitation(request.messages):
            yield f"data: {json.dumps(event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/advisor/chat", summary="Financial advisor Q&A — streams tokens")
async def advisor_chat(request: AdvisorChatRequest) -> StreamingResponse:
    """
    General financial advisor chat. Grounded in the user's computed analysis.
    Pass the OnboardResponse from /onboard as `context` to give the advisor
    the user's numbers. Omit `context` for general financial Q&A.

    Streams SSE:
      {"type": "token",  "content": "..."}
      {"type": "error",  "content": "..."}
      [DONE]
    """
    async def event_stream():
        async for event in stream_advisor(request.messages, request.context):
            yield f"data: {json.dumps(event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/config", summary="Gate thresholds and market assumptions")
def get_config() -> dict:
    """Canonical constants — exposed so the frontend can display them in the parameter panel."""
    return {
        "gate": {
            "emergency_fund_months_required": EF_MONTHS,
            "high_apr_threshold": HIGH_APR,
            "low_apr_threshold": LOW_APR,
        },
        "market_assumptions": {
            "expected_market_return": EXPECTED_MARKET_RETURN,
            "ltcg_rate": LTCG_RATE,
        },
    }
