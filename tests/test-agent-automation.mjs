import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { stringField, fields, readMcpPolicy } = require('../lib/mcp-permissions');
const { mergePolicies, readPolicies, restorePolicies, POLICIES, runWorker,
  mergeTabPolicies, readTabPolicies, restoreTabPolicies, TAB_POLICIES } = require('../lib/agent-automation');
const { mergeSettings, mergeKeybindings } = require('../lib/profile-settings');
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-worker-'));
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
