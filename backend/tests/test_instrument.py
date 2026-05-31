from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from llm.instrument import SCRIPT, next_directive, step_from_messages  # noqa: E402


def test_step_from_messages_empty_is_clamped_to_zero() -> None:
    assert step_from_messages([]) == 0


def test_step_from_messages_one_user_seed_is_zero() -> None:
    assert step_from_messages([{"role": "user"}]) == 0


def test_step_from_messages_two_user_messages_is_step_one() -> None:
    messages = [
        {"role": "user"},
        {"role": "assistant"},
        {"role": "user"},
    ]

    assert step_from_messages(messages) == 1


def test_step_from_messages_many_user_messages_clamps_at_script_length() -> None:
    messages = [{"role": "user"} for _ in range(len(SCRIPT) + 10)]

    assert step_from_messages(messages) == len(SCRIPT)


def test_step_from_messages_accepts_dicts_and_role_attribute_objects() -> None:
    dict_messages = [
        {"role": "user"},
        {"role": "assistant"},
        {"role": "user"},
        {"role": "assistant"},
        {"role": "user"},
    ]
    object_messages = [
        SimpleNamespace(role="user"),
        SimpleNamespace(role="assistant"),
        SimpleNamespace(role="user"),
        SimpleNamespace(role="assistant"),
        SimpleNamespace(role="user"),
    ]

    assert step_from_messages(dict_messages) == 2
    assert step_from_messages(object_messages) == 2


def test_script_contains_gl_items_in_order_as_instruments() -> None:
    gl_items = [item for item in SCRIPT if item.key.startswith("GL")]

    assert [item.key for item in gl_items] == [f"GL{i}" for i in range(1, 14)]
    assert all(item.kind == "instrument" for item in gl_items)


def test_required_instrument_items_are_present() -> None:
    items_by_key = {item.key: item for item in SCRIPT}

    for key in ("dohmen", "loss_scenario", "loss_aversion"):
        assert items_by_key[key].kind == "instrument"


def test_required_soft_items_are_present() -> None:
    items_by_key = {item.key: item for item in SCRIPT}

    for key in ("income_stability", "goal_target", "preferences"):
        assert items_by_key[key].kind == "soft"


def test_next_directive_after_script_is_none() -> None:
    assert next_directive(len(SCRIPT)) is None


def test_next_directive_for_gl_item_contains_verbatim() -> None:
    directive = next_directive(1)

    assert directive is not None
    assert "VERBATIM" in directive


def test_next_directive_for_soft_item_contains_conversationally() -> None:
    directive = next_directive(0)

    assert directive is not None
    assert "conversationally" in directive
