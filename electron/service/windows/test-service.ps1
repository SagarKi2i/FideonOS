# FNF-425 / FNF-428 — Install, verify, crash-recovery test. Run as Administrator.
# Usage: powershell -ExecutionPolicy Bypass -File test-service.ps1

$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
$exe = Join-Path $dir "fideon-backend.exe"

if (-not (Test-Path $exe)) {
  Write-Host "Missing fideon-backend.exe — run install-winsw.ps1 first."
  exit 1
}

function Test-Health {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -UseBasicParsing -TimeoutSec 5
    return $r.StatusCode -eq 200
  } catch { return $false }
}

Write-Host "=== Install service ==="
& $exe install
& $exe start
Start-Sleep -Seconds 4
& $exe status
Get-Service fideon-backend -ErrorAction SilentlyContinue | Format-Table Name, Status, StartType

Write-Host "`n=== Health check ==="
if (Test-Health) { Write-Host "PASS: /api/health OK" } else { Write-Host "FAIL: backend not responding"; exit 1 }

Write-Host "`n=== Crash recovery (FNF-428) ==="
$procs = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
  Where-Object { $_.CommandLine -match "uvicorn main:app" }
if (-not $procs) { Write-Host "WARN: no uvicorn python process found"; exit 1 }
$pid = $procs[0].ProcessId
Write-Host "Stopping PID $pid ..."
Stop-Process -Id $pid -Force
Start-Sleep -Seconds 12
& $exe status
if (Test-Health) { Write-Host "PASS: service restarted after crash" } else { Write-Host "FAIL: health check after crash"; exit 1 }

Write-Host "`nAll tests passed."
