from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.v1 import router as v1_router

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
    allow_origins=[
        "http://localhost:3000",   # Create React App
        "http://localhost:5173",   # Vite
        "http://localhost:4173",   # Vite preview
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1", tags=["gate"])


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": "greenlight-gate"}
