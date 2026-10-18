import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { assertStored, ownedPolicies, assertHarness, workerReachedWaiting, redactLog, until } = require('./controller.cjs');
const { mergePolicies, mergeTabPolicies, TAB_TOPIC_KEY } = require('../../lib/agent-automation');
const { TOPIC_KEY, stringField } = require('../../lib/mcp-permissions');

test('The smoke rejects success reports without real completion and language checks', () => {
  assert.throws(() => assertHarness({ passed: false, phase: 'initial', error: 'extension host failed' }, 'initial'));
  assert.throws(() => assertHarness({ passed: true, phase: 'initial', checks: [], checkedLanguages: [] }, 'initial'));
  assert.doesNotThrow(() => assertHarness({ passed: true, phase: 'initial', checkedLanguages: ['typescript', 'python'],
    checks: ['native TypeScript variable completion', 'native TypeScript symbol auto-import completion'] }, 'initial'));
});
test('Stored verification requires both actual native topics, terminal/artifact policies and MCP allow', () => {
  const approvals = require('../../lib/approval-policies');
  const valid = { [TOPIC_KEY]: mergePolicies(''), [TAB_TOPIC_KEY]: mergeTabPolicies(''),
    ...Object.fromEntries(approvals.EXTRA_TOPIC_KEYS.map(key => [key, approvals.merge('', key)])) };
  assert.equal(assertStored(valid).mcpAllowed, true);
  assert.throws(() => assertStored({ ...valid, [TOPIC_KEY]: mergePolicies('', false) }));
  assert.throws(() => assertStored({ ...valid, [TAB_TOPIC_KEY]: '' }));
  assert.throws(() => assertStored({ ...valid, [TOPIC_KEY]: '' }));
  for (const key of approvals.EXTRA_TOPIC_KEYS) assert.throws(() => assertStored({ ...valid, [key]: '' }));
});
test('Polling propagates a real failure and times out instead of silently passing', async () => {
  await assert.rejects(until(() => { throw new Error('actual failure'); }, 'test', 1), /actual failure/);
  await assert.rejects(until(() => false, 'missing real IDE', 1), /Timed out: missing real IDE/);
  await until(() => true, 'ready');
});
test('A synchronously published starting status does not count as an active waiting worker', () => {
  assert.equal(workerReachedWaiting({ state: 'starting', launcherPid: 123 }), false);
  assert.equal(workerReachedWaiting({ state: 'waiting', pid: 456 }), true);
  assert.throws(() => workerReachedWaiting({ state: 'failed', reason: 'could not load runtime' }), /must wait/);
  assert.throws(() => workerReachedWaiting({ state: 'applied' }), /must wait/);
});
test('Before-close verification permits unrelated IDE startup preferences to change', () => {
  const native = { [TOPIC_KEY]: mergePolicies(''), [TAB_TOPIC_KEY]: mergeTabPolicies('') };
  const foreign = stringField(1, Buffer.concat([stringField(1, 'unrelatedIdeStartupPreference'),
    stringField(2, stringField(1, Buffer.from([16, 42]).toString('base64')))]));
  const withStartupUpdate = Object.fromEntries(Object.entries(native).map(([key, value]) =>
    [key, Buffer.concat([Buffer.from(value, 'base64'), foreign]).toString('base64')]));
  assert.deepEqual(ownedPolicies(withStartupUpdate), ownedPolicies(native));
  assert.notDeepEqual(ownedPolicies({ ...native, [TAB_TOPIC_KEY]: '' }), ownedPolicies(native));
});
test('Public failure summaries redact token-shaped IDE log values', () => {
  const safe = redactLog('Bearer abc.def https://example.test/?code=PRIVATE&access_token=SECRET accessToken="HIDDEN" startup failed');
  for (const secret of ['abc.def', 'PRIVATE', 'SECRET', 'HIDDEN']) assert.equal(safe.includes(secret), false);
  assert.ok(safe.includes('startup failed'));
});
