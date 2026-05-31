from __future__ import annotations

from types import SimpleNamespace

import pytest


class FakeBrokerClient:
    def __init__(self) -> None:
        self.created_accounts: list[object] = []
        self.ach_relationships: list[tuple[str, object]] = []
        self.transfers: list[tuple[str, object]] = []

    def create_account(self, request: object) -> object:
        self.created_accounts.append(request)
        return SimpleNamespace(id="alpaca-acct-123")

    def create_ach_relationship_for_account(self, account_id: str, request: object) -> object:
        self.ach_relationships.append((account_id, request))
        return SimpleNamespace(id="ach-123")

    def create_transfer_for_account(self, account_id: str, request: object) -> object:
        self.transfers.append((account_id, request))
        return SimpleNamespace(id="deposit-123")


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

    deposit = service.create_deposit("alpaca-acct-123", 250.0)

    assert deposit.id == "deposit-123"
    account_id, request = client.transfers[0]
    assert account_id == "alpaca-acct-123"
    assert request.amount == 250.0
    assert str(request.direction).lower().endswith("in")
    assert str(request.timing).lower().endswith("immediate")


def test_brokerage_service_raises_cleanly_without_sdk_or_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("BROKER_API_KEY", raising=False)
    monkeypatch.delenv("BROKER_SECRET_KEY", raising=False)

    from brokerage import BrokerageService

    with pytest.raises(RuntimeError, match="alpaca-py SDK|BROKER_API_KEY|BROKER_SECRET_KEY"):
        BrokerageService()
