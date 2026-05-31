"""SQLAlchemy 2.0 schema and session helpers for the Greenlight data store."""

from __future__ import annotations

import os
import json
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional, Any

from sqlalchemy import Date, Float, ForeignKey, Integer, String, create_engine, DateTime, Text, func
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

DEFAULT_DB_URL = f"sqlite:///{Path(__file__).resolve().with_name('greenlight.db')}"


class Base(DeclarativeBase):
    pass


class Instrument(Base):
    __tablename__ = "instruments"

    ticker: Mapped[str] = mapped_column(String, primary_key=True)
    asset_class: Mapped[str | None] = mapped_column(String, nullable=True)
    bucket: Mapped[str | None] = mapped_column(String, nullable=True)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    size: Mapped[str | None] = mapped_column(String, nullable=True)
    style: Mapped[str | None] = mapped_column(String, nullable=True)
    underlying_index: Mapped[str | None] = mapped_column(String, nullable=True)
    issuer: Mapped[str | None] = mapped_column(String, nullable=True)
    quote_type: Mapped[str | None] = mapped_column(String, nullable=True)

    sleeve: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str | None] = mapped_column(String, nullable=True)
    market_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    fossil_fuels: Mapped[str | None] = mapped_column(String, nullable=True)
    weapons: Mapped[str | None] = mapped_column(String, nullable=True)
    tobacco: Mapped[str | None] = mapped_column(String, nullable=True)
    gambling: Mapped[str | None] = mapped_column(String, nullable=True)


class Price(Base):
    __tablename__ = "prices"

    ticker: Mapped[str] = mapped_column(ForeignKey("instruments.ticker"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    adj_close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[float | None] = mapped_column(Float, nullable=True)


class InstrumentMeta(Base):
    __tablename__ = "instrument_meta"

    ticker: Mapped[str] = mapped_column(ForeignKey("instruments.ticker"), primary_key=True)
    as_of: Mapped[date] = mapped_column(Date, primary_key=True)
    expense_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    aum: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_dollar_volume: Mapped[float | None] = mapped_column(Float, nullable=True)
    inception_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class MacroSeries(Base):
    __tablename__ = "macro_series"

    series_id: Mapped[str] = mapped_column(String, primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Profile(Base):
    __tablename__ = "profiles"

    user_email: Mapped[str] = mapped_column(ForeignKey("users.email"), primary_key=True)
    # Stored as JSON strings
    input_data: Mapped[str] = mapped_column(Text, nullable=False)  # UserProfileInput
    onboard_result: Mapped[str | None] = mapped_column(Text, nullable=True)  # OnboardResponse
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_input(self) -> dict[str, Any]:
        return json.loads(self.input_data)

    def get_result(self) -> Optional[dict[str, Any]]:
        return json.loads(self.onboard_result) if self.onboard_result else None


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_email: Mapped[str | None] = mapped_column(ForeignKey("users.email"), nullable=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    extracted_profile: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_extracted_profile(self) -> dict[str, Any] | None:
        return json.loads(self.extracted_profile) if self.extracted_profile else None


class ChatMessageRow(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("chat_sessions.id"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


def get_user(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def get_profile(db: Session, email: str) -> Profile | None:
    return db.query(Profile).filter(Profile.user_email == email).first()


def get_or_create_session(
    db: Session,
    session_id: str | None,
    user_email: str | None,
    kind: str,
) -> ChatSession:
    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first() if session_id else None
    if chat_session:
        if user_email and not chat_session.user_email:
            chat_session.user_email = user_email
        if chat_session.kind != kind:
            chat_session.kind = kind
        return chat_session

    chat_session = ChatSession(
        id=session_id or str(uuid.uuid4()),
        user_email=user_email,
        kind=kind,
    )
    db.add(chat_session)
    return chat_session


def append_message(db: Session, session_id: str, role: str, content: str) -> ChatMessageRow:
    next_seq = (
        db.query(func.max(ChatMessageRow.seq))
        .filter(ChatMessageRow.session_id == session_id)
        .scalar()
    )
    message = ChatMessageRow(
        session_id=session_id,
        role=role,
        content=content,
        seq=(next_seq + 1) if next_seq is not None else 0,
    )
    db.add(message)
    return message


def get_sessions_for_user(db: Session, email: str, kind: str | None = None) -> list[ChatSession]:
    query = db.query(ChatSession).filter(ChatSession.user_email == email)
    if kind:
        query = query.filter(ChatSession.kind == kind)
    return query.order_by(ChatSession.created_at.desc()).all()


def get_messages(db: Session, session_id: str) -> list[ChatMessageRow]:
    return (
        db.query(ChatMessageRow)
        .filter(ChatMessageRow.session_id == session_id)
        .order_by(ChatMessageRow.seq.asc(), ChatMessageRow.id.asc())
        .all()
    )


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _message_record(message: ChatMessageRow) -> dict[str, Any]:
    return {
        "role": message.role,
        "content": message.content,
        "seq": message.seq,
        "created_at": _dt(message.created_at),
    }


def _session_record(db: Session, chat_session: ChatSession, include_messages: bool = True) -> dict[str, Any]:
    record = {
        "id": chat_session.id,
        "kind": chat_session.kind,
        "status": chat_session.status,
        "created_at": _dt(chat_session.created_at),
        "updated_at": _dt(chat_session.updated_at),
        "extracted_profile": chat_session.get_extracted_profile(),
        "messages": [],
    }
    if include_messages:
        record["messages"] = [_message_record(message) for message in get_messages(db, chat_session.id)]
    return record


def get_user_record(db: Session, email: str) -> dict[str, Any] | None:
    user = get_user(db, email)
    if not user:
        return None

    profile = get_profile(db, email)
    sessions = get_sessions_for_user(db, email)

    return {
        "account": {
            "email": user.email,
            "name": user.name,
            "created_at": _dt(user.created_at),
        },
        "profile_input": profile.get_input() if profile else None,
        "onboard_result": profile.get_result() if profile else None,
        "chat_sessions": [_session_record(db, chat_session) for chat_session in sessions],
    }


_ENGINES: dict[str, Engine] = {}


def _db_url(db_url: str | None = None) -> str:
    return db_url or os.environ.get("GREENLIGHT_DB_URL", DEFAULT_DB_URL)


def _ensure_sqlite_parent(db_url: str) -> None:
    if not db_url.startswith("sqlite:///"):
        return
    path = db_url.removeprefix("sqlite:///")
    if path in {"", ":memory:"}:
        return
    Path(path).expanduser().parent.mkdir(parents=True, exist_ok=True)


def get_engine(db_url: str | None = None) -> Engine:
    """Return a cached SQLAlchemy engine for GREENLIGHT_DB_URL."""

    url = _db_url(db_url)
    engine = _ENGINES.get(url)
    if engine is None:
        _ensure_sqlite_parent(url)
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        engine = create_engine(url, future=True, connect_args=connect_args)
        _ENGINES[url] = engine
    return engine


def get_session(db_url: str | None = None) -> Session:
    """Return a SQLAlchemy Session bound to the configured engine."""

    return Session(get_engine(db_url))


def create_all(bind: Engine | str | None = None) -> None:
    """Create all data-layer tables."""

    engine = get_engine(bind) if isinstance(bind, str) or bind is None else bind
    Base.metadata.create_all(engine)


def drop_all(bind: Engine | str | None = None) -> None:
    """Drop all data-layer tables. Intended for test/seed setup."""

    engine = get_engine(bind) if isinstance(bind, str) or bind is None else bind
    Base.metadata.drop_all(engine)
