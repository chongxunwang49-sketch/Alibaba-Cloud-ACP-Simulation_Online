<#
.SYNOPSIS
  ACP mock exam - Windows one-click deploy (PowerShell wrapper around deploy.sh).

.DESCRIPTION
  Packs the repo (excluding node_modules/.git/.env), uploads it with scp, then
  unpacks and runs deploy/deploy.sh in server mode over ssh.
  ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\push.ps1 -Server root@47.xx.xx.xx -Key "$HOME\.ssh\id_ed25519"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\push.ps1 -Server root@47.xx.xx.xx -SkipWeb
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Server,

  [int]$Port = 22,

  [string]$Key = (Join-Path $HOME ".ssh\id_ed25519"),

  [string]$RemoteDir = "/opt/acp",

  [switch]$SkipWeb,

  [switch]$SkipNginx
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

foreach ($cmd in 'ssh', 'scp', 'tar.exe') {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Fail "Missing command: $cmd (OpenSSH client and tar.exe ship with Windows 10+)"
  }
}

$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'server\package.json'))) {
  Fail "server\package.json not found - run this from the repository root"
}
if (-not (Test-Path (Join-Path $root 'deploy\deploy.sh'))) {
  Fail "deploy\deploy.sh not found"
}

$keyArgs = @()
if ($Key -and (Test-Path $Key)) {
  $keyArgs = @('-i', $Key)
  Write-Host "[OK] Using key $Key"
} else {
  Write-Host "[WARN] Key not found: $Key - falling back to password / ssh-agent" -ForegroundColor Yellow
}

$tar = Join-Path $env:TEMP ("acp-deploy-{0}.tar.gz" -f (Get-Date -Format 'yyyyMMddHHmmss'))
$remoteTar = '/tmp/acp-deploy.tar.gz'

try {
  Write-Host "[1/4] Packing $root"
  & tar.exe -czf $tar -C $root `
    --exclude '*node_modules*' `
    --exclude 'server/.env' `
    --exclude '.git' --exclude '.git/*' `
    --exclude '*/.git' --exclude '*/.git/*' `
    --exclude '*edge-profile*' `
    --exclude '*_build/shots*' `
    --exclude '*__pycache__*' `
    --exclude '*.log' `
    .
  if ($LASTEXITCODE -ne 0) { Fail "tar failed (exit $LASTEXITCODE)" }

  $sizeMb = [math]::Round((Get-Item $tar).Length / 1MB, 2)
  Write-Host "[OK] Archive size: $sizeMb MB"

  Write-Host "[2/4] Uploading to ${Server}:$remoteTar"
  & scp -P $Port @keyArgs -o StrictHostKeyChecking=accept-new $tar "${Server}:$remoteTar"
  if ($LASTEXITCODE -ne 0) { Fail "scp failed (check IP / port / key / security group 22)" }

  $envPrefix = ''
  if ($SkipWeb) { $envPrefix += 'SKIP_WEB=1 ' }
  if ($SkipNginx) { $envPrefix += 'SKIP_NGINX=1 ' }

  $remoteCmd = "set -e; mkdir -p '$RemoteDir'; tar -xzf '$remoteTar' -C '$RemoteDir'; cd '$RemoteDir'; ${envPrefix}bash deploy/deploy.sh"

  Write-Host "[3/4] Running deploy.sh on the server (first run: 3-8 min at 1 Mbps)"
  & ssh -p $Port @keyArgs -o StrictHostKeyChecking=accept-new $Server $remoteCmd
  if ($LASTEXITCODE -ne 0) { Fail "Remote deploy failed (exit $LASTEXITCODE)" }

  $hostOnly = $Server.Split('@')[-1]
  Write-Host "[4/4] Done. Open http://$hostOnly/ and verify." -ForegroundColor Green
}
finally {
  if (Test-Path $tar) { Remove-Item $tar -Force -ErrorAction SilentlyContinue }
}
