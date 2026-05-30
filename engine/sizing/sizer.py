"""Order sizing skeleton for docs/greenlight/05 §2.8 and 06 Phase 5.1."""

from schemas.models import OrderPlan, TargetWeights


def size_orders(weights: TargetWeights, capital_on_hand: float, monthly_surplus: float) -> OrderPlan:
    """Size orders per docs/greenlight/05 §2.8."""

    raise NotImplementedError
