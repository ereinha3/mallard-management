from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


class FakeBrokerClient:
    def __init__(self) -> None:
        self.created_accounts: list[object] = []
        self.ach_relationships: list[tuple[str, object]] = []
        self.transfers: list[tuple[str, object]] = []
        self.journals: list[object] = []

    def create_account(self, request: object) -> object:
        self.created_accounts.append(request)
        return SimpleNamespace(id="alpaca-acct-123")

    def create_ach_relationship_for_account(self, account_id: str, request: object) -> object:
        self.ach_relationships.append((account_id, request))
        return SimpleNamespace(id="ach-123")

    def create_transfer_for_account(self, account_id: str, request: object) -> object:
        self.transfers.append((account_id, request))
        return SimpleNamespace(id="deposit-123")

    def create_journal(self, request: object) -> object:
        self.journals.append(request)
        return SimpleNamespace(id="journal-123", status="EXECUTED")


def test_create_brokerage_account_builds_sandbox_account_request() -> None:
    from brokerage import BrokerageService

    client = FakeBrokerClient()
    service = BrokerageService(client=client)

    account_id = service.create_brokerage_account(
        {"email_address": "investor@example.com", "phone_number": "555-0100"}
    )

    assert account_id == "alpaca-acct-123"
    request = client.created_accounts[0]
    assert request.contact.email_address == "investor@example.com"
    assert request.contact.phone_number == "555-0100"
    assert request.identity.given_name
    assert request.disclosures.is_control_person is False
    assert len(request.agreements) >= 1


def test_create_ach_relationship_uses_manual_bank_details() -> None:
    from brokerage import BrokerageService

    client = FakeBrokerClient()
    service = BrokerageService(client=client)

    relationship = service.create_ach_relationship(
        "alpaca-acct-123",
        {
            "nickname": "Test Checking",
            "routing_number": "121000358",
            "account_number": "123456789",
            "account_type": "CHECKING",
        },
    )

    assert relationship.id == "ach-123"
    account_id, request = client.ach_relationships[0]
    assert account_id == "alpaca-acct-123"
    assert request.bank_account_type == "CHECKING"
    assert request.bank_account_number == "123456789"
    assert request.bank_routing_number == "121000358"
    assert request.nickname == "Test Checking"


def test_create_deposit_submits_ach_transfer_request() -> None:
    from brokerage import BrokerageService

    client = FakeBrokerClient()
    service = BrokerageService(client=client)

    deposit = service.create_deposit("alpaca-acct-123", "ach-123", 250.0)

    assert deposit.id == "deposit-123"
    account_id, request = client.transfers[0]
    assert account_id == "alpaca-acct-123"
    assert request.amount == "250.0"
    assert request.relationship_id == "ach-123"
    assert str(request.direction).upper() == "INCOMING"
    assert str(request.timing).lower() == "immediate"


def test_journal_funds_builds_jnlc_from_firm_account() -> None:
    from brokerage import BrokerageService

    client = FakeBrokerClient()
    service = BrokerageService(client=client)

    journal = service.journal_funds("alpaca-acct-123", 1000.0, from_account="firm-sweep-1")

    assert journal.id == "journal-123"
    request = client.journals[0]
    assert request.from_account == "firm-sweep-1"
    assert request.to_account == "alpaca-acct-123"
    assert request.amount == 1000.0
    assert str(request.entry_type).upper().endswith("JNLC")


def test_journal_funds_requires_firm_account(monkeypatch: pytest.MonkeyPatch) -> None:
    from brokerage import BrokerageService

    monkeypatch.delenv("BROKER_FIRM_ACCOUNT_ID", raising=False)
    service = BrokerageService(client=FakeBrokerClient())
    with pytest.raises(RuntimeError, match="BROKER_FIRM_ACCOUNT_ID"):
        service.journal_funds("alpaca-acct-123", 1000.0)


def test_brokerage_service_raises_cleanly_without_sdk_or_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("BROKER_API_KEY", raising=False)
    monkeypatch.delenv("BROKER_SECRET_KEY", raising=False)

    from brokerage import BrokerageService

    with pytest.raises(RuntimeError, match="alpaca-py SDK|BROKER_API_KEY|BROKER_SECRET_KEY"):
        BrokerageService()


def test_brokerage_journal_route_journals_and_updates_local_cash(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from api import v1 as api_v1
    from persistence import Base, InvestmentAccount

    db_path = tmp_path / "brokerage_journal.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    with TestingSessionLocal() as db:
        db.add(
            InvestmentAccount(
                user_email="journal@example.com",
                cash_available=25.0,
                cash_pending=0.0,
                broker_provider="alpaca",
                alpaca_account_id="alpaca-acct-123",
            )
        )
        db.commit()

    fake_client = FakeBrokerClient()
    monkeypatch.setenv("BROKER_FIRM_ACCOUNT_ID", "firm-sweep-1")
    monkeypatch.setattr(api_v1, "get_broker_client", lambda: fake_client)

    assert any(
        route.path == "/brokerage/journal" and "POST" in route.methods
        for route in api_v1.router.routes
    )

    with TestingSessionLocal() as db:
        response = asyncio.run(
            api_v1.brokerage_journal(
                api_v1.api_models.BrokerageJournalRequest(
                    user_email="journal@example.com",
                    amount=1000.0,
                ),
                db,
            )
        )

    assert response.id == "journal-123"
    assert response.status == "EXECUTED"
    assert response.cash_available == 1025.0
    request = fake_client.journals[0]
    assert request.from_account == "firm-sweep-1"
    assert request.to_account == "alpaca-acct-123"
    assert request.amount == 1000.0
    assert str(request.entry_type).upper().endswith("JNLC")

    with TestingSessionLocal() as db:
        account = (
            db.query(InvestmentAccount)
            .filter(InvestmentAccount.user_email == "journal@example.com")
            .one()
        )
        assert account.cash_available == 1025.0
