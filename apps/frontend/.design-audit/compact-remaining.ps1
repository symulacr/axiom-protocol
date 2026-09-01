$path = '\\wsl.localhost\Ubuntu-24.04\home\eya\og\apps\frontend\.design-audit\landing-before-after.html'
$content = Get-Content -Raw $path

# Find any remaining multiline SVGs
$regex = [regex]'(?s)<svg[^>]*>\s*\n.+?</svg>'
$matches = $regex.Matches($content)
Write-Host "Remaining multiline SVGs: $($matches.Count)"
for ($i = 0; $i -lt [Math]::Min(8, $matches.Count); $i++) {
    $block = $matches[$i].Value
    Write-Host "--- Block $($i+1) ---"
    Write-Host ($block.Substring(0, [Math]::Min(250, $block.Length)))
}
