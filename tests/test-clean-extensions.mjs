import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { beginExtensionReset, restoreExtensionReset, inventory } = require('../lib/extension-reset');
const { retireLegacyExtensions, selectCleanExtensionPackages, installGalleryExtensions } = require('../lib/extensions');
const { runInstaller } = require('../lib/installer');
const { getEnvironmentPaths } = require('../lib/paths');

function put(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-clean-test-'));
  t.after(() => {
    const target = path.resolve(base);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('workstation-clean-test-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  const customRoots = { userProfile: path.join(base, 'User with spaces'), gitBashPath: process.execPath };
  const env = getEnvironmentPaths(customRoots);
  put(path.join(env.extensionsDir, 'foreign.extension-1.0.0/package.json'), JSON.stringify({ publisher: 'foreign', name: 'extension', version: '1.0.0' }));
  put(path.join(env.extensionsDir, 'foreign.extension-1.0.0/payload.js'), 'ORIGINAL');
  put(path.join(env.extensionsDir, 'unregistered-old-copy/leftover'), 'KEEP IN BACKUP');
  put(path.join(env.extensionsDir, '.obsolete'), '{"foreign.extension-0.1.0":true}');
  put(path.join(env.extensionsDir, 'extensions.json'), JSON.stringify([{ identifier: { id: 'foreign.extension' }, version: '1.0.0', relativeLocation: 'foreign.extension-1.0.0' }]));
  put(path.join(env.userSettingsDir, 'globalStorage/credentials-untouched.txt'), 'PRIVATE FIXTURE TOKEN');
  return { base, env, customRoots };
}

test('Clean installation archives every package/index before reset and explicit recovery verifies exact original bytes', t => {
  const f = fixture(t), before = inventory(f.env.extensionsDir);
  const transaction = beginExtensionReset(f.env, { isolated: true });
  assert.deepEqual(inventory(f.env.extensionsDir), { files: {}, directories: [] });
  assert.deepEqual(inventory(path.join(transaction.backup, 'packages')), before);
  put(path.join(f.env.extensionsDir, 'new.extension-2.0.0/new.js'), 'NEW');
  transaction.commit();
  assert.equal(JSON.parse(fs.readFileSync(path.join(transaction.backup, 'manifest.json'))).state, 'committed');
  assert.equal(fs.existsSync(path.join(transaction.backup, 'removed-tree')), false, 'Keep one complete recovery snapshot, not two identical package trees');
  assert.equal(restoreExtensionReset(f.env, transaction.backup, { isolated: true }).restored, true);
  assert.deepEqual(inventory(f.env.extensionsDir), before);
  assert.equal(fs.readFileSync(path.join(f.env.userSettingsDir, 'globalStorage/credentials-untouched.txt'), 'utf8'), 'PRIVATE FIXTURE TOKEN');
});

test('A running IDE refuses clean reset before writing a backup or moving any extension', t => {
  const f = fixture(t), before = inventory(f.env.extensionsDir);
  assert.throws(() => beginExtensionReset(f.env, { isRunning: () => true }), /separate PowerShell/);
  assert.deepEqual(inventory(f.env.extensionsDir), before);
  assert.equal(fs.existsSync(f.env.backupsDir), false);
});

test('Clean preview is read-only and damaged backup refuses recovery before changing the new install', t => {
  const f = fixture(t), before = inventory(f.env.extensionsDir);
  assert.ok(beginExtensionReset(f.env, { isolated: true, dryRun: true }).wouldRemoveFiles > 0);
  assert.deepEqual(inventory(f.env.extensionsDir), before);
  const transaction = beginExtensionReset(f.env, { isolated: true });
  put(path.join(f.env.extensionsDir, 'current/retain.txt'), 'KEEP CURRENT');
  const current = inventory(f.env.extensionsDir);
  put(path.join(transaction.backup, 'packages/foreign.extension-1.0.0/payload.js'), 'CORRUPT');
  assert.throws(() => transaction.restore(), /checksum\/inventory mismatch/);
  assert.deepEqual(inventory(f.env.extensionsDir), current);
});

test('Clean mode installs current custom packages while default installation retains unrelated extensions', t => {
  const f = fixture(t);
  const options = { customRoots: f.customRoots, skipAgentBrowser: true, skipFont: true, skipPermissions: true, log() {} };
  const ordinary = runInstaller(options);
  assert.equal(ordinary.success, true, ordinary.failures.join('; '));
  assert.ok(fs.existsSync(path.join(f.env.extensionsDir, 'foreign.extension-1.0.0/payload.js')));
  const clean = runInstaller({ ...options, cleanExtensions: true });
  assert.equal(clean.success, true, clean.failures.join('; '));
  assert.equal(clean.backupInfo, null, 'An unchanged profile needs only the intentional extension reset archive');
  assert.equal(clean.extensionReset.committed, true);
  assert.equal(fs.existsSync(path.join(f.env.extensionsDir, 'foreign.extension-1.0.0')), false);
  assert.ok(fs.existsSync(path.join(clean.extensionReset.backup, 'packages/foreign.extension-1.0.0/payload.js')));
  assert.equal(fs.readFileSync(path.join(f.env.userSettingsDir, 'globalStorage/credentials-untouched.txt'), 'utf8'), 'PRIVATE FIXTURE TOKEN');
  const snapshots = fs.readdirSync(f.env.backupsDir).filter(name => name.startsWith('extension-reset-'));
  // The disposable profile has no IDE installation. Supply the actual built-in
  // dependency that production discovery reads from the IDE's package manifests.
  const selected = selectCleanExtensionPackages(f.env, require('../config/extensions.json'), { isolated: true,
    target: { version: '1.107.0', platform: 'win32-x64', builtinExtensions: ['vscode.git'] } });
  const repeat = beginExtensionReset(f.env, { ...selected, isolated: true });
  assert.equal(repeat.commit().unchanged, true);
  assert.equal(repeat.backup, null);
  assert.deepEqual(fs.readdirSync(f.env.backupsDir).filter(name => name.startsWith('extension-reset-')), snapshots);
});

test('A changed original or damaged snapshot is never deleted as a redundant clean-install copy', t => {
  for (const damaged of ['removed-tree', 'packages']) {
    const f = fixture(t), logs = [];
    const transaction = beginExtensionReset(f.env, { isolated: true, log: line => logs.push(line) });
    put(path.join(transaction.backup, damaged, 'foreign.extension-1.0.0/payload.js'), 'EDITED AFTER RESET');
    assert.equal(transaction.commit().duplicatePreserved, true);
    assert.ok(fs.existsSync(path.join(transaction.backup, 'removed-tree/foreign.extension-1.0.0/payload.js')));
    assert.ok(logs.some(line => /preserved changed\/unverified removed-tree/.test(line)));
  }
});

function galleryFixture(t) {
  const f = fixture(t);
  const entries = JSON.parse(fs.readFileSync(path.join(f.env.extensionsDir, 'extensions.json')));
  const installed = [{ id: 'foreign.extension', version: '1.0.0' }];
  const add = (id, dependencies = [], options = {}) => {
    const [publisher, name] = id.split('.'), version = '1.0.0', location = id + '-' + version + (options.suffix || '');
    put(path.join(f.env.extensionsDir, location, 'package.json'), JSON.stringify({ publisher, name, version,
      engines: { vscode: options.engine || '^1.100.0' }, main: './out/extension.js', extensionDependencies: dependencies }));
    put(path.join(f.env.extensionsDir, location, 'out/extension.js'), 'exports.activate = () => {};');
    entries.push({ identifier: { id }, version, relativeLocation: location, metadata: { source: 'gallery' } });
    installed.push({ id, version });
    fs.writeFileSync(path.join(f.env.extensionsDir, 'extensions.json'), JSON.stringify(entries));
    return location;
  };
  const target = { version: '1.107.0', platform: 'win32-x64', builtinExtensions: ['vscode.git'] };
  return { ...f, add, target, installed, entries };
}

test('Clean mode reuses a healthy required gallery and its dependency closure offline, then repeats without a new archive', t => {
  const f = galleryFixture(t), dependency = f.add('other.dependency', ['vscode.git']);
  const managed = f.add('managed.extension', ['other.dependency']);
  const catalog = [{ id: 'managed.extension', source: 'gallery', trackLatest: true }];
  const selected = selectCleanExtensionPackages(f.env, catalog, { target: f.target, listInstalled: () => f.installed });
  assert.deepEqual(selected.keepLocations, [managed, dependency].sort());
  const original = inventory(f.env.extensionsDir);
  const reset = beginExtensionReset(f.env, { ...selected, isolated: true });
  const index = JSON.parse(fs.readFileSync(path.join(f.env.extensionsDir, 'extensions.json')));
  const installed = index.map(entry => ({ id: entry.identifier.id, version: entry.version }));
  assert.deepEqual(installed.map(entry => entry.id).sort(), ['managed.extension', 'other.dependency']);
  assert.equal(fs.existsSync(path.join(f.env.extensionsDir, 'foreign.extension-1.0.0')), false);
  const result = installGalleryExtensions('fixture-cli', catalog, { extensionsDir: f.env.extensionsDir,
    target: f.target, listInstalled: () => installed, log() {},
    install() { assert.fail('Clean mode must reuse compatible installed packages without downloading them'); } });
  assert.deepEqual(result.failures, []);
  assert.equal(reset.commit().duplicatePreserved, false);
  assert.deepEqual(inventory(path.join(reset.backup, 'packages')), original);
  const beforeRepeat = inventory(f.env.extensionsDir), archives = fs.readdirSync(f.env.backupsDir);
  const again = beginExtensionReset(f.env, { ...selectCleanExtensionPackages(f.env, catalog,
    { target: f.target, listInstalled: () => installed }), isolated: true });
  assert.equal(again.commit().unchanged, true);
  assert.equal(again.backup, null);
  assert.deepEqual(inventory(f.env.extensionsDir), beforeRepeat);
  assert.deepEqual(fs.readdirSync(f.env.backupsDir), archives);
  assert.equal(reset.restore().restored, true, 'The sole verified snapshot still restores every removed package and exact original registry');
  assert.deepEqual(inventory(f.env.extensionsDir), original);
});

test('Clean reuse rejects a broken transitive dependency and a package for another architecture', t => {
  const f = galleryFixture(t);
  const dependency = f.add('other.dependency');
  f.add('managed.extension', ['other.dependency']);
  f.add('wrong.architecture', [], { suffix: '-win32-arm64' });
  fs.unlinkSync(path.join(f.env.extensionsDir, dependency, 'out/extension.js'));
  assert.deepEqual(selectCleanExtensionPackages(f.env, [
    { id: 'managed.extension', source: 'gallery', trackLatest: true },
    { id: 'wrong.architecture', source: 'gallery', trackLatest: true },
  ], { target: f.target, listInstalled: () => f.installed }).keepLocations, []);
});

test('Invalid clean mode combinations stop before modifying the profile', t => {
  const f = fixture(t), before = inventory(f.env.extensionsDir);
  for (const extra of [{ skipExtensions: true }, { rulesOnly: true }, { extensionProfile: 'lite' }]) {
    assert.throws(() => runInstaller({ customRoots: f.customRoots, cleanExtensions: true, ...extra }), /requires a full extension installation/);
  }
  assert.deepEqual(inventory(f.env.extensionsDir), before);
});

test('A failed fresh installation automatically restores every previous package and the exact registration index', t => {
  const f = fixture(t), before = inventory(f.env.extensionsDir);
  const repository = path.resolve(import.meta.dirname, '..'), brokenSource = path.join(f.base, 'Downloaded source');
  fs.mkdirSync(brokenSource);
  for (const name of ['package.json', 'config', 'rules', 'skills', 'agents', 'resources', 'extensions', 'scripts']) {
    fs.cpSync(path.join(repository, name), path.join(brokenSource, name), { recursive: true,
      filter: source => path.basename(source) !== 'node_modules' });
  }
  put(path.join(brokenSource, 'extensions/workstation-stability/package.json'), JSON.stringify({ publisher: 'wrong', name: 'helper', version: '1.0.0' }));
  const result = runInstaller({ customRoots: f.customRoots, repoRoot: brokenSource, cleanExtensions: true,
    skipAgentBrowser: true, skipFont: true, skipPermissions: true, log() {} });
  assert.equal(result.success, false);
  assert.ok(result.failures.some(message => /Unexpected stability helper identity/.test(message)));
  assert.equal(result.extensionReset.restored, true);
  assert.deepEqual(inventory(f.env.extensionsDir), before);
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.extensionReset.backup, 'manifest.json'))).state, 'restored');
});

