from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from llm.interview_state import (  # noqa: E402
    SCRIPT,
    collected_scores,
    current,
    initial_state,
    is_complete,
    record_and_advance,
)


def test_initial_state_starts_at_first_script_item() -> None:
    state = initial_state()

    assert state == {"step": 0, "scores": {}}
    assert current(state) is SCRIPT[0]


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
    state = {"step": 0, "scores": {"existing": "kept"}}
    original_state = {"step": state["step"], "scores": dict(state["scores"])}

    next_state = record_and_advance(state, "new value")

    assert state == original_state
    assert next_state is not state
    assert next_state["scores"] is not state["scores"]
