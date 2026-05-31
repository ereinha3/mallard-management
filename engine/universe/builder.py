"""Universe builder for docs/greenlight/05 §§4-5.

Preference semantics in the ERC path:
- ``universe_pref`` filters by instrument quote type before optimization:
  ``etf`` keeps ETF rows, ``stock`` keeps stock/common-stock rows, and ``mix``
  keeps both. The current bundled canonical classification is ETF-only.
- ``esg_exclusions`` applies classification replacement columns such as
  ``fossil_fuels``. A replacement ETF stays in the original ticker's sleeve and
  the excluded ticker records the replacement that was selected.
- ``sector_theme_tilts`` adjusts membership only. Positive themes keep matching
  ETFs in any sleeve they match and leave other sleeves intact; negative themes
  containing avoid/exclude/away/underweight remove matching ETFs. Optimizer math
  is unchanged and still allocates sleeve weights across the resulting members.
"""

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


def _pref_value(prefs: Any, name: str, default: Any) -> Any:
    if prefs is None:
        return default
    if isinstance(prefs, Mapping):
        return prefs.get(name, default)
    return getattr(prefs, name, default)


def build_universe(prefs: Any) -> Universe:
    """Build the investable Universe per docs/greenlight/05 §§4-5."""

    return load_universe(
        _pref_exclusions(prefs) or ["none"],
        universe_pref=str(_pref_value(prefs, "universe_pref", "etf")),
        sector_theme_tilts=list(_pref_value(prefs, "sector_theme_tilts", []) or []),
    )
