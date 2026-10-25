import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { getEnvironmentPaths } = require('../lib/paths');
const { createBackup, listBackups } = require('../lib/backup');
const { captureNativeBackup, restoreSetup } = require('../lib/rollback');
const { update, TAB_TOPIC_KEY, readTabPolicies, readPolicies } = require('../lib/agent-automation');
const { TOPIC_KEY, stringField, readMcpPolicy, mergeMcpGrant } = require('../lib/mcp-permissions');
const source = process.env.WORKSTATION_ANTIGRAVITY_MAIN;
const entry = (key, value) => stringField(1, Buffer.concat([stringField(1, key), stringField(2, stringField(1, value))]));
const integer = value => Buffer.from([16, value]).toString('base64');
const topic = (...rows) => Buffer.concat(rows).toString('base64');

function put(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, contents);
}
function fixture(t, native = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-rollback-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = getEnvironmentPaths({ userProfile: path.join(root, 'User with spaces') });
  put(env.settingsJson, '// before\n{"editor.inlineSuggest.enabled": true}\n');
  if (native) {
    delete env.isWindows;
    env.ideRoot = path.join(root, 'IDE');
    const out = path.join(env.ideRoot, 'resources/app/out');
    put(path.join(out, 'main.js'), fs.readFileSync(source));
    put(path.join(out, '../product.json'), JSON.stringify({ ideVersion: '2.5.5' }));
    const dbFile = path.join(env.userSettingsDir, 'globalStorage/state.vscdb');
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const db = new DatabaseSync(dbFile);
    db.exec('CREATE TABLE ItemTable(key TEXT PRIMARY KEY,value TEXT)');
    db.prepare('INSERT INTO ItemTable VALUES(?,?)').run('private-account-row', 'PRIVATE-ACCOUNT-RETAIN');
    db.close();
  }
  const request = name => path.join(env.geminiConfigDir, 'workstation-setup', name, 'request.json');
  return { root, env, dbFile: path.join(env.userSettingsDir, 'globalStorage/state.vscdb'), request };
}
function setRow(file, key, value) {
  const db = new DatabaseSync(file);
  try { db.prepare('INSERT INTO ItemTable VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
  finally { db.close(); }
}
function readRow(file, key) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare('SELECT value FROM ItemTable WHERE key=?').get(key)?.value; }
  finally { db.close(); }
}
function quietBackup(f, files) {
  const directory = path.join(f.env.backupsDir, 'quiet-completion-' + randomUUID());
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const file of files) if (file.hadFile) put(path.join(directory, file.file), file.bytes);
  put(path.join(directory, 'manifest.json'), JSON.stringify({ format: 1, files: files.map(({ bytes, ...file }) => file) }));
  return directory;
}

test('File-only legacy restore cancels both published workers and reports missing native history', t => {
  const f = fixture(t), backup = createBackup(f.env);
  put(f.env.settingsJson, '{"updated":true}');
  const installOptions = path.join(f.env.geminiConfigDir, 'workstation-setup/install-options.json');
  put(installOptions, '{"extensionProfile":"lite"}');
  for (const name of ['automation', 'automation-v2']) put(f.request(name), JSON.stringify({ env: f.env, requestId: randomUUID() }));
  const restored = restoreSetup(backup.backupDir, f.env, { isRunning: () => false });
  assert.equal(restored.success, true); assert.equal(restored.complete, false);
  assert.equal(restored.native.available, false); assert.match(restored.native.reason, /no native preferences snapshot/);
  assert.equal(fs.readFileSync(f.env.settingsJson, 'utf8'), '// before\n{"editor.inlineSuggest.enabled": true}\n');
  assert.equal(fs.existsSync(installOptions), false);
  for (const name of ['automation', 'automation-v2']) assert.equal(JSON.parse(fs.readFileSync(f.request(name))).cancelled, true);
});

test('A manifest-less backup directory is rejected before anything is cancelled or deleted (K1 regression)', t => {
  const f = fixture(t), backup = createBackup(f.env);
  const empty = path.join(f.env.backupsDir, 'setup-backup-manual-empty-' + randomUUID());
  fs.mkdirSync(empty, { recursive: true });
  put(f.request('automation-v2'), JSON.stringify({ env: f.env, requestId: randomUUID() }));
  put(f.env.settingsJson, '{"changed":true}');
  assert.throws(() => restoreSetup(empty, f.env, { isRunning: () => false }), /manifest is missing/);
  assert.equal(JSON.parse(fs.readFileSync(f.request('automation-v2'))).cancelled, undefined, 'Pending work was not cancelled by a rejected restore');
  assert.equal(fs.readFileSync(f.env.settingsJson, 'utf8'), '{"changed":true}', 'Nothing was deleted');
  assert.equal(restoreSetup(backup.backupDir, f.env, { isRunning: () => false }).success, true, 'The real backup still restores');
});

