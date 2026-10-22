param([string]$PortableRoot, [string]$Screenshot)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$PortableRoot) { $PortableRoot = Join-Path $projectRoot 'data\windows-package-stage\codex-netwatch' }
$PortableRoot = [IO.Path]::GetFullPath($PortableRoot)
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('netwatch-gui-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
if (!$Screenshot) { $Screenshot = Join-Path $testRoot 'gui.png' }
$Screenshot = [IO.Path]::GetFullPath($Screenshot)
foreach ($binding in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')) {
    Copy-Item -LiteralPath (Join-Path $PortableRoot $binding) -Destination $testRoot
}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$probe = Join-Path $testRoot 'GuiSmoke.exe'
& $compiler /nologo /target:winexe /platform:x64 /codepage:65001 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.dll /reference:System.Core.dll ("/reference:" + (Join-Path $testRoot 'Microsoft.Web.WebView2.Core.dll')) ("/reference:" + (Join-Path $testRoot 'Microsoft.Web.WebView2.WinForms.dll')) ("/out:" + $probe) (Join-Path $PSScriptRoot 'DashboardWindow.cs') (Join-Path $PSScriptRoot 'GuiSmoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'GUI test compilation failed.' }
$listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
$listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
$previousPort = $env:CODEX_FLOW_PORT; $previousData = $env:CODEX_FLOW_DATA_DIR
$env:CODEX_FLOW_PORT = [string]$port; $env:CODEX_FLOW_DATA_DIR = Join-Path $testRoot 'data'
$trayExe = Join-Path $PortableRoot 'Codex-Netwatch.exe'
$hostProcess = $null; $probeProcess = $null
try {
    $hostProcess = Start-Process -FilePath $trayExe -ArgumentList '--demo','--no-browser' -WindowStyle Hidden -PassThru
    $ready = $false
    for ($attempt=0; $attempt -lt 50; $attempt++) {
        try { $health = Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 1; if ($health.demo -eq $true) { $ready=$true; break } } catch { }
        Start-Sleep -Milliseconds 100
    }
    if (!$ready) { throw 'Synthetic desktop collector not ready.' }
    $report = Join-Path $testRoot 'report.json'
    $profile = Join-Path $testRoot 'profile'
    $probeProcess = Start-Process -FilePath $probe -ArgumentList @("`"http://127.0.0.1:$port`"", "`"$profile`"", "`"$report`"", "`"$Screenshot`"") -WindowStyle Hidden -PassThru
    if (!$probeProcess.WaitForExit(45000)) { $probeProcess.Kill(); throw 'GUI smoke timeout.' }
    Get-Content -LiteralPath $report
    if ($probeProcess.ExitCode -ne 0) { throw 'GUI smoke failed.' }
    Write-Host "Synthetic GUI screenshot: $Screenshot"
} finally {
    $stopper = Start-Process -FilePath $trayExe -ArgumentList '--demo','--exit' -WindowStyle Hidden -PassThru
    [void]$stopper.WaitForExit(5000)
    if ($hostProcess -and !$hostProcess.WaitForExit(10000)) { $hostProcess.Kill() }
    $env:CODEX_FLOW_PORT = $previousPort; $env:CODEX_FLOW_DATA_DIR = $previousData
}
