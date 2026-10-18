#Requires -Version 5.1
param([string]$CliPath, [string]$ExtensionsDir)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$source=$PSScriptRoot
$cli=$CliPath
$extensionRoot=$ExtensionsDir
if (-not $cli -or -not $extensionRoot) {
    $pathsModule=Join-Path (Split-Path (Split-Path $source -Parent) -Parent) 'lib\paths.js'
    if (-not (Test-Path -LiteralPath $pathsModule -PathType Leaf)) { throw 'Run workstation-setup.js install or supply -CliPath and -ExtensionsDir.' }
    $node=Get-Command node.exe -ErrorAction Stop
    $resolvedJson=& $node.Source -e 'console.log(JSON.stringify(require(process.argv[1]).getEnvironmentPaths()))' $pathsModule
    if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the Antigravity installation' }
    $resolved=$resolvedJson | ConvertFrom-Json
    if (-not $cli) { $cli=$resolved.cliPath }
    if (-not $extensionRoot) { $extensionRoot=$resolved.extensionsDir }
}
if (-not $cli) { throw 'Antigravity IDE CLI not found' }
if (-not (Test-Path -LiteralPath $cli)) { throw 'Antigravity IDE CLI not found' }
$manifest=Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$id=$manifest.publisher+'.'+$manifest.name
$installed=Join-Path $extensionRoot ($id+'-'+$manifest.version)

function Test-PanelFile { param([string]$Name)
  $target=Join-Path $installed $Name
  if(-not (Test-Path -LiteralPath $target)){return $false}
  if($Name -eq 'package.json'){
    $actual=Get-Content -LiteralPath $target -Raw -Encoding UTF8 | ConvertFrom-Json
    $actual.PSObject.Properties.Remove('__metadata')
    return (($actual | ConvertTo-Json -Depth 30 -Compress) -eq ($manifest | ConvertTo-Json -Depth 30 -Compress))
  }
  return ((Get-FileHash -LiteralPath $target).Hash -eq (Get-FileHash -LiteralPath (Join-Path $source $Name)).Hash)
}

$listed = cmd.exe /c "`"$cli`" --list-extensions --show-versions"
$same = $listed -contains ($id+'@'+$manifest.version)
foreach($name in @('package.json','extension.js','icon.png','README.md')) {
  $target=Join-Path $installed $name
  if (-not (Test-PanelFile $name)) { $same=$false }
}
if($same){Write-Output ('VERIFIED: already installed '+$id+'@'+$manifest.version+' in '+$extensionRoot);exit 0}

$backup=Join-Path $env:USERPROFILE ('.gemini\backups\github-panel-install-'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
if(Test-Path -LiteralPath $extensionRoot){Get-ChildItem -LiteralPath $extensionRoot -Directory | Where-Object {$_.Name -like ($id+'-*')} | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $backup $_.Name) -Recurse}}

function New-PanelVsix {
param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
$manifest=Get-Content -LiteralPath (Join-Path $Source 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$identity="$($manifest.publisher).$($manifest.name)"
$vsix=@"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="$identity" Version="$($manifest.version)" Publisher="$($manifest.publisher)"/><DisplayName>$($manifest.displayName)</DisplayName><Description xml:space="preserve">Antigravity Explorer extension</Description><Tags></Tags><Categories>Other</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="$($manifest.engines.vscode)"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>
"@
$types='<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="png" ContentType="image/png"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'
$stream=[System.IO.File]::Open($Output,[System.IO.FileMode]::Create)
$zip=[System.IO.Compression.ZipArchive]::new($stream,[System.IO.Compression.ZipArchiveMode]::Create)
try {
  # Write manifest and content types
  $textEntries=@{'extension.vsixmanifest'=$vsix;'[Content_Types].xml'=$types}
  foreach($name in $textEntries.Keys){
    $entry=$zip.CreateEntry($name)
    $writer=[System.IO.StreamWriter]::new($entry.Open(),[System.Text.UTF8Encoding]::new($false))
    try{$writer.Write($textEntries[$name])}finally{$writer.Dispose()}
  }

  # Write exact raw file bytes for extension code and manifest
  $fileEntries=@{
    'extension/package.json'=(Join-Path $Source 'package.json')
    'extension/extension.js'=(Join-Path $Source 'extension.js')
    'extension/icon.png'=(Join-Path $Source 'icon.png')
    'extension/README.md'=(Join-Path $Source 'README.md')
  }
  foreach($entryName in $fileEntries.Keys){
    $entry=$zip.CreateEntry($entryName)
    $entryStream=$entry.Open()
    $fileStream=[System.IO.File]::OpenRead($fileEntries[$entryName])
    try{
      $fileStream.CopyTo($entryStream)
    }finally{
      $fileStream.Dispose()
      $entryStream.Dispose()
    }
  }
} finally {$zip.Dispose();$stream.Dispose()}
Write-Output $Output
}

$archive=Join-Path $backup ($manifest.name+'-'+$manifest.version+'.vsix')
New-PanelVsix -Source $source -Output $archive
cmd.exe /c "`"$cli`" --install-extension `"$archive`" --force"
$installExit=$LASTEXITCODE
$listed = cmd.exe /c "`"$cli`" --list-extensions --show-versions"
if($listed -notcontains ($id+'@'+$manifest.version)){throw 'CLI did not register the expected extension version'}
foreach($name in @('package.json','extension.js','icon.png','README.md')) {
  if(-not (Test-PanelFile $name)){throw ('Installed file mismatch: '+$name)}
}
if($installExit -ne 0){Write-Warning ('CLI exited '+$installExit+' after installing; registration and both file hashes verified separately.')}
Write-Output ('VERIFIED: '+$id+'@'+$manifest.version+' in '+$extensionRoot)
Write-Output ('Backup: '+$backup)
