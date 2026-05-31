"""Tax-loss harvesting report endpoint support.

This module keeps the existing ``from tax.report import tax_report`` import
working now that backend tax calculation code also lives in the ``tax`` package.
"""

from collections.abc import Mapping

from data.repository import instruments
from schemas.models import Positions, TaxReport

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


def tax_report(positions: Positions, cost_basis: Mapping[str, float], filing_status: str) -> TaxReport:
    harvestable = []
    warnings = []

    for position in positions.items:
        basis = cost_basis.get(position.ticker, position.avg_cost * position.shares)
        if position.market_value >= basis:
            continue

        unrealized_loss = basis - position.market_value
        harvestable.append(
            {
                "ticker": position.ticker,
                "unrealized_loss": unrealized_loss,
                "note": (
                    f"{position.ticker} is ${unrealized_loss:,.2f} below basis; "
                    "review tax-loss harvesting, but do not auto-execute."
                ),
            }
        )
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
