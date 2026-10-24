# Generates SNAPFIX brand raster assets with System.Drawing (Windows).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/generate-assets.ps1
Add-Type -AssemblyName System.Drawing

$OutDir = Join-Path $PSScriptRoot '..\assets\images'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function New-Canvas([int]$Size, [bool]$Transparent = $false) {
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    if (-not $Transparent) {
        $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#0B1220'))
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }
    return @{ Bitmap = $bmp; Graphics = $g }
}

function Draw-Mark($g, [double]$Size, [bool]$Mono = $false) {
    $navy = [System.Drawing.ColorTranslator]::FromHtml('#0B1220')
    $cream = [System.Drawing.ColorTranslator]::FromHtml('#FAF7F2')
    $orange = [System.Drawing.ColorTranslator]::FromHtml('#FF6B35')
    if ($Mono) { $cream = [System.Drawing.Color]::White; $orange = [System.Drawing.Color]::White; $navy = [System.Drawing.Color]::Transparent }

    $cx = $Size / 2
    $cy = $Size / 2
    $unit = $Size / 100

    # Viewfinder corner brackets
    $pen = New-Object System.Drawing.Pen($cream, [Math]::Max(2, $unit * 6))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $m = $unit * 17
    $len = $unit * 18
    $r = 10
    # top-left
    $g.DrawLine($pen, $m, $m + $r, $m, $m + $len)
    $g.DrawLine($pen, $m + $r, $m, $m + $len, $m)
    # top-right
    $g.DrawLine($pen, $Size - $m - $r, $m, $Size - $m - $len, $m)
    $g.DrawLine($pen, $Size - $m, $m + $r, $Size - $m, $m + $len)
    # bottom-left
    $g.DrawLine($pen, $m, $Size - $m - $r, $m, $Size - $m - $len)
    $g.DrawLine($pen, $m + $r, $Size - $m, $m + $len, $Size - $m)
    # bottom-right
    $g.DrawLine($pen, $Size - $m - $r, $Size - $m, $Size - $m - $len, $Size - $m)
    $g.DrawLine($pen, $Size - $m, $Size - $m - $r, $Size - $m, $Size - $m - $len)
    $pen.Dispose()

    # Lens
    $lensSize = $unit * 36
    $lensRect = New-Object System.Drawing.RectangleF(($cx - $lensSize / 2), ($cy - $lensSize / 2), $lensSize, $lensSize)
    $lensBrush = New-Object System.Drawing.SolidBrush($orange)
    $g.FillEllipse($lensBrush, $lensRect)
    $lensBrush.Dispose()
    $inner = $unit * 18
    $innerRect = New-Object System.Drawing.RectangleF(($cx - $inner / 2), ($cy - $inner / 2), $inner, $inner)
    $innerBrush = New-Object System.Drawing.SolidBrush($navy)
    $g.FillEllipse($innerBrush, $innerRect)
    $innerBrush.Dispose()
    $glint = $unit * 4.5
    $glintRect = New-Object System.Drawing.RectangleF(($cx - $unit * 5), ($cy - $unit * 7), $glint, $glint)
    $glintBrush = New-Object System.Drawing.SolidBrush($cream)
    $g.FillEllipse($glintBrush, $glintRect)
    $glintBrush.Dispose()

    # Fix spark (small orange diamond, top right of lens)
    $sparkPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $sx = $cx + $unit * 18
    $sy = $cy - $unit * 18
    $ss = $unit * 5
    $sparkPath.AddPolygon([System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new($sx, ($sy - $ss)),
        [System.Drawing.PointF]::new(($sx + $ss), $sy),
        [System.Drawing.PointF]::new($sx, ($sy + $ss)),
        [System.Drawing.PointF]::new(($sx - $ss), $sy)
    ))
    $sparkBrush = New-Object System.Drawing.SolidBrush($orange)
    $g.FillPath($sparkBrush, $sparkPath)
    $sparkBrush.Dispose()
    $sparkPath.Dispose()
}

function Save-Png($bitmap, [string]$Name) {
    $path = Join-Path $OutDir $Name
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "wrote $path"
}

# App icon 1024
$c = New-Canvas 1024 $false
Draw-Mark $c.Graphics 1024 $false
Save-Png $c.Bitmap 'icon.png'
$c.Graphics.Dispose(); $c.Bitmap.Dispose()

# Splash icon 512 transparent
$c = New-Canvas 512 $true
Draw-Mark $c.Graphics 512 $false
Save-Png $c.Bitmap 'splash-icon.png'
$c.Graphics.Dispose(); $c.Bitmap.Dispose()

# Android adaptive foreground 1024 transparent (safe zone)
$c = New-Canvas 1024 $true
$g = $c.Graphics
$g.TranslateTransform(204, 204)
Draw-Mark $g 616 $false
$g.ResetTransform()
Save-Png $c.Bitmap 'android-icon-foreground.png'
$c.Graphics.Dispose(); $c.Bitmap.Dispose()

# Android background 1024
$c = New-Canvas 1024 $false
Save-Png $c.Bitmap 'android-icon-background.png'
$c.Graphics.Dispose(); $c.Bitmap.Dispose()

# Monochrome 1024 transparent
$c = New-Canvas 1024 $true
Draw-Mark $c.Graphics 1024 $true
Save-Png $c.Bitmap 'android-icon-monochrome.png'
$c.Graphics.Dispose(); $c.Bitmap.Dispose()

# Favicon 64
$c = New-Canvas 64 $true
Draw-Mark $c.Graphics 64 $false
Save-Png $c.Bitmap 'favicon.png'
$c.Graphics.Dispose(); $c.Bitmap.Dispose()

# Notification icon 96 white on transparent
$c = New-Canvas 96 $true
Draw-Mark $c.Graphics 96 $true
Save-Png $c.Bitmap 'notification-icon.png'
$c.Graphics.Dispose(); $c.Bitmap.Dispose()

Remove-Item (Join-Path $OutDir 'expo-badge.png'), (Join-Path $OutDir 'expo-badge-white.png'), (Join-Path $OutDir 'expo-logo.png'), (Join-Path $OutDir 'logo-glow.png'), (Join-Path $OutDir 'react-logo.png'), (Join-Path $OutDir 'react-logo@2x.png'), (Join-Path $OutDir 'react-logo@3x.png'), (Join-Path $OutDir 'tutorial-web.png') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $OutDir 'tabIcons') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $PSScriptRoot '..\assets\expo.icon') -Recurse -Force -ErrorAction SilentlyContinue
