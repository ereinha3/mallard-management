#!/usr/bin/env python3
"""Live Alpaca Broker API sandbox smoke test.

Creates a sandbox brokerage account, links a manual sandbox ACH relationship,
submits a deposit, buys a tiny target portfolio, and reads positions.

This is NOT part of pytest and makes live network calls when credentials are
present. Run it explicitly:

    PYTHONPATH=backend:engine python scripts/smoke/alpaca_broker_smoke.py

Prerequisite: BROKER_API_KEY and BROKER_SECRET_KEY in backend/.env.
Exit code 0 = pass, 1 = fail, 0 (SKIP) = missing prerequisite.
"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND, ENGINE = ROOT / "backend", ROOT / "engine"
for _p in (BACKEND, ENGINE):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

if not os.environ.get("BROKER_API_KEY") or not os.environ.get("BROKER_SECRET_KEY"):
    print("SKIP: BROKER_API_KEY/BROKER_SECRET_KEY not set in backend/.env or environment.")
    sys.exit(0)

from brokerage import BrokerageService  # noqa: E402
from broker.alpaca_broker import AlpacaBrokerAPI  # noqa: E402
from schemas.models import OrderPlan  # noqa: E402


def main() -> int:
    failures: list[str] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(': ' + detail) if detail else ''}")
        if not ok:
            failures.append(name)

    service = BrokerageService()
    account_id = ""

    try:
        email = f"alpaca-smoke-{uuid.uuid4().hex}@example.com"
        account_id = service.create_brokerage_account({"email_address": email})
        check("create brokerage account", bool(account_id), account_id)
    except Exception as exc:
        check("create brokerage account", False, str(exc))

    try:
        relationship = service.create_ach_relationship(
            account_id,
            {
                "nickname": "Sandbox Checking",
                "routing_number": "121000358",
                "account_number": "123456789",
                "account_type": "CHECKING",
            },
        )
        check("create ACH relationship", bool(getattr(relationship, "id", None)), str(relationship))
    except Exception as exc:
        check("create ACH relationship", False, str(exc))

    try:
        deposit = service.create_deposit(account_id, 25.0)
        check("create ACH deposit", bool(getattr(deposit, "id", None)), str(deposit))
    except Exception as exc:
        check("create ACH deposit", False, str(exc))

    try:
        broker = AlpacaBrokerAPI(account_id)
        fills = broker.place_order(
            OrderPlan(
                method="lump_sum",
                buys=[
                    {"ticker": "VTI", "dollars": 15.0, "shares": 0.0},
                    {"ticker": "BND", "dollars": 10.0, "shares": 0.0},
                ],
                schedule=[],
            )
        )
        check("submit target portfolio buys", len(fills) == 2, f"fills={fills}")
    except Exception as exc:
        check("submit target portfolio buys", False, str(exc))

    try:
        positions = AlpacaBrokerAPI(account_id).read_positions()
        check("read positions", positions.portfolio_value >= 0, positions.model_dump_json())
    except Exception as exc:
        check("read positions", False, str(exc))

    print()
    if failures:
        print(f"RESULT: FAIL ({len(failures)} check(s): {', '.join(failures)})")
        return 1
    print("RESULT: PASS - Alpaca Broker API sandbox flow completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
