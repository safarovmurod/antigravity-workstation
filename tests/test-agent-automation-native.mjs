// Opt-in: supply the audited official 2.5.5 out/main.js, never a fabricated marker file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { update, restoreAutomation, queueAutomation, validateNative, readPolicies, POLICIES,
  TAB_TOPIC_KEY, TAB_POLICIES, readTabPolicies, mergeTabPolicies, NATIVE_MAIN_SHA256 } = require('../lib/agent-automation');
const { TOPIC_KEY, stringField } = require('../lib/mcp-permissions');
const source = process.env.MANSUR_ANTIGRAVITY_MAIN;
if (!source) throw new Error('Set MANSUR_ANTIGRAVITY_MAIN to the official 2.5.5 out/main.js');
const native = fs.readFileSync(source);
const entry = (key, value) => stringField(1, Buffer.concat([stringField(1, key), stringField(2, stringField(1, value))]));
const integer = value => Buffer.from([16, value]).toString('base64');
const topic = (...rows) => Buffer.concat(rows).toString('base64');
function readRows(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare('SELECT key,value FROM ItemTable ORDER BY key').all().map(row => ({ ...row })); }
  finally { db.close(); }
}
function setTopic(file, key, value) {
  const db = new DatabaseSync(file);
  try { db.prepare('INSERT INTO ItemTable(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
  finally { db.close(); }
}
test('The official embedded Topic/Primitive schema decodes the generated native preferences', () => {
  const runtime = process.env.MANSUR_PROTOBUF_RUNTIME;
  if (!runtime) throw new Error('Set MANSUR_PROTOBUF_RUNTIME to an isolated @bufbuild/protobuf 2.9.0 installation; see docs/AGENT-AUTOMATION.md');
  const { fromBinary, toBinary } = require(runtime);
  const { FileDescriptorProtoSchema } = require(path.join(runtime, 'dist/cjs/wkt/index.js'));
  const { fileDesc, messageDesc } = require(path.join(runtime, 'dist/cjs/codegenv2/index.js'));
  const encoded = native.toString('utf8').match(/rE=Uo\("([A-Za-z0-9+/]+)"/)[1];
  const descriptor = fromBinary(FileDescriptorProtoSchema, Buffer.from(encoded, 'base64'));
  assert.equal(descriptor.name, 'exa/unified_state_sync_pb/unified_state_sync.proto');
  // Keep the seven self-contained native messages; later cache messages import other schemas.
  descriptor.dependency = []; descriptor.messageType = descriptor.messageType.slice(0, 7);
  const file = fileDesc(Buffer.from(toBinary(FileDescriptorProtoSchema, descriptor)).toString('base64'));
  for (const [encodedTopic, policies] of [
    [require('../lib/agent-automation').mergePolicies('', false), POLICIES],
    [mergeTabPolicies(''), TAB_POLICIES],
  ]) {
    const decoded = fromBinary(messageDesc(file, 0), Buffer.from(encodedTopic, 'base64'));
    for (const [key, row] of Object.entries(decoded.data)) {
      const primitive = fromBinary(messageDesc(file, 4), Buffer.from(row.value, 'base64'));
      assert.deepEqual(primitive.value, { case: 'int32Value', value: policies[key] });
    }
    assert.deepEqual(Object.keys(decoded.data).sort(), Object.keys(policies).sort());
  }
  // Follow the actual native storage/getter/setter chain; a settings.json boolean is not this enum.
  const text = native.toString('utf8');
  assert.ok(text.includes('aCr="' + TAB_TOPIC_KEY + '"'));
  assert.ok(text.includes('TAB_ENABLED:"tabEnabled",TAB_TO_JUMP:"tabToJump"'));
  assert.ok(text.includes('e[e.OFF=1]="OFF",e[e.ON=2]="ON"}(oH||(oH={}))'));
  assert.ok(text.includes('e[e.ENABLED=1]="ENABLED",e[e.DISABLED=2]="DISABLED"}(fW||(fW={}))'));
  assert.ok(text.includes('function $2l(e){return xze(e,Ci.TAB_ENABLED,GP.tabEnabled)}'));
  assert.ok(text.includes('function q2l(e){return xze(e,Ci.TAB_TO_JUMP,GP.tabToJump)}'));
  assert.ok(text.includes('getTabEnabled(){return $2l(this.tabPreferencesTopic)===oH.ON}'));
  assert.ok(text.includes('setTabEnabled(e){this.settingsUpdater.pushUpdate(abl(e?oH.ON:oH.OFF))}'));
  assert.ok(text.includes('setTabToJump(e){this.settingsUpdater.pushUpdate(sbl(e?fW.ENABLED:fW.DISABLED))}'));
});
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur native '));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { ideRoot: path.join(home, 'IDE'), userSettingsDir: path.join(home, 'User'), backupsDir: path.join(home, 'backups'), geminiConfigDir: path.join(home, 'gemini-config') };
  const out = path.join(env.ideRoot, 'resources/app/out');
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'main.js'), native);
  fs.writeFileSync(path.join(out, '../product.json'), JSON.stringify({ ideVersion: '2.5.5' }));
  const dbFile = path.join(env.userSettingsDir, 'globalStorage/state.vscdb');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec('CREATE TABLE ItemTable(key TEXT PRIMARY KEY,value TEXT)');
  db.prepare('INSERT INTO ItemTable VALUES(?,?)').run('private-account-row', 'PRIVATE-RETAIN');
  db.close();
  return { home, env, dbFile, out };
}
test('Official-build SQLite write/readback, repeat and scoped restore preserve private account rows', t => {
  const f = fixture(t), options = { isRunning: () => false };
  assert.equal(validateNative(f.env), null);
  assert.equal(update(f.env, { ...options, dryRun: true }).wouldChange, true);
  assert.equal(fs.existsSync(f.env.backupsDir), false);
  const result = update(f.env, options);
  assert.equal(result.applied, true); assert.equal(result.changed, true); assert.equal(result.runtimeVerified, false);
  assert.deepEqual(result.storedPolicies, POLICIES);
  assert.deepEqual(result.storedTabPolicies, TAB_POLICIES);
  assert.equal(update(f.env, options).changed, false);
  const db = new DatabaseSync(f.dbFile);
  try {
    assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get('private-account-row').value, 'PRIVATE-RETAIN');
    const request = path.join(f.env.geminiConfigDir, 'mansur-setup/automation/request.json');
    fs.mkdirSync(path.dirname(request), { recursive: true });
    fs.writeFileSync(request, JSON.stringify({ env: f.env, includeMcp: true }));
    assert.equal(restoreAutomation(f.env, result.backup, options).applied, true);
    assert.equal(JSON.parse(fs.readFileSync(request)).cancelled, true);
    assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY), undefined);
    assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TAB_TOPIC_KEY), undefined);
    assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get('private-account-row').value, 'PRIVATE-RETAIN');
  } finally { db.close(); }
});

