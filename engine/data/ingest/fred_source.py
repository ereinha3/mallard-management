"""FRED CSV ingestion using stdlib urllib."""

from __future__ import annotations

from collections.abc import Callable
from io import StringIO
import logging
import time
from typing import Any
from urllib.parse import quote
from urllib.request import urlopen

import pandas as pd

FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
LOGGER = logging.getLogger(__name__)


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
    retries: int = 3,
    sleep_seconds: float = 1.0,
    backoff: float = 2.0,
) -> pd.DataFrame:
    """Fetch a keyless FRED CSV series as date/value rows."""

    if opener is None:
        def opener(url: str) -> Any:
            return urlopen(url, timeout=30)

    url = FRED_CSV_URL.format(series_id=quote(series_id))
    attempts = max(1, int(retries) + 1)
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            payload = _read_payload(opener(url))
            break
        except Exception as exc:  # pragma: no cover - exercised with real network failures
            last_error = exc
            if attempt == attempts - 1:
                raise
            delay = max(0.0, sleep_seconds) * (max(1.0, backoff) ** attempt)
            LOGGER.warning("FRED %s failed on attempt %s/%s: %s", series_id, attempt + 1, attempts, exc)
            if delay:
                time.sleep(delay)
    else:  # pragma: no cover
        assert last_error is not None
        raise last_error

    raw = pd.read_csv(StringIO(payload))
    # FRED's date column is "observation_date" on the current CSV endpoint and was
    # "DATE" historically; accept either, and fall back to the first column.
    date_col = next((c for c in ("observation_date", "DATE", "date") if c in raw.columns), None)
    if date_col is None:
        date_col = raw.columns[0]
    value_col = series_id if series_id in raw.columns else raw.columns[-1]
    frame = raw.rename(columns={date_col: "date", value_col: "value"})[["date", "value"]]
    frame["date"] = pd.to_datetime(frame["date"])
    frame["value"] = pd.to_numeric(frame["value"].replace(".", pd.NA), errors="coerce")
    return frame.dropna(subset=["date", "value"]).sort_values("date").reset_index(drop=True)
