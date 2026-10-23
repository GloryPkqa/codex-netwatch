$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputFile = Join-Path (Split-Path -Parent $projectRoot) 'codex-netwatch-source.zip'
# Explicit allowlist: never package user configuration, databases, logs, or .git.
$items = @('src','public','scripts','test','desktop','docs','.github','.gitignore','.gitattributes','.prettierrc.json','.prettierignore','package.json','config.example.json','start.cmd','start-demo.cmd','README.md','README.zh-CN.md','README.en.md','CONTRIBUTING.md','SECURITY.md','LICENSE','CHANGELOG.md')
$stageRoot = Join-Path $projectRoot 'data\package-stage'
$stage = Join-Path $stageRoot 'codex-netwatch'
if (Test-Path -LiteralPath $stageRoot) {
  $resolvedStage = [System.IO.Path]::GetFullPath($stageRoot)
  $expectedParent = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'data')) + [System.IO.Path]::DirectorySeparatorChar
  if (!$resolvedStage.StartsWith($expectedParent,[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stage -Force | Out-Null
foreach ($item in $items) { Copy-Item -LiteralPath (Join-Path $projectRoot $item) -Destination $stage -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $stage 'native') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'native\NetworkCapture.cs') -Destination (Join-Path $stage 'native')
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $outputFile) { Remove-Item -LiteralPath $outputFile -Force }
[IO.Compression.ZipFile]::CreateFromDirectory($stageRoot, $outputFile, [IO.Compression.CompressionLevel]::Optimal, $false)
Write-Host "Source package: $outputFile"
