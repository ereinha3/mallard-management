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


def test_all_gl_items_present_with_canonical_indices() -> None:
    # Ask order is reordered (behavioral-first), but every GL item carries its
    # canonical 0-12 slot so the validated 13-item sum + norms are preserved.
    gl_items = [item for item in SCRIPT if item.gl_index is not None]

    assert {item.key for item in gl_items} == {f"GL{i}" for i in range(1, 14)}
    assert sorted(item.gl_index for item in gl_items) == list(range(13))
    assert all(item.kind == "instrument" for item in gl_items)


def test_required_instrument_items_are_present() -> None:
    items_by_key = {item.key: item for item in SCRIPT}

    for key in ("dohmen", "loss_scenario", "loss_aversion"):
        assert items_by_key[key].kind == "instrument"


def test_required_soft_items_are_present() -> None:
    items_by_key = {item.key: item for item in SCRIPT}

    for key in ("goals_horizon", "debts", "goal_target", "preferences"):
        assert items_by_key[key].kind == "soft"
    # income/job data comes from the intake form, not the chat
    assert "income_stability" not in items_by_key


def test_next_directive_after_script_is_none() -> None:
    assert next_directive(len(SCRIPT)) is None


def test_next_directive_for_gl_item_hides_numbered_options() -> None:
    gl_step = next(i for i, item in enumerate(SCRIPT) if item.gl_index is not None)
    directive = next_directive(gl_step)

    assert directive is not None
    assert "conversationally" in directive
    # the user must never be shown the 1-4 scale anchors in the question
    assert "1 =" not in directive and "1=" not in directive


def test_next_directive_for_soft_item_contains_conversationally() -> None:
    directive = next_directive(0)

    assert directive is not None
    assert "conversationally" in directive
