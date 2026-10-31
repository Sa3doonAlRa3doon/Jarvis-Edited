$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LogRoot = Join-Path $ProjectRoot 'runtime-logs'
$EnvFile = Join-Path $ProjectRoot '.env'
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

function Read-DotEnvValue {
  param([string]$Name, [string]$Default = '')
  if (-not (Test-Path -LiteralPath $EnvFile)) { return $Default }
  $pattern = '^\s*' + [regex]::Escape($Name) + '=(.*)$'
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ($line -match $pattern) { return $Matches[1].Trim().Trim('"').Trim("'") }
  }
  return $Default
}

function ListeningPid {
  param([int]$Port)
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($connection) { return [int]$connection.OwningProcess }
  return 0
}

function Wait-Http {
  param([string]$Url, [int]$TimeoutSeconds = 60)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  return $false
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js is required and was not found in PATH.' }

$dashboardPort = [int](Read-DotEnvValue 'PORT' '8788')
$ollamaUrl = [uri](Read-DotEnvValue 'OLLAMA_BASE_URL' 'http://127.0.0.1:11434')
$openJarvisUrl = [uri](Read-DotEnvValue 'OPENJARVIS_BASE_URL' 'http://127.0.0.1:8000')
$openJarvisInstall = Read-DotEnvValue 'OPENJARVIS_INSTALL_DIR' (Join-Path $env:LOCALAPPDATA 'OpenJarvis\src')
$openJarvisExe = Join-Path $openJarvisInstall '.venv\Scripts\jarvis.exe'
$model = Read-DotEnvValue 'JARVIS_MODEL' 'qwen2.5:1.5b'
$ollamaHost = Read-DotEnvValue 'OLLAMA_HOST' '127.0.0.1:11434'
$ollamaCloud = Read-DotEnvValue 'OLLAMA_NO_CLOUD' '1'
$ollamaMaxLoaded = Read-DotEnvValue 'OLLAMA_MAX_LOADED_MODELS' '1'

$ollamaPid = ListeningPid $ollamaUrl.Port
if (-not $ollamaPid) {
  $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  if (-not $ollama) { throw 'Ollama is not installed or is not in PATH.' }
  # Keep the Windows fallback aligned with the Pi profile: local-only HTTP and
  # one resident model so a general model and qwen2.5vl:3b can swap safely.
  $env:OLLAMA_HOST = $ollamaHost
  $env:OLLAMA_NO_CLOUD = $ollamaCloud
  $env:OLLAMA_MAX_LOADED_MODELS = $ollamaMaxLoaded
  Start-Process -FilePath $ollama.Source -ArgumentList @('serve') -WorkingDirectory $ProjectRoot -RedirectStandardOutput (Join-Path $LogRoot 'ollama-windows.log') -RedirectStandardError (Join-Path $LogRoot 'ollama-windows.error.log') -WindowStyle Hidden | Out-Null
}

$openJarvisPid = ListeningPid $openJarvisUrl.Port
if (-not $openJarvisPid) {
  if (-not (Test-Path -LiteralPath $openJarvisExe)) { throw "OpenJarvis executable was not found at $openJarvisExe. Run scripts/setup-windows.ps1 first." }
  $jarvisArgs = @('serve', '--host', '127.0.0.1', '--port', [string]$openJarvisUrl.Port, '--model', $model)
  Start-Process -FilePath $openJarvisExe -ArgumentList $jarvisArgs -WorkingDirectory $openJarvisInstall -RedirectStandardOutput (Join-Path $LogRoot 'openjarvis-windows.log') -RedirectStandardError (Join-Path $LogRoot 'openjarvis-windows.error.log') -WindowStyle Hidden | Out-Null
}

$dashboardPid = ListeningPid $dashboardPort
if (-not $dashboardPid) {
  Start-Process -FilePath $node.Source -ArgumentList @('server.mjs') -WorkingDirectory $ProjectRoot -RedirectStandardOutput (Join-Path $LogRoot 'server-windows.log') -RedirectStandardError (Join-Path $LogRoot 'server-windows.error.log') -WindowStyle Hidden | Out-Null
}

$dashboardReady = Wait-Http "http://127.0.0.1:$dashboardPort/api/health"
$openJarvisReady = Wait-Http "$($openJarvisUrl.AbsoluteUri.TrimEnd('/'))/health"
$ollamaReady = Wait-Http "$($ollamaUrl.AbsoluteUri.TrimEnd('/'))/api/tags"
if (-not $dashboardReady) { throw "Dashboard did not become healthy at http://127.0.0.1:$dashboardPort." }

Write-Host "JARVIS dashboard: http://127.0.0.1:$dashboardPort/"
Write-Host "JARVIS settings:  http://127.0.0.1:$dashboardPort/settings"
Write-Host "JARVIS workspace: http://127.0.0.1:$dashboardPort/workspace"
Write-Host ("OpenJarvis:      " + ($(if ($openJarvisReady) { 'ONLINE' } else { 'OFFLINE' })))
Write-Host ("Ollama:           " + ($(if ($ollamaReady) { 'ONLINE' } else { 'OFFLINE' })))
Write-Host 'Interactive browser actions remain isolated and require one exact dashboard approval.'
