#!/usr/bin/env python3
"""Real-data end-to-end smoke test.

Drives the full test-user journey (register -> login -> onboard -> portfolio ->
projection -> rebalance -> tax -> backtest) against the REAL market-data DB
(engine/data/greenlight.db), asserting every endpoint returns 200 with sane
real-data values, including Module E (fused gamma) and Module F (backtest).

This is NOT collected by the default pytest run (it requires the real DB and is
non-deterministic by design). Run it explicitly:

    PYTHONPATH=backend:engine python scripts/smoke/realdata_pipeline_smoke.py

Prerequisite: build the real DB first (needs network):
    env -u GREENLIGHT_DB_URL PYTHONPATH=engine \\
        python -m data.ingest.refresh --db "sqlite:///$(pwd)/engine/data/greenlight.db"

Exit code 0 = pass, 1 = fail.
"""
from __future__ import annotations

import importlib
import inspect
import json
import os
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND, ENGINE = ROOT / "backend", ROOT / "engine"
for _p in (BACKEND, ENGINE):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

REAL_DB = ENGINE / "data" / "greenlight.db"
if not REAL_DB.exists():
    print(f"SKIP: real DB not found at {REAL_DB}. Build it first (see module docstring).")
    sys.exit(0)

# Real market DB + throwaway auth DB — set BEFORE importing the app.
os.environ["GREENLIGHT_DB_URL"] = f"sqlite:///{REAL_DB}"
os.environ["MALLARD_DB_URL"] = f"sqlite:///{Path(tempfile.mkdtemp()) / 'mallard_app.db'}"

import anyio  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class _Portal:
    def call(self, func, *args):
        r = func(*args)
        if inspect.isawaitable(r):
            async def _run():
                return await r
            return anyio.run(_run)
        return r


@contextmanager
def _portal_factory():
    yield _Portal()


def _fx(name: str) -> dict:
    return json.loads((ENGINE / "fixtures" / name).read_text())


def main() -> int:
    main_mod = importlib.import_module("main")
    client = TestClient(main_mod.app)
    client._transport.portal_factory = _portal_factory  # type: ignore[attr-defined]

    email, pw = "demo-user@example.com", "correct-horse"
    persona = _fx("persona_greenlight.json")
    positions = _fx("positions_demo.json")
    cost_basis = positions["cost_basis"]

    failures: list[str] = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        status = "PASS" if cond else "FAIL"
        print(f"  [{status}] {name}{(' — ' + detail) if detail else ''}")
        if not cond:
            failures.append(name)

    r = client.post("/api/v1/auth/register", json={"email": email, "password": pw, "name": "Demo User"})
    check("register", r.status_code == 200, f"status {r.status_code}")
    r = client.post("/api/v1/auth/login", json={"email": email, "password": pw})
    check("login token", r.status_code == 200 and r.json().get("token") == f"mock-token-{email}")

    r = client.post(f"/api/v1/onboard?user_email={email}", json=persona)
    ob = r.json()
    check("onboard greenlight", r.status_code == 200 and ob.get("status") == "greenlight")

    # Module E — fused risk profile
    rp = ob.get("risk_profile", {})
    check("E: gamma_band present", isinstance(rp.get("gamma_band"), dict), str(rp.get("gamma_band")))
    check("E: signal_confidence present", rp.get("signal_confidence") is not None,
          f"confidence={rp.get('signal_confidence')}, binding={rp.get('binding_axis')}")

    # Real ERC portfolio
    pf = ob["portfolio"]
    w = pf["weights"]
    check("portfolio weights sum ~1.0", abs(sum(w["by_ticker"].values()) - 1.0) < 1e-6)
    check("portfolio real expected_vol > 0", pf["metrics"]["expected_vol"] > 0,
          f"vol={pf['metrics']['expected_vol']:.4f}")

    r = client.post("/api/v1/projection", json={
        "weights": w, "horizon_years": persona["horizon_years"], "monthly_contribution": 500,
        "capital_on_hand": persona["capital_on_hand"], "goal_target": persona["goal_target"],
        "generator": "stationary_bootstrap", "n_paths": 2000, "seed": 7})
    pj = r.json()
    check("projection", r.status_code == 200 and 0 <= pj.get("p_success", -1) <= 1,
          f"p_success={pj.get('p_success')}")

    r = client.post("/api/v1/rebalance", json={"positions": positions, "weights": w})
    rb = r.json()
    check("rebalance", r.status_code == 200 and rb.get("action") in {"none", "steer", "trade"},
          f"action={rb.get('action')}")

    r = client.post("/api/v1/tax/report",
                    json={"positions": positions, "cost_basis": cost_basis, "filing_status": "single"})
    tx = r.json()
    check("tax report (TLH + wash-sale)", r.status_code == 200 and len(tx.get("harvestable", [])) > 0,
          f"harvestable={len(tx.get('harvestable', []))}, wash_sale={len(tx.get('wash_sale_warnings', []))}")

    # Module F — backtest
    r = client.post("/api/v1/backtest", json={"weights": w})
    bt = r.json()
    ok = r.status_code == 200 and len(bt.get("equity_curve", [])) > 0 and "metrics" in bt
    detail = ""
    if ok:
        m = bt["metrics"]
        detail = (f"{len(bt['equity_curve'])} pts, maxDD={m.get('max_drawdown'):.4f}, "
                  f"sharpe={m.get('sharpe'):.4f}, benchmarks={list(bt.get('benchmarks', {}).keys())}")
    check("F: backtest", ok, detail)

    print()
    if failures:
        print(f"RESULT: FAIL ({len(failures)} check(s): {', '.join(failures)})")
        return 1
    print("RESULT: PASS — full real-data pipeline green")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
