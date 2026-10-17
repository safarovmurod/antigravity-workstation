param([string]$Name = '', [switch]$RulesOnly, [switch]$QuietCompletion, [switch]$DryRun,
    [ValidateSet('full','lite')][string]$ExtensionProfile = 'full',
    [ValidatePattern('^\d+\.\d+\.\d+$')][string]$MinimumVersion = '2.2.0',
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')][string]$RepoSlug = 'safarovmurod/antigravity-workstation')
# Windows PowerShell 5.1 compatible. Run from the Antigravity PowerShell terminal.
$ErrorActionPreference = 'Stop'
# Kept in this single file so the README can bootstrap without downloading helpers.
function Invoke-SetupDownload {
    param([string]$Uri, [string]$OutFile, [int]$TimeoutSec = 600, [int]$Attempts = 3)
    $ProgressPreference = 'SilentlyContinue' # WinPS 5.1 web progress can make large ZIPs very slow.
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            Write-Host "  Download $attempt/$Attempts (timeout ${TimeoutSec}s): $Uri"
            if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force }
            if ($curl) {
                & $curl.Source --fail --location --show-error --connect-timeout 20 --max-time $TimeoutSec --output $OutFile $Uri
                if ($LASTEXITCODE -ne 0) { throw "curl exited with code $LASTEXITCODE" }
            } else {
                Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $OutFile -TimeoutSec $TimeoutSec -ErrorAction Stop
            }
            if (-not (Test-Path -LiteralPath $OutFile -PathType Leaf) -or (Get-Item -LiteralPath $OutFile).Length -eq 0) { throw 'Download is empty' }
            return
        } catch {
            $reason = $_.Exception.Message
            if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force }
            if ($attempt -eq $Attempts) { throw "Download failed after $Attempts attempts: $Uri. Last error: $reason" }
            Write-Warning "Download attempt $attempt failed: $reason. Retrying..."
            Start-Sleep -Seconds (2 * $attempt)
        }
    }
}
function Invoke-SetupGit {
    param([string]$GitPath, [string[]]$Arguments, [string]$Label, [int]$Attempts = 3)
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        $savedPreference = $ErrorActionPreference
        try {
            # Capture native stderr without WinPS 5.1 turning progress into terminating errors.
            $ErrorActionPreference = 'Continue'
            $output = & $GitPath -c http.lowSpeedLimit=1 -c http.lowSpeedTime=60 @Arguments 2>&1
            $status = $LASTEXITCODE
        } finally { $ErrorActionPreference = $savedPreference }
        if ($status -eq 0) { return $output }
        $reason = (@($output) | ForEach-Object { "$_" }) -join "`n"
        if ($attempt -eq $Attempts) { throw "$Label failed after $Attempts attempts (exit $status): $reason" }
        Write-Warning "$Label failed ($attempt/$Attempts): $reason. Retrying..."
        Start-Sleep -Seconds (2 * $attempt)
    }
}
function Get-SetupSource {
    param([string]$GitPath, [string]$Commit, [string]$Directory, [string]$RepoSlug)
    if ($Commit -notmatch '^[a-f0-9]{40}$') { throw 'Invalid setup commit' }
    $archive = Join-Path $Directory 'setup.zip'
    $source = Join-Path $Directory ('mansur-setup-' + $Commit)
    try {
        Invoke-SetupDownload -Uri ('https://codeload.github.com/' + $RepoSlug + '/zip/' + $Commit) -OutFile $archive
        Expand-Archive -LiteralPath $archive -DestinationPath $Directory -ErrorAction Stop | Out-Null
        if (-not (Test-Path -LiteralPath (Join-Path $source 'bin/mansur-setup.js') -PathType Leaf)) { throw 'Downloaded archive is incomplete' }
        return $source
    } catch {
        Write-Warning ('ZIP download/extraction failed: ' + $_.Exception.Message)
        Write-Host '  Falling back to Git over github.com (same commit; no codeload server)...'
    }
    # Separate destination: never mix a partially extracted ZIP with the Git snapshot.
    $source = Join-Path $Directory 'git-source'
    Invoke-SetupGit -GitPath $GitPath -Arguments @('init', '--quiet', $source) -Label 'Initialize fallback' | Out-Null
    Invoke-SetupGit -GitPath $GitPath -Arguments @('-C', $source, 'fetch', '--quiet', '--depth=1', '--no-tags', ('https://github.com/' + $RepoSlug + '.git'), $Commit) -Label 'Download setup via Git' | Out-Null
    $actual = Invoke-SetupGit -GitPath $GitPath -Arguments @('-C', $source, 'rev-parse', 'FETCH_HEAD') -Label 'Verify fallback commit'
    if (@($actual).Count -ne 1 -or "$actual".Trim() -cne $Commit) { throw 'Git fallback commit mismatch; no setup files changed.' }
    Invoke-SetupGit -GitPath $GitPath -Arguments @('-C', $source, 'checkout', '--quiet', '--detach', $Commit) -Label 'Check out setup snapshot' | Out-Null
    return $source
}
function Assert-SetupPackage {
    param([string]$Source, [string]$MinimumVersion)
    $file = Join-Path $Source 'package.json'
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Downloaded package.json is missing; no setup files changed.' }
    $package = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($package.name -ne 'mansur-antigravity-setup') { throw 'Unexpected downloaded package identity; no setup files changed.' }
    if ($package.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Downloaded package has an invalid release version; no setup files changed.' }
    if ([version]$package.version -lt [version]$MinimumVersion) {
        throw "Downloaded setup $($package.version) is older than required $MinimumVersion. Refusing stale setup; no setup files changed."
    }
    return $package
}
function Get-SetupArguments {
    param([string]$Entry, [switch]$RulesOnly, [switch]$QuietCompletion, [string]$Name = '',
        [ValidateSet('full','lite')][string]$ExtensionProfile = 'full')
    if ($RulesOnly -and $QuietCompletion) { throw 'Choose either RulesOnly or QuietCompletion' }
    if (($RulesOnly -or $QuietCompletion) -and $ExtensionProfile -ne 'full') { throw 'ExtensionProfile is only supported for full setup' }
    if ($QuietCompletion) { return @($Entry, 'quiet-completion') }
    $arguments = @($Entry, 'install')
    if ($RulesOnly) { $arguments += '--rules-only' } else { $arguments += '--auto-approve' }
    if ($ExtensionProfile -ne 'full') { $arguments += @('--extension-profile', $ExtensionProfile) }
    if ($Name) { $arguments += @('--name', $Name) }
    return $arguments
}
function Refresh-SetupPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
        [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $script:originalPath
}
function Install-Prerequisite {
    param([string]$Id)
    if ($DryRun) { Write-Host "  [DRY-RUN] Would install $Id using winget; no changes made."; return }
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) { throw 'winget is unavailable. Install Node.js >=24 and Git for Windows, then use the npx command in README.' }
    Write-Host "  Installing $Id (winget download/installation output follows)..."
    & $winget.Source install --id $Id --exact --source winget --silent --accept-source-agreements --accept-package-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw "winget could not install $Id (exit $LASTEXITCODE). Resolve the Windows installer error, then rerun bootstrap." }
    Refresh-SetupPath
}
$setupTemp = $null
$stage = 'Check Windows prerequisites'
try {
    if ($RulesOnly -and $QuietCompletion) { throw 'Choose either RulesOnly or QuietCompletion' }
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Bootstrap requires Windows 10/11' }
    $script:originalPath = $env:Path
    Refresh-SetupPath
    Write-Host '[1/4] Checking Node.js >=24 and npm >=10...'
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $needsNode = -not $node
    if ($node) {
        $nodeVersion = & $node.Source --version
        if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.') { throw 'Could not read Node.js version' }
        $needsNode = [int]$Matches[1] -lt 24
    }
    $existingNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $existingNpm) { $needsNode = $true }
    elseif (-not $needsNode) {
        $npmVersion = & $existingNpm.Source --version
        if ($LASTEXITCODE -ne 0 -or $npmVersion -notmatch '^(\d+)\.' -or [int]$Matches[1] -lt 10) { $needsNode = $true }
    }
    if ($needsNode) { Install-Prerequisite -Id 'OpenJS.NodeJS.LTS' }

    Write-Host '[2/4] Checking Git for GitHub package download...'
    if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { Install-Prerequisite -Id 'Git.Git' }
    if ($DryRun) {
        Write-Host "[3/4] [DRY-RUN] Would resolve current main, require setup >=$MinimumVersion and run the selected setup mode."
        Write-Host '[4/4] [DRY-RUN] Full mode runs Doctor; scoped modes report their own results. No files changed.'
        exit 0
    }
    $node = Get-Command node.exe -ErrorAction Stop
    $version = & $node.Source --version
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw 'Node.js >=24 is still required. Check PATH and restart the terminal.' }
    $npm = Get-Command npm.cmd -ErrorAction Stop
    $npmVersion = & $npm.Source --version
    if ($LASTEXITCODE -ne 0 -or $npmVersion -notmatch '^(\d+)\.' -or [int]$Matches[1] -lt 10) { throw 'npm >=10 is required' }
    $git = Get-Command git.exe -ErrorAction Stop
    & $git.Source --version
    if ($LASTEXITCODE -ne 0) { throw 'Git is installed but does not run' }
    # Resolve main once; installation and Doctor must use the same immutable source.
    $stage = 'Resolve latest main commit'
    Write-Host '  Resolving latest main commit...'
    $remote = Invoke-SetupGit -GitPath $git.Source -Arguments @('ls-remote', ('https://github.com/' + $RepoSlug + '.git'), 'refs/heads/main') -Label $stage
    if (@($remote).Count -ne 1 -or $remote -notmatch '^([a-f0-9]{40})\s+refs/heads/main$') { throw 'Cannot resolve the latest setup commit; no setup files changed.' }
    $commit = $Matches[1]
    $setupTemp = Join-Path ([System.IO.Path]::GetTempPath()) ('mansur-setup-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $setupTemp -ErrorAction Stop | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $stage = 'Download current setup snapshot'
    Write-Host ('[3/4] Downloading current setup commit ' + $commit + '...')
    $source = Get-SetupSource -GitPath $git.Source -Commit $commit -Directory $setupTemp -RepoSlug $RepoSlug
    $entry = Join-Path $source 'bin\mansur-setup.js'
    $packagePath = Join-Path $source 'package.json'
    if (-not (Test-Path -LiteralPath $entry -PathType Leaf) -or -not (Test-Path -LiteralPath $packagePath -PathType Leaf)) { throw 'Downloaded archive is incomplete; no setup files changed.' }
    $package = Assert-SetupPackage -Source $source -MinimumVersion $MinimumVersion
    Write-Host ('  Package ' + $package.version + '; source ' + $commit)
    $setupArgs = Get-SetupArguments -Entry $entry -RulesOnly:$RulesOnly -QuietCompletion:$QuietCompletion -Name $Name -ExtensionProfile $ExtensionProfile
    $stage = 'Install profile'
    & $node.Source @setupArgs
    if ($LASTEXITCODE -ne 0) { throw "Setup returned exit $LASTEXITCODE; read the failed stage above. Doctor is not reported as passed." }
    if ($QuietCompletion) {
        Write-Host '[4/4] AI completion settings saved or queued. Read the native result/status above; chat approvals were preserved.'
    } elseif ($RulesOnly) {
        Write-Host '[4/4] Rules-only install completed; full IDE Doctor is not applicable to this scoped mode.'
    } else {
        Write-Host '[4/4] Checking installed setup with Doctor...'
        $stage = 'Doctor'
        & $node.Source $entry doctor
        if ($LASTEXITCODE -ne 0) { throw "Doctor found failures (exit $LASTEXITCODE); read its report above." }
    }
    if ($QuietCompletion) {
        Write-Host 'Save work, fully close every Antigravity window normally, then reopen the IDE. The background worker applies native AI Tab OFF after shutdown.'
    } else {
        Write-Host 'Setup stages complete. Save work, fully close every Antigravity window and reopen the IDE. Russian display language requires a full restart; Reload Window is insufficient.'
    }
    exit 0
} catch {
    Write-Error ("Mansur Setup stage '$stage': " + $_.Exception.Message) -ErrorAction Continue
    exit 1
} finally {
    if ($setupTemp -and (Test-Path -LiteralPath $setupTemp)) {
        # Remove only the unique temporary directory created by this invocation.
        $resolvedTemp = [System.IO.Path]::GetFullPath($setupTemp)
        $tempParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if ($resolvedTemp.StartsWith($tempParent, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedTemp -Leaf) -match '^mansur-setup-[a-f0-9]{32}$') {
            Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
