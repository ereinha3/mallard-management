import pytest

from profiler.capacity import capacity_score, capacity_to_gamma
from profiler.profile import build_risk_profile
from profiler.tolerance import score_to_gamma_band
from profiler.validate import validate_profile
from schemas.models import UserProfile, ValidatedProfile
from tests.factories import maya_greenlit


def test_gamma_band_matches_worked_example():
    band = score_to_gamma_band(raw_score=30.0)

    assert round(band.mid, 2) == 2.75
    assert round(band.aggressive, 2) == 2.11
    assert round(band.conservative, 2) == 3.78
    assert band.aggressive <= band.mid <= band.conservative


def test_validate_profile_computes_derived_fields():
    vp = validate_profile(maya_greenlit())

    assert isinstance(vp, ValidatedProfile)
    assert vp.derived.required_emergency_fund == 9600
    assert vp.derived.monthly_surplus == 3300
    assert not hasattr(vp, "confidence")
    assert not hasattr(vp, "uncertainty_flags")


def test_validate_profile_rejects_bad_ranges_and_missing_fields():
    payload = maya_greenlit().model_dump()
    payload["age"] = 17

    with pytest.raises(Exception):
        validate_profile(payload)

    payload = maya_greenlit().model_dump()
    del payload["goals"]

    with pytest.raises(Exception):
        validate_profile(payload)


def test_validate_profile_returns_clarification_for_aggressive_panic_sell():
    profile = maya_greenlit()
    profile.loss_scenario_response = "sell_some"

    result = validate_profile(profile)

    assert isinstance(result, dict)
    assert "clarification_requests" in result
    assert "sell" in result["clarification_requests"][0].lower()
    assert "risk" in result["clarification_requests"][0].lower()


def test_capacity_score_and_gamma_match_maya_pin():
    vp = validate_profile(maya_greenlit())

    score = capacity_score(vp)
    gamma = capacity_to_gamma(score)

    assert 72.0 <= score <= 73.5
    assert 2.35 <= gamma <= 2.39


def test_risk_profile_combines_capacity_floor_elementwise():
    vp = validate_profile(maya_greenlit())
    rp = build_risk_profile(vp)

    assert rp.binding_axis == "tolerance"
    assert rp.gamma_band.mid == pytest.approx(rp.tolerance_gamma.mid)
    assert rp.gamma_band.aggressive == pytest.approx(
        max(rp.tolerance_gamma.aggressive, rp.capacity_gamma)
    )
    assert rp.gamma_band.aggressive <= rp.gamma_band.mid <= rp.gamma_band.conservative
    assert rp.target_vol_band.aggressive > rp.target_vol_band.mid
    assert rp.target_vol_band.mid > rp.target_vol_band.conservative


def test_short_horizon_capacity_binds_mid():
    profile = maya_greenlit()
    profile.horizon_years = 1
    vp = validate_profile(profile)

    rp = build_risk_profile(vp)

    assert rp.binding_axis == "capacity"
    assert rp.gamma_band.mid == pytest.approx(rp.capacity_gamma)
    assert rp.gamma_band.mid >= rp.tolerance_gamma.mid


def test_build_risk_profile_rejects_clarification_payload():
    profile = maya_greenlit()
    profile.loss_scenario_response = "sell_all"

    with pytest.raises(ValueError):
        build_risk_profile(profile)
