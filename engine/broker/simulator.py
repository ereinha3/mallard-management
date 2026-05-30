"""Simulator broker skeleton for docs/greenlight/06 Phase 5.2."""

from schemas.models import Fill, OrderPlan, Positions


class SimulatorBroker:
    """In-process simulator broker from docs/greenlight/06 Phase 5.2."""

    def place_order(self, plan: OrderPlan) -> list[Fill]:
        """Place an OrderPlan and return fills per docs/greenlight/05 §2.8."""

        raise NotImplementedError

    def read_positions(self) -> Positions:
        """Read current positions per docs/greenlight/05 §2.8."""

        raise NotImplementedError
