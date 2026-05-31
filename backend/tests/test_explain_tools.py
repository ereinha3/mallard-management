from __future__ import annotations

import importlib
import json
import os
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

from data.seed import seed_database  # noqa: E402


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
ENGINE_DIR = ROOT / "engine"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ENGINE_DIR) not in sys.path:
    sys.path.append(str(ENGINE_DIR))


def _persona(name: str) -> dict:
    return json.loads((ENGINE_DIR / "fixtures" / name).read_text())


@pytest.fixture(scope="session")
def seeded_db_url(tmp_path_factory: pytest.TempPathFactory) -> str:
    db_path = tmp_path_factory.mktemp("greenlight-explain-db") / "greenlight.db"
    db_url = f"sqlite:///{db_path}"
    seed_database(db_url)
    return db_url


@pytest.fixture(autouse=True)
def greenlight_db(monkeypatch: pytest.MonkeyPatch, seeded_db_url: str) -> None:
    monkeypatch.setenv("GREENLIGHT_DB_URL", seeded_db_url)


def _stored_profile(email: str, persona_name: str = "persona_greenlight.json") -> None:
    from api.v1 import _run_pipeline
    from models import UserProfileInput
    from persistence import (
        create_user,
        get_password_hash,
        get_session,
        init_db,
        upsert_profile,
    )

    init_db()
    profile_input = UserProfileInput.model_validate(_persona(persona_name))
    onboard = _run_pipeline(profile_input)
    db = get_session()
    try:
        create_user(db, email, "Explain User", get_password_hash("correct-horse"))
        upsert_profile(
            db,
            email,
            profile_input.model_dump_json(),
            onboard.model_dump_json(),
        )
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def stored_email() -> str:
    email = f"explain-{uuid.uuid4().hex}@example.com"
    _stored_profile(email)
    return email


def test_get_my_gate_status_uses_stored_onboard_response():
    from llm.explain_tools import get_my_gate_status

    email = f"explain-halt-{uuid.uuid4().hex}@example.com"
    _stored_profile(email, "persona_halt.json")
    result = get_my_gate_status(email)

    assert result["status"] == "halt"
    assert result["failed_check"] == "emergency_fund"
    assert result["checks"]
    assert result["math"] is not None
    assert result["math"]["emergency_fund"]["shortfall"] > 0


def test_explain_portfolio_returns_weights_risk_and_exclusions(stored_email: str):
    from llm.explain_tools import explain_portfolio

    result = explain_portfolio(stored_email)

    assert result["method"] == "strategic"
    assert abs(sum(result["weights"]["by_ticker"].values()) - 1.0) < 1e-6
    assert result["blend"]["blend_alpha"] >= 0
    assert result["expected_vol"] >= 0
    assert result["risk_contributions"]
    assert isinstance(result["excluded"], list)


def test_explain_risk_fusion_surfaces_internals(stored_email: str):
    from llm.explain_tools import explain_risk_fusion

    result = explain_risk_fusion(stored_email)

    assert {signal["name"] for signal in result["signals"]} >= {"gl13", "dohmen"}
    assert result["q"] >= 0
    assert result["i_squared"] >= 0
    assert result["tau_squared"] >= 0
    assert result["combined_var"] > 0
    assert 0 <= result["signal_confidence"] <= 1
    assert result["gamma_band"]["mid"] > 0


def test_get_projection_percentiles_is_seeded_and_stable(stored_email: str):
    from llm.explain_tools import get_projection_percentiles

    first = get_projection_percentiles(stored_email, horizon_years=3, n_paths=200, seed=17)
    second = get_projection_percentiles(stored_email, horizon_years=3, n_paths=200, seed=17)

    assert first == second
    assert first["seed"] == 17
    assert first["n_paths"] == 200
    assert len(first["percentile_paths"]["p50"]) == 3
    assert 0 <= first["p_success"] <= 1


def test_citation_map_covers_supported_methods():
    from llm.explain_tools import CITATION_METHODS, get_method_citations

    expected = {
        "llm_boundary",
        "risk_tolerance",
        "risk_capacity",
        "optimization",
        "monte_carlo",
        "backtest",
        "taxes",
    }

    assert expected <= set(CITATION_METHODS)
    for method in expected:
        result = get_method_citations(method)
        assert result["method"] == method
        assert result["summary"]
        assert result["citations"]
        assert all({"title", "authors", "year", "relevance"} <= set(c) for c in result["citations"])


def _function_call_chunk(name: str, args: dict) -> SimpleNamespace:
    function_call = SimpleNamespace(name=name, args=args)
    part = SimpleNamespace(function_call=function_call)
    content = SimpleNamespace(role="model", parts=[part])
    candidate = SimpleNamespace(content=content)
    return SimpleNamespace(text="", candidates=[candidate])


def _text_chunk(text: str) -> SimpleNamespace:
    return SimpleNamespace(text=text, candidates=[])


def test_advisor_dispatches_tool_with_server_side_user_and_feeds_response(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "test-key")

    advisor = importlib.import_module("llm.advisor")
    calls: list[tuple[str, dict, str | None]] = []
    captured_contents: list[list] = []

    def fake_dispatch(name: str, args: dict, user_email: str | None) -> dict:
        calls.append((name, args, user_email))
        return {"server_email_used": user_email, "sentinel": 42}

    class FakeModels:
        def __init__(self) -> None:
            self.call_count = 0

        def generate_content_stream(self, **kwargs):
            self.call_count += 1
            captured_contents.append(kwargs["contents"])
            if self.call_count == 1:
                return iter(
                    [
                        _function_call_chunk(
                            "explain_portfolio",
                            {"method": "erc", "user_email": "attacker@example.com"},
                        )
                    ]
                )
            return iter([_text_chunk("grounded answer")])

    fake_client = SimpleNamespace(models=FakeModels())
    monkeypatch.setattr(advisor.genai, "Client", lambda api_key: fake_client)
    monkeypatch.setattr(advisor.explain_tools, "dispatch_explain_tool", fake_dispatch)

    events = list(
        advisor._stream_sync(
            [advisor.ChatMessage(role="user", content="Why this portfolio?")],
            context=None,
            user_email="owner@example.com",
        )
    )

    assert calls == [
        (
            "explain_portfolio",
            {"method": "erc", "user_email": "attacker@example.com"},
            "owner@example.com",
        )
    ]
    assert events == [{"type": "token", "content": "grounded answer"}]
    second_turn_contents = captured_contents[1]
    function_response_parts = [
        part
        for content in second_turn_contents
        for part in getattr(content, "parts", [])
        if getattr(part, "function_response", None) is not None
    ]
    assert function_response_parts
    response = function_response_parts[0].function_response.response
    assert response["server_email_used"] == "owner@example.com"
    assert response["sentinel"] == 42
