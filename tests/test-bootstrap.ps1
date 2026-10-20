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
$currentOutputFile = $null
$currentLog = $null
$currentScenario = 'fixture setup'
function Write-BootstrapTestError {
    param([string]$Message)
    # Only this test's synthetic fixture output is emitted. Keep the original
    # error visible in public CI annotations when full logs require sign-in.
    $escaped = $Message.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
    Write-Host ('::error::' + $escaped)
}
try {
    $source = Join-Path $testRoot ('antigravity-workstation-' + $sha)
    New-Item -ItemType Directory -Path (Join-Path $source 'bin') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $source 'package.json'), ('{"name":"antigravity-workstation-setup","version":"' + $package.version + '"}'))
    [IO.File]::WriteAllText((Join-Path $source 'bin/workstation-setup.js'), @'
const fs = require('fs');
fs.appendFileSync(process.env.WORKSTATION_BOOTSTRAP_TEST_LOG, JSON.stringify({command:process.argv[2],args:process.argv.slice(3),source:process.argv[1]})+'\n');
if(process.env.WORKSTATION_BOOTSTRAP_TEST_FAIL===process.argv[2]){console.error((process.argv[2]==='quiet-completion'?'Quiet completion incomplete:':'Setup incomplete:')+' fixture '+process.argv[2]+' failure: \u041e\u0448\u0438\u0431\u043a\u0430: \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u2717');process.exit(7);}
'@)
    New-Item -ItemType Directory -Path (Join-Path $source 'scripts') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $source 'scripts/queue-repair-chat.cjs'), @'
