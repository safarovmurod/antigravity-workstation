param([string]$Name = '', [switch]$RulesOnly, [switch]$QuietCompletion, [switch]$CleanExtensions, [switch]$DryRun,
    [string]$DownloadRoot = '',
    [ValidateSet('full','lite')][string]$ExtensionProfile = 'full',
    [ValidatePattern('^\d+\.\d+\.\d+$')][string]$MinimumVersion = '3.0.4',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$')][string]$RepoSlug = 'safarovmurod/antigravity-workstation')
# Windows PowerShell 5.1 compatible. Run from the Antigravity PowerShell terminal.
$ErrorActionPreference = 'Stop'
# Kept in this single file so the README can bootstrap without downloading helpers.
function ConvertTo-SetupLiteralPath {
    param([string]$Path)
    # WinPS 5.1's filesystem provider needs the extended prefix for paths >=260.
    # Keep ordinary paths for Join-Path and native arguments; convert only at IO.
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or $Path.StartsWith('\\?\')) { return $Path }
    $absolute = [IO.Path]::GetFullPath($Path)
    if ($absolute.StartsWith('\\')) { return '\\?\UNC\' + $absolute.Substring(2) }
    return '\\?\' + $absolute
}
function Invoke-SetupDownload {
    param([string]$Uri, [string]$OutFile, [int]$TimeoutSec = 600, [int]$Attempts = 3)
    $literalOut = ConvertTo-SetupLiteralPath $OutFile
    $ProgressPreference = 'SilentlyContinue' # WinPS 5.1 web progress can make large ZIPs very slow.
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        $webTemporary = $null
        try {
            Write-Host "  Download $attempt/$Attempts (timeout ${TimeoutSec}s): $Uri"
            if (Test-Path -LiteralPath $literalOut) { Remove-Item -LiteralPath $literalOut -Force }
            if ($curl) {
                & $curl.Source --fail --location --show-error --connect-timeout 20 --max-time $TimeoutSec --output $literalOut $Uri
                if ($LASTEXITCODE -ne 0) { throw "curl exited with code $LASTEXITCODE" }
            } else {
                # WinPS 5.1 IWR rejects extended paths even when File.IO accepts
                # them. Download to an ordinary temporary file, then move it.
                $webTemporary = Join-Path ([IO.Path]::GetTempPath()) ('workstation-web-' + [guid]::NewGuid().ToString('N') + '.tmp')
                Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $webTemporary -TimeoutSec $TimeoutSec -ErrorAction Stop
                [IO.File]::Move((ConvertTo-SetupLiteralPath $webTemporary), $literalOut)
            }
            if (-not (Test-Path -LiteralPath $literalOut -PathType Leaf) -or (Get-Item -LiteralPath $literalOut).Length -eq 0) { throw 'Download is empty' }
            return
        } catch {
            $reason = $_.Exception.Message
            if (Test-Path -LiteralPath $literalOut) { Remove-Item -LiteralPath $literalOut -Force }
            if ($attempt -eq $Attempts) { throw "Download failed after $Attempts attempts: $Uri. Last error: $reason" }
            Write-Warning "Download attempt $attempt failed: $reason. Retrying..."
            Start-Sleep -Seconds (2 * $attempt)
        } finally {
            if ($webTemporary -and (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath $webTemporary))) {
                Remove-Item -LiteralPath (ConvertTo-SetupLiteralPath $webTemporary) -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
function Expand-SetupArchive {
    param([string]$Archive, [string]$Destination, [string]$ExpectedRoot)
    # Node's filesystem APIs handle long Windows paths without chdir, registry
    # changes or external extractors. This code is embedded for single-file bootstrap.
    $extractor = @'
'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const [archive, destination, expectedRoot] = process.argv.slice(2);
const bytes = fs.readFileSync(archive), maximum = 512 * 1024 * 1024;
if (bytes.length > maximum) throw new Error('Setup ZIP exceeds size limit');
let end = -1;
for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
  if (bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + bytes.readUInt16LE(at + 20) === bytes.length) { end = at; break; }
}
if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new Error('Invalid setup ZIP');
const count = bytes.readUInt16LE(end + 10), central = bytes.readUInt32LE(end + 16);
if (!count || count === 65535 || central + bytes.readUInt32LE(end + 12) !== end) throw new Error('Invalid setup ZIP directory');
const table = Array.from({ length: 256 }, (_, i) => { let n = i; for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); return n >>> 0; });
function crc32(content) { let crc = 0xffffffff; for (const byte of content) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255]; return (crc ^ 0xffffffff) >>> 0; }
const base = path.resolve(destination), seen = new Set(), entries = [];
let offset = central, total = 0;
for (let i = 0; i < count; i++) {
  if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid setup ZIP entry');
  const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
  const size = bytes.readUInt32LE(offset + 20), length = bytes.readUInt32LE(offset + 24);
  const nameLength = bytes.readUInt16LE(offset + 28), next = offset + 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  if (next > end || flags & 1) throw new Error('Invalid/encrypted setup ZIP entry');
  const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replace(/\\/g, '/');
  const parts = name.replace(/\/$/, '').split('/');
  if (parts.shift() !== expectedRoot || parts.some(p => !p || p === '.' || p === '..' || /[<>:"\\|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('Unsafe setup ZIP path');
  const mode = bytes.readUInt32LE(offset + 38) >>> 16;
  if ((mode & 0xf000) === 0xa000) throw new Error('Linked setup ZIP entries are unsupported');
  const relative = parts.join('/');
  if (relative) {
    const key = process.platform === 'win32' ? relative.toLowerCase() : relative;
    if (seen.has(key)) throw new Error('Duplicate setup ZIP path');
    seen.add(key);
    const target = path.resolve(base, relative), distance = path.relative(base, target);
    if (!distance || distance.startsWith('..') || path.isAbsolute(distance)) throw new Error('Setup ZIP path escapes destination');
    const local = bytes.readUInt32LE(offset + 42);
    if (local + 30 > central || bytes.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid setup ZIP local header');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    total += length;
    if (length > 128 * 1024 * 1024 || total > maximum || start + size > central) throw new Error('Setup ZIP exceeds extraction limits');
    const directory = name.endsWith('/');
    const compressed = bytes.subarray(start, start + size);
    const content = directory ? Buffer.alloc(0) : method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed, { maxOutputLength: 128 * 1024 * 1024 }) : null;
    if (!content || content.length !== length || crc32(content) !== bytes.readUInt32LE(offset + 16)) throw new Error('Setup ZIP content/checksum mismatch');
    entries.push({ target, directory, content, mode });
  }
  offset = next;
}
if (offset !== end || !seen.has('bin/workstation-setup.js') || !seen.has('package.json')) throw new Error('Incomplete setup ZIP');
if (fs.existsSync(base) && fs.readdirSync(base).length) throw new Error('Extraction destination is not empty');
fs.mkdirSync(base, { recursive: true });
for (const entry of entries) {
  fs.mkdirSync(entry.directory ? entry.target : path.dirname(entry.target), { recursive: true });
  if (!entry.directory) { fs.writeFileSync(entry.target, entry.content, { flag: 'wx' }); if (process.platform !== 'win32' && entry.mode) fs.chmodSync(entry.target, entry.mode & 0o777); }
}
'@
    $nodeName = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { 'node.exe' } else { 'node' }
    $node = Get-Command $nodeName -ErrorAction Stop
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = $extractor | & $node.Source - $Archive $Destination $ExpectedRoot 2>&1
        $status = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    if ($status -ne 0) { throw ('Cannot extract setup ZIP (exit ' + $status + '): ' + ($output -join "`n")) }
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
    if ($RepoSlug -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$') { throw 'Invalid setup repository' }
    $archive = Join-Path $Directory 'setup.zip'
    $source = Join-Path $Directory 'source'
    try {
        Invoke-SetupDownload -Uri ('https://codeload.github.com/' + $RepoSlug + '/zip/' + $Commit) -OutFile $archive
        Expand-SetupArchive -Archive $archive -Destination $source -ExpectedRoot (($RepoSlug -split '/')[1] + '-' + $Commit)
        if (-not (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath (Join-Path $source 'bin/workstation-setup.js')) -PathType Leaf)) { throw 'Downloaded archive is incomplete' }
        return $source
    } catch {
        Write-Warning ('ZIP download/extraction failed: ' + $_.Exception.Message)
        Write-Host '  Falling back to Git over github.com (same commit; no codeload server)...'
    }
    # Separate destination: never mix a partially extracted ZIP with the Git snapshot.
    $source = Join-Path $Directory 'git-source'
    # Git for Windows still cannot chdir into some long paths even with
    # core.longpaths=true. Fetch in a private short directory, then let Node
    # copy the verified snapshot to the requested persistent source directory.
    $staging = $null
    $gitSource = $source
    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT -and $source.Length -ge 200) {
        $staging = Join-Path ([IO.Path]::GetTempPath()) ('workstation-git-' + [guid]::NewGuid().ToString('N'))
        $gitSource = $staging
    }
    try {
        Invoke-SetupGit -GitPath $GitPath -Arguments @('-c', 'core.longpaths=true', 'init', '--quiet', $gitSource) -Label 'Initialize fallback' | Out-Null
        Invoke-SetupGit -GitPath $GitPath -Arguments @('-c', 'core.longpaths=true', '-C', $gitSource, 'fetch', '--quiet', '--depth=1', '--no-tags', ('https://github.com/' + $RepoSlug + '.git'), $Commit) -Label 'Download setup via Git' | Out-Null
        $actual = Invoke-SetupGit -GitPath $GitPath -Arguments @('-c', 'core.longpaths=true', '-C', $gitSource, 'rev-parse', 'FETCH_HEAD') -Label 'Verify fallback commit'
        if (@($actual).Count -ne 1 -or "$actual".Trim() -cne $Commit) { throw 'Git fallback commit mismatch; no setup files changed.' }
        Invoke-SetupGit -GitPath $GitPath -Arguments @('-c', 'core.longpaths=true', '-C', $gitSource, 'checkout', '--quiet', '--detach', $Commit) -Label 'Check out setup snapshot' | Out-Null
        if ($staging) {
            $copy = 'const fs=require("node:fs");const [from,to]=process.argv.slice(2);if(fs.existsSync(to))throw new Error("Snapshot destination already exists");fs.cpSync(from,to,{recursive:true,force:false,errorOnExist:true});'
            $copy | & node.exe - $staging $source
            if ($LASTEXITCODE -ne 0) { throw 'Cannot copy verified Git snapshot to the download directory' }
        }
        return $source
    } finally {
        if ($staging) {
            $resolved = [IO.Path]::GetFullPath($staging)
            if ([IO.Path]::GetDirectoryName($resolved).TrimEnd('\') -cne [IO.Path]::GetTempPath().TrimEnd('\') -or [IO.Path]::GetFileName($resolved) -notmatch '^workstation-git-[a-f0-9]{32}$') { throw 'Unsafe Git staging cleanup' }
            if (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath $resolved)) { Remove-Item -LiteralPath (ConvertTo-SetupLiteralPath $resolved) -Recurse -Force }
        }
    }
}
function New-SetupWorkspace {
    param([string]$RepoSlug, [string]$Commit, [string]$DownloadRoot = '', [string[]]$Candidates = @())
    if ($Commit -notmatch '^[a-f0-9]{40}$' -or $RepoSlug -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$') { throw 'Invalid setup source identity' }
    if ($DownloadRoot) {
        if (-not [IO.Path]::IsPathRooted($DownloadRoot)) { throw 'DownloadRoot must be an absolute path' }
        if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT -and $DownloadRoot -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+(?:\\|$))') { throw 'DownloadRoot must be an absolute path, including the drive or UNC share' }
        $Candidates = @($DownloadRoot)
    } elseif (-not $Candidates.Count) {
        # Prefer D: when it exists and is writable; use the current Windows user's
        # local storage otherwise. Never assume another user's home or IDE drive.
        if (Test-Path -LiteralPath 'D:\' -PathType Container -ErrorAction SilentlyContinue) { $Candidates += 'D:\WorkstationSetup' }
        $localData = [Environment]::GetFolderPath('LocalApplicationData')
        if (-not $localData) { throw 'Windows local application data directory is unavailable; specify -DownloadRoot' }
        $Candidates += (Join-Path $localData 'WorkstationSetup')
    }
    foreach ($candidate in $Candidates) {
        try {
            $root = [IO.Path]::GetFullPath($candidate)
            $sources = Join-Path (Join-Path $root ($RepoSlug -replace '/', '-')) 'sources'
            $directory = Join-Path $sources ($Commit.Substring(0, 12) + '-' + [guid]::NewGuid().ToString('N'))
            [IO.Directory]::CreateDirectory((ConvertTo-SetupLiteralPath $directory)) | Out-Null
            # A directory can inherit read-only ACLs: verify file writes before download.
            $probe = Join-Path $directory '.write-test'
            [IO.File]::WriteAllText((ConvertTo-SetupLiteralPath $probe), 'setup')
            Remove-Item -LiteralPath (ConvertTo-SetupLiteralPath $probe) -Force -ErrorAction Stop
            return $directory
        } catch {
            if ($DownloadRoot) { throw "Cannot use DownloadRoot '$DownloadRoot': $($_.Exception.Message)" }
            Write-Warning "Cannot store setup in '$candidate': $($_.Exception.Message). Trying the next location..."
        }
    }
    throw 'No writable setup download location is available; specify -DownloadRoot'
}
function Assert-SetupPackage {
    param([string]$Source, [string]$MinimumVersion)
    $file = Join-Path $Source 'package.json'
    if (-not (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath $file) -PathType Leaf)) { throw 'Downloaded package.json is missing; no setup files changed.' }
    $package = Get-Content -LiteralPath (ConvertTo-SetupLiteralPath $file) -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($package.name -ne 'antigravity-workstation-setup') { throw 'Unexpected downloaded package identity; no setup files changed.' }
    if ($package.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Downloaded package has an invalid release version; no setup files changed.' }
    if ([version]$package.version -lt [version]$MinimumVersion) {
        throw "Downloaded setup $($package.version) is older than required $MinimumVersion. Refusing stale setup; no setup files changed."
    }
    return $package
}
function Get-SetupArguments {
    param([string]$Entry, [switch]$RulesOnly, [switch]$QuietCompletion, [switch]$CleanExtensions, [string]$Name = '',
        [ValidateSet('full','lite')][string]$ExtensionProfile = 'full')
    if ($RulesOnly -and $QuietCompletion) { throw 'Choose either RulesOnly or QuietCompletion' }
    if ($CleanExtensions -and ($RulesOnly -or $QuietCompletion -or $ExtensionProfile -ne 'full')) { throw 'CleanExtensions requires full setup; it cannot be combined with RulesOnly, QuietCompletion or lite profile' }
    if (($RulesOnly -or $QuietCompletion) -and $ExtensionProfile -ne 'full') { throw 'ExtensionProfile is only supported for full setup' }
    if ($QuietCompletion) { return @($Entry, 'quiet-completion') }
    $arguments = @($Entry, 'install')
    if ($RulesOnly) { $arguments += '--rules-only' } else { $arguments += '--auto-approve' }
    if ($CleanExtensions) { $arguments += '--clean-extensions' }
    if ($ExtensionProfile -ne 'full') { $arguments += @('--extension-profile', $ExtensionProfile) }
    if ($Name) { $arguments += @('--name', $Name) }
    return $arguments
}
function Refresh-SetupPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
        [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $script:originalPath
}
function Get-SetupWindowsTarget {
    param([string]$Architecture = '', [version]$Version = [Environment]::OSVersion.Version)
    if (-not $Architecture) {
        $Architecture = $env:PROCESSOR_ARCHITEW6432
        if (-not $Architecture) { $Architecture = $env:PROCESSOR_ARCHITECTURE }
    }
    if ($Version.Major -lt 10 -or $Version.Build -lt 19041) {
        throw 'Setup requires Windows 10 version 2004 (build 19041) or newer, or Windows 11. Windows 7/8 are not supported.'
    }
    switch ($Architecture.ToUpperInvariant()) {
        'AMD64' { return 'x64' }
        'ARM64' {
            # The pinned browser CLI ships an x64 Windows binary and uses the
            # OS emulator on ARM64. Windows 10 ARM emulates only 32-bit x86.
            if ($Version.Build -lt 22000) { throw 'Full setup on ARM64 requires Windows 11 (build 22000+); the browser runtime needs x64 emulation, which Windows 10 ARM does not provide.' }
            return 'arm64'
        }
        default { throw "Unsupported Windows architecture '$Architecture'. Antigravity IDE requires 64-bit Windows (x64 or ARM64)." }
    }
}
function Install-Prerequisite {
    param([string]$Id)
    if ($DryRun) { Write-Host "  [DRY-RUN] Would install $Id using winget; no changes made."; return }
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) { throw 'winget is unavailable. Install Node.js >=24 and Git for Windows, then use the npx command in README.' }
    Write-Host "  Installing $Id (winget download/installation output follows)..."
    & $winget.Source install --id $Id --exact --source winget --architecture $script:setupArchitecture --silent --accept-source-agreements --accept-package-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw "winget could not install $Id (exit $LASTEXITCODE). Resolve the Windows installer error, then rerun bootstrap." }
    Refresh-SetupPath
}
$setupWorkspace = $null
$stage = 'Check Windows prerequisites'
try {
    if ($RulesOnly -and $QuietCompletion) { throw 'Choose either RulesOnly or QuietCompletion' }
    if ($CleanExtensions -and ($RulesOnly -or $QuietCompletion -or $ExtensionProfile -ne 'full')) { throw 'CleanExtensions requires full setup' }
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Bootstrap requires Windows 10/11' }
    $script:setupArchitecture = Get-SetupWindowsTarget
    Write-Host ('  Windows target: ' + $script:setupArchitecture + ' (build ' + [Environment]::OSVersion.Version.Build + ')')
    $script:originalPath = $env:Path
    Refresh-SetupPath
    Write-Host '[1/4] Checking Node.js >=24 and npm >=10...'
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $needsNode = -not $node
    if ($node) {
        $nodeVersion = & $node.Source --version
        if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.') { throw 'Could not read Node.js version' }
        $needsNode = [int]$Matches[1] -lt 24
        if (-not $needsNode) {
            $nodeArchitecture = & $node.Source -p 'process.arch'
            if ($LASTEXITCODE -ne 0 -or $nodeArchitecture -cne $script:setupArchitecture) { $needsNode = $true }
        }
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
    $nodeArchitecture = & $node.Source -p 'process.arch'
    if ($LASTEXITCODE -ne 0 -or $nodeArchitecture -cne $script:setupArchitecture) { throw "Node.js architecture must be $script:setupArchitecture. Check PATH and restart the terminal after installing native Node.js." }
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
    $stage = 'Select writable download location'
    $setupWorkspace = New-SetupWorkspace -RepoSlug $RepoSlug -Commit $commit -DownloadRoot $DownloadRoot
    Write-Host ('  Local setup copy: ' + $setupWorkspace)
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $stage = 'Download current setup snapshot'
    Write-Host ('[3/4] Downloading current setup commit ' + $commit + '...')
    $source = Get-SetupSource -GitPath $git.Source -Commit $commit -Directory $setupWorkspace -RepoSlug $RepoSlug
    $entry = Join-Path $source 'bin\workstation-setup.js'
    $packagePath = Join-Path $source 'package.json'
    if (-not (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath $entry) -PathType Leaf) -or -not (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath $packagePath) -PathType Leaf)) { throw 'Downloaded archive is incomplete; no setup files changed.' }
    $package = Assert-SetupPackage -Source $source -MinimumVersion $MinimumVersion
    Write-Host ('  Package ' + $package.version + '; source ' + $commit)
    Write-Host ('  Applying all configuration from: ' + $source)
    $setupArgs = Get-SetupArguments -Entry $entry -RulesOnly:$RulesOnly -QuietCompletion:$QuietCompletion -CleanExtensions:$CleanExtensions -Name $Name -ExtensionProfile $ExtensionProfile
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
    Write-Error ("Workstation Setup stage '$stage': " + $_.Exception.Message) -ErrorAction Continue
    exit 1
} finally {
    if ($setupWorkspace) {
        # Keep downloaded sources for inspection/recovery; remove only our ZIP.
        $archive = ConvertTo-SetupLiteralPath (Join-Path $setupWorkspace 'setup.zip')
        if (Test-Path -LiteralPath $archive -PathType Leaf) { Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue }
        Write-Host ('  Downloaded source retained in: ' + $setupWorkspace)
    }
}
