"""Persona factories from docs/greenlight/05-contracts.md §8."""

from __future__ import annotations

from pathlib import Path

from schemas.models import UserProfile

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _load_profile(name: str) -> UserProfile:
    return UserProfile.model_validate_json((FIXTURES_DIR / name).read_text())


def maya_t0() -> UserProfile:
    """Load Maya T0 halt persona from docs/greenlight/03 and 05 §8."""

    return _load_profile("persona_halt.json")


def maya_greenlit() -> UserProfile:
    """Load Maya T1 greenlight persona from docs/greenlight/03 and 05 §8."""

    return _load_profile("persona_greenlight.json")
