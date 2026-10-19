param([string]$Uri, [string]$ExpectedSha256, [switch]$WithoutCurl)
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
    foreach ($relative in @('ordinary', (('long-' + ('a' * 90)) + '/' + ('b' * 90) + '/' + ('c' * 90)))) {
        $directory = Join-Path $testRoot $relative
        [IO.Directory]::CreateDirectory((ConvertTo-SetupLiteralPath $directory)) | Out-Null
        $file = Join-Path $directory 'source with spaces.bin'
        Invoke-SetupDownload -Uri $Uri -OutFile $file -Attempts 1 -TimeoutSec 20
        $hash = [Security.Cryptography.SHA256]::Create()
        try { $actual = [BitConverter]::ToString($hash.ComputeHash([IO.File]::ReadAllBytes((ConvertTo-SetupLiteralPath $file)))).Replace('-', '').ToLowerInvariant() }
        finally { $hash.Dispose() }
        if ($actual -cne $ExpectedSha256) { throw 'Real HTTP download checksum mismatch' }
        Write-Host ('PASS: PowerShell ' + $PSVersionTable.PSVersion + '; curl disabled=' + $WithoutCurl + '; destination length=' + $file.Length)
    }
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    if ([IO.Path]::GetDirectoryName($resolved).TrimEnd('\') -cne [IO.Path]::GetTempPath().TrimEnd('\') -or [IO.Path]::GetFileName($resolved) -notmatch '^workstation-http-test-[a-f0-9]{32}$') { throw 'Unsafe HTTP test cleanup' }
    if (Test-Path -LiteralPath (ConvertTo-SetupLiteralPath $resolved)) { Remove-Item -LiteralPath (ConvertTo-SetupLiteralPath $resolved) -Recurse -Force }
}
