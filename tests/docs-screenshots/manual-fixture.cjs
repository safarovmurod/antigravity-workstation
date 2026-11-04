'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation guide '));
  const repo = path.join(root, 'Git guide workspace'), origin = path.join(root, 'Git guide origin.git');
  fs.mkdirSync(repo); fs.mkdirSync(origin);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe', timeout: 30000 }).trim();
  git(origin, 'init', '--bare', '-b', 'main'); git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Disposable Recording'); git(repo, 'config', 'user.email', 'recording@example.invalid');
  git(repo, 'config', 'core.autocrlf', 'false'); git(repo, 'remote', 'add', 'origin', origin);
  const write = (name, text) => fs.writeFileSync(path.join(repo, name), text);
  write('branch.txt', 'main branch content\n'); write('shared.txt', 'base shared content\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'Disposable recording base'); git(repo, 'push', '-u', 'origin', 'main');
  git(repo, 'switch', '-c', 'demo-other');
  write('branch.txt', 'other branch content\n'); write('shared.txt', 'local current shared content\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'Other branch with protected local work'); git(repo, 'push', '-u', 'origin', 'demo-other');
  git(repo, 'switch', 'main'); git(repo, 'switch', '-c', 'incoming');
  write('shared.txt', 'incoming shared content\n'); git(repo, 'add', '.'); git(repo, 'commit', '-m', 'Incoming conflicting change');
  git(repo, 'push', '-u', 'origin', 'incoming'); git(repo, 'switch', 'main');
  const result = { schema: 1, root, repo, origin, scope: 'Only new temporary local repositories; no GitHub/network/account/profile change',
    activeBranch: git(repo, 'branch', '--show-current'), refs: git(repo, 'branch', '--all'),
    next: 'Open repo in your already legitimately authenticated Antigravity IDE. Follow docs/LOCAL-RECORDING-RUNBOOK.md. Nothing is automatically deleted.' };
  fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify(result, null, 2));
  return result;
}
if (require.main === module) {
  if (process.argv.length !== 2) throw new Error('This fixture takes no paths or credentials; it always creates its own temporary directory.');
  console.log(JSON.stringify(createFixture(), null, 2));
}
module.exports = { createFixture };
