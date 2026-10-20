import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { stringField, fields, readMcpPolicy } = require('../lib/mcp-permissions');
const { mergePolicies, readPolicies, restorePolicies, POLICIES, runWorker,
  mergeTabPolicies, readTabPolicies, restoreTabPolicies, TAB_POLICIES } = require('../lib/agent-automation');
const { mergeSettings, mergeKeybindings } = require('../lib/profile-settings');
const automation = require('../lib/agent-automation');
const entry = (key, value) => stringField(1, Buffer.concat([stringField(1, key), stringField(2, stringField(1, value))]));
const integer = n => Buffer.from([16, n]).toString('base64');
function grantFields(value) {
  const row = fields(Buffer.from(value, 'base64')).find(f => fields(f.value).some(x => x.id === 1 && x.value.toString() === 'permission_grants_global'));
  const pair = fields(row.value), encoded = fields(pair.find(f => f.id === 2).value).find(f => f.id === 1).value.toString();
  return fields(Buffer.from(encoded, 'base64')).map(f => [f.id, f.value.toString()]);
}

test('Native Always modes remove global review restrictions for supported tools and retain foreign bytes; repeat is stable', () => {
  const foreign = entry('model', 'SENSITIVE-UNRELATED');
  const secure = entry('secureModeSentinelKey', Buffer.from([8, 1]).toString('base64'));
  const sandbox = entry('enableTerminalSandboxSentinelKey', Buffer.from([8, 1]).toString('base64'));
  const grants = entry('permission_grants_global', stringField(3, 'command(rm)').toString('base64'));
  const before = Buffer.concat([foreign, secure, sandbox, grants, entry(Object.keys(POLICIES)[0], integer(1))]).toString('base64');
  const next = mergePolicies(before);
  assert.deepEqual(readPolicies(next), { secureModeSentinelKey: 0, enableTerminalSandboxSentinelKey: 0, ...POLICIES });
  assert.deepEqual(fields(Buffer.from(next, 'base64'))[0].raw, foreign);
  assert.deepEqual(readMcpPolicy(next), { allowed: true, conflicts: 0 });
  assert.deepEqual(grantFields(next), require('../lib/mcp-permissions').AUTO_ALLOW.map(value => [1, value]));
  assert.equal(mergePolicies(next), next);
  assert.deepEqual(readPolicies(mergePolicies('', false)), { ...POLICIES, enableTerminalSandboxSentinelKey: 0, secureModeSentinelKey: 0 });
  assert.equal(readMcpPolicy(mergePolicies('', false)).allowed, false);
});

test('Malformed types, invalid base64 and duplicate native rows are refused', () => {
  assert.throws(() => mergePolicies('not base64'));
  assert.throws(() => mergePolicies(Buffer.from([10, 100]).toString('base64')));
  const key = Object.keys(POLICIES)[0];
  assert.throws(() => mergePolicies(Buffer.concat([entry(key, integer(1)), entry(key, integer(3))]).toString('base64')), /Duplicate/);
  assert.throws(() => mergePolicies(entry(key, Buffer.from([8, 1]).toString('base64')).toString('base64')), /type/);
});

test('Restore removes newly managed approvals and retains later model and unknown resource grants', () => {
  const old = Buffer.concat([entry('model', 'OLD'), entry('permission_grants_global', stringField(3, 'mcp(*)').toString('base64'))]).toString('base64');
  const later = Buffer.concat([entry('model', 'NEW'), entry('permission_grants_global', Buffer.concat([stringField(1, 'mcp(*)'), stringField(3, 'future_resource(keep)')]).toString('base64')),
    ...Object.entries(POLICIES).map(([k, v]) => entry(k, integer(v)))]).toString('base64');
  const restored = restorePolicies(later, old, true);
  assert.deepEqual(readPolicies(restored), {});
  assert.ok(Buffer.from(restored, 'base64').includes(entry('model', 'NEW')));
  assert.deepEqual(readMcpPolicy(restored), { allowed: false, conflicts: 1 });
  assert.ok(Buffer.from(restored, 'base64').includes(Buffer.from(Buffer.concat([stringField(3, 'future_resource(keep)'), stringField(3, 'mcp(*)')]).toString('base64'))));
});

