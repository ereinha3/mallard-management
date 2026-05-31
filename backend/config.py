"""Backend re-exports for canonical engine constants."""

from __future__ import annotations

import sys
from pathlib import Path


_ENGINE_DIR = Path(__file__).resolve().parents[1] / "engine"
if str(_ENGINE_DIR) not in sys.path:
    sys.path.append(str(_ENGINE_DIR))

from schemas.constants import (  # noqa: E402
    BLOCK_L,
    CAPACITY_WEIGHTS,
    DRIFT_BAND_PP,
    EF_MONTHS,
    EXPECTED_MARKET_RETURN,
    GAMMA_MAX,
    GAMMA_MIN,
    GL_ALPHA,
    GL_MEAN,
    GL_SD,
    HIGH_APR,
    LOW_APR,
    LTCG_RATE,
    N_PATHS,
    SR_REF,
    TX_COST_BPS,
)

EXPECTED_AFTER_TAX_MARKET_RETURN = EXPECTED_MARKET_RETURN * (1.0 - LTCG_RATE)
