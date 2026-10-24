import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { stageScriptFiles } = require('../lib/script-staging');
const { ensureJetBrainsMono } = require('../lib/font');
const { installCustomGithubPanel } = require('../lib/extensions');
const repo = path.resolve(import.meta.dirname, '..');
function source(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-stage-test-'));
  t.after(() => {
    assert.equal(path.dirname(base), path.resolve(os.tmpdir()));
    assert.ok(path.basename(base).startsWith('workstation-stage-test-'));
    fs.rmSync(base, { recursive: true, force: true });
  });
  const root = path.join(base, 'a'.repeat(90), 'b'.repeat(90), 'c'.repeat(90));
  for (const name of ['scripts/install-font.ps1', 'config/font.json', 'resources/jetbrains-mono/ttf', 'extensions/git-branch-panel']) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.cpSync(path.join(repo, name), path.join(root, name), { recursive: true });
  }
  return root;
}
test('Font helper stages exact public inputs from a source path longer than MAX_PATH and always cleans up', t => {
  const root = source(t);
  for (const status of [0, 1]) {
    let staged;
    const action = () => ensureJetBrainsMono({ repoRoot: root, platform: 'win32', log() {}, run(_file, args) {
      const script = args[args.indexOf('-File') + 1];
      staged = path.dirname(path.dirname(script));
      assert.ok(script.length < 200);
      for (const name of ['scripts/install-font.ps1', 'config/font.json', 'resources/jetbrains-mono/ttf/JetBrainsMono-Regular.ttf']) {
        assert.deepEqual(fs.readFileSync(path.join(staged, name)), fs.readFileSync(path.join(root, name)));
      }
      return { status };
    } });
    if (status) assert.throws(action, /verification failed/); else assert.equal(action().installed, true);
    assert.equal(fs.existsSync(staged), false);
  }
});
test('GitHub Panel helper uses a short script path and cleans staging when registration fails', t => {
  const root = source(t);
  let staged;
  const result = installCustomGithubPanel('test-cli', path.join(root, 'target'), path.join(root, 'extensions/git-branch-panel'), {
    platform: 'win32', log() {}, wait() {}, listInstalled: () => [], run(_file, args) {
      const script = args[args.indexOf('-File') + 1];
      staged = path.dirname(script);
      assert.ok(script.length < 200);
      for (const file of ['install-github-panel.ps1', 'package.json', 'extension.js']) {
        assert.deepEqual(fs.readFileSync(path.join(staged, file)), fs.readFileSync(path.join(root, 'extensions/git-branch-panel', file)));
      }
      return { status: 0 };
    },
  });
  assert.equal(result.success, false);
  assert.equal(fs.existsSync(staged), false);
});
test('Git Branch Panel retries a failed packaging CLI and requires registration before success', t => {
  const root = source(t);
  let attempts = 0, inventories = 0, staged;
  const result = installCustomGithubPanel('test-cli', path.join(root, 'target'), path.join(root, 'extensions/git-branch-panel'), {
    platform: 'win32', log() {}, wait() {},
    run(file, args, options) {
      assert.equal(file, 'powershell.exe'); assert.equal(options.timeout, 180000);
      staged = path.dirname(args[args.indexOf('-File') + 1]);
      return { status: ++attempts === 1 ? 3 : 0 };
    },
    listInstalled() { inventories++; return [{ id: 'workstation.git-branch-panel', version: '1.4.3' }]; },
  });
  assert.equal(result.success, true);
  assert.equal(attempts, 2); assert.equal(inventories, 1);
  assert.equal(fs.existsSync(staged), false, 'Staged source is removed even after a retried CLI failure');
});
test('Script staging rejects paths outside its input directory', () => {
  for (const files of [['../package.json'], ['/absolute'], ['config/../package.json']]) {
    assert.throws(() => stageScriptFiles(repo, files), /Invalid staged script path/);
  }
});
