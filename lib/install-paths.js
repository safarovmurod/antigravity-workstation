'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI_NAMES = ['antigravity-ide.cmd', 'antigravity.cmd', 'agy.cmd'];
const EXE_NAMES = ['Antigravity IDE.exe', 'Antigravity.exe', 'antigravity-ide.exe'];

function ideRootFromCli(cliPath, paths = path) {
  if (!cliPath) return null;
  const directory = paths.dirname(cliPath);
  return paths.basename(directory).toLowerCase() === 'bin' && /\.cmd$/i.test(cliPath)
    ? paths.dirname(directory) : directory;
}

function findAntigravity(options, io = {}) {
  const platform = io.platform || process.platform;
  const paths = platform === 'win32' ? path.win32 : path;
  const env = io.env || process.env;
  const exists = io.existsSync || fs.existsSync;
  const run = io.execFileSync || execFileSync;
  function probe(command, args) {
    try { return run(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 5000 }).trim(); }
    catch { return ''; }
  }
  function fromFile(file, verifyRoot = true) {
    if (!file || !exists(file)) return null;
    const ideRoot = ideRootFromCli(file, paths);
    if (verifyRoot && !exists(paths.join(ideRoot, 'resources', 'app', 'product.json'))) return null;
    return { cliPath: file, ideRoot };
  }
  function fromRoot(root) {
    if (!root) return null;
    for (const file of [...CLI_NAMES.map(name => paths.join(root, 'bin', name)), ...EXE_NAMES.map(name => paths.join(root, name))]) {
      const found = fromFile(file);
      if (found) return found;
    }
    return null;
  }
  function fromRegistration(value) {
    if (typeof value !== 'string') return null;
    const location = value.trim().replace(/,\s*-?\d+$/, '').replace(/^"(.*)"$/, '$1');
    return /\.exe$/i.test(location) ? fromRoot(paths.dirname(location)) : fromRoot(location);
  }
  function powershellLocations(script) {
    try {
      const result = JSON.parse(probe('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); ' + script]));
      return (Array.isArray(result) ? result : [result]).filter(value => typeof value === 'string');
    } catch { return []; }
  }

  if (options.cliPath) {
    const found = fromFile(options.cliPath, false);
    if (!found) throw new Error('Configured Antigravity CLI does not exist: ' + options.cliPath);
    return found;
  }
  const explicitRoot = options.ideRoot || (!options.isolated && env.ANTIGRAVITY_INSTALL_DIR);
  if (explicitRoot) {
    if (!paths.isAbsolute(explicitRoot) || (platform === 'win32' && !/^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(explicitRoot))) {
      throw new Error('ANTIGRAVITY_INSTALL_DIR must be the absolute installation folder: ' + explicitRoot);
    }
    const found = fromRoot(explicitRoot);
    if (!found) throw new Error('Antigravity executable not found in ANTIGRAVITY_INSTALL_DIR: ' + explicitRoot);
    return found;
  }
  if (platform === 'win32' && !options.isolated) {
    const processes = powershellLocations("$names=@('Antigravity IDE','Antigravity','antigravity-ide'); if($env:VSCODE_PID -match '^\\d+$'){ $p=Get-Process -Id ([int]$env:VSCODE_PID) -ErrorAction SilentlyContinue; if($p -and $names -contains $p.ProcessName){ $p.Path | ConvertTo-Json -Compress; exit } }; @(Get-Process -Name $names -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique) | ConvertTo-Json -Compress");
    for (const executable of processes) {
      const found = fromRegistration(executable);
      if (found) return found;
    }
  }
  if (platform === 'win32' && !options.isolated) {
    const registered = powershellLocations("$keys=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); $locations=@(Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^Antigravity( IDE)?($| )' } | ForEach-Object { $_.InstallLocation; $_.DisplayIcon }); foreach($hive in @('HKCU:','HKLM:')){ foreach($name in @('Antigravity IDE.exe','Antigravity.exe','antigravity-ide.exe')){ $key=Get-Item -LiteralPath ($hive+'\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\'+$name) -ErrorAction SilentlyContinue; if($key){ $locations+= $key.GetValue('') } } }; @($locations) | ConvertTo-Json -Compress");
    for (const location of registered) {
      const found = fromRegistration(location);
      if (found) return found;
    }
    for (const file of probe('where.exe', [...CLI_NAMES, ...EXE_NAMES]).split(/\r?\n/)) {
      const found = fromFile(file.trim());
      if (found) return found;
    }
  }
  const parents = [options.localAppData && paths.join(options.localAppData, 'Programs'), options.programFiles];
  if (!options.isolated) parents.push(env['ProgramFiles(x86)'], env.ProgramW6432);
  for (const parent of new Set(parents.filter(Boolean))) {
    for (const name of ['Antigravity IDE', 'Antigravity']) {
      const found = fromRoot(paths.join(parent, name));
      if (found) return found;
    }
  }
  return { cliPath: null, ideRoot: null };
}

module.exports = { findAntigravity, ideRootFromCli };
