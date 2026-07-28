param(
  [string]$PackageManager = "bun"
)

$ErrorActionPreference = "Stop"

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RootDir

$BinDir = Join-Path $RootDir "bin"
$BinPath = Join-Path $BinDir "seed"

if ($PackageManager -ne "bun" -and $PackageManager -ne "npm") {
  [Console]::Error.WriteLine("Unsupported package manager: $PackageManager")
  Write-Host "Usage: .\scripts\setup-global.ps1 [bun|npm]"
  exit 1
}

if (-not (Get-Command $PackageManager -ErrorAction SilentlyContinue)) {
  [Console]::Error.WriteLine("$PackageManager is not installed or not on PATH.")
  if ($PackageManager -eq "bun") {
    Write-Host "Install bun first: https://bun.sh"
  } else {
    Write-Host "Install Node.js/npm first: https://nodejs.org"
  }
  exit 1
}

function Invoke-PackageManager {
  param(
    [string]$Executable,
    [string[]]$CommandArgs
  )

  & $Executable @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    $RenderedCommand = "$Executable $($CommandArgs -join ' ')"
    throw "'$RenderedCommand' failed with exit code $LASTEXITCODE."
  }
}

Write-Host "Preparing local 'seed' executable..."
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$Utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
  $BinPath,
  "#!/usr/bin/env bun`n`nimport `"../src/main.ts`"`n",
  $Utf8WithoutBom
)

Write-Host "Installing dependencies with $PackageManager..."
Invoke-PackageManager -Executable $PackageManager -CommandArgs @("install")

Write-Host "Linking 'seed' globally with $PackageManager..."
Invoke-PackageManager -Executable $PackageManager -CommandArgs @("link")

Write-Host
if (Get-Command seed -ErrorAction SilentlyContinue) {
  Write-Host "Done. You can now run: seed"
} else {
  Write-Host "Link created, but 'seed' is not on PATH yet."
  if ($PackageManager -eq "bun") {
    $GlobalBin = (& bun pm bin -g | Out-String).Trim()
    Write-Host "Add Bun's bin directory to PATH: $GlobalBin"
  } else {
    $GlobalBin = (& npm config get prefix | Out-String).Trim()
    Write-Host "Add npm's global bin directory to PATH: $GlobalBin"
  }
}
