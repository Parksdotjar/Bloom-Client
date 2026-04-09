param(
    [switch]$Build
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$modProject = Join-Path $root "bloom-menu"
$libsDir = Join-Path $modProject "build\libs"
$targetDir = Join-Path $root "src-tauri\resources\mods"
$targetFile = Join-Path $targetDir "bloom-cosmetics-1.21.11-latest.jar"

if ($Build) {
    Push-Location $modProject
    try {
        & .\gradlew.bat clean build
    } finally {
        Pop-Location
    }
}

if (!(Test-Path $libsDir)) {
    throw "Missing libs directory: $libsDir"
}

$latestJar = Get-ChildItem $libsDir -File -Filter "*.jar" |
    Where-Object { $_.Name -notlike "*-sources.jar" } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

if (-not $latestJar) {
    throw "No built bloom cosmetics jar found in $libsDir"
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -LiteralPath $latestJar.FullName -Destination $targetFile -Force

$instancesRoot = Join-Path $env:APPDATA "com.bloomunit.client\instances"
if (Test-Path $instancesRoot) {
    Get-ChildItem -Path $instancesRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $modsDir = Join-Path $_.FullName "mods"
        if (Test-Path $modsDir) {
            $instanceTarget = Join-Path $modsDir "bloom-cosmetics-1.21.11-latest.jar"
            Copy-Item -LiteralPath $latestJar.FullName -Destination $instanceTarget -Force
            Write-Host "  Instance: $instanceTarget"
        }
    }
}

Write-Host "Synced bloom mod jar:"
Write-Host "  Source: $($latestJar.FullName)"
Write-Host "  Target: $targetFile"
