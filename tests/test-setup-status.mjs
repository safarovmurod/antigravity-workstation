import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { execFileSync, spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getSetupStatus, recoverPending, formatSetupStatus } = require('../lib/setup-status');
const { cancelPendingWorkers, mergeTabPolicies, mergePolicies, TAB_TOPIC_KEY, runWorker, restoreAutomation, readPolicies, NATIVE_MAIN_SHA256 } = require('../lib/agent-automation');
const { TOPIC_KEY, stringField, readMcpPolicy } = require('../lib/mcp-permissions');

function fixture(t, { scope = 'completion', status, fresh = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-status-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { geminiConfigDir: path.join(root, '.gemini', 'config'), userSettingsDir: path.join(root, 'User'), backupsDir: path.join(root, '.gemini', 'backups'), nodeExe: process.execPath };
  const directory = path.join(env.geminiConfigDir, 'workstation-setup', 'automation-v2');
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(path.join(env.userSettingsDir, 'globalStorage'), { recursive: true });
  const request = path.join(directory, 'request.json');
  const requestId = crypto.randomUUID();
  const statusFile = path.join(directory, 'status-' + requestId + '.json');
  const job = { protocolVersion: 2, requestId, env, scope, includeMcp: scope === 'all', requestedAt: new Date(Date.now() - (fresh ? 0 : 60000)).toISOString() };
  fs.writeFileSync(request, JSON.stringify(job));
  if (status) fs.writeFileSync(statusFile, JSON.stringify({ protocolVersion: 2, requestId, scope, updatedAt: new Date().toISOString(), ...status }));
  const dbFile = path.join(env.userSettingsDir, 'globalStorage', 'state.vscdb');
  const db = new DatabaseSync(dbFile);
  db.exec('CREATE TABLE ItemTable(key TEXT PRIMARY KEY,value TEXT)');
  db.prepare('INSERT INTO ItemTable VALUES(?,?)').run(TOPIC_KEY, '');
  db.close();
  const writeStatus = value => fs.writeFileSync(statusFile, JSON.stringify({ protocolVersion: 2, requestId, scope, updatedAt: new Date().toISOString(), ...value }));
  return { env, directory, request, requestId, statusFile, job, dbFile, writeStatus };
}
function spawnRecorder() {
  const calls = [];
  const spawn = (...args) => {
    calls.push(args);
    return Object.assign(new EventEmitter(), { pid: 3456789, unref() {} });
  };
  return { spawn, calls };
}
const dead = () => false;

test('Read-only status reports interruption and never calls it applied merely because a request exists', t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 999999 } });
  const before = fs.readFileSync(f.dbFile);
  const status = getSetupStatus(f.env, { isProcessAlive: dead });
  assert.equal(status.state, 'interrupted');
  assert.equal(status.recoverable, true);
  assert.equal(status.applied, false);
  assert.equal(status.runtimeVerified, false);
  assert.equal(status.storedPreferences.matches, false);
  assert.deepEqual(fs.readFileSync(f.dbFile), before);
  assert.match(formatSetupStatus(status), /not verified/);
});

test('Recovery after a dead worker keeps immutable completion-only authorization and private chat bytes', t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 999999 } });
  const before = fs.readFileSync(f.request);
  const beforeDb = fs.readFileSync(f.dbFile);
  const recorder = spawnRecorder();
  const result = recoverPending(f.env, { isProcessAlive: dead, spawn: recorder.spawn });
  assert.equal(result.resumed, true);
  assert.equal(result.requestId, f.requestId);
  assert.equal(result.scope, 'completion');
  assert.equal(result.includeMcp, false);
  assert.deepEqual(fs.readFileSync(f.request), before);
  assert.deepEqual(fs.readFileSync(f.dbFile), beforeDb);
  assert.equal(recorder.calls.length, 1);
  assert.equal(recorder.calls[0][0], f.env.nodeExe);
  assert.deepEqual(recorder.calls[0][1], [path.join(f.directory, 'agent-automation.js'), f.request, f.requestId]);
  for (const name of ['setup-status.js', 'agent-automation.js', 'native-compatibility.js', 'native-compatibility.json', 'mcp-permissions.js']) assert.ok(fs.existsSync(path.join(f.directory, name)), name);
});

