[CmdletBinding()]
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion -lt [version]'7.3') { throw 'This development cleanup tool requires PowerShell7.3+; production scripts remain Windows PowerShell5.1 compatible.' }
$repo = Split-Path $PSScriptRoot -Parent
$utf8 = [Text.UTF8Encoding]::new($false, $true)
function Get-Digest([byte[]]$Bytes) { [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant() }
function Get-CodeTokens([string]$Text) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseInput($Text, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw 'PowerShell parse error; source not eligible for cleanup' }
    return ,$tokens
}
function Get-CodeFingerprint($Tokens) {
    @($Tokens | Where-Object Kind -ne 'Comment' | ForEach-Object { $_.Kind.ToString() + [char]0 + $_.Text }) | ConvertTo-Json -Compress
}
$plans = @(); $preserved = @()
foreach ($area in @('bin', 'lib', 'scripts', 'extensions', 'tests')) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $repo $area) -Filter '*.ps1' -Recurse -File) {
        if ($file.FullName -match '[\\/]node_modules[\\/]') { continue }
        if ($file.LinkType) { throw "Linked source is not eligible: $($file.FullName)" }
        $relative = [IO.Path]::GetRelativePath($repo, $file.FullName)
        $originalBytes = [IO.File]::ReadAllBytes($file.FullName)
        $original = [IO.File]::ReadAllText($file.FullName, $utf8)
        $bom = $originalBytes.Length -ge 3 -and $originalBytes[0] -eq 239 -and $originalBytes[1] -eq 187 -and $originalBytes[2] -eq 191
        $roundTrip = $utf8.GetBytes($original)
        if ($bom) { $roundTrip = [byte[]](@(239,187,191) + $roundTrip) }
        if ((Get-Digest $roundTrip) -ne (Get-Digest $originalBytes)) { throw "Non-UTF8 source encoding: $relative" }
        $tokens = Get-CodeTokens $original
        $comments = @($tokens | Where-Object Kind -eq 'Comment')
        $remove = @()
        foreach ($comment in $comments) {
            if ($original -match '(?im)^\s*#\s*SIG\s*#\s*Begin signature block' -or $comment.Text -match '(?im)copyright|licen[cs]e|^\s*#(?:requires|!|region|endregion)|PSScriptInfo|^\s*\.(SYNOPSIS|DESCRIPTION|PARAMETER|EXAMPLE|NOTES|INPUTS|OUTPUTS|LINK)\b') {
                $preserved += [pscustomobject]@{ file=$relative; line=$comment.Extent.StartLineNumber; text=$comment.Text; reason='Compiler/version directive, OS interpreter, license, signature, editor region or comment-based tooling help' }
            } else { $remove += $comment }
        }
        if (-not $remove.Count) { continue }
        $next = $original
        foreach ($comment in @($remove | Sort-Object { $_.Extent.StartOffset } -Descending)) {
            $next = $next.Remove($comment.Extent.StartOffset, $comment.Extent.EndOffset - $comment.Extent.StartOffset).Insert($comment.Extent.StartOffset, ' ')
        }
        $changedLines = @{}
        foreach ($comment in $remove) { for ($line = $comment.Extent.StartLineNumber; $line -le $comment.Extent.EndLineNumber; $line++) { $changedLines[$line] = $true } }
        $lines = $next.Split("`n")
        foreach ($line in $changedLines.Keys) { if ($line -le $lines.Count) { $lines[$line - 1] = [regex]::Replace($lines[$line - 1], '[ \t]+(?=\r?$)', '') } }
        $next = [string]::Join("`n", $lines)
        if ((Get-CodeFingerprint $tokens) -cne (Get-CodeFingerprint (Get-CodeTokens $next))) { throw "Executable token stream changed: $relative" }
        $bytes = $utf8.GetBytes($next)
        if ($bom) { $bytes = [byte[]](@(239,187,191) + $bytes) }
        $plans += [pscustomobject]@{ file=$relative; source=$file.FullName; before=$originalBytes; after=$bytes; removed=$remove.Count; beforeSha256=(Get-Digest $originalBytes); afterSha256=(Get-Digest $bytes) }
    }
}
if (-not $Apply) { return [pscustomobject]@{ files=@($plans | Select-Object file,removed,beforeSha256,afterSha256); preserved=$preserved; tokenEquivalent=$true } | ConvertTo-Json -Depth 6 }
$backup = Join-Path ([IO.Path]::GetTempPath()) ('workstation-powershell-comments-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($backup)
foreach ($plan in $plans) {
    $saved = Join-Path $backup $plan.file
    [void][IO.Directory]::CreateDirectory((Split-Path $saved -Parent)); [IO.File]::WriteAllBytes($saved, $plan.before)
    if ((Get-Digest ([IO.File]::ReadAllBytes($saved))) -ne $plan.beforeSha256) { throw 'Source backup verification failed' }
}
$changed = @()
try {
    foreach ($plan in $plans) {
        if ((Get-Digest ([IO.File]::ReadAllBytes($plan.source))) -ne $plan.beforeSha256) { throw "Concurrent source edit: $($plan.file)" }
        $temporary = $plan.source + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
        try {
            [IO.File]::WriteAllBytes($temporary, $plan.after)
            if (-not $IsWindows) { [IO.File]::SetUnixFileMode($temporary, [IO.File]::GetUnixFileMode($plan.source)) }
            [IO.File]::Move($temporary, $plan.source, $true); $changed += $plan
        } finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
    }
    $report = [ordered]@{ scope='Owned PowerShell source comments only; strings/signatures/tool directives are protected'; tokenEquivalent=$true; backup=$backup; removed=($plans | Measure-Object -Property removed -Sum).Sum; preserved=$preserved; files=@($plans | Select-Object file,removed,beforeSha256,afterSha256) }
    [IO.File]::WriteAllText((Join-Path $repo 'docs/OWNED-POWERSHELL-COMMENT-CLEANUP.json'), ($report | ConvertTo-Json -Depth 6) + "`n", $utf8)
} catch {
    foreach ($plan in $changed) { [IO.File]::WriteAllBytes($plan.source, $plan.before) }
    throw
}
[pscustomobject]@{ files=$plans.Count; removed=$report.removed; protected=$preserved.Count; backup=$backup; tokenEquivalent=$true } | ConvertTo-Json
