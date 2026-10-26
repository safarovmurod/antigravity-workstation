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
  if (emptyResponses === 3) return [];
  if (options.strict) throw new Error('Antigravity CLI extension inventory failed after 3 attempts: ' + (lastError?.message || 'unknown error'));
  return [];
}

function installGalleryExtensions(cliPath, catalog, options = {}) {
  const { dryRun = false, log = console.log, listInstalled = getInstalledExtensions,
    install = installExtension, extensionsDir = null } = options;
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
      try {
        log(`  Extension [${index + 1}/${required.length}]: ${ext.id}`);
        const trackLatest = ext.trackLatest === true;
        const already = installed.find(item => item.id === ext.id.toLowerCase()
          && (trackLatest || item.version === ext.version || ext.allowCompatibleVersion));
        const reusable = already && inspectReusableGalleryExtension(ext.id, already.version, extensionsDir, options.target, installed);
        let currentVersion = already?.version || ext.version;
        if (reusable && !trackLatest && options.refreshExisting !== true) {
          log(`  Extension ${ext.id}@${already.version} already installed and compatible; keeping it without a Marketplace download.`);
        } else {
          const result = install(cliPath, ext.id, { version: ext.version,
            allowCompatibleVersion: ext.allowCompatibleVersion, marketplaceFallback: ext.marketplaceFallback,
            trackLatest, dryRun, log, target: options.target, extensionsDir });
          if (!result.success) {
            failures.push('Extension failed: ' + ext.id + (result.error ? ': ' + result.error : ''));
            continue;
          }
          currentVersion = result.version || ext.version;
        }
        if (!dryRun) archiveStaleExtensionDirs(extensionsDir, ext.id, log, currentVersion, options.target?.platform,
          reusable && !trackLatest && options.refreshExisting !== true ? reusable.relativeLocation : undefined);
      } catch (error) {
        failures.push('Extension failed: ' + ext.id + ': ' + error.message);
        log('  ' + failures.at(-1));
      }
    }
  }
  return { failures, skipped: optional.map(ext => ext.id) };
}

function inspectReusableGalleryExtension(id, version, extensionsDir, target, inventory) {
  if (!extensionsDir || !target || !/^win32-(?:x64|arm64)$/.test(target.platform)
    || !/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(target.version)
    || !/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i.test(id)
    || !/^\d+\.\d+\.\d+(?:[-+][0-9a-z.+-]+)?$/i.test(version)
    || !Array.isArray(inventory) || !inventory.some(item => item.id === id.toLowerCase() && item.version === version)) return null;
  id = id.toLowerCase();
  const owned = require('./owned-files');
  const platformValue = value => value === undefined || value === 'undefined' || value === 'universal' ? null : value;
  try {
    const index = JSON.parse(fs.readFileSync(owned.guard(extensionsDir, 'extensions.json'), 'utf8'));
    if (!Array.isArray(index)) return null;
    const obsoleteFile = owned.guard(extensionsDir, '.obsolete');
    const obsolete = fs.existsSync(obsoleteFile) ? JSON.parse(fs.readFileSync(obsoleteFile, 'utf8')) : {};
    if (!obsolete || typeof obsolete !== 'object' || Array.isArray(obsolete)
      || Object.values(obsolete).some(value => typeof value !== 'boolean')) return null;
    const entries = index.filter(entry => entry?.identifier?.id?.toLowerCase() === id && entry.version === version);
    for (const entry of entries) {
      try {
        const location = entry.relativeLocation;
        const prefix = id + '-' + version.toLowerCase();
        if (typeof location !== 'string' || /[/\\]/.test(location)
          || !(location.toLowerCase() === prefix || location.toLowerCase().startsWith(prefix + '-'))
          || Object.entries(obsolete).some(([name, removed]) => name.toLowerCase() === location.toLowerCase() && removed)
          || !['gallery', 'vsix'].includes(entry.metadata?.source)) continue;
        const packageDir = owned.guard(extensionsDir, location);
        const manifest = JSON.parse(fs.readFileSync(owned.guard(packageDir, 'package.json'), 'utf8'));
        if (`${manifest.publisher}.${manifest.name}`.toLowerCase() !== id || manifest.version !== version) continue;
        const platforms = [entry.metadata?.targetPlatform, manifest.__metadata?.targetPlatform].map(platformValue).filter(Boolean);
        const suffix = location.slice(prefix.length);
        if (suffix && platformValue(suffix.slice(1).toLowerCase())) platforms.push(suffix.slice(1).toLowerCase());
        if (platforms.some(platform => platform !== target.platform)
          || !require('../scripts/install-gallery-extension.cjs').engineCompatible(manifest.engines?.vscode, target.version, target.date)) continue;
        if (manifest.extensionDependencies !== undefined && (!Array.isArray(manifest.extensionDependencies)
          || !manifest.extensionDependencies.every(dependency => typeof dependency === 'string'
            && (inventory.some(item => item.id === dependency.toLowerCase())
              || (Array.isArray(target.builtinExtensions) && target.builtinExtensions.includes(dependency.toLowerCase())))))) continue;
        const payload = [];
        if (manifest.main !== undefined) {
          if (typeof manifest.main !== 'string' || !manifest.main) continue;
          payload.push(manifest.main);
        }
        for (const key of ['themes', 'iconThemes', 'productIconThemes', 'grammars', 'snippets', 'languages']) {
          const values = manifest.contributes?.[key];
          if (values !== undefined && !Array.isArray(values)) throw new Error('Invalid installed contribution metadata');
          for (const value of values || []) {
            if (value.path !== undefined) payload.push(value.path);
            if (key === 'languages' && value.configuration !== undefined) payload.push(value.configuration);
          }
        }
        for (const localization of manifest.contributes?.localizations || []) {
          for (const translation of localization.translations || []) payload.push(translation.path);
        }
        if (!payload.length) continue;
        const intact = payload.every(relative => {
          if (typeof relative !== 'string' || !relative) return false;
          const clean = relative.replace(/^(?:\.\/)+/, '');
          const file = owned.guard(packageDir, clean);
          const candidates = relative === manifest.main ? [file, file + '.js', file + '.json', file + '.node', path.join(file, 'index.js')] : [file];
          return candidates.some(candidate => {
            owned.guard(packageDir, path.relative(packageDir, candidate).split(path.sep).join('/'));
            return fs.existsSync(candidate) && fs.statSync(candidate).isFile() && fs.statSync(candidate).size > 0;
          });
        });
        if (intact) return { version, relativeLocation: location };
      } catch {   }
    }
  } catch {   }
  return null;
}