test('A reboot is distinguished from a reused process ID; the original full-scope request can resume', t => {
  const boot = Date.now() - os.uptime() * 1000;
  const f = fixture(t, { scope: 'all', status: { state: 'waiting', pid: 123, bootTimeMs: boot - 3600000 } });
  const recorder = spawnRecorder();
  assert.equal(getSetupStatus(f.env, { isProcessAlive: () => true, bootTimeMs: boot }).state, 'interrupted');
  const result = recoverPending(f.env, { isProcessAlive: () => true, bootTimeMs: boot, spawn: recorder.spawn });
  assert.equal(result.resumed, true);
  assert.equal(result.scope, 'all');
  assert.equal(JSON.parse(fs.readFileSync(f.request)).includeMcp, true);
});

test('A live waiting worker is not duplicated, even with an old heartbeat', t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 123, updatedAt: new Date(Date.now() - 60000).toISOString() } });
  const recorder = spawnRecorder();
  const result = recoverPending(f.env, { isProcessAlive: () => true, spawn: recorder.spawn });
  assert.equal(result.state, 'stale-worker');
  assert.equal(result.resumed, false);
  assert.equal(recorder.calls.length, 0);
});

test('Timeout can resume, while a failed compatibility/write check requires an explicit setup retry', t => {
  const f = fixture(t, { status: { state: 'failed', timedOut: true } });
  assert.equal(getSetupStatus(f.env).state, 'expired');
  assert.equal(getSetupStatus(f.env).recoverable, true);
  f.writeStatus({ state: 'failed', reason: 'Unaudited build' });
  const recorder = spawnRecorder();
  const result = recoverPending(f.env, { spawn: recorder.spawn });
  assert.equal(result.state, 'failed');
  assert.equal(result.resumed, false);
  assert.equal(recorder.calls.length, 0);
});

test('Dry-run recovery leaves every request, status and database byte untouched', t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 999999 } });
  const files = [f.request, f.statusFile, f.dbFile];
  const before = files.map(file => fs.readFileSync(file));
  const recorder = spawnRecorder();
  const result = recoverPending(f.env, { dryRun: true, isProcessAlive: dead, spawn: recorder.spawn });
  assert.equal(result.wouldResume, true);
  assert.equal(result.resumed, false);
  assert.deepEqual(files.map(file => fs.readFileSync(file)), before);
  assert.equal(recorder.calls.length, 0);
  assert.equal(fs.existsSync(path.join(f.directory, 'resume.lock')), false);
});

test('Restore cancellation is definitive for current and legacy workers and cannot be resumed', t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 999999 } });
  const legacy = path.join(f.env.geminiConfigDir, 'workstation-setup', 'automation', 'request.json');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, JSON.stringify({ includeMcp: true }));
  cancelPendingWorkers(f.env);
  assert.equal(JSON.parse(fs.readFileSync(legacy)).cancelled, true);
  const recorder = spawnRecorder();
  const result = recoverPending(f.env, { isProcessAlive: dead, spawn: recorder.spawn });
  assert.equal(result.state, 'cancelled');
  assert.equal(result.recoverable, false);
  assert.equal(recorder.calls.length, 0);
});

test('A foreign or malformed request is rejected without starting anything', t => {
  const f = fixture(t);
  const recorder = spawnRecorder();
  for (const bad of [{ ...f.job, includeMcp: true }, { ...f.job, scope: 'agent' }, { ...f.job, env: { ...f.env, userSettingsDir: '/another/profile' } }]) {
    fs.writeFileSync(f.request, JSON.stringify(bad));
    const result = recoverPending(f.env, { isProcessAlive: dead, spawn: recorder.spawn });
    assert.equal(result.state, 'invalid');
    assert.equal(result.resumed, false);
  }
  assert.equal(recorder.calls.length, 0);
});

