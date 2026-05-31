from __future__ import annotations

from llm.instrument import SCRIPT, ScriptItem, current_item


RISK_ITEM_KEYS = frozenset(
    item.key
    for item in SCRIPT
    if getattr(item, "gl_index", None) is not None or item.key.startswith("GL")
) | frozenset({"dohmen", "loss_aversion", "loss_scenario"})

_FIRST_RISK_STEP = min(
    index for index, item in enumerate(SCRIPT) if item.key in RISK_ITEM_KEYS
)


def initial_state() -> dict:
    return {"step": 0, "scores": {}, "re_ask_count": 0}


def current(state: dict) -> ScriptItem | None:
    return current_item(state["step"])


def _copy_state(state: dict) -> dict:
    new_state = dict(state)
    new_state["scores"] = dict(state["scores"])
    return new_state


def re_ask_count(state: dict) -> int:
    return state.get("re_ask_count", 0)


def reset_risk_items(state: dict) -> dict:
    new_state = dict(state)
    new_state["scores"] = {
        key: value
        for key, value in state.get("scores", {}).items()
        if key not in RISK_ITEM_KEYS
    }
    new_state["step"] = _FIRST_RISK_STEP
    new_state["re_ask_count"] = re_ask_count(state) + 1
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
