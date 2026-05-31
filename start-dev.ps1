# start-dev.ps1
# Starts the Mallard Management / Mallard Management dev servers in separate windows.
#
# Usage (from repo root, in PowerShell):
#   .\start-dev.ps1
#
# Prerequisites:
#   - Node 18+ and Python 3.10+ installed
#   - npm install already run inside client/
#   - pip install -r backend/requirements.txt already run
#   - backend/.env populated as needed for the Python FastAPI app

$root = $PSScriptRoot

# 1. Python FastAPI backend (port 8000)
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
  Write-Host '=== Mallard Management API (FastAPI :8000) ===' -ForegroundColor Green
  Set-Location '$root\backend'
  python -m uvicorn main:app --reload --port 8000
"@

# 2. Vite React frontend (port 5173)
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
  Write-Host '=== Mallard Management Frontend (Vite :5173) ===' -ForegroundColor Yellow
  Set-Location '$root\client'
  npm run dev
"@

Write-Host ""
Write-Host "Servers starting in separate windows:" -ForegroundColor White
Write-Host "  Frontend  ->  http://localhost:5173" -ForegroundColor Yellow
Write-Host "  FastAPI   ->  http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""
Write-Host "Wait a few seconds for both to be ready, then open http://localhost:5173"
