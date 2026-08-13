param(
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$oldRuntime = Join-Path $root 'public\models\blender_test\src\globe'
$newRuntime = Join-Path $root 'src\features\globe\runtime'
$oldAssets = Join-Path $root 'public\models\blender_test\dist\globe'
$newAssets = Join-Path $root 'public\assets\globe'

$replacements = [ordered]@{
  'public/models/blender_test/src/globe' = 'src/features/globe/runtime'
  '/models/blender_test/dist/globe' = '/assets/globe'
  "'public', 'models', 'blender_test', 'src', 'globe'" = "'src', 'features', 'globe', 'runtime'"
  '"./prototype/models/land.glb"' = '"/assets/globe/models/land.glb"'
  '"./prototype/models/ocean.glb"' = '"/assets/globe/models/ocean.glb"'
  '"./prototype/textures/countryIdTexture.png"' = '"/assets/globe/textures/countryIdTexture.png"'
  '"./prototype/textures/visualCountryAtlas_v3.png"' = '"/assets/globe/textures/visualCountryAtlas_v3.png"'
  '"./prototype/data/countryLookup.json"' = '"/assets/globe/data/countryLookup.json"'
}

$required = @(
  (Join-Path $oldRuntime 'index.js'),
  (Join-Path $oldAssets 'models\land.glb'),
  (Join-Path $oldAssets 'models\ocean.glb'),
  (Join-Path $oldAssets 'textures\countryIdTexture.png'),
  (Join-Path $oldAssets 'textures\visualCountryAtlas_v3.png'),
  (Join-Path $oldAssets 'data\countryLookup.json')
)

foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing required source: $path" }
}
if (Test-Path -LiteralPath $newRuntime) { throw "Destination already exists: $newRuntime" }
if (Test-Path -LiteralPath $newAssets) { throw "Destination already exists: $newAssets" }

Write-Host 'Globe structural migration'
Write-Host "  Runtime: $oldRuntime -> $newRuntime"
Write-Host "  Assets:  $oldAssets -> $newAssets"
Write-Host '  References: production source, Vite config, runtime defaults, and documentation'

if (-not $Apply) {
  Write-Host "`nDry run only. Nothing changed."
  Write-Host 'Run with -Apply to execute the migration.'
  exit 0
}

New-Item -ItemType Directory -Force -Path (Split-Path $newRuntime) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $newAssets) | Out-Null
Move-Item -LiteralPath $oldRuntime -Destination $newRuntime
Move-Item -LiteralPath $oldAssets -Destination $newAssets

$extensions = @('.ts', '.tsx', '.js', '.jsx', '.md', '.json')
$excludeRoots = @('node_modules', '.git', 'dist', '.codex-temp', '.wrangler')
$files = Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object {
  $relative = $_.FullName.Substring($root.Length + 1)
  ($extensions -contains $_.Extension) -and
  -not ($excludeRoots | Where-Object { $relative -eq $_ -or $relative.StartsWith($_ + '\') }) -and
  $_.FullName -ne $PSCommandPath
}

$updated = 0
foreach ($file in $files) {
  $content = [System.IO.File]::ReadAllText($file.FullName)
  $next = $content
  foreach ($entry in $replacements.GetEnumerator()) {
    $next = $next.Replace($entry.Key, $entry.Value)
  }
  if ($next -ne $content) {
    [System.IO.File]::WriteAllText($file.FullName, $next, [System.Text.UTF8Encoding]::new($false))
    $updated++
    Write-Host "Updated $($file.FullName.Substring($root.Length + 1))"
  }
}

$cleanupCandidates = @(
  (Join-Path $root 'public\models\blender_test\src'),
  (Join-Path $root 'public\models\blender_test\dist'),
  (Join-Path $root 'public\models\blender_test'),
  (Join-Path $root 'public\models')
)
foreach ($dir in $cleanupCandidates) {
  if ((Test-Path -LiteralPath $dir) -and -not (Get-ChildItem -LiteralPath $dir -Force | Select-Object -First 1)) {
    Remove-Item -LiteralPath $dir -Force
  }
}

Write-Host "`nMigration complete. Updated $updated text files."
Write-Host 'Next: run npm run build and verify /globe, the landing hero globe, and /dev/hero-camera-studio.'
