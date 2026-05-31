"""Tolerance profiler for docs/greenlight/05 §2.3 and §7.2."""

from math import erf, exp, log, sqrt

from schemas.constants import GAMMA_MAX, GAMMA_MIN, GL_ALPHA, GL_MEAN, GL_SD
from schemas.models import GammaBand, RiskSignals

DOHMEN_DEFAULT_RISK = 5
DOHMEN_VAR = 1.0
LOSS_AVERSION_VAR = 1.5
GL_VAR_FLOOR = 0.25
LOSS_GAMMA_MIN = 2.0
LOSS_GAMMA_MAX = 6.0


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))


def _gamma_from_percentile(p: float) -> float:
    p = min(1.0, max(0.0, p))
    gamma = exp(log(GAMMA_MAX) - p * (log(GAMMA_MAX) - log(GAMMA_MIN)))
    return min(GAMMA_MAX, max(GAMMA_MIN, gamma))


def _gamma_at(score: float) -> float:
    p = _norm_cdf((score - GL_MEAN) / GL_SD)
    return _gamma_from_percentile(p)


def score_to_gamma_band(raw_score: float) -> GammaBand:
    """Map a Grable-Lytton raw score to a GammaBand per docs/greenlight/05 §7.2."""

    sem = GL_SD * sqrt(1.0 - GL_ALPHA)
    return GammaBand(
        mid=_gamma_at(raw_score),
        aggressive=_gamma_at(raw_score + sem),
        conservative=_gamma_at(raw_score - sem),
    )


def gl13_signal(raw_score: float) -> tuple[float, float]:
    """Map the preserved GL-13 score to one gamma signal plus variance."""

    band = score_to_gamma_band(raw_score)
    sem_gamma = (band.conservative - band.aggressive) / 2.0
    return band.mid, max(GL_VAR_FLOOR, sem_gamma * sem_gamma)


def dohmen_signal(dohmen_risk: int | None) -> tuple[float, float]:
    """Map the Dohmen 0-10 willingness item onto the same log-spaced gamma scale."""

    risk = DOHMEN_DEFAULT_RISK if dohmen_risk is None else dohmen_risk
    if risk < 0 or risk > 10:
        raise ValueError("dohmen_risk must be in 0..10")
    return _gamma_from_percentile(risk / 10.0), DOHMEN_VAR


def loss_aversion_signal(loss_aversion_probe: float | None) -> tuple[float, float] | None:
    """Map the 50/50 loss-aversion probe to an optional conservative gamma signal."""

    if loss_aversion_probe is None or loss_aversion_probe <= 0:
        return None

    lambda_ratio = loss_aversion_probe / 100.0
    p = min(1.0, max(0.0, (lambda_ratio - 1.0) / 3.0))
    gamma = exp(log(LOSS_GAMMA_MIN) + p * (log(LOSS_GAMMA_MAX) - log(LOSS_GAMMA_MIN)))
    return min(GAMMA_MAX, max(GAMMA_MIN, gamma)), LOSS_AVERSION_VAR


def risk_signals_from_inputs(
    gl13_score: float,
    dohmen_risk: int | None,
    loss_aversion_probe: float | None,
) -> RiskSignals:
    """Build independently mapped signals for fusion; no raw-score concatenation."""

    gl13_gamma, gl13_var = gl13_signal(gl13_score)
    dohmen_gamma, dohmen_var = dohmen_signal(dohmen_risk)
    loss_signal = loss_aversion_signal(loss_aversion_probe)
    payload = {
        "gl13_gamma": gl13_gamma,
        "gl13_var": gl13_var,
        "dohmen_gamma": dohmen_gamma,
        "dohmen_var": dohmen_var,
    }
    if loss_signal is not None:
        payload["loss_aversion_gamma"], payload["loss_aversion_var"] = loss_signal
    return RiskSignals.model_validate(payload)
