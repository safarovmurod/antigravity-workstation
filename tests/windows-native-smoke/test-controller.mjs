import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { assertStored, ownedPolicies, assertHarness, workerReachedWaiting, redactLog, until, installArtifactWithRetry } = require('./controller.cjs');
const { mergePolicies, mergeTabPolicies, TAB_TOPIC_KEY } = require('../../lib/agent-automation');
const { TOPIC_KEY, stringField } = require('../../lib/mcp-permissions');

test('The smoke rejects success reports without real completion and language checks', () => {
  assert.throws(() => assertHarness({ passed: false, phase: 'initial', error: 'extension host failed' }, 'initial'));
  assert.throws(() => assertHarness({ passed: true, phase: 'initial', checks: [], checkedLanguages: [] }, 'initial'));
  assert.doesNotThrow(() => assertHarness({ passed: true, phase: 'initial', checkedLanguages: ['typescript', 'python'],
    checks: ['Git Branch Panel activates and fetch/push reuse the actual built-in Git API', 'native TypeScript variable completion', 'native TypeScript symbol auto-import completion',
      'installed npm library symbol shows its source and accepting it inserts the matching import',
      'Prettier formats nested code with four spaces and Auto Save writes the actual file'] }, 'initial'));
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

test('Native CLI retries a crashed install and succeeds only after the exact version is listed', () => {
  let installs = 0, inventories = 0;
  const pauses = [];
  installArtifactWithRetry('owned-editor.exe', ['owned-cli.js', '--extensions-dir', 'isolated'], 'verified.vsix',
    { id: 'EditorConfig.EditorConfig', version: '0.18.2' }, {
      wait: ms => pauses.push(ms), log() {},
      execute(file, args, options) {
        assert.equal(file, 'owned-editor.exe');
        assert.equal(options.env.ELECTRON_RUN_AS_NODE, '1');
        if (args.includes('--install-extension')) {
          installs++;
          assert.ok(args.includes('verified.vsix'));
          if (installs === 1) throw new Error('FATAL ERROR: Empty MaybeLocal');
          return '';
        }
        inventories++;
        return 'editorconfig.editorconfig@0.18.2\r\n';
      },
    });
  assert.equal(installs, 2);
  assert.equal(inventories, 1);
  assert.deepEqual(pauses, [500]);
});

for (const failure of ['crash', 'unregistered']) {
  test('Native CLI stops after three ' + failure + ' attempts without reporting success', () => {
    let installs = 0, inventories = 0;
    const pauses = [];
    assert.throws(() => installArtifactWithRetry('owned-editor.exe', ['owned-cli.js'], 'verified.vsix',
      { id: 'official.extension', version: '2.0.0' }, {
        wait: ms => pauses.push(ms), log() {},
        execute(_file, args) {
          if (args.includes('--install-extension')) {
            installs++;
            if (failure === 'crash') throw new Error('fatal process error');
            return '';
          }
          inventories++;
          return 'official.extension@1.0.0\n';
        },
      }), /after 3 verified attempts/);
    assert.equal(installs, 3);
    assert.equal(inventories, failure === 'crash' ? 0 : 3);
    assert.deepEqual(pauses, [500, 1000]);
  });
}
