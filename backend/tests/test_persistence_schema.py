from __future__ import annotations

import json

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

import persistence


def _sqlite_engine(tmp_path):
    return create_engine(f"sqlite:///{tmp_path / 'mallard.db'}", future=True)


def test_schema_declares_lookup_indexes_and_foreign_key_delete_rules(tmp_path):
    engine = _sqlite_engine(tmp_path)
    persistence.Base.metadata.create_all(engine)

    inspector = inspect(engine)
    indexes_by_table = {
        table_name: {index["name"] for index in inspector.get_indexes(table_name)}
        for table_name in inspector.get_table_names()
    }

    assert "ix_profiles_user_email" in indexes_by_table["profiles"]
    assert "ix_chat_sessions_user_email" in indexes_by_table["chat_sessions"]
    assert "ix_chat_messages_session_id" in indexes_by_table["chat_messages"]
    assert "ix_investment_accounts_user_email" in indexes_by_table["investment_accounts"]
    assert "ix_funding_transactions_user_email" in indexes_by_table["funding_transactions"]
    assert "ix_profiles_gate_status" in indexes_by_table["profiles"]

    foreign_keys = {
        table_name: {
            tuple(foreign_key["constrained_columns"]): foreign_key
            for foreign_key in inspector.get_foreign_keys(table_name)
        }
        for table_name in inspector.get_table_names()
    }

    assert foreign_keys["profiles"][("user_email",)]["referred_table"] == "users"
    assert foreign_keys["profiles"][("user_email",)]["options"]["ondelete"] == "CASCADE"
    assert foreign_keys["chat_sessions"][("user_email",)]["referred_table"] == "users"
    assert foreign_keys["chat_sessions"][("user_email",)]["options"]["ondelete"] == "SET NULL"
    assert foreign_keys["chat_messages"][("session_id",)]["referred_table"] == "chat_sessions"
    assert foreign_keys["chat_messages"][("session_id",)]["options"]["ondelete"] == "CASCADE"
    assert foreign_keys["funding_transactions"][("user_email",)]["referred_table"] == "investment_accounts"
    assert foreign_keys["funding_transactions"][("user_email",)]["options"]["ondelete"] == "CASCADE"


def test_schema_documents_models_columns_and_timezone_aware_timestamps():
    assert persistence.Profile.__doc__
    assert persistence.ChatSession.__doc__
    assert persistence.InvestmentAccount.__doc__
    assert persistence.Profile.__table__.c.input_data.comment
    assert persistence.Profile.__table__.c.onboard_result.comment
    assert persistence.Profile.__table__.c.gate_status.comment
    assert persistence.ChatMessage.__table__.c.seq.comment

    assert persistence.User.__table__.c.created_at.type.timezone is True
    assert persistence.User.__table__.c.updated_at.type.timezone is True
    assert persistence.utc_now().tzinfo is not None


def test_orm_relationships_are_declared():
    user_relationships = inspect(persistence.User).relationships
    profile_relationships = inspect(persistence.Profile).relationships
    session_relationships = inspect(persistence.ChatSession).relationships
    message_relationships = inspect(persistence.ChatMessage).relationships
    account_relationships = inspect(persistence.InvestmentAccount).relationships
    transaction_relationships = inspect(persistence.FundingTransaction).relationships

    assert user_relationships["profile"].mapper.class_ is persistence.Profile
    assert profile_relationships["user"].mapper.class_ is persistence.User
    assert user_relationships["chat_sessions"].mapper.class_ is persistence.ChatSession
    assert session_relationships["user"].mapper.class_ is persistence.User
    assert session_relationships["messages"].mapper.class_ is persistence.ChatMessage
    assert message_relationships["session"].mapper.class_ is persistence.ChatSession
    assert account_relationships["funding_transactions"].mapper.class_ is persistence.FundingTransaction
    assert transaction_relationships["investment_account"].mapper.class_ is persistence.InvestmentAccount


def test_create_all_and_persistence_helpers_work_end_to_end(tmp_path):
    engine = _sqlite_engine(tmp_path)
    persistence.Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    db = SessionLocal()
    try:
        email = "schema-helper@example.com"
        persistence.create_user(db, email, "Schema Helper", persistence.get_password_hash("secret"))
        profile = persistence.upsert_profile(
            db,
            email,
            json.dumps({"monthly_income": 10000}),
            json.dumps({"status": "greenlight", "gate_result": {"status": "greenlight"}}),
        )
        chat_session = persistence.get_or_create_session(db, None, email, "advisor")
        first_message = persistence.append_message(db, chat_session.id, "user", "hello")
        second_message = persistence.append_message(db, chat_session.id, "assistant", "hi")
        transaction = persistence.add_mock_deposit(db, email, 250.0)

        db.commit()
        db.refresh(profile)
        db.refresh(chat_session)
        db.refresh(transaction)

        assert profile.gate_status == "greenlight"
        assert persistence.get_profile_result(db, email)["gate_result"]["status"] == "greenlight"
        assert [message.seq for message in persistence.get_messages(db, chat_session.id)] == [0, 1]
        assert first_message.created_at is not None
        assert second_message.updated_at is not None
        assert persistence.list_sessions(db, email)[0].id == chat_session.id
        assert transaction.investment_account.cash_available == 250.0
        assert transaction.created_at is not None
        assert transaction.updated_at is not None
    finally:
        db.close()
