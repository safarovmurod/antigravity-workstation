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
if(process.env.WORKSTATION_BOOTSTRAP_TEST_FAIL===process.argv[2]){console.error('Setup incomplete: fixture '+process.argv[2]+' failure');process.exit(7);}
'@)
    $archive = Join-Path $testRoot 'fixture.zip'
    Compress-Archive -LiteralPath $source -DestinationPath $archive
    $git = Join-Path $testRoot 'git.cmd'
    [IO.File]::WriteAllText($git, "@echo off`r`nif `"%1`"==`"--version`" (echo git version 2.50.0) else (echo $sha`trefs/heads/main)`r`n")
    $npm = Join-Path $testRoot 'npm.cmd'
    [IO.File]::WriteAllText($npm, "@echo off`r`necho 10.0.0`r`n")
    $wrapper = Join-Path $testRoot 'wrapper.ps1'
    [IO.File]::WriteAllText($wrapper, @'
param([string]$Bootstrap,[string]$NodePath,[string]$GitPath,[string]$NpmPath,[string]$FixtureArchive,[string]$Log,[string]$Failure,[string]$DownloadRoot)
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
    Copy-Item -LiteralPath $FixtureArchive -Destination $OutFile
}
function Start-Sleep { param([int]$Seconds) }
& $Bootstrap -Name 'povilitel' -DownloadRoot $DownloadRoot
exit $LASTEXITCODE
'@)
    $passed = 0
    foreach ($failure in @('none', 'install', 'doctor', 'download')) {
        $log = Join-Path $testRoot ('calls-' + $passed + '.jsonl')
        $before = @(Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter 'workstation-setup-*' | Select-Object -ExpandProperty FullName)
        $ErrorActionPreference = 'Continue'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wrapper -Bootstrap $bootstrap -NodePath $node -GitPath $git -NpmPath $npm -FixtureArchive $archive -Log $log -Failure $failure -DownloadRoot (Join-Path $testRoot 'Download on test drive') > (Join-Path $testRoot ('output-' + $passed + '.log')) 2>&1
        $status = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        $expected = if ($failure -eq 'install' -or $failure -eq 'doctor') { 7 } elseif ($failure -eq 'download') { 1 } else { 0 }
        if ($status -ne $expected) { Get-Content (Join-Path $testRoot ('output-' + $passed + '.log')); throw "Unexpected bootstrap exit: $failure => $status" }
        $calls = if (Test-Path $log) { @(Get-Content -LiteralPath $log | ForEach-Object { $_ | ConvertFrom-Json }) } else { @() }
        if ($failure -eq 'none' -or $failure -eq 'doctor') {
            if ($calls.Count -ne 2 -or $calls[0].command -ne 'install' -or $calls[1].command -ne 'doctor' -or $calls[0].source -ne $calls[1].source) { Get-Content (Join-Path $testRoot ('output-' + $passed + '.log')); $calls | ConvertTo-Json -Depth 5; throw 'Install and Doctor did not use the same snapshot' }
            if ($calls[0].args -notcontains '--auto-approve') { throw 'Native automation option missing' }
            $namePosition = [Array]::IndexOf($calls[0].args, '--name')
            if ($namePosition -lt 0 -or $calls[0].args[$namePosition + 1] -ne 'povilitel') { throw 'Requested display name was not forwarded to install' }
            if (-not $calls[0].source.StartsWith((Join-Path $testRoot 'Download on test drive')) -or -not (Test-Path -LiteralPath ('\\?\' + $calls[0].source) -PathType Leaf)) { throw 'Downloaded source was not retained in the selected drive directory' }
        } elseif ($failure -eq 'install' -and @($calls).Count -ne 1) { Get-Content (Join-Path $testRoot ('output-' + $passed + '.log')); $calls | ConvertTo-Json -Depth 5; throw 'Doctor ran after failed install' }
        elseif ($failure -eq 'download' -and $calls.Count -ne 0) { throw 'Install ran after failed download' }
        if ($failure -eq 'install' -or $failure -eq 'doctor') {
            $workspace = Split-Path (Split-Path (Split-Path $calls[0].source -Parent) -Parent) -Parent
            $failurePath = Join-Path $workspace 'setup-failure.json'
            if (-not (Test-Path -LiteralPath $failurePath)) { throw 'Failed setup did not retain diagnostic report' }
            $summary = Get-Content -LiteralPath $failurePath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($summary.exitCode -ne 7 -or $summary.stage -ne $failure -or $summary.sourceCommit -ne $sha -or $summary.failure -notmatch ('fixture ' + $failure + ' failure')) { throw 'Failure report lost original failure or source identity' }
            $output = Get-Content -LiteralPath (Join-Path $testRoot ('output-' + $passed + '.log')) -Raw
            if ($output -notmatch ('fixture ' + $failure + ' failure') -or $output -notmatch 'Failure report:') { throw 'Copied terminal ending still hides the original failure and report location' }
        }
        $after = @(Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter 'workstation-setup-*' | Select-Object -ExpandProperty FullName)
        if (@(Compare-Object $before $after).Count -ne 0) { throw 'Bootstrap temporary download was not cleaned' }
        if (@(Get-ChildItem -LiteralPath ('\\?\' + (Join-Path $testRoot 'Download on test drive')) -Recurse -File -Filter setup.zip).Count) { throw 'Downloaded ZIP was not cleaned' }
        $passed++
    }
    Write-Host "PASS: $passed bootstrap runtime scenarios (success, install failure, Doctor failure, download failure)"
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $parent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolved.StartsWith($parent, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -match '^workstation-bootstrap-test-[a-f0-9]{32}$') { Remove-Item -LiteralPath ('\\?\' + $resolved) -Recurse -Force }
}
