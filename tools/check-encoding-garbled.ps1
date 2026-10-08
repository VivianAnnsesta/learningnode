$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$excludedDirectories = @(
  "node_modules",
  ".git",
  ".next",
  ".ms-playwright",
  "dist",
  "build",
  ".turbo",
  "coverage",
  "dist-electron",
  "test-results"
)

$includedExtensions = @(
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".prisma",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml"
)

$includedFileNames = @(
  ".editorconfig",
  ".env.example",
  ".gitattributes",
  ".gitignore"
)

$garbledChars = @(
  [char]0x9420,
  [char]0x95BA,
  [char]0x923B,
  [char]0x93B9,
  [char]0x9366,
  [char]0x9350,
  [char]0xFFFD
)

$findings = New-Object System.Collections.Generic.List[object]

function Get-RepoRelativePath {
  param([string]$Path)

  $root = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd("\", "/")
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if ($fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $fullPath.Substring($root.Length).TrimStart("\", "/")
  }
  return $fullPath
}

function Test-IsExcludedPath {
  param([string]$Path)

  $relative = Get-RepoRelativePath $Path
  $parts = $relative -split "[\\/]+"
  foreach ($part in $parts) {
    if ($excludedDirectories -contains $part) {
      return $true
    }
  }
  return $false
}

function Test-IsIncludedFile {
  param([System.IO.FileInfo]$File)

  if ($includedFileNames -contains $File.Name) {
    return $true
  }
  return $includedExtensions -contains $File.Extension.ToLowerInvariant()
}

$files = Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Force |
  Where-Object { -not (Test-IsExcludedPath $_.FullName) } |
  Where-Object { Test-IsIncludedFile $_ }

foreach ($file in $files) {
  $lines = @(Get-Content -LiteralPath $file.FullName -Encoding UTF8)
  for ($index = 0; $index -lt $lines.Count; $index++) {
    $line = $lines[$index]
    foreach ($char in $garbledChars) {
      if ($line.Contains([string]$char)) {
        $findings.Add([pscustomobject]@{
          File = Get-RepoRelativePath $file.FullName
          Line = $index + 1
          Text = $line
        })
        break
      }
    }
  }
}

if ($findings.Count -gt 0) {
  [Console]::Error.WriteLine("Detected likely Chinese mojibake or replacement characters:")
  foreach ($finding in $findings) {
    [Console]::Error.WriteLine(("{0}:{1}: {2}" -f $finding.File, $finding.Line, $finding.Text))
  }
  exit 1
}

Write-Host "Encoding check passed. No configured garbled characters were found."
