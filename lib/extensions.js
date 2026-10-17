'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function getInstalledExtensions(cliPath, options = {}) {
  if (!cliPath || !fs.existsSync(cliPath)) {
    if (options.strict) throw new Error('Antigravity IDE CLI unavailable for extension inventory');
    return [];
  }
  let lastError, emptyResponses = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = execSync(`"${cliPath}" --list-extensions --show-versions`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        timeout: 30000,
      });
      const installed = out
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => /^[a-z0-9-]+\.[a-z0-9-]+@\d+\.\d+\.\d+(?:[-+][0-9a-z.+-]+)?$/i.test(line))
        .map(line => {
          const at = line.lastIndexOf('@');
          return {
            id: line.slice(0, at).toLowerCase(),
            version: line.slice(at + 1),
            raw: line,
          };
        });
      if (installed.length) return installed;
      if (!out.trim()) emptyResponses++;
      lastError = new Error('CLI returned no extension inventory');
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  // Retry transient empty responses, but a consistently successful empty listing
  // is legitimate for a newly installed IDE. Errors/warnings are not inventory.
  if (emptyResponses === 3) return [];
  if (options.strict) throw new Error('Antigravity CLI extension inventory failed after 3 attempts: ' + (lastError?.message || 'unknown error'));
  return [];
}

function installGalleryExtensions(cliPath, catalog, options = {}) {
  const { dryRun = false, log = console.log, listInstalled = getInstalledExtensions,
    install = installExtension } = options;
  const gallery = catalog.filter(ext => ext.source === 'gallery');
  const optional = gallery.filter(ext => ext.optional === true);
  for (const ext of optional) {
    log(`  Optional extension skipped: ${ext.id} (cursor decoration; not required for React/TypeScript).`);
  }
  const required = gallery.filter(ext => ext.optional !== true);
  const failures = [];
  if (required.length) {
    const installed = dryRun ? [] : listInstalled(cliPath, { strict: true });
    for (const [index, ext] of required.entries()) {
      log(`  Extension [${index + 1}/${required.length}]: ${ext.id}`);
      const already = installed.find(item => item.id === ext.id.toLowerCase()
        && (item.version === ext.version || ext.allowCompatibleVersion));
      if (already) {
        log(`  Extension ${ext.id}@${already.version} already installed${already.version === ext.version ? '.' : '; compatible fallback, preferred ' + ext.version + '.'}`);
      } else {
        const result = install(cliPath, ext.id, { version: ext.version,
          allowCompatibleVersion: ext.allowCompatibleVersion, marketplaceFallback: ext.marketplaceFallback, dryRun, log });
        if (!result.success) failures.push('Extension failed: ' + ext.id);
      }
    }
  }
  return { failures, skipped: optional.map(ext => ext.id) };
}

