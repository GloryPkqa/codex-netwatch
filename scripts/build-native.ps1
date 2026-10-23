param([string]$Destination)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if(!$Destination){$Destination=Join-Path $projectRoot 'native\Codex-Netwatch-Capture.exe'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /optimize+ /target:exe /platform:x64 /codepage:65001 /reference:System.dll /reference:System.Core.dll /reference:System.Web.Extensions.dll ("/out:"+$Destination) (Join-Path $projectRoot 'native\NetworkCapture.cs')
if($LASTEXITCODE -ne 0){throw 'Native capture helper compilation failed'}
& $Destination --self-test
if($LASTEXITCODE -ne 0){throw 'Native capture helper self-test failed'}