test('Completion-only apply and restore preserve exact chat bytes and later unrelated Tab preferences', t => {
  const f = fixture(t), options = { isRunning: () => false, scope: 'completion' };
  // Deliberately opaque agent state proves completion mode never parses or normalizes chat/MCP rows.
  const agentBefore = 'OPAQUE-PRIVATE-AGENT-STATE';
  const tabBefore = topic(entry('tabEnabled', integer(2)), entry('autocompleteSpeed', integer(1)));
  setTopic(f.dbFile, TOPIC_KEY, agentBefore); setTopic(f.dbFile, TAB_TOPIC_KEY, tabBefore);
  const first = update(f.env, options);
  assert.equal(first.applied, true); assert.deepEqual(first.storedTabPolicies, TAB_POLICIES);
  assert.equal(update(f.env, options).changed, false);
  const manifest = JSON.parse(fs.readFileSync(path.join(first.backup, 'manifest.json')));
  assert.equal(manifest.format, 2); assert.equal(manifest.scope, 'completion');
  assert.deepEqual(manifest.topics.map(row => row.topicKey), [TAB_TOPIC_KEY]);
  const laterForeign = entry('futureTabSetting', 'RETAIN-EXACT');
  const laterSpeed = entry('autocompleteSpeed', integer(3));
  setTopic(f.dbFile, TAB_TOPIC_KEY, topic(laterForeign, laterSpeed,
    ...Object.entries(TAB_POLICIES).map(([key, value]) => entry(key, integer(value)))));
  const restored = restoreAutomation(f.env, first.backup, { isRunning: () => false });
  assert.equal(restored.applied, true);
  const rows = new Map(readRows(f.dbFile).map(row => [row.key, row.value]));
  assert.equal(rows.get(TOPIC_KEY), agentBefore);
  assert.equal(rows.get(TAB_TOPIC_KEY), topic(laterForeign, laterSpeed, entry('tabEnabled', integer(2))));
});

