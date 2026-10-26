

$ErrorActionPreference = 'Stop'
$networkTest = @{ passed = 0 }
$repo = Split-Path $PSScriptRoot -Parent
$expectedSetupVersion = (Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('workstation-bootstrap-network-' + [guid]::NewGuid().ToString('N'))
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'scripts/bootstrap.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
foreach ($statement in $ast.EndBlock.Statements) {
    if ($statement -is [Management.Automation.Language.FunctionDefinitionAst]) { . ([scriptblock]::Create($statement.Extent.Text)) }
}
function Assert-True($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Assert-Failure($Action, $Pattern) {
    try { & $Action } catch { if ($_.Exception.Message -notlike $Pattern) { throw }; return }
    throw "Expected failure matching $Pattern"
}
Assert-True ((Get-SetupWindowsTarget -Architecture AMD64 -Version '10.0.19041') -ceq 'x64') 'Windows 10 x64 detection failed'
Assert-True ((Get-SetupWindowsTarget -Architecture ARM64 -Version '10.0.26100') -ceq 'arm64') 'Windows 11 ARM64 detection failed'
Assert-Failure { Get-SetupWindowsTarget -Architecture ARM64 -Version '10.0.19045' } '*ARM64 requires Windows 11*'
Assert-Failure { Get-SetupWindowsTarget -Architecture x86 -Version '10.0.19041' } '*64-bit Windows*'
Assert-Failure { Get-SetupWindowsTarget -Architecture AMD64 -Version '6.3.9600' } '*Windows 7/8*'
Assert-Failure { Get-SetupWindowsTarget -Architecture AMD64 -Version '10.0.17763' } '*19041*'
function Start-Sleep { param([int]$Seconds) }
function Get-Command {
    param([string]$Name, [object]$ErrorAction)
    if ($Name -eq 'curl.exe') {
        if ($networkTest.useCurl) { return [pscustomobject]@{Source=(Join-Path $testRoot 'curl mock.ps1')} }
        return $null
    }
    return Microsoft.PowerShell.Core\Get-Command $Name -ErrorAction Stop
}
function Invoke-WebRequest {
    param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile, [int]$TimeoutSec, [object]$ErrorAction, [switch]$PassThru)
    $networkTest.requests++
    Assert-True ($TimeoutSec -eq $networkTest.expectedTimeout) 'Explicit timeout missing'
    Assert-True ($ProgressPreference -eq 'SilentlyContinue') 'Slow WinPS web progress was not disabled'
    Assert-True ($UseBasicParsing -and "$ErrorAction" -eq 'Stop') 'Unsafe web request contract'
    if ($TimeoutSec -eq 120) { Assert-True ($Uri -match '/main/scripts/bootstrap\.ps1\?t=') 'README must fetch the current main without stale cache' }
    if ($Uri -like 'https://codeload.github.com/*') { Assert-True ($Uri -eq ('https://codeload.github.com/safarovmurod/antigravity-workstation/zip/' + $sha)) 'ZIP must use the resolved immutable commit' }
    if ($networkTest.requestMode -eq 'empty') { [IO.File]::WriteAllText($OutFile, ''); return }
    if ($networkTest.requestMode -eq 'fail' -or ($networkTest.requestMode -eq 'retry' -and $networkTest.requests -eq 1)) {
        [IO.File]::WriteAllText($OutFile, 'partial download')
        throw 'simulated operation timed out'
    }
    if ($networkTest.requestMode -eq 'corrupt') { [IO.File]::WriteAllText($OutFile, 'not a ZIP'); return }
    if ($networkTest.requestMode -eq 'launcher') { [IO.File]::WriteAllText($OutFile, '# bootstrap fixture'); return }
    Copy-Item -LiteralPath $networkTest.fixtureArchive -Destination $OutFile
    if ($networkTest.requestMode -eq 'lengthMismatch') { return [pscustomobject]@{ Headers = @{ 'Content-Length' = '99999999' } } }
}
function powershell.exe {
    $networkTest.launches++
    $fileIndex = [Array]::IndexOf($args, '-File')
    Assert-True ($fileIndex -ge 0 -and (Test-Path -LiteralPath $args[$fileIndex + 1])) 'Launcher did not pass an existing script'
    $minimumIndex = [Array]::IndexOf($args, '-MinimumVersion')
    Assert-True ($minimumIndex -ge 0 -and $args[$minimumIndex + 1] -eq $expectedSetupVersion) ('README must reject setup versions older than ' + $expectedSetupVersion)
    $branchIndex = [Array]::IndexOf($args, '-SourceBranch')
    Assert-True ($branchIndex -ge 0 -and $args[$branchIndex + 1] -ceq 'main') 'README bootstrap and source must use the same main branch'
    Assert-True (($args -contains '-QuietCompletion') -eq $networkTest.expectedQuiet) 'README completion scope missing or applied to full setup'
    Assert-True (($args -contains '-CleanExtensions') -eq $networkTest.expectedClean) 'README clean mode missing or applied to the ordinary update'
    $networkTest.launchedFile = $args[$fileIndex + 1]
    $resultIndex = [Array]::IndexOf($args, '-ResultFile')
    Assert-True ($resultIndex -ge 0) 'README did not request the actual bootstrap failure summary'
    $networkTest.launchedResultFile = $args[$resultIndex + 1]
    if ($networkTest.resultMode -ne 'none') {
        $result = New-SetupResult -ExitCode $networkTest.launchStatus -Stage 'Install profile' -Failure 'fixture extension failed: unavailable compatible package' -Diagnostics (Join-Path $testRoot 'retained diagnostics') -RepairTextFile (Join-Path $testRoot 'repair-task.txt')
        if ($networkTest.resultMode -eq 'mismatch') { $result.exitCode = 0 }
        if ($networkTest.resultMode -eq 'corrupt') { [IO.File]::WriteAllText($networkTest.launchedResultFile, 'not JSON') }
        else { Write-SetupResult -Path $networkTest.launchedResultFile -Result $result }
    }
    if ($networkTest.nativeError) { Write-Error 'fixture native stderr before the real exit status' }
    $global:LASTEXITCODE = $networkTest.launchStatus
}
function Test-Case($Label, $Action) {
    $networkTest.currentCase = $Label
    $networkTest.requests = 0; $networkTest.useCurl = $false; $networkTest.expectedTimeout = 600
    $networkTest.requestMode = 'success'; $networkTest.launches = 0; $networkTest.launchStatus = 0
    $networkTest.expectedQuiet = $false
    $networkTest.expectedClean = $false
    $networkTest.resultMode = 'none'; $networkTest.nativeError = $false
    $networkTest.copyAttempts = 0; $networkTest.clipboardMode = 'success'; $networkTest.clipboardText = $null
    & $Action
    $networkTest.passed++
    Write-Host "PASS: $Label"
}
function Set-Clipboard {
    param([string]$Value, [object]$ErrorAction)
    $networkTest.copyAttempts++
    if ($networkTest.clipboardMode -eq 'fail' -or ($networkTest.clipboardMode -eq 'retry' -and $networkTest.copyAttempts -eq 1)) { throw 'fixture clipboard busy' }
    $networkTest.clipboardText = $Value
}
function Get-Clipboard {
    param([switch]$Raw, [object]$ErrorAction)
    if ($networkTest.clipboardMode -eq 'mismatch') { return 'different clipboard contents' }
    return $networkTest.clipboardText
}
function Get-Process {
    param([object]$ErrorAction)
    $networkTest.processChecks++
    if ($networkTest.processError) { throw 'fixture process enumeration unavailable' }
    foreach ($name in $networkTest.processNames) { [pscustomobject]@{ ProcessName = $name } }
}
$originalTemp = $env:TEMP
try {
    New-Item -ItemType Directory -Path $testRoot | Out-Null
    $env:TEMP = $testRoot
    Test-Case 'branch resolution is exact, rejects stale/multiple responses and never falls back to main' {
        $originalGit = (Get-Command Invoke-SetupGit).ScriptBlock
        try {
            $networkTest.remote = ('a' * 40) + "`trefs/heads/fixture/selected-source"
            function Invoke-SetupGit {
                param($GitPath, $Arguments, $Label)
                Assert-True ($Arguments[-1] -ceq 'refs/heads/fixture/selected-source') 'Wrong branch requested'
                $networkTest.remote
            }
            $resolved = Resolve-SetupCommit -GitPath fixture -RepoSlug 'safarovmurod/antigravity-workstation' -SourceBranch 'fixture/selected-source'
            Assert-True ($resolved -ceq ('a' * 40)) 'Wrong immutable commit'
            foreach ($bad in @('', (('b' * 40) + "`trefs/heads/main"), @($networkTest.remote, $networkTest.remote), 'invalid response')) {
                $networkTest.remote = $bad
                Assert-Failure { Resolve-SetupCommit -GitPath fixture -RepoSlug 'safarovmurod/antigravity-workstation' -SourceBranch 'fixture/selected-source' } '*Cannot resolve the selected setup branch*'
            }
            foreach ($bad in @('../main', 'main//other', 'main;whoami', '-main', 'main/')) {
                Assert-Failure { Resolve-SetupCommit -GitPath fixture -RepoSlug 'safarovmurod/antigravity-workstation' -SourceBranch $bad } '*'
            }
        } finally { Set-Item -LiteralPath Function:Invoke-SetupGit -Value $originalGit }
    }
    Test-Case 'bootstrap summary distinguishes passed stages, preview, repair, pause and failure' {
        foreach ($pair in @(@(0, 'stages-complete'), @(2, 'repair-pending'), @(3, 'paused'), @(7, 'failed'))) {
            $result = New-SetupResult -ExitCode $pair[0] -Stage 'fixture stage' -Failure 'fixture cause'
            Assert-True ($result.exitCode -eq $pair[0] -and $result.state -ceq $pair[1]) 'Exit status was converted to the wrong setup result'
        }
        Assert-True ((New-SetupResult -ExitCode 0 -DryRun).state -eq 'dry-run') 'Preview was reported installed'
    }
    Test-Case 'bootstrap summary is bounded and removes credentials from failure and paths' {
        $result = New-SetupResult -ExitCode 7 -Stage 'fixture' -Failure ('Bearer private-token password=private-password ' + ('x' * 10000)) -Diagnostics 'https://private-user:private-password@example.test/path?token=private-query'
        Assert-True ($result.reason.Length -lt 8300 -and ($result | ConvertTo-Json) -notmatch 'private-token|private-password|private-user|private-query') 'Summary exposed a credential or grew without a bound'
    }
    Test-Case 'bootstrap summary preserves UTF-8 and never overwrites an existing file' {
        $file = Join-Path $testRoot 'result with spaces.json'
        $unicode = '"\u041e\u0448\u0438\u0431\u043a\u0430 \u2717"' | ConvertFrom-Json
        $result = New-SetupResult -ExitCode 7 -Stage 'Install profile' -Failure $unicode
        Write-SetupResult -Path $file -Result $result
        $before = [IO.File]::ReadAllText($file)
        Assert-True (($before | ConvertFrom-Json).reason -ceq $unicode) 'Summary corrupted Unicode'
        Assert-Failure { Write-SetupResult -Path $file -Result (New-SetupResult -ExitCode 0) } '*'
        Assert-True ([IO.File]::ReadAllText($file) -ceq $before) 'Summary overwrote existing data'
    }
    Test-Case 'bootstrap summary cannot replace a personal file used as its parent' {
        $blocker = Join-Path $testRoot 'summary-parent-blocker'
        [IO.File]::WriteAllText($blocker, 'personal data')
        Assert-Failure { Write-SetupResult -Path (Join-Path $blocker 'result.json') -Result (New-SetupResult -ExitCode 7) } '*'
        Assert-True ([IO.File]::ReadAllText($blocker) -ceq 'personal data') 'Result-file fallback changed personal data'
    }
    Test-Case 'ordinary update and completion-only do not require a closed IDE or inspect processes' {
        $networkTest.processChecks = 0; $networkTest.processError = $true
        Assert-True (Test-SetupModeReady) 'Ordinary update was blocked by the clean-mode guard'
        Assert-True (Test-SetupModeReady -CleanExtensions:$false) 'Completion-only inherited a clean guard'
        Assert-True ($networkTest.processChecks -eq 0) 'A non-clean mode inspected IDE processes'
        $networkTest.processError = $false
    }
    Test-Case 'clean mode recognizes all supported running editor process names before changes' {
        $networkTest.processChecks = 0
        foreach ($name in @('Antigravity IDE', 'Antigravity', 'antigravity-ide', 'ANTIGRAVITY IDE')) {
            $networkTest.processNames = @($name)
            Assert-True (-not (Test-SetupModeReady -CleanExtensions 3>$null 6>$null)) ('Clean mode failed to detect ' + $name)
        }
        Assert-True ($networkTest.processChecks -eq 4) 'Clean mode did not check each editor name'
    }
    Test-Case 'closed IDE permits clean mode and unrelated processes do not block it' {
        $networkTest.processNames = @('powershell', 'Code', 'language_server_windows_x64')
        Assert-True (Test-SetupModeReady -CleanExtensions) 'An unrelated process blocked cleanup'
    }
    Test-Case 'clean dry-run remains read-only and does not require closing the editor' {
        $networkTest.processChecks = 0; $networkTest.processError = $true
        Assert-True (Test-SetupModeReady -CleanExtensions -DryRun) 'Preview was blocked'
        Assert-True ($networkTest.processChecks -eq 0) 'Preview inspected running processes'
        $networkTest.processError = $false
    }
    Test-Case 'a process enumeration error cannot authorize clean mode' {
        $networkTest.processError = $true
        Assert-Failure { Test-SetupModeReady -CleanExtensions } '*process enumeration unavailable*'
        $networkTest.processError = $false
    }
    Test-Case 'a reopened editor is caught by the second clean-mode check' {
        $networkTest.processNames = @()
        Assert-True (Test-SetupModeReady -CleanExtensions) 'Closed initial state was blocked'
        $networkTest.processNames = @('Antigravity IDE')
        Assert-True (-not (Test-SetupModeReady -CleanExtensions 3>$null 6>$null)) 'Reopened editor was allowed'
    }
    $git = (Microsoft.PowerShell.Core\Get-Command git -ErrorAction Stop).Source
    $fixtureRepo = Join-Path $testRoot 'local Git source with spaces'
    New-Item -ItemType Directory -Path (Join-Path $fixtureRepo 'bin') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $fixtureRepo 'bin/workstation-setup.js'), '// fixture entry')
    [IO.File]::WriteAllText((Join-Path $fixtureRepo 'package.json'), '{"name":"antigravity-workstation-setup","version":"0.0.0"}')
    & $git init --quiet $fixtureRepo
    & $git -C $fixtureRepo add .
    & $git -C $fixtureRepo -c user.name=Test -c user.email=test@example.invalid commit --quiet -m fixture
    if ($LASTEXITCODE -ne 0) { throw 'Could not create local Git fixture' }
    $sha = (& $git -C $fixtureRepo rev-parse HEAD).Trim()
    Test-Case 'a first-run cache miss is an expected state without an ENOENT error message' {
        $missing = Invoke-SetupCacheTool -Action validate -Directory (Join-Path $testRoot 'not downloaded yet') -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha
        Assert-True (-not $missing.valid -and $missing.missing) 'A fresh cache was not classified as absent'
        Assert-True ($missing.reason -notmatch 'ENOENT|no such file') 'Expected cache absence was presented as a filesystem failure'
    }
    $fixtureSource = Join-Path $testRoot ('antigravity-workstation-' + $sha)
    New-Item -ItemType Directory -Path $fixtureSource | Out-Null
    Copy-Item -LiteralPath (Join-Path $fixtureRepo 'bin') -Destination $fixtureSource -Recurse
    Copy-Item -LiteralPath (Join-Path $fixtureRepo 'package.json') -Destination $fixtureSource
    $networkTest.fixtureArchive = Join-Path $testRoot 'fixture.zip'
    Compress-Archive -LiteralPath $fixtureSource -DestinationPath $networkTest.fixtureArchive
    $gitMock = Join-Path $testRoot 'git mock.ps1'

    Set-Content -LiteralPath $gitMock -Value @'