function selectCleanExtensionPackages(env, catalog, options = {}) {
  const owned = require('./owned-files');
  const root = env.extensionsDir;
  if (!fs.existsSync(root)) return { keepLocations: [] };
  let index;
  try { index = JSON.parse(fs.readFileSync(owned.guard(root, 'extensions.json'), 'utf8')); }
  catch { index = []; }
  if (!Array.isArray(index)) index = [];
  const installed = options.listInstalled ? options.listInstalled(env.cliPath, { strict: true })
    : options.isolated ? index.filter(entry => typeof entry?.identifier?.id === 'string' && typeof entry.version === 'string')
      .map(entry => ({ id: entry.identifier.id.toLowerCase(), version: entry.version }))
      : getInstalledExtensions(env.cliPath, { strict: true });
  const target = options.target || (options.isolated ? null : galleryTarget(env));
  const required = catalog.filter(entry => entry.optional !== true);
  const candidates = new Map();
  function candidate(id, policy) {
    if (candidates.has(id)) return candidates.get(id);
    let found = null;
    for (const item of installed.filter(item => item.id === id && (!policy?.version || policy.trackLatest
      || policy.allowCompatibleVersion || item.version === policy.version))) {
      const match = inspectReusableGalleryExtension(id, item.version, root, target, installed);
      if (match) { found = match; break; }
    }
    if (policy?.source === 'local-vsix') {
      const locations = index.filter(entry => entry?.identifier?.id?.toLowerCase() === id && entry.version === policy.version)
        .map(entry => entry.relativeLocation);
      if (options.isolated) locations.push(id + '-' + policy.version, id + '-' + policy.version + '-universal');
      for (const location of locations) {
        if (typeof location !== 'string' || ![id + '-' + policy.version, id + '-' + policy.version + '-universal'].includes(location)
          || (!options.isolated && !installed.some(item => item.id === id && item.version === policy.version))) continue;
        try {
          const manifest = JSON.parse(fs.readFileSync(owned.guard(root, location + '/package.json'), 'utf8'));
          if (`${manifest.publisher}.${manifest.name}`.toLowerCase() === id && manifest.version === policy.version) {
            found = { version: policy.version, relativeLocation: location }; break;
          }
        } catch {   }
      }
    }
    if (found) {
      try { found.dependencies = JSON.parse(fs.readFileSync(owned.guard(root, found.relativeLocation + '/package.json'), 'utf8')).extensionDependencies || []; }
      catch { found = null; }
      if (found && (!Array.isArray(found.dependencies) || found.dependencies.some(value => typeof value !== 'string'))) found = null;
    }
    candidates.set(id, found);
    return found;
  }
  for (const entry of required) candidate(entry.id.toLowerCase(), entry);
  const keep = new Set();
  function closure(id, visiting, selected) {
    if (target?.builtinExtensions?.includes(id)) return true;
    if (visiting.has(id)) return true;
    const match = candidate(id);
    if (!match) return false;
    const next = new Set(visiting).add(id);
    for (const dependency of match.dependencies) if (!closure(dependency.toLowerCase(), next, selected)) return false;
    selected.add(match.relativeLocation);
    return true;
  }
  for (const entry of required) {
    const selected = new Set();
    if (closure(entry.id.toLowerCase(), new Set(), selected)) for (const location of selected) keep.add(location);
  }
  return { keepLocations: [...keep].sort() };
}

