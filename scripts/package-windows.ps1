param([string]$OutputFile)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$OutputFile) { $OutputFile = Join-Path (Split-Path -Parent $projectRoot) 'codex-netwatch-windows-x64.zip' }
$OutputFile = [System.IO.Path]::GetFullPath($OutputFile)
# Pinned official release. Both archive and extracted executable are verified.
$nodeVersion = '24.22.1'
$archiveName = "node-v$nodeVersion-win-x64.zip"
$archiveSha = 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5'
$exeSha = 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'
$downloadBase = "https://nodejs.org/dist/v$nodeVersion"
$cache = Join-Path $projectRoot 'data\build-cache'
$stageRoot = Join-Path $projectRoot 'data\windows-package-stage'
$stage = Join-Path $stageRoot 'codex-netwatch'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
function Download-Official([string]$Url, [string]$Destination) {
  & curl.exe --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 20 --max-time 180 --retry 2 --output $Destination $Url
  if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
}
$archive = Join-Path $cache $archiveName
$checksums = Join-Path $cache "node-v$nodeVersion-SHASUMS256.txt"
Download-Official "$downloadBase/SHASUMS256.txt" $checksums
$archiveLine = (Get-Content -LiteralPath $checksums | Where-Object { $_ -match ('  ' + [regex]::Escape($archiveName) + '$') })
$exeLine = (Get-Content -LiteralPath $checksums | Where-Object { $_ -match '  win-x64/node.exe$' })
if (!$archiveLine -or $archiveLine.Substring(0,64) -ne $archiveSha -or !$exeLine -or $exeLine.Substring(0,64) -ne $exeSha) { throw 'Official checksums differ from the pinned release. Review before changing the runtime pin.' }
if (!(Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $archiveSha) { Download-Official "$downloadBase/$archiveName" $archive }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $archiveSha) { throw 'Runtime archive SHA-256 mismatch.' }
if (Test-Path -LiteralPath $stageRoot) {
  $resolvedStage = [System.IO.Path]::GetFullPath($stageRoot)
  $expectedParent = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'data')) + [System.IO.Path]::DirectorySeparatorChar
  if (!$resolvedStage.StartsWith($expectedParent,[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$unpack = Join-Path $stageRoot 'runtime-unpack'
Expand-Archive -LiteralPath $archive -DestinationPath $unpack
$officialRoot = Join-Path $unpack "node-v$nodeVersion-win-x64"
if ((Get-FileHash -LiteralPath (Join-Path $officialRoot 'node.exe') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $exeSha) { throw 'Extracted runtime SHA-256 mismatch.' }
$runtime = Join-Path $stage 'runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $officialRoot 'node.exe') -Destination $runtime
Copy-Item -LiteralPath (Join-Path $officialRoot 'LICENSE') -Destination (Join-Path $runtime 'NODE-LICENSE.txt')
Copy-Item -LiteralPath $checksums -Destination (Join-Path $runtime 'SHASUMS256.txt')
$manifest = [ordered]@{
  version=$nodeVersion; platform='win-x64'; downloadUrl="$downloadBase/$archiveName";
  checksumUrl="$downloadBase/SHASUMS256.txt"; archiveSha256=$archiveSha; executableSha256=$exeSha;
  license='NODE-LICENSE.txt'; verification='SHA-256 matched official HTTPS checksum manifest and independently pinned build values; no signature-verification claim.'
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'runtime-manifest.json') -Encoding UTF8
# Allowlist only. Never copy local config, databases, logs, credentials, or build caches.
foreach ($item in @('src','public','docs','LICENSE','package.json','config.example.json','README.md','README.en.md','SECURITY.md','CHANGELOG.md')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $item) -Destination $stage -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $stage 'scripts') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'scripts\windows-observer.ps1') -Destination (Join-Path $stage 'scripts')
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\WINDOWS_PORTABLE.md') -Destination (Join-Path $stage 'WINDOWS_PORTABLE.md')
$icon = Join-Path $stageRoot 'Netwatch.ico'
& (Join-Path $projectRoot 'desktop\make-icon.ps1') -Destination $icon
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework C# compiler is required to build the tray host.' }
$exe = Join-Path $stage 'Codex-Netwatch.exe'
& $compiler /nologo /optimize+ /target:winexe /platform:x64 /codepage:65001 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.dll /reference:System.Core.dll ("/win32manifest:" + (Join-Path $projectRoot 'desktop\app.manifest')) ("/win32icon:" + $icon) ("/resource:" + $icon + ',Netwatch.ico') ("/out:" + $exe) (Join-Path $projectRoot 'desktop\NetwatchTray.cs')
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $exe)) { throw 'Tray host compilation failed.' }
@'
<?xml version="1.0" encoding="utf-8"?>
<configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8"/></startup></configuration>
'@ | Set-Content -LiteralPath "$exe.config" -Encoding UTF8
$readme = @'
Codex Netwatch - Windows x64 portable preview

Extract this entire folder to a writable location, then double-click Codex-Netwatch.exe.
No Node.js installation or administrator permission is required.
Keep runtime/, src/, public/, and scripts/ beside the EXE.

The tray menu opens the dashboard, starts/stops its own collector, and exits.
Data stays in ./data; optional configuration is ./config.local.json.
An existing monitor is view-only from this tray. Its collector is never stopped here.

Windows 10/11 x64 and .NET Framework 4.8 are required.
This preview is unsigned. Compare the release SHA-256 before running.
No autostart, system proxy modification, TLS interception, or remote telemetry is installed.

See WINDOWS_PORTABLE.md for configuration, command options, runtime provenance and limitations.
Project: https://github.com/GloryPkqa/codex-netwatch
'@
$readme | Set-Content -LiteralPath (Join-Path $stage 'START-HERE.txt') -Encoding UTF8
Compress-Archive -LiteralPath $stage -DestinationPath $OutputFile -Force
$zipHash = (Get-FileHash -LiteralPath $OutputFile -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Portable package: $OutputFile"
Write-Host "SHA256: $zipHash"
