"""SQLAlchemy 2.0 schema and session helpers for the Greenlight data store."""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import Optional

from sqlalchemy import Date, Float, ForeignKey, String, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

DEFAULT_DB_URL = "sqlite:///engine/data/greenlight.db"


class Base(DeclarativeBase):
    pass


class Instrument(Base):
    __tablename__ = "instruments"

    ticker: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
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
        is_sqlite = url.startswith("sqlite")
        # `timeout` is the sqlite3 driver busy-timeout (seconds): a blocked
        # connection waits for the lock to clear instead of immediately raising
        # "database is locked".
        connect_args = {"check_same_thread": False, "timeout": 30.0} if is_sqlite else {}
        engine = create_engine(url, future=True, connect_args=connect_args)
        if is_sqlite:
            _enable_sqlite_concurrency(engine)
        _ENGINES[url] = engine
    return engine


def _enable_sqlite_concurrency(engine: Engine) -> None:
    """Enable WAL + busy_timeout so concurrent readers don't hit lock errors.

    The default rollback journal makes a read fail with "database is locked"
    whenever any connection holds a write lock. WAL lets readers proceed
    alongside a writer, and busy_timeout makes the rare contention wait rather
    than error — important because every projection scans the full prices table.
    """

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.execute("PRAGMA synchronous=NORMAL")
        finally:
            cursor.close()


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

