param([switch]$Demo, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
try {
  $projectRoot = Split-Path -Parent $PSScriptRoot
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
  if (!(Test-Path -LiteralPath $nodePath)) { throw 'Node.js 24+ is required. Install Node.js, then run start.cmd again.' }
  $nodeVersion = & $nodePath --version
  if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 24) { throw 'Node.js 24+ is required.' }
  $port = 43128
  $localConfig = Join-Path $projectRoot 'config.local.json'
  if (Test-Path -LiteralPath $localConfig) {
    $settings = Get-Content -Raw -LiteralPath $localConfig | ConvertFrom-Json
    if ($settings.port) { $port = [int]$settings.port }
  }
  if ($Demo) { $port = 43129 }
  if ($env:CODEX_FLOW_PORT) { $port = [int]$env:CODEX_FLOW_PORT }
  $env:CODEX_FLOW_PORT = "$port"
  $baseUrl = "http://127.0.0.1:$port"
  $health = $null
  try { $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 2 } catch { }
  if ($health) {
    if ($health.app -ne 'codex-flow' -or [bool]$health.demo -ne [bool]$Demo) { throw 'The port is occupied by a different app or monitor mode. Set CODEX_FLOW_PORT.' }
  } else {
    $logDir = Join-Path $projectRoot $(if ($Demo) { 'data\demo' } else { 'data' })
    if ($env:CODEX_FLOW_DATA_DIR) { $logDir = if ($Demo) { Join-Path $env:CODEX_FLOW_DATA_DIR 'demo' } else { $env:CODEX_FLOW_DATA_DIR } }
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $nodeArguments = @('--disable-warning=ExperimentalWarning', ('"' + (Join-Path $projectRoot 'src\main.mjs') + '"'))
    if ($Demo) { $nodeArguments += '--demo' }
    $launchedProcess = Start-Process -FilePath $nodePath -ArgumentList $nodeArguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log') -PassThru
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
      Start-Sleep -Milliseconds 200
      try { $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 1; break } catch { }
      if ($launchedProcess.HasExited) { throw 'Monitor exited. See data/server-error.log for details.' }
    }
    if (!$health -or $health.app -ne 'codex-flow') { throw 'Monitor did not become ready. See data/server-error.log.' }
  }
  Write-Host "Codex Netwatch is running at $baseUrl"
  if (!$NoBrowser) { Start-Process $baseUrl }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
