param([string]$Uri, [string]$ExpectedSha256, [switch]$WithoutCurl, [switch]$ExpectFailure)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../scripts/bootstrap.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Bootstrap parse failed' }
foreach ($statement in $ast.EndBlock.Statements) {
    if ($statement -is [Management.Automation.Language.FunctionDefinitionAst]) { . ([scriptblock]::Create($statement.Extent.Text)) }
}
if ($WithoutCurl) {
    function Get-Command {
        param([string]$Name, [object]$ErrorAction)
        if ($Name -eq 'curl.exe') { return $null }
        return Microsoft.PowerShell.Core\Get-Command $Name -ErrorAction Stop
    }
}
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('workstation-http-test-' + [guid]::NewGuid().ToString('N'))
try {
    $longDirectory = 'long-' + ('a' * 90) + '/' + ('b' * 90) + '/' + ('c' * 90)
    # ASCII source also preserves the intended Unicode name in WinPS 5.1,
    # which otherwise reads a UTF-8 script without BOM using the ANSI codepage.
    $unicodeDirectory = (-join ([char[]]@(0x041c, 0x0443, 0x04b3, 0x0438, 0x0442))) + ' [profile] with spaces'
    foreach ($relative in @('ordinary', $longDirectory, $unicodeDirectory)) {
        $directory = Join-Path $testRoot $relative
        [IO.Directory]::CreateDirectory((ConvertTo-SetupLiteralPath $directory)) | Out-Null
        $file = Join-Path $directory 'source with spaces.bin'
        if ($ExpectFailure) {
            $failed = $false
            try { Invoke-SetupDownload -Uri $Uri -OutFile $file -Attempts 2 -TimeoutSec 3 }
            catch { if ($_.Exception.Message -notlike '*Download failed after 2 attempts*') { throw }; $failed = $true }
            if (-not $failed -or (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath $file))) { throw 'Invalid response was accepted or left a partial download' }
            Write-Host ('PASS: invalid HTTP response refused and partial file removed; destination length=' + $file.Length)
            continue
        }
        Invoke-SetupDownload -Uri $Uri -OutFile $file -Attempts 2 -TimeoutSec 20
        $hash = [Security.Cryptography.SHA256]::Create()
        try { $actual = [BitConverter]::ToString($hash.ComputeHash([IO.File]::ReadAllBytes((ConvertTo-SetupLiteralPath $file)))).Replace('-', '').ToLowerInvariant() }
        finally { $hash.Dispose() }
        if ($actual -cne $ExpectedSha256) { throw 'Real HTTP download checksum mismatch' }
        Write-Host ('PASS: PowerShell ' + $PSVersionTable.PSVersion + '; curl disabled=' + $WithoutCurl + '; destination length=' + $file.Length)
    }
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    if ([IO.Path]::GetDirectoryName($resolved).TrimEnd([char[]]'\/') -cne [IO.Path]::GetTempPath().TrimEnd([char[]]'\/') -or [IO.Path]::GetFileName($resolved) -notmatch '^workstation-http-test-[a-f0-9]{32}$') { throw 'Unsafe HTTP test cleanup' }
    if (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath $resolved)) { Remove-Item -LiteralPath (ConvertTo-SetupLiteralPath $resolved) -Recurse -Force }
}
