param([Parameter(Mandatory=$true)][string]$Stage)
$ErrorActionPreference = 'Stop'
$files = @(Get-ChildItem -LiteralPath $Stage -File -Filter 'Aster-*.ttf' | Sort-Object Name)
if ($files.Count -lt 1 -or $files.Count -gt 20) { throw 'Invalid staged font set' }
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class AsterFontNative {
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern int AddFontResourceEx(string name, uint flags, IntPtr reserved);
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern bool RemoveFontResourceEx(string name, uint flags, IntPtr reserved);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
}
'@
$target = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Microsoft\Windows\Fonts'
$registry = 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
[IO.Directory]::CreateDirectory($target) | Out-Null
New-Item -Path $registry -Force | Out-Null
function Get-AsterFontRegistryValue([string]$Name) {
  $entry = (Get-ItemProperty -LiteralPath $registry).PSObject.Properties[$Name]
  if ($null -ne $entry) { $entry.Value }
}
function Get-AsterFontHash([string]$File) {
  $stream = [IO.File]::OpenRead($File)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { [BitConverter]::ToString($algorithm.ComputeHash($stream)) } finally { $algorithm.Dispose(); $stream.Dispose() }
}
$createdFiles = @()
$createdProperties = @()
$registered = @()
try {
  foreach ($file in $files) {
    $collection = New-Object System.Drawing.Text.PrivateFontCollection
    try { $collection.AddFontFile($file.FullName); if ($collection.Families.Count -lt 1) { throw 'Invalid font payload' } } finally { $collection.Dispose() }
    $destination = Join-Path $target $file.Name
    $property = $file.BaseName + ' (TrueType)'
    if (Test-Path -LiteralPath $destination) {
      if ((Get-AsterFontHash $destination) -cne (Get-AsterFontHash $file.FullName)) { throw 'Existing font differs; not overwriting' }
    } else {
      [IO.File]::Copy($file.FullName,$destination,$false)
      $createdFiles += $destination
    }
    $existing = Get-AsterFontRegistryValue $property
    if ($null -ne $existing -and $existing -cne $destination) { throw 'Existing registry entry differs; not overwriting' }
    if ($null -eq $existing) {
      New-ItemProperty -LiteralPath $registry -Name $property -Value $destination -PropertyType String | Out-Null
      $createdProperties += @{property=$property;file=$destination}
    }
    if ([AsterFontNative]::AddFontResourceEx($destination,0,[IntPtr]::Zero) -eq 0) { throw 'Windows font registration failed' }
    $registered += $destination
  }
  $result = [UIntPtr]::Zero
  [AsterFontNative]::SendMessageTimeout([IntPtr]0xffff,0x1d,[UIntPtr]::Zero,[IntPtr]::Zero,2,2000,[ref]$result) | Out-Null
} catch {
  foreach ($file in $registered) {
    [AsterFontNative]::RemoveFontResourceEx($file,0,[IntPtr]::Zero) | Out-Null
  }
  foreach ($entry in $createdProperties) {
    if ((Get-AsterFontRegistryValue $entry.property) -ceq $entry.file) { Remove-ItemProperty -LiteralPath $registry -Name $entry.property -ErrorAction SilentlyContinue }
  }
  foreach ($file in $createdFiles) { [IO.File]::Delete($file) }
  $result = [UIntPtr]::Zero
  [AsterFontNative]::SendMessageTimeout([IntPtr]0xffff,0x1d,[UIntPtr]::Zero,[IntPtr]::Zero,2,2000,[ref]$result) | Out-Null
  throw
}
