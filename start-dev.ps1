# start-dev.ps1 — launch all three Mallard Management dev servers
# Run from repo root: .\start-dev.ps1

$root = $PSScriptRoot

# 1. Python FastAPI backend — port 8000
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "Set-Location '$root\backend'; Write-Host '=== FastAPI :8000 ===' -ForegroundColor Green; python -m uvicorn main:app --reload --port 8000"
)

# 2. Next.js finance-engine — port 3000
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "Set-Location '$root'; Write-Host '=== Next.js :3000 ===' -ForegroundColor Cyan; npm run dev"
)

# 3. Vite frontend — port 5173
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "Set-Location '$root\client'; Write-Host '=== Vite :5173 ===' -ForegroundColor Yellow; npm run dev"
)

Write-Host ""
Write-Host "Servers starting — wait 5 seconds then open:" -ForegroundColor White
Write-Host "  http://localhost:5173  (app)" -ForegroundColor Yellow
Write-Host "  http://localhost:8000/docs  (FastAPI explorer)" -ForegroundColor Green
