from __future__ import annotations

from contextlib import contextmanager
import importlib
import json
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


def _client(app: FastAPI) -> TestClient:
    client = TestClient(app)
    client._transport.portal_factory = current_thread_portal_factory
    return client


@pytest.fixture(scope="session")
def test_app(tmp_path_factory: pytest.TempPathFactory):
    db_path = tmp_path_factory.mktemp("mallard-app-db") / "mallard_app.db"
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setenv("MALLARD_DB_URL", f"sqlite:///{db_path}")
    try:
        module = importlib.import_module("main")
        yield module.app
    finally:
        monkeypatch.undo()


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


def _register(client: TestClient, email: str, password: str = "correct-horse") -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "name": "Test User"},
    )
    assert response.status_code == 200
    return response.json()


def test_register_then_login_returns_mock_token(test_app: FastAPI):
    client = _client(test_app)
    body = _register(client, "auth-login@example.com")
    assert body == {
        "email": "auth-login@example.com",
        "name": "Test User",
        "token": "mock-token-auth-login@example.com",
    }

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "auth-login@example.com", "password": "correct-horse"},
    )

    assert response.status_code == 200
    assert response.json()["token"] == "mock-token-auth-login@example.com"


def test_duplicate_register_returns_400(test_app: FastAPI):
    client = _client(test_app)
    _register(client, "duplicate@example.com")

    response = client.post(
        "/api/v1/auth/register",
        json={"email": "duplicate@example.com", "password": "correct-horse", "name": "Test User"},
    )

    assert response.status_code == 400


def test_bad_password_login_returns_401(test_app: FastAPI):
    client = _client(test_app)
    _register(client, "bad-password@example.com")

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "bad-password@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401


def test_unknown_profile_returns_no_profile(test_app: FastAPI):
    client = _client(test_app)
    response = client.get("/api/v1/profile/unknown@example.com")

    assert response.status_code == 200
    assert response.json()["status"] == "no_profile"


