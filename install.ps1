# smart-claude install wrapper (Windows PowerShell).
#
# Usage:
#   .\install.ps1 --context <name>[,<name>...] [flags]
#
# Flags are forwarded verbatim to scripts/install.js.
#
# Examples:
#   .\install.ps1 --context frontend
#   .\install.ps1 --context nestjs,devops --force
#   .\install.ps1 --context fastapi,frontend
#   .\install.ps1 --context all --dir C:\code\app
#   .\install.ps1 --context devops --target cursor --dry-run

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "[install.ps1] Node.js is required but was not found on PATH."
    exit 1
}

$installer = Join-Path $scriptDir 'scripts\install.js'
& node $installer @args
exit $LASTEXITCODE