test('Quiet Tab preferences use native enum integers and preserve foreign rows and row metadata', () => {
  const foreign = entry('autocompleteSpeed', integer(3));
  const primitiveMetadata = stringField(99, 'future-primitive-metadata');
  const oldPrimitive = Buffer.concat([Buffer.from([16, 2]), primitiveMetadata]).toString('base64');
  const tagged = stringField(1, Buffer.concat([stringField(1, 'tabEnabled'),
    stringField(2, Buffer.concat([stringField(1, oldPrimitive), stringField(2, 'server-etag')]))]));
  const before = Buffer.concat([foreign, tagged]).toString('base64');
  const next = mergeTabPolicies(before);
  assert.deepEqual(readTabPolicies(next), TAB_POLICIES);
  const rows = fields(Buffer.from(next, 'base64'));
  assert.deepEqual(rows[0].raw, foreign);
  assert.ok(rows[1].raw.includes(stringField(2, 'server-etag')));
  const row = fields(rows[1].value).find(field => field.id === 2);
  const encoded = fields(row.value).find(field => field.id === 1).value.toString();
  assert.deepEqual(fields(Buffer.from(encoded, 'base64')).find(field => field.id === 99).raw, primitiveMetadata);
  assert.equal(mergeTabPolicies(next), next);
  assert.deepEqual(readTabPolicies(mergeTabPolicies('')), { tabEnabled: 1, tabToJump: 2 });
});

test('Quiet Tab refuses duplicate, malformed and boolean rows rather than replacing them', () => {
  const invalid = [
    'not base64',
    Buffer.from([10, 100]).toString('base64'),
    Buffer.concat([entry('tabEnabled', integer(1)), entry('tabEnabled', integer(2))]).toString('base64'),
    entry('tabEnabled', Buffer.from([8, 0]).toString('base64')).toString('base64'),
    entry('tabEnabled', Buffer.from([16, 1, 16, 2]).toString('base64')).toString('base64'),
    entry('tabToJump', Buffer.from([26, 1, 120]).toString('base64')).toString('base64'),
  ];
  for (const value of invalid) assert.throws(() => mergeTabPolicies(value));
});

test('Quiet Tab restore owns only its two rows and preserves later unrelated changes exactly', () => {
  const originalEnabled = entry('tabEnabled', integer(2));
  const before = Buffer.concat([entry('autocompleteSpeed', integer(1)), originalEnabled]).toString('base64');
  const laterSpeed = entry('autocompleteSpeed', integer(3));
  const laterUnknown = entry('futureCompletionPreference', 'PRIVATE-FOREIGN');
  const current = Buffer.concat([laterSpeed, laterUnknown,
    ...Object.entries(TAB_POLICIES).map(([key, value]) => entry(key, integer(value)))]).toString('base64');
  const restored = restoreTabPolicies(current, before);
  assert.deepEqual(readTabPolicies(restored), { tabEnabled: 2 });
  assert.deepEqual(fields(Buffer.from(restored, 'base64')).map(f => f.raw), [laterSpeed, laterUnknown, originalEnabled]);
});

test('Queued worker retries a clean shutdown, records actual result, and reports timeout/failure honestly', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-worker-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const request = path.join(directory, 'request.json');
  fs.writeFileSync(request, JSON.stringify({ protocolVersion: 2, env: {}, scope: 'completion', includeMcp: false }));
  let calls = 0;
  const result = await runWorker(request, { intervalMs: 1, apply: (env, options) => {
    assert.equal(options.scope, 'completion'); assert.equal(options.includeMcp, false);
    return ++calls < 3 ? { deferred: true } : { applied: true, runtimeVerified: false };
  } });
  assert.equal(calls, 3); assert.equal(result.applied, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'status.json'))).state, 'applied');
  await runWorker(request, { timeoutMs: 0 });
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'status.json'))).state, 'failed');
  fs.writeFileSync(request, JSON.stringify({ cancelled: true }));
  const cancelled = await runWorker(request, { apply: () => assert.fail('Cancelled work must not apply') });
  assert.equal(cancelled.cancelled, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'status.json'))).state, 'cancelled');
});

test('Managed profile preserves unrelated settings, exclusion paths, explicit denials and personal shortcuts', () => {
  const current = { personal: 'keep', 'editor.fontSize': 12, 'files.watcherExclude': { '**/custom/**': true },
    'chat.tools.terminal.autoApprove': { 'npm install': false, rm: false, custom: true } };
  const managed = { 'editor.fontSize': 15, 'files.watcherExclude': { '**/node_modules/**': true }, 'chat.tools.terminal.autoApprove': { 'npm install': true, 'git status': true } };
  const next = mergeSettings(current, managed);
  assert.equal(next.personal, 'keep'); assert.equal(next['editor.fontSize'], 15);
  assert.deepEqual(next['files.watcherExclude'], { '**/custom/**': true, '**/node_modules/**': true });
  assert.deepEqual(next['chat.tools.terminal.autoApprove'], { 'npm install': false, rm: false, custom: true, 'git status': true });
  assert.deepEqual(mergeSettings(next, managed), next);
  const personal = { key: 'ctrl+alt+p', command: 'personal.command' };
  const bindings = [{ key: 'ctrl+f', command: 'managed.command' }];
  const nextBindings = mergeKeybindings([personal, { key: 'ctrl+f', command: 'old.command' }], bindings);
  assert.deepEqual(nextBindings, [personal, ...bindings]);
  assert.deepEqual(mergeKeybindings(nextBindings, bindings), nextBindings);
});

function automationFixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-automation-reuse-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { geminiConfigDir: path.join(root, '.gemini', 'config'), userSettingsDir: path.join(root, 'User'),
    backupsDir: path.join(root, '.gemini', 'backups'), nodeExe: process.execPath };
  const directory = path.join(env.geminiConfigDir, 'workstation-setup', automation.WORKER_DIRECTORY);
  automation.persistWorkerRuntime(directory);
  const request = path.join(directory, 'request.json');
  const requestId = crypto.randomUUID();
  const job = { protocolVersion: automation.WORKER_PROTOCOL, requestId, env, scope: 'completion', includeMcp: false,
    requestedAt: new Date().toISOString(), ...options.job };
  automation.savePrivate(request, JSON.stringify(job));
  const statusFile = automation.workerStatusFile(request, requestId);
  const bootTimeMs = Date.now() - os.uptime() * 1000;
  if (options.status) automation.savePrivate(statusFile, JSON.stringify({ protocolVersion: automation.WORKER_PROTOCOL,
    requestId, scope: job.scope, includeMcp: job.includeMcp, updatedAt: new Date().toISOString(), bootTimeMs, ...options.status }));
  return { root, env, directory, request, requestId, statusFile, job, bootTimeMs };
}

function directorySnapshot(directory) {
  return Object.fromEntries(fs.readdirSync(directory).sort().map(name => {
    const file = path.join(directory, name), stat = fs.statSync(file, { bigint: true });
    return [name, { bytes: fs.readFileSync(file), inode: stat.ino, modified: stat.mtimeNs }];
  }));
}

function workerRecorder() {
  const calls = [];
  return { calls, spawn(...args) {
    calls.push(args);
    return Object.assign(new EventEmitter(), { pid: 987654, unref() {} });
  } };
}

function withAuditedNative(t) {
  // Queue/liveness behavior is independent of the platform-specific native hash.
  // Native schema/hash and applied-database verification have separate fixtures.
  const catalog = require('../lib/native-compatibility'), original = catalog.validateNative;
  catalog.validateNative = () => null;
  t.after(() => { catalog.validateNative = original; });
}

test('Private saves and persisted worker runtime preserve identical files without replacing or touching them', t => {
  const f = automationFixture(t);
  const privateFile = path.join(f.directory, 'private-fixture');
  automation.savePrivate(privateFile, Buffer.from('owned private bytes'));
  fs.utimesSync(privateFile, new Date(1000), new Date(1000));
  const before = directorySnapshot(f.directory);
  automation.savePrivate(privateFile, 'owned private bytes');
  automation.persistWorkerRuntime(f.directory);
  assert.deepEqual(directorySnapshot(f.directory), before);
  automation.savePrivate(privateFile, 'replacement private bytes');
  assert.equal(fs.readFileSync(privateFile, 'utf8'), 'replacement private bytes');
  assert.deepEqual(fs.readdirSync(f.directory).filter(name => name.endsWith('.tmp')), []);
});

test('Repeated setup reuses fresh startup and live waiting requests without spawning or rewriting any file', t => {
  withAuditedNative(t);
  for (const status of [undefined, { state: 'starting' }, { state: 'waiting', pid: 12345 }]) {
    const f = automationFixture(t, { status }), recorder = workerRecorder();
    const before = directorySnapshot(f.directory);
    const options = { scope: 'completion', includeMcp: false, isRunning: () => true,
      isProcessAlive: () => true, bootTimeMs: f.bootTimeMs, spawn: recorder.spawn };
    const found = automation.findReusableAutomationRequest(f.env, options);
    assert.equal(found.requestId, f.requestId);
    assert.equal(found.reused, true);
    const queued = automation.queueAutomation(f.env, options);
    assert.equal(queued.reused, true);
    assert.equal(queued.queued, true);
    assert.equal(queued.applied, false);
    assert.equal(queued.scope, 'completion');
    assert.equal(queued.requestId, f.requestId);
    assert.equal(queued.statusFile, f.statusFile);
    assert.equal(recorder.calls.length, 0);
    assert.deepEqual(directorySnapshot(f.directory), before);
    assert.equal(JSON.parse(fs.readFileSync(f.request)).cancelled, undefined);
  }
});