test('Completed status rechecks owned stored preferences and reports drift without falsely verifying runtime', t => {
  const f = fixture(t, { status: { state: 'applied', applied: true } });
  assert.equal(getSetupStatus(f.env).state, 'drifted');
  const db = new DatabaseSync(f.dbFile);
  db.prepare('INSERT INTO ItemTable VALUES(?,?)').run(TAB_TOPIC_KEY, mergeTabPolicies(''));
  db.close();
  const status = getSetupStatus(f.env);
  assert.equal(status.state, 'applied');
  assert.equal(status.applied, true);
  assert.equal(status.runtimeVerified, false);
  assert.deepEqual(status.storedPreferences.tabPolicies, { tabEnabled: 1, tabToJump: 2 });
});

test('Full completion status also checks stored chat permissions and MCP policy', t => {
  const f = fixture(t, { scope: 'all', status: { state: 'applied', applied: true } });
  const db = new DatabaseSync(f.dbFile);
  db.prepare('INSERT INTO ItemTable VALUES(?,?)').run(TAB_TOPIC_KEY, mergeTabPolicies(''));
  assert.equal(getSetupStatus(f.env).state, 'drifted');
  db.prepare('UPDATE ItemTable SET value=? WHERE key=?').run(mergePolicies('', true), TOPIC_KEY);
  const approvals = require('../lib/approval-policies');
  for (const key of approvals.EXTRA_TOPIC_KEYS) db.prepare('INSERT INTO ItemTable VALUES(?,?)').run(key, approvals.merge('', key));
  db.close();
  assert.equal(getSetupStatus(f.env).state, 'applied');
});

test('Pending request without a status has a startup grace period before recovery', t => {
  const f = fixture(t, { fresh: true });
  assert.equal(getSetupStatus(f.env).state, 'starting');
  assert.equal(getSetupStatus(f.env, { now: Date.now() + 11000 }).state, 'interrupted');
});

test('Worker heartbeats identify request, process, boot and the current deferral reason', async t => {
  const f = fixture(t);
  let calls = 0;
  const result = await runWorker(f.request, { intervalMs: 1, apply: () => {
    calls++;
    if (calls === 1) return { applied: false, deferred: true, reason: 'WAL is present' };
    const status = JSON.parse(fs.readFileSync(f.statusFile));
    assert.equal(status.reason, 'WAL is present');
    assert.equal(status.requestId, f.requestId);
    assert.equal(status.pid, process.pid);
    assert.ok(Number.isFinite(status.bootTimeMs));
    assert.ok(Number.isFinite(Date.parse(status.updatedAt)));
    return { applied: true, runtimeVerified: false };
  } });
  assert.equal(result.applied, true);
});

