"""
Two-axis risk profiler — contracts §2.3, §7.2.

Tolerance axis:  Grable-Lytton raw score → z-score → percentile →
                 log-spaced γ over [1.5, 8.0], reported as a GammaBand
                 {aggressive, mid, conservative} using the GL SEM.

Capacity axis:   Objective score 0–100 → same log-spaced γ mapping
                 (capacity_score treated as a percentile directly).

Combine:         capacity caps tolerance element-wise:
                 gamma_band[posture] = max(tolerance_gamma[posture], capacity_gamma)

Target vol band: σ_target = SR_REF / γ (posture-keyed, no return forecast).
"""

import math
from config import (
    GAMMA_MIN, GAMMA_MAX, SR_REF,
    GL_MEAN, GL_SD, GL_ALPHA,
)
from models import GammaBand, RiskProfile, TargetVolBand, ValidatedProfile

# Precomputed log range for efficiency
_LN_GAMMA_MAX = math.log(GAMMA_MAX)   # ln(8.0) ≈ 2.079
_LN_GAMMA_MIN = math.log(GAMMA_MIN)   # ln(1.5) ≈ 0.405
_LN_RANGE = _LN_GAMMA_MAX - _LN_GAMMA_MIN  # ≈ 1.674

_LOSS_SCENARIO_DELTA = {
    "sell_all":  -10,
    "sell_some": -5,
    "hold":       0,
    "buy_more":   6,
}


def _phi(x: float) -> float:
    """Standard normal CDF via math.erf."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _percentile_to_gamma(p: float) -> float:
    """Log-spaced mapping: p=0 → GAMMA_MAX, p=1 → GAMMA_MIN."""
    p = max(0.001, min(0.999, p))
    return math.exp(_LN_GAMMA_MAX - p * _LN_RANGE)


def _score_to_percentile(score: float) -> float:
    z = (score - GL_MEAN) / GL_SD
    return _phi(z)


def _compute_tolerance_band(
    profile: ValidatedProfile,
) -> tuple[GammaBand, float, bool]:
    """
    Returns (tolerance_band, raw_gl_score, loss_aversion_flag).
    Applies loss-scenario and loss-aversion-probe adjustments before the band.
    """
    raw_score = float(sum(profile.risk_instrument_responses))

    # Behavioural adjustment — shift the effective score
    effective_score = raw_score + _LOSS_SCENARIO_DELTA.get(
        profile.loss_scenario_response, 0
    )

    loss_aversion_flag = False

    # Loss-aversion probe: λ = probe / 100; λ > 2.5 → penalise
    if profile.loss_aversion_probe is not None:
        lam = profile.loss_aversion_probe / 100.0
        if lam > 2.5:
            effective_score -= 6.0
            loss_aversion_flag = True
        elif lam < 1.0:
            effective_score += 3.0

    # Contradiction: high self-rating but panic sell
    if profile.loss_scenario_response == "sell_all" and raw_score > 35:
        loss_aversion_flag = True

    p_mid = _score_to_percentile(effective_score)
    gamma_mid = _percentile_to_gamma(p_mid)

    # Measurement-error band via SEM
    sem = GL_SD * math.sqrt(1.0 - GL_ALPHA)          # ≈ 2.37
    p_aggressive = _score_to_percentile(effective_score + sem)   # higher score → lower γ
    p_conservative = _score_to_percentile(effective_score - sem)

    band = GammaBand(
        aggressive=round(_percentile_to_gamma(p_aggressive), 3),
        mid=round(gamma_mid, 3),
        conservative=round(_percentile_to_gamma(p_conservative), 3),
    )
    return band, raw_score, loss_aversion_flag


def _compute_capacity_gamma(profile: ValidatedProfile) -> tuple[float, float]:
    """
    Returns (capacity_score 0–100, implied capacity_gamma).
    Score components weighted per CAPACITY_WEIGHTS in contracts §10.
    """
    score = 0.0

    # Horizon (30 pts)
    h = profile.horizon_years
    if h >= 40:   score += 30
    elif h >= 30: score += 25
    elif h >= 20: score += 18
    elif h >= 10: score += 10
    elif h >= 5:  score += 5
    else:         score += 2

    # Human-capital beta (25 pts) — Bodie-Merton-Samuelson
    if profile.income_stability == "bond_like":   score += 25
    elif profile.income_stability == "mixed":      score += 15
    else:                                          score += 5   # stock_like

    # Emergency-fund months (15 pts)
    months = profile.emergency_fund_months
    if months >= 6:   score += 15
    elif months >= 3: score += 11
    elif months >= 1: score += 5

    # Savings rate (15 pts)
    monthly_income = profile.household_income / 12.0
    rate = profile.monthly_surplus / monthly_income if monthly_income > 0 else 0.0
    if rate >= 0.20:   score += 15
    elif rate >= 0.10: score += 10
    elif rate >= 0.05: score += 5
    elif rate > 0:     score += 2

    # Debt burden (15 pts — negative scale)
    total_debt = sum(d.balance for d in profile.debts)
    dti = total_debt / profile.household_income if profile.household_income > 0 else 0.0
    if dti > 1.0:    score -= 15
    elif dti > 0.5:  score -= 10
    elif dti > 0.3:  score -= 5

    score = max(0.0, min(100.0, score))
    capacity_gamma = _percentile_to_gamma(score / 100.0)
    return round(score, 1), round(capacity_gamma, 3)


def _target_vol_band(gamma_band: GammaBand) -> TargetVolBand:
    """σ_target = SR_REF / γ (posture-keyed; aggressive = highest vol)."""
    return TargetVolBand(
        aggressive=round(SR_REF / gamma_band.aggressive, 4),
        mid=round(SR_REF / gamma_band.mid, 4),
        conservative=round(SR_REF / gamma_band.conservative, 4),
    )


def compute_risk_profile(profile: ValidatedProfile) -> RiskProfile:
    tolerance_band, _raw_gl, loss_aversion_flag = _compute_tolerance_band(profile)
    capacity_score, capacity_gamma = _compute_capacity_gamma(profile)

    # Combine: capacity_gamma acts as a floor (higher γ = more conservative).
    # Apply element-wise max so capacity never allows an element to be *more* aggressive.
    combined = GammaBand(
        aggressive=round(max(tolerance_band.aggressive, capacity_gamma), 3),
        mid=round(max(tolerance_band.mid, capacity_gamma), 3),
        conservative=round(max(tolerance_band.conservative, capacity_gamma), 3),
    )

    # Binding axis: capacity sets the mid when it overrides tolerance's mid
    binding_axis = (
        "capacity"
        if capacity_gamma > tolerance_band.mid
        else "tolerance"
    )

    # Tolerance score (0–100) from the GL raw score (for display)
    raw_score = sum(profile.risk_instrument_responses)
    from config import GL_SCORE_MIN, GL_SCORE_MAX
    tolerance_score = round(
        (raw_score - GL_SCORE_MIN) / (GL_SCORE_MAX - GL_SCORE_MIN) * 100.0, 1
    )

    return RiskProfile(
        gamma_band=combined,
        tolerance_gamma=tolerance_band,
        capacity_gamma=round(capacity_gamma, 3),
        capacity_score=capacity_score,
        tolerance_score=tolerance_score,
        binding_axis=binding_axis,
        target_vol_band=_target_vol_band(combined),
        loss_aversion_flag=loss_aversion_flag,
    )