test('A backup that lost a listed file refuses instead of pretending success (K1 regression)', t => {
  const f = fixture(t);
  const backup = createBackup(f.env);
  const manifest = JSON.parse(fs.readFileSync(path.join(backup.backupDir, 'backup-manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.ok(Object.keys(manifest.files).length > 0, 'The manifest inventories every backed-up file');
  fs.rmSync(path.join(backup.backupDir, 'settings.json'));
  put(f.env.settingsJson, '{"changed":true}');
  assert.throws(() => restoreSetup(backup.backupDir, f.env, { isRunning: () => false }), /incomplete[\s\S]*settings\.json/);
  assert.equal(fs.readFileSync(f.env.settingsJson, 'utf8'), '{"changed":true}', 'Nothing was deleted or restored');
  fs.writeFileSync(path.join(backup.backupDir, 'settings.json'), '{"tampered":1}');
  const result = restoreSetup(backup.backupDir, f.env, { isRunning: () => false });
  assert.equal(result.success, true);
  assert.deepEqual(result.files.corrupted, ['settings.json'], 'A post-backup modification is reported honestly');
});

test('Dry-run leaves files and pending requests byte-identical; open IDE defers restore after cancellation', t => {
  const f = fixture(t), backup = createBackup(f.env);
  put(f.env.settingsJson, '{"updated":true}');
  put(f.request('automation-v2'), JSON.stringify({ env: f.env, requestId: randomUUID() }));
  const request = fs.readFileSync(f.request('automation-v2'));
  assert.equal(restoreSetup(backup.backupDir, f.env, { dryRun: true, isRunning: () => false }).success, true);
  assert.equal(fs.readFileSync(f.env.settingsJson, 'utf8'), '{"updated":true}');
  assert.deepEqual(fs.readFileSync(f.request('automation-v2')), request);
  const result = restoreSetup(backup.backupDir, f.env, { isRunning: () => true });
  assert.equal(result.deferred, true); assert.equal(result.success, false);
  assert.equal(fs.readFileSync(f.env.settingsJson, 'utf8'), '{"updated":true}');
  assert.equal(JSON.parse(fs.readFileSync(f.request('automation-v2'))).cancelled, true);
});

test('Malformed linked snapshot rejects before cancelling pending work or touching configuration', t => {
  const f = fixture(t), backup = createBackup(f.env);
  const manifestFile = path.join(backup.backupDir, 'backup-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile));
  manifest.nativeAutomationBackup = '../outside'; put(manifestFile, JSON.stringify(manifest));
  put(f.request('automation-v2'), '{"cancelled":false}');
  put(f.env.settingsJson, '{"updated":true}');
  assert.throws(() => restoreSetup(backup.backupDir, f.env, { isRunning: () => false }), /Invalid linked native backup/);
  assert.equal(fs.readFileSync(f.request('automation-v2'), 'utf8'), '{"cancelled":false}');
  assert.equal(fs.readFileSync(f.env.settingsJson, 'utf8'), '{"updated":true}');
});

test('Quiet backups restore exact original settings and absent profile through the ordinary restore API', t => {
  const f = fixture(t), profile = path.join(f.env.geminiConfigDir, 'workstation-setup/editor-profile.json');
  const backup = quietBackup(f, [
    { target: f.env.settingsJson, hadFile: true, file: '0.json', bytes: '// original JSONC\n{}\n' },
    { target: profile, hadFile: false, file: '1.json' },
  ]);
  put(f.env.settingsJson, '{"editor.inlineSuggest.enabled":false}'); put(profile, '{"schema":1}');
  assert.equal(listBackups(f.env)[0].path, backup);
  const result = restoreSetup(backup, f.env, { isRunning: () => false });
  assert.equal(result.success, true); assert.equal(result.native.available, false);
  assert.equal(fs.readFileSync(f.env.settingsJson, 'utf8'), '// original JSONC\n{}\n');
  assert.equal(fs.existsSync(profile), false);
});

test('Quiet manifest cannot restore arbitrary paths and configuration-directory collisions fail prevalidation', t => {
  const f = fixture(t), foreign = path.join(f.root, 'foreign.txt'); put(foreign, 'PRIVATE');
  const backup = quietBackup(f, [{ target: foreign, hadFile: true, file: '0.json', bytes: 'overwrite' }]);
  assert.throws(() => restoreSetup(backup, f.env, { isRunning: () => false }), /Invalid quiet-completion backup target/);
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'PRIVATE');
  const setup = createBackup(f.env); fs.unlinkSync(f.env.settingsJson); fs.mkdirSync(f.env.settingsJson);
  assert.throws(() => restoreSetup(setup.backupDir, f.env, { isRunning: () => false }), /Expected a configuration file/);
});

test('An empty unlinked quiet backup is rejected instead of pretending it restored anything', t => {
  const f = fixture(t), backup = quietBackup(f, []);
  assert.throws(() => restoreSetup(backup, f.env, { isRunning: () => false }), /Empty quiet-completion backup has no linked native/);
});

test('Linked native snapshot omits all account/unowned state and unified restore retains later personal rows', { skip: !source }, t => {
  const f = fixture(t, true);
  setRow(f.dbFile, TOPIC_KEY, topic(entry('model', 'PRIVATE-MODEL'), entry('terminalAutoExecutionPolicySentinelKey', integer(1))));
  setRow(f.dbFile, TAB_TOPIC_KEY, topic(entry('tabEnabled', integer(2)), entry('personal-speed', 'PRIVATE-SPEED')));
  const backup = createBackup(f.env), captured = captureNativeBackup(f.env, backup.backupDir, { scope: 'all', includeMcp: true });
  assert.equal(captured.captured, true); assert.equal(fs.existsSync(path.join(captured.backup, 'state.vscdb')), false);
  const agentSaved = fs.readFileSync(path.join(captured.backup, 'agent-preferences.base64'), 'utf8');
  const tabSaved = fs.readFileSync(path.join(captured.backup, 'tab-preferences.base64'), 'utf8');
  assert.equal(Buffer.from(agentSaved, 'base64').includes(Buffer.from('PRIVATE-MODEL')), false);
  assert.equal(Buffer.from(tabSaved, 'base64').includes(Buffer.from('PRIVATE-SPEED')), false);
  assert.equal(update(f.env, { isRunning: () => false }).applied, true);
  setRow(f.dbFile, TOPIC_KEY, topic(entry('model', 'LATER-MODEL'), entry('terminalAutoExecutionPolicySentinelKey', integer(3)), entry('artifactReviewPolicySentinelKey', integer(2))));
  setRow(f.dbFile, TAB_TOPIC_KEY, topic(entry('tabEnabled', integer(1)), entry('tabToJump', integer(2)), entry('personal-speed', 'LATER-SPEED')));
  put(f.env.settingsJson, '{"changed":true}');
  const result = restoreSetup(backup.backupDir, f.env, { isRunning: () => false });
  assert.equal(result.success, true); assert.equal(result.complete, true); assert.equal(result.native.applied, true);
  assert.deepEqual(readPolicies(readRow(f.dbFile, TOPIC_KEY)), { terminalAutoExecutionPolicySentinelKey: 1 });
  assert.deepEqual(readTabPolicies(readRow(f.dbFile, TAB_TOPIC_KEY)), { tabEnabled: 2 });
  assert.ok(Buffer.from(readRow(f.dbFile, TOPIC_KEY), 'base64').includes(Buffer.from('LATER-MODEL')));
  assert.ok(Buffer.from(readRow(f.dbFile, TAB_TOPIC_KEY), 'base64').includes(Buffer.from('LATER-SPEED')));
  assert.equal(readRow(f.dbFile, 'private-account-row'), 'PRIVATE-ACCOUNT-RETAIN');
});

test('Completion-only linked quiet backup restores Tab and ghost text without parsing or rewriting chat', { skip: !source }, t => {
  const f = fixture(t, true);
  const opaqueChat = 'OPAQUE PRIVATE CHAT'; setRow(f.dbFile, TOPIC_KEY, opaqueChat);
  const backup = quietBackup(f, [{ target: f.env.settingsJson, hadFile: true, file: '0.json', bytes: fs.readFileSync(f.env.settingsJson) }]);
  const captured = captureNativeBackup(f.env, backup, { scope: 'completion' });
  assert.equal(captured.captured, true);
  assert.deepEqual(fs.readdirSync(captured.backup).sort(), ['manifest.json', 'tab-preferences.base64']);
  assert.equal(update(f.env, { scope: 'completion', isRunning: () => false }).applied, true);
  put(f.env.settingsJson, '{"editor.inlineSuggest.enabled":false}');
  const result = restoreSetup(backup, f.env, { isRunning: () => false });
  assert.equal(result.complete, true); assert.equal(result.native.applied, true);
  assert.equal(readRow(f.dbFile, TOPIC_KEY), opaqueChat);
  assert.equal(readRow(f.dbFile, TAB_TOPIC_KEY), undefined);
  assert.ok(fs.readFileSync(f.env.settingsJson, 'utf8').includes('true'));
});

test('Bare-install MCP plus Tab rollback preserves later terminal/artifact choices it never owned', { skip: !source }, t => {
  const f = fixture(t, true);
  const grants = (...items) => Buffer.concat(items).toString('base64');
  const before = topic(entry('terminalAutoExecutionPolicySentinelKey', integer(1)),
    entry('artifactReviewPolicySentinelKey', integer(1)),
    entry('permission_grants_global', grants(stringField(3, 'mcp(*)'), stringField(3, 'command(rm)'))));
  setRow(f.dbFile, TOPIC_KEY, before);
  const backup = createBackup(f.env);
  const saved = captureNativeBackup(f.env, backup.backupDir, { scope: 'all', includeMcp: true, includeAgentPolicies: false });
  const nativeManifest = JSON.parse(fs.readFileSync(path.join(saved.backup, 'manifest.json')));
  assert.equal(nativeManifest.includeAgentPolicies, false);
  const captured = fs.readFileSync(path.join(saved.backup, 'agent-preferences.base64'), 'utf8');
  assert.deepEqual(readPolicies(captured), {});
  assert.equal(readMcpPolicy(captured).conflicts, 1);
  let later = topic(entry('terminalAutoExecutionPolicySentinelKey', integer(2)),
    entry('artifactReviewPolicySentinelKey', integer(2)),
    entry('permission_grants_global', grants(stringField(3, 'command(rm)'), stringField(3, 'command(del)'))));
  later = mergeMcpGrant(later, { allow: ['mcp(*)'], replaceMcpAskAndDeny: true });
  setRow(f.dbFile, TOPIC_KEY, later);
  update(f.env, { scope: 'completion', isRunning: () => false });
  const result = restoreSetup(backup.backupDir, f.env, { isRunning: () => false });
  assert.equal(result.success, true); assert.equal(result.complete, true);
  const restored = readRow(f.dbFile, TOPIC_KEY);
  assert.deepEqual(readPolicies(restored), { terminalAutoExecutionPolicySentinelKey: 2, artifactReviewPolicySentinelKey: 2 });
  assert.equal(readMcpPolicy(restored).allowed, false); assert.equal(readMcpPolicy(restored).conflicts, 1);
  assert.ok(Buffer.from(restored, 'base64').includes(Buffer.from(grants(stringField(3, 'command(rm)'), stringField(3, 'command(del)'), stringField(3, 'mcp(*)')))));
  assert.equal(readRow(f.dbFile, TAB_TOPIC_KEY), undefined);
});

test('A native-only quiet backup with no editor files is listed and restored through the ordinary command', { skip: !source }, t => {
  const f = fixture(t, true), backup = quietBackup(f, []);
  const beforeSettings = fs.readFileSync(f.env.settingsJson);
  captureNativeBackup(f.env, backup, { scope: 'completion' });
  update(f.env, { scope: 'completion', isRunning: () => false });
  assert.equal(listBackups(f.env)[0].path, backup);
  const result = restoreSetup(backup, f.env, { isRunning: () => false });
  assert.equal(result.success, true); assert.equal(result.complete, true); assert.deepEqual(result.files.restored, []);
  assert.equal(readRow(f.dbFile, TAB_TOPIC_KEY), undefined);
  assert.deepEqual(fs.readFileSync(f.env.settingsJson), beforeSettings);
});

test('Quiet command cancels older all-scope work before its native-only linked backup and never touches chat', { skip: !source }, t => {
  const f = fixture(t, true);
  const { applyQuietCompletion, quietSettings } = require('../lib/quiet-completion');
  const managed = quietSettings({});
  put(f.env.settingsJson, JSON.stringify(managed));
  put(path.join(f.env.geminiConfigDir, 'workstation-setup/editor-profile.json'), JSON.stringify({
    schema: 1, requestId: randomUUID(), setupVersion: require('../package.json').version, locale: 'ru', settings: managed,
  }));
  const originalChat = 'OPAQUE CHAT MUST NEVER BE PARSED';
  setRow(f.dbFile, TOPIC_KEY, originalChat);
  setRow(f.dbFile, TAB_TOPIC_KEY, topic(entry('tabEnabled', integer(2)), entry('tabToJump', integer(1))));
  put(f.request('automation-v2'), JSON.stringify({ scope: 'all', requestId: randomUUID(), cancelled: false }));
  const beforeSettings = fs.readFileSync(f.env.settingsJson);
  const result = applyQuietCompletion(f.env, { queue(receivedEnv, options) {
    assert.equal(receivedEnv, f.env); assert.equal(options.scope, 'completion');
    assert.equal(JSON.parse(fs.readFileSync(f.request('automation-v2'))).cancelled, true);
    const linked = listBackups(f.env)[0];
    assert.deepEqual(linked.manifest.files, []); assert.ok(linked.manifest.nativeAutomationBackup);
    return update(f.env, { ...options, isRunning: () => false });
  } });
  assert.equal(result.success, true); assert.equal(result.editor.changed, false); assert.ok(result.editor.backup);
  assert.deepEqual(fs.readFileSync(f.env.settingsJson), beforeSettings);
  assert.equal(readRow(f.dbFile, TOPIC_KEY), originalChat);
  assert.equal(restoreSetup(result.editor.backup, f.env, { isRunning: () => false }).complete, true);
  assert.deepEqual(readTabPolicies(readRow(f.dbFile, TAB_TOPIC_KEY)), { tabEnabled: 2, tabToJump: 1 });
  assert.equal(readRow(f.dbFile, TOPIC_KEY), originalChat);
});

test('Native snapshot reads committed WAL and dry-run creates no snapshot or link', { skip: !source }, t => {
  const f = fixture(t, true), backup = createBackup(f.env);
  const db = new DatabaseSync(f.dbFile);
  try {
    db.exec('PRAGMA journal_mode=WAL');
    db.prepare('INSERT INTO ItemTable VALUES(?,?)').run(TAB_TOPIC_KEY, topic(entry('tabEnabled', integer(2))));
    const before = fs.readFileSync(path.join(backup.backupDir, 'backup-manifest.json'));
    const planned = captureNativeBackup(f.env, backup.backupDir, { scope: 'completion', dryRun: true });
    assert.equal(planned.wouldCapture, true);
    assert.deepEqual(fs.readFileSync(path.join(backup.backupDir, 'backup-manifest.json')), before);
    const saved = captureNativeBackup(f.env, backup.backupDir, { scope: 'completion' });
    assert.deepEqual(readTabPolicies(fs.readFileSync(path.join(saved.backup, 'tab-preferences.base64'), 'utf8')), { tabEnabled: 2 });
    const result = restoreSetup(backup.backupDir, f.env, { isRunning: () => false });
    assert.equal(result.success, false); assert.equal(result.deferred, true); assert.match(result.reason, /WAL/);
  } finally { db.close(); }
});

test('A later filesystem error reports that native restoration completed and file phase is partial', { skip: !source }, t => {
  const f = fixture(t, true), backup = createBackup(f.env);
  captureNativeBackup(f.env, backup.backupDir, { scope: 'completion' });
  update(f.env, { scope: 'completion', isRunning: () => false });
  put(f.env.settingsJson, '{"changed":true}');
  const copy = fs.copyFileSync;
  fs.copyFileSync = function(from, to, ...args) {
    if (to === f.env.settingsJson) throw new Error('simulated full disk');
    return copy.call(this, from, to, ...args);
  };
  let result;
  try { result = restoreSetup(backup.backupDir, f.env, { isRunning: () => false }); }
  finally { fs.copyFileSync = copy; }
  assert.equal(result.success, false); assert.equal(result.partial, true); assert.equal(result.phase, 'files');
  assert.equal(result.native.applied, true); assert.match(result.reason, /simulated full disk/);
  assert.equal(readRow(f.dbFile, TAB_TOPIC_KEY), undefined);
  assert.equal(fs.readFileSync(f.env.settingsJson, 'utf8'), '{"changed":true}');
});
