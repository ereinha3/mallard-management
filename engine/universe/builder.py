"""Universe builder for docs/greenlight/05 §§4-5."""

from __future__ import annotations

import csv
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from schemas.models import EsgExclusion, ExcludedTicker, Sleeve, Universe

UNIVERSE_PATH = Path(__file__).resolve().parents[1] / "data" / "universe.csv"
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

    exclusions = _pref_exclusions(prefs)
    sleeves: dict[Sleeve, list[str]] = {}
    risky_sleeves: list[Sleeve] = []
    safe_sleeves: list[Sleeve] = []
    market_weights: dict[Sleeve, float] = {}
    excluded: list[ExcludedTicker] = []

    with UNIVERSE_PATH.open(newline="") as handle:
        for row in csv.DictReader(handle):
            sleeve = row["sleeve"]
            role = row["role"]
            original_ticker = row["ticker"]
            ticker = original_ticker

            for exclusion in exclusions:
                replacement = row.get(exclusion, "").strip()
                if replacement and replacement != ticker:
                    excluded.append(ExcludedTicker(ticker=original_ticker, reason=exclusion))
                    ticker = replacement
                    break

            sleeves.setdefault(sleeve, []).append(ticker)
            market_weights[sleeve] = float(row["market_weight"])
            if role == "risky" and sleeve not in risky_sleeves:
                risky_sleeves.append(sleeve)
            if role == "safe" and sleeve not in safe_sleeves:
                safe_sleeves.append(sleeve)

    tickers: list[str] = []
    for sleeve_tickers in sleeves.values():
        for ticker in sleeve_tickers:
            if ticker not in tickers:
                tickers.append(ticker)

    return Universe(
        tickers=tickers,
        sleeves=sleeves,
        risky_sleeves=risky_sleeves,
        safe_sleeves=safe_sleeves,
        market_weights=market_weights,
        excluded=excluded,
    )
