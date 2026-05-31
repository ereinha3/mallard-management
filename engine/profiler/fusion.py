"""Random-effects fusion for independently mapped risk-tolerance signals."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from schemas.constants import GAMMA_MAX, GAMMA_MIN
from schemas.models import GammaBand, RiskSignals

DEFAULT_Z = 1.0
I2_CLARIFICATION_THRESHOLD = 0.75
CHI_SQUARE_95 = {
    1: 3.841458820694124,
    2: 5.991464547107979,
    3: 7.814727903251179,
    4: 9.487729036781154,
}


@dataclass(frozen=True)
class FusionResult:
    gamma_band: GammaBand
    fixed_gamma: float
    fused_gamma: float
    q: float
    i_squared: float
    tau_squared: float
    combined_var: float
    signal_confidence: float
    needs_clarification: bool
    contradiction_note: str | None = None


def _signal_arrays(signals: RiskSignals) -> tuple[np.ndarray, np.ndarray]:
    gammas = [signals.gl13_gamma, signals.dohmen_gamma]
    variances = [signals.gl13_var, signals.dohmen_var]
    if signals.loss_aversion_gamma is not None and signals.loss_aversion_var is not None:
        gammas.append(signals.loss_aversion_gamma)
        variances.append(signals.loss_aversion_var)
    return np.asarray(gammas, dtype=float), np.asarray(variances, dtype=float)


def _critical_value(df: int) -> float:
    return CHI_SQUARE_95.get(df, CHI_SQUARE_95[max(CHI_SQUARE_95)])


def fuse_risk_signals(signals: RiskSignals, z: float = DEFAULT_Z) -> FusionResult:
    """Fuse independently mapped gamma signals with DerSimonian-Laird tau^2."""

    gammas, variances = _signal_arrays(signals)
    if np.any(variances <= 0):
        raise ValueError("risk signal variances must be positive")

    fixed_weights = 1.0 / variances
    fixed_weight_sum = float(np.sum(fixed_weights))
    fixed_gamma = float(np.sum(fixed_weights * gammas) / fixed_weight_sum)
    q = float(np.sum(fixed_weights * np.square(gammas - fixed_gamma)))

    k = int(gammas.size)
    df = k - 1
    if df <= 0:
        i_squared = 0.0
        tau_squared = 0.0
    else:
        i_squared = float(max(0.0, (q - df) / q)) if q > 0 else 0.0
        c = fixed_weight_sum - float(np.sum(np.square(fixed_weights)) / fixed_weight_sum)
        tau_squared = float(max(0.0, (q - df) / c)) if c > 0 else 0.0

    random_weights = 1.0 / (variances + tau_squared)
    random_weight_sum = float(np.sum(random_weights))
    fused_gamma = float(np.sum(random_weights * gammas) / random_weight_sum)
    combined_var = float(1.0 / random_weight_sum)
    se = float(np.sqrt(combined_var))

    aggressive = float(np.clip(fused_gamma - z * se, GAMMA_MIN, GAMMA_MAX))
    mid = float(np.clip(fused_gamma, GAMMA_MIN, GAMMA_MAX))
    conservative = float(np.clip(fused_gamma + z * se, GAMMA_MIN, GAMMA_MAX))
    gamma_band = GammaBand(aggressive=aggressive, mid=mid, conservative=conservative)

    needs_clarification = df > 0 and (
        q > _critical_value(df) or i_squared > I2_CLARIFICATION_THRESHOLD
    )
    signal_confidence = float(np.clip(1.0 - i_squared, 0.0, 1.0))
    contradiction_note = None
    if needs_clarification:
        contradiction_note = (
            "risk signals disagree materially; re-ask the Grable-Lytton, Dohmen, "
            "and loss-aversion answers that drove the mismatch"
        )

    return FusionResult(
        gamma_band=gamma_band,
        fixed_gamma=fixed_gamma,
        fused_gamma=mid,
        q=q,
        i_squared=i_squared,
        tau_squared=tau_squared,
        combined_var=combined_var,
        signal_confidence=signal_confidence,
        needs_clarification=needs_clarification,
        contradiction_note=contradiction_note,
    )