test('Malformed or duplicate Tab rows reject the complete operation before any backup or database write', t => {
  for (const bad of [
    topic(entry('tabEnabled', integer(2)), entry('tabEnabled', integer(1))),
    topic(entry('tabToJump', Buffer.from([8, 0]).toString('base64'))),
  ]) {
    const f = fixture(t);
    setTopic(f.dbFile, TOPIC_KEY, topic(entry('terminalAutoExecutionPolicySentinelKey', integer(1))));
    setTopic(f.dbFile, TAB_TOPIC_KEY, bad);
    const before = readRows(f.dbFile);
    assert.throws(() => update(f.env, { isRunning: () => false }));
    assert.deepEqual(readRows(f.dbFile), before);
    assert.equal(fs.existsSync(f.env.backupsDir), false);
  }
});

test('A rejected Tab write rolls back the entire two-topic transaction', t => {
  const f = fixture(t);
  setTopic(f.dbFile, TOPIC_KEY, topic(entry('terminalAutoExecutionPolicySentinelKey', integer(1))));
  const before = readRows(f.dbFile), db = new DatabaseSync(f.dbFile);
  db.exec("CREATE TRIGGER reject_tab BEFORE INSERT ON ItemTable WHEN NEW.key='" + TAB_TOPIC_KEY + "' BEGIN SELECT RAISE(ABORT,'tab write rejected'); END");
  db.close();
  assert.throws(() => update(f.env, { isRunning: () => false }), /tab write rejected/);
  assert.deepEqual(readRows(f.dbFile), before);
});

test('A concurrent change after the initial snapshot aborts without replacing either topic', t => {
  const f = fixture(t), concurrent = topic(entry('futureTabSetting', 'CONCURRENT-RETAIN'));
  const mkdir = fs.mkdirSync;
  let injected = false;
  t.mock.method(fs, 'mkdirSync', (directory, options) => {
    if (!injected && path.dirname(String(directory)) === f.env.backupsDir && path.basename(String(directory)).startsWith('agent-automation-')) {
      injected = true; setTopic(f.dbFile, TAB_TOPIC_KEY, concurrent);
    }
    return mkdir(directory, options);
  });
  assert.throws(() => update(f.env, { isRunning: () => false }), /concurrent/);
  assert.equal(injected, true);
  const rows = new Map(readRows(f.dbFile).map(row => [row.key, row.value]));
  assert.equal(rows.has(TOPIC_KEY), false);
  assert.equal(rows.get(TAB_TOPIC_KEY), concurrent);
});

