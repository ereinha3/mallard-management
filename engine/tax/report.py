"""Tax report skeleton for docs/greenlight/05 §2.10 and 06 Phase 6.1."""

from collections.abc import Mapping

from schemas.models import Positions, TaxReport


def tax_report(positions: Positions, cost_basis: Mapping[str, float], filing_status: str) -> TaxReport:
    """Generate a read-only TaxReport per docs/greenlight/05 §2.10."""

    raise NotImplementedError
