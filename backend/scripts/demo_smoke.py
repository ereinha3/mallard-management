import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


TIMEOUT_SECONDS = 60


def _api_url(base, path, params=None):
    url = base.rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    return url


def _decode_body(raw_body):
    return raw_body.decode("utf-8", "replace")


def _parse_json(text):
    if not text:
        return {}
    try:
        return json.loads(text)
    except ValueError as exc:
        raise RuntimeError("response was not JSON: %s" % text) from exc


def _request_json(method, url, body=None):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            status = response.getcode()
            text = _decode_body(response.read())
    except urllib.error.HTTPError as exc:
        status = exc.code
        text = _decode_body(exc.read())

    if status != 200:
        raise RuntimeError("HTTP %s: %s" % (status, text))
    return _parse_json(text)


def _get_json(base, path):
    return _request_json("GET", _api_url(base, path))


def _post_json(base, path, body, params=None):
    return _request_json("POST", _api_url(base, path, params), body)


def _default_email():
    uuid_path = Path("/proc/sys/kernel/random/uuid")
    if uuid_path.exists():
        token = uuid_path.read_text(encoding="utf-8").strip().replace("-", "")[:12]
    else:
        token = hex(id(object()))[2:]
    return "demo-smoke-%s@example.com" % token


def _fixture_path():
    return Path(__file__).resolve().parents[2] / "engine" / "fixtures" / "persona_greenlight.json"


def _load_persona(state):
    persona = state.get("persona")
    if persona is None:
        with _fixture_path().open(encoding="utf-8") as handle:
            persona = json.load(handle)
        state["persona"] = persona
    return persona


def _as_dict(value, label):
    if not isinstance(value, dict):
        raise RuntimeError("%s was not an object" % label)
    return value


def _as_number(value, label):
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("%s was not numeric" % label) from exc


def _onboard_weights(state):
    onboard = _as_dict(state.get("onboard"), "onboard response")
    portfolio = _as_dict(onboard.get("portfolio"), "onboard portfolio")
    weights = _as_dict(portfolio.get("weights"), "onboard portfolio weights")
    if not weights.get("by_ticker") or not weights.get("by_sleeve"):
        raise RuntimeError("onboard portfolio weights were incomplete")
    return weights


def _monthly_contribution(state, persona):
    onboard = state.get("onboard")
    if isinstance(onboard, dict):
        validated = onboard.get("validated_profile")
        if isinstance(validated, dict) and validated.get("monthly_surplus") is not None:
            return max(0.0, _as_number(validated.get("monthly_surplus"), "monthly_surplus"))
    income = _as_number(persona.get("household_income"), "household_income")
    expenses = _as_number(persona.get("monthly_expenses"), "monthly_expenses")
    return max(0.0, (income / 12.0) - expenses)


def _seeded_positions(weights):
    by_ticker = weights.get("by_ticker")
    if not isinstance(by_ticker, dict):
        raise RuntimeError("weights.by_ticker was not an object")

    tickers = sorted(
        ticker
        for ticker, weight in by_ticker.items()
        if _as_number(weight, "weights.by_ticker.%s" % ticker) > 0.0
    )[:3]
    if not tickers:
        raise RuntimeError("weights.by_ticker had no positive weights")

    items = []
    position_value = 1000.0
    for ticker in tickers:
        items.append(
            {
                "ticker": ticker,
                "shares": 10.0,
                "avg_cost": position_value / 10.0,
                "market_value": position_value,
            }
        )

    return {
        "items": items,
        "portfolio_value": position_value * len(items),
        "cash": 0.0,
    }


def _tax_positions():
    return {
        "items": [
            {"ticker": "BND", "shares": 10.0, "avg_cost": 100.0, "market_value": 950.0},
            {"ticker": "GLD", "shares": 5.0, "avg_cost": 200.0, "market_value": 1200.0},
        ],
        "portfolio_value": 2150.0,
        "cash": 0.0,
    }


def _check_health(base, state):
    _get_json(base, "/health")


def _check_config(base, state):
    _get_json(base, "/api/v1/config")


