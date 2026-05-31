"""Universe builder for docs/greenlight/05 §§4-5."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from data.loaders import load_universe
from schemas.models import EsgExclusion, Universe

ESG_COLUMNS = {"fossil_fuels", "weapons", "tobacco", "gambling"}


def _pref_exclusions(prefs: Any) -> list[EsgExclusion]:
    if prefs is None:
        raw: object = []
    elif isinstance(prefs, Mapping):
        raw = prefs.get("esg_exclusions", [])
    elif isinstance(prefs, str):
        raw = [prefs]
    else:
        raw = getattr(prefs, "esg_exclusions", prefs if isinstance(prefs, Iterable) else [])

    return [
        str(exclusion)
        for exclusion in (raw or [])
        if str(exclusion) != "none" and str(exclusion) in ESG_COLUMNS
    ]


def build_universe(prefs: Any) -> Universe:
    """Build the investable Universe per docs/greenlight/05 §§4-5."""

    return load_universe(_pref_exclusions(prefs) or ["none"])
