"""Shared pytest configuration for the backend test suite.

`persistence.py` binds its SQLAlchemy engine at import time from
``MALLARD_DB_URL`` (persistence.py:104). If any test module imports the app
(directly or transitively) at collection time — before a per-file fixture sets
that env var — the engine latches onto the default on-disk ``mallard_app.db``
and tests silently read/write that real file, polluting it and producing
spurious duplicate-registration failures on re-runs.

Setting ``MALLARD_DB_URL`` to a throwaway temp database here, at conftest import
time (which pytest always loads before any test module), guarantees the engine
binds to a clean per-process database no matter the collection order.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
ENGINE_DIR = ROOT / "engine"
for path in (ENGINE_DIR, BACKEND_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

_TEST_APP_DB = Path(tempfile.mkdtemp(prefix="mallard-test-app-")) / "mallard_app.db"
os.environ["MALLARD_DB_URL"] = f"sqlite:///{_TEST_APP_DB}"
