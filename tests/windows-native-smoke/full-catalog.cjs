'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repository = path.resolve(__dirname, '../..');

function assertHosted(platform = process.platform, env = process.env) {
  if (platform !== 'win32' || env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('Full-catalog registration is restricted to an isolated GitHub-hosted Windows runner; it must not run on a personal computer');
  }
}
function ownedDirectory(directory, tempRoot) {
  const relative = path.relative(path.resolve(tempRoot), path.resolve(directory));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Full-catalog fixtures must stay inside RUNNER_TEMP');
  return path.resolve(directory);
}
function wrapperText(executable, cliScript, userData, extensionsDir) {
  for (const value of [executable, cliScript, userData, extensionsDir]) {
    if (typeof value !== 'string' || !path.win32.isAbsolute(value) || /["%\r\n]/.test(value)) throw new Error('Unsafe full-catalog CLI wrapper path');
  }
  return ['@echo off', 'chcp 65001 >nul', 'setlocal', 'set "ELECTRON_RUN_AS_NODE=1"', 'set "VSCODE_IPC_HOOK_CLI="',
    `"${executable}" "${cliScript}" --user-data-dir "${userData}" --extensions-dir "${extensionsDir}" %*`,
    'exit /b %errorlevel%', ''].join('\r\n');
}
function writeReport(directory, report) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'full-catalog-result.json'), JSON.stringify(report, null, 2));
}

function verifyOfflineGalleryReuse(extensions, cli, catalog, options) {
  let attemptedDownloadsOrInstalls = 0;
  const snapshotCatalog = catalog.map(item => ({ ...item, trackLatest: false, allowCompatibleVersion: true }));
  const result = extensions.installGalleryExtensions(cli, snapshotCatalog, { ...options,
    install() {
      attemptedDownloadsOrInstalls++;
      throw new Error('Repeat setup must reuse installed compatible galleries without a downloader or CLI install');
    },
  });
  assert.equal(attemptedDownloadsOrInstalls, 0, 'A repeat gallery pass attempted a download or reinstall');
  assert.deepEqual(result.failures, [], 'Every installed mandatory gallery must pass the offline compatibility check');
  return { passed: true, requiredGalleryCount: catalog.filter(item => item.source === 'gallery' && !item.optional).length,
    attemptedDownloadsOrInstalls, optionalSkipped: result.skipped };
}

function verifyLatestGalleryReuse(extensions, cli, catalog, options) {
  const { spawnSync } = require('node:child_process');
  let metadataChecks = 0, forbiddenOperations = 0;
  const guardedRun = (executable, args, settings) => {
    if (args.includes('--metadata')) metadataChecks++;
    else if (args.some(arg => String(arg).endsWith('install-gallery-extension.cjs')) || args.includes('--install-extension')) {
      forbiddenOperations++;
      throw new Error('Repeat production update attempted a VSIX download or install');
    }
    return spawnSync(executable, args, settings);
  };
  const required = catalog.filter(item => item.source === 'gallery' && !item.optional);
  assert.ok(required.every(item => item.trackLatest === true), 'Repeat must use unchanged production trackLatest policy');
  const result = extensions.installGalleryExtensions(cli, catalog, { ...options,
    install: (command, id, settings) => extensions.installExtension(command, id, { ...settings, run: guardedRun,
      exec() { forbiddenOperations++; throw new Error('Repeat attempted a command-shell install'); } }),
  });
  assert.deepEqual(result.failures, []);
  assert.equal(forbiddenOperations, 0);
  assert.equal(metadataChecks, required.length);
  return { passed: true, trackLatest: true, metadataChecks, forbiddenOperations };
}

