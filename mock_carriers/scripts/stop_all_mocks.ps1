# Stops every mock-carrier background job and prunes them from the job list.
Get-Job | Where-Object { $_.Name -like "mock_*" } | ForEach-Object {
    Stop-Job $_ -ErrorAction SilentlyContinue
    Remove-Job $_ -Force
}
Write-Host "All mock carriers stopped." -ForegroundColor Green
