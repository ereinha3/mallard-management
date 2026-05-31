# start-dev.ps1
# Starts all three Mallard Management / Greenlight dev servers in separate windows.
#
# Usage (from repo root, in PowerShell):
#   .\start-dev.ps1
#
# Prerequisites:
#   - Node 18+ and Python 3.10+ installed
#   - npm install already run at repo root AND inside client/
#   - pip install -r backend/requirements.txt already run
#   - GEMINI_API_KEY filled in:
#       .env.local            (Next.js backend, port 3000)
#       backend/.env          (Python FastAPI, port 8000)

$root = $PSScriptRoot

# ── 1. Python FastAPI backend (port 8000) ─────────────────────────────────
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
  Write-Host '=== Greenlight Gate API (FastAPI :8000) ===' -ForegroundColor Green
  Set-Location '$root\backend'
  python -m uvicorn main:app --reload --port 8000
"@

# ── 2. Next.js finance-engine backend (port 3000) ─────────────────────────
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
  Write-Host '=== Finance Engine (Next.js :3000) ===' -ForegroundColor Cyan
  Set-Location '$root'
  npm run dev
"@

# ── 3. Vite React frontend (port 5173) ────────────────────────────────────
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
  Write-Host '=== Greenlight Frontend (Vite :5173) ===' -ForegroundColor Yellow
  Set-Location '$root\client'
  npm run dev
"@

Write-Host ""
Write-Host "All three servers starting in separate windows:" -ForegroundColor White
Write-Host "  Frontend  ->  http://localhost:5173" -ForegroundColor Yellow
Write-Host "  Next.js   ->  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  FastAPI   ->  http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""
Write-Host "Wait ~5 seconds for all three to be ready, then open http://localhost:5173"
