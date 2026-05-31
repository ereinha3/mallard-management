from __future__ import annotations

from contextlib import contextmanager
import json
import inspect
import sys
from pathlib import Path

import anyio
import pytest
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
ENGINE_DIR = ROOT / "engine"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ENGINE_DIR) not in sys.path:
    sys.path.append(str(ENGINE_DIR))

from main import app  # noqa: E402
from data.seed import seed_database  # noqa: E402
from schemas import constants  # noqa: E402


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


def _client() -> TestClient:
    client = TestClient(app)
    client._transport.portal_factory = current_thread_portal_factory
    return client


@pytest.fixture(scope="session")
def seeded_db_url(tmp_path_factory: pytest.TempPathFactory) -> str:
    db_path = tmp_path_factory.mktemp("greenlight-backend-db") / "greenlight.db"
    db_url = f"sqlite:///{db_path}"
    seed_database(db_url)
    return db_url


@pytest.fixture(autouse=True)
def greenlight_db(monkeypatch: pytest.MonkeyPatch, seeded_db_url: str) -> None:
    monkeypatch.setenv("GREENLIGHT_DB_URL", seeded_db_url)


def _persona(name: str) -> dict:
    return json.loads((ENGINE_DIR / "fixtures" / name).read_text())


def test_onboard_halt_persona_returns_emergency_fund_math():
    client = _client()
    response = client.post("/api/v1/onboard", json=_persona("persona_halt.json"))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "halt"
    assert body["gate_result"]["failed_check"] == "emergency_fund"
    assert body["gate_result"]["math"]["emergency_fund"]["target_balance"] == 9600
    assert body["gate_result"]["math"]["emergency_fund"]["shortfall"] == 8100
    assert body["portfolio"] is None


def test_onboard_greenlight_persona_returns_portfolio():
    client = _client()
    response = client.post("/api/v1/onboard", json=_persona("persona_greenlight.json"))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "greenlight"
    assert body["optimizer_input"]["capital_on_hand"] == 7500
    assert body["portfolio"]["weights"]["method"] == "erc"
    assert abs(sum(body["portfolio"]["weights"]["by_ticker"].values()) - 1.0) < 1e-6
    assert body["portfolio"]["metrics"]["expected_vol"] >= 0


def test_config_uses_engine_constants_and_chat_routes_exist():
    client = _client()
    response = client.get("/api/v1/config")

    assert response.status_code == 200
    body = response.json()
    assert body["gate"]["emergency_fund_months_required"] == constants.EF_MONTHS
    assert body["gate"]["high_apr_threshold"] == constants.HIGH_APR
    assert body["market_assumptions"]["expected_market_return"] == constants.EXPECTED_MARKET_RETURN
    paths = {route.path for route in app.routes}
    assert "/api/v1/chat" in paths
    assert "/api/v1/advisor/chat" in paths


def test_finance_endpoints_return_well_formed_shapes():
    client = _client()
    portfolio_response = client.post(
        "/api/v1/portfolio",
        json={"profile": _persona("persona_greenlight.json")},
    )
    assert portfolio_response.status_code == 200
    portfolio = portfolio_response.json()
    weights = portfolio["weights"]
    assert portfolio["universe"]["tickers"]
    assert weights["by_sleeve"]
    assert portfolio["metrics"]["risk_contributions"]

    projection_response = client.post(
        "/api/v1/projection",
        json={
            "weights": weights,
            "horizon_years": 5,
            "monthly_contribution": 500,
            "capital_on_hand": 7500,
            "goal_target": 75000,
            "generator": "stationary_bootstrap",
            "seed": 7,
            "n_paths": 200,
        },
    )
    assert projection_response.status_code == 200
    projection = projection_response.json()
    assert 0 <= projection["p_success"] <= 1
    assert len(projection["percentile_paths"]["p50"]) == 5

    rebalance_response = client.post(
        "/api/v1/rebalance",
        json={
            "positions": {
                "items": [
                    {"ticker": "VTI", "shares": 5, "avg_cost": 100, "market_value": 500},
                    {"ticker": "BND", "shares": 5, "avg_cost": 100, "market_value": 500},
                ],
                "portfolio_value": 1000,
                "cash": 0,
            },
            "weights": {
                "by_ticker": {"VTI": 0.5, "BND": 0.5},
                "by_sleeve": {"us_equity": 0.5, "bonds": 0.5},
                "blend_alpha": 0.5,
                "method": "erc",
            },
        },
    )
    assert rebalance_response.status_code == 200
    assert rebalance_response.json()["action"] == "none"

    tax_response = client.post(
        "/api/v1/tax/report",
        json={
            "positions": {
                "items": [
                    {"ticker": "BND", "shares": 10, "avg_cost": 100, "market_value": 950},
                    {"ticker": "GLD", "shares": 5, "avg_cost": 200, "market_value": 1200},
                ],
                "portfolio_value": 2150,
                "cash": 0,
            },
            "cost_basis": {"BND": 1000, "GLD": 1000},
            "filing_status": "single",
            "bracket": 0.22,
        },
    )
    assert tax_response.status_code == 200
    tax = tax_response.json()
    assert tax["harvestable"][0]["ticker"] == "BND"
    assert tax["wash_sale_warnings"][0]["suggested_replacement"] != "BND"