test('Retiring legacy identities and Live Server preserves unrelated extensions and complete old source backups', t => {
  const f = fixture(t), entries = JSON.parse(fs.readFileSync(path.join(f.env.extensionsDir, 'extensions.json')));
  for (const [id, version] of [['mancho.ts-mancho', '3.2.1'], ['ritwickdey.liveserver', '5.7.9'], ['workstation.calm-typescript', '3.3.0']]) {
    const [publisher, name] = id.split('.'), relativeLocation = id + '-' + version;
    put(path.join(f.env.extensionsDir, relativeLocation, 'package.json'), JSON.stringify({ publisher, name, version }));
    entries.push({ identifier: { id }, version, relativeLocation });
  }
  put(path.join(f.env.extensionsDir, 'extensions.json'), JSON.stringify(entries));
  const result = retireLegacyExtensions(f.env, { isolated: true, log() {} });
  assert.deepEqual(result.retired.sort(), ['mancho.ts-mancho', 'ritwickdey.liveserver']);
  assert.ok(fs.existsSync(path.join(result.backup, 'packages/mancho.ts-mancho-3.2.1/package.json')));
  assert.equal(fs.existsSync(path.join(f.env.extensionsDir, 'mancho.ts-mancho-3.2.1')), false);
  assert.ok(fs.existsSync(path.join(f.env.extensionsDir, 'foreign.extension-1.0.0/payload.js')));
  assert.ok(fs.existsSync(path.join(f.env.extensionsDir, 'workstation.calm-typescript-3.3.0/package.json')));
});