test('Reuse refuses stale, dead, rebooted, cancelled, foreign and changed-runtime requests without mutating them', t => {
  withAuditedNative(t);
  const cases = [
    { label: 'stale heartbeat', status: { state: 'waiting', pid: 12345, updatedAt: new Date(Date.now() - 60000).toISOString() } },
    { label: 'invalid heartbeat timestamp', status: { state: 'waiting', pid: 12345, updatedAt: 'not-a-date' } },
    { label: 'dead worker', status: { state: 'waiting', pid: 12345 }, options: { isProcessAlive: () => false } },
    { label: 'previous boot', status: { state: 'waiting', pid: 12345, bootTimeMs: Date.now() - os.uptime() * 1000 - 3600000 } },
    { label: 'expired startup', job: { requestedAt: new Date(Date.now() - 60000).toISOString() } },
    { label: 'cancelled request', job: { cancelled: true } },
    { label: 'different scope', options: { scope: 'all', includeMcp: true } },
    { label: 'different authorization', job: { scope: 'all', includeMcp: true }, options: { scope: 'all', includeMcp: false } },
    { label: 'foreign profile', alter(f) { automation.savePrivate(f.request, JSON.stringify({ ...f.job, env: { ...f.env, userSettingsDir: path.join(f.root, 'another-profile') } })); } },
    { label: 'changed runtime', alter(f) { fs.appendFileSync(path.join(f.directory, 'agent-automation.js'), '\n// older persisted runtime\n'); } },
    { label: 'missing runtime', alter(f) { fs.unlinkSync(path.join(f.directory, 'native-compatibility.json')); } },
  ];
  for (const scenario of cases) {
    const f = automationFixture(t, scenario);
    scenario.alter?.(f);
    const before = directorySnapshot(f.directory);
    const found = automation.findReusableAutomationRequest(f.env, { scope: 'completion', includeMcp: false,
      isProcessAlive: () => true, bootTimeMs: f.bootTimeMs, ...scenario.options });
    assert.equal(found, null, scenario.label);
    assert.deepEqual(directorySnapshot(f.directory), before, scenario.label);
  }
});

test('Stale or dead work, changed runtime and changed authorization are superseded once and retain cancellation behavior', t => {
  withAuditedNative(t);
  for (const scenario of ['stale', 'dead', 'runtime', 'scope']) {
    const f = automationFixture(t, { status: { state: 'waiting', pid: 12345,
      updatedAt: new Date(Date.now() - (scenario === 'stale' ? 60000 : 0)).toISOString() } });
    if (scenario === 'runtime') fs.appendFileSync(path.join(f.directory, 'agent-automation.js'), '\n// old worker\n');
    const legacyRequest = path.join(f.env.geminiConfigDir, 'workstation-setup', 'automation', 'request.json');
    automation.savePrivate(legacyRequest, JSON.stringify({ scope: 'completion', includeMcp: false }));
    const recorder = workerRecorder();
    const result = automation.queueAutomation(f.env, { scope: scenario === 'scope' ? 'all' : 'completion',
      includeMcp: scenario === 'scope', isRunning: () => true, isProcessAlive: () => scenario !== 'dead',
      bootTimeMs: f.bootTimeMs, spawn: recorder.spawn });
    assert.equal(result.queued, true, scenario);
    assert.notEqual(result.requestId, f.requestId, scenario);
    assert.equal(recorder.calls.length, 1, scenario);
    const nextJob = JSON.parse(fs.readFileSync(f.request));
    assert.equal(nextJob.requestId, result.requestId);
    assert.equal(nextJob.cancelled, undefined);
    assert.equal(nextJob.scope, scenario === 'scope' ? 'all' : 'completion');
    assert.equal(nextJob.includeMcp, scenario === 'scope');
    assert.equal(JSON.parse(fs.readFileSync(legacyRequest)).cancelled, true);
    assert.deepEqual(fs.readFileSync(path.join(f.directory, 'agent-automation.js')), fs.readFileSync(require.resolve('../lib/agent-automation')));
    assert.equal(JSON.parse(fs.readFileSync(result.statusFile)).state, 'starting');
  }
});

