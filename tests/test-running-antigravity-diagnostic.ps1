$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../scripts/inspect-running-antigravity.ps1')
function Assert-True($Condition, $Message) { if (-not $Condition) { throw $Message } }
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('workstation diagnostic ' + [guid]::NewGuid().ToString('N'))
try {
    $fixtureProcesses = @()
    foreach ($name in @('Install A', 'Install B')) {
        $directory = Join-Path $fixtureRoot $name
        $app = Join-Path $directory 'resources/app'
        New-Item -ItemType Directory -Path (Join-Path $app 'out') -Force | Out-Null
        $executable = Join-Path $directory 'Antigravity IDE.exe'
        [IO.File]::WriteAllBytes($executable, [byte[]]@(0))
        [IO.File]::WriteAllText((Join-Path $app 'product.json'), '{"ideVersion":"2.5.5","commit":"ecfbad74d93962fc8ca485d93ab9b4f3d4cb6cf8","nameShort":"Antigravity IDE","privateToken":"MUST_NOT_BE_REPORTED"}')
        [IO.File]::WriteAllText((Join-Path $app 'package.json'), '{"version":"1.107.0"}')
        [IO.File]::WriteAllText((Join-Path $app 'out/main.js'), 'synthetic diagnostic fixture')
        $fixtureProcesses += [pscustomobject]@{ ProcessId = $fixtureProcesses.Count + 101; ExecutablePath = $executable; CreationDate = 'fixture-start' }
    }
    $before = @{}
    foreach ($file in @(Get-ChildItem -LiteralPath $fixtureRoot -Recurse -File)) { $before[$file.FullName] = (Get-FileHash -LiteralPath $file.FullName).Hash }
    $report = Get-RunningAntigravityEvidence -ReadProcesses { $fixtureProcesses }
    Assert-True ($report.installationCount -eq 2) 'Two active installation paths must remain separate'
    Assert-True (-not $report.automaticSelection) 'Must not guess an active installation'
    foreach ($entry in $report.installations) {
        Assert-True ($entry.status -eq 'READ_ONLY_EVIDENCE') 'Stable evidence required'
        Assert-True ($entry.evidence.productIdeVersion -eq '2.5.5') 'Report exact metadata, not About'
        Assert-True ($entry.evidence.productCommit -eq 'ecfbad74d93962fc8ca485d93ab9b4f3d4cb6cf8') 'Report exact product commit'
        Assert-True (-not $entry.evidence.applicationVersionVerified) 'Metadata must not attest application version'
        Assert-True ($entry.evidence.mainSha256 -match '^[a-f0-9]{64}$') 'Report main hash'
    }
    Assert-True (-not (($report | ConvertTo-Json -Depth 8).Contains('MUST_NOT_BE_REPORTED'))) 'Unowned metadata must not leak'
    foreach ($file in $before.Keys) { Assert-True ((Get-FileHash -LiteralPath $file).Hash -eq $before[$file]) 'Diagnostic must not change files' }
    $duplicate = @($fixtureProcesses[0], $fixtureProcesses[0])
    Assert-True ((Get-RunningAntigravityEvidence -ReadProcesses { $duplicate }).installationCount -eq 1) 'Child processes must group by executable path'
    Assert-True ((Get-RunningAntigravityEvidence -ReadProcesses { @() }).installationCount -eq 0) 'No process must not fall back to another install'
    $denied = @([pscustomobject]@{ ProcessId = 999; ExecutablePath = $null })
    Assert-True ((Get-RunningAntigravityEvidence -ReadProcesses { $denied }).unreadableProcessIds[0] -eq 999) 'Unreadable process must be explicit'
    $script:diagnosticReads = 0
    $changed = Get-RunningAntigravityEvidence -ReadProcesses { $script:diagnosticReads++; if ($script:diagnosticReads -eq 1) { $fixtureProcesses[0] } }
    Assert-True ($changed.installations[0].status -eq 'CHANGED_DURING_READ') 'Exited/replaced process cannot be attested'
    Remove-Item -LiteralPath (Join-Path $fixtureRoot 'Install A/resources/app/out/main.js')
    $missing = Get-RunningAntigravityEvidence -ReadProcesses { @($fixtureProcesses[0]) }
    Assert-True ($missing.installations[0].status -eq 'UNREADABLE_INSTALLATION') 'Missing main must not inspect another install'
    'PASS: diagnostic fixtures, path separation, redaction, read-only behavior and process races'
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
