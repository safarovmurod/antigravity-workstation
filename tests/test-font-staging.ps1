# Portable checks of the production font staging code, before Windows registry/GDI writes.
# Run with pwsh -NoProfile -File tests/test-font-staging.ps1 (PowerShell 7 required for this test).
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('mansur-font-stage-test-' + [guid]::NewGuid())
$originalLocalAppData = $env:LOCALAPPDATA
try {
    New-Item -ItemType Directory -Path $testRoot | Out-Null
    $sourceRoot = Join-Path $testRoot 'Setup source with spaces'
    $scripts = Join-Path $sourceRoot 'scripts'
    New-Item -ItemType Directory -Path $scripts -Force | Out-Null
    $bundle = Join-Path $sourceRoot 'resources/jetbrains-mono/ttf'
    New-Item -ItemType Directory -Path $bundle -Force | Out-Null
    Copy-Item (Join-Path $repoRoot 'resources/jetbrains-mono/ttf/*.ttf') -Destination $bundle
    $manifestPath = Join-Path $repoRoot 'config/font.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $source = Get-Content -LiteralPath (Join-Path $repoRoot 'scripts/install-font.ps1') -Raw
    $stopAt = $source.IndexOf("    `$stage = 'Load Windows font APIs'")
    if ($stopAt -lt 0) { throw 'Native API boundary not found' }
    $prefix = $source.Substring(0, $stopAt)
    # Only redirect the registry read to an absent synthetic path; all file staging code is real.
    $prefix = $prefix.Replace("`$registryPath = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'",
        "`$registryPath = Join-Path `$env:LOCALAPPDATA 'unused-font-registry'")
    $stagingScript = Join-Path $scripts 'font-staging.ps1'
    Set-Content -LiteralPath $stagingScript -Value ($prefix + @'
} finally {
    if ($archive) { $archive.Dispose() }
    if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
}
'@) -Encoding UTF8
    $env:LOCALAPPDATA = Join-Path $testRoot 'Synthetic user with spaces'
    $installed = Join-Path $env:LOCALAPPDATA 'Microsoft/Windows/Fonts'

    & $stagingScript -ManifestPath $manifestPath
    foreach ($file in $manifest.files) {
        $target = Join-Path $installed $file.name
        if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) {
            throw "Installed file mismatch: $($file.name)"
        }
    }
    Write-Host 'PASS: all 16 bundled fonts staged and installed with correct hashes; no download.'

    # Repeat succeeds even with no available bundle, proving installed files avoid a download.
    $savedBundle = $bundle + '-saved'
    Move-Item -LiteralPath $bundle -Destination $savedBundle
    & $stagingScript -ManifestPath $manifestPath
    Move-Item -LiteralPath $savedBundle -Destination $bundle
    Write-Host 'PASS: repeat uses verified installed files without accessing the bundle/download.'

    $personal = Join-Path $installed $manifest.files[0].name
    [IO.File]::WriteAllText($personal, 'preserve this personal font')
    $rejected = $false
    try { & $stagingScript -ManifestPath $manifestPath } catch {
        if ($_.Exception.Message -notlike '*Existing personal font differs*') { throw }
        $rejected = $true
    }
    if (-not $rejected -or [IO.File]::ReadAllText($personal) -ne 'preserve this personal font') {
        throw 'Personal font conflict was not preserved/rejected'
    }
    Write-Host 'PASS: conflicting personal font preserved; install refused.'

    Remove-Item -LiteralPath $installed -Recurse -Force
    $lastFont = Join-Path $bundle $manifest.files[-1].name
    [IO.File]::WriteAllText($lastFont, 'corrupt bundle')
    $rejected = $false
    try { & $stagingScript -ManifestPath $manifestPath } catch {
        if ($_.Exception.Message -notlike '*Bundled TTF missing or SHA-256 mismatch*') { throw }
        $rejected = $true
    }
    if (-not $rejected -or (Test-Path -LiteralPath $installed)) { throw 'Corrupted bundle was partially installed' }
    Write-Host 'PASS: corrupted bundle rejected before installing any file.'

    Remove-Item -LiteralPath $lastFont
    $rejected = $false
    try { & $stagingScript -ManifestPath $manifestPath } catch {
        if ($_.Exception.Message -notlike '*Bundled TTF missing or SHA-256 mismatch*') { throw }
        $rejected = $true
    }
    if (-not $rejected -or (Test-Path -LiteralPath $installed)) { throw 'Incomplete bundle was partially installed' }
    Write-Host 'PASS: missing bundled font rejected before installing any file.'
} finally {
    $env:LOCALAPPDATA = $originalLocalAppData
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