function installExtension(cliPath, extensionId, options = {}) {
  const { dryRun = false, log = console.log, version, allowCompatibleVersion = false, marketplaceFallback = false,
    trackLatest = false, run = spawnSync, listInstalled = getInstalledExtensions, exec = execSync, platform = process.platform } = options;
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
  if (trackLatest && !dryRun) {
    try {
      return installLatestFromMarketplace(cliPath, extensionId, { run, listInstalled, exec, log, platform, target: options.target, extensionsDir: options.extensionsDir });
    } catch (error) {
      log('  Latest version check failed: ' + error.message);
      return { success: false, error: error.message };
    }
  }
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
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-gallery-'));
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

function compareReleaseVersions(left, right) {
  const parse = value => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9a-z.-]+))?(?:\+[0-9a-z.-]+)?$/i.exec(value);
    if (!match) throw new Error('Invalid installed extension version: ' + value);
    return { core: match.slice(1, 4).map(BigInt), pre: match[4]?.split('.') };
  };
  const a = parse(left), b = parse(right);
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1;
  if (!a.pre || !b.pre) return a.pre ? -1 : b.pre ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) { if (BigInt(x) === BigInt(y)) continue; return BigInt(x) > BigInt(y) ? 1 : -1; }
    if (xn !== yn) return xn ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

function galleryTarget(env) {
  if (!env.ideRoot) throw new Error('IDE installation is required to select compatible extension versions');
  const app = path.join(env.ideRoot, 'resources/app');
  const metadata = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
  const product = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(metadata.version)) throw new Error('IDE VS Code engine version is invalid');
  const architecture = require('./native-compatibility').installationArchitecture(env.ideRoot);
  if (!['x64', 'arm64'].includes(architecture)) throw new Error('IDE architecture is unsupported');
  const builtinExtensions = [];
  const builtinRoot = path.join(app, 'extensions');
  if (fs.existsSync(builtinRoot)) for (const entry of fs.readdirSync(builtinRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const file = require('./owned-files').guard(builtinRoot, entry.name + '/package.json');
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      const id = `${manifest.publisher}.${manifest.name}`.toLowerCase();
      if (/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/.test(id)) builtinExtensions.push(id);
    } catch {   }
  }
  return { version: metadata.version, date: product.date || undefined, platform: 'win32-' + architecture, builtinExtensions };
}

