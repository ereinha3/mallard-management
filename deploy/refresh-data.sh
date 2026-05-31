#!/usr/bin/env bash
# Refresh the production price DB from real data (yfinance + FRED), then restart
# the backend so it serves the fresh data. Mirrors deploy/publish.sh (frontend)
# for the data layer; run on an independent cadence from frontend publishing.
#
# Usage: deploy/refresh-data.sh [--risk-free-series DGS3MO] [--min-coverage 0.90]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"

"$REPO/scripts/build_greenlight_db.sh" "$@"
echo ">> Restarting backend on fresh data..."
systemctl --user restart mallard-backend.service
echo ">> Backend restarted."
