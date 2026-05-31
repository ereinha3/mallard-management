from dotenv import load_dotenv
load_dotenv()

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

_BACKEND_DIR = Path(__file__).resolve().parent
_ENGINE_DIR = _BACKEND_DIR.parent / "engine"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
if str(_ENGINE_DIR) not in sys.path:
    sys.path.append(str(_ENGINE_DIR))

from api.v1 import router as v1_router
from persistence import init_db

app = FastAPI(
    title="Greenlight Gate API",
    description=(
        "Responsibility gate and risk profiling for the Greenlight investing advisor. "
        "Receives a structured user profile (output of the LLM elicitation layer), "
        "validates it, computes a two-axis risk profile, runs the responsibility gate, "
        "and returns either a halt with supporting math or a greenlit OptimizerInput "
        "package for the downstream Optimizer service."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    # Allow ANY origin (localhost, LAN, Tailscale IP, etc.). The client uses no
    # cookies — the auth token lives in JS and the email is in the URL — so we
    # don't need credentialed CORS, which lets us use the "*" wildcard and stop
    # maintaining a host/port allow-list. Appropriate for this demo/dev app.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1", tags=["gate"])


@app.on_event("startup")
async def startup() -> None:
    init_db()


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok", "service": "greenlight-gate"}
