"""Rebalancer skeleton for docs/greenlight/05 §2.9 and 06 Phase 5.3."""

from schemas.models import Positions, RebalanceDecision, TargetWeights


def decide_rebalance(positions: Positions, weights: TargetWeights) -> RebalanceDecision:
    """Decide rebalance actions per docs/greenlight/05 §2.9."""

    raise NotImplementedError
