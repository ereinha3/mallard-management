"""Alpaca Broker API account lifecycle helpers.

All alpaca-py imports are lazy so offline tests can inject fake clients.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Mapping


# SANDBOX TEST FIXTURES. Override these in production with real KYC/profile data.
SANDBOX_IDENTITY = {
    "given_name": "Jane",
    "family_name": "Investor",
    "date_of_birth": date(1990, 1, 1),
    "tax_id": "666-55-4321",
    "tax_id_type": "USA_SSN",
    "country_of_citizenship": "USA",
    "country_of_birth": "USA",
    "country_of_tax_residence": "USA",
    "funding_source": ["employment_income"],
}
SANDBOX_CONTACT = {
    "email_address": "sandbox-investor@example.com",
    "phone_number": "555-0100",
    "street_address": ["20 N San Mateo Dr"],
    "city": "San Mateo",
    "state": "CA",
    "postal_code": "94401",
    "country": "USA",
}
SANDBOX_DISCLOSURES = {
    "is_control_person": False,
    "is_affiliated_exchange_or_finra": False,
    "is_politically_exposed": False,
    "immediate_family_exposed": False,
}
SANDBOX_AGREEMENT = {
    "agreement": "margin_agreement",
    "signed_at": datetime(2024, 1, 1, 0, 0, 0),
    "ip_address": "127.0.0.1",
}


class _Request:
    """Tiny request/model object used only when tests inject a fake client."""

    def __init__(self, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            setattr(self, key, value)


@dataclass(frozen=True)
class _BrokerSDK:
    broker_client: Any
    create_account_request: Any
    contact: Any
    identity: Any
    disclosures: Any
    agreement: Any
    create_ach_relationship_request: Any
    create_ach_transfer_request: Any


def _load_broker_sdk() -> _BrokerSDK:
    try:
        from alpaca.broker.client import BrokerClient
        from alpaca.broker.requests import (
            CreateACHRelationshipRequest,
            CreateACHTransferRequest,
            CreateAccountRequest,
        )
        try:
            from alpaca.broker.models import Agreement, Contact, Disclosures, Identity
        except ImportError:
            from alpaca.broker.requests import Agreement, Contact, Disclosures, Identity
    except ImportError as exc:
        raise RuntimeError(
            "alpaca-py SDK is required for Alpaca brokerage account lifecycle calls. "
            "Install alpaca-py in the runtime environment to enable this service."
        ) from exc

    return _BrokerSDK(
        broker_client=BrokerClient,
        create_account_request=CreateAccountRequest,
        contact=Contact,
        identity=Identity,
        disclosures=Disclosures,
        agreement=Agreement,
        create_ach_relationship_request=CreateACHRelationshipRequest,
        create_ach_transfer_request=CreateACHTransferRequest,
    )


def get_broker_client() -> Any:
    sdk = _load_broker_sdk()
    api_key = os.environ.get("BROKER_API_KEY")
    secret_key = os.environ.get("BROKER_SECRET_KEY")
    if not api_key or not secret_key:
        raise RuntimeError("BROKER_API_KEY and BROKER_SECRET_KEY are required for Alpaca Broker API.")
    return sdk.broker_client(api_key, secret_key, sandbox=True)


class BrokerageService:
    """Account lifecycle service for Alpaca Broker API sandbox/production wiring."""

    def __init__(self, client: Any | None = None) -> None:
        if client is None:
            self._sdk = _load_broker_sdk()
            api_key = os.environ.get("BROKER_API_KEY")
            secret_key = os.environ.get("BROKER_SECRET_KEY")
            if not api_key or not secret_key:
                raise RuntimeError(
                    "BROKER_API_KEY and BROKER_SECRET_KEY are required for Alpaca Broker API."
                )
            self._client = self._sdk.broker_client(api_key, secret_key, sandbox=True)
        else:
            self._client = client
            self._sdk = None

    def create_brokerage_account(self, profile_or_contact: Mapping[str, Any]) -> str:
        contact_payload = {**SANDBOX_CONTACT, **dict(profile_or_contact)}
        request = self._create_account_request(
            contact=self._model("contact", contact_payload),
            identity=self._model("identity", SANDBOX_IDENTITY),
            disclosures=self._model("disclosures", SANDBOX_DISCLOSURES),
            agreements=[self._model("agreement", SANDBOX_AGREEMENT)],
        )
        account = self._client.create_account(request)
        return str(account.id)

    def create_ach_relationship(self, account_id: str, bank: Mapping[str, Any]) -> Any:
        # Sandbox uses manual bank details; production should link accounts with Plaid.
        request = self._create_ach_relationship_request(
            nickname=bank.get("nickname"),
            bank_routing_number=bank.get("routing_number"),
            bank_account_number=bank.get("account_number"),
            bank_account_type=self._bank_account_type(str(bank.get("account_type", "CHECKING"))),
        )
        return self._client.create_ach_relationship_for_account(account_id, request)

    def create_deposit(self, account_id: str, amount: float) -> Any:
        request = self._create_ach_transfer_request(
            amount=float(amount),
            direction=self._transfer_direction_in(),
            timing=self._transfer_timing_immediate(),
        )
        return self._client.create_transfer_for_account(account_id, request)

    def _model(self, name: str, payload: Mapping[str, Any]) -> Any:
        if self._sdk is None:
            return _Request(**dict(payload))
        model = getattr(self._sdk, name)
        return model(**dict(payload))

    def _create_account_request(self, **kwargs: Any) -> Any:
        if self._sdk is None:
            return _Request(**kwargs)
        return self._sdk.create_account_request(**kwargs)

    def _create_ach_relationship_request(self, **kwargs: Any) -> Any:
        if self._sdk is None:
            return _Request(**kwargs)
        return self._sdk.create_ach_relationship_request(**kwargs)

    def _create_ach_transfer_request(self, **kwargs: Any) -> Any:
        if self._sdk is None:
            return _Request(**kwargs)
        return self._sdk.create_ach_transfer_request(**kwargs)

    def _bank_account_type(self, account_type: str) -> Any:
        return account_type

    def _transfer_direction_in(self) -> Any:
        return "IN"

    def _transfer_timing_immediate(self) -> Any:
        return "IMMEDIATE"
