from __future__ import annotations

import pytest


def test_factory_returns_alpaca_broker_api_with_stored_account_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import broker_factory
    from persistence import get_or_create_investment_account, get_session

    email = "alpaca-factory@example.com"
    db = get_session()
    try:
        account = get_or_create_investment_account(db, email)
        account.alpaca_account_id = "alpaca-acct-123"
        db.commit()
    finally:
        db.close()

    created: list[str] = []

    class FakeAlpacaBrokerAPI:
        def __init__(self, account_id: str) -> None:
            created.append(account_id)

    monkeypatch.setenv("BROKER_PROVIDER", "alpaca_broker")
    monkeypatch.setattr(broker_factory, "AlpacaBrokerAPI", FakeAlpacaBrokerAPI, raising=False)

    broker = broker_factory.get_broker(email)

    assert isinstance(broker, FakeAlpacaBrokerAPI)
    assert created == ["alpaca-acct-123"]


def test_factory_errors_when_alpaca_broker_account_id_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from broker_factory import get_broker
    from persistence import get_or_create_investment_account, get_session

    email = "alpaca-factory-missing@example.com"
    db = get_session()
    try:
        get_or_create_investment_account(db, email)
        db.commit()
    finally:
        db.close()

    monkeypatch.setenv("BROKER_PROVIDER", "alpaca_broker")

    with pytest.raises(RuntimeError, match="alpaca_account_id"):
        get_broker(email)
