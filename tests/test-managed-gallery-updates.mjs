import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const updates = require('../extensions/workstation-stability/gallery-updates.cjs');
const root = path.resolve(import.meta.dirname, '..');
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-gallery-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const source = path.join(base, 'source');
  for (const relative of updates.SOURCES) {
    const target = path.join(source, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, relative), target);
  }
  const extensionsDir = path.join(base, 'extensions'); fs.mkdirSync(extensionsDir);
  const index = [{ identifier: { id: 'usernamehw.errorlens' }, version: '3.29.0', metadata: { pinned: true, source: 'vsix' } },
    { identifier: { id: 'foreign.private' }, version: '1.0.0', metadata: { pinned: true } }];
  const indexFile = path.join(extensionsDir, 'extensions.json'); fs.writeFileSync(indexFile, JSON.stringify(index));
  const plan = updates.createPlan(source, { extensionsDir, nodeExe: process.execPath, cliPath: process.execPath },
    [{ id: 'usernamehw.errorlens', source: 'gallery' }, { id: 'oxc.oxc-vscode', source: 'gallery' }], { version: '1.107.0', platform: 'win32-x64' });
  const profileFile = path.join(base, 'editor-profile.json');
  const profile = { schema: 1, requestId: crypto.randomUUID(), galleryUpdates: plan };
  const save = () => fs.writeFileSync(profileFile, JSON.stringify(profile)); save();
  return { base, source, profileFile, profile, save, index, indexFile };
}
test('Managed updater uses production latest policy, preserves foreign pins and does not reinstall removed extensions', t => {
  const f = fixture(t); let installs = 0;
  const engine = {
    getInstalledExtensions() { return f.index.map(item => ({ id: item.identifier.id, version: item.version })); },
    installExtension(_cli, id, options) {
      installs++; assert.equal(id, 'usernamehw.errorlens'); assert.equal(options.trackLatest, true);
      assert.equal(updates.runUpdates(f.profileFile, { engine }).state, 'waiting-for-installer');
      f.index[0].version = '3.30.0'; fs.writeFileSync(f.indexFile, JSON.stringify(f.index));
      return { success: true };
    },
  };
  const result = updates.runUpdates(f.profileFile, { engine });
  assert.equal(result.state, 'checked'); assert.equal(installs, 1);
  assert.deepEqual(result.updated, [{ id: 'usernamehw.errorlens', from: '3.29.0', to: '3.30.0' }]);
  assert.deepEqual(result.skipped, ['oxc.oxc-vscode']);
  assert.equal(f.index[1].metadata.pinned, true);
  assert.equal(result.nativeState[0].pinned, true, 'Own updater is not falsely reported as native unpinning');
  const excluded = updates.runUpdates(f.profileFile, { engine, exclude: ['usernamehw.errorlens'] });
  assert.deepEqual(excluded.ids, []); assert.equal(installs, 1);
  assert.equal(fs.existsSync(path.join(f.base, 'install.lock')), false);
});
test('Changed source or an unmanaged ID fails before any engine call', t => {
  const f = fixture(t);
  f.profile.galleryUpdates.ids.push('foreign.private'); f.save();
  assert.throws(() => updates.runUpdates(f.profileFile), /unmanaged extension/);
  f.profile.galleryUpdates.ids.pop(); f.save();
  fs.appendFileSync(path.join(f.source, 'lib/extensions.js'), '\n');
  assert.throws(() => updates.runUpdates(f.profileFile), /source changed/);
});
test('Metadata/update failures are not reported as successful freshness', t => {
  const f = fixture(t);
  const result = updates.runUpdates(f.profileFile, { engine: {
    getInstalledExtensions() { return [{ id: 'usernamehw.errorlens', version: '3.29.0' }]; },
    installExtension() { return { success: false, error: 'metadata network failure' }; },
  } });
  assert.equal(result.state, 'failed'); assert.deepEqual(result.updated, []);
  assert.match(result.failures[0], /network failure/);
});

test('Updater refreshes compatibility from the actual IDE rather than pinning its setup-time target', t => {
  const f = fixture(t);
  f.profile.galleryUpdates.ideRoot = f.base; f.save();
  const target = { version: '1.108.0', platform: 'win32-arm64' };
  const result = updates.runUpdates(f.profileFile, { engine: {
    galleryTarget(options) { assert.equal(options.ideRoot, f.base); return target; },
    getInstalledExtensions() { return [{ id: 'usernamehw.errorlens', version: '3.29.0' }]; },
    installExtension(_cli, _id, options) { assert.deepEqual(options.target, target); return { success: true }; },
  } });
  assert.deepEqual(result.target, target);
});

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function watcher(t, f, execute, settings = {}) {
  const context = { subscriptions: [] }, lines = [];
  t.after(() => context.subscriptions.forEach(item => item.dispose()));
  updates.watchGalleryUpdates({ workspace: { getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback }) } },
    context, { appendLine: line => lines.push(line) }, { profileFile: f.profileFile, startupDelayMs: 1, intervalMs: 10, execFile: execute });
  return { context, lines, file: path.join(f.base, 'gallery-update-status.json') };
}
test('Watcher persists one verified daily result, passes exclusions, and stops on disposal', async t => {
  const f = fixture(t); let calls = 0;
  const w = watcher(t, f, (_exe, args, _options, callback) => {
    calls++; assert.deepEqual(JSON.parse(args[2]), ['usernamehw.errorlens']);
    callback(null, 'CLI output\nWORKSTATION_GALLERY_UPDATE_RESULT=' + JSON.stringify({ state: 'checked', updated: [] }));
  }, { autoUpdateExcludedExtensions: ['usernamehw.errorlens'] });
  await pause(70);
  assert.equal(calls, 1); assert.equal(JSON.parse(fs.readFileSync(w.file)).state, 'checked');
  w.context.subscriptions.forEach(item => item.dispose()); await pause(25); assert.equal(calls, 1);
});
test('Watcher does not send when disabled or commit a superseded asynchronous result', async t => {
  const disabled = fixture(t); let calls = 0;
  watcher(t, disabled, () => { calls++; }, { autoUpdateManagedExtensions: false });
  await pause(25); assert.equal(calls, 0);
  const f = fixture(t); let complete;
  const w = watcher(t, f, (_exe, _args, _options, callback) => { complete = callback; });
  await pause(25); assert.equal(typeof complete, 'function');
  f.profile.requestId = crypto.randomUUID(); f.save();
  w.context.subscriptions.forEach(item => item.dispose());
  complete(null, 'WORKSTATION_GALLERY_UPDATE_RESULT={"state":"checked"}');
  assert.equal(fs.existsSync(w.file), false);
});
