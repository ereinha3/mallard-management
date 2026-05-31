from __future__ import annotations

from llm.instrument import SCRIPT, ScriptItem, current_item


def initial_state() -> dict:
    return {"step": 0, "scores": {}}


def current(state: dict) -> ScriptItem | None:
    return current_item(state["step"])


def _copy_state(state: dict) -> dict:
    new_state = dict(state)
    new_state["scores"] = dict(state["scores"])
    return new_state


def record_and_advance(state: dict, value: object) -> dict:
    new_state = _copy_state(state)
    if value is None:
        return new_state

    item = current(state)
    if item is None:
        return new_state

    new_state["scores"][item.key] = value
    new_state["step"] = state["step"] + 1
    return new_state


def is_complete(state: dict) -> bool:
    return state["step"] >= len(SCRIPT)


def collected_scores(state: dict) -> dict:
    return state["scores"]
