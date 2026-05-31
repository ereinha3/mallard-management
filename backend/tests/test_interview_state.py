from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from llm.interview_state import (  # noqa: E402
    RISK_ITEM_KEYS,
    SCRIPT,
    collected_scores,
    current,
    initial_state,
    is_complete,
    re_ask_count,
    record_and_advance,
    reset_risk_items,
)


def test_initial_state_starts_at_first_script_item() -> None:
    state = initial_state()

    assert state == {"step": 0, "scores": {}, "re_ask_count": 0}
    assert current(state) is SCRIPT[0]


def test_re_ask_count_defaults_to_zero() -> None:
    assert re_ask_count({"step": 3, "scores": {"GL1": 4}}) == 0


def test_initial_state_re_ask_count_is_zero() -> None:
    assert initial_state()["re_ask_count"] == 0


def test_risk_item_keys_cover_risk_items_only() -> None:
    gl_keys = {
        item.key for item in SCRIPT if getattr(item, "gl_index", None) is not None
    }
    gl_keys |= {item.key for item in SCRIPT if item.key.startswith("GL")}

    assert {"dohmen", "loss_aversion", "loss_scenario"} <= RISK_ITEM_KEYS
    assert gl_keys <= RISK_ITEM_KEYS
    assert {"goals_horizon", "goal_target", "preferences", "debts"}.isdisjoint(
        RISK_ITEM_KEYS
    )


def test_reset_risk_items_removes_risk_scores_and_rewinds_once() -> None:
    first_risk_step = min(
        index for index, item in enumerate(SCRIPT) if item.key in RISK_ITEM_KEYS
    )
    risk_scores = {key: f"value for {key}" for key in RISK_ITEM_KEYS}
    state = {
        "step": len(SCRIPT),
        "scores": {
            **risk_scores,
            "goals_horizon": {"goals": ["retirement"], "horizon_years": 20},
            "goal_target": 1_000_000,
        },
        "re_ask_count": 0,
        "other": "preserved",
    }

    next_state = reset_risk_items(state)

    assert RISK_ITEM_KEYS.isdisjoint(next_state["scores"])
    assert next_state["scores"]["goals_horizon"] == {
        "goals": ["retirement"],
        "horizon_years": 20,
    }
    assert next_state["scores"]["goal_target"] == 1_000_000
    assert next_state["step"] == first_risk_step
    assert next_state["re_ask_count"] == 1
    assert next_state["other"] == "preserved"
    assert state["step"] == len(SCRIPT)
    assert set(state["scores"]) >= RISK_ITEM_KEYS


def test_record_and_advance_records_value_and_advances_one_step() -> None:
    state = initial_state()
    item = current(state)

    next_state = record_and_advance(state, "moderate risk")

    assert item is not None
    assert next_state["scores"] == {item.key: "moderate risk"}
    assert next_state["step"] == state["step"] + 1


def test_record_and_advance_with_none_does_not_record_or_advance() -> None:
    state = initial_state()

    next_state = record_and_advance(state, None)

    assert next_state["step"] == state["step"]
    assert next_state["scores"] == {}


def test_driving_all_script_items_completes_and_collects_each_key() -> None:
    state = initial_state()

    for item in SCRIPT:
        assert current(state) is item
        state = record_and_advance(state, f"value for {item.key}")

    scores = collected_scores(state)

    assert is_complete(state) is True
    assert current(state) is None
    assert len(scores) == len(SCRIPT)
    assert set(scores) == {item.key for item in SCRIPT}


def test_record_and_advance_does_not_mutate_input_state() -> None:
    state = {"step": 0, "scores": {"existing": "kept"}, "re_ask_count": 0}
    original_state = {
        "step": state["step"],
        "scores": dict(state["scores"]),
        "re_ask_count": state["re_ask_count"],
    }

    next_state = record_and_advance(state, "new value")

    assert state == original_state
    assert next_state is not state
    assert next_state["scores"] is not state["scores"]
