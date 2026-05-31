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

from api import v1 as api_v1  # noqa: E402
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


def _projection_payload(weights: dict, seed: int | None = None) -> dict:
    payload = {
        "weights": weights,
        "horizon_years": 5,
        "monthly_contribution": 500,
        "capital_on_hand": 7500,
        "goal_target": 75000,
        "generator": "stationary_bootstrap",
        "n_paths": 200,
    }
    if seed is not None:
        payload["seed"] = seed
    return payload


def _projection_reproducible_fields(projection: dict) -> dict:
    return {
        "p_success": projection["p_success"],
        "percentile_paths": projection["percentile_paths"],
    }


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
        "phone": None,
        "address": None,
        "zip_code": None,
        "token": "mock-token-auth-login@example.com",
    }

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "auth-login@example.com", "password": "correct-horse"},
    )

    assert response.status_code == 200
    assert response.json()["token"] == "mock-token-auth-login@example.com"


def test_register_persists_account_contact_fields_and_login_returns_them(test_app: FastAPI):
    client = _client(test_app)
    payload = {
        "email": "account-register@example.com",
        "password": "correct-horse",
        "name": "Account Register",
        "phone": "415-555-1212",
        "address": "123 Market Street",
        "zip_code": "94105",
    }

    response = client.post("/api/v1/auth/register", json=payload)

    assert response.status_code == 200
    assert response.json() == {
        "email": "account-register@example.com",
        "name": "Account Register",
        "phone": "415-555-1212",
        "address": "123 Market Street",
        "zip_code": "94105",
        "token": "mock-token-account-register@example.com",
    }

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "account-register@example.com", "password": "correct-horse"},
    )

    assert login_response.status_code == 200
    assert login_response.json() == response.json()


def test_account_update_updates_subset_and_persists_to_login(test_app: FastAPI):
    client = _client(test_app)
    email = "account-update@example.com"
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse",
            "name": "Original Name",
            "phone": "415-555-0000",
            "address": "1 First Street",
            "zip_code": "94104",
        },
    )
    assert register_response.status_code == 200

    update_response = client.post(
        "/api/v1/account/update",
        json={
            "user_email": email,
            "name": "Updated Name",
            "zip_code": "10001",
        },
    )

    assert update_response.status_code == 200
    assert update_response.json() == {
        "email": email,
        "name": "Updated Name",
        "phone": "415-555-0000",
        "address": "1 First Street",
        "zip_code": "10001",
        "token": f"mock-token-{email}",
    }

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "correct-horse"},
    )

    assert login_response.status_code == 200
    assert login_response.json() == update_response.json()


