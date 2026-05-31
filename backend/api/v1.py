import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from models import (
    AdvisorChatRequest,
    ChatRequest,
    ChatSessionOut,
    OnboardResponse,
    UserProfileInput,
    AuthRequest,
    AuthResponse,
    UserRecord,
)
from engine.elicitation import stream_elicitation
from engine.advisor import stream_advisor
from engine.validator import validate_profile
from engine.risk_profiler import compute_risk_profile
from engine.gate import run_gate, build_optimizer_input
from engine.analyzer import compute_financial_analysis
import engine as backend_engine

backend_engine.__path__.append(str(Path(__file__).resolve().parents[2] / "engine"))

from engine.data.db import (
    ChatMessageRow,
    ChatSession,
    Profile,
    User,
    append_message,
    create_all,
    get_messages,
    get_or_create_session,
    get_session,
    get_sessions_for_user,
    get_user,
    get_user_record,
)
from auth_utils import get_password_hash, verify_password
from config import EF_MONTHS, HIGH_APR, LOW_APR, EXPECTED_MARKET_RETURN, LTCG_RATE

router = APIRouter()

# Ensure tables exist
create_all()

def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


def _json_dt(value) -> str | None:
    return value.isoformat() if value else None


def _message_out(message: ChatMessageRow) -> dict:
    return {
        "role": message.role,
        "content": message.content,
        "seq": message.seq,
        "created_at": _json_dt(message.created_at),
    }


def _session_out(db: Session, chat_session: ChatSession, include_messages: bool = True) -> dict:
    return {
        "id": chat_session.id,
        "kind": chat_session.kind,
        "status": chat_session.status,
        "created_at": _json_dt(chat_session.created_at),
        "updated_at": _json_dt(chat_session.updated_at),
        "extracted_profile": chat_session.get_extracted_profile(),
        "messages": [
            _message_out(message)
            for message in (get_messages(db, chat_session.id) if include_messages else [])
        ],
    }


def _prepare_chat_session(
    session_id: str | None,
    user_email: str | None,
    kind: str,
    messages,
) -> str:
    db = get_session()
    try:
        persisted_email = user_email if user_email and get_user(db, user_email) else None
        chat_session = get_or_create_session(db, session_id, persisted_email, kind)
        db.flush()

        stored_count = len(get_messages(db, chat_session.id))
        for message in messages[stored_count:]:
            append_message(db, chat_session.id, message.role, message.content)

        db.commit()
        return chat_session.id
    except Exception:
        db.rollback()
        if session_id:
            return session_id
        raise
    finally:
        db.close()


def _append_assistant_message(session_id: str, content: str) -> None:
    if not content:
        return
    db = get_session()
    try:
        append_message(db, session_id, "assistant", content)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _save_extracted_profile(session_id: str, profile: dict) -> None:
    db = get_session()
    try:
        chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if chat_session:
            chat_session.extracted_profile = json.dumps(profile)
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


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


# ── Auth Endpoints ────────────────────────────────────────────────────────────

@router.post("/auth/register", response_model=AuthResponse)
def register(req: AuthRequest, db: Session = Depends(get_db)):
    if not req.name:
        raise HTTPException(status_code=400, detail="Name is required for registration")
    
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(
        email=req.email,
        name=req.name,
        hashed_password=get_password_hash(req.password)
    )
    db.add(user)
    db.commit()
    return AuthResponse(email=user.email, name=user.name, token="mock-token-" + user.email)


@router.post("/auth/login", response_model=AuthResponse)
def login(req: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    return AuthResponse(email=user.email, name=user.name, token="mock-token-" + user.email)


# ── Profile Endpoints ─────────────────────────────────────────────────────────

@router.get("/profile/{email}", response_model=OnboardResponse)
def get_profile(email: str, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.user_email == email).first()
    if not profile:
        return OnboardResponse(status="no_profile")
    
    return OnboardResponse(**profile.get_result())


@router.post("/onboard", response_model=OnboardResponse, summary="Full intake pipeline")
def onboard(profile_input: UserProfileInput, user_email: Optional[str] = None, db: Session = Depends(get_db)) -> OnboardResponse:
    """
    Validate profile → compute risk profile → run responsibility gate.
    Returns a halt with math or a greenlight with a packaged OptimizerInput.
    Saves to DB if user_email is provided.
    """
    res = _run_pipeline(profile_input)
    
    if user_email:
        # Check if user exists
        user = db.query(User).filter(User.email == user_email).first()
        if user:
            existing_profile = db.query(Profile).filter(Profile.user_email == user_email).first()
            if existing_profile:
                existing_profile.input_data = profile_input.model_dump_json()
                existing_profile.onboard_result = res.model_dump_json()
            else:
                new_profile = Profile(
                    user_email=user_email,
                    input_data=profile_input.model_dump_json(),
                    onboard_result=res.model_dump_json()
                )
                db.add(new_profile)
            db.commit()
            
    return res


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
    try:
        session_id = _prepare_chat_session(
            request.session_id,
            request.user_email,
            "elicitation",
            request.messages,
        )
    except Exception:
        session_id = request.session_id

    async def event_stream():
        if session_id:
            yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"
        assistant_chunks = []
        async for event in stream_elicitation(request.messages):
            if event.get("type") == "token":
                assistant_chunks.append(event.get("content", ""))
            elif event.get("type") == "profile_ready" and session_id:
                _save_extracted_profile(session_id, event.get("profile", {}))
            yield f"data: {json.dumps(event)}\n\n"
        if session_id:
            _append_assistant_message(session_id, "".join(assistant_chunks))
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
    try:
        session_id = _prepare_chat_session(
            request.session_id,
            request.user_email,
            "advisor",
            request.messages,
        )
    except Exception:
        session_id = request.session_id

    async def event_stream():
        if session_id:
            yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"
        assistant_chunks = []
        async for event in stream_advisor(request.messages, request.context):
            if event.get("type") == "token":
                assistant_chunks.append(event.get("content", ""))
            yield f"data: {json.dumps(event)}\n\n"
        if session_id:
            _append_assistant_message(session_id, "".join(assistant_chunks))
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/users/{email}/record", response_model=UserRecord)
def user_record(email: str, db: Session = Depends(get_db)):
    record = get_user_record(db, email)
    if not record:
        raise HTTPException(status_code=404, detail="User not found")
    return record


@router.get("/users/{email}/chats", response_model=list[ChatSessionOut])
def user_chats(email: str, kind: Optional[str] = None, db: Session = Depends(get_db)):
    if not get_user(db, email):
        raise HTTPException(status_code=404, detail="User not found")
    return [
        _session_out(db, chat_session, include_messages=False)
        for chat_session in get_sessions_for_user(db, email, kind)
    ]


@router.get("/chats/{session_id}", response_model=ChatSessionOut)
def chat_transcript(session_id: str, db: Session = Depends(get_db)):
    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return _session_out(db, chat_session)


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
