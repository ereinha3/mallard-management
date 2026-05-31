"""Regression tests for the CAL-blend annualization factor.

The walk-forward backtest passes a monthly PeriodIndex into the optimizer. A
prior bug annualized that monthly covariance with the daily factor (252),
inflating the risky-sleeve vol by sqrt(252/12) ~= 4.58x and systematically
under-risking the portfolio. _periods_per_year must infer ~12 for monthly data
and ~252 for daily data.
"""

import pandas as pd
import pytest

from optimizer.blend import _periods_per_year


def test_periods_per_year_monthly_period_index_is_twelve():
    idx = pd.period_range("2005-01", periods=60, freq="M")
    assert _periods_per_year(idx) == pytest.approx(12.0, abs=0.2)


def test_periods_per_year_monthly_timestamps_is_twelve():
    idx = pd.date_range("2005-01-31", periods=60, freq="ME")
    assert _periods_per_year(idx) == pytest.approx(12.0, abs=0.2)


def test_periods_per_year_daily_is_about_252():
    idx = pd.bdate_range("2020-01-01", periods=252)
    assert _periods_per_year(idx) == pytest.approx(252.0, rel=0.05)


def test_periods_per_year_does_not_silently_fall_back_to_daily_for_monthly():
    # The bug: a monthly PeriodIndex hit the 252.0 fallback. Guard against
    # regression — monthly data must never annualize anywhere near 252.
    idx = pd.period_range("2005-01", periods=36, freq="M")
    assert _periods_per_year(idx) < 20.0
