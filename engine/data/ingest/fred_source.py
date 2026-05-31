"""FRED CSV ingestion using stdlib urllib."""

from __future__ import annotations

from collections.abc import Callable
from io import StringIO
from typing import Any
from urllib.parse import quote
from urllib.request import urlopen

import pandas as pd

FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"


def _read_payload(response: Any) -> str:
    if hasattr(response, "read"):
        data = response.read()
    else:
        data = response
    if isinstance(data, bytes):
        return data.decode("utf-8")
    return str(data)


def fetch_series(
    series_id: str = "DGS3MO",
    *,
    opener: Callable[[str], Any] | None = None,
) -> pd.DataFrame:
    """Fetch a keyless FRED CSV series as date/value rows."""

    opener = opener or urlopen
    url = FRED_CSV_URL.format(series_id=quote(series_id))
    payload = _read_payload(opener(url))
    raw = pd.read_csv(StringIO(payload))
    if "DATE" not in raw.columns or series_id not in raw.columns:
        raise ValueError(f"FRED CSV for {series_id!r} must contain DATE and {series_id} columns")
    frame = raw.rename(columns={"DATE": "date", series_id: "value"})[["date", "value"]]
    frame["date"] = pd.to_datetime(frame["date"])
    frame["value"] = pd.to_numeric(frame["value"].replace(".", pd.NA), errors="coerce")
    return frame.dropna(subset=["date", "value"]).sort_values("date").reset_index(drop=True)

