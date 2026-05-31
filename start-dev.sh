#!/bin/bash

# Mallard Management / Greenlight dev server starter
# Prevents multiple instances by checking ports before starting.

PORTS="3000,8000,5173"

echo "🔍 Checking for existing dev servers on ports $PORTS..."

# Find all PIDs on these ports
PIDS=$(lsof -ti:$PORTS)

if [ ! -z "$PIDS" ]; then
  echo "⚠️  Closing existing instances (PIDs: $PIDS) to prevent 'piling up'..."
  # Kill the processes
  kill -9 $PIDS 2>/dev/null
  # Brief pause to allow ports to clear
  sleep 2
  echo "✅ Ports cleared."
fi

echo "🚀 Starting all dev servers (Next.js, FastAPI, Vite) in this terminal..."
echo "Tip: Press Ctrl+C once to stop ALL servers at once."
echo ""

npm run dev:all
