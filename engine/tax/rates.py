"""Tax rate helpers for bracket-aware calculations."""

from schemas.constants import (
    EXPECTED_MARKET_RETURN,
    LTCG_RATE,
    MFS_ORDINARY_LOSS_OFFSET_CAP,
    ORDINARY_LOSS_OFFSET_CAP,
    ORDINARY_TO_LTCG_RATE,
)


def normalize_bracket(bracket: float | None) -> float | None:
    if bracket is None:
        return None
    value = float(bracket)
    if value != value:  # NaN
        return None
    return max(0.0, min(1.0, value))


def ltcg_rate_for_bracket(bracket: float | None, filing_status: str | None = None) -> float:
    normalized = normalize_bracket(bracket)
    if normalized is None:
        return LTCG_RATE
    for threshold, rate in ORDINARY_TO_LTCG_RATE:
        if normalized <= threshold:
            return rate
    return ORDINARY_TO_LTCG_RATE[-1][1]


def expected_after_tax_market_return(
    bracket: float | None,
    filing_status: str | None = None,
    expected_market_return: float = EXPECTED_MARKET_RETURN,
) -> float:
    return expected_market_return * (1 - ltcg_rate_for_bracket(bracket, filing_status))


def ordinary_loss_offset_cap(filing_status: str) -> float:
    if filing_status == "married_separate":
        return MFS_ORDINARY_LOSS_OFFSET_CAP
    return ORDINARY_LOSS_OFFSET_CAP
