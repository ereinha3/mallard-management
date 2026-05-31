import pytest

from profiler.fusion import fuse_risk_signals
from profiler.profile import build_risk_profile
from schemas.models import RiskSignals
from tests.factories import maya_greenlit


def test_inverse_variance_pooling_pins_hand_computed_stats():
    signals = RiskSignals(
        gl13_gamma=2.0,
        gl13_var=0.25,
        dohmen_gamma=2.6,
        dohmen_var=0.25,
        loss_aversion_gamma=3.2,
        loss_aversion_var=0.25,
    )

    result = fuse_risk_signals(signals)

    assert result.needs_clarification is False
    assert result.fixed_gamma == pytest.approx(2.6)
    assert result.q == pytest.approx(2.88)
    assert result.i_squared == pytest.approx(0.3055555555555556)
    assert result.tau_squared == pytest.approx(0.11)
    assert result.combined_var == pytest.approx(0.12)
    assert result.gamma_band.aggressive == pytest.approx(2.2535898384862245)
    assert result.gamma_band.mid == pytest.approx(2.6)
    assert result.gamma_band.conservative == pytest.approx(2.9464101615137756)
    assert result.signal_confidence == pytest.approx(0.6944444444444444)
    assert result.contradiction_note is None


def test_fusion_requests_clarification_when_signals_contradict():
    signals = RiskSignals(
        gl13_gamma=2.0,
        gl13_var=0.25,
        dohmen_gamma=3.0,
        dohmen_var=0.25,
        loss_aversion_gamma=8.0,
        loss_aversion_var=0.25,
    )

    result = fuse_risk_signals(signals)

    assert result.needs_clarification is True
    assert result.fixed_gamma == pytest.approx(4.333333333333333)
    assert result.q == pytest.approx(82.66666666666667)
    assert result.i_squared == pytest.approx(0.9758064516129032)
    assert result.tau_squared == pytest.approx(10.083333333333334)
    assert result.contradiction_note is not None
    assert "risk signals disagree" in result.contradiction_note


def test_profile_agreeing_signals_yield_fused_capacity_capped_band():
    profile = maya_greenlit()
    profile.dohmen_risk = 6
    profile.loss_aversion_probe = 150.0

    result = build_risk_profile(profile)

    assert not isinstance(result, dict)
    assert result.binding_axis == "tolerance"
    assert result.signal_confidence > 0.7
    assert result.contradiction_note is None
    assert result.gamma_band.aggressive == pytest.approx(
        max(result.tolerance_gamma.aggressive, result.capacity_gamma)
    )
    assert result.gamma_band.mid == pytest.approx(result.tolerance_gamma.mid)
    assert result.gamma_band.aggressive <= result.gamma_band.mid <= result.gamma_band.conservative


def test_profile_disagreeing_signals_yield_clarification_not_profile():
    profile = maya_greenlit()
    profile.risk_instrument_responses = [4] * 13
    profile.dohmen_risk = 0
    profile.loss_aversion_probe = 400.0
    profile.loss_scenario_response = "buy_more"

    result = build_risk_profile(profile)

    assert isinstance(result, dict)
    assert "clarification_requests" in result
    assert "risk signals disagree" in result["clarification_requests"][0]
