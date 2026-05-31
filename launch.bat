@echo off
title Mallard Management
cd /d "%~dp0"

echo.
echo  Clearing any stale processes...
for %%p in (3000 5173 8000) do (
  for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%%p "') do (
    taskkill /F /PID %%a >nul 2>&1
  )
)

echo  Starting all servers...
echo.
echo   API    http://localhost:8000
echo   App    http://localhost:5173
echo.

:: Open browser after servers have time to boot
start "" cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:5173"

:: Run everything in this window
npm run dev:all
