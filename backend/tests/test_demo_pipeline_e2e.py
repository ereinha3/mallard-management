from __future__ import annotations

import pytest
from fastapi import FastAPI

from test_api import (  # noqa: F401
    _client,
    _persona,
    _projection_payload,
    _register,
    greenlight_db,
    seeded_db_url,
    test_app,
)


def _assert_weight_map_sums_to_one(weights: dict) -> None:
    by_ticker = weights["by_ticker"]
    assert by_ticker
    assert sum(by_ticker.values()) == pytest.approx(1.0, abs=1e-6)


def _positions_from_weights(weights: dict, portfolio_value: float = 10_000.0) -> dict:
    return {
        "items": [
            {
                "ticker": ticker,
                "shares": (portfolio_value * weight) / 100.0,
                "avg_cost": 100.0,
                "market_value": portfolio_value * weight,
            }
            for ticker, weight in weights["by_ticker"].items()
            if weight > 0
        ],
        "portfolio_value": portfolio_value,
        "cash": 0.0,
    }


def test_demo_pipeline_smoke_greenlight_spine(test_app: FastAPI, monkeypatch: pytest.MonkeyPatch):
    """Demo smoke test: full offline greenlight pipeline spine."""
    monkeypatch.delenv("BROKER_PROVIDER", raising=False)
    client = _client(test_app)
    email = "demo-pipeline-e2e@example.com"
    persona = _persona("persona_greenlight.json")
    _register(client, email)

    onboard_response = client.post(f"/api/v1/onboard?user_email={email}", json=persona)
    assert onboard_response.status_code == 200
    onboard = onboard_response.json()
    assert onboard["status"] == "greenlight"
    onboard_portfolio = onboard["portfolio"]
    onboard_weights = onboard_portfolio["weights"]
    assert onboard_weights["method"] == "erc"
    _assert_weight_map_sums_to_one(onboard_weights)
    assert onboard_portfolio["universe"]["tickers"]
    assert onboard_portfolio["etfs"]

    portfolio_response = client.post("/api/v1/portfolio", json={"profile": onboard["validated_profile"]})
    assert portfolio_response.status_code == 200
    portfolio = portfolio_response.json()
    weights = portfolio["weights"]
    _assert_weight_map_sums_to_one(weights)
    assert portfolio["metrics"]["risk_contributions"]

    projection_response = client.post(
        "/api/v1/projection",
        json=_projection_payload(weights, seed=7),
    )
    assert projection_response.status_code == 200
    projection = projection_response.json()
    assert "p_success" in projection
    assert 0 <= projection["p_success"] <= 1
    assert projection["percentile_paths"]
    assert projection["percentile_paths"]["p50"]

    positions = _positions_from_weights(weights)
    rebalance_response = client.post(
        "/api/v1/rebalance",
        json={"positions": positions, "weights": weights},
    )
    assert rebalance_response.status_code == 200
    assert rebalance_response.json()["action"] in {"none", "steer", "trade"}

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
        },
    )
    assert tax_response.status_code == 200
    tax = tax_response.json()
    assert "harvestable" in tax
    assert "wash_sale_warnings" in tax

    deposit_response = client.post(
        "/api/v1/funding/mock/deposit",
        json={"user_email": email, "amount": 2000.0},
    )
    assert deposit_response.status_code == 200

    maintenance_response = client.post(
        "/api/v1/maintenance/rebalance",
        json={"user_email": email, "trigger": "quarterly", "fresh_data": False},
    )
    assert maintenance_response.status_code == 200
    maintenance = maintenance_response.json()
    assert maintenance["status"] == "greenlight"
    assert maintenance["action"] in {"none", "steer", "trade"}

    config_response = client.get("/api/v1/config")
    assert config_response.status_code == 200
    config = config_response.json()
    assert config["gate"]
    assert config["market_assumptions"]
    assert config["risk_model"]
