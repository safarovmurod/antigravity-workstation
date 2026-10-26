
[CmdletBinding()]
param([string]$ArtifactDirectory = '', [switch]$AppearanceOnly, [switch]$GuideOnly)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted') {
    throw 'Run this actual IDE test only on an isolated GitHub-hosted Windows runner. It must not launch windows on your laptop.'
}
if (-not $ArtifactDirectory) { $ArtifactDirectory = Join-Path $env:RUNNER_TEMP 'workstation-native-smoke-artifacts' }
$directory = Join-Path $env:RUNNER_TEMP ('workstation-native-smoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory, $ArtifactDirectory -Force | Out-Null
$architecture = (& node -p 'process.arch').Trim()
$catalog = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../config/native-compatibility.json') -Raw | ConvertFrom-Json
$build = @($catalog.builds | Where-Object { $_.ideVersion -eq '2.5.5' -and $_.architecture -eq $architecture -and $_.platform -eq 'win32' })
if ($build.Count -ne 1) { throw "Missing audited native build for $architecture" }
$build = $build[0]
$installer = Join-Path $directory ('Antigravity-IDE-2.5.5-' + $architecture + '.exe')
$url = $build.source.installerUrl
$expectedInstaller = $build.source.installerSha256
$stage = 'download verified official installer'
$started = [DateTime]::UtcNow.ToString('o')
@{ state = 'running'; startedAt = $started; runner = 'github-hosted Windows'; installerSha256 = $expectedInstaller } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ArtifactDirectory 'run.json') -Encoding UTF8
try {
for ($attempt = 1; $attempt -le 3; $attempt++) {
    try { Invoke-WebRequest -Uri $url -OutFile $installer -TimeoutSec 180; break }
    catch { if ($attempt -eq 3) { throw }; Start-Sleep -Seconds (2 * $attempt) }
}
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedInstaller) {
    throw 'Official installer checksum mismatch. The downloaded executable was not run.'
}
$stage = 'install official IDE'


$ideBase = if ($architecture -eq 'x64') { Join-Path ($env:SystemDrive + '\') ('workstation-ci-' + [guid]::NewGuid().ToString('N')) }
    elseif (Test-Path -LiteralPath 'D:\' -PathType Container) { Join-Path 'D:\' ('workstation-ci-' + [guid]::NewGuid().ToString('N')) }
    else { $directory }
$ideRoot = Join-Path $ideBase 'Apps with spaces\Муҳит (current)\My editor'
$installLog = Join-Path $ArtifactDirectory 'installer.log'
$process = Start-Process -FilePath $installer -WindowStyle Hidden -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', '/NOICONS', '/TASKS=""', ('/DIR="' + $ideRoot + '"'), ('/LOG="' + $installLog + '"')) -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Official installer failed with exit $($process.ExitCode)" }
$main = Join-Path $ideRoot 'resources/app/out/main.js'
if ((Get-FileHash -LiteralPath $main -Algorithm SHA256).Hash.ToLowerInvariant() -cne $build.mainSha256) {
    throw 'Installed native main.js does not match the audited build. The IDE was not launched.'
}
$executable = @('Antigravity IDE.exe', 'Antigravity.exe') | ForEach-Object { Join-Path $ideRoot $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $executable) { throw 'Official installer did not produce an expected Antigravity executable' }
if ($GuideOnly) {
    $env:WORKSTATION_VSCODE_PATH = $executable
    $env:WORKSTATION_GUIDE_ARTIFACTS = $ArtifactDirectory
    & node (Join-Path $PSScriptRoot 'guide-player-editor.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Actual installed guide playback failed; inspect renderer evidence and host logs' }
    return
}
if ($AppearanceOnly) {
    $env:WORKSTATION_VSCODE_PATH = $executable
    $env:ASTER_ARTIFACT_DIRECTORY = $ArtifactDirectory
    & node (Join-Path $PSScriptRoot 'aster-editor.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Actual Antigravity appearance test failed; inspect the renderer report and log' }
    return
}
$stage = 'discover the actual registered IDE in its arbitrary installation folder'
$discoveryReport = Join-Path $ArtifactDirectory 'installation-paths.json'
$discoveryPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & node (Join-Path $PSScriptRoot 'windows-native-smoke/verify-installation-paths.cjs') $ideRoot $discoveryReport 2>&1 |
        Tee-Object -FilePath (Join-Path $ArtifactDirectory 'installation-paths.log')
    $discoveryExitCode = $LASTEXITCODE
} finally { $ErrorActionPreference = $discoveryPreference }
if ($discoveryExitCode -ne 0) {
    $detail = if (Test-Path -LiteralPath $discoveryReport) { Get-Content -LiteralPath $discoveryReport -Raw | ConvertFrom-Json } else { $null }
    $reason = if ($detail.error) { $detail.error } else { 'The discovery process exited without a report; inspect installation-paths.log' }
    $probeFailures = @($detail.probes | Where-Object { -not $_.succeeded } | ForEach-Object { $_.probe + ': ' + $_.code + ' ' + $_.status + ' ' + $_.signal }) -join '; '
    throw ('Production IDE/path discovery failed: ' + $reason + '. Detected: ' + $detail.detected.ideRoot + '. Expected: ' + $ideRoot + '. Failed probes: ' + $probeFailures)
}
$stage = 'install isolated codec runtime'
$env:WORKSTATION_ANTIGRAVITY_MAIN = $main
$runtime = Join-Path $directory 'protobuf'
& npm.cmd install --prefix $runtime --ignore-scripts --no-audit --no-fund '@bufbuild/protobuf@2.9.0' 2>&1 |
    Tee-Object -FilePath (Join-Path $ArtifactDirectory 'protobuf-install.log')
if ($LASTEXITCODE -ne 0) { throw 'Could not install isolated pinned official protobuf test runtime' }
$env:WORKSTATION_PROTOBUF_RUNTIME = Join-Path $runtime 'node_modules/@bufbuild/protobuf'
$stage = 'four linked-path and detached-recovery regressions with zero skips'
& node (Join-Path $PSScriptRoot 'run-recovery-guards.cjs') $ArtifactDirectory 2>&1 |
    Tee-Object -FilePath (Join-Path $ArtifactDirectory 'recovery-guards.log')
if ($LASTEXITCODE -ne 0) { throw 'The four recovery/link regression cases must all execute and pass; inspect recovery-guards.xml' }
$stage = 'official codec, compatibility, preflight, rollback and recovery checks'
$testReport = Join-Path $ArtifactDirectory 'native-tests.xml'
& node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit "--test-reporter-destination=$testReport" (Join-Path $PSScriptRoot 'test-agent-automation-native.mjs') (Join-Path $PSScriptRoot 'test-native-compatibility.mjs') (Join-Path $PSScriptRoot 'test-installer-preflight.mjs') (Join-Path $PSScriptRoot 'test-rollback.mjs') (Join-Path $PSScriptRoot 'test-setup-status.mjs') 2>&1 |
    Tee-Object -FilePath (Join-Path $ArtifactDirectory 'native-codec-preflight.log')
if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $testReport) {
        [xml]$junit = Get-Content -LiteralPath $testReport -Raw
        $failedTests = @($junit.SelectNodes('//failure') | ForEach-Object {
            @{ test = $_.ParentNode.name; detail = $_.InnerText.Substring(0, [Math]::Min(6000, $_.InnerText.Length)) }
        })
        foreach ($failedTest in $failedTests) {
            $annotation = ($failedTest.test + ': ' + $failedTest.detail).Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
            Write-Host ('::error title=Native Windows test failed::' + $annotation)
        }
    }
    throw 'Official codec, compatibility or production preflight checks failed'
}
$stage = 'actual IDE open, queue, normal close, apply and reopen'
& node (Join-Path $PSScriptRoot 'windows-native-smoke/controller.cjs') $ideRoot $executable $directory $ArtifactDirectory 2>&1 |
    Tee-Object -FilePath (Join-Path $ArtifactDirectory 'controller.log')
