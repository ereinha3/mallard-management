from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from optimizer.blend import (
    SATELLITE_BUCKET_CAP,
    build_target_weights,
    bucket_return_matrix,
)
from optimizer.erc import erc_weights


def _prices_from_returns(returns: pd.DataFrame) -> pd.DataFrame:
    return 100.0 * (1.0 + returns).cumprod()


def _synthetic_universe() -> SimpleNamespace:
    buckets = {
        "us_total_market": ["US_TOTAL"],
        "intl_developed": ["INTL_DEV"],
        "us_sector_tech": ["TECH"],
        "china": ["CHINA"],
        "bank_loans": ["BANK_LOANS"],
        "commodities": ["COMMODITIES"],
        "gold": ["GOLD"],
        "cash_like": ["CASH"],
    }
    return SimpleNamespace(
        tickers=[ticker for tickers in buckets.values() for ticker in tickers],
        sleeves={
            "us_equity": ["US_TOTAL", "TECH"],
            "intl_equity": ["INTL_DEV", "CHINA"],
            "credit": ["BANK_LOANS"],
            "real_assets": ["COMMODITIES"],
            "gold": ["GOLD"],
            "cash_like": ["CASH"],
        },
        buckets=buckets,
        risky_sleeves=["us_equity", "intl_equity", "credit", "real_assets", "gold"],
        safe_sleeves=["cash_like"],
        risky_buckets=[
            "us_total_market",
            "intl_developed",
            "us_sector_tech",
            "china",
            "bank_loans",
            "commodities",
            "gold",
        ],
        safe_buckets=["cash_like"],
        market_weights={"cash_like": 1.0},
        bucket_market_weights={"cash_like": 1.0},
        excluded=[],
    )


def _synthetic_prices() -> pd.DataFrame:
    dates = pd.bdate_range("2023-01-02", periods=360)
    angle = np.linspace(0.0, 16.0 * np.pi, len(dates))
    returns = pd.DataFrame(
        {
            "US_TOTAL": 0.00035 + 0.0140 * np.sin(angle),
            "INTL_DEV": 0.00030 + 0.0120 * np.sin(angle + 0.7),
            "TECH": 0.00050 + 0.0010 * np.sin(angle + 1.1),
            "CHINA": 0.00020 + 0.0012 * np.cos(angle + 0.3),
            "BANK_LOANS": 0.00015 + 0.0010 * np.sin(angle + 2.0),
            "COMMODITIES": 0.00005 + 0.0011 * np.cos(angle + 1.4),
            "GOLD": 0.00005 + 0.0010 * np.sin(angle + 2.7),
            "CASH": 0.00008 + 0.0001 * np.sin(angle),
        },
        index=dates,
    )
    return _prices_from_returns(returns)


def test_satellite_cap_restores_broad_core_risky_weight() -> None:
    universe = _synthetic_universe()
    prices = _synthetic_prices()
    risk_profile = SimpleNamespace(
        target_vol_band=SimpleNamespace(mid=0.10),
        age=28,
        horizon_years=37,
    )

    bucket_matrix = bucket_return_matrix(universe, prices)
    flat_erc = erc_weights(bucket_matrix[universe.risky_buckets])

    weights = build_target_weights(risk_profile, universe, prices, method="erc")

    assert weights.blend_alpha > 0.0
    assert sum(weights.by_bucket.values()) == pytest.approx(1.0)
    assert sum(weights.by_sleeve.values()) == pytest.approx(1.0)
    assert sum(weights.by_ticker.values()) == pytest.approx(1.0)
    assert min(weights.by_bucket.values()) >= 0.0
    assert min(weights.by_sleeve.values()) >= 0.0
    assert min(weights.by_ticker.values()) >= 0.0

    risky_relative = {
        bucket: weights.by_bucket[bucket] / weights.blend_alpha
        for bucket in universe.risky_buckets
    }
    for satellite in ("us_sector_tech", "china", "bank_loans", "commodities", "gold"):
        assert risky_relative[satellite] <= SATELLITE_BUCKET_CAP + 1e-12

    for core in ("us_total_market", "intl_developed"):
        assert risky_relative[core] > flat_erc[core]

    safe_total = sum(weights.by_bucket[bucket] for bucket in universe.safe_buckets)
    assert safe_total == pytest.approx(1.0 - weights.blend_alpha)
