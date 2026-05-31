from __future__ import annotations

import json
from typing import Any

from llm.explain_tools import dispatch_explain_tool
from persistence import create_user, get_password_hash, get_session, get_user, upsert_profile


TOOL_NAMES = ("get_account_summary", "get_my_settings", "get_my_profile_inputs")


def _profile_input() -> dict[str, Any]:
    return {
        "household_income": 120000,
        "monthly_expenses": 4500,
        "capital_on_hand": 25000,
        "emergency_fund": 18000,
        "debts": [{"balance": 8000, "apr": 0.039, "kind": "auto"}],
        "age": 35,
        "horizon_years": 30,
        "goals": ["retirement"],
        "goal_target": 950000,
        "monthly_contribution": 1200,
        "dependents": 2,
        "filing_status": "married_joint",
        "risk_instrument_responses": [2, 2, 3, 3, 2, 3, 2, 3, 2, 3, 3, 3, 3],
        "loss_scenario_response": "hold",
        "loss_aversion_probe": 300,
        "income_stability": "stock_like",
        "universe_pref": "mix",
        "esg_exclusions": ["tobacco"],
        "sector_tilts": ["technology"],
        "confidence": {"risk": 0.85},
        "uncertainty_flags": [],
    }


def _seed_user_profile(email: str) -> None:
    profile_input = _profile_input()
    db = get_session()
    try:
        if get_user(db, email) is None:
            create_user(db, email, "Avery Account", get_password_hash("pw"))
        upsert_profile(
            db,
            email,
            json.dumps(profile_input),
            json.dumps({"small": "onboard_result"}),
        )
        db.commit()
    finally:
        db.close()


def test_get_account_summary_returns_expected_keys() -> None:
    email = "acct-summary@example.com"
    _seed_user_profile(email)

    result = dispatch_explain_tool("get_account_summary", None, email)

    assert set(result) == {
        "name",
        "email",
        "created_at",
        "cash_available",
        "cash_pending",
        "broker_provider",
    }
    assert result["name"] == "Avery Account"
    assert result["email"] == email
    assert result["created_at"]
    assert result["cash_available"] == 0.0
    assert result["cash_pending"] == 0.0
    assert result["broker_provider"] == "simulator"


def test_get_my_settings_returns_expected_keys() -> None:
    email = "acct-settings@example.com"
    _seed_user_profile(email)

    result = dispatch_explain_tool("get_my_settings", None, email)

    assert result == {
        "horizon_years": 30,
        "goal_target": 950000,
        "monthly_contribution": 1200,
        "universe_pref": "mix",
        "esg_exclusions": ["tobacco"],
        "sector_tilts": ["technology"],
    }


def test_get_my_profile_inputs_returns_expected_keys() -> None:
    email = "acct-inputs@example.com"
    _seed_user_profile(email)

    result = dispatch_explain_tool("get_my_profile_inputs", None, email)

    assert result == {
        "household_income": 120000,
        "monthly_expenses": 4500,
        "capital_on_hand": 25000,
        "emergency_fund": 18000,
        "age": 35,
        "filing_status": "married_joint",
        "dependents": 2,
        "income_stability": "stock_like",
        "debts": [{"balance": 8000, "apr": 0.039, "kind": "auto"}],
    }


def test_unknown_user_returns_graceful_error() -> None:
    for name in TOOL_NAMES:
        result = dispatch_explain_tool(name, None, "acct-unknown@example.com")
        assert isinstance(result, dict)
        assert "error" in result
