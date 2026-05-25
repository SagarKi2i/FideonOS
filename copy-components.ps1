# copy-components.ps1
# Copies all existing UI components from the original React/Vite project
# into the new Next.js frontend. Run from the FideonOS-NextFastAPI directory.
#
# Usage:
#   cd "d:\Fideon OS\FideonOS-NextFastAPI"
#   .\copy-components.ps1

$src = "..\FideonWorkspaceMOCK-main\src"
$dst = ".\frontend"

Write-Host "Copying UI components..." -ForegroundColor Cyan

# UI primitive components (shadcn/Radix) — copy all except kpi-card (already written)
$uiFiles = Get-ChildItem "$src\components\ui" -Filter "*.tsx" | Where-Object { $_.Name -ne "kpi-card.tsx" }
foreach ($f in $uiFiles) {
    Copy-Item $f.FullName "$dst\components\ui\$($f.Name)" -Force
    Write-Host "  Copied ui/$($f.Name)"
}

# Shell components — skip ones already written (IconRail, SecondaryNav, CommandBar, CommandPalette)
$shellSkip = @("IconRail.tsx", "SecondaryNav.tsx", "CommandBar.tsx")
$shellFiles = Get-ChildItem "$src\components\shell" -Filter "*.tsx" | Where-Object { $_.Name -notin $shellSkip }
foreach ($f in $shellFiles) {
    Copy-Item $f.FullName "$dst\components\shell\$($f.Name)" -Force
    Write-Host "  Copied shell/$($f.Name)"
}

# Feature components — copy all subdirectories
$featureDirs = @("admin", "approvals", "connect", "inbox", "pipeline", "settings", "workflows")
foreach ($dir in $featureDirs) {
    if (Test-Path "$src\components\$dir") {
        $items = Get-ChildItem "$src\components\$dir" -Filter "*.tsx"
        foreach ($f in $items) {
            Copy-Item $f.FullName "$dst\components\$dir\$($f.Name)" -Force
            Write-Host "  Copied $dir/$($f.Name)"
        }
    }
}

# Playground components
if (Test-Path "$src\components\playground") {
    New-Item -ItemType Directory -Path "$dst\components\playground" -Force | Out-Null
    Copy-Item "$src\components\playground\*" "$dst\components\playground\" -Recurse -Force
    Write-Host "  Copied playground/ (all)"
}

# Pod-run components (except PodRunWorkspace.tsx, already written)
$podRunFiles = Get-ChildItem "$src\components\pod-run" -Filter "*.tsx" | Where-Object { $_.Name -ne "PodRunWorkspace.tsx" }
foreach ($f in $podRunFiles) {
    Copy-Item $f.FullName "$dst\components\pod-run\$($f.Name)" -Force
    Write-Host "  Copied pod-run/$($f.Name)"
}

# Pod dashboards (except PodAnalyticsDashboard, already written)
$podDashFiles = Get-ChildItem "$src\components\pod-dashboards" -Filter "*.tsx" | Where-Object { $_.Name -ne "PodAnalyticsDashboard.tsx" }
foreach ($f in $podDashFiles) {
    Copy-Item $f.FullName "$dst\components\pod-dashboards\$($f.Name)" -Force
    Write-Host "  Copied pod-dashboards/$($f.Name)"
}

# Root-level components (Layout, AppSidebar, FideonLogo, HelpAssistant, etc.)
$rootComponentSkip = @("ProtectedRoute.tsx")
$rootFiles = Get-ChildItem "$src\components" -Filter "*.tsx" -File | Where-Object { $_.Name -notin $rootComponentSkip }
foreach ($f in $rootFiles) {
    Copy-Item $f.FullName "$dst\components\$($f.Name)" -Force
    Write-Host "  Copied $($f.Name)"
}

# App CSS
Copy-Item "$src\components\App.css" "$dst\components\App.css" -Force -ErrorAction SilentlyContinue

# Static lib files (no supabase dependencies)
$staticLibs = @("agentCatalog.ts", "amsCatalog.ts", "carriers.ts", "governance.ts",
                 "insuranceMocks.ts", "ollama.ts", "reviewQueueDemoSeed.ts",
                 "sectors.ts", "streamHelper.ts")
foreach ($f in $staticLibs) {
    if (Test-Path "$src\lib\$f") {
        Copy-Item "$src\lib\$f" "$dst\lib\$f" -Force
        Write-Host "  Copied lib/$f"
    }
}

# Public assets
if (Test-Path "..\FideonWorkspaceMOCK-main\public") {
    Copy-Item "..\FideonWorkspaceMOCK-main\public\*" "$dst\public\" -Recurse -Force
    Write-Host "  Copied public assets"
}

Write-Host ""
Write-Host "Done! After copying, you may need to:" -ForegroundColor Green
Write-Host "  1. Replace 'react-router-dom' imports -> 'next/navigation' (useRouter, useParams)"
Write-Host "  2. Replace '@/integrations/supabase/client' -> '@/lib/supabaseClient' (auth only)"
Write-Host "  3. Replace direct supabase.from() calls -> '@/lib/api' functions"
Write-Host "  4. Replace 'import.meta.env.VITE_*' -> 'process.env.NEXT_PUBLIC_*'"
Write-Host "  5. Add 'use client' directive to interactive components"
