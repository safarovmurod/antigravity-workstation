param([Parameter(Mandatory=$true)][string]$Stage)
$ErrorActionPreference = 'Stop'
$files = @(Get-ChildItem -LiteralPath $Stage -File -Filter 'Aster-*.ttf')
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
$created = @()
try {
  foreach ($file in $files) {
    $collection = New-Object System.Drawing.Text.PrivateFontCollection
    try { $collection.AddFontFile($file.FullName); if ($collection.Families.Count -lt 1) { throw 'Invalid font payload' } } finally { $collection.Dispose() }
    $destination = Join-Path $target $file.Name
    $property = $file.BaseName + ' (TrueType)'
    if (Test-Path -LiteralPath $destination) {
      if ((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath $file.FullName).Hash) { throw 'Existing font differs; not overwriting' }
      continue
    }
    if ($null -ne (Get-ItemProperty -LiteralPath $registry -Name $property -ErrorAction SilentlyContinue)) { throw 'Existing registry entry; not overwriting' }
    [IO.File]::Copy($file.FullName,$destination,$false)
    $created += @{file=$destination;property=$property}
    New-ItemProperty -LiteralPath $registry -Name $property -Value $destination -PropertyType String | Out-Null
    if ([AsterFontNative]::AddFontResourceEx($destination,0,[IntPtr]::Zero) -eq 0) { throw 'Windows font registration failed' }
  }
  $result = [UIntPtr]::Zero
  [AsterFontNative]::SendMessageTimeout([IntPtr]0xffff,0x1d,[UIntPtr]::Zero,[IntPtr]::Zero,2,2000,[ref]$result) | Out-Null
} catch {
  foreach ($entry in $created) {
    [AsterFontNative]::RemoveFontResourceEx($entry.file,0,[IntPtr]::Zero) | Out-Null
    Remove-ItemProperty -LiteralPath $registry -Name $entry.property -ErrorAction SilentlyContinue
    [IO.File]::Delete($entry.file)
  }
  throw
}