test('A real detached recovery uses its persisted compatibility catalog and applies only the saved completion scope', {
  skip: !process.env.WORKSTATION_ANTIGRAVITY_MAIN,
  timeout: 45000,
}, async t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 999999 } });
  f.env.ideRoot = path.join(f.directory, 'audited-ide');
  f.env.isWindows = true;
  const app = path.join(f.env.ideRoot, 'resources', 'app');
  fs.mkdirSync(path.join(app, 'out'), { recursive: true });
  fs.copyFileSync(process.env.WORKSTATION_ANTIGRAVITY_MAIN, path.join(app, 'out', 'main.js'));
  fs.writeFileSync(path.join(app, 'product.json'), JSON.stringify({ ideVersion: '2.5.5' }));
  fs.writeFileSync(f.request, JSON.stringify({ ...f.job, env: f.env }));
  const db = new DatabaseSync(f.dbFile);
  db.prepare('UPDATE ItemTable SET value=? WHERE key=?').run('PRIVATE-CHAT-BYTES-UNCHANGED', TOPIC_KEY);
  db.close();
  const probe = path.join(f.directory, 'owned-process-inventory.cjs');
  const observed = path.join(f.directory, 'process-inventory.jsonl');
  fs.writeFileSync(probe, `const fs = require('node:fs');
const childProcess = require('node:child_process');
const original = childProcess.execFileSync;
childProcess.execFileSync = function (command, args, options) {
  if (command === 'tasklist.exe') {
    fs.appendFileSync(${JSON.stringify(observed)}, JSON.stringify({ command, args }) + '\\n');
    return '"node.exe","123","Console","1","4 K"\\r\\n';
  }
  return original.apply(this, arguments);
};\n`);
  let child;
  const result = recoverPending(f.env, { isProcessAlive: dead, spawn(executable, args, options) {
    assert.equal(executable, process.execPath);
    assert.equal(options.detached, true);
    child = spawn(executable, ['--require', probe, ...args], options);
    return child;
  } });
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise(resolve => child.once('exit', resolve));
    }
  });
  assert.equal(result.resumed, true);
  const deadline = Date.now() + 30000;
  let status;
  do {
    status = getSetupStatus(f.env);
    if (status.state === 'applied' || status.state === 'failed') break;
    await new Promise(resolve => setTimeout(resolve, 30));
  } while (Date.now() < deadline);
  assert.equal(status.state, 'applied', JSON.stringify(status));
  assert.equal(status.runtimeVerified, false);
  assert.equal(status.scope, 'completion');
  const inventories = fs.readFileSync(observed, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.ok(inventories.length > 0, 'The detached worker checks process inventory before applying');
  for (const inventory of inventories) assert.deepEqual(inventory, { command: 'tasklist.exe', args: ['/FO', 'CSV', '/NH'] });
  const readback = new DatabaseSync(f.dbFile, { readOnly: true });
  try { assert.equal(readback.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value, 'PRIVATE-CHAT-BYTES-UNCHANGED'); }
  finally { readback.close(); }
});

test('MCP-and-Tab rollback leaves later manual agent policies intact, including a second rollback of the inverse backup', {
  skip: !process.env.WORKSTATION_ANTIGRAVITY_MAIN,
}, t => {
  const f = fixture(t);
  f.env.ideRoot = path.join(f.directory, 'audited-ide');
  f.env.isWindows = true;
  const app = path.join(f.env.ideRoot, 'resources', 'app');
  fs.mkdirSync(path.join(app, 'out'), { recursive: true });
  fs.copyFileSync(process.env.WORKSTATION_ANTIGRAVITY_MAIN, path.join(app, 'out', 'main.js'));
  fs.writeFileSync(path.join(app, 'product.json'), JSON.stringify({ ideVersion: '2.5.5' }));
  const row = (key, encoded) => stringField(1, Buffer.concat([stringField(1, key), stringField(2, stringField(1, encoded))]));
  const int = value => Buffer.from([16, value]).toString('base64');
  const policies = (...rows) => Buffer.concat(rows).toString('base64');
  const old = policies(row('terminalAutoExecutionPolicySentinelKey', int(1)), row('artifactReviewPolicySentinelKey', int(1)),
    row('permission_grants_global', stringField(3, 'mcp(*)').toString('base64')));
  const current = policies(row('terminalAutoExecutionPolicySentinelKey', int(3)), row('artifactReviewPolicySentinelKey', int(2)),
    row('permission_grants_global', stringField(1, 'mcp(*)').toString('base64')), row('model', 'PRIVATE-UNRELATED'));
  const backup = path.join(f.env.backupsDir, 'agent-automation-' + crypto.randomUUID());
  fs.mkdirSync(backup, { recursive: true });
  fs.writeFileSync(path.join(backup, 'agent-preferences.base64'), old);
  fs.writeFileSync(path.join(backup, 'tab-preferences.base64'), '');
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ format: 2, scope: 'all', mainSha256: NATIVE_MAIN_SHA256, includeMcp: true, includeAgentPolicies: false,
    topics: [{ topicKey: TOPIC_KEY, hadTopic: true, file: 'agent-preferences.base64' }, { topicKey: TAB_TOPIC_KEY, hadTopic: false, file: 'tab-preferences.base64' }] }));
  const db = new DatabaseSync(f.dbFile);
  db.prepare('UPDATE ItemTable SET value=? WHERE key=?').run(current, TOPIC_KEY);
  db.prepare('INSERT INTO ItemTable VALUES(?,?)').run(TAB_TOPIC_KEY, mergeTabPolicies(''));
  db.close();
  const result = restoreAutomation(f.env, backup, { isRunning: () => false });
  assert.equal(result.applied, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.backup, 'manifest.json'))).includeAgentPolicies, false);
  const read = () => {
    const db = new DatabaseSync(f.dbFile, { readOnly: true });
    try { return db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value; }
    finally { db.close(); }
  };
  assert.deepEqual(readPolicies(read()), { terminalAutoExecutionPolicySentinelKey: 3, artifactReviewPolicySentinelKey: 2 });
  assert.deepEqual(readMcpPolicy(read()), { allowed: false, conflicts: 1 });
  assert.ok(Buffer.from(read(), 'base64').includes(row('model', 'PRIVATE-UNRELATED')));
  const later = new DatabaseSync(f.dbFile);
  later.prepare('UPDATE ItemTable SET value=? WHERE key=?').run(policies(row('terminalAutoExecutionPolicySentinelKey', int(1)), row('artifactReviewPolicySentinelKey', int(2)),
    row('permission_grants_global', stringField(3, 'mcp(*)').toString('base64'))), TOPIC_KEY);
  later.close();
  assert.equal(restoreAutomation(f.env, result.backup, { isRunning: () => false }).applied, true);
  assert.deepEqual(readPolicies(read()), { terminalAutoExecutionPolicySentinelKey: 1, artifactReviewPolicySentinelKey: 2 });
  assert.deepEqual(readMcpPolicy(read()), { allowed: true, conflicts: 0 });
});

