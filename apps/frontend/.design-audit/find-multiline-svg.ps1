$path = '\\wsl.localhost\Ubuntu-24.04\home\eya\og\apps\frontend\.design-audit\landing-before-after.html'
$content = Get-Content -Raw $path

# Find all multiline SVG patterns
$regex = [regex]'(?s)<svg[^>]*>\s*<[^/][^>]*>\s*</svg>'
$matches = $regex.Matches($content)
Write-Host "Found $($matches.Count) multiline SVG patterns (potentially)"

# Better: find lines starting with SVG and ending with </svg>
$regex2 = [regex]'(?s)<svg[^>]*>\s*[^<]*<[^/][^>]*/?>\s*[^<]*</svg>'
$matches2 = $regex2.Matches($content)
Write-Host "Found $($matches2.Count) more multiline SVG patterns"

# Find SVGs that span multiple lines
$regex3 = [regex]'(?s)<svg[^>]*>\s*\n'
$matches3 = $regex3.Matches($content)
Write-Host "Found $($matches3.Count) SVG opening tags followed by newline"

# Show first few multi-line SVGs
$multi = [regex]::Matches($content, '(?s)<svg[^>]*>\s*\n.+?</svg>')
Write-Host "Found $($multi.Count) multi-line SVG blocks"
for ($i = 0; $i -lt [Math]::Min(15, $multi.Count); $i++) {
    $block = $multi[$i].Value
    $lines = ($block -split "`n").Count
    Write-Host "Block $($i+1): $lines lines"
    Write-Host ($block.Substring(0, [Math]::Min(150, $block.Length)))
    Write-Host "---"
}
