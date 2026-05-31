"""Thin data-layer routes for delegated API mounting."""

from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter

from data import repository
from data.ingest import refresh as refresh_module

router = APIRouter()


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    clean = frame.copy()
    for column in clean.columns:
        if pd.api.types.is_datetime64_any_dtype(clean[column]):
            clean[column] = clean[column].dt.strftime("%Y-%m-%d")
    clean = clean.astype(object).where(pd.notna(clean), None)
    return clean.to_dict("records")


@router.get("/data/instruments")
async def get_instruments() -> list[dict[str, Any]]:
    return _records(repository.instruments())


@router.get("/data/buckets")
async def get_buckets() -> list[dict[str, Any]]:
    return _records(repository.buckets())


@router.get("/data/prices/{ticker}")
async def get_prices(ticker: str) -> list[dict[str, Any]]:
    return _records(repository.prices_long([ticker]))


@router.post("/data/refresh")
async def refresh_data() -> dict[str, int]:
    return refresh_module.refresh()
