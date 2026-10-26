[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$source = Join-Path $repo 'extensions/git-branch-panel'
$script = Join-Path $source 'install-github-panel.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($script, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$function = @($ast.EndBlock.Statements | Where-Object { $_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -eq 'New-PanelVsix' })
if ($function.Count -ne 1) { throw 'Expected exactly one production Git Panel VSIX builder' }
. ([scriptblock]::Create($function[0].Extent.Text))
$media = @('current-branch','new-branch','switch-branch','get-changes','pull-request','delete-branch') | ForEach-Object { 'media/'+$_+'.gif'; 'media/'+$_+'.mp4' }
$tempParent = [IO.Path]::GetTempPath()
$directory = Join-Path $tempParent ('workstation-panel-vsix-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory | Out-Null
try {
  $archive = Join-Path $directory 'panel.vsix'
  New-PanelVsix -Source $source -Output $archive | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($archive)
  try {
    $expected = @('package.json','extension.js','icon.png','README.md','LICENSE.txt') + $media
    foreach ($name in $expected) {
      $entry = $zip.GetEntry('extension/' + $name)
      if (-not $entry) { throw ('VSIX entry missing: ' + $name) }
      $stream = $entry.Open(); $sha = [Security.Cryptography.SHA256]::Create()
      try { $digest = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
      finally { $sha.Dispose(); $stream.Dispose() }
      $sourceDigest = (Get-FileHash -LiteralPath (Join-Path $source $name) -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($digest -cne $sourceDigest) { throw ('VSIX content differs from source: ' + $name) }
    }
    if ($zip.Entries.Count -ne ($expected.Count + 2)) { throw 'Unexpected VSIX entry count' }
    $stream = $zip.GetEntry('[Content_Types].xml').Open(); $reader = [IO.StreamReader]::new($stream)
    try { $types = $reader.ReadToEnd() } finally { $reader.Dispose(); $stream.Dispose() }
    if ($types -notmatch 'image/gif' -or $types -notmatch 'video/mp4') { throw 'VSIX media content types missing' }
  } finally { $zip.Dispose() }
  $fixture = Join-Path $directory 'incomplete-source'
  Copy-Item -LiteralPath $source -Destination $fixture -Recurse
  Remove-Item -LiteralPath (Join-Path $fixture 'media/current-branch.mp4')
  $fixtureCli = Join-Path $directory 'fixture-cli'; [IO.File]::WriteAllText($fixtureCli, 'fixture')
  $fixtureExtensions = Join-Path $directory 'must-not-exist'
  $child = [Diagnostics.ProcessStartInfo]::new()
  $child.FileName = (Get-Process -Id $PID).Path
  $child.UseShellExecute = $false; $child.RedirectStandardOutput = $true; $child.RedirectStandardError = $true
  foreach ($argument in @('-NoProfile','-File',(Join-Path $fixture 'install-github-panel.ps1'),'-CliPath',$fixtureCli,'-ExtensionsDir',$fixtureExtensions)) {
    if ($child.PSObject.Properties.Name -contains 'ArgumentList') { $child.ArgumentList.Add($argument) }
    else { $child.Arguments += ' "' + $argument.Replace('"','\"') + '"' }
  }
  $process = [Diagnostics.Process]::Start($child); $stdout = $process.StandardOutput.ReadToEnd(); $stderr = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -eq 0 -or ($stdout + $stderr) -notmatch 'Required panel asset is missing') { throw 'Missing-source preflight did not fail explicitly' }
  if (Test-Path -LiteralPath $fixtureExtensions) { throw 'Missing-source preflight modified the extension destination' }
  Copy-Item -LiteralPath (Join-Path $source 'media/current-branch.mp4') -Destination (Join-Path $fixture 'media/current-branch.mp4')
  [IO.File]::AppendAllText((Join-Path $fixture 'media/current-branch.gif'), 'damaged')
  $process = [Diagnostics.Process]::Start($child); $stdout = $process.StandardOutput.ReadToEnd(); $stderr = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  if ($process.ExitCode -eq 0 -or ($stdout + $stderr) -notmatch 'Panel source checksum mismatch') { throw 'Corrupt-source preflight did not fail explicitly' }
  if (Test-Path -LiteralPath $fixtureExtensions) { throw 'Corrupt-source preflight modified the extension destination' }
  Write-Output 'PASS: production PowerShell VSIX contains source-identical media and rejects missing or corrupt source before installation.'
} finally {
  $resolved = [IO.Path]::GetFullPath($directory)
  if ([IO.Path]::GetDirectoryName($resolved).TrimEnd([IO.Path]::DirectorySeparatorChar) -cne [IO.Path]::GetFullPath($tempParent).TrimEnd([IO.Path]::DirectorySeparatorChar) -or
      -not [IO.Path]::GetFileName($resolved).StartsWith('workstation-panel-vsix-test-')) { throw 'Unsafe temporary test directory' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
