# start-dev.ps1 — launch all three Mallard Management dev servers
# Run from repo root: .\start-dev.ps1

$root = $PSScriptRoot
Set-Location $root

$ports = 3000, 8000, 5173
$conflicts = @()

# Check for existing processes on the required ports
foreach ($port in $ports) {
    if (Get-Command lsof -ErrorAction SilentlyContinue) {
        $pid = lsof -ti :$port
        if ($pid) { $conflicts += $port }
    }
}

if ($conflicts.Count -gt 0) {
    Write-Host "❌ Warning: Ports $($conflicts -join ', ') are already in use." -ForegroundColor Yellow
    Write-Host "Closing existing instances to prevent 'piling up'..." -ForegroundColor Gray
    foreach ($port in $conflicts) {
        $pid = lsof -ti :$port
        if ($pid) {
            if ($IsWindows) {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            } else {
                kill -9 $pid
            }
        }
    }
    Start-Sleep -Seconds 1
}

Write-Host "🚀 Starting all dev servers (Next.js, FastAPI, Vite) in this window..." -ForegroundColor Cyan
Write-Host "Tip: Press Ctrl+C once to stop ALL servers at once." -ForegroundColor Gray
Write-Host ""

npm run dev:all
