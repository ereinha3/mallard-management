from __future__ import annotations

from contextlib import contextmanager
import importlib
import inspect
import json
import sys
from pathlib import Path

import anyio
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
ENGINE_DIR = ROOT / "engine"
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


def _client(app: FastAPI) -> TestClient:
    client = TestClient(app)
    client._transport.portal_factory = current_thread_portal_factory
    return client


@pytest.fixture(scope="session")
def test_app(tmp_path_factory: pytest.TempPathFactory):
    db_path = tmp_path_factory.mktemp("mallard-app-db") / "mallard_app.db"
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setenv("MALLARD_DB_URL", f"sqlite:///{db_path}")
    try:
        module = importlib.import_module("main")
        yield module.app
    finally:
        monkeypatch.undo()


@pytest.fixture(scope="session")
def seeded_db_url(tmp_path_factory: pytest.TempPathFactory) -> str:
    db_path = tmp_path_factory.mktemp("greenlight-backend-db") / "greenlight.db"
    db_url = f"sqlite:///{db_path}"
    seed_database(db_url)
    return db_url


@pytest.fixture(autouse=True)
def greenlight_db(monkeypatch: pytest.MonkeyPatch, seeded_db_url: str) -> None:
    monkeypatch.setenv("GREENLIGHT_DB_URL", seeded_db_url)


def _persona(name: str) -> dict:
    return json.loads((ENGINE_DIR / "fixtures" / name).read_text())


def _register(client: TestClient, email: str) -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse", "name": "Test User"},
    )
    assert response.status_code == 200
    return response.json()


def test_register_logs_user_registered_event(test_app: FastAPI):
    client = _client(test_app)
    email = "events-register@example.com"

    _register(client, email)

    response = client.get(f"/api/v1/users/{email}/events")
    assert response.status_code == 200
    assert any(event["type"] == "user_registered" for event in response.json())


def test_onboard_logs_completed_event_with_gate_status(test_app: FastAPI):
    client = _client(test_app)
    email = "events-onboard@example.com"
    _register(client, email)

    onboard_response = client.post(
        f"/api/v1/onboard?user_email={email}",
        json=_persona("persona_greenlight.json"),
    )
    assert onboard_response.status_code == 200

    response = client.get(f"/api/v1/users/{email}/events")
    assert response.status_code == 200
    onboard_events = [
        event
        for event in response.json()
        if event["type"] == "onboard_completed"
    ]
    assert onboard_events
    assert onboard_events[0]["payload"]["gate_status"] == onboard_response.json()["status"]


def test_unknown_user_events_returns_404(test_app: FastAPI):
    client = _client(test_app)

    response = client.get("/api/v1/users/unknown-events@example.com/events")

    assert response.status_code == 404
