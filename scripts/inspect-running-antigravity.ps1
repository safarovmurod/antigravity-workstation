[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'

function Get-AntigravityInstallationEvidence {
    param([Parameter(Mandatory = $true)][string]$ExecutablePath)
    $exe = Get-Item -LiteralPath $ExecutablePath
    $app = Join-Path $exe.DirectoryName 'resources/app'
    $productFile = Join-Path $app 'product.json'
    $packageFile = Join-Path $app 'package.json'
    $mainFile = Join-Path $app 'out/main.js'
    $before = @{}
    foreach ($file in @($productFile, $packageFile, $mainFile)) {
        $before[$file] = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $product = Get-Content -LiteralPath $productFile -Raw | ConvertFrom-Json
    $package = Get-Content -LiteralPath $packageFile -Raw | ConvertFrom-Json
    $stable = $true
    foreach ($file in @($productFile, $packageFile, $mainFile)) {
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $before[$file]) { $stable = $false }
    }
    [pscustomobject]@{
        executablePath = $exe.FullName
        executableFileVersion = $exe.VersionInfo.FileVersion
        executableProductVersion = $exe.VersionInfo.ProductVersion
        productFile = $productFile
        productIdeVersion = $product.ideVersion
        productCommit = $product.commit
        productName = $product.nameShort
        vscodeEngineVersion = $package.version
        mainFile = $mainFile
        mainSha256 = $before[$mainFile]
        filesStableDuringRead = $stable
        applicationVersionVerified = $false
    }
}

function Get-RunningAntigravityEvidence {
    param([scriptblock]$ReadProcesses = { @(Get-CimInstance Win32_Process -Filter "Name = 'Antigravity IDE.exe'") })
    $processes = @(& $ReadProcesses)
    $installations = @()
    $unreadablePids = @()
    foreach ($process in $processes) {
        if (-not $process.ExecutablePath) { $unreadablePids += $process.ProcessId }
    }
    foreach ($group in @($processes | Where-Object { $_.ExecutablePath } | Group-Object ExecutablePath)) {
        try {
            $evidence = Get-AntigravityInstallationEvidence -ExecutablePath $group.Name
            $current = @(& $ReadProcesses)
            $sameProcess = @($group.Group | Where-Object {
                $original = $_
                @($current | Where-Object { $_.ProcessId -eq $original.ProcessId -and $_.ExecutablePath -eq $original.ExecutablePath -and $_.CreationDate -eq $original.CreationDate }).Count -gt 0
            }).Count -gt 0
            $installations += [pscustomobject]@{
                processIds = @($group.Group | ForEach-Object { $_.ProcessId })
                processStillMatches = $sameProcess
                evidence = $evidence
                status = $(if ($sameProcess -and $evidence.filesStableDuringRead) { 'READ_ONLY_EVIDENCE' } else { 'CHANGED_DURING_READ' })
            }
        } catch {
            $installations += [pscustomobject]@{ executablePath = $group.Name; status = 'UNREADABLE_INSTALLATION'; error = $_.Exception.GetType().Name }
        }
    }
    [pscustomobject]@{
        schema = 1
        capturedAtUtc = [DateTime]::UtcNow.ToString('o')
        installationCount = $installations.Count
        unreadableProcessIds = @($unreadablePids)
        installations = @($installations)
        automaticSelection = $false
        note = 'Compare each running executable path and versions with Help > About. Matching native hashes do not prove the About version. No settings, registry, clipboard or IDE files were modified.'
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'This read-only diagnostic requires Windows.' }
    Get-RunningAntigravityEvidence | ConvertTo-Json -Depth 8
}