def test_account_update_unknown_email_returns_404(test_app: FastAPI):
    client = _client(test_app)

    response = client.post(
        "/api/v1/account/update",
        json={"user_email": "missing-account@example.com", "name": "Missing"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "User not found"


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
    assert body["portfolio"]["weights"]["method"] == "strategic"

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
    assert record["onboard_result"]["portfolio"]["weights"]["method"] == "strategic"


def test_portfolio_save_persists_edited_weights(test_app: FastAPI):
    client = _client(test_app)
    email = "portfolio-save@example.com"
    _register(client, email)

    onboard_response = client.post(
        f"/api/v1/onboard?user_email={email}",
        json=_persona("persona_greenlight.json"),
    )
    assert onboard_response.status_code == 200
    portfolio = onboard_response.json()["portfolio"]
    tickers = list(portfolio["weights"]["by_ticker"])
    first, second = tickers[:2]
    edited_by_ticker = dict(portfolio["weights"]["by_ticker"])
    shift = min(0.01, edited_by_ticker[second] / 2.0)
    edited_by_ticker[first] += shift
    edited_by_ticker[second] -= shift
    portfolio["weights"]["by_ticker"] = edited_by_ticker

    save_response = client.post(
        f"/api/v1/portfolio/save?user_email={email}",
        json={
            "portfolio": portfolio,
            "risk_summary": {
                "target_volatility_pct": 7.7,
                "estimated_max_loss_1yr_pct": 12.3,
            },
        },
    )

    assert save_response.status_code == 200
    assert save_response.json()["portfolio"]["weights"]["by_ticker"] == edited_by_ticker

    profile_response = client.get(f"/api/v1/profile/{email}")
    assert profile_response.status_code == 200
    saved = profile_response.json()
    assert saved["portfolio"]["weights"]["by_ticker"] == edited_by_ticker
    assert saved["financial_analysis"]["risk"]["target_volatility_pct"] == 7.7
    assert saved["financial_analysis"]["risk"]["estimated_max_loss_1yr_pct"] == 12.3


def test_profile_update_persists_input_and_reweights_portfolio(test_app: FastAPI):
    client = _client(test_app)
    email = "profile-update@example.com"
    _register(client, email)

    onboard_response = client.post(
        f"/api/v1/onboard?user_email={email}",
        json=_persona("persona_greenlight.json"),
    )
    assert onboard_response.status_code == 200
    before_weights = onboard_response.json()["portfolio"]["weights"]["by_ticker"]

    update_response = client.post(
        f"/api/v1/profile/update?user_email={email}",
        json={"profile_patch": {"esg_exclusions": []}},
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    after_weights = updated["portfolio"]["weights"]["by_ticker"]
    assert updated["validated_profile"]["esg_exclusions"] == []
    assert after_weights != before_weights

    profile_response = client.get(f"/api/v1/profile/{email}")
    assert profile_response.status_code == 200
    saved = profile_response.json()
    assert saved["validated_profile"]["esg_exclusions"] == []
    assert saved["portfolio"]["weights"]["by_ticker"] == after_weights

    record_response = client.get(f"/api/v1/users/{email}/record")
    assert record_response.status_code == 200
    assert record_response.json()["profile_input"]["esg_exclusions"] == []


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
    assert body["portfolio"]["weights"]["method"] == "strategic"
    assert abs(sum(body["portfolio"]["weights"]["by_ticker"].values()) - 1.0) < 1e-6
    assert abs(sum(body["portfolio"]["weights"]["by_bucket"].values()) - 1.0) < 1e-6
    assert body["portfolio"]["weights"]["by_bucket"]["gold"] < 0.35
    assert body["portfolio"]["metrics"]["expected_vol"] >= 0
    etfs = {item["ticker"]: item for item in body["portfolio"]["etfs"]}
    assert etfs["ESGV"]["name"] == "Vanguard ESG U.S. Stock ETF"
    assert etfs["ESGV"]["sleeve"] == "us_equity"
    assert etfs["ESGV"]["bucket"] == "us_total_market"
    assert etfs["ESGV"]["replacement_for"] == "VTI"
    assert etfs["ESGV"]["exclusion_reason"] == "fossil_fuels"
    assert body["bucket_plan"]["buckets"][0]["name"] == "401k employer match"
    assert body["bucket_plan"]["remaining_annual_surplus_for_taxable"] >= 0


def test_config_uses_engine_constants_and_chat_routes_exist(test_app: FastAPI):
    client = _client(test_app)
    response = client.get("/api/v1/config")

    assert response.status_code == 200
    body = response.json()
    assert body["gate"]["emergency_fund_months_required"] == constants.EF_MONTHS
    assert body["gate"]["high_apr_threshold"] == constants.HIGH_APR
    assert body["market_assumptions"]["expected_market_return"] == constants.EXPECTED_MARKET_RETURN
    risk_model = body["risk_model"]
    for name in dir(constants):
        if name.startswith("GL_"):
            assert risk_model[name.lower()] == getattr(constants, name)
    assert risk_model["gamma_min"] == constants.GAMMA_MIN
    assert risk_model["gamma_max"] == constants.GAMMA_MAX
    assert risk_model["sr_ref"] == constants.SR_REF
    assert risk_model["capacity_weights"] == constants.CAPACITY_WEIGHTS
    paths = {route.path for route in test_app.routes}
    assert "/api/v1/chat" in paths
    assert "/api/v1/advisor/chat" in paths
    assert "/api/v1/auth/register" in paths
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/account/update" in paths
    assert "/api/v1/portfolio/save" in paths
    assert "/api/v1/profile/update" in paths
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
    assert projection["seed"] == 7

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
                "by_sleeve": {"us_equity": 0.5, "core_bonds": 0.5},
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


def test_marginal_federal_rate_picks_last_dollar_bracket():
    from types import SimpleNamespace

    brackets = [
        SimpleNamespace(min_income=0.0, rate=0.10),
        SimpleNamespace(min_income=11000.0, rate=0.12),
        SimpleNamespace(min_income=44725.0, rate=0.22),
        SimpleNamespace(min_income=95375.0, rate=0.24),
    ]
    federal = SimpleNamespace(standard_deduction=14600.0, brackets=brackets)
    breakdown = SimpleNamespace(agi=80000.0, tax_rate_bundle=SimpleNamespace(federal=federal))
    # taxable = 80000 - 14600 = 65400 -> falls in the 22% bracket
    assert api_v1._marginal_federal_rate(breakdown) == 0.22
    # malformed breakdown -> None (gate falls back to deterministic default)
    assert api_v1._marginal_federal_rate(SimpleNamespace()) is None


def test_tax_report_rejects_bracket_above_one(test_app: FastAPI):
    client = _client(test_app)
    response = client.post(
        "/api/v1/tax/report",
        json={
            "positions": {
                "items": [{"ticker": "BND", "shares": 10, "avg_cost": 100, "market_value": 950}],
                "portfolio_value": 950,
                "cash": 0,
            },
            "cost_basis": {"BND": 1000},
            "filing_status": "single",
            "bracket": 1.01,
        },
    )
    assert response.status_code == 422


def test_tax_report_omitted_bracket_is_back_compatible(test_app: FastAPI):
    client = _client(test_app)
    response = client.post(
        "/api/v1/tax/report",
        json={
            "positions": {
                "items": [{"ticker": "BND", "shares": 10, "avg_cost": 100, "market_value": 950}],
                "portfolio_value": 950,
                "cash": 0,
            },
            "cost_basis": {"BND": 1000},
            "filing_status": "single",
        },
    )
    assert response.status_code == 200
    loss = response.json()["harvestable"][0]
    assert loss["estimated_tax_value"] is None
    assert loss["tax_rate_used"] is None


def test_projection_same_explicit_seed_replays_identically(test_app: FastAPI):
    client = _client(test_app)
    portfolio_response = client.post(
        "/api/v1/portfolio",
        json={"profile": _persona("persona_greenlight.json")},
    )
    assert portfolio_response.status_code == 200
    weights = portfolio_response.json()["weights"]
    payload = _projection_payload(weights, seed=12345)

    first_response = client.post("/api/v1/projection", json=payload)
    second_response = client.post("/api/v1/projection", json=payload)

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first_projection = first_response.json()
    second_projection = second_response.json()
    assert first_projection["seed"] == 12345
    assert second_projection["seed"] == 12345
    assert _projection_reproducible_fields(first_projection) == _projection_reproducible_fields(second_projection)


def test_projection_without_seed_echoes_replayable_seed(test_app: FastAPI):
    client = _client(test_app)
    portfolio_response = client.post(
        "/api/v1/portfolio",
        json={"profile": _persona("persona_greenlight.json")},
    )
    assert portfolio_response.status_code == 200
    weights = portfolio_response.json()["weights"]

    first_response = client.post("/api/v1/projection", json=_projection_payload(weights))

    assert first_response.status_code == 200
    first_projection = first_response.json()
    assert isinstance(first_projection["seed"], int)
    assert not isinstance(first_projection["seed"], bool)
    assert 0 <= first_projection["seed"] <= 2**31 - 1

    replay_response = client.post(
        "/api/v1/projection",
        json=_projection_payload(weights, seed=first_projection["seed"]),
    )

    assert replay_response.status_code == 200
    replay_projection = replay_response.json()
    assert replay_projection["seed"] == first_projection["seed"]
    assert _projection_reproducible_fields(first_projection) == _projection_reproducible_fields(replay_projection)


def test_projection_without_seed_generates_fresh_replayable_seeds(
    test_app: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
):
    generated_seeds = iter([101, 202])
    monkeypatch.setattr(api_v1.secrets, "randbelow", lambda upper: next(generated_seeds))
    client = _client(test_app)
    portfolio_response = client.post(
        "/api/v1/portfolio",
        json={"profile": _persona("persona_greenlight.json")},
    )
    assert portfolio_response.status_code == 200
    weights = portfolio_response.json()["weights"]

    first_response = client.post("/api/v1/projection", json=_projection_payload(weights))
    second_response = client.post("/api/v1/projection", json=_projection_payload(weights))

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first_projection = first_response.json()
    second_projection = second_response.json()
    assert first_projection["seed"] == 101
    assert second_projection["seed"] == 202

    for projection in (first_projection, second_projection):
        replay_response = client.post(
            "/api/v1/projection",
            json=_projection_payload(weights, seed=projection["seed"]),
        )
        assert replay_response.status_code == 200
        assert _projection_reproducible_fields(projection) == _projection_reproducible_fields(
            replay_response.json()
        )


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
        assert abs(sum(weights["by_bucket"].values()) - 1.0) < 1e-6
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


def test_portfolio_reoptimize_max_loss_is_seeded_scenario_var(test_app: FastAPI):
    client = _client(test_app)
    profile = _persona("persona_greenlight.json")

    first = client.post(
        "/api/v1/portfolio/reoptimize",
        json={"profile": profile, "risk_dial": 0.5},
    )
    second = client.post(
        "/api/v1/portfolio/reoptimize",
        json={"profile": profile, "risk_dial": 0.5},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    first_body = first.json()
    second_body = second.json()
    max_loss = first_body["risk_summary"]["estimated_max_loss_1yr_pct"]
    expected_vol = first_body["portfolio"]["metrics"]["expected_vol"]
    assert max_loss == second_body["risk_summary"]["estimated_max_loss_1yr_pct"]
    assert max_loss != round(expected_vol * 2.0 * 100.0, 1)


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
    # Risky/safe bucket weights partition the portfolio.
    assert abs(body["validation"]["sum_risky_bucket"] + body["validation"]["sum_safe_bucket"] - 1.0) < 1e-6
    # Four of six sleeves are fully risky; the bonds sleeve also contributes its
    # credit-risky buckets (EM debt, bank loans), pushing risky just above 4/6.
    assert body["validation"]["sum_risky_bucket"] > 4 / 6
    assert body["validation"]["sum_safe_bucket"] < 2 / 6
    assert abs(body["validation"]["sum_risky_within_bucket"] - 1.0) < 1e-6
    assert abs(body["validation"]["sum_safe_within_bucket"] - 1.0) < 1e-6
    assert body["validation"]["warnings"] == ["Input by_sleeve sum was 9.000000; normalized to 1.0."]
    assert abs(sum(body["weights"]["by_ticker"].values()) - 1.0) < 1e-6
    assert abs(sum(body["weights"]["by_sleeve"].values()) - 1.0) < 1e-6
    assert abs(sum(body["weights"]["by_bucket"].values()) - 1.0) < 1e-6
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
                    "cash_like": 0.3,
                    "real_assets": 0.1,
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
    # Equity + real_assets sleeves (0.7) are risky; cash_like (0.3) is the only
    # safe leg, so the risky/safe bucket split is 0.7 / 0.3.
    assert abs(body["validation"]["sum_risky_bucket"] + body["validation"]["sum_safe_bucket"] - 1.0) < 1e-6
    assert abs(body["validation"]["sum_risky_bucket"] - 0.7) < 1e-6
    assert abs(body["validation"]["sum_safe_bucket"] - 0.3) < 1e-6
    assert abs(body["validation"]["sum_risky_within_bucket"] - 1.0) < 1e-6
    assert abs(body["validation"]["sum_safe_within_bucket"] - 1.0) < 1e-6
    assert body["weights"]["by_sleeve"]["core_bonds"] == 0.0
    assert body["weights"]["by_sleeve"]["reits"] == 0.0


def test_maintenance_rebalance_quarterly_and_reprofile_refresh_active_portfolio(test_app: FastAPI):
    client = _client(test_app)
    email = "maintenance-rebalance@example.com"
    _register(client, email)

    onboard_response = client.post(
        f"/api/v1/onboard?user_email={email}",
        json=_persona("persona_greenlight.json"),
    )
    assert onboard_response.status_code == 200
    original_weights = onboard_response.json()["portfolio"]["weights"]["by_ticker"]

    deposit_response = client.post(
        "/api/v1/funding/mock/deposit",
        json={"user_email": email, "amount": 2000.0},
    )
    assert deposit_response.status_code == 200

    quarterly_response = client.post(
        "/api/v1/maintenance/rebalance",
        json={"user_email": email, "trigger": "quarterly", "fresh_data": False},
    )
    assert quarterly_response.status_code == 200
    quarterly = quarterly_response.json()
    assert quarterly["trigger"] == "quarterly"
    assert quarterly["data_source"] == "skipped"
    assert quarterly["status"] == "greenlight"
    assert quarterly["action"] in {"none", "steer", "trade"}
    assert quarterly["portfolio"]["weights"]["by_ticker"]
    if quarterly["action"] == "trade":
        assert quarterly["trades"]
        assert quarterly["fills"]
    assert quarterly["positions"]["portfolio_value"] == pytest.approx(2000.0)

    stored_after_quarterly = client.get(f"/api/v1/profile/{email}")
    assert stored_after_quarterly.status_code == 200
    assert (
        stored_after_quarterly.json()["portfolio"]["weights"]["by_ticker"]
        == quarterly["portfolio"]["weights"]["by_ticker"]
    )

    reprofile_response = client.post(
        "/api/v1/maintenance/rebalance",
        json={
            "user_email": email,
            "trigger": "reprofile",
            "fresh_data": False,
            "profile_patch": {"esg_exclusions": []},
        },
    )
    assert reprofile_response.status_code == 200
    reprofile = reprofile_response.json()
    assert reprofile["trigger"] == "reprofile"
    assert reprofile["data_source"] == "skipped"
    assert reprofile["status"] == "greenlight"
    assert reprofile["action"] in {"none", "trade"}
    assert reprofile["portfolio"]["weights"]["by_ticker"] != original_weights
    assert reprofile["positions"]["items"]

    stored_after_reprofile = client.get(f"/api/v1/profile/{email}")
    assert stored_after_reprofile.status_code == 200
    stored = stored_after_reprofile.json()
    assert stored["validated_profile"]["esg_exclusions"] == []
    assert stored["portfolio"]["weights"]["by_ticker"] == reprofile["portfolio"]["weights"]["by_ticker"]


def test_active_onboarding_returns_found_false_when_no_session(test_app: FastAPI):
    client = _client(test_app)
    email = "no-resume@example.com"
    _register(client, email)

    response = client.get(f"/api/v1/users/{email}/active-onboarding")
    assert response.status_code == 200
    assert response.json() == {"found": False, "session": None}


def test_interrupted_onboarding_is_resumable_then_cleared_on_complete(test_app: FastAPI):
    """An elicitation session persisted mid-flow must be resumable by email (transcript
    intact), and completing /onboard with its session_id must mark it complete so it is
    no longer surfaced as resumable."""
    from persistence import append_message, get_or_create_session, get_session

    client = _client(test_app)
    email = "resume@example.com"
    _register(client, email)

    # Simulate an interrupted intake: /chat persists the session + messages up front,
    # then the stream is cut off. Recreate that DB state directly (no live LLM).
    db = get_session()
    try:
        session = get_or_create_session(db, None, email, "elicitation")
        db.flush()
        session_id = session.id
        append_message(db, session_id, "user", "intake seed")
        append_message(db, session_id, "assistant", "What is your time horizon?")
        db.commit()
    finally:
        db.close()

    # Resume-by-email surfaces the in-progress session WITH its transcript.
    resume = client.get(f"/api/v1/users/{email}/active-onboarding")
    assert resume.status_code == 200
    body = resume.json()
    assert body["found"] is True
    assert body["session"]["id"] == session_id
    assert body["session"]["status"] == "active"
    assert [m["role"] for m in body["session"]["messages"]] == ["user", "assistant"]

    # Completing onboard for that session marks it complete.
    onboard = client.post(
        f"/api/v1/onboard?user_email={email}&session_id={session_id}",
        json=_persona("persona_greenlight.json"),
    )
    assert onboard.status_code == 200

    # It is no longer resumable, and the transcript records the completed status.
    resume_after = client.get(f"/api/v1/users/{email}/active-onboarding")
    assert resume_after.json() == {"found": False, "session": None}
    transcript = client.get(f"/api/v1/chats/{session_id}")
    assert transcript.status_code == 200
    assert transcript.json()["status"] == "complete"
