import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { panel, recordingPrHead } = require('./panel-recording.cjs');
const { usesTestRunner, recordingPlan } = require('./controller.cjs');

test('Recording-only scope is explicit and never inherits normal-host Details or eight-guide acceptance', () => {
  assert.deepEqual(recordingPlan(), { scope: 'all-eight', normalDetails: true, git: true });
  assert.deepEqual(recordingPlan('calm-stability'), { scope: 'calm-stability', normalDetails: true, git: false });
  assert.deepEqual(recordingPlan('calm-stability-recording-only'), { scope: 'calm-stability-recording-only', normalDetails: false, git: false });
  assert.throws(() => recordingPlan('skip-auth'), /Unknown recording scope/);
});

test('Native reload and dialogs use normal development hosts rather than the extension-test lifecycle', () => {
  assert.equal(usesTestRunner('before'), true);
  assert.equal(usesTestRunner('details'), false);
  assert.equal(usesTestRunner('git'), false);
  assert.throws(() => usesTestRunner('unknown'), /Unknown documentation phase/);
});

test('PR recording has no deleted-branch fallback and requires a safe explicit distinct head', () => {
  for (const head of [undefined, '', 'main', '-main', 'bad..name', 'branch with spaces', 'bad@{name']) {
    assert.throws(() => recordingPrHead({ WORKSTATION_DOCS_PR_HEAD: head }));
  }
  assert.equal(recordingPrHead({ WORKSTATION_DOCS_PR_HEAD: 'fixture/approved-pr-head' }), 'fixture/approved-pr-head');
});

test('Locator reaches the actual child document inside an attached Webview bootstrap target', async t => {
  const previous = global.fetch;
  global.fetch = async () => ({ json: async () => [{ type: 'page', url: 'vscode-file://app/workbench.html', webSocketDebuggerUrl: 'ws://fixture' }] });
  t.after(() => { global.fetch = previous; });
  const calls = [];
  const root = {
    close() {},
    async call(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      if (method === 'Target.getTargets') return { targetInfos: [{ type: 'iframe', url: 'vscode-webview://fixture/index.html', targetId: 'outer' }] };
      if (method === 'Target.attachToTarget') return { sessionId: 'attached-webview' };
      if (method === 'Target.detachFromTarget') return {};
      if (method === 'Page.getFrameTree') {
        assert.equal(sessionId, 'attached-webview');
        return { frameTree: { frame: { id: 'bootstrap', url: 'vscode-webview://fixture/index.html' },
          childFrames: [{ frame: { id: 'actual-content', url: 'about:blank' } }] } };
      }
      if (method === 'Page.createIsolatedWorld') return { executionContextId: params.frameId === 'actual-content' ? 200 : 100 };
      if (method === 'Runtime.evaluate') return { result: { value: params.contextId === 200
        ? { panel: true, url: 'about:blank', branch: 'main' } : { panel: false, url: 'vscode-webview://fixture/index.html' } } };
      throw new Error('Unexpected protocol operation: ' + method);
    },
  };
  const result = await panel(1234, async () => root);
  await result.close();
  assert.ok(calls.some(call => call.method === 'Runtime.evaluate' && call.params.contextId === 200 && call.sessionId === 'attached-webview'));
  assert.ok(calls.some(call => call.method === 'Target.detachFromTarget'));
});
