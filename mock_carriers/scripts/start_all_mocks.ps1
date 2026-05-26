# Launches all 10 mock carriers on their assigned ports (8001-8010) as
# background jobs. Logs land in mock_carriers/scripts/logs/<carrier_id>.log.
# Stop them with: Get-Job | Stop-Job; Get-Job | Remove-Job
#
# Run from repo root:
#     .\mock_carriers\scripts\start_all_mocks.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$python   = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
$logDir   = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$carriers = @(
    "mock_travelers", "mock_hartford", "mock_chubb", "mock_liberty", "mock_nationwide",
    "mock_progressive", "mock_amtrust", "mock_markel", "mock_berkshire", "mock_zurich"
)

foreach ($cid in $carriers) {
    $log = Join-Path $logDir "$cid.log"
    Write-Host "Starting $cid -> $log"
    Start-Job -Name $cid -ScriptBlock {
        param($py, $cwd, $cid, $log)
        Set-Location $cwd
        & $py -m mock_carriers.server $cid 2>&1 | Out-File -Encoding utf8 -FilePath $log
    } -ArgumentList $python, $repoRoot, $cid, $log | Out-Null
}

Write-Host ""
Write-Host "All 10 mocks launched. Use 'Get-Job' to see status, 'Stop-Job *' to stop." -ForegroundColor Green
