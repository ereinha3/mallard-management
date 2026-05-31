"""Backend-owned persistence for auth, profiles, and chat transcripts."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, create_engine, func
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

DEFAULT_DB_URL = f"sqlite:///{Path(__file__).resolve().with_name('mallard_app.db')}"
PASSWORD_ALGORITHM = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 200_000


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp for ORM defaults."""
    return datetime.now(UTC)


class User(Base):
    """Application user with login credentials and owned profile/chat rows."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        comment="Stable user email address.",
    )
    name: Mapped[str] = mapped_column(
        String,
        nullable=False,
        comment="Display name supplied at registration.",
    )
    hashed_password: Mapped[str] = mapped_column(
        String,
        nullable=False,
        comment="PBKDF2 password hash in algorithm$iterations$salt$digest format.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        comment="UTC time when the user was created.",
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=utc_now,
        onupdate=utc_now,
        comment="UTC time when the user row was last updated.",
    )

    profile: Mapped["Profile | None"] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )
    chat_sessions: Mapped[list["ChatSession"]] = relationship(
        back_populates="user",
        passive_deletes=True,
    )


class Profile(Base):
    """Latest onboarding profile JSON for a user plus queryable gate status."""

    __tablename__ = "profiles"

    user_email: Mapped[str] = mapped_column(
        ForeignKey("users.email", ondelete="CASCADE"),
        primary_key=True,
        index=True,
        comment="Owner user email; one profile row per user.",
    )
    input_data: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Raw onboarding input JSON as submitted by the API client.",
    )
    onboard_result: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Raw onboarding response JSON returned by the pipeline.",
    )
    gate_status: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
        index=True,
        comment="Denormalized responsibility-gate status derived from onboard_result.",
    )
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=utc_now,
        comment="UTC time when the profile was first stored.",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        comment="UTC time when the profile was last updated.",
    )

    user: Mapped[User] = relationship(back_populates="profile")

    def get_input(self) -> dict[str, Any]:
        return json.loads(self.input_data)

    def get_result(self) -> dict[str, Any] | None:
        return json.loads(self.onboard_result) if self.onboard_result else None


class ChatSession(Base):
    """Conversation transcript container for onboarding and advisor chats."""

    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: uuid.uuid4().hex,
        comment="Client-visible chat session identifier.",
    )
    user_email: Mapped[str | None] = mapped_column(
        ForeignKey("users.email", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Optional owner email; nullable so anonymous chats can later attach to a user.",
    )
    kind: Mapped[str] = mapped_column(
        String,
        nullable=False,
        comment="Conversation type, such as onboard or advisor.",
    )
    status: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="active",
        comment="Lifecycle status for the chat.",
    )
    extracted_profile: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Profile facts extracted from the chat transcript as raw JSON.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        comment="UTC time when the chat session was created.",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        comment="UTC time when the chat session was last updated.",
    )

    user: Mapped[User | None] = relationship(back_populates="chat_sessions")
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChatMessage.seq",
    )

    def get_extracted_profile(self) -> dict[str, Any] | None:
        return json.loads(self.extracted_profile) if self.extracted_profile else None


class ChatMessage(Base):
    """Single ordered message in a chat session transcript."""

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
        comment="Message row identifier.",
    )
    session_id: Mapped[str] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Parent chat session identifier.",
    )
    role: Mapped[str] = mapped_column(
        String,
        nullable=False,
        comment="Message author role, such as user or assistant.",
    )
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="Message body text.")
    seq: Mapped[int] = mapped_column(Integer, nullable=False, comment="Zero-based ordering within the chat session.")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        comment="UTC time when the message was stored.",
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=utc_now,
        onupdate=utc_now,
        comment="UTC time when the message row was last updated.",
    )

    session: Mapped[ChatSession] = relationship(back_populates="messages")


class InvestmentAccount(Base):
    """Cash account used by funding and trading helpers."""

    __tablename__ = "investment_accounts"

    user_email: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        index=True,
        comment="Account owner email used by broker and funding lookups.",
    )
    cash_available: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.0,
        comment="Settled cash available for trading.",
    )
    cash_pending: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.0,
        comment="Cash initiated but not yet available.",
    )
    broker_provider: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="simulator",
        comment="Broker integration backing this account.",
    )
    alpaca_account_id: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
        comment="Alpaca brokerage account identifier when using the Alpaca provider.",
    )
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=utc_now,
        comment="UTC time when the investment account was created.",
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=utc_now,
        onupdate=utc_now,
        comment="UTC time when the investment account was last updated.",
    )

    funding_transactions: Mapped[list["FundingTransaction"]] = relationship(
        back_populates="investment_account",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class FundingTransaction(Base):
    """Funding ledger entry associated with an investment account."""

    __tablename__ = "funding_transactions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
        comment="Funding ledger row identifier.",
    )
    user_email: Mapped[str] = mapped_column(
        ForeignKey("investment_accounts.user_email", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Investment account owner email for account-level funding lookups.",
    )
    provider: Mapped[str] = mapped_column(
        String,
        nullable=False,
        comment="Funding provider or stub that produced the row.",
    )
    amount: Mapped[float] = mapped_column(Float, nullable=False, comment="Funding amount in dollars.")
    status: Mapped[str] = mapped_column(String, nullable=False, comment="Provider status for the funding transaction.")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        comment="UTC time when the funding transaction was created.",
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=utc_now,
        onupdate=utc_now,
        comment="UTC time when the funding transaction was last updated.",
    )

    investment_account: Mapped[InvestmentAccount] = relationship(
        back_populates="funding_transactions",
    )


def _db_url() -> str:
    return os.environ.get("MALLARD_DB_URL", DEFAULT_DB_URL)


def _ensure_sqlite_parent(db_url: str) -> None:
    if not db_url.startswith("sqlite:///"):
        return
    path = db_url.removeprefix("sqlite:///")
    if path in {"", ":memory:"}:
        return
    Path(path).expanduser().parent.mkdir(parents=True, exist_ok=True)


def _make_engine(db_url: str) -> Engine:
    _ensure_sqlite_parent(db_url)
    connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
    return create_engine(db_url, future=True, connect_args=connect_args)


engine = _make_engine(_db_url())
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_db() -> None:
    Base.metadata.create_all(engine)
    _ensure_additive_columns(engine)


def _ensure_additive_columns(db_engine: Engine) -> None:
    if db_engine.dialect.name != "sqlite":
        return
    with db_engine.begin() as connection:
        table_columns = {
            table_name: {
                row[1]
                for row in connection.exec_driver_sql(f"PRAGMA table_info({table_name})")
            }
            for table_name in (
                "users",
                "profiles",
                "chat_messages",
                "investment_accounts",
                "funding_transactions",
            )
        }
        additive_columns = {
            "users": {"updated_at": "DATETIME"},
            "profiles": {"gate_status": "VARCHAR", "created_at": "DATETIME"},
            "chat_messages": {"updated_at": "DATETIME"},
            "investment_accounts": {
                "alpaca_account_id": "VARCHAR",
                "created_at": "DATETIME",
                "updated_at": "DATETIME",
            },
            "funding_transactions": {"updated_at": "DATETIME"},
        }
        for table_name, column_definitions in additive_columns.items():
            for column_name, column_type in column_definitions.items():
                if column_name not in table_columns.get(table_name, set()):
                    connection.exec_driver_sql(
                        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
                    )

        for index_name, table_name, column_name in (
            ("ix_profiles_user_email", "profiles", "user_email"),
            ("ix_profiles_gate_status", "profiles", "gate_status"),
            ("ix_chat_sessions_user_email", "chat_sessions", "user_email"),
            ("ix_chat_messages_session_id", "chat_messages", "session_id"),
            ("ix_investment_accounts_user_email", "investment_accounts", "user_email"),
            ("ix_funding_transactions_user_email", "funding_transactions", "user_email"),
        ):
            connection.exec_driver_sql(
                f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({column_name})"
            )


def get_session() -> Session:
    return SessionLocal()


def get_password_hash(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return f"{PASSWORD_ALGORITHM}${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_hex, hash_hex = stored.split("$", 3)
        if algorithm != PASSWORD_ALGORITHM:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
    except (TypeError, ValueError):
        return False
    return hmac.compare_digest(digest.hex(), hash_hex)


def get_user(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def create_user(db: Session, email: str, name: str, pw_hash: str) -> User:
    user = User(email=email, name=name, hashed_password=pw_hash)
    db.add(user)
    return user


def _extract_gate_status(result_json: str | None) -> str | None:
    if not result_json:
        return None
    try:
        payload = json.loads(result_json)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None

    gate_result = payload.get("gate_result")
    if isinstance(gate_result, dict) and isinstance(gate_result.get("status"), str):
        return gate_result["status"]
    status = payload.get("status")
    return status if isinstance(status, str) else None


def upsert_profile(db: Session, email: str, input_json: str, result_json: str) -> Profile:
    profile = db.query(Profile).filter(Profile.user_email == email).first()
    if profile:
        profile.input_data = input_json
        profile.onboard_result = result_json
        profile.gate_status = _extract_gate_status(result_json)
        return profile

    profile = Profile(
        user_email=email,
        input_data=input_json,
        onboard_result=result_json,
        gate_status=_extract_gate_status(result_json),
    )
    db.add(profile)
    return profile


def get_profile_result(db: Session, email: str) -> dict[str, Any] | None:
    profile = db.query(Profile).filter(Profile.user_email == email).first()
    return profile.get_result() if profile else None


def get_or_create_session(
    db: Session,
    session_id: str | None,
    user_email: str | None,
    kind: str,
) -> ChatSession:
    chat_session = (
        db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if session_id
        else None
    )
    if chat_session:
        if user_email and not chat_session.user_email:
            chat_session.user_email = user_email
        if chat_session.kind != kind:
            chat_session.kind = kind
        chat_session.updated_at = utc_now()
        return chat_session

    chat_session = ChatSession(
        id=session_id or uuid.uuid4().hex,
        user_email=user_email,
        kind=kind,
    )
    db.add(chat_session)
    return chat_session


def append_message(db: Session, session_id: str, role: str, content: str) -> ChatMessage:
    next_seq = (
        db.query(func.max(ChatMessage.seq))
        .filter(ChatMessage.session_id == session_id)
        .scalar()
    )
    pending_seqs = [
        pending.seq
        for pending in db.new
        if isinstance(pending, ChatMessage) and pending.session_id == session_id
    ]
    highest_seq = max(
        [seq for seq in [next_seq, *pending_seqs] if seq is not None],
        default=None,
    )
    message = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        seq=(highest_seq + 1) if highest_seq is not None else 0,
    )
    db.add(message)

    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if chat_session:
        chat_session.updated_at = utc_now()

    return message


def get_messages(db: Session, session_id: str) -> list[ChatMessage]:
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.seq.asc(), ChatMessage.id.asc())
        .all()
    )


def list_sessions(db: Session, email: str, kind: str | None = None) -> list[ChatSession]:
    query = db.query(ChatSession).filter(ChatSession.user_email == email)
    if kind:
        query = query.filter(ChatSession.kind == kind)
    return query.order_by(ChatSession.created_at.desc()).all()


def get_latest_active_session(
    db: Session,
    email: str,
    kind: str | None = None,
) -> ChatSession | None:
    """Most-recently-touched session still in 'active' status for this user.

    Used to resume an interrupted enrollment by email alone — no client-side
    session id required.
    """
    query = db.query(ChatSession).filter(
        ChatSession.user_email == email,
        ChatSession.status == "active",
    )
    if kind:
        query = query.filter(ChatSession.kind == kind)
    return query.order_by(ChatSession.updated_at.desc()).first()


def set_session_status(db: Session, session_id: str, status: str) -> ChatSession | None:
    """Transition a session's lifecycle status (e.g. 'active' -> 'complete')."""
    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if chat_session:
        chat_session.status = status
        chat_session.updated_at = datetime.utcnow()
    return chat_session


def get_or_create_investment_account(db: Session, email: str) -> InvestmentAccount:
    account = db.query(InvestmentAccount).filter(InvestmentAccount.user_email == email).first()
    if account:
        return account

    account = InvestmentAccount(
        user_email=email,
        cash_available=0.0,
        cash_pending=0.0,
        broker_provider="simulator",
    )
    db.add(account)
    return account


def add_mock_deposit(db: Session, email: str, amount: float) -> FundingTransaction:
    account = get_or_create_investment_account(db, email)
    transaction = FundingTransaction(
        user_email=email,
        provider="mock_ach",
        amount=float(amount),
        status="succeeded",
    )
    db.add(transaction)
    account.cash_available += float(amount)
    return transaction


def update_investment_account_cash(db: Session, email: str, cash_available: float) -> InvestmentAccount:
    account = get_or_create_investment_account(db, email)
    account.cash_available = max(0.0, float(cash_available))
    return account


def set_alpaca_account_id(db: Session, email: str, account_id: str) -> InvestmentAccount:
    account = get_or_create_investment_account(db, email)
    account.alpaca_account_id = account_id
    return account


init_db()