test('Concurrent resume attempts respect a live recovery lock and do not launch a second worker', t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 999999 } });
  fs.writeFileSync(path.join(f.directory, 'resume.lock'), JSON.stringify({ pid: process.pid, bootTimeMs: Date.now() - os.uptime() * 1000 }));
  const recorder = spawnRecorder();
  const result = recoverPending(f.env, { isProcessAlive: pid => pid === process.pid, spawn: recorder.spawn });
  assert.equal(result.state, 'starting');
  assert.equal(result.resumed, false);
  assert.equal(recorder.calls.length, 0);
});

test('Changing the scope under an existing request cannot expand a completion worker into chat automation', async t => {
  const f = fixture(t);
  let calls = 0;
  const result = await runWorker(f.request, { intervalMs: 1, apply: (_env, options) => {
    calls++;
    assert.equal(options.scope, 'completion');
    fs.writeFileSync(f.request, JSON.stringify({ ...f.job, scope: 'all', includeMcp: true }));
    return { deferred: true };
  } });
  assert.equal(calls, 1);
  assert.equal(result.superseded, true);
  assert.equal(getSetupStatus(f.env).state, 'invalid');
});

test('Failure to launch a recovery worker stays unapplied and can be retried without expanding its scope', t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 999999 } });
  const result = recoverPending(f.env, { isProcessAlive: dead, spawn: () => Object.assign(new EventEmitter(), { unref() {} }) });
  assert.equal(result.applied, false);
  assert.equal(result.resumed, false);
  assert.equal(result.state, 'failed');
  assert.equal(getSetupStatus(f.env).recoverable, true);
  const recorder = spawnRecorder();
  const retry = recoverPending(f.env, { isProcessAlive: dead, spawn: recorder.spawn });
  assert.equal(retry.resumed, true);
  assert.equal(retry.scope, 'completion');
});