$gitArguments = @($args | ForEach-Object { if ($_ -eq 'https://github.com/safarovmurod/antigravity-workstation.git') { $fixtureRepo } else { $_ } })
$networkTest.gitCalls++
if ($networkTest.gitMode -eq 'fail') { $global:LASTEXITCODE = 7; Write-Output 'simulated Git timeout'; return }
if ($networkTest.gitMode -eq 'retry' -and $networkTest.gitCalls -eq 1) { $global:LASTEXITCODE = 7; return }
if ($networkTest.gitMode -eq 'mismatch' -and $args -contains 'rev-parse') { $global:LASTEXITCODE = 0; Write-Output ('f' * 40); return }
& $git @gitArguments
$global:LASTEXITCODE = $LASTEXITCODE
'@
    Set-Content -LiteralPath (Join-Path $testRoot 'curl mock.ps1') -Value @'
$networkTest.requests++
Assert-True ($args -contains '--fail' -and $args -contains '--location') 'curl must reject HTTP errors and follow HTTPS redirects'
Assert-True ($args -notcontains '-k' -and $args -notcontains '--insecure') 'TLS verification disabled'
Assert-True ($args[[Array]::IndexOf($args, '--max-time') + 1] -eq $networkTest.expectedTimeout) ("curl total timeout missing: " + ($args -join '|') + '; expected ' + $networkTest.expectedTimeout)
Assert-True ($args[[Array]::IndexOf($args, '--connect-timeout') + 1] -eq 20) 'curl connection timeout missing'
$out = $args[[Array]::IndexOf($args, '--output') + 1]
if ($networkTest.requestMode -eq 'fail' -or ($networkTest.requestMode -eq 'retry' -and $networkTest.requests -eq 1)) {
    [IO.File]::WriteAllText($out, 'partial'); $global:LASTEXITCODE = 28; return
}
if ($args[-1] -like '*/main/scripts/bootstrap.ps1?t=*') { [IO.File]::WriteAllText($out, '# bootstrap fixture') }
else { Copy-Item -LiteralPath $networkTest.fixtureArchive -Destination $out }
$global:LASTEXITCODE = 0
'@
    $download = Join-Path $testRoot 'download with spaces.zip'
    Test-Case 'integrated fallback saves, retries the clipboard and verifies the exact redacted task' {
        $networkTest.clipboardMode = 'retry'
        $destination = Join-Path $testRoot 'automatic fallback/repair-task.txt'
        Publish-SetupRepairFallback -Text 'Repair fixture extension TOKEN=private-value' -Destination $destination
        $saved = [IO.File]::ReadAllText($destination)
        Assert-True ($networkTest.copyAttempts -eq 2 -and $networkTest.clipboardText -ceq $saved -and $saved -notmatch 'private-value') 'Fallback did not retry/copy/verify the same redacted task'
    }
    Test-Case 'clipboard failure prints the task after three attempts and keeps the readable file' {
        $networkTest.clipboardMode = 'fail'
        $destination = Join-Path $testRoot 'no clipboard/repair-task.txt'
        $output = Publish-SetupRepairFallback -Text 'English repair fixture' -Destination $destination 6>&1 | Out-String
        Assert-True ($networkTest.copyAttempts -eq 3 -and $output -match 'BEGIN SETUP REPAIR TASK' -and $output -match 'English repair fixture' -and (Test-Path $destination)) 'Clipboard failure did not fall back to file and terminal'
    }
    Test-Case 'clipboard read-back mismatch is not reported as a successful copy' {
        $networkTest.clipboardMode = 'mismatch'
        $output = Publish-SetupRepairFallback -Text 'Exact repair text' 6>&1 | Out-String
        Assert-True ($networkTest.copyAttempts -eq 3 -and $output -match 'BEGIN SETUP REPAIR TASK' -and $output -notmatch 'read-back verified') 'Wrong clipboard contents were accepted'
    }
    Test-Case 'a failed file save still copies the task and an unchanged task file is not rewritten' {
        $blocker = Join-Path $testRoot 'fallback blocked'; [IO.File]::WriteAllText($blocker, 'preserve personal file')
        Publish-SetupRepairFallback -Text 'Recovery without a file' -Destination (Join-Path $blocker 'repair-task.txt')
        Assert-True ($networkTest.clipboardText -ceq 'Recovery without a file' -and [IO.File]::ReadAllText($blocker) -ceq 'preserve personal file') 'A save failure suppressed clipboard recovery or overwrote the blocker'
        $destination = Join-Path $testRoot 'same repair-task.txt'
        Publish-SetupRepairFallback -Text 'Same task' -Destination $destination
        $oldTime = [datetime]::SpecifyKind([datetime]'2020-01-01', [DateTimeKind]::Utc); [IO.File]::SetLastWriteTimeUtc($destination, $oldTime)
        Publish-SetupRepairFallback -Text 'Same task' -Destination $destination
        Assert-True ([IO.File]::GetLastWriteTimeUtc($destination) -eq $oldTime) 'An unchanged task file was rewritten'
        Publish-SetupRepairFallback -Text 'Updated task' -Destination $destination
        Assert-True ([IO.File]::ReadAllText($destination) -ceq 'Updated task' -and -not @(Get-ChildItem -LiteralPath $testRoot -Filter 'same repair-task.txt.*.tmp').Count) 'Changed recovery text was duplicated or not replaced'
    }
    Test-Case 'source storage prefers the first writable drive and selects the same full-commit cache' {
        $preferred = Join-Path $testRoot 'preferred drive with spaces'
        $fallback = Join-Path $testRoot 'fallback user storage'
        $first = New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -Candidates @($preferred, $fallback)
        $second = New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -Candidates @($preferred, $fallback)
        Assert-True ($first.StartsWith($preferred) -and $second.StartsWith($preferred) -and $first -eq $second -and (Split-Path $first -Leaf) -ceq $sha) 'Preferred drive or fresh source directory not used'
        Assert-True ((Test-Path -LiteralPath (Split-Path $first -Parent) -PathType Container) -and -not @(Get-ChildItem -LiteralPath (Split-Path $first -Parent) -Filter '.write-test-*').Count) 'Write probe not cleaned'
    }
    Test-Case 'unwritable preferred location falls back to the current user storage' {
        $blocked = Join-Path $testRoot 'blocked drive'; [IO.File]::WriteAllText($blocked, 'a file blocks directory creation')
        $fallback = Join-Path $testRoot 'current user storage with spaces'
        $directory = New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -Candidates @($blocked, $fallback)
        Assert-True ($directory.StartsWith($fallback)) 'Failed drive did not fall back'
        Assert-Failure { New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -DownloadRoot $blocked } '*Cannot use DownloadRoot*'
        Assert-Failure { New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -DownloadRoot 'relative/path' } '*absolute path*'
        Assert-Failure { New-SetupWorkspace -RepoSlug '../escape' -Commit $sha -Candidates @($fallback) } '*Invalid setup source identity*'
    }
    Test-Case 'completion-only arguments preserve approval scope; full setup still enables automation' {
        $entry = 'source with spaces/bin/workstation-setup.js'
        $quietArgs = @(Get-SetupArguments -Entry $entry -QuietCompletion -Name 'Шеф')
        Assert-True ($quietArgs.Count -eq 2 -and $quietArgs[0] -eq $entry -and $quietArgs[1] -eq 'quiet-completion') 'Quiet bootstrap must not install/reset the full profile or chat approvals'
        $fullArgs = @(Get-SetupArguments -Entry $entry -Name 'Шеф')
        Assert-True ($fullArgs[1] -eq 'install' -and $fullArgs[2] -eq '--auto-approve' -and $fullArgs[-1] -eq 'Шеф') 'Full setup lost automation or name'
        $rulesArgs = @(Get-SetupArguments -Entry $entry -RulesOnly)
        Assert-True ($rulesArgs[1] -eq 'install' -and $rulesArgs[2] -eq '--rules-only') 'Rules-only mode changed'
        Assert-Failure { Get-SetupArguments -Entry $entry -RulesOnly -QuietCompletion } '*Choose either*'
        $cleanArgs = @(Get-SetupArguments -Entry $entry -CleanExtensions)
        Assert-True ($cleanArgs -contains '--clean-extensions' -and $cleanArgs -contains '--auto-approve') 'Clean setup must install the full profile and explicit extension reset'
        Assert-Failure { Get-SetupArguments -Entry $entry -CleanExtensions -QuietCompletion } '*CleanExtensions requires full setup*'
        Assert-Failure { Get-SetupArguments -Entry $entry -CleanExtensions -RulesOnly } '*CleanExtensions requires full setup*'
        Assert-Failure { Get-SetupArguments -Entry $entry -CleanExtensions -ExtensionProfile lite } '*CleanExtensions requires full setup*'
    }
    Test-Case 'lite is an optional extension selection; ordinary download keeps the full profile' {
        $entry = 'source with spaces/bin/workstation-setup.js'
        $normal = @(Get-SetupArguments -Entry $entry)
        Assert-True ($normal -notcontains '--extension-profile' -and $normal -contains '--auto-approve') 'Default download must retain the full profile and automation'
        $lite = @(Get-SetupArguments -Entry $entry -ExtensionProfile lite)
        $position = [Array]::IndexOf($lite, '--extension-profile')
        Assert-True ($position -ge 0 -and $lite[$position + 1] -eq 'lite' -and $lite -contains '--auto-approve') 'Lite must preserve native automation while selecting extensions'
        Assert-Failure { Get-SetupArguments -Entry $entry -QuietCompletion -ExtensionProfile lite } '*only supported for full setup*'
        Assert-Failure { Get-SetupArguments -Entry $entry -RulesOnly -ExtensionProfile lite } '*only supported for full setup*'
    }
    $versionSource = Join-Path $testRoot 'version check'; New-Item -ItemType Directory $versionSource | Out-Null
    Test-Case 'minimum version rejects stale setup before any installation' {
        Set-Content -LiteralPath (Join-Path $versionSource 'package.json') -Value '{"name":"antigravity-workstation-setup","version":"2.1.12"}'
        Assert-Failure { Assert-SetupPackage -Source $versionSource -MinimumVersion '2.2.0' } '*older than required 2.2.0*'
    }
    Test-Case 'current and newer releases satisfy the minimum version' {
        foreach ($version in @('2.2.0','2.2.1','2.3.0')) {
            Set-Content -LiteralPath (Join-Path $versionSource 'package.json') -Value ('{"name":"antigravity-workstation-setup","version":"' + $version + '"}')
            $verified = Assert-SetupPackage -Source $versionSource -MinimumVersion '2.2.0'
            Assert-True ($verified.version -eq $version) 'Valid current release was rejected'
        }
    }
    Test-Case 'wrong identities and non-release versions are rejected' {
        Set-Content -LiteralPath (Join-Path $versionSource 'package.json') -Value '{"name":"unexpected","version":"99.0.0"}'
        Assert-Failure { Assert-SetupPackage -Source $versionSource -MinimumVersion '2.2.0' } '*Unexpected downloaded package identity*'
        Set-Content -LiteralPath (Join-Path $versionSource 'package.json') -Value '{"name":"antigravity-workstation-setup","version":"2.2.0-old"}'
        Assert-Failure { Assert-SetupPackage -Source $versionSource -MinimumVersion '2.2.0' } '*invalid release version*'
    }
    Test-Case 'IWR timeout retries and replaces the partial file' {
        $networkTest.requestMode = 'retry'
        Invoke-SetupDownload -Uri 'https://example.invalid/current.zip' -OutFile $download
        Assert-True ($networkTest.requests -eq 2) 'Transient timeout did not retry once'
        Assert-True ((Get-FileHash $download).Hash -eq (Get-FileHash $networkTest.fixtureArchive).Hash) 'Partial file reused'
    }
    Test-Case 'persistent timeout is bounded, contextual and leaves no partial download' {
        $networkTest.requestMode = 'fail'
        Assert-Failure { Invoke-SetupDownload -Uri 'https://example.invalid/current.zip' -OutFile $download } '*after 3 attempts*current.zip*timed out*'
        Assert-True ($networkTest.requests -eq 3 -and -not (Test-Path $download)) 'Retry bound/cleanup broken'
    }
    Test-Case 'empty HTTP success is rejected' {
        $networkTest.requestMode = 'empty'
        Assert-Failure { Invoke-SetupDownload -Uri 'https://example.invalid/current.zip' -OutFile $download } '*Download is empty*'
        Assert-True ($networkTest.requests -eq 3 -and -not (Test-Path $download)) 'Empty response executed'
    }
    Test-Case 'curl success preserves TLS and quotes paths with spaces' {
        $networkTest.useCurl = $true
        Invoke-SetupDownload -Uri 'https://example.invalid/current.zip' -OutFile $download
        Assert-True ($networkTest.requests -eq 1 -and (Test-Path $download)) 'curl did not run'
    }
    Test-Case 'curl exit 28 retries and replaces partial output' {
        $networkTest.useCurl = $true; $networkTest.requestMode = 'retry'
        Invoke-SetupDownload -Uri 'https://example.invalid/current.zip' -OutFile $download
        Assert-True ($networkTest.requests -eq 2) 'curl timeout not retried'
        Assert-True ((Get-FileHash $download).Hash -eq (Get-FileHash $networkTest.fixtureArchive).Hash) 'curl reused partial output'
    }
    Test-Case 'curl failure cannot be mistaken for HTTP success' {
        $networkTest.useCurl = $true; $networkTest.requestMode = 'fail'
        Assert-Failure { Invoke-SetupDownload -Uri 'https://example.invalid/current.zip' -OutFile $download } '*curl exited with code 28*'
        Assert-True ($networkTest.requests -eq 3 -and -not (Test-Path $download)) 'Failed curl accepted'
    }
    $networkTest.gitMode = 'success'; $networkTest.gitCalls = 0
    Test-Case 'successful ZIP extraction does not invoke fallback' {
        $directory = Join-Path $testRoot 'zip success'; New-Item -ItemType Directory $directory | Out-Null
        $source = Get-SetupDownloadedSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
        Assert-True ((Test-Path (Join-Path $source 'bin/workstation-setup.js')) -and $networkTest.gitCalls -eq 0) 'ZIP success broken'
    }
    foreach ($mode in @('success', 'corrupt')) {
        Test-Case "long Windows paths support ZIP and exact Git fallback: $mode" {
            $networkTest.requestMode = $mode; $networkTest.gitCalls = 0
            $directory = Join-Path $testRoot (('long-' + ('a' * 90)) + '/' + ('b' * 90) + '/' + ('c' * 90))
            [IO.Directory]::CreateDirectory((ConvertTo-SetupLiteralPath $directory)) | Out-Null
            $source = Get-SetupDownloadedSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
            Assert-True (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath (Join-Path $source 'bin/workstation-setup.js'))) 'Long source path failed'
            Assert-True ($networkTest.gitCalls -eq $(if ($mode -eq 'success') { 0 } else { 4 })) 'Wrong long-path extraction route'
        }
    }
    Test-Case 'ZIP traversal is rejected before any destination file is written' {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $evil = Join-Path $testRoot 'unsafe.zip'
        $zip = [IO.Compression.ZipFile]::Open($evil, [IO.Compression.ZipArchiveMode]::Create)
        try { $null = $zip.CreateEntry(('antigravity-workstation-' + $sha + '/../escape.txt')) } finally { $zip.Dispose() }
        $destination = Join-Path $testRoot 'unsafe destination'
        Assert-Failure { Expand-SetupArchive -Archive $evil -Destination $destination -ExpectedRoot ('antigravity-workstation-' + $sha) } '*Unsafe setup ZIP path*'
        Assert-True (-not (Test-Path $destination) -and -not (Test-Path (Join-Path $testRoot 'escape.txt'))) 'Unsafe ZIP wrote files'
    }
    foreach ($mode in @('fail', 'corrupt')) {
        Test-Case "ZIP $mode falls back to the exact Git commit using real fetch/checkout" {
            $networkTest.requestMode = $mode; $networkTest.gitCalls = 0
            $directory = Join-Path $testRoot ('fallback ' + $mode); New-Item -ItemType Directory $directory | Out-Null
            $source = Get-SetupDownloadedSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
            Assert-True ((Test-Path (Join-Path $source 'bin/workstation-setup.js')) -and $source -eq (Join-Path $directory 'git-source')) 'Git fallback failed'
            Assert-True ((& $git -C $source rev-parse HEAD).Trim() -eq $sha) 'Fallback selected a different commit'
            Assert-True ($networkTest.gitCalls -eq 4) 'Unexpected fallback operations'
        }
    }
    Test-Case 'Git mismatch stops before checkout or installation' {
        $networkTest.requestMode = 'fail'; $networkTest.gitMode = 'mismatch'; $networkTest.gitCalls = 0
        $directory = Join-Path $testRoot 'mismatch'; New-Item -ItemType Directory $directory | Out-Null
        Assert-Failure { Get-SetupDownloadedSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation' } '*commit mismatch*'
        Assert-True (-not (Test-Path (Join-Path $directory 'git-source/bin/workstation-setup.js'))) 'Mismatched source checked out'
        $networkTest.gitMode = 'success'
    }
    Test-Case 'Git command retries transient failures' {
        $networkTest.gitMode = 'retry'; $networkTest.gitCalls = 0
        $result = Invoke-SetupGit -GitPath $gitMock -Arguments @('-C', $fixtureRepo, 'rev-parse', 'HEAD') -Label 'Resolve test'
        Assert-True ($result -eq $sha -and $networkTest.gitCalls -eq 2) 'Git retry result wrong'
        $networkTest.gitMode = 'success'
    }
    Test-Case 'Git failure is bounded and retains stage and reason' {
        $networkTest.gitMode = 'fail'; $networkTest.gitCalls = 0
        Assert-Failure { Invoke-SetupGit -GitPath $gitMock -Arguments @('--version') -Label 'Resolve latest main' } '*Resolve latest main failed after 3 attempts*Git timeout*'
        Assert-True ($networkTest.gitCalls -eq 3) 'Git retry count wrong'
        $networkTest.gitMode = 'success'
    }
    $cacheDirectory = New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -DownloadRoot (Join-Path $testRoot 'reusable cache')
    Test-Case 'normal, clean and quiet commands reuse one verified source without another request' {
        $first = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $cacheDirectory -RepoSlug 'safarovmurod/antigravity-workstation'
        Assert-True ($networkTest.requests -eq 1 -and (Test-Path (Join-Path $cacheDirectory '.workstation-source.json'))) 'First use did not seal source cache'
        $manifestHash = (Get-FileHash (Join-Path $cacheDirectory '.workstation-source.json')).Hash
        $networkTest.requestMode = 'fail'
        foreach ($mode in @('normal', 'clean', 'quiet')) {
            $second = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $cacheDirectory -RepoSlug 'safarovmurod/antigravity-workstation'
            $arguments = @(Get-SetupArguments -Entry (Join-Path $second 'bin/workstation-setup.js') -CleanExtensions:($mode -eq 'clean') -QuietCompletion:($mode -eq 'quiet'))
            Assert-True ($first -ceq $second -and $arguments[0] -eq (Join-Path $first 'bin/workstation-setup.js')) 'Mode selected a duplicate source snapshot'
        }
        Assert-True ($networkTest.requests -eq 1 -and $manifestHash -eq (Get-FileHash (Join-Path $cacheDirectory '.workstation-source.json')).Hash) 'Repeated source caused download/extraction or rewrote immutable manifest'
        Assert-True (-not (Test-Path (Join-Path $cacheDirectory 'setup.zip'))) 'Cached ZIP was unnecessarily retained'
    }
    Test-Case 'changed cached files are repaired atomically while the edited copy is preserved' {
        $entry = Join-Path $cacheDirectory 'source/bin/workstation-setup.js'
        [IO.File]::WriteAllText($entry, '// preserve my edited source')
        $source = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $cacheDirectory -RepoSlug 'safarovmurod/antigravity-workstation'
        $recoveries = @(Get-ChildItem -LiteralPath (Split-Path $cacheDirectory -Parent) -Directory -Filter ($sha + '.recovery-*'))
        Assert-True ($networkTest.requests -eq 1 -and $recoveries.Count -eq 1) 'Changed cache was reused or discarded'
        Assert-True ((Get-Content -LiteralPath (Join-Path $source 'bin/workstation-setup.js') -Raw) -eq '// fixture entry') 'Source was not repaired'
        Assert-True ((Get-Content -LiteralPath (Join-Path $recoveries[0].FullName 'source/bin/workstation-setup.js') -Raw) -eq '// preserve my edited source') 'Edited source was destroyed'
    }
    Test-Case 'missing cached files and package identity changes cannot be reused' {
        Remove-Item -LiteralPath (Join-Path $cacheDirectory 'source/bin/workstation-setup.js')
        $source = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $cacheDirectory -RepoSlug 'safarovmurod/antigravity-workstation'
        Assert-True ($networkTest.requests -eq 1 -and (Test-Path (Join-Path $source 'bin/workstation-setup.js'))) 'Missing file was not repaired'
        [IO.File]::WriteAllText((Join-Path $source 'package.json'), '{"name":"unexpected","version":"9.0.0"}')
        $null = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $cacheDirectory -RepoSlug 'safarovmurod/antigravity-workstation'
        Assert-True ($networkTest.requests -eq 2) 'Changed package identity was accepted'
    }
    Test-Case 'linked cached source is replaced without reading or deleting the external target' {
        $directory = New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -DownloadRoot (Join-Path $testRoot 'linked source cache')
        $source = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
        $outside = Join-Path $testRoot 'external source'; Copy-Item -LiteralPath $source -Destination $outside -Recurse
        Remove-Item -LiteralPath $source -Recurse -Force
        $linker = 'const fs=require("node:fs");fs.symlinkSync(process.argv[2],process.argv[3],process.platform==="win32"?"junction":"dir");'
        $nodeName = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { 'node.exe' } else { 'node' }
        $runtime = Get-Command $nodeName -ErrorAction Stop
        $linker | & $runtime.Source - $outside $source
        Assert-True ($LASTEXITCODE -eq 0) 'Could not create cache-link fixture'
        $repaired = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
        Assert-True ($networkTest.requests -eq 2 -and (Test-Path (Join-Path $outside 'bin/workstation-setup.js'))) 'Linked cache was followed or external content deleted'
        Assert-True ((Invoke-SetupCacheTool -Action validate -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha).valid) 'Linked cache repair did not produce a clean snapshot'

        $unlink = 'require("node:fs").unlinkSync(process.argv[2]);'
        $recovery = @(Get-ChildItem -LiteralPath (Split-Path $directory -Parent) -Directory -Filter ($sha + '.recovery-*'))[0].FullName
        $unlink | & $runtime.Source - (Join-Path $recovery 'source')
        Assert-True ($LASTEXITCODE -eq 0) 'Could not remove preserved fixture junction'
    }
    Test-Case 'failed cache repair preserves the last source and removes partial staging' {
        $entry = Join-Path $cacheDirectory 'source/bin/workstation-setup.js'
        [IO.File]::WriteAllText($entry, '// preserve during network failure')
        $networkTest.requestMode = 'fail'; $networkTest.gitMode = 'fail'
        Assert-Failure { Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $cacheDirectory -RepoSlug 'safarovmurod/antigravity-workstation' } '*Initialize fallback failed*'
        Assert-True ((Get-Content -LiteralPath $entry -Raw) -eq '// preserve during network failure') 'Download failure replaced existing source'
        Assert-True (-not @(Get-ChildItem -LiteralPath (Split-Path $cacheDirectory -Parent) -Filter '.staging-*').Count) 'Failed staging retained downloaded duplicates'
        $networkTest.gitMode = 'success'
    }
    Test-Case 'verified Git fallback becomes the same reusable cache without retained Git objects' {
        $networkTest.requestMode = 'corrupt'
        $directory = New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -DownloadRoot (Join-Path $testRoot 'cached Git fallback')
        $source = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
        Assert-True ((Split-Path $source -Leaf) -eq 'source' -and -not (Test-Path (Join-Path $source '.git'))) 'Fallback metadata or duplicate path was retained'
        $before = $networkTest.requests; $calls = $networkTest.gitCalls
        $null = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
        Assert-True ($networkTest.requests -eq $before -and $networkTest.gitCalls -eq $calls) 'Cached fallback contacted network again'
    }
    Test-Case 'UTF-8 cache JSON preserves Cyrillic paths while restoring the OEM console encoding' {
        $cyrillic = '"\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u043a\u044d\u0448\u0430"' | ConvertFrom-Json
        $directory = New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -DownloadRoot (Join-Path $testRoot $cyrillic)
        $savedEncoding = [Console]::OutputEncoding
        try {
            [Console]::OutputEncoding = [Text.Encoding]::GetEncoding(437)
            $result = Invoke-SetupCacheTool -Action validate -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha
            Assert-True ($result.reason.Contains($cyrillic) -and [Console]::OutputEncoding.CodePage -eq 437) 'Cache JSON path was corrupted or console encoding was not restored'
            $source = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
            [IO.File]::WriteAllText((ConvertTo-SetupLiteralPath (Join-Path $source 'bin/workstation-setup.js')), '// edit')
            $token = [guid]::NewGuid().ToString('N')
            $staging = Join-Path (Split-Path $directory -Parent) ('.staging-' + $sha + '-' + $token)
            [IO.Directory]::CreateDirectory((ConvertTo-SetupLiteralPath $staging)) | Out-Null
            $downloaded = Get-SetupDownloadedSource -GitPath $gitMock -Commit $sha -Directory $staging -RepoSlug 'safarovmurod/antigravity-workstation'
            Invoke-SetupCacheTool -Action normalize-source -Directory $staging -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -Staging $downloaded | Out-Null
            Invoke-SetupCacheTool -Action seal -Directory $staging -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha | Out-Null
            $promoted = Invoke-SetupCacheTool -Action promote -Directory $directory -Staging $staging -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha
            Assert-True ($promoted.recovered.Contains($cyrillic) -and (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath $promoted.recovered)) -and [Console]::OutputEncoding.CodePage -eq 437) 'Recovered cache path JSON was corrupted under OEM437'
        } finally { [Console]::OutputEncoding = $savedEncoding }
    }
    Test-Case 'long cache paths clean Git metadata and failed staging without the WinPS recursive provider' {
        $root = Join-Path $testRoot (('cache-long-' + ('a' * 90)) + '/' + ('b' * 90))
        $directory = New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -DownloadRoot $root
        Assert-True ($directory.Length -gt 260) 'Long-cache fixture did not exceed MAX_PATH'
        $networkTest.requestMode = 'corrupt'
        $source = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
        Assert-True ((Invoke-SetupCacheTool -Action validate -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha).valid -and -not (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath (Join-Path $source '.git')))) 'Long-path fallback metadata cleanup failed'
        $beforeArchive = $networkTest.fixtureArchive
        $packagePath = Join-Path $fixtureSource 'package.json'
        $beforePackage = [IO.File]::ReadAllText($packagePath)
        try {
            [IO.File]::WriteAllText($packagePath, '{"name":"unexpected","version":"0.0.0"}')
            $badArchive = Join-Path $testRoot 'invalid-identity.zip'
            Compress-Archive -LiteralPath $fixtureSource -DestinationPath $badArchive
            $networkTest.fixtureArchive = $badArchive; $networkTest.requestMode = 'success'
            [IO.File]::WriteAllText((ConvertTo-SetupLiteralPath (Join-Path $source 'bin/workstation-setup.js')), '// preserve existing long source')
            Assert-Failure { Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation' } '*Unexpected cached setup package identity*'
            Assert-True (-not @(Get-ChildItem -LiteralPath (ConvertTo-SetupLiteralPath (Split-Path $directory -Parent)) -Directory -Filter '.staging-*').Count) 'Failed long-path staging was not removed'
            Assert-True ([IO.File]::ReadAllText((ConvertTo-SetupLiteralPath (Join-Path $source 'bin/workstation-setup.js'))) -eq '// preserve existing long source') 'Failed long-path repair replaced existing data'
        } finally {
            [IO.File]::WriteAllText($packagePath, $beforePackage)
            $networkTest.fixtureArchive = $beforeArchive
        }
    }
    Test-Case 'cache lock rejects a second process and recovers after the owner exits' {
        $parent = Split-Path $cacheDirectory -Parent
        $ready = Join-Path $testRoot 'cache-lock-ready'
        $release = Join-Path $testRoot 'cache-lock-release'
        $job = Start-Job -ScriptBlock {
            param($File, $Ready, $Release)
            $handle = [IO.File]::Open($File, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
            try {
                [IO.File]::WriteAllText($Ready, 'ready')
                $deadline = [DateTime]::UtcNow.AddSeconds(180)
                while (-not [IO.File]::Exists($Release) -and [DateTime]::UtcNow -lt $deadline) { [Threading.Thread]::Sleep(100) }
            } finally { $handle.Dispose() }
        } -ArgumentList (Join-Path $parent '.workstation-cache.lock'), $ready, $release
        try {
            $deadline = [DateTime]::UtcNow.AddSeconds(15)
            while (-not (Test-Path $ready) -and [DateTime]::UtcNow -lt $deadline) { [Threading.Thread]::Sleep(100) }
            Assert-True (Test-Path $ready) 'Lock owner did not start'
            Assert-Failure { Enter-SetupCacheLock -Directory $cacheDirectory -TimeoutSeconds 0 } '*Another Workstation setup*'
            if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
                $repair = Join-Path $testRoot 'locked chat repair'; New-Item -ItemType Directory $repair | Out-Null
                @{schema=1;kind='workstation-setup-repair';id=[guid]::NewGuid().ToString();fingerprint=('a' * 64);commit=$sha;sourceRoot=(Join-Path $cacheDirectory 'source');stage='install';prompt='isolated fixture, never send'} | ConvertTo-Json | Set-Content (Join-Path $repair 'request.json')
                $probe = @'
const repair=require(process.argv[2]);
repair.dispatchRepair({commands:{getCommands(){throw new Error('Chat dispatch ran before the bootstrap released FileShare.None');}}},process.argv[3])
.then(result=>{if(result.state!=='waiting-for-installer')throw new Error('Expected shared-cache wait, got '+result.state);})
.catch(error=>{console.error(error.message);process.exitCode=1;});
'@
                $runtime = (Microsoft.PowerShell.Core\Get-Command node -ErrorAction Stop).Source
                $probe | & $runtime - (Join-Path $repo 'extensions/workstation-stability/repair-chat.cjs') $repair
                Assert-True ($LASTEXITCODE -eq 0) 'Native helper did not respect the actual WinPS source-cache lock'
            }

        } finally { [IO.File]::WriteAllText($release, 'release'); Stop-Job $job; Remove-Job $job }
        $lock = Enter-SetupCacheLock -Directory $cacheDirectory -TimeoutSeconds 0
        $lock.Dispose()
    }
    Test-Case 'retention bounds verified owned versions and preserves legacy, edited and unrelated files' {
        $parent = Join-Path $testRoot 'retention cache'; New-Item -ItemType Directory $parent | Out-Null
        foreach ($number in 1..6) {
            $id = ('{0:x40}' -f $number); $directory = Join-Path $parent $id
            New-Item -ItemType Directory -Path $directory | Out-Null
            Copy-Item -LiteralPath $fixtureRepo -Destination (Join-Path $directory 'source') -Recurse
            Remove-Item -LiteralPath (Join-Path $directory 'source/.git') -Recurse -Force
            Invoke-SetupCacheTool -Action seal -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $id | Out-Null
        }
        $edited = Join-Path $parent ('{0:x40}' -f 2)
        [IO.File]::WriteAllText((Join-Path $edited 'source/bin/workstation-setup.js'), '// personal edit')
        $unrelated = Join-Path $parent ('{0:x40}' -f 3)
        [IO.File]::WriteAllText((Join-Path $unrelated 'personal.txt'), 'preserve')
        $legacy = Join-Path $parent '012345678901-legacy'; New-Item -ItemType Directory -Path $legacy | Out-Null
        $unmarked = Join-Path $parent ('{0:x40}' -f 9); New-Item -ItemType Directory -Path $unmarked | Out-Null
        $current = ('{0:x40}' -f 6)
        $result = Invoke-SetupCacheTool -Action prune -Directory $parent -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $current
        Assert-True ($result.removed -eq 2 -and (Test-Path (Join-Path $parent $current))) 'Cache did not retain current plus previous safe snapshot'
        foreach ($preserved in @($edited, $unrelated, $legacy, $unmarked)) { Assert-True (Test-Path $preserved) 'Retention deleted non-owned or edited data' }
    }
    Test-Case 'outstanding chat repair keeps its verified source until Doctor verifies it' {
        $parent = Join-Path $testRoot 'repair protected cache'; New-Item -ItemType Directory $parent | Out-Null
        foreach ($number in 1..4) {
            $id = ('{0:x40}' -f $number); $directory = Join-Path $parent $id
            New-Item -ItemType Directory -Path $directory | Out-Null
            Copy-Item -LiteralPath $fixtureRepo -Destination (Join-Path $directory 'source') -Recurse
            Remove-Item -LiteralPath (Join-Path $directory 'source/.git') -Recurse -Force
            Invoke-SetupCacheTool -Action seal -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $id | Out-Null
        }
        $repair = Join-Path $testRoot 'pending repair queue'; New-Item -ItemType Directory $repair | Out-Null
        $id = [guid]::NewGuid().ToString(); $protected = Join-Path $parent ('{0:x40}' -f 1)
        @{schema=1;kind='workstation-setup-repair';id=$id;sourceRoot=(Join-Path $protected 'source')} | ConvertTo-Json | Set-Content (Join-Path $repair 'request.json')
        @{id=$id;state='dispatched'} | ConvertTo-Json | Set-Content (Join-Path $repair 'status.json')
        $result = Invoke-SetupCacheTool -Action prune -Directory $parent -RepoSlug 'safarovmurod/antigravity-workstation' -Commit ('{0:x40}' -f 4) -RepairDirectory $repair
        Assert-True ($result.removed -eq 1 -and (Test-Path $protected)) 'Pruning deleted the source required to verify a pending repair'
        @{id=$id;state='verified'} | ConvertTo-Json | Set-Content (Join-Path $repair 'status.json')
        $result = Invoke-SetupCacheTool -Action prune -Directory $parent -RepoSlug 'safarovmurod/antigravity-workstation' -Commit ('{0:x40}' -f 4) -RepairDirectory $repair
        Assert-True ($result.removed -eq 1 -and -not (Test-Path $protected)) 'Verified repair did not release the additional source snapshot'
    }
    Test-Case 'background gallery updater retains its exact verified source across cache pruning' {
        $parent = Join-Path $testRoot 'gallery protected cache'; New-Item -ItemType Directory $parent | Out-Null
        foreach ($number in 1..4) {
            $id = ('{0:x40}' -f $number); $directory = Join-Path $parent $id
            New-Item -ItemType Directory -Path $directory | Out-Null
            Copy-Item -LiteralPath $fixtureRepo -Destination (Join-Path $directory 'source') -Recurse
            Remove-Item -LiteralPath (Join-Path $directory 'source/.git') -Recurse -Force
            Invoke-SetupCacheTool -Action seal -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $id | Out-Null
        }
        $config = Join-Path $testRoot 'gallery profile'; New-Item -ItemType Directory $config | Out-Null
        $repair = Join-Path $config 'repair-chat'
        $protected = Join-Path $parent ('{0:x40}' -f 1)
        @{schema=1;galleryUpdates=@{schema=1;sourceRoot=(Join-Path $protected 'source')}} | ConvertTo-Json -Depth 4 |
            Set-Content -LiteralPath (Join-Path $config 'editor-profile.json')
        $result = Invoke-SetupCacheTool -Action prune -Directory $parent -RepoSlug 'safarovmurod/antigravity-workstation' -Commit ('{0:x40}' -f 4) -RepairDirectory $repair
        Assert-True ($result.removed -eq 1 -and (Test-Path $protected)) 'Pruning removed the background updater source'
        @{schema=1} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $config 'editor-profile.json')
        $result = Invoke-SetupCacheTool -Action prune -Directory $parent -RepoSlug 'safarovmurod/antigravity-workstation' -Commit ('{0:x40}' -f 4) -RepairDirectory $repair
        Assert-True ($result.removed -eq 1 -and -not (Test-Path $protected)) 'Removed updater plan retained an obsolete owned source'
    }
    Test-Case 'repair queue invocation preserves UTF-8 paths and requires a saved-task response' {
        $source = Join-Path $testRoot 'repair handoff source'; New-Item -ItemType Directory (Join-Path $source 'scripts') -Force | Out-Null
        $script = Join-Path $source 'scripts/queue-repair-chat.cjs'
        [IO.File]::WriteAllText($script, 'if(process.argv[2]!=="--queue")process.exit(7); console.log(JSON.stringify({queued:true,requestFile:process.argv[3],prompt:"English repair task",scope:process.argv[4]||"full"}));')
        $cyrillic = '"\u0417\u0430\u0434\u0430\u0447\u0430"' | ConvertFrom-Json
        $report = Join-Path $testRoot ($cyrillic + '.json')
        $result = Invoke-SetupRepairQueue -Source $source -Report $report
        Assert-True ($result.queued -and $result.requestFile -eq $report) 'Repair task handoff corrupted its report path'
        $quiet = Invoke-SetupRepairQueue -Source $source -Report $report -CompletionOnly
        Assert-True ($quiet.scope -eq '--completion-only' -and $quiet.prompt -eq 'English repair task') 'Completion repair scope or fallback text lost'
        [IO.File]::WriteAllText($script, 'console.log(JSON.stringify({queued:false}));')
        Assert-Failure { Invoke-SetupRepairQueue -Source $source -Report $report } '*did not confirm*'
    }
    Test-Case 'per-run diagnostics retain three recent runs and preserve unrelated run content' {
        $directory = Join-Path $testRoot 'bounded cache logs'; New-Item -ItemType Directory -Path $directory | Out-Null
        foreach ($number in 1..6) {
            $run = Join-Path $directory ('run-' + ('{0:x32}' -f $number)); New-Item -ItemType Directory -Path $run | Out-Null
            [IO.File]::WriteAllText((Join-Path $run 'setup-install.log'), 'run ' + $number)
            (Get-Item -LiteralPath $run).LastWriteTimeUtc = [DateTime]::UtcNow.AddMinutes($number)
        }
        $personal = Join-Path $directory ('run-' + ('{0:x32}' -f 1))
        [IO.File]::WriteAllText((Join-Path $personal 'personal.txt'), 'preserve')
        Invoke-SetupCacheTool -Action prune-runs -Directory $directory | Out-Null
        Assert-True (@(Get-ChildItem -LiteralPath $directory -Directory).Count -eq 4 -and (Test-Path $personal)) 'Run retention unbounded or deleted unrelated content'
    }
    Test-Case 'Windows runtime call records remain arrays for zero, one and two JSON lines' {
        $harnessTokens = $null; $harnessErrors = $null
        $harness = [Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'tests/test-bootstrap.ps1'), [ref]$harnessTokens, [ref]$harnessErrors)
        Assert-True ($harnessErrors.Count -eq 0) 'Windows runtime harness has syntax errors'
        $assignments = @($harness.FindAll({ param($statement)
            $statement -is [Management.Automation.Language.AssignmentStatementAst] -and $statement.Left.Extent.Text -eq '$calls'
        }, $true))
        Assert-True ($assignments.Count -eq 1) 'Did not find the actual runtime call-record assignment'
        $readCalls = [scriptblock]::Create($assignments[0].Extent.Text)
        $commands = @('quiet-completion', 'doctor')
        foreach ($recordCount in 0..2) {
            $log = Join-Path $testRoot ('runtime-calls-' + $recordCount + '.jsonl')
            if ($recordCount -gt 0) {
                $records = @(for ($index = 0; $index -lt $recordCount; $index++) {
                    @{command=$commands[$index];args=@();source='fixture-entry.js'} | ConvertTo-Json -Compress
                })
                [IO.File]::WriteAllLines($log, [string[]]$records)
            }
            . $readCalls


            Assert-True ($null -ne $calls -and $calls.GetType() -eq [object[]]) ('Runtime records were unwrapped instead of an Object[] for ' + $recordCount + ' JSON lines')
            Assert-True ($calls.Count -eq $recordCount) 'Runtime record count changed'
            for ($index = 0; $index -lt $recordCount; $index++) {
                Assert-True ($calls[$index].command -eq $commands[$index]) 'Runtime call-record command changed'
            }
        }
    }
    Test-Case 'Windows runtime ZIP check and cleanup execute unchanged under legacy native argument quoting' {
        $harnessTokens = $null; $harnessErrors = $null
        $harness = [Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'tests/test-bootstrap.ps1'), [ref]$harnessTokens, [ref]$harnessErrors)
        Assert-True ($harnessErrors.Count -eq 0) 'Windows runtime harness has syntax errors'
        $snippets = @{}
        foreach ($assignment in @($harness.FindAll({ param($statement)
            $statement -is [Management.Automation.Language.AssignmentStatementAst] -and $statement.Left.Extent.Text -in @('$zipCheck', '$cleanup')
        }, $true))) {
            Assert-True ($assignment.Right.Expression -is [Management.Automation.Language.StringConstantExpressionAst]) 'Runtime Node source must remain a literal fixture'
            $snippets[$assignment.Left.Extent.Text] = $assignment.Right.Expression.Value
        }
        $invocations = @($harness.FindAll({ param($statement)
            $statement -is [Management.Automation.Language.PipelineAst] -and $statement.Extent.Text -match '& \$node ' -and $statement.Extent.Text -match '\$(zipCheck|cleanup)'
        }, $true))
        Assert-True ($snippets.Count -eq 2 -and $invocations.Count -eq 2) 'Did not find the actual two Windows runtime filesystem checks'
        $downloadRoot = Join-Path $testRoot ('workstation-bootstrap-test-' + [guid]::NewGuid().ToString('N'))
        $nested = Join-Path $downloadRoot (('long-' + ('a' * 90)) + '/' + ('b' * 90))
        [IO.Directory]::CreateDirectory((ConvertTo-SetupLiteralPath $nested)) | Out-Null
        [IO.File]::WriteAllText((ConvertTo-SetupLiteralPath (Join-Path $nested 'fixture.txt')), 'owned legacy-quoting fixture')
        $resolved = $downloadRoot
        $zipCheck = $snippets['$zipCheck']; $cleanup = $snippets['$cleanup']
        $node = (Microsoft.PowerShell.Core\Get-Command node -ErrorAction Stop).Source
        $previousNativeArguments = $PSNativeCommandArgumentPassing
        try {


            $PSNativeCommandArgumentPassing = 'Legacy'
            foreach ($invocation in $invocations) {
                & ([scriptblock]::Create($invocation.Extent.Text))
                Assert-True ($LASTEXITCODE -eq 0) ('Windows runtime helper failed under Legacy quoting: ' + $invocation.Extent.Text)
            }
        } finally { $PSNativeCommandArgumentPassing = $previousNativeArguments }
        Assert-True (-not (Test-Path -LiteralPath $downloadRoot)) 'Runtime cleanup did not remove its owned long-path fixture'
    }
    Test-Case 'installer failure retains its real cause and exact exit status in bounded redacted diagnostics' {
        $directory = Join-Path $testRoot 'failed install diagnostics'
        New-Item -ItemType Directory -Path $directory | Out-Null
        $child = Join-Path $directory 'failed-child.cjs'
        [IO.File]::WriteAllText($child, @'
console.log('starting installer');
for(let i=0;i<200;i++)console.log('download progress '+i+' '+'.'.repeat(2048));
console.log('Authorization: Bearer private-bearer-value');
console.log('Authorization: Basic cHJpdmF0ZS1jcmVkZW50aWFs');
console.log('GITHUB_TOKEN="private token with spaces"');
console.log('https://private-user:private-password@example.invalid/asset?access_token=private-query-value&ok=yes');
console.log('https://example.invalid/download?X-Amz-Signature=private-signature');
console.log('{"api_key":"private-json-value"}');
console.log('\u041e\u0448\u0438\u0431\u043a\u0430: \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u2717');
console.error('Error: \u041e\u0448\u0438\u0431\u043a\u0430: \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u2717');
console.error('Error: TOKEN=private-reason-value');
console.error('Setup incomplete: Extensions: test.vendor: package installation failed');
process.exitCode=7;
'@)
        $node = (Microsoft.PowerShell.Core\Get-Command node -ErrorAction Stop).Source
        $savedOutputEncoding = [Console]::OutputEncoding
        try {
            [Console]::OutputEncoding = [Text.Encoding]::GetEncoding(437)
            $result = Invoke-SetupLoggedCommand -Executable $node -Arguments @($child) -Label install -Directory $directory -Commit $sha -SetupVersion $expectedSetupVersion 6>$null
            $restoredCodePage = [Console]::OutputEncoding.CodePage
        } finally { [Console]::OutputEncoding = $savedOutputEncoding }
        Assert-True ($restoredCodePage -eq 437) 'Capturing Node output changed the caller console encoding'
        Assert-True ($result.ExitCode -eq 7) 'Original native failure exit was lost'
        Assert-True ($result.Failure -match 'Setup incomplete: Extensions: test.vendor: package installation failed') 'Original failure reason missing from the final exception'
        $summary = Get-Content -LiteralPath $result.FailureFile -Raw -Encoding UTF8 | ConvertFrom-Json
        Assert-True ($summary.exitCode -eq 7 -and $summary.stage -eq 'install' -and $summary.sourceCommit -eq $sha -and $summary.setupVersion -eq $expectedSetupVersion) 'Structured failure lost source or stage identity'
        Assert-True ($summary.outputLog -eq $result.LogFile -and $summary.failure -eq $result.Failure) 'Summary did not point to retained output'
        $output = Get-Content -LiteralPath $result.LogFile -Raw -Encoding UTF8
        $expectedUnicode = '"\u041e\u0448\u0438\u0431\u043a\u0430: \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u2717"' | ConvertFrom-Json
        Assert-True ($output.Contains($expectedUnicode) -and $summary.failure.Contains($expectedUnicode)) 'OEM console encoding corrupted Cyrillic or Unicode failure output'
        Assert-True ($output -match 'Earlier output omitted' -and $output -match 'Setup incomplete: Extensions: test.vendor: package installation failed') 'Bounded log lost the final failure'
        Assert-True ((Get-Item -LiteralPath $result.LogFile).Length -lt (256 * 1024 + 128)) 'Output log grew beyond its limit'
        Assert-True (($output + $summary.failure) -notmatch 'private-bearer-value|cHJpdmF0ZS1jcmVkZW50aWFs|private token with spaces|private-user|private-password|private-query-value|private-signature|private-json-value|private-reason-value') 'Common credentials were retained in diagnostics'
        Assert-True ($output -match '\[REDACTED\]') 'Credential redaction did not run'
    }
    Test-Case 'successful native stderr remains informational and does not create a false failure report' {
        $directory = Join-Path $testRoot 'successful install diagnostics'
        New-Item -ItemType Directory -Path $directory | Out-Null
        $child = Join-Path $directory 'successful-child.cjs'
        [IO.File]::WriteAllText($child, 'console.error("npm warn informational stderr");console.log("Setup files applied");')
        $node = (Microsoft.PowerShell.Core\Get-Command node -ErrorAction Stop).Source
        $result = Invoke-SetupLoggedCommand -Executable $node -Arguments @($child) -Label install -Directory $directory -Commit $sha -SetupVersion $expectedSetupVersion 6>$null
        Assert-True ($result.ExitCode -eq 0 -and $result.Failure -eq '' -and -not (Test-Path -LiteralPath $result.FailureFile)) 'Native stderr was mistaken for failed installation'
        $output = Get-Content -LiteralPath $result.LogFile -Raw -Encoding UTF8
        Assert-True ($output -match 'npm warn informational stderr' -and $output -match 'Setup files applied') 'Successful native stdout/stderr was not retained'
    }
    $readme = Get-Content -LiteralPath (Join-Path $repo 'README.md') -Raw -Encoding UTF8
    $launcherText = @([regex]::Matches($readme, '(?s)```powershell\s*\r?\n(.*?)\r?\n```'))[1].Groups[1].Value
    $launcher = [scriptblock]::Create($launcherText)
    Test-Case 'README has exactly three commands and clean install is explicit' {
        $blocks = @([regex]::Matches($readme, '(?s)```powershell\s*\r?\n(.*?)\r?\n```'))
        Assert-True ($blocks.Count -eq 3) 'README must contain clean install, ordinary install/update and quiet-only commands'
        Assert-True ($blocks[0].Groups[1].Value -match '-CleanExtensions' -and $blocks[0].Groups[1].Value -notmatch '-QuietCompletion') 'Command 1 must be full clean setup'
        Assert-True ($blocks[1].Groups[1].Value -notmatch '-CleanExtensions|-QuietCompletion') 'Command 2 must preserve unrelated extensions'
        Assert-True ($blocks[2].Groups[1].Value -match '-QuietCompletion' -and $blocks[2].Groups[1].Value -notmatch '-CleanExtensions') 'Command 3 must only disable AI completion'
        $cleanText = @($blocks | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -match '-CleanExtensions' })
        Assert-True ($cleanText.Count -eq 1) 'Exactly one explicit clean command is required'
        $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'launcher'; $networkTest.expectedClean = $true
        & ([scriptblock]::Create($cleanText[0]))
        Assert-True ($networkTest.launches -eq 1 -and -not (Test-Path $networkTest.launchedFile)) 'Clean launcher execution/cleanup broken'
    }
    Test-Case 'README quiet launcher downloads fresh source with the completion-only switch' {
        $quietText = [regex]::Matches($readme, '(?s)```powershell\s*\r?\n(.*?)\r?\n```') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -match '-QuietCompletion' }
        Assert-True (@($quietText).Count -eq 1) 'Exactly one quiet completion bootstrap command is required'
        $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'launcher'; $networkTest.expectedQuiet = $true
        & ([scriptblock]::Create($quietText))
        Assert-True ($networkTest.launches -eq 1 -and -not (Test-Path $networkTest.launchedFile)) 'Quiet launcher cleanup broken'
    }
    Test-Case 'README launcher downloads with timeout and cleans its script' {
        $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'launcher'
        & $launcher
        Assert-True ($networkTest.launches -eq 1 -and -not (Test-Path $networkTest.launchedFile)) 'README launch/cleanup broken'
    }
    Test-Case 'README launcher never runs a failed download' {
        $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'fail'
        Assert-Failure { & $launcher } '*simulated operation timed out*'
        Assert-True ($networkTest.launches -eq 0 -and $networkTest.requests -eq 3) 'Failed bootstrap executed'
    }
    Test-Case 'all three README commands automatically copy their own scope when bootstrap download fails' {
        $blocks = @([regex]::Matches($readme, '(?s)```powershell\s*\r?\n(.*?)\r?\n```'))
        for ($index = 0; $index -lt 3; $index++) {
            $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'fail'; $networkTest.clipboardText = $null
            $block = [scriptblock]::Create($blocks[$index].Groups[1].Value)
            Assert-Failure { & $block } '*simulated operation timed out*'
            Assert-True ($networkTest.clipboardText -match ('Command ' + ($index + 1) + ':')) 'Bootstrap fallback lost the selected command scope'
            if ($index -eq 2) { Assert-True ($networkTest.clipboardText -match 'ONLY disable AI completion') 'Quiet fallback expanded to full setup' }
        }
        Assert-True ($networkTest.launches -eq 0) 'An unavailable bootstrap was executed'
    }
    Test-Case 'README download and clipboard failure automatically displays the recovery task' {
        $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'fail'; $networkTest.clipboardMode = 'fail'
        $output = & { try { & $launcher } catch { } } 6>&1 | Out-String
        Assert-True ($networkTest.copyAttempts -eq 3 -and $output -match 'Recover the Antigravity Workstation bootstrap download' -and $output -match 'Command 2:') 'README did not show its recovery task when the clipboard failed'
    }
    Test-Case 'README curl launcher recovers after timeout and cleans its script' {
        $networkTest.expectedTimeout = 120; $networkTest.useCurl = $true; $networkTest.requestMode = 'retry'
        & $launcher
        Assert-True ($networkTest.requests -eq 2 -and $networkTest.launches -eq 1 -and -not (Test-Path $networkTest.launchedFile)) 'README curl retry/cleanup broken'
    }
    Test-Case 'README curl launcher never runs a failed download' {
        $networkTest.expectedTimeout = 120; $networkTest.useCurl = $true; $networkTest.requestMode = 'fail'
        Assert-Failure { & $launcher } '*Download failed: curl 28*'
        Assert-True ($networkTest.launches -eq 0 -and $networkTest.requests -eq 3) 'Failed curl bootstrap executed'
    }
    Test-Case 'README preserves pending-repair exit 2 without claiming successful installation' {
        $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'launcher'; $networkTest.launchStatus = 2
        & $launcher 3>$null
        Assert-True ($LASTEXITCODE -eq 2 -and $networkTest.launches -eq 1 -and -not (Test-Path $networkTest.launchedFile)) 'Pending repair became success or lost bootstrap cleanup'
    }
    Test-Case 'README clean command preserves paused exit 3 without throwing or claiming installation' {
        $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'launcher'; $networkTest.launchStatus = 3; $networkTest.expectedClean = $true
        $cleanText = [regex]::Matches($readme, '(?s)```powershell\s*\r?\n(.*?)\r?\n```') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -match '-CleanExtensions' }
        $output = & { & ([scriptblock]::Create($cleanText)) } 3>&1 | Out-String
        Assert-True ($LASTEXITCODE -eq 3 -and $networkTest.launches -eq 1 -and -not (Test-Path $networkTest.launchedFile)) 'Paused clean mode was converted to success/failure or lost script cleanup'
        Assert-True ($output -match 'Clean setup was NOT installed' -and $networkTest.copyAttempts -eq 0) 'A paused prerequisite was claimed installed or treated as a repair failure'
    }
    Test-Case 'README ordinary update does not hide an unexpected exit 3 as a clean pause' {
        $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'launcher'; $networkTest.launchStatus = 3
        Assert-Failure { & $launcher } '*Setup stopped (exit 3)*'
        Assert-True (-not $networkTest.expectedClean) 'Ordinary update inherited the clean-mode switch'
    }
    Test-Case 'README launcher propagates installer failure and cleans its script' {
        $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'launcher'; $networkTest.launchStatus = 7
        Assert-Failure { & $launcher } '*Setup stopped (exit 7)*'
        Assert-True ($networkTest.launches -eq 1 -and -not (Test-Path $networkTest.launchedFile)) 'Failed setup launcher cleanup broken'
    }
    Test-Case 'all three README commands retain the real failure stage and cause after native stderr' {
        $blocks = @([regex]::Matches($readme, '(?s)```powershell\s*\r?\n(.*?)\r?\n```'))
        for ($index = 0; $index -lt 3; $index++) {
            $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'launcher'; $networkTest.launchStatus = 7
            $networkTest.expectedClean = $index -eq 0; $networkTest.expectedQuiet = $index -eq 2
            $networkTest.resultMode = 'valid'; $networkTest.nativeError = $true
            $reason = $null
            try { & ([scriptblock]::Create($blocks[$index].Groups[1].Value)) 2>$null }
            catch { $reason = $_.Exception.Message }
            Assert-True ($reason -match 'Setup stopped \(exit 7\)' -and $reason -match 'Stage: Install profile' -and $reason -match 'fixture extension failed: unavailable compatible package' -and $reason -match 'Repair text:') 'The final launcher error lost the actual stage/cause or aborted on stderr'
            Assert-True (-not (Test-Path $networkTest.launchedFile) -and -not (Test-Path $networkTest.launchedResultFile)) 'Failed launcher leaked a temporary script or result'
            Assert-True ($LASTEXITCODE -eq 7) 'Final launcher error lost the native exit status'
        }
    }
    Test-Case 'README rejects missing, corrupt or mismatched summaries without converting failure to success' {
        foreach ($mode in @('none', 'corrupt', 'mismatch')) {
            $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'launcher'; $networkTest.launchStatus = 7; $networkTest.resultMode = $mode
            Assert-Failure { & $launcher } '*Setup stopped (exit 7). No diagnostic summary was returned*'
            Assert-True ($LASTEXITCODE -eq 7 -and -not (Test-Path $networkTest.launchedResultFile)) 'Missing/corrupt result hid failure or leaked a file'
        }
    }
    Test-Case 'IWR refuses a truncated response despite a successful HTTP status and removes its partial files' {
        $networkTest.requestMode = 'lengthMismatch'
        $file = Join-Path $testRoot 'partial-length.zip'
        Assert-Failure { Invoke-SetupDownload -Uri 'https://example.invalid/fixture' -OutFile $file -Attempts 2 } '*Incomplete download*'
        Assert-True ($networkTest.requests -eq 2) 'Truncated response was not retried'
        Assert-True (-not (Test-Path -LiteralPath $file)) 'Truncated output was retained'
    }
    Test-Case 'all three README launchers refuse truncated IWR bootstrap files before execution' {
        $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'lengthMismatch'
        foreach ($block in [regex]::Matches($readme, '(?s)```powershell\s*\r?\n(.*?)\r?\n```')) {
            Assert-Failure { & ([scriptblock]::Create($block.Groups[1].Value)) } '*Incomplete bootstrap download*'
        }
        Assert-True ($networkTest.requests -eq 9 -and $networkTest.launches -eq 0) 'An incomplete bootstrap was executed or retries were skipped'
    }
    Write-Host "PASS: $($networkTest.passed) portable bootstrap network scenarios; no public network used."
} catch {
    if ($env:GITHUB_ACTIONS -eq 'true') {
        $detail = 'Bootstrap network case [' + $networkTest.currentCase + ']: ' + $_.Exception.Message + "`n" + $_.ScriptStackTrace
        $detail = ConvertTo-SetupSafeOutput $detail
        if ($detail.Length -gt 3000) { $detail = $detail.Substring(0, 3000) }
        Write-Host ('::error::' + $detail.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A'))
    }
    throw
} finally {
    $env:TEMP = $originalTemp
    $resolvedCleanup = [IO.Path]::GetFullPath($testRoot)
    if (-not $resolvedCleanup.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedCleanup -Leaf) -notlike 'workstation-bootstrap-network-*') { throw 'Unsafe test cleanup' }
    if (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath $resolvedCleanup)) {
        $cleanup = 'const fs=require("node:fs"),path=require("node:path");const target=path.resolve(process.argv[2]);if(!/^workstation-bootstrap-network-[a-f0-9]{32}$/.test(path.basename(target)))throw new Error("Unsafe test cleanup");fs.rmSync(target,{recursive:true,force:true,maxRetries:3,retryDelay:100});'
        $nodeName = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { 'node.exe' } else { 'node' }
        $runtime = Microsoft.PowerShell.Core\Get-Command $nodeName -ErrorAction Stop
        $cleanup | & $runtime.Source - $resolvedCleanup
        if ($LASTEXITCODE -ne 0) { throw 'Could not clean bootstrap network test directory' }
    }
}
