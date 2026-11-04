[CmdletBinding()]
param([string]$ArtifactDirectory = '')
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted') {
    throw 'Documentation capture must run only on a disposable GitHub-hosted Windows runner, never on a personal computer.'
}
if (-not $ArtifactDirectory) { $ArtifactDirectory = Join-Path $env:RUNNER_TEMP 'workstation-docs-screenshots' }
$directory = Join-Path $env:RUNNER_TEMP ('workstation-docs-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory, $ArtifactDirectory -Force | Out-Null
$catalog = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../../config/native-compatibility.json') -Raw | ConvertFrom-Json
$build = @($catalog.builds | Where-Object { $_.ideVersion -eq '2.5.5' -and $_.architecture -eq 'x64' -and $_.platform -eq 'win32' })
if ($build.Count -ne 1) { throw 'Expected exactly one audited official x64 IDE build' }
$build = $build[0]
$installer = Join-Path $directory 'Antigravity-IDE.exe'
for ($attempt = 1; $attempt -le 3; $attempt++) {
    try { Invoke-WebRequest -Uri $build.source.installerUrl -OutFile $installer -TimeoutSec 180; break }
    catch { if ($attempt -eq 3) { throw }; Start-Sleep -Seconds (2 * $attempt) }
}
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -cne $build.source.installerSha256) {
    throw 'Official installer checksum mismatch; the executable was not run'
}
$ideRoot = Join-Path $directory 'Antigravity IDE'
$installLog = Join-Path $ArtifactDirectory 'installer.log'
$process = Start-Process -FilePath $installer -WindowStyle Hidden -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', '/NOICONS', '/TASKS=""', ('/DIR="' + $ideRoot + '"'), ('/LOG="' + $installLog + '"')) -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Official installer failed with exit $($process.ExitCode)" }
$main = Join-Path $ideRoot 'resources/app/out/main.js'
if ((Get-FileHash -LiteralPath $main -Algorithm SHA256).Hash.ToLowerInvariant() -cne $build.mainSha256) {
    throw 'Installed main.js differs from the audited official build'
}
$executable = @('Antigravity IDE.exe', 'Antigravity.exe') | ForEach-Object { Join-Path $ideRoot $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $executable) { throw 'Official IDE executable was not found' }
& node (Join-Path $PSScriptRoot 'controller.cjs') $ideRoot $executable $directory $ArtifactDirectory 2>&1 | Tee-Object -FilePath (Join-Path $ArtifactDirectory 'controller.log')
if ($LASTEXITCODE -ne 0) { throw 'Real IDE screenshot capture failed; inspect the artifacts' }
Get-Content -LiteralPath (Join-Path $ArtifactDirectory 'result.json') -Raw
