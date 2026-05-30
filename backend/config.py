"""
Canonical constants — single source of truth (05-contracts.md §10).
No other file may redefine these values.
"""

# ── Gate thresholds ───────────────────────────────────────────────────────────
HIGH_APR = 0.08         # halt if any debt APR > this
LOW_APR = 0.05          # note but allow investing alongside if APR < this
EF_MONTHS = 3.0         # emergency-fund months required

# ── Gate debt-vs-invest math (fixed constants; tax layer is a separate workstream) ──
EXPECTED_MARKET_RETURN = 0.07   # expected nominal equity return used in comparison
LTCG_RATE = 0.15                # long-term capital gains rate used in gate math
EXPECTED_AFTER_TAX_MARKET_RETURN = EXPECTED_MARKET_RETURN * (1.0 - LTCG_RATE)  # 0.0595

# ── Grable-Lytton 13-item scale (normative calibration from research §2) ─────
GL_SCORE_MIN = 13       # minimum possible raw score (all 1s)
GL_SCORE_MAX = 47       # maximum possible raw score (all 4s)
GL_MEAN = 28.27         # normative mean
GL_SD = 4.94            # normative standard deviation
GL_ALPHA = 0.77         # Cronbach's α (instrument reliability)

# ── γ (CRRA risk-aversion) range — log-spaced ────────────────────────────────
GAMMA_MIN = 1.5         # most aggressive (γ → target vol via SR_REF / γ)
GAMMA_MAX = 8.0         # most conservative

# ── Sharpe-ratio reference for γ → target-vol labeling ───────────────────────
SR_REF = 0.4            # σ_target = SR_REF / γ  (posture-labeling only; not a return forecast)

# ── Rebalancer ────────────────────────────────────────────────────────────────
DRIFT_BAND_PP = 5       # ±5 percentage-point band before a trade is triggered

# ── Capacity-score component weights (must sum to 1.0) ───────────────────────
CAPACITY_WEIGHTS = {
    "horizon":           0.30,
    "income_stability":  0.25,
    "emergency_fund":    0.15,
    "savings_rate":      0.15,
    "debt_burden":       0.15,
}