test('Recovery launches the worker with a live Node even when the saved runtime path vanished (K2 regression)', t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 999999 } });
  const staleNode = path.join(f.env.geminiConfigDir, 'gone-runtime', 'node.exe');
  fs.writeFileSync(f.request, JSON.stringify({ ...f.job, env: { ...f.job.env, nodeExe: staleNode } }));
  const recorder = spawnRecorder();
  const result = recoverPending(f.env, { isProcessAlive: dead, spawn: recorder.spawn });
  assert.equal(result.resumed, true, JSON.stringify(result));
  assert.equal(recorder.calls.length, 1);
  assert.equal(recorder.calls[0][0], process.execPath, 'The launcher must fall back to its own working Node, not the vanished saved path');
  assert.notEqual(recorder.calls[0][0], staleNode);
});

test('A crash-truncated resume lock is replaced and the same request resumes (K3 regression)', t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 999999 } });
  const lock = path.join(f.directory, 'resume.lock');
  fs.writeFileSync(lock, '{"pid":123,"boot');
  const recorder = spawnRecorder();
  const result = recoverPending(f.env, { isProcessAlive: dead, spawn: recorder.spawn });
  assert.equal(result.resumed, true, JSON.stringify(result));
  assert.equal(recorder.calls.length, 1, 'The worker must launch on the first recovery attempt');
  assert.equal(fs.existsSync(lock), false, 'The replaced lock does not survive a finished recovery');
  const busy = fixture(t, { status: { state: 'waiting', pid: 999999 } });
  fs.writeFileSync(path.join(busy.directory, 'resume.lock'), JSON.stringify({ pid: process.pid, bootTimeMs: Date.now() - os.uptime() * 1000 }));
  const blocked = recoverPending(busy.env, { isProcessAlive: pid => pid === process.pid, spawn: spawnRecorder().spawn });
  assert.equal(blocked.resumed, false);
  assert.equal(blocked.state, 'starting');
  const failed = fixture(t, { status: { state: 'failed', reason: 'compatibility' } });
  let exit = 0;
  try { execFileSync(process.execPath, [path.resolve('lib/setup-status.js'), '--resume', failed.request], { encoding: 'utf8' }); }
  catch (error) { exit = error.status; }
  assert.equal(exit, 1, 'A failed recovery must not exit 0');
});

test('The persistent status CLI reports human or JSON output without resuming work or changing profile files', t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 999999 } });
  const script = path.resolve('lib/setup-status.js');
  const files = [f.request, f.statusFile, f.dbFile];
  const before = files.map(file => fs.readFileSync(file));
  const readable = execFileSync(process.execPath, [script, '--status', f.request], { encoding: 'utf8' });
  assert.match(readable, /Native setup: interrupted/);
  assert.match(readable, /Live Antigravity behavior: not verified/);
  const json = JSON.parse(execFileSync(process.execPath, [script, '--status', f.request, '--json'], { encoding: 'utf8' }));
  assert.equal(json.state, 'interrupted');
  assert.equal(json.applied, false);
  assert.deepEqual(files.map(file => fs.readFileSync(file)), before);
  assert.equal(fs.existsSync(path.join(f.directory, 'resume.lock')), false);
});

test('A starting worker gets a grace period even when its launcher has already exited', t => {
  const f = fixture(t, { status: { state: 'starting', launcherPid: 999999 } });
  assert.equal(getSetupStatus(f.env, { isProcessAlive: dead }).state, 'starting');
  assert.equal(getSetupStatus(f.env, { isProcessAlive: dead, now: Date.now() + 11000 }).state, 'interrupted');
});

test('Older protocol-2 statuses without boot metadata can still detect a restart and reused PID', t => {
  const f = fixture(t, { status: { state: 'waiting', pid: 123 } });
  fs.writeFileSync(f.request, JSON.stringify({ ...f.job, requestedAt: new Date(Date.now() - 3 * 3600000).toISOString() }));
  const status = getSetupStatus(f.env, { isProcessAlive: () => true, bootTimeMs: Date.now() - 3600000 });
  assert.equal(status.state, 'interrupted');
  assert.equal(status.recoverable, true);
});
