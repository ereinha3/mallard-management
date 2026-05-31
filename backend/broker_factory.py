from __future__ import annotations

import os

from broker.base import BrokerAdapter
from broker.simulator import SimulatorBroker


_SIMULATOR_BROKERS: dict[str, SimulatorBroker] = {}


def get_broker(user_email: str, cash_available: float = 0.0) -> BrokerAdapter:
    provider = os.environ.get("BROKER_PROVIDER", "simulator").strip().lower()
    if provider in {"", "simulator"}:
        broker = _SIMULATOR_BROKERS.get(user_email)
        if broker is None:
            broker = SimulatorBroker(initial_cash=float(cash_available))
            _SIMULATOR_BROKERS[user_email] = broker
        else:
            broker.cash = float(cash_available)
        return broker

    if provider == "alpaca_paper":
        from broker.alpaca import AlpacaBroker

        return AlpacaBroker()

    raise RuntimeError(f"Unsupported BROKER_PROVIDER '{provider}'.")
