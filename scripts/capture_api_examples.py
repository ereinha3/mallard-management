from __future__ import annotations

from contextlib import contextmanager
import importlib
import inspect
import json
import os
from pathlib import Path
import sys
import tempfile
from typing import Any

import anyio
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
ENGINE_DIR = ROOT / "engine"
OUTPUT_DIR = ROOT / "docs" / "greenlight" / "api-examples"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ENGINE_DIR) not in sys.path:
    sys.path.append(str(ENGINE_DIR))

from data.seed import seed_database  # noqa: E402


class CurrentThreadPortal:
    def call(self, func, *args):
        result = func(*args)
        if inspect.isawaitable(result):

            async def runner():
                return await result

            return anyio.run(runner)
        return result


@contextmanager
def current_thread_portal_factory():
    yield CurrentThreadPortal()


def _client() -> TestClient:
    module = importlib.import_module("main")
    client = TestClient(module.app)
    client._transport.portal_factory = current_thread_portal_factory
    return client


def _fixture(name: str) -> dict[str, Any]:
    return json.loads((ENGINE_DIR / "fixtures" / name).read_text())


def _write_json(name: str, payload: Any) -> None:
    (OUTPUT_DIR / f"{name}.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _checked_json(response, endpoint: str) -> Any:
    if response.status_code != 200:
        raise RuntimeError(f"{endpoint} returned {response.status_code}: {response.text}")
    return response.json()


def _write_readme() -> None:
    (OUTPUT_DIR / "README.md").write_text(
        "\n".join(
            [
                "# Greenlight API Examples",
                "",
                "Pretty-printed response payloads captured from a seeded offline TestClient run.",
                "",
                "| File | Endpoint |",
                "| --- | --- |",
                "| `config.json` | `GET /api/v1/config` |",
                "| `onboard-greenlight.json` | `POST /api/v1/onboard?user_email={email}` with `persona_greenlight.json` |",
                "| `onboard-halt.json` | `POST /api/v1/onboard` with `persona_halt.json` |",
                "| `portfolio.json` | `POST /api/v1/portfolio` with `persona_greenlight.json` |",
                "| `projection.json` | `POST /api/v1/projection` with greenlight weights |",
                "| `rebalance.json` | `POST /api/v1/rebalance` with `positions_demo.json` |",
                "| `tax-report.json` | `POST /api/v1/tax/report` with `positions_demo.json` and its `cost_basis` |",
                "| `profile.json` | `GET /api/v1/profile/{email}` after onboarding |",
                "| `user-record.json` | `GET /api/v1/users/{email}/record` after onboarding |",
                "",
                "Regenerate with: `python scripts/capture_api_examples.py`",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="mallard-api-examples-") as tmp:
        tmp_path = Path(tmp)
        os.environ["GREENLIGHT_DB_URL"] = f"sqlite:///{tmp_path / 'greenlight.db'}"
        os.environ["MALLARD_DB_URL"] = f"sqlite:///{tmp_path / 'mallard_app.db'}"
        seed_database(os.environ["GREENLIGHT_DB_URL"])

        client = _client()
        email = "api-examples@example.com"
        password = "correct-horse"
        persona_greenlight = _fixture("persona_greenlight.json")
        persona_halt = _fixture("persona_halt.json")
        positions_demo = _fixture("positions_demo.json")
        cost_basis = positions_demo["cost_basis"]

        _checked_json(
            client.post(
                "/api/v1/auth/register",
                json={"email": email, "password": password, "name": "API Examples"},
            ),
            "POST /api/v1/auth/register",
        )
        _checked_json(
            client.post("/api/v1/auth/login", json={"email": email, "password": password}),
            "POST /api/v1/auth/login",
        )

        config = _checked_json(client.get("/api/v1/config"), "GET /api/v1/config")
        onboard_greenlight = _checked_json(
            client.post(f"/api/v1/onboard?user_email={email}", json=persona_greenlight),
            "POST /api/v1/onboard?user_email={email}",
        )
        onboard_halt = _checked_json(
            client.post("/api/v1/onboard", json=persona_halt),
            "POST /api/v1/onboard",
        )
        portfolio = _checked_json(
            client.post("/api/v1/portfolio", json={"profile": persona_greenlight}),
            "POST /api/v1/portfolio",
        )
        weights = portfolio["weights"]
        projection = _checked_json(
            client.post(
                "/api/v1/projection",
                json={
                    "weights": weights,
                    "horizon_years": persona_greenlight["horizon_years"],
                    "monthly_contribution": 500,
                    "capital_on_hand": persona_greenlight["capital_on_hand"],
                    "goal_target": persona_greenlight["goal_target"],
                    "generator": "stationary_bootstrap",
                    "n_paths": 2000,
                    "seed": 7,
                },
            ),
            "POST /api/v1/projection",
        )
        rebalance = _checked_json(
            client.post("/api/v1/rebalance", json={"positions": positions_demo, "weights": weights}),
            "POST /api/v1/rebalance",
        )
        tax_report = _checked_json(
            client.post(
                "/api/v1/tax/report",
                json={
                    "positions": positions_demo,
                    "cost_basis": cost_basis,
                    "filing_status": "single",
                },
            ),
            "POST /api/v1/tax/report",
        )
        profile = _checked_json(client.get(f"/api/v1/profile/{email}"), "GET /api/v1/profile/{email}")
        user_record = _checked_json(
            client.get(f"/api/v1/users/{email}/record"),
            "GET /api/v1/users/{email}/record",
        )

    examples = {
        "config": config,
        "onboard-greenlight": onboard_greenlight,
        "onboard-halt": onboard_halt,
        "portfolio": portfolio,
        "projection": projection,
        "rebalance": rebalance,
        "tax-report": tax_report,
        "profile": profile,
        "user-record": user_record,
    }
    for name, payload in examples.items():
        _write_json(name, payload)
    _write_readme()

    for name in sorted(examples):
        print(OUTPUT_DIR / f"{name}.json")


if __name__ == "__main__":
    main()