test('Legacy retirement requires a verified replacement and failed CLI uninstall restores the saved index/packages', t => {
  const f = fixture(t);
  const old = { publisher: 'mancho', name: 'ts-mancho', version: '3.2.1' };
  put(path.join(f.env.extensionsDir, 'mancho.ts-mancho-3.2.1/package.json'), JSON.stringify(old));
  const before = inventory(f.env.extensionsDir);
  assert.throws(() => retireLegacyExtensions(f.env, { isolated: true, log() {} }), /Replacement must be registered/);
  assert.deepEqual(inventory(f.env.extensionsDir), before);
  assert.throws(() => retireLegacyExtensions(f.env, { log() {},
    listInstalled: () => [{ id: 'mancho.ts-mancho', version: '3.2.1' }, { id: 'workstation.calm-typescript', version: '3.3.0' }],
    run: () => ({ status: 1 }), exec() { throw new Error('CLI failed'); } }), /previous retired-extension packages\/index restored/);
  assert.deepEqual(inventory(f.env.extensionsDir), before);
});

for (const existed of [true, false]) {
  test('A later retirement failure restores exact removal markers, originally ' + (existed ? 'present' : 'absent'), t => {
    const f = fixture(t);
    const obsoleteFile = path.join(f.env.extensionsDir, '.obsolete');
    const originalMarkers = Buffer.from('\uFEFF{\r\n  "foreign.extension-0.1.0": true\r\n}\r\n');
    if (existed) fs.writeFileSync(obsoleteFile, originalMarkers);
    else fs.unlinkSync(obsoleteFile);
    const indexFile = path.join(f.env.extensionsDir, 'extensions.json');
    const entries = JSON.parse(fs.readFileSync(indexFile));
    for (const [id, version] of [['mancho.ts-mancho', '3.2.1'], ['ritwickdey.liveserver', '5.7.9']]) {
      const [publisher, name] = id.split('.');
      const relativeLocation = id + '-' + version;
      put(path.join(f.env.extensionsDir, relativeLocation, 'package.json'), JSON.stringify({ publisher, name, version }));
      entries.push({ identifier: { id }, version, relativeLocation });
    }
    fs.writeFileSync(indexFile, JSON.stringify(entries));
    const before = inventory(f.env.extensionsDir);
    let calls = 0;
    assert.throws(() => retireLegacyExtensions(f.env, { log() {},
      listInstalled: () => [{ id: 'mancho.ts-mancho', version: '3.2.1' },
        { id: 'ritwickdey.liveserver', version: '5.7.9' }, { id: 'workstation.calm-typescript', version: '3.3.0' }],
      run(_cli, args) {
        calls++;
        if (calls === 2) return { status: 1 };
        assert.deepEqual(args, ['--uninstall-extension', 'mancho.ts-mancho']);
        fs.writeFileSync(obsoleteFile, '{"mancho.ts-mancho-3.2.1":true}');
        fs.writeFileSync(indexFile, JSON.stringify(entries.filter(item => item.identifier.id !== 'mancho.ts-mancho')));
        const removed = path.join(f.env.extensionsDir, 'mancho.ts-mancho-3.2.1');
        fs.unlinkSync(path.join(removed, 'package.json'));
        fs.rmdirSync(removed);
        return { status: 0 };
      },
    }), /previous retired-extension packages\/index restored/);
    assert.equal(calls, 2, 'The first uninstall succeeded before a later uninstall failed');
    assert.deepEqual(inventory(f.env.extensionsDir), before, 'Every original package, registration and removal marker is restored');
    if (existed) assert.deepEqual(fs.readFileSync(obsoleteFile), originalMarkers, 'BOM, whitespace and newlines survive unchanged');
    else assert.equal(fs.existsSync(obsoleteFile), false, 'CLI-created removal markers are removed');
    const backup = fs.readdirSync(f.env.backupsDir).find(name => name.startsWith('retired-extensions-'));
    const manifest = JSON.parse(fs.readFileSync(path.join(f.env.backupsDir, backup, 'manifest.json')));
    assert.equal(manifest.obsolete.existed, existed);
    assert.equal(fs.existsSync(path.join(f.env.backupsDir, backup, '.obsolete')), existed);
  });
}
