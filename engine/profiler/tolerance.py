"""Tolerance profiler for docs/greenlight/05 §2.3 and §7.2."""

from math import erf, exp, log, sqrt

from schemas.constants import GAMMA_MAX, GAMMA_MIN, GL_ALPHA, GL_MEAN, GL_SD
from schemas.models import GammaBand


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
