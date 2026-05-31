@echo off
title Mallard Management
cd /d "%~dp0"

echo.
echo  Clearing any stale processes...
for %%p in (5173 8000) do (
  for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%%p "') do (
    taskkill /F /PID %%a >nul 2>&1
  )
)

echo  Starting Mallard Management servers...
echo.
echo   API    http://localhost:8000   (FastAPI backend over the engine)
echo   App    http://localhost:5173   (Vite client)
echo.

:: Python FastAPI backend (port 8000)
start "Mallard API" cmd /k "cd backend && python -m uvicorn main:app --reload --port 8000"

:: Vite client (port 5173)
start "Mallard App" cmd /k "cd client && npm run dev"

:: Open the app once servers have had time to boot
start "" cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:5173"
