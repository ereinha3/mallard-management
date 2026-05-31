from __future__ import annotations

from contextlib import contextmanager
import importlib
import inspect
import json
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
    db_path = tmp_path_factory.mktemp("mallard-e2e-app-db") / "mallard_app.db"
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setenv("MALLARD_DB_URL", f"sqlite:///{db_path}")
    try:
        module = importlib.import_module("main")
        yield module.app
    finally:
        monkeypatch.undo()


@pytest.fixture(scope="session")
def seeded_db_url(tmp_path_factory: pytest.TempPathFactory) -> str:
    db_path = tmp_path_factory.mktemp("greenlight-e2e-db") / "greenlight.db"
    db_url = f"sqlite:///{db_path}"
    seed_database(db_url)
    return db_url


@pytest.fixture(autouse=True)
def greenlight_db(monkeypatch: pytest.MonkeyPatch, seeded_db_url: str) -> None:
    monkeypatch.setenv("GREENLIGHT_DB_URL", seeded_db_url)


def _fixture(name: str) -> dict:
    return json.loads((ENGINE_DIR / "fixtures" / name).read_text())


def _register(client: TestClient, email: str, password: str = "correct-horse") -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "name": "E2E User"},
    )
    assert response.status_code == 200
    return response.json()


def test_full_greenlight_pipeline_and_halt_gate(test_app: FastAPI):
    client = _client(test_app)
    email = "e2e-pipeline@example.com"
    password = "correct-horse"
    persona_greenlight = _fixture("persona_greenlight.json")
    persona_halt = _fixture("persona_halt.json")
    positions_demo = _fixture("positions_demo.json")
    cost_basis = positions_demo["cost_basis"]

    registration = _register(client, email, password)
    assert registration["email"] == email

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_response.status_code == 200
    assert login_response.json()["token"] == f"mock-token-{email}"

    onboard_response = client.post(
        f"/api/v1/onboard?user_email={email}",
        json=persona_greenlight,
    )
    assert onboard_response.status_code == 200
    onboard = onboard_response.json()
    assert onboard["status"] == "greenlight"
    portfolio = onboard["portfolio"]
    weights = portfolio["weights"]
    assert abs(sum(weights["by_ticker"].values()) - 1.0) < 1e-6
    assert weights["by_sleeve"]
    assert weights["method"] == "erc"
    assert portfolio["metrics"]["expected_vol"] > 0

    portfolio_response = client.post(
        "/api/v1/portfolio",
        json={"profile": persona_greenlight},
    )
    assert portfolio_response.status_code == 200
    assert portfolio_response.json() == portfolio

    projection_response = client.post(
        "/api/v1/projection",
        json={
            "weights": weights,
            "horizon_years": persona_greenlight["horizon_years"],
            "monthly_contribution": 500,
            "capital_on_hand": persona_greenlight["capital_on_hand"],
            "goal_target": persona_greenlight["goal_target"],
            "generator": "stationary_bootstrap",
            "n_paths": 2000,
            "seed": 7,
        },
    )
    assert projection_response.status_code == 200
    projection = projection_response.json()
    assert 0 <= projection["p_success"] <= 1
    assert projection["percentile_paths"]["p50"]
    assert projection["median_terminal"] > 0

    rebalance_response = client.post(
        "/api/v1/rebalance",
        json={"positions": positions_demo, "weights": weights},
    )
    assert rebalance_response.status_code == 200
    assert rebalance_response.json()["action"] in {"none", "steer", "trade"}

    tax_response = client.post(
        "/api/v1/tax/report",
        json={
            "positions": positions_demo,
            "cost_basis": cost_basis,
            "filing_status": "single",
        },
    )
    assert tax_response.status_code == 200
    tax = tax_response.json()
    assert tax["harvestable"]
    first_harvestable = tax["harvestable"][0]
    assert tax["wash_sale_warnings"][0]["ticker"] == first_harvestable["ticker"]
    assert tax["wash_sale_warnings"][0]["suggested_replacement"] != first_harvestable["ticker"]

    profile_response = client.get(f"/api/v1/profile/{email}")
    assert profile_response.status_code == 200
    assert profile_response.json()["status"] == "greenlight"

    halt_response = client.post("/api/v1/onboard", json=persona_halt)
    assert halt_response.status_code == 200
    halt = halt_response.json()
    assert halt["status"] == "halt"
    assert halt["gate_result"]["math"]["emergency_fund"]["target_balance"] is not None
