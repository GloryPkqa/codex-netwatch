param([Parameter(Mandatory=$true)][string]$Plan)
# A Node parent may inherit PowerShell 7 module paths. Use only this worker's
# Windows PowerShell built-ins, never load modules from the parent shell.
$env:PSModulePath = $PSHOME + '\Modules'
$ErrorActionPreference = 'Stop'
# A detached worker: the running collector/EXE must be closed before any replacement.
# Paths are data from a locally generated JSON plan, never PowerShell expressions.
$jobRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$planPath = [IO.Path]::GetFullPath($Plan)
if ($planPath -ne (Join-Path $jobRoot 'plan.json')) { throw 'Invalid update plan location' }
$p = Get-Content -LiteralPath $planPath -Raw -Encoding UTF8 | ConvertFrom-Json
$installRoot = [IO.Path]::GetFullPath($p.root)
$dataRoot = [IO.Path]::GetFullPath($p.dataDir)
$archive = [IO.Path]::GetFullPath($p.archive)
if ($archive -ne (Join-Path $jobRoot 'codex-netwatch-windows-x64.zip') -or
    !$jobRoot.StartsWith((Join-Path $dataRoot 'updates') + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $p.version -notmatch '^\d{1,4}\.\d{1,4}\.\d{1,4}$' -or $p.sha256 -notmatch '^[a-f0-9]{64}$' -or
    $p.port -lt 1024 -or $p.port -gt 65535) { throw 'Invalid update plan' }
$exe = Join-Path $installRoot 'Codex-Netwatch.exe'
$backup = Join-Path $jobRoot 'backup'
$stage = Join-Path $jobRoot 'stage'
$replaced = @()
$stopped = $false
$writing = $false
$newTray = $null
$newCollector = $null
function Write-Result([string]$State, [string]$ErrorText = '') {
  $result = [ordered]@{state=$State;version=$p.version;job=[IO.Path]::GetFileName($jobRoot);at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();backup=$backup;error=$ErrorText}
  $text = $result | ConvertTo-Json
  [IO.File]::WriteAllText((Join-Path $jobRoot 'result.json'), $text, (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $dataRoot 'update-result.json'), $text, (New-Object Text.UTF8Encoding($false)))
}
function Assert-Child([string]$Parent, [string]$Child) {
  $resolved = [IO.Path]::GetFullPath($Child)
  if (!$resolved.StartsWith([IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe update path' }
  return $resolved
}
function Test-Alive([int]$ProcessId) { return [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) }
function Get-Health {
  try { return Invoke-RestMethod -Uri ('http://127.0.0.1:' + $p.port + '/api/health') -TimeoutSec 1 } catch { return $null }
}
function Start-Tray {
  $env:CODEX_FLOW_DATA_DIR = $dataRoot
  $env:CODEX_FLOW_PORT = [string]$p.port
  return Start-Process -FilePath $exe -ArgumentList '--no-browser' -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru
}
function Find-NewCollector {
  if ($newCollector -and !$newCollector.HasExited) { return }
  $lockPath = Join-Path $dataRoot 'collector.lock'
  if (!$newTray -or !(Test-Path -LiteralPath $lockPath)) { return }
  try {
    $record = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
    $candidate = Get-Process -Id $record.pid -ErrorAction Stop
    $details = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$record.pid)
    if ($candidate.Path -eq (Join-Path $installRoot 'runtime\node.exe') -and
        $details.ParentProcessId -eq $newTray.Id -and $candidate.StartTime -ge $newTray.StartTime) {
      $null = $candidate.Handle
      if ($newCollector) { $newCollector.Dispose() }
      $script:newCollector = $candidate
    }
  } catch { }
}
function Wait-NewVersion([string]$Version) {
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 400
    Find-NewCollector
    $health = Get-Health
    if ($newTray.HasExited) { return $false }
    if ($newCollector -and !$newCollector.HasExited -and $health -and $health.app -eq 'codex-flow' -and
        $health.version -eq $Version -and !$health.demo -and $health.desktopInstance -and
        $health.desktopInstance -ne $p.instance) {
      if ($health.collectorPid -eq $newCollector.Id) { return $true }
      # Releases before 0.5 did not expose PID; verify the loopback listener when
      # confirming a restored older version instead of trusting another service.
      if (!$health.collectorPid) {
        $listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $p.port -State Listen -ErrorAction SilentlyContinue
        if ($listener -and $listener.OwningProcess -eq $newCollector.Id) { return $true }
      }
    }
  }
  return $false
}
function Stop-NewTray {
  Find-NewCollector
  if (!$newTray) { return }
  # Only signal the exact application we started. Never terminate another listener.
  if (!$newTray.HasExited) {
    $process = Get-Process -Id $newTray.Id -ErrorAction Stop
    if ($process.Path -ne $exe -or $process.StartTime -ne $newTray.StartTime) { throw 'Update process identity changed' }
    $env:CODEX_FLOW_DATA_DIR = $dataRoot; $env:CODEX_FLOW_PORT = [string]$p.port
    $signal = Start-Process -FilePath $exe -ArgumentList '--exit' -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru
    if (!$signal.WaitForExit(10000)) { throw 'Exit request timed out' }
    if (!$process.WaitForExit(15000)) { throw 'Updated application did not stop' }
  }
  # A crashed tray may leave its child alive. Only a verified child handle can be
  # stopped; an unknown live lock prevents rollback rather than losing its WAL.
  if ($newCollector -and !$newCollector.WaitForExit(5000)) { $newCollector.Kill(); if (!$newCollector.WaitForExit(5000)) { throw 'Updated collector did not stop' } }
  $lockPath = Join-Path $dataRoot 'collector.lock'
  if (Test-Path -LiteralPath $lockPath) {
    $record = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
    if (Test-Alive $record.pid) { throw 'Live collector prevents rollback' }
  }
}
try {
  Write-Result 'validating'
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $p.sha256) { throw 'Package checksum mismatch' }
  $current = Get-Content -LiteralPath (Join-Path $installRoot 'package.json') -Raw | ConvertFrom-Json
  if ($current.version -ne $p.currentVersion -or [version]$p.version -le [version]$current.version) { throw 'Version changed or downgrade refused' }
  if (Test-Path -LiteralPath $stage) { throw 'Update stage already exists' }
  New-Item -ItemType Directory -Path $stage | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($archive)
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $length = 0L
  try {
    if ($zip.Entries.Count -gt 1500) { throw 'Too many package entries' }
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName.Replace('\','/')
      # The build also contains a non-executable icon outside the application folder.
      if ($name -eq 'Netwatch.ico') { continue }
      if ($name -notmatch '^codex-netwatch/' -or $name -match '(^|/)(\.|\.\.)(/|$)|[:\x00-\x1f]' -or
          $name -match '[. ](/|$)' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'Unsafe ZIP entry' }
      $relative = $name.Substring('codex-netwatch/'.Length)
      if (!$relative) { continue }
      if ($relative -notmatch '^(src|public|docs|native|runtime|scripts)/' -and
          $relative -notmatch '^(Codex-Netwatch\.exe(\.config)?|Microsoft\.Web\.WebView2\.(Core|WinForms)\.dll|WebView2Loader\.dll|WEBVIEW2-(LICENSE|NOTICE)\.txt|webview2-manifest\.json|LICENSE|package\.json|config\.example\.json|README(\.zh-CN|\.en)?\.md|SECURITY\.md|CHANGELOG\.md|WINDOWS_PORTABLE\.md|START-HERE\.txt)$') { throw 'Unexpected package file' }
      if ($name.EndsWith('/')) { continue }
      if (!$seen.Add($relative)) { throw 'Duplicate ZIP entry' }
      $length += $entry.Length
      if ($length -gt 1073741824 -or $entry.Length -gt 268435456) { throw 'Package expansion limit exceeded' }
      $destination = Assert-Child $stage (Join-Path $stage $relative)
      New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $false)
    }
  } finally { $zip.Dispose() }
  foreach ($required in @('Codex-Netwatch.exe','runtime/node.exe','src/main.mjs','public/index.html','package.json','scripts/install-update.ps1')) {
    if (!(Test-Path -LiteralPath (Join-Path $stage $required) -PathType Leaf)) { throw 'Incomplete package' }
  }
  $next = Get-Content -LiteralPath (Join-Path $stage 'package.json') -Raw | ConvertFrom-Json
  if ($next.version -ne $p.version -or $next.name -ne 'codex-netwatch') { throw 'Package identity mismatch' }
  $hostProcess = Get-Process -Id $p.hostPid -ErrorAction Stop
  $collectorProcess = Get-Process -Id $p.collectorPid -ErrorAction Stop
  $health = Get-Health
  if ($hostProcess.Path -ne $exe -or $collectorProcess.Path -ne (Join-Path $installRoot 'runtime\node.exe') -or
      !$health -or $health.app -ne 'codex-flow' -or $health.version -ne $p.currentVersion -or
      $health.desktopInstance -ne $p.instance -or $health.demo) { throw 'Running application identity changed' }
  # Back up every overwritten application file before asking the current host to exit.
  New-Item -ItemType Directory -Path (Join-Path $backup 'app') -Force | Out-Null
  foreach ($relative in $seen) {
    $target = Assert-Child $installRoot (Join-Path $installRoot $relative)
    # Reparse points could redirect writes outside the portable folder; refuse them.
    $ancestor = $target
    while ($ancestor -and $ancestor.Length -ge $installRoot.Length) {
      if ((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse point in install path' }
      $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
    if (Test-Path -LiteralPath $target) {
      $saved = Assert-Child $backup (Join-Path (Join-Path $backup 'app') $relative)
      New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($saved)) -Force | Out-Null
      Copy-Item -LiteralPath $target -Destination $saved
    }
  }
  $env:CODEX_FLOW_DATA_DIR = $dataRoot; $env:CODEX_FLOW_PORT = [string]$p.port
  $signal = Start-Process -FilePath $exe -ArgumentList '--exit' -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru
  if (!$signal.WaitForExit(10000)) { throw 'Exit request timed out' }
  $stopped = $true
  if (!$hostProcess.WaitForExit(15000) -or !$collectorProcess.WaitForExit(15000)) { throw 'Current application did not stop' }
  New-Item -ItemType Directory -Path (Join-Path $backup 'data') -Force | Out-Null
  foreach ($name in @('monitor.sqlite','monitor.sqlite-wal','monitor.sqlite-shm')) {
    if (Test-Path -LiteralPath (Join-Path $dataRoot $name)) { Copy-Item -LiteralPath (Join-Path $dataRoot $name) -Destination (Join-Path $backup 'data') }
  }
  if (Test-Path -LiteralPath (Join-Path $installRoot 'config.local.json')) { Copy-Item -LiteralPath (Join-Path $installRoot 'config.local.json') -Destination $backup }
  Write-Result 'installing'
  $writing = $true
  foreach ($relative in $seen) {
    $source = Assert-Child $stage (Join-Path $stage $relative)
    $target = Assert-Child $installRoot (Join-Path $installRoot $relative)
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
    $replaced += $relative
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      try { Copy-Item -LiteralPath $source -Destination $target -Force; break }
      catch { if ($attempt -eq 19) { throw }; Start-Sleep -Milliseconds 200 }
    }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) { throw 'Installed file checksum mismatch' }
  }
  $newTray = Start-Tray
  if (!(Wait-NewVersion $p.version)) { throw 'Updated application failed to start' }
  Write-Result 'completed'
} catch {
  $failure = $_.Exception.Message
  if ($writing) {
    try {
      Stop-NewTray
      foreach ($relative in $replaced) {
        $target = Assert-Child $installRoot (Join-Path $installRoot $relative)
        $saved = Assert-Child $backup (Join-Path (Join-Path $backup 'app') $relative)
        if (Test-Path -LiteralPath $saved) { Copy-Item -LiteralPath $saved -Destination $target -Force }
        elseif (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
      }
      foreach ($name in @('monitor.sqlite','monitor.sqlite-wal','monitor.sqlite-shm')) {
        $target = Assert-Child $dataRoot (Join-Path $dataRoot $name)
        $saved = Join-Path (Join-Path $backup 'data') $name
        if (Test-Path -LiteralPath $saved) { Copy-Item -LiteralPath $saved -Destination $target -Force }
        elseif (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
      }
      $newCollector = $null
      $newTray = Start-Tray
      if (!(Wait-NewVersion $p.currentVersion)) { throw 'Restored application failed to start' }
      Write-Result 'rolled_back' $failure
    } catch { Write-Result 'rollback_failed' ($failure + '; ' + $_.Exception.Message) }
  } else {
    if ($stopped -and !(Test-Alive $p.hostPid) -and !(Test-Alive $p.collectorPid)) { $null = Start-Tray }
    Write-Result 'failed' $failure
  }
  exit 1
}
