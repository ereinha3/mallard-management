#!/usr/bin/env bash
# Launch the full demo behind the Cloudflare tunnel:
#   build client -> start backend (:8000) -> serve client (:4173) -> run tunnel
# Ctrl-C tears all of them down together.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"

echo ">> Building client (production / relative-API base)..."
npm --prefix "$REPO/client" run build

pids=()
cleanup() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

echo ">> Starting backend on :8000..."
( cd "$REPO/backend" \
  && GREENLIGHT_DB_URL="sqlite:///$REPO/engine/data/greenlight.db" \
     python -m uvicorn main:app --host 0.0.0.0 --port 8000 ) &
pids+=($!)

echo ">> Serving built client on :4173..."
( npm --prefix "$REPO/client" run preview ) &
pids+=($!)

echo ">> Starting Cloudflare tunnel..."
cloudflared tunnel --config "$DIR/cloudflared/config.yml" run mallard &
pids+=($!)

echo ">> All up. Public URL: https://mallardmanagement.tech  (Ctrl-C to stop)"
wait