function installLatestFromMarketplace(cliPath, extensionId, tools = {}) {
  const { run = spawnSync, listInstalled = getInstalledExtensions, exec = execSync, log = console.log } = tools;
  let selected;
  if (tools.target) {
    let metadata;
    for (let attempt = 1; attempt <= 3; attempt++) {
      metadata = run(process.execPath, [path.join(__dirname, '../scripts/install-gallery-extension.cjs'), '--metadata', extensionId, JSON.stringify(tools.target)],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 60000, env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
      if (!metadata.error && metadata.status === 0) break;
      const reason = metadata.error?.message || metadata.stderr || 'unknown error';
      const temporary = /HTTP (?:408|429|5\d\d)\b|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|timed? ?out/i.test(reason);
      if (!temporary || attempt === 3) throw new Error('Latest metadata check failed: ' + reason);
      log(`  Metadata attempt ${attempt}/3 failed for ${extensionId}; retrying the read-only compatible version check.`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 500);
    }
    selected = JSON.parse(metadata.stdout);
    if (!/^\d+\.\d+\.\d+$/.test(selected.version)) throw new Error('Invalid latest compatible version');
    log(`  ${extensionId}: latest compatible ${selected.version}; absolute latest stable ${selected.absoluteLatestVersion || 'not reported'}; ${selected.selectionReason || 'IDE target compatibility checked'}.`);
    const inventory = listInstalled(cliPath, { strict: true });
    const current = inventory.find(item => item.id === extensionId.toLowerCase());
    const reusable = current && inspectReusableGalleryExtension(extensionId, current.version, tools.extensionsDir, tools.target, inventory);
    if (reusable && compareReleaseVersions(current.version, selected.version) >= 0) {
      log(`  ${extensionId}@${current.version}: verified installed package; latest compatible ${selected.version}; no VSIX download.`);
      return { success: true, skipped: true, version: current.version, latestVersion: selected.version, metadataChecked: true };
    }
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-latest-'));
  try {
    const artifact = path.join(directory, extensionId + '-latest.vsix');
    log(`  Checking the official Marketplace for the latest ${extensionId}...`);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const downloadArgs = [path.join(__dirname, '../scripts/install-gallery-extension.cjs'), extensionId, selected?.version || 'latest', artifact];
      if (tools.target) downloadArgs.push(JSON.stringify(tools.target));
      const download = run(process.execPath, downloadArgs,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 720000,
          env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
      if (!download.error && download.status === 0) break;
      if (fs.existsSync(artifact)) fs.unlinkSync(artifact);
      const reason = download.error?.message || (download.stderr || '').trim() || 'latest VSIX download failed';
      if (attempt === 3) throw new Error('Latest download failed after 3 attempts: ' + reason);
      log(`  Latest download attempt ${attempt}/3 failed: ${reason}; retrying...`);
    }
    const manifest = require('../scripts/install-gallery-extension.cjs').readVsixManifest(fs.readFileSync(artifact), extensionId, undefined);
    if (selected && manifest.version !== selected.version) throw new Error('Downloaded version differs from verified compatible metadata');
    if (tools.target && !require('../scripts/install-gallery-extension.cjs').engineCompatible(manifest.engines?.vscode, tools.target.version, tools.target.date)) {
      throw new Error('Downloaded extension requires a different VS Code engine: ' + manifest.engines?.vscode);
    }
    const current = listInstalled(cliPath, { strict: true }).find(item => item.id === extensionId.toLowerCase());
    let currentCompatible = !tools.target;
    if (current && tools.target && tools.extensionsDir) {
      try {
        const index = JSON.parse(fs.readFileSync(require('./owned-files').guard(tools.extensionsDir, 'extensions.json'), 'utf8'));
        const entry = index.find(item => item?.identifier?.id?.toLowerCase() === extensionId.toLowerCase() && item.version === current.version);
        if (entry && typeof entry.relativeLocation === 'string' && !/[/\\]/.test(entry.relativeLocation)) {
          const installed = JSON.parse(fs.readFileSync(require('./owned-files').guard(tools.extensionsDir, entry.relativeLocation + '/package.json'), 'utf8'));
          const platform = entry.metadata?.targetPlatform;
          currentCompatible = `${installed.publisher}.${installed.name}`.toLowerCase() === extensionId.toLowerCase()
            && installed.version === current.version && (!platform || platform === 'universal' || platform === tools.target.platform)
            && require('../scripts/install-gallery-extension.cjs').engineCompatible(installed.engines?.vscode, tools.target.version, tools.target.date);
        }
      } catch { currentCompatible = false; }
    }
    if (!selected && current && currentCompatible && compareReleaseVersions(current.version, manifest.version) >= 0) {
      log(`  ${extensionId}@${current.version} is current or newer than Marketplace ${manifest.version}; skipping install.`);
      return { success: true, skipped: true, version: current.version, latestVersion: manifest.version };
    }
    log(`  Latest compatible is ${extensionId}@${manifest.version}${current ? ' (installed: ' + current.version + ')' : ''}; installing...`);
    const windowsCommand = tools.platform === 'win32' && /\.cmd$/i.test(cliPath);
    if (windowsCommand && /["%\r\n]/.test(cliPath + artifact)) throw new Error('Unsupported CLI/package path characters');
    let lastReason;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        let result;
        if (windowsCommand) {
          exec(`"${cliPath}" --install-extension "${artifact}" --force`, { windowsHide: true, stdio: 'inherit', timeout: 180000 });
          result = { status: 0 };
        } else {
          result = run(cliPath, ['--install-extension', artifact, '--force'], { stdio: 'inherit', windowsHide: true, timeout: 180000 });
        }
        if (result?.error || result?.status !== 0) throw new Error(result?.error?.message || 'CLI exited with code ' + result?.status);
        const registered = listInstalled(cliPath, { strict: true })
          .some(item => item.id === extensionId.toLowerCase() && item.version === manifest.version);
        if (!registered) throw new Error('Expected version is absent from the strict CLI inventory');
        log(`  Installed latest ${extensionId}@${manifest.version}.`);
        return { success: true, version: manifest.version };
      } catch (error) {
        lastReason = error.message;
        if (attempt < 3) {
          log(`  Installation attempt ${attempt}/3 failed for ${extensionId}: ${lastReason}; retrying the verified package...`);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 500);
        }
      }
    }
    throw new Error(`latest ${extensionId}@${manifest.version} did not register after 3 installation attempts: ${lastReason}`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function archiveStaleExtensionDirs(extensionsDir, id, log = console.log, currentVersion, targetPlatform, preferredLocation) {
  if (!extensionsDir) return [];
  if (!/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i.test(id)) throw new Error('Invalid extension identifier');
  if (targetPlatform !== undefined && !['win32-x64', 'win32-arm64'].includes(targetPlatform)) throw new Error('Unsupported IDE extension target platform');
  id = id.toLowerCase();
  const owned = require('./owned-files');
  const indexPath = owned.guard(extensionsDir, 'extensions.json');
  if (!fs.existsSync(indexPath)) return [];
  const originalIndex = fs.readFileSync(indexPath);
  const entries = JSON.parse(originalIndex.toString('utf8'));
  if (!Array.isArray(entries)) throw new Error('Invalid extension index');
  const active = entries.filter(entry => entry?.identifier?.id?.toLowerCase() === id);
  if (!active.length) return [];
  const candidates = currentVersion ? active.filter(entry => entry.version === currentVersion) : active;
  if (!candidates.length) throw new Error('Verified current extension version missing from index');
  const platform = targetPlatform || process.platform + '-' + process.arch;
  const preferred = (preferredLocation && candidates.find(entry => entry.relativeLocation === preferredLocation))
    || candidates.find(entry => entry.metadata?.targetPlatform === platform)
    || candidates.find(entry => !entry.metadata?.targetPlatform || entry.metadata.targetPlatform === 'universal');
  if (currentVersion && targetPlatform && !preferred) throw new Error('Verified current extension has no package compatible with the IDE architecture');
  const chosen = currentVersion ? [preferred || candidates[0]] : candidates;
  const keep = new Set();
  for (const entry of chosen) {
    const location = entry.relativeLocation;
    if (typeof location !== 'string' || /[/\\]/.test(location) || !location.toLowerCase().startsWith(id + '-')) throw new Error('Unsafe registered extension location');
    const current = owned.guard(extensionsDir, location + '/package.json');
    const manifest = JSON.parse(fs.readFileSync(current, 'utf8'));
    if (`${manifest.publisher}.${manifest.name}`.toLowerCase() !== id || manifest.version !== entry.version) throw new Error('Registered extension manifest mismatch');
    keep.add(location.toLowerCase());
  }
  const rootReal = fs.realpathSync(extensionsDir);
  const userHome = path.dirname(path.dirname(path.resolve(extensionsDir)));
  const backupRoot = owned.guard(userHome, '.gemini/backups');
  const backupPrefix = id === 'workstation.calm-typescript' ? 'calm-typescript-stale-' : 'extension-stale-';
  const batch = owned.guard(backupRoot, backupPrefix + Date.now() + '-' + crypto.randomUUID());
  if (currentVersion && active.length > 1) {
    fs.mkdirSync(batch, { recursive: true });
    fs.writeFileSync(path.join(batch, 'extensions-index.json'), originalIndex);
    if (!fs.readFileSync(indexPath).equals(originalIndex)) throw new Error('Extension index changed during cleanup; rerun setup');
    const normalized = entries.filter(entry => entry?.identifier?.id?.toLowerCase() !== id);
    normalized.push(chosen[0]);
    const temporary = owned.guard(extensionsDir, '.extensions-' + crypto.randomUUID() + '.tmp');
    try {
      fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2));
      fs.renameSync(temporary, indexPath);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    log('  Removed duplicate/old registrations for ' + id + '; index backup: ' + batch);
  }
  const archived = [];
  const knownPlatforms = ['universal', 'win32-x64', 'win32-arm64', 'win32-ia32', 'linux-x64', 'linux-arm64',
    'linux-armhf', 'alpine-x64', 'alpine-arm64', 'darwin-x64', 'darwin-arm64', 'web'];
  const registeredCanonicalLocation = name => active.some(entry => {
    if (typeof entry.relativeLocation !== 'string' || entry.relativeLocation.toLowerCase() !== name.toLowerCase()
      || typeof entry.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9a-z.+-]+)?$/i.test(entry.version)) return false;
    const expected = id + '-' + entry.version.toLowerCase();
    return name.toLowerCase() === expected || knownPlatforms.some(platform => name.toLowerCase() === expected + '-' + platform);
  });
  for (const entry of fs.readdirSync(rootReal, { withFileTypes: true })) {
    if (!entry.name.toLowerCase().startsWith(id + '-') || keep.has(entry.name.toLowerCase())) continue;
    const dir = owned.guard(extensionsDir, entry.name);
    if (!entry.isDirectory()) continue;
    const manifestPath = owned.guard(extensionsDir, entry.name + '/package.json');
    let manifest;
    if (fs.existsSync(manifestPath)) {
      try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
      catch {   }
    }
    if (manifest && typeof manifest.publisher === 'string' && manifest.publisher
      && typeof manifest.name === 'string' && manifest.name) {
      if (`${manifest.publisher}.${manifest.name}`.toLowerCase() !== id) {
        log('  Warning: preserved extension directory with a different manifest identity: ' + entry.name);
        continue;
      }
    } else if (!registeredCanonicalLocation(entry.name)) {
      log('  Warning: preserved unproven extension directory with missing or invalid package metadata: ' + entry.name);
      continue;
    }
    const backup = owned.guard(batch, entry.name);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.renameSync(dir, backup);
    archived.push(backup);
    log('  Archived old ' + id + ' directory: ' + backup);
  }
  return archived;
}

function installBundledCalmTypeScript(cliPath, extensionsDir, sourceDir, options = {}) {
  const { dryRun = false, isolated = false, log = console.log } = options;
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'manifest.json'), 'utf8'));
  const sourcePackage = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf8'));
  if (manifest.id !== 'workstation.calm-typescript' || !/^\d+\.\d+\.\d+$/.test(manifest.version)
    || manifest.version !== sourcePackage.version || sourcePackage.publisher + '.' + sourcePackage.name !== manifest.id) throw new Error('Unexpected Calm TypeScript identity');
  const artifact = path.join(sourceDir, 'calm-typescript-' + manifest.version + '.vsix');
  if (!fs.existsSync(artifact) || sha256(artifact) !== manifest.vsixSha256) throw new Error('Bundled Calm TypeScript VSIX hash mismatch');
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
      const readme = path.join(extensionsDir, location, 'README.md');
      return fs.existsSync(bundle) && sha256(bundle) === manifest.extensionBundleSha256
        && fs.existsSync(readme) && fs.readFileSync(readme).equals(fs.readFileSync(path.join(sourceDir, 'README.md')));
    });
  }
  function archiveUnregisteredOldVersions() {
    return archiveStaleExtensionDirs(extensionsDir, manifest.id, log, manifest.version);
  }

  if (isolated) {
    if (installedMatch(false)) return { success: true, unchanged: true, archived: archiveUnregisteredOldVersions() };
    fs.mkdirSync(extensionsDir, { recursive: true });
    const stage = fs.mkdtempSync(path.join(extensionsDir, '.calm-typescript-stage-'));
    try {
      const extractor = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'unzip';
      const args = process.platform === 'win32' ? ['-xf', artifact, '-C', stage] : ['-q', artifact, '-d', stage];
      const result = spawnSync(extractor, args, { windowsHide: true, encoding: 'utf8' });
      if (result.error || result.status !== 0) throw new Error('Cannot unpack bundled Calm TypeScript VSIX in isolated profile: ' + (result.error?.message || result.stderr.trim()));
      const source = path.join(stage, 'extension');
      const packageJson = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
      if (packageJson.publisher + '.' + packageJson.name !== manifest.id || packageJson.version !== manifest.version
        || sha256(path.join(source, 'dist/extension.cjs')) !== manifest.extensionBundleSha256) throw new Error('Calm TypeScript VSIX contents mismatch');
      const location = manifest.id + '-' + manifest.version + '-universal';
      require('./owned-files').guard(extensionsDir, location + '/package.json');
      const target = path.join(extensionsDir, location);
      const indexPath = path.join(extensionsDir, 'extensions.json');
      const indexBytes = fs.existsSync(indexPath) ? fs.readFileSync(indexPath) : null;
      const entries = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : [];
      if (!Array.isArray(entries)) throw new Error('Invalid isolated extension index');
      const next = entries.filter(entry => entry.identifier?.id?.toLowerCase() !== manifest.id);
      next.push({ identifier: { id: manifest.id }, version: manifest.version, relativeLocation: location });
      const previous = fs.existsSync(target) ? path.join(extensionsDir, '.calm-typescript-previous-' + crypto.randomUUID()) : null;
      if (previous) fs.renameSync(target, previous);
      try {
        fs.cpSync(source, target, { recursive: true, force: false });
        fs.writeFileSync(indexPath, JSON.stringify(next, null, 2));
        if (!installedMatch(false)) throw new Error('Calm TypeScript isolated registration/hash/README verification failed');
        return { success: true, method: 'isolated-unpacked', backup: previous, archived: archiveUnregisteredOldVersions() };
      } catch (error) {
        if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
        if (previous) fs.renameSync(previous, target);
        if (indexBytes !== null) fs.writeFileSync(indexPath, indexBytes);
        else if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);
        throw error;
      }
    } finally {
      const relative = path.relative(extensionsDir, stage);
      if (!relative.startsWith('..') && !path.isAbsolute(relative) && relative.startsWith('.calm-typescript-stage-')) fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  if (installedMatch()) { log('  Calm TypeScript ' + manifest.version + ' registered and bundle verified.'); return { success: true, unchanged: true, archived: archiveUnregisteredOldVersions() }; }
  const backupRoot = path.join(path.dirname(path.dirname(extensionsDir)), '.gemini/backups');
  const backup = path.join(backupRoot, 'calm-typescript-install-' + Date.now());
  const indexPath = path.join(extensionsDir, 'extensions.json');
  if (fs.existsSync(indexPath)) {
    const entries = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const old = entries.filter(entry => entry.identifier?.id?.toLowerCase() === manifest.id);
    if (old.length) {
      fs.mkdirSync(backup, { recursive: true });
      fs.copyFileSync(indexPath, path.join(backup, 'extensions-index.json'));
      for (const entry of old) {
        const location = entry.relativeLocation;
        if (typeof location !== 'string' || !location.startsWith(manifest.id + '-') || /[/\\]/.test(location)) throw new Error('Unsafe Calm TypeScript extension location');
        const directory = path.join(extensionsDir, location);
        if (fs.existsSync(directory)) {
          if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Linked Calm TypeScript directory unsupported');
          fs.cpSync(directory, path.join(backup, location), { recursive: true, force: false });
        }
      }
      log('  Previous Calm TypeScript package backed up: ' + backup);
    }
  }
  require('./verified-extension-install').installVerifiedExtension(cliPath, artifact, installedMatch, { log });
  return { success: true, method: 'vsix', archived: archiveUnregisteredOldVersions() };
}