const fs=require('node:fs'),path=require('node:path');
if(process.argv[2]==='--doctor-passed'){console.log(JSON.stringify({state:'idle'}));process.exit(0);}
if(!['handoff','quiet'].includes(process.env.WORKSTATION_BOOTSTRAP_TEST_MODE))process.exit(1);
const report=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
if(report.exitCode!==7||report.stage!=='install')throw new Error('Original failure report lost');
const cache=path.dirname(path.dirname(path.dirname(process.argv[3])));
const lock=path.join(path.dirname(cache),'.workstation-cache.lock');
const fd=fs.openSync(lock,'r+');fs.closeSync(fd); // WinPS FileShare.None must already be released.
const requestFile=process.env.WORKSTATION_BOOTSTRAP_TEST_LOG+'.repair';
fs.writeFileSync(requestFile,JSON.stringify({report,lockReleased:true}));
console.log(JSON.stringify({queued:true,requestFile,prompt:'English fixture repair task for '+(process.argv[4]||'full')}));
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
$env:WORKSTATION_BOOTSTRAP_TEST_MODE=$Mode
$env:LOCALAPPDATA=Join-Path $DownloadRoot 'fixture-local-app-data'
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
function Set-Clipboard { param([string]$Value,[object]$ErrorAction) throw 'Fixture clipboard unavailable' }
function Get-Clipboard { param([switch]$Raw,[object]$ErrorAction) throw 'Fixture clipboard unavailable' }
[Console]::OutputEncoding=[Text.Encoding]::GetEncoding(437)
& $Bootstrap -Name 'povilitel' -DownloadRoot $DownloadRoot -CleanExtensions:($Mode -eq 'clean') -QuietCompletion:($Mode -eq 'quiet')
exit $LASTEXITCODE
'@)
    $passed = 0
    $sharedSource = $null
    $sharedDownloadRoot = Join-Path $testRoot (('Download-long-' + ('a' * 75)) + '/' + ('b' * 75))
    foreach ($scenario in @(
        @{failure='none';mode='normal'}, @{failure='none';mode='clean'}, @{failure='none';mode='quiet'},
        @{failure='install';mode='normal'}, @{failure='install';mode='handoff'}, @{failure='quiet-completion';mode='quiet'}, @{failure='doctor';mode='normal'}, @{failure='download';mode='normal'}
    )) {
        $failure = $scenario.failure; $mode = $scenario.mode
        $currentScenario = $failure + '/' + $mode
        $downloadRoot = if ($failure -eq 'none') { $sharedDownloadRoot } else { Join-Path $testRoot ('Download failure ' + $failure) }
        $log = Join-Path $testRoot ('calls-' + $passed + '.jsonl')
        $currentLog = $log
        $currentOutputFile = Join-Path $testRoot ('output-' + $passed + '.log')
        $before = @(Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter 'workstation-setup-*' | Select-Object -ExpandProperty FullName)
        $ErrorActionPreference = 'Continue'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wrapper -Bootstrap $bootstrap -NodePath $node -GitPath $git -NpmPath $npm -FixtureArchive $archive -Log $log -Failure $failure -DownloadRoot $downloadRoot -Mode $mode > $currentOutputFile 2>&1
        $status = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        $expected = if ($mode -eq 'handoff' -or $failure -eq 'quiet-completion') { 2 } elseif ($failure -eq 'install' -or $failure -eq 'doctor') { 7 } elseif ($failure -eq 'download') { 1 } else { 0 }
        if ($status -ne $expected) { Get-Content (Join-Path $testRoot ('output-' + $passed + '.log')); throw "Unexpected bootstrap exit: $failure => $status" }
        # Keep zero/one/many records as an array. WinPS 5.1 does not provide
        # .Count on a single PSCustomObject emitted by an if statement.
        $calls = @(if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log | ForEach-Object { $_ | ConvertFrom-Json } })
        $output = Get-Content -LiteralPath (Join-Path $testRoot ('output-' + $passed + '.log')) -Raw
        if ($mode -eq 'handoff') {
            if (-not (Test-Path -LiteralPath ($log + '.repair')) -or $output -notmatch 'Setup remains incomplete') { throw 'Repair handoff was not saved/reported after releasing the source lock' }
        }
        if ($failure -ne 'none') {
            if ($output -notmatch 'BEGIN SETUP REPAIR TASK' -or $output -notmatch 'Repair text file:') { throw 'Automatic readable-file/terminal fallback missing after failure' }
        }
        if ($failure -eq 'quiet-completion') {
            if ($calls.Count -ne 1 -or $calls[0].command -ne 'quiet-completion' -or $output -notmatch 'English fixture repair task for --completion-only') { throw 'Completion repair invoked full install/Doctor or lost its scope' }
        }
        if ($failure -eq 'none' -and $mode -eq 'quiet') {
            if ($calls.Count -ne 1 -or $calls[0].command -ne 'quiet-completion') { throw 'Quiet command installed full profile or ran Doctor' }
        } elseif ($failure -eq 'none' -or $failure -eq 'doctor') {
            if ($calls.Count -ne 2 -or $calls[0].command -ne 'install' -or $calls[1].command -ne 'doctor' -or $calls[0].source -ne $calls[1].source) { Get-Content (Join-Path $testRoot ('output-' + $passed + '.log')); $calls | ConvertTo-Json -Depth 5; throw 'Install and Doctor did not use the same snapshot' }
            if ($calls[0].args -notcontains '--auto-approve') { throw 'Native automation option missing' }
            $namePosition = [Array]::IndexOf($calls[0].args, '--name')
            if ($namePosition -lt 0 -or $calls[0].args[$namePosition + 1] -ne 'povilitel') { throw 'Requested display name was not forwarded to install' }
            # Compare canonical Windows paths: the long-root fixture deliberately
            # includes '/', while Node normalizes argv paths to backslashes.
            $expectedPrefix = [IO.Path]::GetFullPath($downloadRoot).TrimEnd('\') + '\'
            $actualSource = [IO.Path]::GetFullPath($calls[0].source)
            if (-not $actualSource.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath ('\\?\' + $actualSource) -PathType Leaf)) { throw 'Downloaded source was not retained in the selected drive directory' }
        } elseif ($failure -eq 'install' -and @($calls).Count -ne 1) { Get-Content (Join-Path $testRoot ('output-' + $passed + '.log')); $calls | ConvertTo-Json -Depth 5; throw 'Doctor ran after failed install' }
        elseif ($failure -eq 'download' -and $calls.Count -ne 0) { throw 'Install ran after failed download' }
        if ($failure -eq 'install' -or $failure -eq 'doctor') {
            if ($output -notmatch 'Setup diagnostics: ([^\r\n]+)') { throw 'Diagnostic directory missing from terminal output' }
            $failurePath = Join-Path $Matches[1].Trim() 'setup-failure.json'
            $literalFailurePath = '\\?\' + [IO.Path]::GetFullPath($failurePath)
            if (-not (Test-Path -LiteralPath $literalFailurePath)) { throw 'Failed setup did not retain diagnostic report' }
            $summary = Get-Content -LiteralPath $literalFailurePath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($summary.exitCode -ne 7 -or $summary.stage -ne $failure -or $summary.sourceCommit -ne $sha -or $summary.failure -notmatch ('fixture ' + $failure + ' failure')) { throw 'Failure report lost original failure or source identity' }
            $expectedUnicode = '"\u041e\u0448\u0438\u0431\u043a\u0430: \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u2717"' | ConvertFrom-Json
            $nativeOutput = Get-Content -LiteralPath ('\\?\' + [IO.Path]::GetFullPath($summary.outputLog)) -Raw -Encoding UTF8
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
        $zipCheck = 'const fs=require("node:fs"),path=require("node:path");function walk(root){for(const entry of fs.readdirSync(root,{withFileTypes:true})){const full=path.join(root,entry.name);if(entry.isSymbolicLink())throw new Error("Unexpected test link");if(entry.isDirectory())walk(full);else if(entry.name==="setup.zip")throw new Error("Downloaded ZIP was not cleaned");}}walk(process.argv[2]);'
        # WinPS 5.1's legacy native argv mode strips JavaScript double quotes
        # from -e arguments. Pipe source as stdin, as the production helpers do.
        $zipCheck | & $node - $downloadRoot
        if ($LASTEXITCODE -ne 0) { throw 'Long-path downloaded ZIP cleanup failed' }
        $passed++
    }
    Write-Host "PASS: $passed bootstrap runtime scenarios (normal/clean/quiet cache reuse, install failure, Doctor failure, download failure)"
} catch {
    $runtimeTestFailure = $_
    Write-BootstrapTestError ('Bootstrap runtime test [' + $currentScenario + ']: ' + $runtimeTestFailure.Exception.Message + "`n" + $runtimeTestFailure.ScriptStackTrace)
    if ($currentLog -and (Test-Path -LiteralPath $currentLog)) {
        foreach ($line in @(Get-Content -LiteralPath $currentLog -Tail 10)) {
            Write-BootstrapTestError ('Bootstrap fixture call: ' + $line)
        }
    }
    if ($currentOutputFile -and (Test-Path -LiteralPath $currentOutputFile)) {
        foreach ($line in @(Get-Content -LiteralPath $currentOutputFile -Tail 60)) {
            Write-BootstrapTestError ('Bootstrap fixture output: ' + $line)
        }
    }
    throw
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $parent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolved.StartsWith($parent, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -match '^workstation-bootstrap-test-[a-f0-9]{32}$') {
        $cleanup = 'const fs=require("node:fs"),path=require("node:path");const target=path.resolve(process.argv[2]);if(!/^workstation-bootstrap-test-[a-f0-9]{32}$/.test(path.basename(target)))throw new Error("Unsafe test cleanup");fs.rmSync(target,{recursive:true,force:true,maxRetries:3,retryDelay:100});'
        $cleanup | & $node - $resolved
        if ($LASTEXITCODE -ne 0) { throw 'Could not clean bootstrap runtime test directory' }
    }
}