test('Queue retains at most three recognized request statuses and preserves malformed or foreign files', t => {
  withAuditedNative(t);
  const f = automationFixture(t, { job: { requestedAt: new Date(Date.now() - 60000).toISOString() } });
  const recognized = [];
  for (let index = 0; index < 6; index++) {
    const requestId = crypto.randomUUID(), file = automation.workerStatusFile(f.request, requestId);
    automation.savePrivate(file, JSON.stringify({ protocolVersion: automation.WORKER_PROTOCOL, requestId,
      scope: 'completion', includeMcp: false, state: 'applied', updatedAt: new Date(1000 + index * 1000).toISOString() }));
    recognized.push(file);
  }
  const preserved = [
    ['status-' + crypto.randomUUID() + '.json', '{incomplete'],
    ['status-' + crypto.randomUUID() + '.json', JSON.stringify({ protocolVersion: 2, requestId: crypto.randomUUID(), scope: 'completion', includeMcp: false, state: 'applied', updatedAt: new Date().toISOString() })],
    ['status-' + crypto.randomUUID() + '.json', JSON.stringify({ protocolVersion: 2, scope: 'completion', includeMcp: true, state: 'applied', updatedAt: new Date().toISOString() })],
    ['status-' + crypto.randomUUID() + '.json', JSON.stringify({ protocolVersion: 2, scope: 'completion', includeMcp: false, state: 'future-state', updatedAt: new Date().toISOString() })],
    ['status-' + crypto.randomUUID() + '.json', JSON.stringify({ protocolVersion: 2, scope: 'completion', includeMcp: false, state: 'applied', updatedAt: new Date().toISOString(), futureMetadata: 'keep' })],
    ['status-personal.json', 'personal status file'],
  ].map(([name, bytes]) => {
    const file = path.join(f.directory, name);
    // Fill in the matching identity for the malformed-authorization/unknown-state records.
    if (bytes.startsWith('{"protocolVersion"')) {
      const record = JSON.parse(bytes);
      if (!record.requestId) { record.requestId = name.slice(7, -5); bytes = JSON.stringify(record); }
    }
    automation.savePrivate(file, bytes);
    return { file, bytes: fs.readFileSync(file) };
  });
  const backup = path.join(f.env.backupsDir, 'agent-automation-' + crypto.randomUUID());
  automation.savePrivate(path.join(backup, 'state.vscdb'), 'private original profile bytes');
  automation.savePrivate(path.join(backup, 'manifest.json'), JSON.stringify({ format: 3, personal: 'keep' }));
  const backupNames = fs.readdirSync(f.env.backupsDir), backupBefore = directorySnapshot(backup);
  const recorder = workerRecorder();
  const result = automation.queueAutomation(f.env, { scope: 'completion', includeMcp: false,
    isRunning: () => true, spawn: recorder.spawn });
  assert.equal(recorder.calls.length, 1);
  assert.ok(fs.existsSync(result.statusFile), 'current request status must be retained');
  assert.equal(recognized.filter(file => fs.existsSync(file)).length, 2);
  assert.ok(fs.existsSync(recognized.at(-1)), 'most recent recognized history must be retained');
  assert.ok(fs.existsSync(recognized.at(-2)), 'second most recent recognized history must be retained');
  for (const item of preserved) assert.deepEqual(fs.readFileSync(item.file), item.bytes, path.basename(item.file));
  const requestIds = new Set([result.requestId]), statuses = [...recognized, result.statusFile];
  // Six real queue calls alternate authorization, so each must supersede the
  // previous request instead of taking the equivalent-request reuse path.
  for (let index = 0; index < 6; index++) {
    const scope = index % 2 === 0 ? 'all' : 'completion';
    const next = automation.queueAutomation(f.env, { scope, includeMcp: false,
      isRunning: () => true, spawn: recorder.spawn });
    assert.equal(next.queued, true);
    assert.equal(next.reused, undefined);
    assert.equal(recorder.calls.length, index + 2, 'one spawn per superseding queue');
    assert.equal(requestIds.has(next.requestId), false, 'superseding queues own unique request IDs');
    requestIds.add(next.requestId);
    statuses.push(next.statusFile);
    assert.equal(statuses.filter(file => fs.existsSync(file)).length, 3, 'recognized history stays bounded after every queue');
    assert.ok(fs.existsSync(next.statusFile), 'current queue status must survive pruning');
    const current = JSON.parse(fs.readFileSync(f.request));
    assert.equal(current.requestId, next.requestId);
    assert.equal(current.scope, scope);
    assert.equal(current.includeMcp, false);
    for (const item of preserved) assert.deepEqual(fs.readFileSync(item.file), item.bytes, path.basename(item.file));
    assert.deepEqual(fs.readdirSync(f.env.backupsDir), backupNames, 'queue must not add or remove native backups');
    assert.deepEqual(directorySnapshot(backup), backupBefore, 'queue must leave private backup files untouched');
  }
});
