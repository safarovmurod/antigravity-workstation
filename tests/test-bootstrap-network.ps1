# Portable tests of the actual bootstrap helpers and README launcher; no public network.
# Runs in PowerShell 7 on Linux and Windows PowerShell 5.1 in Windows CI.
$ErrorActionPreference = 'Stop'
$networkTest = @{}
$repo = Split-Path $PSScriptRoot -Parent
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
function Start-Sleep { param([int]$Seconds) } # Retry timing is not the subject of these offline tests.
function Get-Command {
    param([string]$Name, [object]$ErrorAction)
    if ($Name -eq 'curl.exe') {
        if ($networkTest.useCurl) { return [pscustomobject]@{Source=(Join-Path $testRoot 'curl mock.ps1')} }
        return $null
    }
    return Microsoft.PowerShell.Core\Get-Command $Name -ErrorAction Stop
}
function Invoke-WebRequest {
    param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile, [int]$TimeoutSec, [object]$ErrorAction)
    $networkTest.requests++
    Assert-True ($TimeoutSec -eq $networkTest.expectedTimeout) 'Explicit timeout missing'
    Assert-True ($ProgressPreference -eq 'SilentlyContinue') 'Slow WinPS web progress was not disabled'
    Assert-True ($UseBasicParsing -and "$ErrorAction" -eq 'Stop') 'Unsafe web request contract'
    if ($TimeoutSec -eq 120) { Assert-True ($Uri -match '/main/scripts/bootstrap\.ps1\?t=') 'README must fetch current main without stale cache' }
    if ($Uri -like 'https://codeload.github.com/*') { Assert-True ($Uri -eq ('https://codeload.github.com/safarovmurod/antigravity-workstation/zip/' + $sha)) 'ZIP must use the resolved immutable commit' }
    if ($networkTest.requestMode -eq 'empty') { [IO.File]::WriteAllText($OutFile, ''); return }
    if ($networkTest.requestMode -eq 'fail' -or ($networkTest.requestMode -eq 'retry' -and $networkTest.requests -eq 1)) {
        [IO.File]::WriteAllText($OutFile, 'partial download')
        throw 'simulated operation timed out'
    }
    if ($networkTest.requestMode -eq 'corrupt') { [IO.File]::WriteAllText($OutFile, 'not a ZIP'); return }
    if ($networkTest.requestMode -eq 'launcher') { [IO.File]::WriteAllText($OutFile, '# bootstrap fixture'); return }
    Copy-Item -LiteralPath $networkTest.fixtureArchive -Destination $OutFile
}
function powershell.exe {
    $networkTest.launches++
    $fileIndex = [Array]::IndexOf($args, '-File')
    Assert-True ($fileIndex -ge 0 -and (Test-Path -LiteralPath $args[$fileIndex + 1])) 'Launcher did not pass an existing script'
    $minimumIndex = [Array]::IndexOf($args, '-MinimumVersion')
    Assert-True ($minimumIndex -ge 0 -and $args[$minimumIndex + 1] -eq '3.0.0') 'README must reject setup versions older than 3.0.0'
    Assert-True (($args -contains '-QuietCompletion') -eq $networkTest.expectedQuiet) 'README completion scope missing or applied to full setup'
    Assert-True (($args -contains '-CleanExtensions') -eq $networkTest.expectedClean) 'README clean mode missing or applied to the ordinary update'
    $networkTest.launchedFile = $args[$fileIndex + 1]
    $global:LASTEXITCODE = $networkTest.launchStatus
}
function Test-Case($Label, $Action) {
    $networkTest.requests = 0; $networkTest.useCurl = $false; $networkTest.expectedTimeout = 600
    $networkTest.requestMode = 'success'; $networkTest.launches = 0; $networkTest.launchStatus = 0
    $networkTest.expectedQuiet = $false
    $networkTest.expectedClean = $false
    & $Action
    $networkTest.passed++
    Write-Host "PASS: $Label"
}
$originalTemp = $env:TEMP
try {
    New-Item -ItemType Directory -Path $testRoot | Out-Null
    $env:TEMP = $testRoot
    $git = (Microsoft.PowerShell.Core\Get-Command git -ErrorAction Stop).Source
    $fixtureRepo = Join-Path $testRoot 'local Git source with spaces'
    New-Item -ItemType Directory -Path (Join-Path $fixtureRepo 'bin') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $fixtureRepo 'bin/workstation-setup.js'), '// fixture entry')
    [IO.File]::WriteAllText((Join-Path $fixtureRepo 'package.json'), '{"name":"antigravity-workstation-setup","version":"0.0.0-test"}')
    & $git init --quiet $fixtureRepo
    & $git -C $fixtureRepo add .
    & $git -C $fixtureRepo -c user.name=Test -c user.email=test@example.invalid commit --quiet -m fixture
    if ($LASTEXITCODE -ne 0) { throw 'Could not create local Git fixture' }
    $sha = (& $git -C $fixtureRepo rev-parse HEAD).Trim()
    $fixtureSource = Join-Path $testRoot ('antigravity-workstation-' + $sha)
    New-Item -ItemType Directory -Path $fixtureSource | Out-Null
    Copy-Item -LiteralPath (Join-Path $fixtureRepo 'bin') -Destination $fixtureSource -Recurse
    Copy-Item -LiteralPath (Join-Path $fixtureRepo 'package.json') -Destination $fixtureSource
    $networkTest.fixtureArchive = Join-Path $testRoot 'fixture.zip'
    Compress-Archive -LiteralPath $fixtureSource -DestinationPath $networkTest.fixtureArchive
    $gitMock = Join-Path $testRoot 'git mock.ps1'
    # Only substitute the network URL; run real Git init/fetch/verify/checkout on a real local repository.
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
    $networkTest.passed = 0
    Test-Case 'source storage prefers the first writable drive and never reuses an earlier snapshot' {
        $preferred = Join-Path $testRoot 'preferred drive with spaces'
        $fallback = Join-Path $testRoot 'fallback user storage'
        $first = New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -Candidates @($preferred, $fallback)
        $second = New-SetupWorkspace -RepoSlug 'safarovmurod/antigravity-workstation' -Commit $sha -Candidates @($preferred, $fallback)
        Assert-True ($first.StartsWith($preferred) -and $second.StartsWith($preferred) -and $first -ne $second) 'Preferred drive or fresh source directory not used'
        Assert-True ((Test-Path -LiteralPath $first -PathType Container) -and -not (Test-Path -LiteralPath (Join-Path $first '.write-test'))) 'Write probe not cleaned'
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
        $source = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
        Assert-True ((Test-Path (Join-Path $source 'bin/workstation-setup.js')) -and $networkTest.gitCalls -eq 0) 'ZIP success broken'
    }
    foreach ($mode in @('success', 'corrupt')) {
        Test-Case "long Windows paths support ZIP and exact Git fallback: $mode" {
            $networkTest.requestMode = $mode; $networkTest.gitCalls = 0
            $directory = Join-Path $testRoot (('long-' + ('a' * 90)) + '/' + ('b' * 90) + '/' + ('c' * 90))
            [IO.Directory]::CreateDirectory((ConvertTo-SetupLiteralPath $directory)) | Out-Null
            $source = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
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
            $source = Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation'
            Assert-True ((Test-Path (Join-Path $source 'bin/workstation-setup.js')) -and $source -eq (Join-Path $directory 'git-source')) 'Git fallback failed'
            Assert-True ((& $git -C $source rev-parse HEAD).Trim() -eq $sha) 'Fallback selected a different commit'
            Assert-True ($networkTest.gitCalls -eq 4) 'Unexpected fallback operations'
        }
    }
    Test-Case 'Git mismatch stops before checkout or installation' {
        $networkTest.requestMode = 'fail'; $networkTest.gitMode = 'mismatch'; $networkTest.gitCalls = 0
        $directory = Join-Path $testRoot 'mismatch'; New-Item -ItemType Directory $directory | Out-Null
        Assert-Failure { Get-SetupSource -GitPath $gitMock -Commit $sha -Directory $directory -RepoSlug 'safarovmurod/antigravity-workstation' } '*commit mismatch*'
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
    $readme = Get-Content -LiteralPath (Join-Path $repo 'README.md') -Raw -Encoding UTF8
    $launcherText = [regex]::Match($readme, '(?s)```powershell\s*\r?\n(.*?)\r?\n```').Groups[1].Value
    $launcher = [scriptblock]::Create($launcherText)
    Test-Case 'README has exactly three commands and clean install is explicit' {
        $blocks = @([regex]::Matches($readme, '(?s)```powershell\s*\r?\n(.*?)\r?\n```'))
        Assert-True ($blocks.Count -eq 3) 'README must contain ordinary install/update, clean install and quiet-only commands'
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
    Test-Case 'README launcher propagates installer failure and cleans its script' {
        $networkTest.expectedTimeout = 120; $networkTest.requestMode = 'launcher'; $networkTest.launchStatus = 7
        Assert-Failure { & $launcher } '*Installation failed; read the error above*'
        Assert-True ($networkTest.launches -eq 1 -and -not (Test-Path $networkTest.launchedFile)) 'Failed setup launcher cleanup broken'
    }
    Write-Host "PASS: $($networkTest.passed) portable bootstrap network scenarios; no public network used."
} finally {
    $env:TEMP = $originalTemp
    $resolvedCleanup = [IO.Path]::GetFullPath($testRoot)
    if (-not $resolvedCleanup.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedCleanup -Leaf) -notlike 'workstation-bootstrap-network-*') { throw 'Unsafe test cleanup' }
    if (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath $resolvedCleanup)) { Remove-Item -LiteralPath (ConvertTo-SetupLiteralPath $resolvedCleanup) -Recurse -Force }
}
