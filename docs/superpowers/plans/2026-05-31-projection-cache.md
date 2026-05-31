# Projection Cache (Lazy-Load) Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Execute task-by-task, commit after each task.

**Goal:** Make the dashboard's Portfolio Projection a read-through cache so the 10k-path Monte Carlo runs **once per distinct portfolio/plan**, returns instantly (and identically) on every revisit, and stops jittering between page loads.

**Architecture:** A new `projection_cache` table keyed by a SHA-256 of the projection inputs + the price-dataset version (greenlight.db mtime). `POST /api/v1/projection` becomes read-through: on a cache hit it returns the stored result; on a miss it computes with a **deterministic seed derived from the key**, stores, and returns. Caching applies only when the caller sends no explicit `seed` (the dashboard path); explicit-seed "what-if" calls stay fresh. Frontend stops double-fetching by passing the projection down into `ProjectionChart`.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (`backend/`), numpy engine (`engine/`), Vite/React (`client/`). SQLite app DB (`MALLARD_DB_URL`).

**Why input-hash, not per-email:** The endpoint is unauthenticated and the inputs (`by_ticker` weights, horizon, capital, contribution, goal) fully determine the output and differ per user — so an input-keyed cache *is* per-user, with zero auth/model changes. Invalidation is automatic: a rebalance changes weights → new key; a data refresh changes the db mtime → new key.

**Ownership flag (multi-agent):** touches `backend/persistence.py` (free lane), `backend/api/v1.py` (API/docs lane), `client/src/components/Dashboard.jsx` (frontend lane). All edits are additive. Coordinate before merge.

---

### Task 1: `projection_cache` table + helpers (backend/persistence.py)

**Files:**
- Modify: `backend/persistence.py` (add ORM class near the `Event` model ~line 345; add helpers near `log_event` ~line 504)
- Test: `backend/tests/test_projection_cache.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_projection_cache.py
from backend import persistence


def test_projection_cache_roundtrip_and_miss():
    db = persistence.get_session()
    try:
        # miss
        assert persistence.get_cached_projection(db, "no-such-key") is None
        # put then hit
        persistence.put_cached_projection(db, "k1", '{"p_success": 0.97, "seed": 42}')
        db.commit()
        got = persistence.get_cached_projection(db, "k1")
        assert got == {"p_success": 0.97, "seed": 42}
        # overwrite same key is idempotent (latest wins)
        persistence.put_cached_projection(db, "k1", '{"p_success": 0.5, "seed": 7}')
        db.commit()
        assert persistence.get_cached_projection(db, "k1")["seed"] == 7
    finally:
        db.close()
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `PYTHONPATH=backend:engine /home/linuxbrew/.linuxbrew/bin/python3 -m pytest backend/tests/test_projection_cache.py -q`
Expected: FAIL — `AttributeError: module 'backend.persistence' has no attribute 'get_cached_projection'`.

- [ ] **Step 3: Add the ORM model** (place after the `Event` class, ~line 377)

```python
class ProjectionCache(Base):
    """Read-through cache for Monte Carlo projections, keyed by an input hash.

    cache_key = SHA-256 of (by_ticker weights, horizon, capital, contribution,
    goal, generator, n_paths) + the price-dataset version (greenlight.db mtime).
    """
    __tablename__ = "projection_cache"

    cache_key: Mapped[str] = mapped_column(String, primary_key=True)
    result_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
```

- [ ] **Step 4: Add the helpers** (place near `log_event`, ~line 519)

```python
def get_cached_projection(db: Session, cache_key: str) -> dict | None:
    """Return the cached projection dict for cache_key, or None on a miss."""
    row = db.get(ProjectionCache, cache_key)
    if row is None:
        return None
    return json.loads(row.result_json)


def put_cached_projection(db: Session, cache_key: str, result_json: str) -> None:
    """Insert or overwrite the cached projection for cache_key (caller commits)."""
    row = db.get(ProjectionCache, cache_key)
    if row is None:
        db.add(ProjectionCache(cache_key=cache_key, result_json=result_json))
    else:
        row.result_json = result_json
        row.created_at = utc_now()
