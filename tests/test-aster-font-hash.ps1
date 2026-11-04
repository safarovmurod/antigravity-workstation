$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../extensions/aster-appearance/install-font.ps1'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'Font installer has PowerShell parse errors' }
$definition = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-AsterFontHash'},$true)
if ($null -eq $definition) { throw 'Actual font hash implementation missing' }
Invoke-Expression $definition.Extent.Text
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('aster-hash-' + [Guid]::NewGuid().ToString('N'))
try {
  [IO.File]::WriteAllBytes($fixture,[Text.Encoding]::ASCII.GetBytes('abc'))
  if ((Get-AsterFontHash $fixture).Replace('-','').ToLowerInvariant() -cne 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') { throw 'Actual font SHA-256 differs from known vector' }
  [IO.File]::WriteAllBytes($fixture,[Text.Encoding]::ASCII.GetBytes('abcd'))
  if ((Get-AsterFontHash $fixture).Replace('-','').ToLowerInvariant() -ceq 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') { throw 'Changed payload was not detected' }
  [IO.File]::Delete($fixture)
  'PASS: actual installer SHA-256 matches known vector, detects changed bytes and releases its file handle.'
} finally { if ([IO.File]::Exists($fixture)) { [IO.File]::Delete($fixture) } }
