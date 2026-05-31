from __future__ import annotations

from contextlib import contextmanager
import inspect

import anyio
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import data_routes


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
    app = FastAPI()
    app.include_router(data_routes.router)
    client = TestClient(app)
    client._transport.portal_factory = current_thread_portal_factory
    return client


def test_data_routes_read_from_seeded_db():
    client = _client()

    instruments = client.get("/data/instruments")
    buckets = client.get("/data/buckets")
    prices = client.get("/data/prices/VTI")

    assert instruments.status_code == 200
    assert buckets.status_code == 200
    assert prices.status_code == 200
    assert any(row["ticker"] == "VTI" for row in instruments.json())
    assert any(row["bucket"] == "us_equity" for row in buckets.json())
    assert prices.json()[0]["ticker"] == "VTI"


def test_refresh_route_delegates_without_network(monkeypatch):
    monkeypatch.setattr(
        data_routes.refresh_module,
        "refresh",
        lambda: {"instruments": 1, "prices": 2, "instrument_meta": 1, "macro_series": 1},
    )

    response = _client().post("/data/refresh")

    assert response.status_code == 200
    assert response.json()["prices"] == 2
