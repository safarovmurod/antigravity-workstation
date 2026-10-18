import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const paths = require('../lib/paths');
const { TOPIC_KEY, stringField } = require('../lib/mcp-permissions');
const { TAB_TOPIC_KEY } = require('../lib/agent-automation');
const { preflightNativeSetup } = require('../lib/installer');
const repoRoot = path.resolve(import.meta.dirname, '..');
const officialFile = process.env.WORKSTATION_ANTIGRAVITY_MAIN;
const official = officialFile ? fs.readFileSync(officialFile) : null;

function fixture(t, options = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation preflight '));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { isWindows: true, ideRoot: path.join(home, 'IDE'), userProfile: path.join(home, 'User'),
    userSettingsDir: path.join(home, 'User', 'AppData', 'Roaming', 'Antigravity IDE', 'User'),
    geminiDir: path.join(home, 'User', '.gemini'), geminiConfigDir: path.join(home, 'User', '.gemini', 'config'),
    backupsDir: path.join(home, 'User', '.gemini', 'backups') };
  env.settingsJson = path.join(env.userSettingsDir, 'settings.json');
  env.keybindingsJson = path.join(env.userSettingsDir, 'keybindings.json');
  env.argvJson = path.join(env.userProfile, '.antigravity-ide', 'argv.json');
  const app = path.join(env.ideRoot, 'resources', 'app');
  fs.mkdirSync(path.join(app, 'out'), { recursive: true });
  fs.writeFileSync(path.join(app, 'product.json'), JSON.stringify({ ideVersion: options.version || '2.5.5', nameShort: 'Antigravity IDE' }));
  fs.writeFileSync(path.join(app, 'out/main.js'), options.main || '// deliberately unaudited bundle: rejection fixture only');
  fs.mkdirSync(env.userSettingsDir, { recursive: true });
  fs.writeFileSync(env.settingsJson, '{"editor.fontFamily":"PERSONAL-PREINSTALL","editor.inlineSuggest.enabled":true}\n');
  const dbFile = path.join(env.userSettingsDir, 'globalStorage', 'state.vscdb');
  if (options.initialized !== false) {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const db = new DatabaseSync(dbFile);
    db.exec('CREATE TABLE ItemTable(key TEXT PRIMARY KEY,value TEXT)');
    db.prepare('INSERT INTO ItemTable VALUES(?,?)').run('personal-account', 'RETAIN-ACCOUNT-BYTES');
    db.close();
  }
  const workerRequests = ['automation', 'automation-v2'].map(name => {
    const file = path.join(env.geminiConfigDir, 'workstation-setup', name, 'request.json');
    const bytes = JSON.stringify({ env, scope: 'all', requestedAt: '2026-10-16T00:00:00Z', marker: 'PENDING-UNCHANGED' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return { file, bytes };
  });
  return { home, env, app, dbFile, workerRequests };
}

function setTopic(f, key, value) {
  const db = new DatabaseSync(f.dbFile);
  try { db.prepare('INSERT INTO ItemTable(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
  finally { db.close(); }
}

const row = (key, primitive) => stringField(1, Buffer.concat([
  stringField(1, key), stringField(2, stringField(1, primitive.toString('base64'))),
])).toString('base64');

function snapshot(directory) {
  const result = {};
  function visit(parent) {
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      const file = path.join(parent, entry.name), key = path.relative(directory, file);
      if (entry.isDirectory()) { result[key] = null; visit(file); }
      else result[key] = fs.readFileSync(file).toString('base64');
    }
  }
  visit(directory);
  return result;
}

function asProductionWindows(env, fn) {
  // Only discovery/platform are simulated. Compatibility still hashes and
  // inspects the actual bundle; no successful-build validator is mocked.
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const discover = paths.getEnvironmentPaths;
  const installerFile = require.resolve('../lib/installer');
  const cached = require.cache[installerFile];
  try {
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    paths.getEnvironmentPaths = () => env;
    delete require.cache[installerFile];
    return fn(require(installerFile).runInstaller);
  } finally {
    Object.defineProperty(process, 'platform', platform);
    paths.getEnvironmentPaths = discover;
    delete require.cache[installerFile];
    if (cached) require.cache[installerFile] = cached;
  }
}

function rejectBeforeFirstWrite(f, expected) {
  const before = snapshot(f.home), mkdir = fs.mkdirSync;
  let mutationAttempted = false;
  try {
    fs.mkdirSync = () => { mutationAttempted = true; throw new Error('UNEXPECTED_SETUP_WRITE_BEFORE_PREFLIGHT'); };
    asProductionWindows(f.env, runInstaller => {
      assert.throws(() => runInstaller({ repoRoot, skipExtensions: true, skipFont: true, skipAgentBrowser: true, autoApprove: true, log() {} }), expected);
    });
  } finally { fs.mkdirSync = mkdir; }
  assert.equal(mutationAttempted, false, 'Preflight must reject before even creating the install lock directory');
  assert.deepEqual(snapshot(f.home), before, 'Rejected setup must preserve every profile file and directory');
  for (const request of f.workerRequests) assert.equal(fs.readFileSync(request.file, 'utf8'), request.bytes, 'Rejected preflight must not cancel or rewrite a pending worker');
  assert.equal(fs.existsSync(f.env.backupsDir), false);
  assert.equal(fs.existsSync(path.join(f.env.geminiConfigDir, 'workstation-setup/install.lock')), false);
}

test('The production installer rejects an unknown version before lock, backup or settings writes', t => {
  rejectBeforeFirstWrite(fixture(t, { version: '9.9.9' }), /Native setup preflight:.*Unaudited Antigravity version 9\.9\.9.*no setup changes made/);
});

test('The production installer rejects a hash mismatch before lock, backup or settings writes', t => {
  rejectBeforeFirstWrite(fixture(t), /Native setup preflight:.*Unaudited Antigravity build.*no setup changes made/);
});

test('Missing native files and malformed product metadata fail before any setup mutation', t => {
  const malformed = fixture(t);
  fs.writeFileSync(path.join(malformed.app, 'product.json'), '{BROKEN-METADATA');
  rejectBeforeFirstWrite(malformed, /Native setup preflight:.*metadata.*no setup changes made/);
  const missing = fixture(t);
  fs.unlinkSync(path.join(missing.app, 'out/main.js'));
  rejectBeforeFirstWrite(missing, /Native setup preflight:.*installation not found.*no setup changes made/);
});

test('The audited official bundle with an initialized SQLite profile passes read-only preflight', { skip: !official }, t => {
  const f = fixture(t, { main: official }), before = snapshot(f.home);
  const result = preflightNativeSetup(f.env, { repoRoot });
  assert.equal(result.supported, true);
  assert.equal(result.installedVersion, '2.5.5');
  assert.equal(result.adapterId, 'uss-int32-agent-tab-v1');
  assert.deepEqual(snapshot(f.home), before);
  assert.equal(fs.existsSync(f.env.backupsDir), false);
});

test('The production installer rejects an uninitialized profile before lock, backup or settings writes', { skip: !official }, t => {
  rejectBeforeFirstWrite(fixture(t, { main: official, initialized: false }), /initialize the native profile.*no setup changes made/);
});

test('Malformed SQLite profiles reject before cancelling workers or writing setup state', { skip: !official }, t => {
  const f = fixture(t, { main: official });
  fs.writeFileSync(f.dbFile, 'PRIVATE-INVALID-SQLITE');
  rejectBeforeFirstWrite(f, /Native profile database or managed preferences are invalid; no setup changes made/);
});

test('A directory at state.vscdb rejects before cancelling workers or writing setup state', { skip: !official }, t => {
  const f = fixture(t, { main: official });
  fs.unlinkSync(f.dbFile); fs.mkdirSync(f.dbFile);
  rejectBeforeFirstWrite(f, /Native profile database or managed preferences are invalid; no setup changes made/);
});

test('A SQLite file without ItemTable rejects before cancelling workers or writing setup state', { skip: !official }, t => {
  const f = fixture(t, { main: official });
  fs.unlinkSync(f.dbFile);
  const db = new DatabaseSync(f.dbFile); db.exec('CREATE TABLE Unrelated(value TEXT)'); db.close();
  rejectBeforeFirstWrite(f, /Native profile database or managed preferences are invalid; no setup changes made/);
});

test('Malformed managed Tab preferences reject before cancelling workers or writing setup state', { skip: !official }, t => {
  const f = fixture(t, { main: official });
  // The actual native Tab preference uses Primitive.int32, not bool.
  setTopic(f, TAB_TOPIC_KEY, row('tabEnabled', Buffer.from([8, 0])));
  rejectBeforeFirstWrite(f, /Native profile database or managed preferences are invalid; no setup changes made/);
});

test('Malformed agent policy types reject auto-approve before cancelling workers or writing setup state', { skip: !official }, t => {
  const f = fixture(t, { main: official });
  setTopic(f, TOPIC_KEY, row('terminalAutoExecutionPolicySentinelKey', Buffer.from([8, 0])));
  rejectBeforeFirstWrite(f, /Native profile database or managed preferences are invalid; no setup changes made/);
});

test('Preflight validates only agent preferences managed by the requested scope', { skip: !official }, t => {
  const f = fixture(t, { main: official });
  setTopic(f, TOPIC_KEY, row('terminalAutoExecutionPolicySentinelKey', Buffer.from([8, 0])));
  let before = snapshot(f.home);
  // Ordinary install manages MCP, but leaves terminal/artifact policy types alone.
  assert.equal(preflightNativeSetup(f.env, { repoRoot }).supported, true);
  assert.deepEqual(snapshot(f.home), before);
  setTopic(f, TOPIC_KEY, 'OPAQUE-AGENT-STATE-MUST-NOT-BE-PARSED');
  before = snapshot(f.home);
  for (const options of [{ skipPermissions: true }, { nativeScope: 'completion' }]) {
    assert.equal(preflightNativeSetup(f.env, { repoRoot, ...options }).supported, true);
    assert.deepEqual(snapshot(f.home), before);
  }
  for (const request of f.workerRequests) assert.equal(fs.readFileSync(request.file, 'utf8'), request.bytes);
});

test('A supported production setup reaches its first lock write only after successful preflight', { skip: !official }, t => {
  const f = fixture(t, { main: official }), before = snapshot(f.home), mkdir = fs.mkdirSync;
  const stop = new Error('STOP_AT_FIRST_AUTHORIZED_WRITE');
  let firstWrite;
  try {
    fs.mkdirSync = directory => { firstWrite = directory; throw stop; };
    asProductionWindows(f.env, runInstaller => {
      assert.throws(() => runInstaller({ repoRoot, autoApprove: true, log() {} }), error => error === stop);
    });
  } finally { fs.mkdirSync = mkdir; }
  assert.equal(firstWrite, path.join(f.env.geminiConfigDir, 'workstation-setup'));
  assert.deepEqual(snapshot(f.home), before);
});
