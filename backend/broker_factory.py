from __future__ import annotations

import os

from broker.base import BrokerAdapter
from broker.alpaca_broker import AlpacaBrokerAPI
from broker.simulator import SimulatorBroker
from persistence import InvestmentAccount, get_session


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

    if provider == "alpaca_broker":
        db = get_session()
        try:
            account = (
                db.query(InvestmentAccount)
                .filter(InvestmentAccount.user_email == user_email)
                .first()
            )
            account_id = account.alpaca_account_id if account else None
        finally:
            db.close()

        if not account_id:
            raise RuntimeError(
                "BROKER_PROVIDER=alpaca_broker requires a stored alpaca_account_id "
                f"for user {user_email}."
            )
        return AlpacaBrokerAPI(account_id)

    raise RuntimeError(f"Unsupported BROKER_PROVIDER '{provider}'.")
