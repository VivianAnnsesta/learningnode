param(
  [switch]$Electron,
  [switch]$Web
)

$ErrorActionPreference = "Stop"

[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONIOENCODING = "utf-8"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebDir = Join-Path $RootDir "web"

if (-not (Test-Path -LiteralPath $WebDir -PathType Container)) {
  throw "Cannot find web directory: $WebDir"
}

$PackageJson = Join-Path $WebDir "package.json"
if (-not (Test-Path -LiteralPath $PackageJson -PathType Leaf)) {
  throw "Cannot find package.json: $PackageJson"
}

$NodeModules = Join-Path $WebDir "node_modules"
if (-not (Test-Path -LiteralPath $NodeModules -PathType Container)) {
  Write-Host "Dependencies are missing. Installing with npm ci..."
  Push-Location $WebDir
  try {
    npm ci
  }
  finally {
    Pop-Location
  }
}

$ElectronPackageDir = Join-Path $NodeModules "electron"
$ElectronPackageJson = Join-Path $ElectronPackageDir "package.json"
$ElectronPathMarker = Join-Path $ElectronPackageDir "path.txt"
$ElectronBinary = Join-Path $ElectronPackageDir "dist\electron.exe"
if (-not (Test-Path -LiteralPath $ElectronPackageJson -PathType Leaf)) {
  Write-Host "Electron package is missing. Installing dependencies with npm ci..."
  Push-Location $WebDir
  try {
    npm ci
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed while installing the Electron development dependency."
    }
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $ElectronPathMarker -PathType Leaf) -or
    -not (Test-Path -LiteralPath $ElectronBinary -PathType Leaf)) {
  Write-Host "Electron runtime is incomplete. Rebuilding the Electron package..."
  Push-Location $WebDir
  try {
    npm rebuild electron --foreground-scripts
    if ($LASTEXITCODE -ne 0) {
      throw "npm rebuild electron failed."
    }
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $ElectronPathMarker -PathType Leaf) -or
    -not (Test-Path -LiteralPath $ElectronBinary -PathType Leaf)) {
  throw "Electron runtime is still incomplete: $ElectronBinary"
}

$ScriptName = if ($Web) { "dev" } else { "dev:electron" }

Write-Host "Starting development environment: npm run $ScriptName"
Write-Host "Working directory: $WebDir"

Push-Location $WebDir
try {
  npm run $ScriptName
}
finally {
  Pop-Location
}
