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
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { return $true }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  return $false
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js is required and was not found in PATH.' }

$dashboardPort = [int](Read-DotEnvValue 'PORT' '8787')
$settingsPort = [int](Read-DotEnvValue 'JARVIS_SETTINGS_BACKEND_PORT' '8789')
$cameraPort = [int](Read-DotEnvValue 'JARVIS_CAMERA_BACKEND_PORT' '8790')
$microphonePort = [int](Read-DotEnvValue 'JARVIS_MIC_BACKEND_PORT' '8791')
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
  $stackEntry = Join-Path $ProjectRoot 'scripts\start-split-stack.mjs'
  $quotedStackEntry = '"' + $stackEntry + '"'
  Start-Process -FilePath $node.Source -ArgumentList $quotedStackEntry -WorkingDirectory $ProjectRoot -RedirectStandardOutput (Join-Path $LogRoot 'stack-windows.log') -RedirectStandardError (Join-Path $LogRoot 'stack-windows.error.log') -WindowStyle Hidden | Out-Null
}

$dashboardReady = Wait-Http "http://127.0.0.1:$dashboardPort/api/health"
$dashboardFrontendReady = Wait-Http "http://127.0.0.1:$dashboardPort/health" 15
$settingsReady = Wait-Http "http://127.0.0.1:$settingsPort/health" 15
$cameraReady = Wait-Http "http://127.0.0.1:$cameraPort/health" 15
$microphoneReady = Wait-Http "http://127.0.0.1:$microphonePort/health" 15
$openJarvisReady = Wait-Http "$($openJarvisUrl.AbsoluteUri.TrimEnd('/'))/health"
$ollamaReady = Wait-Http "$($ollamaUrl.AbsoluteUri.TrimEnd('/'))/api/tags"
if (-not ($dashboardReady -and $dashboardFrontendReady)) { throw "Dashboard front end or API did not become healthy at http://127.0.0.1:$dashboardPort." }
if (-not ($settingsReady -and $cameraReady -and $microphoneReady)) { throw 'One or more local JARVIS backends did not become healthy. If an older JARVIS is already running, run npm.cmd run restart:local, then check runtime-logs/stack-windows.error.log.' }
$health = Invoke-RestMethod "http://127.0.0.1:$dashboardPort/api/health" -TimeoutSec 5
$backendStatuses = @($health.backends.settings.status, $health.backends.camera.status, $health.backends.microphone.status)
if ($health.version -eq '3.36.0' -and ($backendStatuses -contains 'offline' -or $backendStatuses -contains 'degraded')) { throw 'The split stack is running, but at least one internal backend is degraded. See runtime-logs/stack-windows.error.log.' }

Write-Host "JARVIS dashboard: http://127.0.0.1:$dashboardPort/"
Write-Host "JARVIS settings:  http://127.0.0.1:$dashboardPort/settings"
Write-Host "JARVIS workspace: http://127.0.0.1:$dashboardPort/workspace"
Write-Host "Local backends:   settings :$settingsPort | camera :$cameraPort | microphone :$microphonePort | core API :$(Read-DotEnvValue 'API_PORT' '8788')"
Write-Host ("OpenJarvis:      " + ($(if ($openJarvisReady) { 'ONLINE' } else { 'OFFLINE' })))
Write-Host ("Ollama:           " + ($(if ($ollamaReady) { 'ONLINE' } else { 'OFFLINE' })))
Write-Host 'Interactive browser actions remain isolated and require one exact dashboard approval.'
