#!/usr/bin/env bash
# Build/refresh the production price DB (engine/data/greenlight.db) from REAL
# market data: yfinance (prices/volume/metadata) + FRED (risk-free/macro), for
# the full universe defined in engine/data/universe_seed.py. Requires network;
# no API keys (FRED uses a public CSV endpoint).
#
# This is the canonical builder for the runtime DB. The synthetic CSV seed
# (engine/data/seed.py + engine/data/prices.csv) remains ONLY for offline tests.
#
# Usage: scripts/build_greenlight_db.sh [--risk-free-series DGS3MO] [--min-coverage 0.90]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
DB="sqlite:///$REPO/engine/data/greenlight.db"
# Use the interpreter that has the engine deps (yfinance, pandas). Override with
# PYTHON=/path/to/python if your default python3 lacks them.
PYTHON="${PYTHON:-python3}"

echo ">> Building greenlight.db from yfinance + FRED (full universe) via $PYTHON ..."
# -u GREENLIGHT_DB_URL: ignore any stale env var so --db is authoritative.
env -u GREENLIGHT_DB_URL PYTHONPATH="$REPO/engine" \
  "$PYTHON" -m data.ingest.refresh --db "$DB" "$@"
echo ">> Done. greenlight.db is ready at $REPO/engine/data/greenlight.db"
echo ">> Restart the backend to serve it: systemctl --user restart mallard-backend.service"
