# Downloads WinSW and saves it as fideon-backend.exe (pairs with fideon-backend.xml).
$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
$out = Join-Path $dir "fideon-backend.exe"
$url = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"

if (Test-Path $out) {
  Write-Host "fideon-backend.exe already exists."
  exit 0
}

Write-Host "Downloading WinSW from $url ..."
Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
Write-Host "Saved $out"