function installCustomGithubPanel(cliPath, extensionsDir, panelSourceDir, options = {}) {
  const { dryRun = false, log = console.log } = options;
  const manifestPath = path.join(panelSourceDir, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`git-branch-panel package.json not found in ${panelSourceDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const fullName = `${manifest.publisher}.${manifest.name}-${manifest.version}`;
  const targetDir = path.join(extensionsDir, fullName);

  if (dryRun) {
    log(`  [DRY-RUN] Would package and install custom extension ${fullName} to ${targetDir}`);
    return { success: true, dryRun: true };
  }

  log(`  Installing custom extension: ${fullName}...`);

  const psScript = path.join(panelSourceDir, 'install-github-panel.ps1');
  if (!options.isolated && fs.existsSync(psScript) && (options.platform || process.platform) === 'win32') {
    let staged;
    try {
      const run = options.run || spawnSync;
      const listInstalled = options.listInstalled || getInstalledExtensions;
      let executionScript = psScript;
      if (psScript.length >= 200) {
        staged = require('./script-staging').stageScriptFiles(panelSourceDir, ['install-github-panel.ps1', 'package.json', 'extension.js', 'README.md', 'icon.png'], 'workstation-panel-');
        executionScript = path.join(staged.root, 'install-github-panel.ps1');
      }
      require('./verified-extension-install').runVerifiedInstall(() => run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', executionScript,
        '-CliPath', cliPath, '-ExtensionsDir', extensionsDir], {
        stdio: 'inherit',
        windowsHide: true,
        timeout: 180000,
        env: { ...process.env, PSModulePath: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules') },
      }), () => listInstalled(cliPath).some(item => item.id === `${manifest.publisher}.${manifest.name}`.toLowerCase() && item.version === manifest.version),
      { log, wait: options.wait });
      log(`  Custom extension ${fullName} installed and verified via VSIX.`);
      const archived = archiveStaleExtensionDirs(extensionsDir, `${manifest.publisher}.${manifest.name}`, log, manifest.version);
      return { success: true, method: 'vsix', archived };
    } catch (error) { log('  Git Branch Panel installation failed: ' + error.message); }
    finally { staged?.dispose(); }
  }

  if (!options.isolated) return { success: false, method: 'unregistered' };

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.copyFileSync(path.join(panelSourceDir, 'package.json'), path.join(targetDir, 'package.json'));
  fs.copyFileSync(path.join(panelSourceDir, 'extension.js'), path.join(targetDir, 'extension.js'));
  for (const name of ['README.md', 'icon.png']) fs.copyFileSync(path.join(panelSourceDir, name), path.join(targetDir, name));

  log(`  Custom extension copied directly to ${targetDir}`);
  return { success: true, method: 'isolated-copy' };
}

function installStabilityHelper(cliPath, extensionsDir, sourceDir, options = {}) {
  const { dryRun = false, log = console.log, isolated = false } = options;
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf8'));
  const id = manifest.publisher + '.' + manifest.name;
  if (id !== 'workstation.stability-helper' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Unexpected stability helper identity');
  const files = ['package.json', 'extension.js', 'maintenance.cjs', 'profile.cjs', 'repair-chat.cjs', 'questions.cjs', 'gallery-updates.cjs', 'README.md', 'icon.png'];
  const target = path.join(extensionsDir, id + '-' + manifest.version);
  require('./owned-files').guard(extensionsDir, id + '-' + manifest.version + '/package.json');
  if (dryRun) { log('  [DRY-RUN] Would register stability helper ' + id + '@' + manifest.version); return { success: true, dryRun: true }; }
  if (isolated) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of files) fs.copyFileSync(path.join(sourceDir, name), path.join(target, name));
    return { success: true, method: 'isolated-copy' };
  }
  if (!cliPath || !fs.existsSync(cliPath)) return { success: false, reason: 'IDE CLI unavailable' };
  const artifact = path.join(sourceDir, 'workstation-stability-' + manifest.version + '.vsix');
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
    require('./verified-extension-install').installVerifiedExtension(cliPath, artifact, sameInstalled, { log, timeout: 120000 });
  }
  if (!sameInstalled()) return { success: false, reason: 'Helper registration/source verification failed' };
  const maintenance = require(path.join(sourceDir, 'maintenance.cjs'));
  const repair = maintenance.runMaintenance({ extensionsDir, backupDir: path.join(path.dirname(path.dirname(extensionsDir)), '.gemini/backups/antigravity-extension-maintenance'), repair: true });
  log('  Stability helper registered; known fixes: ' + repair.targets.map(item => item.id + '=' + item.status).join(', '));
  if (repair.reviewRequired) log('  Unknown vendor versions/code preserved; review required.');
  const archived = archiveStaleExtensionDirs(extensionsDir, id, log, manifest.version);
  return { success: true, method: 'vsix', maintenance: repair, archived };
}

const RETIRED_EXTENSIONS = Object.freeze({
  'mancho.ts-mancho': 'workstation.calm-typescript',
  'mansur.antigravity-stability-helper': 'workstation.stability-helper',
  'mansur.mansur-github-panel': 'workstation.git-branch-panel',
  'ritwickdey.liveserver': null,
  'ms-mssql.mssql': null,
  'streetsidesoftware.code-spell-checker': null,
  'streetsidesoftware.code-spell-checker-russian': null,
});
function retireLegacyExtensions(env, options = {}) {
  const { dryRun = false, isolated = false, log = console.log, run = spawnSync, exec = execSync, listInstalled = getInstalledExtensions } = options;
  const owned = require('./owned-files');
  const root = owned.guard(path.dirname(env.extensionsDir), path.basename(env.extensionsDir));
  const indexFile = owned.guard(root, 'extensions.json');
  const bytes = fs.existsSync(indexFile) ? fs.readFileSync(indexFile) : Buffer.from('[]');
  const obsoleteFile = owned.guard(root, '.obsolete');
  const obsoleteBytes = fs.existsSync(obsoleteFile) ? fs.readFileSync(obsoleteFile) : null;
  const index = JSON.parse(bytes);
  if (!Array.isArray(index)) throw new Error('Invalid extension inventory during legacy retirement');
  const installed = !isolated && !dryRun ? listInstalled(env.cliPath, { strict: true }) : [];
  const directories = [];
  if (fs.existsSync(root)) for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const id = Object.keys(RETIRED_EXTENSIONS).find(name => entry.name.toLowerCase().startsWith(name + '-'));
    if (!id) continue;
    const directory = owned.guard(root, entry.name), manifestFile = owned.guard(directory, 'package.json');
    if (fs.existsSync(manifestFile)) {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      if (`${manifest.publisher}.${manifest.name}`.toLowerCase() !== id) continue;
    } else if (!/^\d+\.\d+\.\d+(?:[-+][0-9a-z.+-]+)?$/i.test(entry.name.slice(id.length + 1))) continue;
    directories.push({ id, name: entry.name, source: directory });
  }
  const discovered = Object.keys(RETIRED_EXTENSIONS).filter(id => directories.some(item => item.id === id)
    || index.some(item => item?.identifier?.id?.toLowerCase() === id) || installed.some(item => item.id === id));
  const preserved = discovered.filter(id => !RETIRED_EXTENSIONS[id]);
  if (preserved.length) log('  Preserving external extensions without verified Workstation ownership: ' + preserved.join(', '));
  const ids = discovered.filter(id => RETIRED_EXTENSIONS[id]);
  const retiringDirectories = directories.filter(item => ids.includes(item.id));
  if (!ids.length) return { retired: [], preserved, backup: null };
  for (const id of ids) {
    const replacement = RETIRED_EXTENSIONS[id];
    if (!replacement) continue;
    const registered = isolated ? index.some(item => item?.identifier?.id?.toLowerCase() === replacement)
      || fs.readdirSync(root).some(name => name.startsWith(replacement + '-')) : installed.some(item => item.id === replacement);
    if (!registered && !dryRun) throw new Error('Replacement must be registered before retiring ' + id);
  }
  if (dryRun) { log('  [DRY-RUN] Would archive retired extensions: ' + ids.join(', ')); return { retired: [], wouldRetire: ids, dryRun: true }; }
  const backup = owned.guard(env.backupsDir, 'retired-extensions-' + crypto.randomUUID());
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(backup, 'extensions.json'), bytes);
  if (obsoleteBytes !== null) fs.writeFileSync(owned.guard(backup, '.obsolete'), obsoleteBytes);
  const packages = owned.guard(backup, 'packages');
  fs.mkdirSync(packages);
  const snapshots = [];
  for (const item of retiringDirectories) {
    const copy = owned.guard(packages, item.name);
    const before = require('./extension-reset').inventory(item.source);
    fs.cpSync(item.source, copy, { recursive: true });
    if (JSON.stringify(before) !== JSON.stringify(require('./extension-reset').inventory(copy))) throw new Error('Retired extension backup verification failed: ' + item.id);
    snapshots.push({ name: item.name, inventory: before });
  }
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ format: 1, ids, snapshots,
    obsolete: { existed: obsoleteBytes !== null, sha256: obsoleteBytes === null ? null : crypto.createHash('sha256').update(obsoleteBytes).digest('hex') } }, null, 2));
  if (fs.existsSync(indexFile) && !fs.readFileSync(indexFile).equals(bytes)) throw new Error('Extension inventory changed during retirement; retry setup');
  const currentObsolete = fs.existsSync(obsoleteFile) ? fs.readFileSync(obsoleteFile) : null;
  if (obsoleteBytes === null ? currentObsolete !== null : currentObsolete === null || !currentObsolete.equals(obsoleteBytes)) {
    throw new Error('Extension removal markers changed during retirement; retry setup');
  }
  try {
    if (!isolated) for (const id of ids.filter(id => installed.some(item => item.id === id))) {
      if (process.platform === 'win32' && /\.cmd$/i.test(env.cliPath)) {
        if (/["%\r\n]/.test(env.cliPath)) throw new Error('Unsupported CLI path characters');
        exec(`"${env.cliPath}" --uninstall-extension "${id}"`, { stdio: 'inherit', windowsHide: true, timeout: 120000 });
      } else {
        const result = run(env.cliPath, ['--uninstall-extension', id], { stdio: 'inherit', windowsHide: true, timeout: 120000 });
        if (result.error || result.status !== 0) throw new Error('Could not uninstall retired extension ' + id);
      }
    }
    const remaining = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : [];
    if (!Array.isArray(remaining)) throw new Error('Extension inventory became invalid during retirement');
    const temporary = owned.guard(root, '.retirement-' + crypto.randomUUID() + '.tmp');
    try { fs.writeFileSync(temporary, JSON.stringify(remaining.filter(item => !ids.includes(item?.identifier?.id?.toLowerCase())), null, 2)); fs.renameSync(temporary, indexFile); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    const removed = owned.guard(backup, 'removed-tree');
    fs.mkdirSync(removed);
    for (const item of retiringDirectories) if (fs.existsSync(item.source)) fs.renameSync(item.source, owned.guard(removed, item.name));
    if (!isolated && listInstalled(env.cliPath, { strict: true }).some(item => ids.includes(item.id))) throw new Error('Retired extension remains registered');
    log('  Retired old extensions: ' + ids.join(', ') + '; backup: ' + backup);
    return { retired: ids, preserved, backup };
  } catch (error) {
    const targetObsolete = owned.guard(root, '.obsolete');
    if (obsoleteBytes !== null) fs.writeFileSync(targetObsolete, obsoleteBytes);
    else if (fs.existsSync(targetObsolete)) fs.unlinkSync(targetObsolete);
    for (const item of retiringDirectories) {
      const saved = owned.guard(packages, item.name);
      fs.cpSync(saved, item.source, { recursive: true });
    }
    fs.writeFileSync(indexFile, bytes);
    throw new Error(error.message + '; previous retired-extension packages/index restored from ' + backup);
  }
}

module.exports = {
  getInstalledExtensions,
  installGalleryExtensions,
  installExtension,
  installBundledCalmTypeScript,
  installCustomGithubPanel,
  installStabilityHelper,
  archiveStaleExtensionDirs,
  retireLegacyExtensions,
  galleryTarget,
  inspectReusableGalleryExtension,
  selectCleanExtensionPackages,
};
