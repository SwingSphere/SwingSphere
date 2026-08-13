[CmdletBinding()]
param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

$targets = @(
    'dist',
    'tmp',
    '.codex-temp',
    '.wrangler',
    'tools\.geo_cache',
    'tools\.geo_boundary_builder',
    'tools\__pycache__',
    'scripts\__pycache__',
    'New folder',
    'tsc_out.txt',
    'tsc_output.txt',
    'dev - Shortcut.lnk',
    'NUL'
)

$rootLogPatterns = @(
    '.codex-*.log'
)

function Get-TargetInfo {
    param([Parameter(Mandatory)][string]$RelativePath)

    $fullPath = Join-Path $projectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $fullPath)) {
        return $null
    }

    $item = Get-Item -LiteralPath $fullPath -Force
    $size = if ($item.PSIsContainer) {
        (Get-ChildItem -LiteralPath $fullPath -Force -Recurse -File -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum).Sum
    } else {
        $item.Length
    }

    [pscustomobject]@{
        RelativePath = $RelativePath
        FullPath = $fullPath
        Type = if ($item.PSIsContainer) { 'Directory' } else { 'File' }
        Bytes = [int64]$(if ($null -eq $size) { 0 } else { $size })
    }
}

$items = foreach ($target in $targets) {
    Get-TargetInfo -RelativePath $target
}

foreach ($pattern in $rootLogPatterns) {
    Get-ChildItem -LiteralPath $projectRoot -Force -File -Filter $pattern -ErrorAction SilentlyContinue |
        ForEach-Object {
            [pscustomobject]@{
                RelativePath = $_.Name
                FullPath = $_.FullName
                Type = 'File'
                Bytes = [int64]$_.Length
            }
        }
}

$items = @($items | Where-Object { $_ } | Sort-Object RelativePath -Unique)

if ($items.Count -eq 0) {
    Write-Host 'No generated or temporary cleanup targets were found.'
    exit 0
}

$totalBytes = ($items | Measure-Object -Property Bytes -Sum).Sum
$items |
    Select-Object RelativePath, Type, @{Name = 'SizeMB'; Expression = { [math]::Round($_.Bytes / 1MB, 2) }} |
    Format-Table -AutoSize

Write-Host ("Total removable size: {0:N2} MB" -f ($totalBytes / 1MB))

if (-not $Apply) {
    Write-Host ''
    Write-Host 'Dry run only. Nothing was removed.'
    Write-Host 'Run again with -Apply to remove these generated and temporary items:'
    Write-Host '  powershell -ExecutionPolicy Bypass -File .\scripts\maintenance\cleanup-local-generated.ps1 -Apply'
    exit 0
}

foreach ($item in $items) {
    Write-Host ("Removing {0}" -f $item.RelativePath)
    Remove-Item -LiteralPath $item.FullPath -Force -Recurse
}

Write-Host ''
Write-Host ("Cleanup complete. Removed {0:N2} MB." -f ($totalBytes / 1MB))
Write-Host 'Run npm run build whenever you want to regenerate dist.'
