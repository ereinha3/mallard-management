"""Backtest metric skeletons for docs/greenlight/05 §7.5."""

from collections.abc import Sequence


def deflated_sharpe(returns: Sequence[float], sr_hat: float, n_trials: int) -> float:
    """Compute Deflated Sharpe per docs/greenlight/05 §7.5."""

    raise NotImplementedError


def sortino(returns: Sequence[float]) -> float:
    """Compute Sortino ratio per docs/greenlight/06 Phase 6.2."""

    raise NotImplementedError


def max_drawdown(returns: Sequence[float]) -> float:
    """Compute max drawdown per docs/greenlight/06 Phase 6.2."""

    raise NotImplementedError


def calmar(returns: Sequence[float]) -> float:
    """Compute Calmar ratio per docs/greenlight/06 Phase 6.2."""

    raise NotImplementedError
