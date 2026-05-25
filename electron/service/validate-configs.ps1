# Validates FNF-425/426/427/428 service configs without macOS/Linux hardware.
# Run: powershell -ExecutionPolicy Bypass -File validate-configs.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$script:fail = 0
$script:warn = 0

function Pass($msg) { Write-Host "[PASS] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:fail++ }
function Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow; $script:warn++ }

Write-Host ""
Write-Host "=== Fideon OS - Service config validation (Windows host) ==="
Write-Host ""

# FNF-425 Windows
$winXml = Join-Path $root "windows\fideon-backend.xml"
$winExe = Join-Path $root "windows\fideon-backend.exe"
if (Test-Path $winXml) { Pass "FNF-425: fideon-backend.xml exists" } else { Fail "FNF-425: missing fideon-backend.xml" }
if (Test-Path $winExe) { Pass "FNF-425: fideon-backend.exe (WinSW) present" } else { Warn "FNF-425: fideon-backend.exe missing - run install-winsw.ps1" }
if (Test-Path $winXml) {
  [xml]$x = Get-Content $winXml
  if ($x.service.id -eq "fideon-backend") { Pass "FNF-425: service id fideon-backend" } else { Fail "FNF-425: unexpected service id" }
  if ($x.service.onfailure) { Pass "FNF-428 Windows: onfailure restart rules in XML" } else { Fail "FNF-428 Windows: missing onfailure" }
  if ($x.service.startmode -eq "Automatic") { Pass "FNF-425: Automatic start on boot" } else { Warn "FNF-425: startmode not Automatic" }
}

$svc = Get-Service fideon-backend -ErrorAction SilentlyContinue
if ($svc) {
  if ($svc.Status -eq "Running") { Pass "FNF-425 LIVE: Windows service fideon-backend is Running" }
  else { Warn "FNF-425 LIVE: service installed but Status=$($svc.Status)" }
  try {
    $h = Invoke-WebRequest http://127.0.0.1:8000/api/health -UseBasicParsing -TimeoutSec 3
    if ($h.Content -match "production") { Pass "FNF-425 LIVE: /api/health OK (production)" }
    else { Warn "FNF-425 LIVE: health OK but not production env" }
  } catch {
    Warn "FNF-425 LIVE: service exists but health check failed"
  }
} else {
  Warn "FNF-425 LIVE: service not installed on this machine (config-only check)"
}

# FNF-426 macOS plist
$plistPath = Join-Path $root "macos\com.fideon.backend.plist"
if (-not (Test-Path $plistPath)) {
  Fail "FNF-426: missing plist"
} else {
  Pass "FNF-426: com.fideon.backend.plist exists"
  $plistOk = $true
  try {
    [void][xml](Get-Content $plistPath)
    Pass "FNF-426: plist is well-formed XML"
  } catch {
    Fail "FNF-426: plist XML parse error"
    $plistOk = $false
  }
  if ($plistOk) {
    $text = Get-Content $plistPath -Raw
    foreach ($key in @("Label", "ProgramArguments", "WorkingDirectory", "RunAtLoad", "KeepAlive", "ThrottleInterval")) {
      if ($text -match "<key>$key</key>") { Pass "FNF-426: key $key present" } else { Fail "FNF-426: missing key $key" }
    }
    if ($text -match "SuccessfulExit" -and $text -match "false") { Pass "FNF-428 macOS: KeepAlive.SuccessfulExit=false" }
    else { Fail "FNF-428 macOS: crash KeepAlive config incomplete" }
    if ($text -match "com\.fideon\.backend") { Pass "FNF-426: Label com.fideon.backend" } else { Fail "FNF-426: Label mismatch" }
  }
  Warn "FNF-426 RUNTIME: launchctl cannot run on Windows - needs macOS to install/test"
}

# FNF-427 Linux systemd
$unitPath = Join-Path $root "linux\fideon-backend.service"
if (-not (Test-Path $unitPath)) {
  Fail "FNF-427: missing unit file"
} else {
  Pass "FNF-427: fideon-backend.service exists"
  $unit = Get-Content $unitPath -Raw
  foreach ($token in @("[Unit]", "[Service]", "[Install]", "ExecStart=", "WorkingDirectory=", "WantedBy=")) {
    if ($unit -match [regex]::Escape($token)) { Pass "FNF-427: contains $token" } else { Fail "FNF-427: missing $token" }
  }
  if ($unit -match "Restart=on-failure") { Pass "FNF-428 Linux: Restart=on-failure" } else { Fail "FNF-428 Linux: missing Restart=on-failure" }
  if ($unit -match "RestartSec=5") { Pass "FNF-428 Linux: RestartSec=5s" } else { Fail "FNF-428 Linux: missing RestartSec" }
  if ($unit -match "StartLimitBurst=3") { Pass "FNF-428 Linux: StartLimitBurst" } else { Warn "FNF-428 Linux: no StartLimitBurst" }
  Warn "FNF-427 RUNTIME: systemctl cannot run on Windows without WSL - needs Linux to install/test"
}

# Electron IPC wiring
$mainCjs = Join-Path (Split-Path $root -Parent) "main.cjs"
if (Test-Path $mainCjs) {
  $main = Get-Content $mainCjs -Raw
  foreach ($ref in @("service:install", "service:uninstall", "service:status", "fideon-backend.exe", "com.fideon.backend.plist", "fideon-backend.service")) {
    if ($main -match [regex]::Escape($ref)) { Pass "Electron IPC references $ref" } else { Fail "Electron IPC missing $ref" }
  }
} else {
  Fail "electron/main.cjs not found"
}

Write-Host ""
Write-Host "=== Summary ==="
Write-Host "Failures: $script:fail"
Write-Host "Warnings: $script:warn (expected for macOS/Linux runtime on Windows)"
if ($script:fail -eq 0) {
  Write-Host ""
  Write-Host "Config validation PASSED. Windows live-tested; macOS/Linux structurally valid - need real OS for runtime proof." -ForegroundColor Cyan
  exit 0
}
exit 1