```

Verify `json` is already imported at the top of `persistence.py` (it is — used by `log_event`). `Base.metadata.create_all` in `init_db()` (~line 402) auto-creates the new table on import; no migration needed.

- [ ] **Step 5: Run the test, confirm it passes**

Run: `PYTHONPATH=backend:engine /home/linuxbrew/.linuxbrew/bin/python3 -m pytest backend/tests/test_projection_cache.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/persistence.py backend/tests/test_projection_cache.py
git commit -m "persistence: add projection_cache table + read-through helpers"
```

---

### Task 2: Read-through caching in the projection route (backend/api/v1.py)

**Files:**
- Modify: `backend/api/v1.py` — the `projection` route at `1998-2017`; add two helpers above it.

- [ ] **Step 1: Confirm imports** at the top of `v1.py`

Ensure `import hashlib`, `import json`, `import os` are present (add any that are missing). Confirm persistence is importable — check how the file already imports it (e.g. `from backend import persistence` or `from .. import persistence`); reuse that exact form below.

- [ ] **Step 2: Add the two helpers** (immediately above the `@router.post("/projection"` decorator at line 1998)

```python
def _price_dataset_version() -> str:
    """Coarse version token for the price data: greenlight.db mtime (int seconds).

    Changes whenever the data ingest rewrites the DB, so a refresh invalidates
    every cached projection automatically. Returns '0' if the path is unknown.
    """
    from engine.data import db as engine_db  # resolved sqlite URL lives here
    url = getattr(engine_db, "DEFAULT_DB_URL", "")
    url = os.environ.get("GREENLIGHT_DB_URL", url)
    if url.startswith("sqlite:///"):
        path = url[len("sqlite:///"):]
        try:
            return str(int(os.path.getmtime(path)))
        except OSError:
            return "0"
    return "0"


def _projection_cache_key(request: "api_models.ProjectionRequest", price_version: str) -> str:
    """Stable hash of the inputs that fully determine the projection output."""
    payload = {
        "weights": {k: round(float(v), 8) for k, v in sorted(request.weights.by_ticker.items())},
        "horizon_years": int(request.horizon_years),
        "capital_on_hand": round(float(request.capital_on_hand), 2),
        "monthly_contribution": round(float(request.monthly_contribution), 2),
        "goal_target": round(float(request.goal_target), 2),
        "generator": request.generator,
        "n_paths": int(request.n_paths),
        "price_version": price_version,
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()
```

If `engine.data.db` exposes the resolved URL under a different name than `DEFAULT_DB_URL`, adjust the `getattr` target — grep first: `grep -n "DB_URL" engine/data/db.py`.

- [ ] **Step 3: Rewrite the route body** to be read-through. Replace lines `1999-2017` with:

```python
async def projection(request: api_models.ProjectionRequest) -> api_models.Projection:
    """Project goal success from target weights and cached engine return data.

    Read-through cached: identical inputs (no explicit seed) return the stored
    result instantly with a deterministic seed, so the dashboard never recomputes
    or jitters. Explicit-seed callers (what-if) always compute fresh.
    """
    cache_key = None
    if request.seed is None:
        price_version = _price_dataset_version()
        cache_key = _projection_cache_key(request, price_version)
        db = persistence.get_session()
        try:
            cached = persistence.get_cached_projection(db, cache_key)
        finally:
            db.close()
        if cached is not None:
            return api_models.Projection.model_validate(cached)
        seed = int(cache_key[:8], 16) % (2**31)  # deterministic, replayable
    else:
        seed = request.seed

    try:
        weights = EngineTargetWeights.model_validate(request.weights.model_dump())
        projection_result = project(
            weights=weights.by_ticker,
            returns=_ticker_monthly_returns(weights.by_ticker),
            horizon_years=request.horizon_years,
            capital=request.capital_on_hand,
            monthly_contribution=request.monthly_contribution,
            goal=request.goal_target,
            generator=request.generator,
            seed=seed,
            n_paths=request.n_paths,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = {**projection_result.model_dump(), "seed": seed}
    if cache_key is not None:
        db = persistence.get_session()
        try:
            persistence.put_cached_projection(db, cache_key, json.dumps(result))
            db.commit()
        finally:
            db.close()
    return api_models.Projection.model_validate(result)
```

Note: the `secrets.randbelow` seed line is intentionally removed — the cached path derives a deterministic seed from the key; the explicit-seed path uses the caller's seed.

- [ ] **Step 4: Restart backend and smoke-test determinism + hit**

```bash
systemctl --user restart mallard-backend.service
sleep 2
# Two identical POSTs (no seed) must now return IDENTICAL numbers (proves cache + determinism).
PAYLOAD='{"weights":{"by_ticker":{"SPY":0.6,"AGG":0.4}},"horizon_years":20,"monthly_contribution":500,"capital_on_hand":10000,"goal_target":1000000,"generator":"stationary_bootstrap","n_paths":10000}'
A=$(curl -s -X POST localhost:8000/api/v1/projection -H 'Content-Type: application/json' -d "$PAYLOAD")
B=$(curl -s -X POST localhost:8000/api/v1/projection -H 'Content-Type: application/json' -d "$PAYLOAD")
echo "$A" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("A:",d["p_success"],d["median_terminal"],d["bad_case_terminal"],d["seed"])'
echo "$B" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("B:",d["p_success"],d["median_terminal"],d["bad_case_terminal"],d["seed"])'
```

Expected: A and B print **identical** p_success / median / bad_case / seed (before this change they differed every call). Confirm the actual backend port/URL the unit serves on; adjust `localhost:8000` if needed (`systemctl --user cat mallard-backend.service | grep -i port` or check `deploy/run-demo.sh`).

- [ ] **Step 5: Commit**

```bash
git add backend/api/v1.py
git commit -m "api: read-through cache + deterministic seed for /projection"
```

---

### Task 3: Kill the frontend double-fetch (client/src/components/Dashboard.jsx)

**Files:**
- Modify: `client/src/components/Dashboard.jsx` — the `<ProjectionChart .../>` render site.

**Context:** `ProjectionChart.jsx:98` already skips its own fetch when a `providedProjection` prop is passed (`client/src/components/ProjectionChart.jsx:94-143`). Dashboard already fetches the projection into local state (`projection`, set at `Dashboard.jsx:293`). It just isn't handing it down — so both components fetch. One line fixes it.

- [ ] **Step 1: Locate the render site**

Run: `grep -n "ProjectionChart" client/src/components/Dashboard.jsx`
Expected: a `<ProjectionChart ... />` JSX usage.

- [ ] **Step 2: Pass the already-fetched projection down**

Add `providedProjection={projection}` to that `<ProjectionChart ... />` element (alongside the props it already receives — keep `onboardResult`/`portfolio` if present, they're the fallback). Example:

```jsx
<ProjectionChart
  providedProjection={projection}
  onboardResult={onboardResult}
  portfolio={portfolio}
/>
```

- [ ] **Step 3: Build to verify no breakage**

Run: `cd client && npm run build`
Expected: build succeeds (no missing-prop/syntax errors).

- [ ] **Step 4: Manual check**

Open the dashboard, note the three numbers, navigate away and back. Expected: numbers are **identical** across visits, and the network tab shows at most one `/projection` call per dashboard mount (not two).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Dashboard.jsx
git commit -m "dashboard: pass cached projection into ProjectionChart (no double-fetch)"
```

---

### Task 4: Full verification (offline suites stay green)

- [ ] **Step 1: Engine + backend offline suites**

Run:
```bash
PYTHONPATH=engine /home/linuxbrew/.linuxbrew/bin/python3 -m pytest engine/tests -q
PYTHONPATH=backend:engine /home/linuxbrew/.linuxbrew/bin/python3 -m pytest backend/tests -q
```
Expected: all pass (engine ~101, backend ~104 incl. the new test). No network used.

- [ ] **Step 2: Real-data pipeline smoke (already exists)**

Run: `PYTHONPATH=backend:engine /home/linuxbrew/.linuxbrew/bin/python3 scripts/smoke/realdata_pipeline_smoke.py`
Expected: PASS — projection still computes on a cold key; rebalance/tax/backtest unaffected.

- [ ] **Step 3: Final commit if anything was touched during verification** (otherwise skip).

---

## Self-review notes
- **Spec coverage:** recompute cost → read-through cache (Task 2); jitter → deterministic seed (Task 2); double-fetch → providedProjection (Task 3); invalidation → price_version in key + weights in key (automatic). ✅
- **Determinism contract:** cached path seed = `int(key[:8],16) % 2**31`; explicit-seed path honored & uncached. No `secrets.randbelow` remains. ✅
- **Schema safety:** brand-new table via idempotent `create_all`; no column edits, no `_ensure_additive_columns` change needed. ✅
- **No placeholders:** every step has concrete code/commands; two spots flagged to grep-confirm (engine DB URL name, ProjectionChart render site) rather than guess. ✅