test('Legacy format 1 restore changes only agent rows and leaves the new Tab state intact', t => {
  const f = fixture(t), saved = topic(entry('terminalAutoExecutionPolicySentinelKey', integer(1)));
  setTopic(f.dbFile, TOPIC_KEY, saved);
  const installed = update(f.env, { isRunning: () => false, includeMcp: false });
  const tabBefore = new Map(readRows(f.dbFile).map(row => [row.key, row.value])).get(TAB_TOPIC_KEY);
  const backup = path.join(f.env.backupsDir, 'agent-automation-legacy');
  fs.mkdirSync(backup);
  fs.copyFileSync(path.join(installed.backup, 'state.vscdb'), path.join(backup, 'state.vscdb'));
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ format: 1, topicKey: TOPIC_KEY,
    hadTopic: true, includeMcp: false, mainSha256: NATIVE_MAIN_SHA256 }));
  fs.writeFileSync(path.join(backup, 'agent-preferences.base64'), saved);
  assert.equal(restoreAutomation(f.env, backup, { isRunning: () => false }).applied, true);
  const rows = new Map(readRows(f.dbFile).map(row => [row.key, row.value]));
  assert.equal(rows.get(TOPIC_KEY), saved); assert.equal(rows.get(TAB_TOPIC_KEY), tabBefore);
});

test('Completion restore distinguishes a newly created Tab topic from a preexisting empty topic', t => {
  for (const hadTopic of [false, true]) {
    const f = fixture(t);
    if (hadTopic) setTopic(f.dbFile, TAB_TOPIC_KEY, '');
    const result = update(f.env, { isRunning: () => false, scope: 'completion' });
    if (hadTopic) {
      const db = new DatabaseSync(f.dbFile);
      db.prepare('DELETE FROM ItemTable WHERE key=?').run(TAB_TOPIC_KEY); db.close();
    } else setTopic(f.dbFile, TAB_TOPIC_KEY, '');
    const restored = restoreAutomation(f.env, result.backup, { isRunning: () => false });
    assert.equal(restored.applied, true); assert.equal(restored.changed, true);
    const rows = new Map(readRows(f.dbFile).map(row => [row.key, row.value]));
    assert.equal(rows.has(TAB_TOPIC_KEY), hadTopic);
    if (hadTopic) assert.equal(rows.get(TAB_TOPIC_KEY), '');
    assert.equal(rows.has(TOPIC_KEY), false);
  }
});

