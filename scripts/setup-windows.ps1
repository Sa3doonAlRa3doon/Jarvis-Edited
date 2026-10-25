$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Workspace = if ($env:OPENJARVIS_WORKSPACE) { $env:OPENJARVIS_WORKSPACE } else { Join-Path $env:USERPROFILE 'Jarvis-Workspace' }
$Profile = if ($env:JARVIS_BROWSER_PROFILE) { $env:JARVIS_BROWSER_PROFILE } else { Join-Path $Workspace '.jarvis-browser-profile' }
$BrowserOutput = if ($env:JARVIS_BROWSER_OUTPUT) { $env:JARVIS_BROWSER_OUTPUT } else { Join-Path $Workspace 'browser-output' }
$Model = if ($env:JARVIS_MODEL) { $env:JARVIS_MODEL } else { 'llama3.2:1b' }

foreach ($command in 'node', 'npm', 'python') {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command is required and was not found in PATH." }
}

New-Item -ItemType Directory -Force -Path $Workspace, $Profile, $BrowserOutput | Out-Null
Push-Location $ProjectRoot
try {
  npm install --omit=dev
  python -c "import tomlkit" 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'The selected Python environment does not contain tomlkit. Run this script from the OpenJarvis environment.' }
  $Config = Join-Path $env:USERPROFILE '.openjarvis\config.toml'
  python scripts\configure-openjarvis.py --config $Config --model $Model --allowed-dir $Workspace --browser-control --browser-launcher (Join-Path $ProjectRoot 'scripts\start-browser-mcp.mjs')
} finally {
  Pop-Location
}

Write-Host "JARVIS Windows workspace ready: $Workspace"
Write-Host "Private browser profile: $Profile"
Write-Host 'Start Ollama, OpenJarvis, and the dashboard. Interactive browser tasks require a one-time dashboard approval.'
