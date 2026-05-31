"""Black-Litterman sleeve optimizer."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import numpy as np

from optimizer.erc import cov_ledoit_wolf

DEFAULT_VIEW_TILT = 0.00025
DEFAULT_ESG_DEFENSIVE_TILT = 0.00005


def _labels(matrix: Any) -> list[str]:
    values = np.asarray(matrix, dtype=float)
    if values.ndim != 2 or values.shape[0] != values.shape[1]:
        raise ValueError("covariance must be a square matrix")
    fallback = [f"asset_{idx}" for idx in range(values.shape[0])]
    return [str(label) for label in getattr(matrix, "columns", fallback)]


def _normalized_vector(labels: list[str], weights: Mapping[str, float]) -> np.ndarray:
    vector = np.asarray([float(weights.get(label, 0.0)) for label in labels], dtype=float)
    if not np.all(np.isfinite(vector)) or vector.sum() <= 0.0:
        vector = np.ones(len(labels), dtype=float)
    vector = np.maximum(vector, 0.0)
    return vector / vector.sum()


def _view_targets_for_text(text: str, labels: list[str]) -> list[str]:
    value = text.strip().lower().replace("-", "_").replace(" ", "_")
    targets: list[str] = []
    for label in labels:
        normalized = label.lower().replace("-", "_").replace(" ", "_")
        if normalized in value or value in normalized:
            targets.append(label)

    aliases = {
        "us_equity": ("domestic", "usa", "u_s", "s&p", "sp500"),
        "intl_equity": ("intl", "international", "foreign", "developed"),
        "reits": ("reit", "real_estate", "property"),
        "gold": ("gold", "commodity", "commodities"),
        "bonds": ("bond", "fixed_income", "core_fixed"),
        "tips": ("tips", "inflation", "inflation_protected"),
    }
    for label, terms in aliases.items():
        if label in labels and any(term in value for term in terms):
            targets.append(label)
    return sorted(set(targets))


def _profile_view_tilts(labels: list[str], profile: Any | None) -> dict[str, float]:
    if profile is None:
        return {}

    tilts = {label: 0.0 for label in labels}
    themes = getattr(profile, "sector_theme_tilts", None)
    if isinstance(profile, Mapping):
        themes = profile.get("sector_theme_tilts", themes)
    for theme in themes or []:
        text = str(theme)
        negative = any(word in text.lower() for word in ("avoid", "exclude", "away", "underweight"))
        sign = -1.0 if negative else 1.0
        for target in _view_targets_for_text(text, labels):
            tilts[target] += sign * DEFAULT_VIEW_TILT

    exclusions = getattr(profile, "esg_exclusions", None)
    if isinstance(profile, Mapping):
        exclusions = profile.get("esg_exclusions", exclusions)
    active_exclusions = [item for item in exclusions or [] if str(item) != "none"]
    if active_exclusions:
        for label in labels:
            if label in {"us_equity", "intl_equity", "reits"}:
                tilts[label] -= DEFAULT_ESG_DEFENSIVE_TILT * len(active_exclusions)
            if label in {"bonds", "tips", "gold"}:
                tilts[label] += DEFAULT_ESG_DEFENSIVE_TILT * len(active_exclusions)

    return {label: tilt for label, tilt in tilts.items() if abs(tilt) > 0.0}


def black_litterman_weights_from_cov(
    covariance: Any,
    market_weights: Mapping[str, float],
    views: Mapping[str, float] | None = None,
    *,
    profile: Any | None = None,
    risk_aversion: float = 2.5,
    tau: float = 0.05,
    view_confidence: float = 0.5,
) -> dict[str, float]:
    """Return long-only sleeve weights from a Black-Litterman posterior.

    ``views`` are absolute excess-return tilts over the equilibrium prior for
    each named sleeve. Profile preferences are translated into the same units.
    """

    sigma = np.asarray(covariance, dtype=float)
    sigma = (sigma + sigma.T) / 2.0 + np.eye(sigma.shape[0]) * 1e-12
    labels = _labels(covariance)
    if sigma.shape != (len(labels), len(labels)):
        raise ValueError("covariance labels must match covariance shape")
    if risk_aversion <= 0.0:
        raise ValueError("risk_aversion must be positive")
    if tau <= 0.0:
        raise ValueError("tau must be positive")

    w_mkt = _normalized_vector(labels, market_weights)
    pi = float(risk_aversion) * sigma @ w_mkt

    view_tilts = _profile_view_tilts(labels, profile)
    if views is not None:
        for label, tilt in views.items():
            if str(label) in labels:
                view_tilts[str(label)] = view_tilts.get(str(label), 0.0) + float(tilt)

    active = [label for label in labels if abs(view_tilts.get(label, 0.0)) > 0.0]
    posterior = pi.copy()
    if active:
        p = np.zeros((len(active), len(labels)), dtype=float)
        q = np.zeros(len(active), dtype=float)
        for row, label in enumerate(active):
            idx = labels.index(label)
            p[row, idx] = 1.0
            q[row] = pi[idx] + view_tilts[label]

        tau_sigma = tau * sigma
        confidence = min(1.0, max(1e-6, float(view_confidence)))
        view_variance = np.diag(p @ tau_sigma @ p.T)
        omega = np.diag(np.maximum(view_variance * ((1.0 - confidence) / confidence), 1e-12))
        middle = p @ tau_sigma @ p.T + omega
        posterior = pi + tau_sigma @ p.T @ np.linalg.pinv(middle) @ (q - p @ pi)

    raw = np.linalg.pinv(float(risk_aversion) * sigma) @ posterior
    raw = np.maximum(raw, 0.0)
    if not np.all(np.isfinite(raw)) or raw.sum() <= 0.0:
        raw = w_mkt
    weights = raw / raw.sum()
    return dict(zip(labels, (float(value) for value in weights), strict=True))


def black_litterman_weights(
    returns: Any,
    market_weights: Mapping[str, float],
    profile: Any | None = None,
    *,
    risk_aversion: float = 2.5,
    tau: float = 0.05,
    view_confidence: float = 0.5,
) -> dict[str, float]:
    """Estimate shrunk covariance from sleeve returns and solve BL weights."""

    covariance = cov_ledoit_wolf(returns)
    return black_litterman_weights_from_cov(
        covariance,
        market_weights,
        profile=profile,
        risk_aversion=risk_aversion,
        tau=tau,
        view_confidence=view_confidence,
    )
