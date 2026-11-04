# Runs scripts/bootstrap.ps1 end to end against a local Git fixture: every README mode,
# source refresh, stale-launcher hand-off, clean-mode pause, failures and repair hand-off.
param()
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$bootstrap = Join-Path $repoRoot 'scripts\bootstrap.ps1'
$version = (Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$git = (Get-Command git.exe -ErrorAction Stop).Source
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('workstation-bootstrap-test-' + [guid]::NewGuid().ToString('N'))
$fixture = Join-Path $testRoot 'fixture'
$remote = Join-Path $testRoot 'remote.git'
$download = Join-Path $testRoot 'Download root with spaces'
$utf8 = New-Object Text.UTF8Encoding $false
$passed = 0

function Invoke-Quiet([string[]]$Arguments) {
    $saved = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { $output = & $git @Arguments 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $saved }
    if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed: $output" }
    ($output -join "`n").Trim()
}
function Write-Fixture([string]$Relative, [string]$Text) {
    $file = Join-Path $fixture $Relative
    [IO.Directory]::CreateDirectory((Split-Path $file -Parent)) | Out-Null
    [IO.File]::WriteAllText($file, $Text, $utf8)
}
function Publish-Fixture([string]$Message) {
    $null = Invoke-Quiet @('-C', $fixture, 'add', '-A')
    $null = Invoke-Quiet @('-C', $fixture, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', $Message)
    $null = Invoke-Quiet @('-C', $fixture, 'push', '--quiet', '--force', $remote, 'HEAD:refs/heads/main')
    Invoke-Quiet @('-C', $fixture, 'rev-parse', 'HEAD')
}
function Invoke-Scenario([string]$Name, [string]$Mode = '', [string]$Fail = '', [string]$Launcher = $bootstrap, [switch]$IdeOpen) {
    $log = Join-Path $testRoot ($Name + '.calls')
    $result = Join-Path $testRoot ($Name + '.result.json')
    $wrapper = Join-Path $testRoot 'wrapper.ps1'
    [IO.File]::WriteAllText($wrapper, @'
param([string]$Launcher, [string]$Remote, [string]$Download, [string]$Log, [string]$Fail, [string]$Mode, [string]$Result, [string]$IdeOpen)
if ($Fail -eq 'none') { $Fail = '' }
if ($Mode -eq 'none') { $Mode = '' }
$env:WORKSTATION_BOOTSTRAP_TEST_LOG = $Log
$env:WORKSTATION_BOOTSTRAP_TEST_FAIL = $Fail
$env:LOCALAPPDATA = Split-Path $Download -Parent
function Get-Process { param([string[]]$Name, [object]$ErrorAction) if ($IdeOpen -eq 'yes') { [pscustomobject]@{ ProcessName = 'Antigravity IDE' } } }
function Set-Clipboard { param([string]$Value) throw 'fixture clipboard unavailable' }
function Get-FileHash { throw 'fixture optional hash cmdlet unavailable' }
$switches = @{}
if ($Mode) { $switches[$Mode] = $true }
& $Launcher -Name 'povilitel' -DownloadRoot $Download -SourceUrl $Remote -ResultFile $Result @switches
exit $LASTEXITCODE
'@, $utf8)
    $saved = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wrapper -Launcher $Launcher -Remote $remote -Download $download -Log $log -Fail $(if ($Fail) { $Fail } else { 'none' }) -Mode $(if ($Mode) { $Mode } else { 'none' }) -Result $result -IdeOpen $(if ($IdeOpen) { 'yes' } else { 'no' }) 2>&1 | ForEach-Object { "$_" }
    $exit = $LASTEXITCODE
    $ErrorActionPreference = $saved
    $calls = @(if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json } })
    $summary = if (Test-Path -LiteralPath $result) { Get-Content -LiteralPath $result -Raw -Encoding UTF8 | ConvertFrom-Json }
    [pscustomobject]@{ Exit = $exit; Output = ($output -join "`n"); Calls = $calls; Result = $summary }
}
function Assert-True([bool]$Condition, [string]$Message, [object]$Run) {
    if (-not $Condition) { if ($Run) { Write-Host $Run.Output }; throw $Message }
    $script:passed++
}

try {
    [IO.Directory]::CreateDirectory($fixture) | Out-Null
    $tokens = $null; $parseErrors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($bootstrap, [ref]$tokens, [ref]$parseErrors)
    $pathFunction = $ast.EndBlock.Statements | Where-Object { $_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -eq 'Update-SessionPath' }
    . ([scriptblock]::Create($pathFunction.Extent.Text))
    $savedPath = $env:Path
    $selectedTools = Join-Path $testRoot 'selected runtime'
    try {
        $env:Path = $selectedTools + ';' + $savedPath
        Update-SessionPath
        Assert-True ($env:Path.StartsWith($selectedTools + ';')) 'Refreshing PATH must preserve the selected runtime ahead of older system tools'
        Update-SessionPath -AfterInstall
        $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
        Assert-True ($env:Path.StartsWith($machinePath)) 'After prerequisite installation the refreshed installed tool paths must take precedence'
    } finally { $env:Path = $savedPath }
    $null = Invoke-Quiet @('init', '--quiet', '--bare', $remote)
    $null = Invoke-Quiet @('init', '--quiet', $fixture)
    Write-Fixture 'package.json' ('{"name":"antigravity-workstation-setup","version":"' + $version + '"}')
    Write-Fixture 'bin/workstation-setup.js' @'
const fs = require('fs');
fs.appendFileSync(process.env.WORKSTATION_BOOTSTRAP_TEST_LOG, JSON.stringify({ command: process.argv[2], args: process.argv.slice(3), entry: process.argv[1] }) + '\n');
if (process.env.WORKSTATION_BOOTSTRAP_TEST_FAIL === process.argv[2]) {
  console.error((process.argv[2] === 'quiet-completion' ? 'Quiet completion incomplete:' : 'Setup incomplete:') + ' fixture ' + process.argv[2] + ' failure: \u041e\u0448\u0438\u0431\u043a\u0430 \u2717');
  process.exit(7);
}
console.log('fixture ' + process.argv[2] + ' ok: \u0413\u043e\u0442\u043e\u0432\u043e');
'@
    Write-Fixture 'scripts/queue-repair-chat.cjs' @'
const fs = require('fs'), path = require('path');
if (process.argv[2] === '--doctor-passed') { console.log(JSON.stringify({ state: 'idle' })); process.exit(0); }
const report = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
if (report.exitCode !== 7 || !report.failure.includes('fixture')) process.exit(1);
const requestFile = path.join(path.dirname(process.argv[3]), 'request.json');
fs.writeFileSync(requestFile, JSON.stringify(report));
console.log(JSON.stringify({ queued: true, requestFile, prompt: 'Fixture repair task for ' + (process.argv[4] || 'full') }));
'@
    Write-Fixture 'scripts/bootstrap.ps1' ([IO.File]::ReadAllText($bootstrap))
    $first = Publish-Fixture 'first'

    $run = Invoke-Scenario 'install'
    Assert-True ($run.Exit -eq 0 -and $run.Calls.Count -eq 2 -and $run.Calls[0].command -eq 'install' -and $run.Calls[1].command -eq 'doctor') 'Command 2 must install and then run Doctor' $run
    Assert-True ($run.Calls[0].args -notcontains '--clean-extensions' -and $run.Calls[0].args -contains 'povilitel') 'Command 2 must keep other extensions and forward the name' $run
    Assert-True ($run.Output -match [regex]::Escape($first) -and $run.Result.state -eq 'stages-complete') 'Command 2 must report the synced commit and result' $run
    Assert-True ($run.Output.Contains("fixture install ok: $([char]0x0413)")) 'UTF-8 installer output must reach the console intact' $run
    $source = Join-Path $download 'safarovmurod-antigravity-workstation\source'
    Assert-True ((Test-Path -LiteralPath (Join-Path $source 'bin\workstation-setup.js')) -and -not (Test-Path -LiteralPath (Join-Path $source '.git'))) 'The source tree must contain only repository files' $run

    $run = Invoke-Scenario 'clean' 'CleanExtensions'
    Assert-True ($run.Exit -eq 0 -and $run.Calls[0].args -contains '--clean-extensions' -and $run.Calls[1].command -eq 'doctor') 'Command 1 must forward the clean switch and run Doctor' $run

    $run = Invoke-Scenario 'quiet' 'QuietCompletion'
    Assert-True ($run.Exit -eq 0 -and $run.Calls.Count -eq 1 -and $run.Calls[0].command -eq 'quiet-completion') 'Command 3 must only disable AI suggestions' $run

    $run = Invoke-Scenario 'clean-open' 'CleanExtensions' -IdeOpen
    Assert-True ($run.Exit -eq 3 -and $run.Calls.Count -eq 0 -and $run.Result.state -eq 'paused' -and $run.Output -match 'Clean setup is paused') 'Command 1 must pause without changes while the IDE is open' $run

    $run = Invoke-Scenario 'install-open' -IdeOpen
    Assert-True ($run.Exit -eq 0 -and $run.Calls.Count -eq 2) 'Command 2 must work while the IDE is open' $run

    Write-Fixture 'extra/new-file.txt' 'second'
    $second = Publish-Fixture 'second'
    $leftover = Join-Path $source 'leftover.tmp'
    [IO.File]::WriteAllText($leftover, 'stale')
    $run = Invoke-Scenario 'update'
    Assert-True ($run.Exit -eq 0 -and $run.Output -match [regex]::Escape($second) -and (Test-Path -LiteralPath (Join-Path $source 'extra\new-file.txt'))) 'Updates must fetch the newest commit' $run
    Assert-True (-not (Test-Path -LiteralPath $leftover)) 'Updates must remove files that are not in the newest commit' $run

    $stale = Join-Path $testRoot 'stale-launcher.ps1'
    [IO.File]::WriteAllText($stale, ([IO.File]::ReadAllText($bootstrap) + "`n# older web copy`n"), $utf8)
    $run = Invoke-Scenario 'stale' '' '' $stale
    Assert-True ($run.Exit -eq 0 -and $run.Output -match 'Running the newest bootstrap' -and $run.Calls.Count -eq 2 -and $run.Result.state -eq 'stages-complete') 'A stale launcher must hand off to the newest bootstrap once' $run

    $run = Invoke-Scenario 'install-fail' '' 'install'
    Assert-True ($run.Exit -eq 2 -and $run.Calls.Count -eq 1 -and $run.Result.state -eq 'repair-pending' -and $run.Output -match 'Fixture repair task for full') 'An incomplete install must queue one repair task and skip Doctor' $run
    Assert-True ($run.Output -match 'BEGIN SETUP REPAIR TASK' -and $run.Output -match 'Repair text file:') 'Repair text must reach a file and the terminal without a clipboard' $run
    $report = Get-Content -LiteralPath (Join-Path $download 'safarovmurod-antigravity-workstation\logs\setup-failure.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-True ($report.sourceCommit -eq $second -and $report.stage -eq 'install' -and $report.failure.Contains([string][char]0x2717)) 'The failure report must keep the commit and the Unicode error' $run

    $run = Invoke-Scenario 'doctor-fail' '' 'doctor'
    Assert-True ($run.Exit -eq 2 -and $run.Calls.Count -eq 2 -and $run.Calls[1].command -eq 'doctor') 'A Doctor failure must queue a repair task' $run

    $run = Invoke-Scenario 'quiet-fail' 'QuietCompletion' 'quiet-completion'
    Assert-True ($run.Exit -eq 2 -and $run.Output -match 'Fixture repair task for --completion-only') 'A quiet-mode failure must keep its narrow repair scope' $run

    $saved = $remote
    $remote = Join-Path $testRoot 'missing.git'
    $run = Invoke-Scenario 'offline'
    $remote = $saved
    Assert-True ($run.Exit -eq 1 -and $run.Calls.Count -eq 0 -and $run.Output -match '\[SETUP FAILED\] Stage: Download the newest setup' -and $run.Result.state -eq 'failed') 'A download failure must stop before any setup change' $run

    $dry = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $bootstrap -DryRun 2>&1 | ForEach-Object { "$_" }
    Assert-True ($LASTEXITCODE -eq 0 -and ($dry -join "`n") -match 'DRY-RUN') 'Dry run must succeed without downloading' $null

    Write-Host "PASS: $passed bootstrap checks (commands 1/2/3, IDE open, update, stale launcher, failures, offline, dry run)"
} finally {
    if ((Split-Path $testRoot -Leaf) -match '^workstation-bootstrap-test-[a-f0-9]{32}$') {
        $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
        if ($node) { & $node -e "require('fs').rmSync(process.argv[1],{recursive:true,force:true,maxRetries:3})" $testRoot }
    }
}
