$path = '\\wsl.localhost\Ubuntu-24.04\home\eya\og\apps\frontend\.design-audit\landing-before-after.html'
$content = Get-Content -Raw $path

# Generic: compact ANY multiline SVG that has children
# Pattern: <svg ... >\n  <tag .../>\n</svg>  OR  <svg ... >\n  <tag>...</tag>\n</svg>
$regex = [regex]'(?s)(<svg[^>]*>)\s*\n\s*(<[^/].*?>)\s*\n\s*(</svg>)'

$matches = $regex.Matches($content)
Write-Host "Found $($matches.Count) simple 2-child multiline SVGs"

$total = 0
foreach ($m in $matches) {
    $open = $m.Groups[1].Value
    $child = $m.Groups[2].Value
    $close = $m.Groups[3].Value

    # Remove newlines and excess whitespace from child
    $childCompact = [regex]::Replace($child, '\s+', ' ').Trim()

    # Build new compact form
    $new = $open + $childCompact + $close
    $old = $m.Value

    $content = $content.Replace($old, $new)
    $total++
}

Write-Host "Replaced $total simple multiline SVGs"

# Now handle 3+ child multiline SVGs (multi-line content within svg)
$regex2 = [regex]'(?s)(<svg[^>]*>)\s*\n((?:\s*<[^>]+/?>\s*\n)+)\s*(</svg>)'
$matches2 = $regex2.Matches($content)
Write-Host "Found $($matches2.Count) multi-child multiline SVGs"

foreach ($m in $matches2) {
    $open = $m.Groups[1].Value
    $children = $m.Groups[2].Value
    $close = $m.Groups[3].Value

    # Compact all child lines
    $childLines = ($children -split "`n") | Where-Object { $_ -match '\S' }
    $compactChildren = ($childLines | ForEach-Object { [regex]::Replace($_, '\s+', ' ').Trim() }) -join ""

    $new = $open + $compactChildren + $close
    $old = $m.Value

    $content = $content.Replace($old, $new)
    $total++
}

Write-Host "Total replacements: $total"

Set-Content -Path $path -Value $content -NoNewline
Write-Host ('New line count: ' + (Get-Content $path | Measure-Object -Line).Lines)
