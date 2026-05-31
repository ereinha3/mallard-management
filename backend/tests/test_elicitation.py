from __future__ import annotations

import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
ENGINE_DIR = ROOT / "engine"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ENGINE_DIR) not in sys.path:
    sys.path.append(str(ENGINE_DIR))


def _function_call_chunk(name: str, args: dict) -> SimpleNamespace:
    function_call = SimpleNamespace(name=name, args=args)
    part = SimpleNamespace(function_call=function_call)
    content = SimpleNamespace(role="model", parts=[part])
    candidate = SimpleNamespace(content=content)
    return SimpleNamespace(text="", candidates=[candidate])


def _stream_submit_profile(
    monkeypatch: pytest.MonkeyPatch,
    user_message: str,
    args: dict,
) -> tuple[list[dict], dict]:
    monkeypatch.setenv("GOOGLE_API_KEY", "test-key")

    elicitation = importlib.import_module("llm.elicitation")
    captured: dict = {}

    class FakeModels:
        def generate_content_stream(self, **kwargs):
            captured.update(kwargs)
            return iter([_function_call_chunk("submit_profile", args)])

    fake_client = SimpleNamespace(models=FakeModels())
    monkeypatch.setattr(elicitation.genai, "Client", lambda api_key: fake_client)

    events = list(
        elicitation._stream_sync(
            [elicitation.ChatMessage(role="user", content=user_message)]
        )
    )
    return events, captured


def test_elicitation_submit_profile_captures_mapped_esg_exclusions(
    monkeypatch: pytest.MonkeyPatch,
):
    events, captured = _stream_submit_profile(
        monkeypatch,
        "No oil or defense companies, please.",
        {"esg_exclusions": ["fossil_fuels", "weapons"]},
    )

    assert captured["model"] == importlib.import_module("llm.elicitation").GEMINI_MODEL
    assert events == [
        {
            "type": "profile_ready",
            "profile": {"esg_exclusions": ["fossil_fuels", "weapons"]},
        }
    ]


def test_elicitation_submit_profile_captures_empty_exclusions_for_no_preference(
    monkeypatch: pytest.MonkeyPatch,
):
    events, _ = _stream_submit_profile(
        monkeypatch,
        "No preference on industries.",
        {"esg_exclusions": []},
    )

    assert events == [
        {
            "type": "profile_ready",
            "profile": {"esg_exclusions": []},
        }
    ]


def test_elicitation_prompt_and_tool_schema_define_esg_exclusion_categories():
    elicitation = importlib.import_module("llm.elicitation")

    prompt = elicitation.SYSTEM_PROMPT.lower()
    assert "oil & gas / fossil fuels" in prompt
    assert "defense / weapons" in prompt
    assert "tobacco" in prompt
    assert "gambling" in prompt
    assert "no preference" in prompt
    assert "empty exclusions" in prompt
    assert "oil" in prompt and "fossil_fuels" in prompt
    assert "defense" in prompt and "weapons" in prompt

    properties = (
        elicitation.SUBMIT_PROFILE_TOOL.function_declarations[0]
        .parameters.properties
    )
    esg_schema = properties["esg_exclusions"]

    assert esg_schema.items.enum == [
        "fossil_fuels",
        "weapons",
        "tobacco",
        "gambling",
    ]