function main(ideRoot, executable, directory, artifactDirectory) {
  assertHosted();
  if (!process.env.RUNNER_TEMP) throw new Error('RUNNER_TEMP is required for hosted full-catalog verification');
  const fixtureRoot = ownedDirectory(path.join(directory, 'Full catalog fixture'), process.env.RUNNER_TEMP);
  const artifactRoot = ownedDirectory(artifactDirectory, process.env.RUNNER_TEMP);
  if (fs.existsSync(fixtureRoot)) throw new Error('Full-catalog verification requires a new disposable fixture directory');
  const { isIdeRunning } = require(path.join(repository, 'lib/mcp-permissions'));
  if (isIdeRunning()) throw new Error('Close the preceding actual IDE smoke normally before full-catalog CLI registration');
  assert.equal(path.dirname(path.resolve(executable)).toLowerCase(), path.resolve(ideRoot).toLowerCase());
  const compatibility = require(path.join(repository, 'lib/native-compatibility')).inspectNativeCompatibility({ ideRoot });
  assert.equal(compatibility.supported, true, JSON.stringify(compatibility));
  const extensions = require(path.join(repository, 'lib/extensions'));
  const target = extensions.galleryTarget({ ideRoot });
  const catalog = require(path.join(repository, 'config/extensions.json'));
  const required = require(path.join(repository, 'lib/extension-profiles')).selectExtensions(catalog, 'full').filter(item => !item.optional);
  assert.equal(required.length, 23, 'This verification must cover every mandatory extension in the workstation release');
  const home = path.join(fixtureRoot, 'User with spaces');
  const extensionsDir = path.join(home, '.antigravity-ide', 'extensions');
  const userData = path.join(home, 'AppData', 'Roaming', 'Antigravity IDE');
  const wrapper = path.join(fixtureRoot, 'owned editor wrapper.cmd');
  fs.mkdirSync(extensionsDir, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(wrapper, wrapperText(executable, path.join(ideRoot, 'resources/app/out/cli.js'), userData, extensionsDir));
  const previous = new Map();
  const environment = { USERPROFILE: home, HOME: home, APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local') };
  const startedAt = new Date().toISOString();
  const localResults = {}, failures = [];
  const log = line => console.log(line);
  try {
    // These values belong only to this test process and its CLI children. The
    // editor CLI receives explicit directories and never uses the runner profile.
    for (const [key, value] of Object.entries(environment)) { previous.set(key, process.env[key]); process.env[key] = value; }
    const panel = extensions.installCustomGithubPanel(wrapper, extensionsDir, path.join(repository, 'extensions/git-branch-panel'), { log });
    localResults['workstation.git-branch-panel'] = panel;
    if (!panel.success) failures.push('Git Branch Panel CLI registration failed');
    const gallery = extensions.installGalleryExtensions(wrapper, catalog, { extensionsDir, target, log });
    failures.push(...gallery.failures);
    for (const [id, folder, install] of [
      ['workstation.stability-helper', 'workstation-stability', extensions.installStabilityHelper],
      ['workstation.calm-typescript', 'calm-typescript', extensions.installBundledCalmTypeScript],
    ]) {
      try {
        const result = install(wrapper, extensionsDir, path.join(repository, 'extensions', folder), { log });
        localResults[id] = result;
        if (!result.success) failures.push(id + ' CLI registration failed: ' + (result.reason || 'unknown reason'));
      } catch (error) { failures.push(id + ': ' + error.message); }
    }
    assert.deepEqual(failures, [], 'Every production extension installer must succeed');
    const registered = extensions.getInstalledExtensions(wrapper, { strict: true });
    const index = JSON.parse(fs.readFileSync(path.join(extensionsDir, 'extensions.json'), 'utf8'));
    assert.ok(Array.isArray(index));
    const verified = required.map(item => {
      const active = registered.find(value => value.id === item.id.toLowerCase());
      assert.ok(active, 'Missing actual CLI registration: ' + item.id);
      if (item.source === 'local-vsix') assert.equal(active.version, item.version, item.id + ' source version');
      const entry = index.find(value => value?.identifier?.id?.toLowerCase() === item.id.toLowerCase() && value.version === active.version);
      assert.ok(entry, 'Missing package index entry: ' + item.id);
      assert.ok(typeof entry.relativeLocation === 'string' && !/[/\\]/.test(entry.relativeLocation), 'Unsafe registered package location');
      const packageFile = require(path.join(repository, 'lib/owned-files')).guard(extensionsDir, entry.relativeLocation + '/package.json');
      const manifest = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
      assert.equal((manifest.publisher + '.' + manifest.name).toLowerCase(), item.id.toLowerCase());
      assert.equal(manifest.version, active.version);
      assert.equal(require(path.join(repository, 'scripts/install-gallery-extension.cjs')).engineCompatible(manifest.engines?.vscode, target.version, target.date), true,
        item.id + ' must match the actual IDE engine');
      const platform = entry.metadata?.targetPlatform;
      assert.ok(!platform || platform === 'universal' || platform === target.platform, item.id + ' target platform');
      return { id: item.id, version: active.version, source: item.source, engine: manifest.engines.vscode,
        targetPlatform: platform || 'universal', packageJsonSha256: crypto.createHash('sha256').update(fs.readFileSync(packageFile)).digest('hex') };
    });
    assert.ok(!registered.some(value => value.id === 'ritwickdey.liveserver'), 'Live Server must not be installed');
    const repeatGallery = verifyLatestGalleryReuse(extensions, wrapper, catalog, { extensionsDir, target, log });
    const cleanPlan = extensions.selectCleanExtensionPackages({ extensionsDir, cliPath: wrapper }, catalog, { target });
    const cleanIndex = JSON.parse(fs.readFileSync(path.join(extensionsDir, 'extensions.json'), 'utf8'));
    const cleanIds = cleanIndex.filter(entry => cleanPlan.keepLocations.includes(entry.relativeLocation))
      .map(entry => entry.identifier.id.toLowerCase());
    const missingCleanPackages = required.filter(entry => !cleanIds.includes(entry.id.toLowerCase())).map(entry => entry.id);
    assert.deepEqual(missingCleanPackages, [], 'Clean setup must reuse every complete required package just installed by production installers');
    const cleanReuse = { passed: true, retainedPackageCount: cleanPlan.keepLocations.length, missingRequired: missingCleanPackages };
    assert.deepEqual(extensions.getInstalledExtensions(wrapper, { strict: true }), registered,
      'The repeat pass must preserve all registered versions');
    assert.equal(isIdeRunning(), false, 'CLI verification must not start a GUI IDE');
    const report = { passed: true, startedAt, completedAt: new Date().toISOString(), setupVersion: require(path.join(repository, 'package.json')).version,
      platform: process.platform, architecture: compatibility.architecture, vscodeEngine: target.version,
      requiredCount: required.length, verifiedCount: verified.length, registeredCount: registered.length,
      galleryCount: verified.filter(value => value.source === 'gallery').length, localCount: verified.filter(value => value.source === 'local-vsix').length,
      liveServerAbsent: true, productionInstallersUsed: true, guiOpened: false, verified, repeatGallery, cleanReuse,
      optionalSkipped: gallery.skipped, dependencyExtensions: registered.filter(value => !required.some(item => item.id.toLowerCase() === value.id)),
      localMethods: Object.fromEntries(Object.entries(localResults).map(([id, value]) => [id, value.method])),
      limitations: ['Actual CLI registration/package compatibility is verified. This stage does not activate every extension or authenticate third-party accounts.'] };
    writeReport(artifactRoot, report);
    console.log('PASS: all ' + report.verifiedCount + ' mandatory extensions registered by the actual official IDE CLI on ' + report.architecture + '.');
    return report;
  } catch (error) {
    const detail = require('./controller.cjs').redactLog(JSON.stringify({ error: error.stack || String(error), failures }));
    console.error('::error title=Full catalog diagnostic::' + detail.slice(0, 12000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'));
    writeReport(artifactRoot, { passed: false, startedAt, completedAt: new Date().toISOString(), target, failures,
      error: error.stack || String(error), localMethods: Object.fromEntries(Object.entries(localResults).map(([id, value]) => [id, value.method])) });
    throw error;
  } finally {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

if (require.main === module) {
  try { main(...process.argv.slice(2)); }
  catch (error) {
    const detail = require('./controller.cjs').redactLog(error.stack || String(error));
    console.error('::error title=Full catalog failure::' + detail.slice(0, 12000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'));
    process.exitCode = 1;
  }
}
module.exports = { assertHosted, ownedDirectory, wrapperText, verifyOfflineGalleryReuse, main };
