"""Backend-owned persistence for auth, profiles, and chat transcripts."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, create_engine, func
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

DEFAULT_DB_URL = f"sqlite:///{Path(__file__).resolve().with_name('mallard_app.db')}"
PASSWORD_ALGORITHM = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 200_000


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Profile(Base):
    __tablename__ = "profiles"

    user_email: Mapped[str] = mapped_column(ForeignKey("users.email"), primary_key=True)
    input_data: Mapped[str] = mapped_column(Text, nullable=False)
    onboard_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    def get_input(self) -> dict[str, Any]:
        return json.loads(self.input_data)

    def get_result(self) -> dict[str, Any] | None:
        return json.loads(self.onboard_result) if self.onboard_result else None


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    user_email: Mapped[str | None] = mapped_column(ForeignKey("users.email"), nullable=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    extracted_profile: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    def get_extracted_profile(self) -> dict[str, Any] | None:
        return json.loads(self.extracted_profile) if self.extracted_profile else None


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("chat_sessions.id"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class InvestmentAccount(Base):
    __tablename__ = "investment_accounts"

    user_email: Mapped[str] = mapped_column(String, primary_key=True)
    cash_available: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    cash_pending: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    broker_provider: Mapped[str] = mapped_column(String, nullable=False, default="simulator")
    alpaca_account_id: Mapped[str | None] = mapped_column(String, nullable=True)


class FundingTransaction(Base):
    __tablename__ = "funding_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_email: Mapped[str] = mapped_column(String, nullable=False)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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
        columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(investment_accounts)")
        }
        if "alpaca_account_id" not in columns:
            connection.exec_driver_sql(
                "ALTER TABLE investment_accounts ADD COLUMN alpaca_account_id VARCHAR"
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


def upsert_profile(db: Session, email: str, input_json: str, result_json: str) -> Profile:
    profile = db.query(Profile).filter(Profile.user_email == email).first()
    if profile:
        profile.input_data = input_json
        profile.onboard_result = result_json
        return profile

    profile = Profile(
        user_email=email,
        input_data=input_json,
        onboard_result=result_json,
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
        chat_session.updated_at = datetime.utcnow()
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
    message = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        seq=(next_seq + 1) if next_seq is not None else 0,
    )
    db.add(message)

    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if chat_session:
        chat_session.updated_at = datetime.utcnow()

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
