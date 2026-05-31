from __future__ import annotations

from contextlib import contextmanager
import importlib
import inspect
import sys
from pathlib import Path

import anyio
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
ENGINE_DIR = ROOT / "engine"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ENGINE_DIR) not in sys.path:
    sys.path.append(str(ENGINE_DIR))

from data.seed import seed_database  # noqa: E402


class CurrentThreadPortal:
    def call(self, func, *args):
        result = func(*args)
        if inspect.isawaitable(result):

            async def runner():
                return await result

            return anyio.run(runner)
        return result


@contextmanager
def current_thread_portal_factory():
    yield CurrentThreadPortal()


def _client(app: FastAPI) -> TestClient:
    client = TestClient(app)
    client._transport.portal_factory = current_thread_portal_factory
    return client


@pytest.fixture(scope="session")
def test_app(tmp_path_factory: pytest.TempPathFactory):
    db_path = tmp_path_factory.mktemp("mallard-trading-app-db") / "mallard_app.db"
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setenv("MALLARD_DB_URL", f"sqlite:///{db_path}")
    try:
        module = importlib.import_module("main")
        yield module.app
    finally:
        monkeypatch.undo()


@pytest.fixture(scope="session")
def seeded_db_url(tmp_path_factory: pytest.TempPathFactory) -> str:
    db_path = tmp_path_factory.mktemp("greenlight-trading-db") / "greenlight.db"
    db_url = f"sqlite:///{db_path}"
    seed_database(db_url)
    return db_url


@pytest.fixture(autouse=True)
def greenlight_db(monkeypatch: pytest.MonkeyPatch, seeded_db_url: str) -> None:
    monkeypatch.setenv("GREENLIGHT_DB_URL", seeded_db_url)
    monkeypatch.delenv("BROKER_PROVIDER", raising=False)


def _weights() -> dict:
    return {
        "by_ticker": {"VTI": 0.6, "BND": 0.4},
        "by_sleeve": {"us_equity": 0.6, "core_bonds": 0.4},
        "blend_alpha": 0.6,
        "method": "erc",
    }


def test_mock_deposit_creates_account_and_increments_cash(test_app: FastAPI):
    client = _client(test_app)
    email = "funding-ledger@example.com"

    response = client.post(
        "/api/v1/funding/mock/deposit",
        json={"user_email": email, "amount": 1250.0},
    )

    assert response.status_code == 200
    transaction = response.json()
    assert transaction["user_email"] == email
    assert transaction["provider"] == "mock_ach"
    assert transaction["amount"] == 1250.0
    assert transaction["status"] == "succeeded"

    account_response = client.get(f"/api/v1/funding/account/{email}")
    assert account_response.status_code == 200
    account = account_response.json()
    assert account["user_email"] == email
    assert account["cash_available"] == 1250.0
    assert account["cash_pending"] == 0.0
    assert account["broker_provider"] == "simulator"


def test_brokerage_account_route_persists_alpaca_account_id(
    test_app: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
):
    from api import v1 as api_v1

    class FakeBrokerClient:
        def create_account(self, request: object) -> object:
            assert request.contact.email_address == "brokerage-route@example.com"
            return type("Account", (), {"id": "alpaca-acct-route"})()

    monkeypatch.setattr(api_v1, "get_broker_client", lambda: FakeBrokerClient())
    client = _client(test_app)

    response = client.post(
        "/api/v1/brokerage/account",
        json={"user_email": "brokerage-route@example.com"},
    )

    assert response.status_code == 200
    assert response.json()["alpaca_account_id"] == "alpaca-acct-route"

    account_response = client.get("/api/v1/funding/account/brokerage-route@example.com")
    assert account_response.status_code == 200
    assert account_response.json()["alpaca_account_id"] == "alpaca-acct-route"


