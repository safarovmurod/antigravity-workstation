# Windows PowerShell 5.1: real archive/extraction/Node, mocked network and prerequisites.
param()
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Write-Host 'SKIP: bootstrap runtime checks require Windows'; exit 0 }
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('workstation-bootstrap-test-' + [guid]::NewGuid().ToString('N'))
$bootstrap = Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts/bootstrap.ps1'
$package = Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$node = (Get-Command node.exe -ErrorAction Stop).Source
$sha = '0123456789012345678901234567890123456789'
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $source = Join-Path $testRoot ('antigravity-workstation-' + $sha)
    New-Item -ItemType Directory -Path (Join-Path $source 'bin') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $source 'package.json'), ('{"name":"antigravity-workstation-setup","version":"' + $package.version + '"}'))
    [IO.File]::WriteAllText((Join-Path $source 'bin/workstation-setup.js'), @'
const fs = require('fs');
fs.appendFileSync(process.env.WORKSTATION_BOOTSTRAP_TEST_LOG, JSON.stringify({command:process.argv[2],args:process.argv.slice(3),source:process.argv[1]})+'\n');
if(process.env.WORKSTATION_BOOTSTRAP_TEST_FAIL===process.argv[2]){console.error('Setup incomplete: fixture '+process.argv[2]+' failure: \u041e\u0448\u0438\u0431\u043a\u0430: \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u2717');process.exit(7);}
'@)
    $archive = Join-Path $testRoot 'fixture.zip'
    Compress-Archive -LiteralPath $source -DestinationPath $archive
    $git = Join-Path $testRoot 'git.cmd'
    [IO.File]::WriteAllText($git, "@echo off`r`nif `"%1`"==`"--version`" (echo git version 2.50.0) else (echo $sha`trefs/heads/main)`r`n")
    $npm = Join-Path $testRoot 'npm.cmd'
    [IO.File]::WriteAllText($npm, "@echo off`r`necho 10.0.0`r`n")
    $wrapper = Join-Path $testRoot 'wrapper.ps1'
    [IO.File]::WriteAllText($wrapper, @'
param([string]$Bootstrap,[string]$NodePath,[string]$GitPath,[string]$NpmPath,[string]$FixtureArchive,[string]$Log,[string]$Failure,[string]$DownloadRoot,[string]$Mode)
$env:WORKSTATION_BOOTSTRAP_TEST_LOG=$Log
$env:WORKSTATION_BOOTSTRAP_TEST_FAIL=$Failure
function Get-Command {
    param([string]$Name,[object]$ErrorAction)
    if($Name -eq 'node.exe'){return [pscustomobject]@{Source=$NodePath}}
    if($Name -eq 'git.exe'){return [pscustomobject]@{Source=$GitPath}}
    if($Name -eq 'npm.cmd'){return [pscustomobject]@{Source=$NpmPath}}
    if($Name -eq 'curl.exe'){return $null}
    if($Name -eq 'winget.exe'){throw 'Test must not install prerequisites'}
    return Microsoft.PowerShell.Core\Get-Command $Name -ErrorAction SilentlyContinue
}
function Invoke-WebRequest {
    param([switch]$UseBasicParsing,[string]$Uri,[string]$OutFile,[int]$TimeoutSec,[object]$ErrorAction)
    if($TimeoutSec -ne 600){throw 'Explicit archive timeout missing'}
    if($Failure -eq 'download'){throw 'simulated download failure'}
    if($Uri -notmatch '/zip/0123456789012345678901234567890123456789$'){throw 'Download must pin the resolved commit'}
    [IO.File]::AppendAllText(($Log + '.downloads'), $Uri + [Environment]::NewLine)
    Copy-Item -LiteralPath $FixtureArchive -Destination $OutFile
}
function Start-Sleep { param([int]$Seconds) }
[Console]::OutputEncoding=[Text.Encoding]::GetEncoding(437)
& $Bootstrap -Name 'povilitel' -DownloadRoot $DownloadRoot -CleanExtensions:($Mode -eq 'clean') -QuietCompletion:($Mode -eq 'quiet')
exit $LASTEXITCODE
'@)
    $passed = 0
    $sharedSource = $null
    $sharedDownloadRoot = Join-Path $testRoot (('Download-long-' + ('a' * 75)) + '/' + ('b' * 75))
    foreach ($scenario in @(
        @{failure='none';mode='normal'}, @{failure='none';mode='clean'}, @{failure='none';mode='quiet'},
        @{failure='install';mode='normal'}, @{failure='doctor';mode='normal'}, @{failure='download';mode='normal'}
    )) {
        $failure = $scenario.failure; $mode = $scenario.mode
        $downloadRoot = if ($failure -eq 'none') { $sharedDownloadRoot } else { Join-Path $testRoot ('Download failure ' + $failure) }
        $log = Join-Path $testRoot ('calls-' + $passed + '.jsonl')
        $before = @(Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter 'workstation-setup-*' | Select-Object -ExpandProperty FullName)
        $ErrorActionPreference = 'Continue'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wrapper -Bootstrap $bootstrap -NodePath $node -GitPath $git -NpmPath $npm -FixtureArchive $archive -Log $log -Failure $failure -DownloadRoot $downloadRoot -Mode $mode > (Join-Path $testRoot ('output-' + $passed + '.log')) 2>&1
        $status = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        $expected = if ($failure -eq 'install' -or $failure -eq 'doctor') { 7 } elseif ($failure -eq 'download') { 1 } else { 0 }
        if ($status -ne $expected) { Get-Content (Join-Path $testRoot ('output-' + $passed + '.log')); throw "Unexpected bootstrap exit: $failure => $status" }
        $calls = if (Test-Path $log) { @(Get-Content -LiteralPath $log | ForEach-Object { $_ | ConvertFrom-Json }) } else { @() }
        $output = Get-Content -LiteralPath (Join-Path $testRoot ('output-' + $passed + '.log')) -Raw
        if ($failure -eq 'none' -and $mode -eq 'quiet') {
            if ($calls.Count -ne 1 -or $calls[0].command -ne 'quiet-completion') { throw 'Quiet command installed full profile or ran Doctor' }
        } elseif ($failure -eq 'none' -or $failure -eq 'doctor') {
            if ($calls.Count -ne 2 -or $calls[0].command -ne 'install' -or $calls[1].command -ne 'doctor' -or $calls[0].source -ne $calls[1].source) { Get-Content (Join-Path $testRoot ('output-' + $passed + '.log')); $calls | ConvertTo-Json -Depth 5; throw 'Install and Doctor did not use the same snapshot' }
            if ($calls[0].args -notcontains '--auto-approve') { throw 'Native automation option missing' }
            $namePosition = [Array]::IndexOf($calls[0].args, '--name')
            if ($namePosition -lt 0 -or $calls[0].args[$namePosition + 1] -ne 'povilitel') { throw 'Requested display name was not forwarded to install' }
            if (-not $calls[0].source.StartsWith($downloadRoot) -or -not (Test-Path -LiteralPath ('\\?\' + $calls[0].source) -PathType Leaf)) { throw 'Downloaded source was not retained in the selected drive directory' }
        } elseif ($failure -eq 'install' -and @($calls).Count -ne 1) { Get-Content (Join-Path $testRoot ('output-' + $passed + '.log')); $calls | ConvertTo-Json -Depth 5; throw 'Doctor ran after failed install' }
        elseif ($failure -eq 'download' -and $calls.Count -ne 0) { throw 'Install ran after failed download' }
        if ($failure -eq 'install' -or $failure -eq 'doctor') {
            if ($output -notmatch 'Setup diagnostics: ([^\r\n]+)') { throw 'Diagnostic directory missing from terminal output' }
            $failurePath = Join-Path $Matches[1].Trim() 'setup-failure.json'
            if (-not (Test-Path -LiteralPath $failurePath)) { throw 'Failed setup did not retain diagnostic report' }
            $summary = Get-Content -LiteralPath $failurePath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($summary.exitCode -ne 7 -or $summary.stage -ne $failure -or $summary.sourceCommit -ne $sha -or $summary.failure -notmatch ('fixture ' + $failure + ' failure')) { throw 'Failure report lost original failure or source identity' }
            $expectedUnicode = '"\u041e\u0448\u0438\u0431\u043a\u0430: \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u2717"' | ConvertFrom-Json
            $nativeOutput = Get-Content -LiteralPath $summary.outputLog -Raw -Encoding UTF8
            if (-not $summary.failure.Contains($expectedUnicode) -or -not $nativeOutput.Contains($expectedUnicode)) { throw 'OEM console encoding corrupted the retained native failure report' }
            $output = Get-Content -LiteralPath (Join-Path $testRoot ('output-' + $passed + '.log')) -Raw
            if ($output -notmatch ('fixture ' + $failure + ' failure') -or $output -notmatch 'Failure report:') { throw 'Copied terminal ending still hides the original failure and report location' }
        }
        if ($failure -eq 'none') {
            if ($mode -eq 'normal') {
                $sharedSource = $calls[0].source
                if ($sharedSource.Length -le 260) { throw 'Windows end-to-end source path did not exceed MAX_PATH' }
                if (@(Get-Content -LiteralPath ($log + '.downloads')).Count -ne 1) { throw 'First invocation did not download one source archive' }
            } else {
                if ($calls[0].source -ne $sharedSource -or (Test-Path -LiteralPath ($log + '.downloads')) -or $output -notmatch 'no source download or extraction needed') { throw 'Clean/quiet invocation downloaded duplicate source instead of reusing verified cache' }
                if (($mode -eq 'clean') -and $calls[0].args -notcontains '--clean-extensions') { throw 'Clean switch was not forwarded' }
            }
        }
        $after = @(Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter 'workstation-setup-*' | Select-Object -ExpandProperty FullName)
        if (@(Compare-Object $before $after).Count -ne 0) { throw 'Bootstrap temporary download was not cleaned' }
        # WinPS's recursive provider loses extended path prefixes. Use the same
        # real Node filesystem API that must handle this >260-character cache.
        $zipCheck = 'const fs=require("node:fs"),path=require("node:path");function walk(root){for(const entry of fs.readdirSync(root,{withFileTypes:true})){const full=path.join(root,entry.name);if(entry.isSymbolicLink())throw new Error("Unexpected test link");if(entry.isDirectory())walk(full);else if(entry.name==="setup.zip")throw new Error("Downloaded ZIP was not cleaned");}}walk(process.argv[1]);'
        & $node -e $zipCheck $downloadRoot
        if ($LASTEXITCODE -ne 0) { throw 'Long-path downloaded ZIP cleanup failed' }
        $passed++
    }
    Write-Host "PASS: $passed bootstrap runtime scenarios (normal/clean/quiet cache reuse, install failure, Doctor failure, download failure)"
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $parent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolved.StartsWith($parent, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -match '^workstation-bootstrap-test-[a-f0-9]{32}$') {
        $cleanup = 'const fs=require("node:fs"),path=require("node:path");const target=path.resolve(process.argv[1]);if(!/^workstation-bootstrap-test-[a-f0-9]{32}$/.test(path.basename(target)))throw new Error("Unsafe test cleanup");fs.rmSync(target,{recursive:true,force:true,maxRetries:3,retryDelay:100});'
        & $node -e $cleanup $resolved
        if ($LASTEXITCODE -ne 0) { throw 'Could not clean bootstrap runtime test directory' }
    }
}
