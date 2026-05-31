#!/usr/bin/env bash
# Publish current frontend source to the live site:
#   rebuild the static client bundle, then restart the frontend service so
#   vite preview serves the fresh dist/. Backend/tunnel are untouched.
#
# Local development (instant HMR, no publish needed):
#   npm --prefix client run dev   ->   http://localhost:5173
#   (dev server talks to the backend on :8000 directly)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"

echo ">> Building client..."
npm --prefix "$REPO/client" run build
echo ">> Restarting frontend service..."
systemctl --user restart mallard-frontend.service
echo ">> Published. Live at https://mallardmanagement.tech (hard-refresh to bust cache)."
