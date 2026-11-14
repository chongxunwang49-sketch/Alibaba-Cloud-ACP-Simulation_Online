# Upload the repository to an ECS host and run deploy.sh there.
# Windows PowerShell 5.1 friendly: ASCII only, no ternary operators.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Server,

    [int]$Port = 22,

    [string]$Key = "$HOME\.ssh\id_ed25519",

    [string]$RemoteDir = "/opt/acp",

    [string]$NpmRegistry = "https://registry.npmmirror.com",

    [switch]$SkipBuild,

    [switch]$Logs
)

$ErrorActionPreference = "Stop"

if ($Server -notmatch '^[^@\s]+@[^@\s]+$') {
    throw "Server must look like root@1.2.3.4"
}
if ($RemoteDir -notmatch '^/[A-Za-z0-9._/-]+$') {
    throw "RemoteDir must be an absolute path without spaces, e.g. /opt/acp"
}
if ($NpmRegistry -notmatch '^https?://[A-Za-z0-9._/-]+$') {
    throw "NpmRegistry must be an http(s) URL without spaces"
}

foreach ($cmd in @("tar.exe", "scp.exe", "ssh.exe")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "Missing command: $cmd"
    }
}
if (-not (Test-Path -LiteralPath $Key)) {
    throw "SSH key not found: $Key"
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$archive = Join-Path $env:TEMP ("acp-docker-{0}.tar.gz" -f (Get-Date -Format "yyyyMMddHHmmss"))

Write-Host "[tar] $archive"
& tar.exe -czf $archive -C $root `
    --exclude=*/node_modules `
    --exclude=*/dist `
    --exclude=.git `
    --exclude=.env `
    --exclude=*/.env `
    --exclude=_verify `
    --exclude=ACP* `
    --exclude=docs/screenshots `
    --exclude=deploy/legacy-host `
    --exclude=*.log `
    .
if ($LASTEXITCODE -ne 0) {
    throw "tar failed with exit code $LASTEXITCODE"
}

$sizeMb = [math]::Round((Get-Item -LiteralPath $archive).Length / 1MB, 2)
Write-Host "[scp] $sizeMb MB -> ${Server}:/tmp/acp-docker.tar.gz"
& scp.exe -q -P $Port -i $Key -o BatchMode=yes -o StrictHostKeyChecking=accept-new $archive "${Server}:/tmp/acp-docker.tar.gz"
if ($LASTEXITCODE -ne 0) {
    throw "scp failed with exit code $LASTEXITCODE"
}

$deployArgs = ""
if ($SkipBuild) { $deployArgs += " --no-build" }
if ($Logs) { $deployArgs += " --logs" }

$remote = "set -e; mkdir -p '$RemoteDir'; tar -xzf /tmp/acp-docker.tar.gz -C '$RemoteDir'; cd '$RemoteDir'; NPM_REGISTRY='$NpmRegistry' bash deploy.sh$deployArgs; rm -f /tmp/acp-docker.tar.gz"

Write-Host "[ssh] deploying to $RemoteDir ..."
# Docker build 的进度输出走 stderr；PowerShell 5.1 在 EAP=Stop 下会把 native stderr
# 当成异常直接中止脚本，导致远端部署还没结束本地就报错退出。
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& ssh.exe -p $Port -i $Key -o BatchMode=yes -o StrictHostKeyChecking=accept-new $Server $remote
$code = $LASTEXITCODE
$ErrorActionPreference = $prevEap

Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue

if ($code -ne 0) {
    throw "Remote deploy failed with exit code $code"
}

Write-Host "[done] http://<server-public-ip>/"