function installExtension(cliPath, extensionId, options = {}) {
  const { dryRun = false, log = console.log, version, allowCompatibleVersion = false, marketplaceFallback = false,
    run = spawnSync, listInstalled = getInstalledExtensions, exec = execSync, platform = process.platform } = options;
  if (dryRun) {
    log(`  [DRY-RUN] Would install extension: ${extensionId}`);
    return { success: true, dryRun: true };
  }
  if (!cliPath || !fs.existsSync(cliPath)) {
    throw new Error(`Antigravity IDE CLI not found for installing: ${extensionId}`);
  }

  log(`  Installing extension: ${extensionId}...`);
  if (!/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i.test(extensionId)) throw new Error('Invalid extension identifier');
  if (version && !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid extension version');
  function install(target) {
    if (platform === 'win32' && /\.cmd$/i.test(cliPath)) {
      try {
        exec(`"${cliPath}" --install-extension "${target}" --force`, { windowsHide: true, stdio: 'inherit' });
        return { status: 0 };
      } catch (error) { return { status: error.status, stdout: String(error.stdout || ''), stderr: String(error.stderr || '') }; }
    }
    return run(cliPath, ['--install-extension', target, '--force'], { stdio: 'inherit', windowsHide: true });
  }
  function registered(result, expectedVersion) {
    return result.status === 0 && listInstalled(cliPath).find(item => item.id === extensionId.toLowerCase() && (!expectedVersion || item.version === expectedVersion));
  }
  let result = install(version ? extensionId + '@' + version : extensionId);
  if (registered(result, version)) return { success: true };
  if (version && allowCompatibleVersion) {
    log(`  Preferred ${extensionId}@${version} unavailable; asking the IDE for its compatible gallery version...`);
    result = install(extensionId);
    const actual = registered(result);
    if (actual) {
      log(`  Registered ${extensionId}@${actual.version}; preferred snapshot version was ${version}.`);
      return { success: true, version: actual.version, exact: actual.version === version };
    }
  }
  if (marketplaceFallback) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-gallery-'));
    try {
      for (const requestedVersion of [...new Set([version || 'latest', ...(allowCompatibleVersion ? ['latest'] : [])])]) {
        try {
          log(`  Downloading official Marketplace VSIX: ${extensionId}@${requestedVersion}...`);
          const artifact = path.join(directory, extensionId + '-' + requestedVersion + '.vsix');
          const download = run(process.execPath, [path.join(__dirname, '../scripts/install-gallery-extension.cjs'), extensionId, requestedVersion, artifact],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 120000,
              env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
          if (download.error || download.status !== 0) throw new Error(download.error?.message || download.stderr?.trim() || 'VSIX download failed');
          const manifest = require('../scripts/install-gallery-extension.cjs').readVsixManifest(fs.readFileSync(artifact), extensionId,
            requestedVersion === 'latest' ? undefined : requestedVersion);
          result = install(artifact);
          if (registered(result, manifest.version)) {
            log(`  Registered official VSIX ${extensionId}@${manifest.version}; preferred version: ${version || 'latest'}.`);
            return { success: true, method: 'marketplace-vsix', version: manifest.version, exact: !version || manifest.version === version };
          }
          log(`  IDE did not register ${extensionId}@${manifest.version}; compatibility checks remain enabled.`);
        } catch (error) { log('  Marketplace fallback: ' + error.message); }
      }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
  return { success: false, code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function installBundledTsMancho(cliPath, extensionsDir, sourceDir, options = {}) {
  const { dryRun = false, isolated = false, log = console.log } = options;
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'manifest.json'), 'utf8'));
  if (manifest.id !== 'mancho.ts-mancho' || manifest.version !== '3.2.0') throw new Error('Unexpected TS MANCHO identity');
  const artifact = path.join(sourceDir, 'ts-mancho-' + manifest.version + '.vsix');
  if (!fs.existsSync(artifact) || sha256(artifact) !== manifest.vsixSha256) throw new Error('Bundled TS MANCHO VSIX hash mismatch');
  if (dryRun) { log('  [DRY-RUN] Would install ' + manifest.id + '@' + manifest.version); return { success: true, dryRun: true }; }
  if (!isolated && (!cliPath || !fs.existsSync(cliPath))) return { success: false, reason: 'Antigravity CLI unavailable' };
  function installedMatch(requireCli = true) {
    if (requireCli && !getInstalledExtensions(cliPath).some(item => item.id === manifest.id && item.version === manifest.version)) return false;
    const indexPath = path.join(extensionsDir, 'extensions.json');
    if (!fs.existsSync(indexPath)) return false;
    const entries = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    return entries.some(entry => {
      const location = entry.relativeLocation;
      if (entry.identifier?.id?.toLowerCase() !== manifest.id || entry.version !== manifest.version
        || typeof location !== 'string' || !location.startsWith(manifest.id + '-' + manifest.version)
        || /[/\\]/.test(location)) return false;
      const bundle = path.join(extensionsDir, location, 'dist/extension.cjs');
      return fs.existsSync(bundle) && sha256(bundle) === manifest.extensionBundleSha256;
    });
  }
  function archiveUnregisteredOldVersions() {
    const indexPath = path.join(extensionsDir, 'extensions.json');
    const entries = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (!Array.isArray(entries)) throw new Error('Invalid extension index');
    const registered = new Set(entries.filter(entry => entry.identifier?.id?.toLowerCase() === manifest.id).map(entry => entry.relativeLocation));
    const owned = require('./owned-files');
    const extensionRoot = fs.realpathSync(extensionsDir);
    const userHome = path.dirname(path.dirname(extensionRoot));
    const backupRoot = owned.guard(userHome, '.gemini/backups');
    const archived = [];
    for (const entry of fs.readdirSync(extensionRoot, { withFileTypes: true })) {
      if (!entry.name.startsWith(manifest.id + '-') || registered.has(entry.name)) continue;
      const old = owned.guard(extensionRoot, entry.name);
      if (!entry.isDirectory() || fs.realpathSync(old) !== old) throw new Error('Unsafe old TS MANCHO directory: ' + old);
      const backup = owned.guard(backupRoot, 'ts-mancho-stale-' + Date.now() + '-' + crypto.randomUUID() + '/' + entry.name);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.renameSync(old, backup);
      archived.push(backup);
      log('  Archived unregistered old TS MANCHO package: ' + backup);
    }
    return archived;
  }
  if (isolated) {
    // Exercise the bundled package in a fixture without touching the real IDE.
    if (installedMatch(false)) return { success: true, unchanged: true, archived: archiveUnregisteredOldVersions() };
    fs.mkdirSync(extensionsDir, { recursive: true });
    const stage = fs.mkdtempSync(path.join(extensionsDir, '.ts-mancho-stage-'));
    try {
      // Windows' tar supports ZIP; Git's and Linux's GNU tar do not.
      const extractor = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'unzip';
      const args = process.platform === 'win32' ? ['-xf', artifact, '-C', stage] : ['-q', artifact, '-d', stage];
      const result = spawnSync(extractor, args, { windowsHide: true, encoding: 'utf8' });
      if (result.error || result.status !== 0) throw new Error('Cannot unpack bundled TS MANCHO VSIX in isolated profile: ' + (result.error?.message || result.stderr.trim()));
      const source = path.join(stage, 'extension');
      const packageJson = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
      if (packageJson.publisher + '.' + packageJson.name !== manifest.id || packageJson.version !== manifest.version
        || sha256(path.join(source, 'dist/extension.cjs')) !== manifest.extensionBundleSha256) throw new Error('TS MANCHO VSIX contents mismatch');
      const location = manifest.id + '-' + manifest.version + '-universal';
      require('./owned-files').guard(extensionsDir, location + '/package.json');
      const target = path.join(extensionsDir, location);
      if (fs.existsSync(target)) throw new Error('Conflicting TS MANCHO fixture directory');
      fs.cpSync(source, target, { recursive: true, force: false });
      const indexPath = path.join(extensionsDir, 'extensions.json');
      const entries = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : [];
      if (!Array.isArray(entries)) throw new Error('Invalid isolated extension index');
      const next = entries.filter(entry => entry.identifier?.id?.toLowerCase() !== manifest.id);
      next.push({ identifier: { id: manifest.id }, version: manifest.version, relativeLocation: location });
      fs.writeFileSync(indexPath, JSON.stringify(next, null, 2));
      if (!installedMatch(false)) throw new Error('TS MANCHO isolated registration/hash verification failed');
      return { success: true, method: 'isolated-unpacked', archived: archiveUnregisteredOldVersions() };
    } finally {
      const relative = path.relative(extensionsDir, stage);
      if (!relative.startsWith('..') && !path.isAbsolute(relative) && relative.startsWith('.ts-mancho-stage-')) fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  if (installedMatch()) { log('  TS MANCHO ' + manifest.version + ' registered and bundle verified.'); return { success: true, unchanged: true, archived: archiveUnregisteredOldVersions() }; }
  const backupRoot = path.join(path.dirname(path.dirname(extensionsDir)), '.gemini/backups');
  const backup = path.join(backupRoot, 'ts-mancho-install-' + Date.now());
  const indexPath = path.join(extensionsDir, 'extensions.json');
  if (fs.existsSync(indexPath)) {
    const entries = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const old = entries.filter(entry => entry.identifier?.id?.toLowerCase() === manifest.id);
    if (old.length) {
      fs.mkdirSync(backup, { recursive: true });
      fs.copyFileSync(indexPath, path.join(backup, 'extensions-index.json'));
      for (const entry of old) {
        const location = entry.relativeLocation;
        if (typeof location !== 'string' || !location.startsWith(manifest.id + '-') || /[/\\]/.test(location)) throw new Error('Unsafe TS MANCHO extension location');
        const directory = path.join(extensionsDir, location);
        if (fs.existsSync(directory)) {
          if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Linked TS MANCHO directory unsupported');
          fs.cpSync(directory, path.join(backup, location), { recursive: true, force: false });
        }
      }
      log('  Previous TS MANCHO package backed up: ' + backup);
    }
  }
  if (process.platform === 'win32' && /\.cmd$/i.test(cliPath)) {
    if (/["%\r\n]/.test(cliPath + artifact)) throw new Error('Unsupported CLI/package path characters');
    execSync('"' + cliPath + '" --install-extension "' + artifact + '" --force', { stdio: 'inherit', windowsHide: true, timeout: 180000 });
  } else {
    const result = spawnSync(cliPath, ['--install-extension', artifact, '--force'], { stdio: 'inherit', windowsHide: true, timeout: 180000 });
    if (result.error || result.status !== 0) throw new Error('TS MANCHO CLI installation failed');
  }
  return installedMatch() ? { success: true, method: 'vsix', archived: archiveUnregisteredOldVersions() } : { success: false, reason: 'TS MANCHO package registration/hash verification failed' };
}

function installCustomGithubPanel(cliPath, extensionsDir, panelSourceDir, options = {}) {
  const { dryRun = false, log = console.log } = options;
  const manifestPath = path.join(panelSourceDir, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`mansur-github-panel package.json not found in ${panelSourceDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const fullName = `${manifest.publisher}.${manifest.name}-${manifest.version}`;
  const targetDir = path.join(extensionsDir, fullName);

  if (dryRun) {
    log(`  [DRY-RUN] Would package and install custom extension ${fullName} to ${targetDir}`);
    return { success: true, dryRun: true };
  }

  log(`  Installing custom extension: ${fullName}...`);

  // Preferred route: If install-github-panel.ps1 exists and PowerShell is available, run it
  const psScript = path.join(panelSourceDir, 'install-github-panel.ps1');
  if (!options.isolated && fs.existsSync(psScript) && (options.platform || process.platform) === 'win32') {
    try {
      const run = options.run || spawnSync;
      const listInstalled = options.listInstalled || getInstalledExtensions;
      const psRes = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript,
        '-CliPath', cliPath, '-ExtensionsDir', extensionsDir], {
        stdio: 'inherit',
        windowsHide: true,
        env: { ...process.env, PSModulePath: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules') },
      });
      if (psRes.status === 0 && listInstalled(cliPath).some(item => item.id === `${manifest.publisher}.${manifest.name}`.toLowerCase() && item.version === manifest.version)) {
        log(`  Custom extension ${fullName} installed and verified via VSIX.`);
        return { success: true, method: 'vsix' };
      }
    } catch (_) {}
  }

  if (!options.isolated) return { success: false, method: 'unregistered' };

  // Fallback direct copy to extensions directory
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.copyFileSync(path.join(panelSourceDir, 'package.json'), path.join(targetDir, 'package.json'));
  fs.copyFileSync(path.join(panelSourceDir, 'extension.js'), path.join(targetDir, 'extension.js'));

  log(`  Custom extension copied directly to ${targetDir}`);
  return { success: true, method: 'isolated-copy' };
}

function installStabilityHelper(cliPath, extensionsDir, sourceDir, options = {}) {
  const { dryRun = false, log = console.log, isolated = false } = options;
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf8'));
  const id = manifest.publisher + '.' + manifest.name;
  if (id !== 'mansur.antigravity-stability-helper' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Unexpected stability helper identity');
  const files = ['package.json', 'extension.js', 'maintenance.cjs', 'profile.cjs', 'README.md'];
  const target = path.join(extensionsDir, id + '-' + manifest.version);
  require('./owned-files').guard(extensionsDir, id + '-' + manifest.version + '/package.json');
  if (dryRun) { log('  [DRY-RUN] Would register stability helper ' + id + '@' + manifest.version); return { success: true, dryRun: true }; }
  if (isolated) {
    // Fixtures never invoke the real editor CLI or repair real extensions.
    fs.mkdirSync(target, { recursive: true });
    for (const name of files) fs.copyFileSync(path.join(sourceDir, name), path.join(target, name));
    return { success: true, method: 'isolated-copy' };
  }
  if (!cliPath || !fs.existsSync(cliPath)) return { success: false, reason: 'IDE CLI unavailable' };
  const artifact = path.join(sourceDir, 'mansur-antigravity-stability-' + manifest.version + '.vsix');
  if (!fs.existsSync(artifact)) throw new Error('Bundled stability VSIX missing');
  const expectedPackage = require(path.resolve(sourceDir, '../../scripts/package-stability.cjs')).buildVsix(path.resolve(sourceDir, '../..'));
  if (!fs.readFileSync(artifact).equals(expectedPackage.bytes)) throw new Error('Bundled helper package does not match its source');
  function sameInstalled() {
    const registered = getInstalledExtensions(cliPath).some(item => item.id === id && item.version === manifest.version);
    if (!registered || !fs.existsSync(path.join(target, 'package.json'))) return false;
    const actual = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    delete actual.__metadata;
    if (JSON.stringify(actual) !== JSON.stringify(manifest)) return false;
    return files.slice(1).every(name => fs.existsSync(path.join(target, name)) && fs.readFileSync(path.join(target, name)).equals(fs.readFileSync(path.join(sourceDir, name))));
  }
  if (!sameInstalled()) {
    // Backup the currently registered helper only, before replacing its package.
    const entriesFile = path.join(extensionsDir, 'extensions.json');
    const index = fs.existsSync(entriesFile) ? JSON.parse(fs.readFileSync(entriesFile, 'utf8')) : [];
    const backup = path.join(path.dirname(path.dirname(extensionsDir)), '.gemini/backups/stability-helper-' + Date.now());
    fs.mkdirSync(backup, { recursive: true });
    if (fs.existsSync(entriesFile)) fs.copyFileSync(entriesFile, path.join(backup, 'extensions-index.json'));
    for (const entry of index.filter(item => item.identifier?.id?.toLowerCase() === id)) {
      if (typeof entry.relativeLocation !== 'string' || !entry.relativeLocation.startsWith(id + '-') || /[/\\]/.test(entry.relativeLocation)) throw new Error('Unsafe registered helper location');
      const old = path.join(extensionsDir, entry.relativeLocation);
      if (fs.existsSync(old)) {
        if (fs.lstatSync(old).isSymbolicLink()) throw new Error('Linked helper directory unsupported');
        for (const name of files) {
          const oldFile = path.join(old, name);
          if (fs.existsSync(oldFile)) {
            if (fs.lstatSync(oldFile).isSymbolicLink()) throw new Error('Linked helper file unsupported');
            fs.copyFileSync(oldFile, path.join(backup, entry.relativeLocation + '-' + name));
          }
        }
      }
    }
    log('  Private helper backup: ' + backup);
    if (process.platform === 'win32' && /\.cmd$/i.test(cliPath)) {
      if (/["%\r\n]/.test(cliPath + artifact)) throw new Error('Unsupported CLI/package path characters');
      execSync('"' + cliPath + '" --install-extension "' + artifact + '" --force', { stdio: 'inherit', windowsHide: true, timeout: 120000 });
    } else {
      const result = spawnSync(cliPath, ['--install-extension', artifact, '--force'], { stdio: 'inherit', windowsHide: true, timeout: 120000 });
      if (result.error || result.status !== 0) throw new Error('Helper CLI installation failed');
    }
  }
  if (!sameInstalled()) return { success: false, reason: 'Helper registration/source verification failed' };
  // Repair immediately for an already-running IDE; activation also rechecks later.
  const maintenance = require(path.join(sourceDir, 'maintenance.cjs'));
  const repair = maintenance.runMaintenance({ extensionsDir, backupDir: path.join(path.dirname(path.dirname(extensionsDir)), '.gemini/backups/antigravity-extension-maintenance'), repair: true });
  log('  Stability helper registered; known fixes: ' + repair.targets.map(item => item.id + '=' + item.status).join(', '));
  if (repair.reviewRequired) log('  Unknown vendor versions/code preserved; review required.');
  return { success: true, method: 'vsix', maintenance: repair };
}

module.exports = {
  getInstalledExtensions,
  installGalleryExtensions,
  installExtension,
  installBundledTsMancho,
  installCustomGithubPanel,
  installStabilityHelper,
};
