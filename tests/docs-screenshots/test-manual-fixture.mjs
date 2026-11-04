import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
test('Manual capture fixture creates only disposable local refs and a genuine merge conflict', t => {
  const fixture = require('./manual-fixture.cjs').createFixture();
  assert.equal(path.dirname(fixture.root), os.tmpdir());
  assert.ok(path.basename(fixture.root).startsWith('workstation guide '));
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: fixture.repo, encoding: 'utf8', stdio: 'pipe' }).trim();
  assert.equal(git('remote', 'get-url', 'origin'), fixture.origin);
  assert.equal(git('branch', '--show-current'), 'main'); assert.equal(git('status', '--porcelain'), '');
  for (const branch of ['main', 'demo-other', 'incoming']) {
    assert.equal(git('rev-parse', 'refs/heads/' + branch), git('rev-parse', 'refs/remotes/origin/' + branch));
  }
  git('switch', 'demo-other');
  assert.throws(() => git('merge', '--no-edit', 'origin/incoming'));
  assert.equal(git('diff', '--name-only', '--diff-filter=U'), 'shared.txt');
  assert.match(fs.readFileSync(path.join(fixture.repo, 'shared.txt'), 'utf8'), /<<<<<<< HEAD/);
  git('merge', '--abort');
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(fs.readFileSync(path.join(fixture.repo, 'shared.txt'), 'utf8'), 'local current shared content\n');
});
