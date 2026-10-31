$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$EnvFile = Join-Path $ProjectRoot '.env'

function Read-DotEnvValue {
  param([string]$Name, [string]$Default = '')
  if (-not (Test-Path -LiteralPath $EnvFile)) { return $Default }
  $pattern = '^\s*' + [regex]::Escape($Name) + '=(.*)$'
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ($line -match $pattern) { return $Matches[1].Trim().Trim('"').Trim("'") }
  }
  return $Default
}

$dashboardPort = [int](Read-DotEnvValue 'PORT' '8788')
$connection = Get-NetTCPConnection -LocalPort $dashboardPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($connection) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)"
  $commandLine = [string]$process.CommandLine
  $normalizedCommand = $commandLine.Replace('/', '\').ToLowerInvariant()
  $normalizedRoot = $ProjectRoot.Replace('/', '\').ToLowerInvariant()
  $commandMatchesProject = $normalizedCommand.Contains($normalizedRoot) -and $normalizedCommand.Contains('server.mjs')
  $healthMatchesProject = $false
  if (-not $commandMatchesProject -and $normalizedCommand -match '(?:^|\s)server\.mjs(?:\s|$)') {
    try { $healthMatchesProject = (Invoke-RestMethod "http://127.0.0.1:$dashboardPort/api/health" -TimeoutSec 3).version -eq '3.31.0' } catch {}
  }
  if (-not $commandMatchesProject -and -not $healthMatchesProject) {
    throw "Port $dashboardPort is owned by a process outside this JARVIS project; refusing to stop it."
  }
  Write-Host "Stopping the verified JARVIS dashboard process $($connection.OwningProcess) on port $dashboardPort..."
  Stop-Process -Id $connection.OwningProcess -Force
  Start-Sleep -Milliseconds 400
}

& (Join-Path $PSScriptRoot 'start-local-stack.ps1')
