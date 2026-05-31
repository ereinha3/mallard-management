"""Canonical constants from docs/greenlight/05-contracts.md §10."""

EF_MONTHS = 3
HIGH_APR = 0.08
LOW_APR = 0.05
LTCG_RATE = 0.15
EXPECTED_MARKET_RETURN = 0.07
GAMMA_MIN = 1.5
GAMMA_MAX = 8.0
GL_MEAN = 28.27
GL_SD = 4.94
GL_ALPHA = 0.77
SR_REF = 0.4
CAPACITY_WEIGHTS = {
    "horizon": 0.30,
    "income_stability": 0.25,
    "ef": 0.15,
    "savings": 0.15,
    "debt": 0.15,
}
DRIFT_BAND_PP = 5
TX_COST_BPS = 10
BLOCK_L = 12
N_PATHS = 10000
GLIDE_BASE_AGE = 25
GLIDE_FLOOR = 0.3