def test_execution_preview_sizes_buys_against_available_cash(test_app: FastAPI):
    client = _client(test_app)
    email = "execution-preview@example.com"
    client.post("/api/v1/funding/mock/deposit", json={"user_email": email, "amount": 1000.0})

    response = client.post(
        "/api/v1/execution/preview",
        json={"user_email": email, "weights": _weights()},
    )

    assert response.status_code == 200
    plan = response.json()
    assert plan["method"] == "lump_sum"
    assert {buy["ticker"] for buy in plan["buys"]} == {"VTI", "BND"}
    assert sum(buy["dollars"] for buy in plan["buys"]) == pytest.approx(1000.0)
    assert all(buy["shares"] > 0 for buy in plan["buys"])


def test_execution_submit_via_simulator_returns_fills_and_positions(test_app: FastAPI):
    client = _client(test_app)
    email = "execution-submit@example.com"
    client.post("/api/v1/funding/mock/deposit", json={"user_email": email, "amount": 1000.0})

    response = client.post(
        "/api/v1/execution/submit",
        json={"user_email": email, "weights": _weights()},
    )

    assert response.status_code == 200
    body = response.json()
    assert {fill["ticker"] for fill in body["fills"]} == {"VTI", "BND"}
    positions = body["positions"]
    assert {item["ticker"] for item in positions["items"]} == {"VTI", "BND"}
    invested = sum(item["market_value"] for item in positions["items"])
    assert invested + positions["cash"] == pytest.approx(positions["portfolio_value"])
    assert positions["portfolio_value"] == pytest.approx(1000.0)

    positions_response = client.get(f"/api/v1/positions/{email}")
    assert positions_response.status_code == 200
    assert positions_response.json() == positions


def test_rebalance_submit_executes_sell_and_buy_trades(test_app: FastAPI):
    client = _client(test_app)
    email = "rebalance-submit-trade@example.com"
    client.post("/api/v1/funding/mock/deposit", json={"user_email": email, "amount": 1000.0})
    initial = client.post(
        "/api/v1/execution/submit",
        json={"user_email": email, "weights": _weights()},
    )
    assert initial.status_code == 200

    response = client.post(
        "/api/v1/execution/rebalance/submit",
        json={
            "user_email": email,
            "weights": {
                "by_ticker": {"VTI": 0.4, "BND": 0.6},
                "by_sleeve": {"us_equity": 0.4, "core_bonds": 0.6},
                "blend_alpha": 0.4,
                "method": "erc",
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "trade"
    assert {(trade["ticker"], trade["side"]) for trade in body["trades"]} == {
        ("VTI", "sell"),
        ("BND", "buy"),
    }
    assert [fill["ticker"] for fill in body["fills"]] == ["VTI", "BND"]
    positions = body["positions"]
    by_ticker = {item["ticker"]: item for item in positions["items"]}
    assert by_ticker["VTI"]["market_value"] == pytest.approx(400.0)
    assert by_ticker["BND"]["market_value"] == pytest.approx(600.0)
    assert positions["portfolio_value"] == pytest.approx(1000.0)


def test_rebalance_submit_returns_balanced_decision_without_trades(test_app: FastAPI):
    client = _client(test_app)
    email = "rebalance-submit-none@example.com"
    client.post("/api/v1/funding/mock/deposit", json={"user_email": email, "amount": 1000.0})
    initial = client.post(
        "/api/v1/execution/submit",
        json={"user_email": email, "weights": _weights()},
    )
    assert initial.status_code == 200

    response = client.post(
        "/api/v1/execution/rebalance/submit",
        json={"user_email": email, "weights": _weights()},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "none"
    assert body["trades"] == []
    assert body["fills"] == []
    assert body["positions"] == initial.json()["positions"]


def test_alpaca_adapter_raises_cleanly_without_sdk_or_credentials(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("ALPACA_API_KEY", raising=False)
    monkeypatch.delenv("ALPACA_SECRET_KEY", raising=False)

    from broker.alpaca import AlpacaBroker

    with pytest.raises(RuntimeError, match="alpaca-py SDK|ALPACA_API_KEY|ALPACA_SECRET_KEY"):
        AlpacaBroker()