def _check_register(base, state):
    email = state.get("email")
    response = _post_json(
        base,
        "/api/v1/auth/register",
        {
            "email": email,
            "password": "demo-smoke-password",
            "name": "Demo Smoke",
        },
    )
    response = _as_dict(response, "register response")
    if response.get("email") != email:
        raise RuntimeError("register response email did not match")
    if not response.get("token"):
        raise RuntimeError("register response token was missing")
    state["register"] = response


def _check_onboard(base, state):
    persona = _load_persona(state)
    email = state.get("email")
    response = _post_json(
        base,
        "/api/v1/onboard",
        persona,
        {"user_email": email},
    )
    response = _as_dict(response, "onboard response")
    if response.get("status") != "greenlight":
        raise RuntimeError("onboard status was %r" % response.get("status"))
    if not response.get("portfolio"):
        raise RuntimeError("onboard portfolio was missing")
    state["onboard"] = response


def _check_portfolio(base, state):
    persona = _load_persona(state)
    response = _post_json(base, "/api/v1/portfolio", {"profile": persona, "method": "erc"})
    response = _as_dict(response, "portfolio response")
    weights = _as_dict(response.get("weights"), "portfolio weights")
    by_sleeve = _as_dict(weights.get("by_sleeve"), "portfolio weights.by_sleeve")
    if not by_sleeve:
        raise RuntimeError("portfolio weights.by_sleeve was empty")

    sleeve_sum = sum(_as_number(value, "by_sleeve.%s" % sleeve) for sleeve, value in by_sleeve.items())
    if abs(sleeve_sum - 1.0) > 0.01:
        raise RuntimeError("portfolio weights.by_sleeve summed to %.6f" % sleeve_sum)
    state["portfolio"] = response


def _check_projection(base, state):
    persona = _load_persona(state)
    weights = _onboard_weights(state)
    payload = {
        "weights": weights,
        "horizon_years": int(_as_number(persona.get("horizon_years"), "horizon_years")),
        "monthly_contribution": _monthly_contribution(state, persona),
        "capital_on_hand": _as_number(persona.get("capital_on_hand"), "capital_on_hand"),
        "goal_target": _as_number(persona.get("goal_target"), "goal_target"),
        "generator": "stationary_bootstrap",
        "seed": 7,
        "n_paths": 200,
    }
    response = _post_json(base, "/api/v1/projection", payload)
    response = _as_dict(response, "projection response")
    if response.get("p_success") is None:
        raise RuntimeError("projection p_success was missing")
    state["projection"] = response


def _check_rebalance(base, state):
    weights = _onboard_weights(state)
    response = _post_json(
        base,
        "/api/v1/rebalance",
        {"positions": _seeded_positions(weights), "weights": weights},
    )
    state["rebalance"] = _as_dict(response, "rebalance response")


def _check_tax_report(base, state):
    response = _post_json(
        base,
        "/api/v1/tax/report",
        {
            "positions": _tax_positions(),
            "cost_basis": {"BND": 1000.0, "GLD": 1000.0},
            "filing_status": "single",
        },
    )
    state["tax_report"] = _as_dict(response, "tax report response")


def _run_step(name, func, base, state):
    try:
        func(base, state)
    except Exception as exc:
        print("FAIL %s: %s" % (name, exc))
        return False
    print("PASS %s" % name)
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Fast HTTP smoke check for a running Greenlight backend."
    )
    parser.add_argument("--base", default="http://localhost:8000")
    parser.add_argument("--email", default=_default_email())
    args = parser.parse_args(argv)

    state = {"email": args.email}
    steps = [
        ("health", _check_health),
        ("config", _check_config),
        ("register", _check_register),
        ("onboard", _check_onboard),
        ("portfolio", _check_portfolio),
        ("projection", _check_projection),
        ("rebalance", _check_rebalance),
        ("tax report", _check_tax_report),
    ]

    results = [_run_step(name, func, args.base, state) for name, func in steps]
    failures = len([result for result in results if not result])
    if failures:
        print("DEMO NOT READY ❌ (%d failures)" % failures)
        return 1

    print("DEMO READY ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
