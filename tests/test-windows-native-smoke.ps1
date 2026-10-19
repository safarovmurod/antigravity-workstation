# Actual native IDE smoke; deliberately restricted to a disposable hosted Windows runner.
[CmdletBinding()]
param([string]$ArtifactDirectory = '')
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
$ideRoot = Join-Path $directory 'Antigravity IDE'
$installLog = Join-Path $ArtifactDirectory 'installer.log'
$process = Start-Process -FilePath $installer -WindowStyle Hidden -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', '/NOICONS', '/TASKS=""', ('/DIR="' + $ideRoot + '"'), ('/LOG="' + $installLog + '"')) -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Official installer failed with exit $($process.ExitCode)" }
$main = Join-Path $ideRoot 'resources/app/out/main.js'
if ((Get-FileHash -LiteralPath $main -Algorithm SHA256).Hash.ToLowerInvariant() -cne $build.mainSha256) {
    throw 'Installed native main.js does not match the audited build. The IDE was not launched.'
}
$executable = @('Antigravity IDE.exe', 'Antigravity.exe') | ForEach-Object { Join-Path $ideRoot $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $executable) { throw 'Official installer did not produce an expected Antigravity executable' }
$stage = 'install isolated codec runtime'
$env:WORKSTATION_ANTIGRAVITY_MAIN = $main
$runtime = Join-Path $directory 'protobuf'
& npm.cmd install --prefix $runtime --ignore-scripts --no-audit --no-fund '@bufbuild/protobuf@2.9.0' 2>&1 |
    Tee-Object -FilePath (Join-Path $ArtifactDirectory 'protobuf-install.log')
if ($LASTEXITCODE -ne 0) { throw 'Could not install isolated pinned official protobuf test runtime' }
$env:WORKSTATION_PROTOBUF_RUNTIME = Join-Path $runtime 'node_modules/@bufbuild/protobuf'
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
