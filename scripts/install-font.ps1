param([Parameter(Mandatory = $true)][string]$ManifestPath, [string]$ErrorReportPath = '')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$temporaryRoot = $null
$archive = $null
$stage = 'Read font manifest'
try {
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.family -ne 'JetBrains Mono' -or $manifest.version -notmatch '^\d+\.\d+$' -or
        $manifest.url -ne "https://github.com/JetBrains/JetBrainsMono/releases/download/v$($manifest.version)/JetBrainsMono-$($manifest.version).zip" -or
        $manifest.sha256 -notmatch '^[a-f0-9]{64}$' -or $manifest.files.Count -ne 16 -or
        @($manifest.files.name | Select-Object -Unique).Count -ne 16) { throw 'Invalid font manifest' }
    foreach ($file in $manifest.files) {
        if ($file.name -notmatch '^JetBrainsMono-[A-Za-z]+\.ttf$' -or $file.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid font filename/hash' }
    }
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is required' }
    $fontDirectory = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
    $registryPath = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
    $missing = @()
    $stage = 'Check existing personal font files and registration'
    foreach ($file in $manifest.files) {
        $target = Join-Path $fontDirectory $file.name
        $style = [IO.Path]::GetFileNameWithoutExtension($file.name).Substring('JetBrainsMono-'.Length)
        $key = "JetBrains Mono $style (TrueType)"
        if (Test-Path -LiteralPath $registryPath) {
            $registration = Get-ItemProperty -LiteralPath $registryPath -Name $key -ErrorAction SilentlyContinue
            if ($registration -and $registration.$key -ne $target) { throw "Existing personal font registration differs: $key" }
        }
        if (Test-Path -LiteralPath $target) {
            if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) {
                throw "Existing personal font differs: $target. Preserve it before installing this pinned version."
            }
        } else { $missing += $file }
    }
    if ($missing.Count -gt 0) {
        $stage = 'Download official JetBrains Mono archive'
        $temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('mansur-font-' + [guid]::NewGuid())
        New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
        $bundledDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'resources/jetbrains-mono/ttf'
        if (Test-Path -LiteralPath $bundledDirectory) {
            $stage = 'Verify bundled JetBrains Mono font files'
            Write-Host '  Using bundled official JetBrains Mono files; no separate download needed.'
            foreach ($file in $manifest.files) {
                $bundled = Join-Path $bundledDirectory $file.name
                if (-not (Test-Path -LiteralPath $bundled) -or
                    (Get-FileHash -LiteralPath $bundled -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) {
                    throw "Bundled TTF missing or SHA-256 mismatch: $($file.name). Download a fresh copy of setup."
                }
            }
            foreach ($file in $missing) {
                [IO.File]::Copy((Join-Path $bundledDirectory $file.name), (Join-Path $temporaryRoot $file.name), $false)
            }
        } else {
            $zipPath = Join-Path $temporaryRoot 'JetBrainsMono.zip'
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
            $request = [Net.HttpWebRequest]::Create($manifest.url)
            $request.Timeout = 120000
            $request.ReadWriteTimeout = 60000
            $request.UserAgent = 'mansur-setup-font-installer'
            $response = $request.GetResponse()
            $stream = $null
            $output = $null
            try {
                if ($response.ResponseUri.Scheme -ne 'https') { throw 'Font download must remain HTTPS' }
                $total = $response.ContentLength
                if ($total -gt 32MB) { throw 'Font archive exceeds size limit' }
                $stream = $response.GetResponseStream()
                $output = [IO.File]::Create($zipPath)
                $buffer = New-Object byte[] 65536
                $received = 0L
                $lastBucket = -1
                Write-Host '  Downloading official JetBrains Mono release...'
                while (($count = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $received += $count
                    if ($received -gt 32MB) { throw 'Font archive exceeds size limit' }
                    $output.Write($buffer, 0, $count)
                    $percent = if ($total -gt 0) { [int][Math]::Floor(100 * $received / $total) } else { 0 }
                    $bucket = if ($total -gt 0) { [int][Math]::Floor($percent / 10) } else { [int][Math]::Floor($received / 1MB) }
                    if ($bucket -gt $lastBucket) {
                        if ($total -gt 0) { Write-Host "  Download: $percent% ($received / $total bytes)" }
                        else { Write-Host "  Download: $received bytes" }
                        $lastBucket = $bucket
                    }
                }
                if ($total -gt 0 -and $received -ne $total) { throw 'Incomplete font download' }
            } finally {
                if ($output) { $output.Dispose() }
                if ($stream) { $stream.Dispose() }
                $response.Close()
            }
            $stage = 'Verify downloaded archive SHA-256'
            if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256) {
                throw 'Font archive SHA-256 mismatch; no downloaded font installed'
            }
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
            $stage = 'Extract and verify font files'
            # Select known entries directly; never extract paths supplied by the ZIP.
            foreach ($file in $missing) {
                $entry = @($archive.Entries | Where-Object { $_.FullName -ceq ('fonts/ttf/' + $file.name) })
                if ($entry.Count -ne 1 -or $entry[0].Length -gt 2MB) { throw "Invalid/missing font entry: $($file.name)" }
                $staged = Join-Path $temporaryRoot $file.name
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry[0], $staged)
                if ((Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw 'TTF SHA-256 mismatch' }
            }
            $archive.Dispose()
            $archive = $null
        }
        $stage = 'Install verified personal font files'
        New-Item -ItemType Directory -Path $fontDirectory -Force | Out-Null
        foreach ($file in $missing) {
            # No overwrite: another installer or a personal font may have appeared during download.
            [IO.File]::Copy((Join-Path $temporaryRoot $file.name), (Join-Path $fontDirectory $file.name), $false)
        }
    } else { Write-Host '  Verified existing font files; no download needed.' }

    $stage = 'Load Windows font APIs'
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MansurFontNative {
    [DllImport("gdi32.dll", EntryPoint = "AddFontResourceExW", CharSet = CharSet.Unicode)]
    public static extern int AddFontResource(string path, uint flags, IntPtr reserved);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessageTimeout(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
}
'@
    if (-not (Test-Path -LiteralPath $registryPath)) { New-Item -Path $registryPath | Out-Null }
    $completed = 0
    foreach ($file in $manifest.files) {
        $stage = "Register and load $($file.name)"
        $target = Join-Path $fontDirectory $file.name
        if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw 'Installed TTF verification failed' }
        $style = [IO.Path]::GetFileNameWithoutExtension($file.name).Substring('JetBrainsMono-'.Length)
        $key = "JetBrains Mono $style (TrueType)"
        $existing = Get-ItemProperty -LiteralPath $registryPath -Name $key -ErrorAction SilentlyContinue
        if ($existing -and $existing.$key -ne $target) { throw "Existing font registration differs: $key" }
        if (-not $existing) { New-ItemProperty -LiteralPath $registryPath -Name $key -Value $target -PropertyType String | Out-Null }
        if ((Get-ItemProperty -LiteralPath $registryPath -Name $key).$key -ne $target) { throw 'Font registry readback failed' }
        if ([MansurFontNative]::AddFontResource($target, 0, [IntPtr]::Zero) -eq 0) { throw "Windows could not load font: $target" }
        $completed++
        Write-Host "  Font [$completed/16]: $($file.name) verified and registered"
    }
    $messageResult = [UIntPtr]::Zero
    [void][MansurFontNative]::SendMessageTimeout([IntPtr]0xffff, 0x001d, [UIntPtr]::Zero, [IntPtr]::Zero, 2, 2000, [ref]$messageResult)
    Write-Host '  JetBrains Mono ready for the current Windows user. No administrator rights or winget needed.'
    exit 0
} catch {
    $fontError = $_
    if ($ErrorReportPath) {
        try {
            $report = @{ stage = $stage; message = $fontError.Exception.Message } | ConvertTo-Json -Compress
            [IO.File]::WriteAllText($ErrorReportPath, $report, [Text.UTF8Encoding]::new($false))
        } catch { Write-Warning 'Could not save font error details; see the error below.' }
    }
    Write-Error ("Font stage '{0}' failed: {1}" -f $stage, $fontError.Exception.Message) -ErrorAction Continue
    exit 1
} finally {
    if ($archive) { $archive.Dispose() }
    if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
}