if ($LASTEXITCODE -ne 0) { throw 'Actual Windows/native IDE smoke failed; inspect uploaded logs' }
Get-Content -LiteralPath (Join-Path $ArtifactDirectory 'result.json') -Raw
$stage = 'register every mandatory extension through the actual official IDE CLI'
& node (Join-Path $PSScriptRoot 'windows-native-smoke/full-catalog.cjs') $ideRoot $executable $directory $ArtifactDirectory 2>&1 |
    Tee-Object -FilePath (Join-Path $ArtifactDirectory 'full-catalog.log')
if ($LASTEXITCODE -ne 0) { throw 'Full-catalog actual CLI registration failed; inspect full-catalog-result.json and full-catalog.log' }
Get-Content -LiteralPath (Join-Path $ArtifactDirectory 'full-catalog-result.json') -Raw
$stage = 'old Error Lens, automatic managed update, normal restart and installed-version verification'
& node (Join-Path $PSScriptRoot 'windows-native-smoke/gallery-update-roundtrip.cjs') $ideRoot $executable $directory $ArtifactDirectory 2>&1 |
    Tee-Object -FilePath (Join-Path $ArtifactDirectory 'gallery-update-roundtrip.log')
if ($LASTEXITCODE -ne 0) { throw 'Actual installed background gallery updater failed; inspect gallery-update-roundtrip.log' }
Get-Content -LiteralPath (Join-Path $ArtifactDirectory 'gallery-update-roundtrip.json') -Raw
$chatProbe = Join-Path $ArtifactDirectory 'gallery-native-chat-command-probe.json'
if (Test-Path -LiteralPath $chatProbe) { Get-Content -LiteralPath $chatProbe -Raw }
$chatCapabilities = Join-Path $ArtifactDirectory 'gallery-initial-chat-capabilities.json'
if (Test-Path -LiteralPath $chatCapabilities) { Get-Content -LiteralPath $chatCapabilities -Raw }
} catch {
    $failure = @{ passed = $false; stage = $stage; startedAt = $started; completedAt = [DateTime]::UtcNow.ToString('o'); error = $_.Exception.Message }
    if ($failedTests) { $failure.tests = $failedTests }
    foreach ($name in @('runtime-failure.json', 'failure.json')) {
        $detailFile = Join-Path $ArtifactDirectory $name
        if (Test-Path -LiteralPath $detailFile) {
            $failure.runtime = Get-Content -LiteralPath $detailFile -Raw | ConvertFrom-Json
            break
        }
    }
    $failure | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $ArtifactDirectory 'orchestration-failure.json') -Encoding UTF8
    $result = Join-Path $ArtifactDirectory 'result.json'
    if (-not (Test-Path -LiteralPath $result)) { $failure | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $result -Encoding UTF8 }
    $specific = if ($failure.runtime.error) { ($failure.runtime.error -split "`r?`n")[0] } else { $failure.error }
    $safeAnnotation = ($stage + ': ' + $specific).Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
    Write-Host ('::error title=Native Windows smoke failed::' + $safeAnnotation)
    if ($env:GITHUB_STEP_SUMMARY) {
        @('## Native Windows smoke failure', '', 'The following diagnostics come only from this disposable test profile. Token-shaped values in IDE log tails are redacted.', '', '```json', ($failure | ConvertTo-Json -Depth 8), '```') |
            Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Encoding UTF8
    }
    throw
}