def test_onboard_persists_registered_user_profile_and_record(test_app: FastAPI):
    client = _client(test_app)
    email = "profile-persist@example.com"
    _register(client, email)

    response = client.post(
        f"/api/v1/onboard?user_email={email}",
        json=_persona("persona_greenlight.json"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "greenlight"
    assert body["portfolio"]["weights"]["method"] == "erc"

    profile_response = client.get(f"/api/v1/profile/{email}")
    assert profile_response.status_code == 200
    profile = profile_response.json()
    assert profile["status"] == "greenlight"
    assert profile["portfolio"]["universe"]["tickers"]

    record_response = client.get(f"/api/v1/users/{email}/record")
    assert record_response.status_code == 200
    record = record_response.json()
    assert record["account"]["email"] == email
    assert record["profile_input"]["household_income"] == body["validated_profile"]["household_income"]
    assert record["onboard_result"]["status"] == "greenlight"
    assert record["onboard_result"]["portfolio"]["weights"]["method"] == "erc"


def test_onboard_halt_persona_returns_emergency_fund_math(test_app: FastAPI):
    client = _client(test_app)
    response = client.post("/api/v1/onboard", json=_persona("persona_halt.json"))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "halt"
    assert body["gate_result"]["failed_check"] == "emergency_fund"
    assert body["gate_result"]["math"]["emergency_fund"]["target_balance"] == 9600
    assert body["gate_result"]["math"]["emergency_fund"]["shortfall"] == 8100
    assert body["portfolio"] is None


def test_onboard_greenlight_persona_returns_portfolio(test_app: FastAPI):
    client = _client(test_app)
    response = client.post("/api/v1/onboard", json=_persona("persona_greenlight.json"))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "greenlight"
    assert body["optimizer_input"]["capital_on_hand"] == 7500
    assert body["portfolio"]["weights"]["method"] == "erc"
    assert abs(sum(body["portfolio"]["weights"]["by_ticker"].values()) - 1.0) < 1e-6
    assert body["portfolio"]["metrics"]["expected_vol"] >= 0


def test_config_uses_engine_constants_and_chat_routes_exist(test_app: FastAPI):
    client = _client(test_app)
    response = client.get("/api/v1/config")

    assert response.status_code == 200
    body = response.json()
    assert body["gate"]["emergency_fund_months_required"] == constants.EF_MONTHS
    assert body["gate"]["high_apr_threshold"] == constants.HIGH_APR
    assert body["market_assumptions"]["expected_market_return"] == constants.EXPECTED_MARKET_RETURN
    paths = {route.path for route in test_app.routes}
    assert "/api/v1/chat" in paths
    assert "/api/v1/advisor/chat" in paths
    assert "/api/v1/auth/register" in paths
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/portfolio/reoptimize" in paths
    assert "/api/v1/portfolio/analyze-weights" in paths
    assert "/api/v1/users/{email}/record" in paths
    assert "/api/v1/users/{email}/chats" in paths
    assert "/api/v1/chats/{session_id}" in paths


def test_finance_endpoints_return_well_formed_shapes(test_app: FastAPI):
    client = _client(test_app)
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


def test_portfolio_reoptimize_risk_dial_returns_valid_weight_sets(test_app: FastAPI):
    client = _client(test_app)
    profile = _persona("persona_greenlight.json")
    responses = []

    for risk_dial in (0.0, 0.5, 1.0):
        response = client.post(
            "/api/v1/portfolio/reoptimize",
            json={"profile": profile, "risk_dial": risk_dial},
        )

        assert response.status_code == 200
        body = response.json()
        weights = body["portfolio"]["weights"]
        assert abs(sum(weights["by_ticker"].values()) - 1.0) < 1e-6
        assert abs(sum(weights["by_sleeve"].values()) - 1.0) < 1e-6
        assert body["portfolio"]["metrics"]["expected_vol"] >= 0
        responses.append(body)

    target_vols = [body["risk_summary"]["target_volatility_pct"] for body in responses]
    max_losses = [body["risk_summary"]["estimated_max_loss_1yr_pct"] for body in responses]
    expected_vols = [body["portfolio"]["metrics"]["expected_vol"] for body in responses]
    sleeve_weights = [body["portfolio"]["weights"]["by_sleeve"] for body in responses]
    assert target_vols[0] < target_vols[1] < target_vols[2]
    assert max_losses[0] < max_losses[1] < max_losses[2]
    assert expected_vols[0] < expected_vols[1] < expected_vols[2]
    assert sleeve_weights[0] != sleeve_weights[2]


def test_portfolio_analyze_weights_recomputes_metrics_for_edited_sleeves(test_app: FastAPI):
    client = _client(test_app)
    profile = _persona("persona_greenlight.json")
    portfolio_response = client.post("/api/v1/portfolio", json={"profile": profile})
    assert portfolio_response.status_code == 200
    sleeves = list(portfolio_response.json()["universe"]["sleeves"])
    edited_by_sleeve = {sleeve: 1.0 for sleeve in sleeves}

    response = client.post(
        "/api/v1/portfolio/analyze-weights",
        json={"profile": profile, "weights": {"by_sleeve": edited_by_sleeve}},
    )

    assert response.status_code == 200
    body = response.json()
    assert abs(body["validation"]["sum_by_ticker"] - 1.0) < 1e-6
    assert abs(body["validation"]["sum_by_sleeve"] - 1.0) < 1e-6
    assert abs(body["validation"]["sum_risky_bucket"] - (4 / 6)) < 1e-6
    assert abs(body["validation"]["sum_safe_bucket"] - (2 / 6)) < 1e-6
    assert abs(body["validation"]["sum_risky_within_bucket"] - 1.0) < 1e-6
    assert abs(body["validation"]["sum_safe_within_bucket"] - 1.0) < 1e-6
    assert body["validation"]["warnings"] == ["Input by_sleeve sum was 6.000000; normalized to 1.0."]
    assert abs(sum(body["weights"]["by_ticker"].values()) - 1.0) < 1e-6
    assert abs(sum(body["weights"]["by_sleeve"].values()) - 1.0) < 1e-6
    assert body["metrics"]["expected_vol"] >= 0
    assert body["metrics"]["expected_shortfall_95"] >= 0
    assert body["metrics"]["risk_contributions"]


def test_portfolio_analyze_weights_accepts_partial_sleeve_maps(test_app: FastAPI):
    client = _client(test_app)
    profile = _persona("persona_greenlight.json")

    response = client.post(
        "/api/v1/portfolio/analyze-weights",
        json={
            "profile": profile,
            "weights": {
                "by_sleeve": {
                    "us_equity": 0.4,
                    "intl_equity": 0.2,
                    "bonds": 0.3,
                    "gold": 0.1,
                }
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert "metrics" in body
    assert body["metrics"]["expected_vol"] >= 0
    assert body["metrics"]["expected_shortfall_95"] >= 0
    assert body["metrics"]["risk_contributions"]
    assert abs(body["validation"]["sum_by_sleeve"] - 1.0) < 1e-6
    assert abs(body["validation"]["sum_risky_bucket"] - 0.7) < 1e-6
    assert abs(body["validation"]["sum_safe_bucket"] - 0.3) < 1e-6
    assert abs(body["validation"]["sum_risky_within_bucket"] - 1.0) < 1e-6
    assert abs(body["validation"]["sum_safe_within_bucket"] - 1.0) < 1e-6
    assert body["weights"]["by_sleeve"]["tips"] == 0.0
    assert body["weights"]["by_sleeve"]["reits"] == 0.0
