param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 64,64
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#a3edc0'))
$pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#142b21')),5
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$graphics.DrawLines($pen, [System.Drawing.Point[]]@((New-Object System.Drawing.Point 16,38),(New-Object System.Drawing.Point 16,26),(New-Object System.Drawing.Point 27,26),(New-Object System.Drawing.Point 27,48)))
$graphics.DrawLines($pen, [System.Drawing.Point[]]@((New-Object System.Drawing.Point 37,16),(New-Object System.Drawing.Point 37,38),(New-Object System.Drawing.Point 48,38),(New-Object System.Drawing.Point 48,26)))
$graphics.DrawLine($pen,27,32,37,32)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create($Destination)
try { $icon.Save($stream) } finally { $stream.Dispose(); $icon.Dispose(); $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