test('An immediately applied completion request also cancels the older agent automation worker', t => {
  const f = fixture(t), request = path.join(f.env.geminiConfigDir, 'mansur-setup/automation/request.json');
  fs.mkdirSync(path.dirname(request), { recursive: true });
  fs.writeFileSync(request, JSON.stringify({ env: f.env, includeMcp: true }));
  const agentBefore = 'OPAQUE-PRIVATE-AGENT'; setTopic(f.dbFile, TOPIC_KEY, agentBefore);
  const before = readRows(f.dbFile);
  assert.equal(queueAutomation(f.env, { isRunning: () => false, scope: 'completion', dryRun: true }).wouldChange, true);
  assert.equal(JSON.parse(fs.readFileSync(request)).cancelled, undefined);
  assert.deepEqual(readRows(f.dbFile), before);
  assert.equal(queueAutomation(f.env, { isRunning: () => false, scope: 'completion' }).applied, true);
  assert.equal(JSON.parse(fs.readFileSync(request)).cancelled, true);
  const rows = new Map(readRows(f.dbFile).map(row => [row.key, row.value]));
  assert.equal(rows.get(TOPIC_KEY), agentBefore); assert.deepEqual(readTabPolicies(rows.get(TAB_TOPIC_KEY)), TAB_POLICIES);
});
test('Running IDE, WAL, modified build and a restart during the transaction cannot publish new preferences', t => {
  const f = fixture(t);
  assert.equal(update(f.env, { isRunning: () => true }).deferred, true);
  assert.equal(fs.existsSync(f.env.backupsDir), false);
  fs.writeFileSync(f.dbFile + '-wal', 'pending');
  assert.equal(update(f.env, { isRunning: () => false }).deferred, true);
  fs.unlinkSync(f.dbFile + '-wal');
  let checks = 0;
  assert.throws(() => update(f.env, { isRunning: () => ++checks > 1 }), /restarted/);
  const db = new DatabaseSync(f.dbFile);
  assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY), undefined); db.close();
  fs.appendFileSync(path.join(f.out, 'main.js'), '\n// changed');
  assert.match(update(f.env, { isRunning: () => false }).reason, /Unaudited/);
});
test('A real completion worker supersedes older automation and waits for a normal IDE shutdown', { skip: process.platform === 'win32' }, async t => {
  const f = fixture(t), bin = path.join(f.home, 'bin'), marker = path.join(f.home, 'ide-open');
  const agentBefore = topic(entry('terminalAutoExecutionPolicySentinelKey', integer(1)),
    entry('artifactReviewPolicySentinelKey', integer(1)), entry('privateAgentSetting', 'PRIVATE-MUST-NOT-CHANGE'));
  setTopic(f.dbFile, TOPIC_KEY, agentBefore);
  const legacyRequest = path.join(f.env.geminiConfigDir, 'mansur-setup/automation/request.json');
  fs.mkdirSync(path.dirname(legacyRequest), { recursive: true });
  fs.writeFileSync(legacyRequest, JSON.stringify({ env: f.env, includeMcp: true }));
  fs.mkdirSync(bin); fs.writeFileSync(marker, 'open');
  const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
  fs.writeFileSync(path.join(bin, 'tasklist.exe'), '#!/bin/sh\nif test -f ' + quote(marker) + '; then printf \'"Antigravity IDE.exe","123"\\n\'; fi\n', { mode: 0o755 });
  const original = process.env.PATH; let result, prior;
  try { process.env.PATH = bin + path.delimiter + original; prior = queueAutomation(f.env); }
  finally { process.env.PATH = original; }
  const deadline = Date.now() + 10000;
  while ((!fs.existsSync(prior.statusFile) || JSON.parse(fs.readFileSync(prior.statusFile)).state === 'starting') && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  assert.equal(JSON.parse(fs.readFileSync(prior.statusFile)).state, 'waiting');
  try { process.env.PATH = bin + path.delimiter + original; result = queueAutomation(f.env, { scope: 'completion' }); }
  finally { process.env.PATH = original; }
  assert.equal(result.queued, true); assert.equal(result.applied, false);
  assert.equal(JSON.parse(fs.readFileSync(legacyRequest)).cancelled, true);
  assert.ok(result.statusFile.includes('automation-v2'));
  assert.notEqual(result.requestId, prior.requestId); assert.notEqual(result.statusFile, prior.statusFile);
  const queued = JSON.parse(fs.readFileSync(path.join(path.dirname(result.statusFile), 'request.json')));
  assert.equal(queued.protocolVersion, 2); assert.equal(queued.scope, 'completion');
  while ((!fs.existsSync(result.statusFile) || JSON.parse(fs.readFileSync(result.statusFile)).state === 'starting') && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  assert.equal(JSON.parse(fs.readFileSync(result.statusFile)).state, 'waiting');
  await new Promise(r => setTimeout(r, 250));
  assert.equal(JSON.parse(fs.readFileSync(result.statusFile)).state, 'waiting');
  const pendingDb = new DatabaseSync(f.dbFile, { readOnly: true });
  assert.equal(pendingDb.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value, agentBefore);
  assert.equal(pendingDb.prepare('SELECT value FROM ItemTable WHERE key=?').get(TAB_TOPIC_KEY), undefined); pendingDb.close();
  fs.unlinkSync(marker);
  let status;
  while (Date.now() < deadline) {
    status = JSON.parse(fs.readFileSync(result.statusFile));
    if (status.state !== 'waiting') break;
    await new Promise(r => setTimeout(r, 50));
  }
  assert.equal(status.state, 'applied', JSON.stringify(status));
  assert.equal(status.requestId, result.requestId); assert.equal(status.scope, 'completion');
  assert.notEqual(JSON.parse(fs.readFileSync(prior.statusFile)).state, 'applied');
  const db = new DatabaseSync(f.dbFile, { readOnly: true });
  assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value, agentBefore);
  assert.deepEqual(readTabPolicies(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TAB_TOPIC_KEY).value), TAB_POLICIES); db.close();
});
