"""Tax report skeleton for docs/greenlight/05 §2.10 and 06 Phase 6.1."""

from collections.abc import Mapping

from data.repository import instruments
from schemas.models import Positions, TaxReport
from tax.rates import normalize_bracket, ordinary_loss_offset_cap

REPLACEMENTS = {
    "VTI": "ITOT",
    "VEA": "IXUS",
    "VNQ": "SCHH",
    "GLD": "IAU",
    "BND": "AGG",
    "TIP": "SCHP",
    "ESGV": "DSI",
    "ESGD": "EFG",
}


def _suggested_replacement(ticker: str) -> str:
    try:
        rows = instruments().fillna("")
    except Exception:
        rows = None
    if rows is not None and not rows.empty and ticker in set(rows["ticker"]):
        source = rows[rows["ticker"] == ticker].iloc[0]
        candidates = rows[rows["ticker"] != ticker]
        bucket = str(source.get("bucket", ""))
        if bucket:
            candidates = candidates[candidates["bucket"] == bucket]
        sleeve = str(source.get("sleeve", ""))
        if candidates.empty and sleeve:
            candidates = rows[(rows["ticker"] != ticker) & (rows["sleeve"] == sleeve)]
        underlying_index = str(source.get("underlying_index", ""))
        if underlying_index and "underlying_index" in candidates:
            distinct = candidates[candidates["underlying_index"] != underlying_index]
            if not distinct.empty:
                candidates = distinct
        if not candidates.empty:
            return str(candidates.sort_values("ticker").iloc[0]["ticker"])

    replacement = REPLACEMENTS.get(ticker, f"{ticker}_ALT")
    if replacement == ticker:
        return f"{ticker}_ALT"
    return replacement


def tax_report(
    positions: Positions,
    cost_basis: Mapping[str, float],
    filing_status: str,
    bracket: float | None = None,
) -> TaxReport:
    """Generate a read-only TaxReport per docs/greenlight/05 §2.10."""

    harvestable = []
    warnings = []
    offset_cap = ordinary_loss_offset_cap(filing_status)
    normalized_bracket = normalize_bracket(bracket)

    for position in positions.items:
        basis = cost_basis.get(position.ticker, position.avg_cost * position.shares)
        if position.market_value >= basis:
            continue

        unrealized_loss = basis - position.market_value
        harvestable_loss = {
            "ticker": position.ticker,
            "unrealized_loss": unrealized_loss,
            "note": (
                f"{position.ticker} is ${unrealized_loss:,.2f} below basis; "
                "review tax-loss harvesting, but do not auto-execute."
            ),
        }
        if normalized_bracket is not None:
            harvestable_loss["estimated_tax_value"] = min(unrealized_loss, offset_cap) * normalized_bracket
            harvestable_loss["tax_rate_used"] = normalized_bracket
        harvestable.append(harvestable_loss)
        warnings.append(
            {
                "ticker": position.ticker,
                "window_days": 30,
                "suggested_replacement": _suggested_replacement(position.ticker),
            }
        )

    mfs_note = ""
    if filing_status == "married_separate":
        mfs_note = " The married-filing-separately cap is generally $1,500."

    return TaxReport(
        harvestable=harvestable,
        wash_sale_warnings=warnings,
        after_tax_notes=[
            (
                "Net capital losses can offset capital gains and up to $3,000 of ordinary "
                f"income per year, with unused losses carried forward.{mfs_note}"
            ),
            "Wash-sale rules can disallow a loss if a substantially identical security is bought within 30 days before or after the sale.",
            "This report is advisory and read-only; it does not place trades.",
        ],
    )
