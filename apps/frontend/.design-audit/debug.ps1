$path = '\\wsl.localhost\Ubuntu-24.04\home\eya\og\apps\frontend\.design-audit\landing-before-after.html'
$content = Get-Content -Raw $path

# Find the first hamburger SVG
$pattern = 'hamburger|<svg width="18"|<line x1="4"'
$matches = [regex]::Matches($content, '<svg width="18"[^>]*>\s*<line')
Write-Host "Found $($matches.Count) hamburger SVG patterns"

if ($matches.Count -gt 0) {
    $first = $matches[0].Value
    Write-Host "First match (first 200 chars):"
    Write-Host ($first.Substring(0, [Math]::Min(200, $first.Length)))
    Write-Host "---"
    # Show raw bytes around it
    $idx = $content.IndexOf($first)
    Write-Host "Bytes around match:"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content.Substring($idx, [Math]::Min(150, $content.Length - $idx)))
    for ($i = 0; $i -lt [Math]::Min(50, $bytes.Length); $i++) {
        Write-Host ("{0:X2} " -f $bytes[$i]) -NoNewline
    }
}
