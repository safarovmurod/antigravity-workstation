$ErrorActionPreference = 'Stop'
$files = @(& git ls-files '*.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Cannot inventory tracked PowerShell files' }
$failures = @()
foreach ($file in $files) {
  $tokens = $null
  $errors = $null
  $source = [IO.File]::ReadAllText((Join-Path (Get-Location) $file),[Text.Encoding]::UTF8)
  [Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors) | Out-Null
  foreach ($error in $errors) { $failures += @{file=$file;line=$error.Extent.StartLineNumber;message=$error.Message} }
}
@{files=$files.Count;failures=$failures} | ConvertTo-Json -Depth 5
if ($failures.Count) { exit 1 }
