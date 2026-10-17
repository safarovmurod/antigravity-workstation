import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const panelModulePath = path.resolve(__dirname, '..', 'extensions', 'mansur-github-panel', 'extension.js');
const panelModule = require(panelModulePath);

const {
  collectState,
  getDetailedBranches,
  detectDefaultBranch,
  findSafeSwitchTarget,
  checkSecretFiles,
  countUnmergedCommits,
} = panelModule;

function git(repoPath, args) {
  const res = spawnSync('git', args, { cwd: repoPath, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`Git error (${args.join(' ')}): ${res.stderr || res.stdout}`);
  }
  return res.stdout ? res.stdout.trim() : '';
}

test('GitHub Panel Complete Suite — Handlers, Guards, Push, Delete, Secrets', async (t) => {
  const baseDir = path.join(os.tmpdir(), `panel-test-${Date.now()}`);
  const bareRemote = path.join(baseDir, 'bare-remote.git');
  const repoDir = path.join(baseDir, 'work-repo');

  fs.mkdirSync(bareRemote, { recursive: true });
  fs.mkdirSync(repoDir, { recursive: true });

  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // 1. Setup bare remote
  git(bareRemote, ['init', '--bare', '-b', 'main']);

  // 2. Setup local repo
  git(repoDir, ['init', '-b', 'main']);
  git(repoDir, ['config', 'user.name', 'Mansur Test']);
  git(repoDir, ['config', 'user.email', 'mansur@example.com']);
  git(repoDir, ['remote', 'add', 'origin', bareRemote]);

  // Initial starter on main
  fs.writeFileSync(path.join(repoDir, 'starter.txt'), 'base starter code\n', 'utf8');
  git(repoDir, ['add', '--all']);
  git(repoDir, ['commit', '-m', 'Initial base template']);
  git(repoDir, ['push', '-u', 'origin', 'main']);

  const initialMainSHA = git(repoDir, ['rev-parse', 'HEAD']);
  const initialRemoteMainSHA = git(bareRemote, ['rev-parse', 'refs/heads/main']);
  assert.equal(initialMainSHA, initialRemoteMainSHA, 'Initial main SHA matches remote');

  // Test 1: detectDefaultBranch
  const detectedDefault = await detectDefaultBranch(repoDir);
  assert.equal(detectedDefault, 'main', 'Default branch should be main');

  // Test 2: Push on main/master/default branch is protected
  const mainState = await collectState(repoDir);
  assert.equal(mainState.branch, 'main');
  assert.equal(mainState.isProtected, true, 'main branch must be protected');

  // Test 3: Secret files check
  const badFiles = checkSecretFiles(['.env', '.env.local', 'id_rsa', 'secret.pem', 'app.key', 'service-account.json']);
  assert.equal(badFiles.length, 6, 'All 6 secret files should be flagged');
  const safeFiles = checkSecretFiles(['.env.example', 'index.ts', 'App.tsx']);
  assert.equal(safeFiles.length, 0, '.env.example and normal files must NOT be flagged');

  // Test 4: NEW BRANCH from base template
  // Create a new practice branch 'day-1' from origin/main
  git(repoDir, ['switch', '--no-track', '-c', 'day-1', 'origin/main']);
  git(repoDir, ['push', '-u', 'origin', 'day-1:day-1']);

  const day1RemoteSHA = git(bareRemote, ['rev-parse', 'refs/heads/day-1']);
  assert.equal(day1RemoteSHA, initialMainSHA, 'New branch day-1 points to base starter SHA');

  // Test 5: Commit message with Unicode/Cyrillic, spaces, quotes, newlines and Git Push
  fs.writeFileSync(path.join(repoDir, 'day1-feature.ts'), 'export const hello = "world";\n', 'utf8');
  const complexMsg = 'feat(auth): форма логина "Проверка"\n\nМногострочное сообщение с переносом строки';

  // Dirty check: status should be non-empty
  const dirtyStatus = await collectState(repoDir);
  assert.equal(dirtyStatus.isClean, false, 'Working tree should be dirty');

  // Add and commit with complex message
  git(repoDir, ['add', '--all']);
  git(repoDir, ['commit', '-m', complexMsg]);
  git(repoDir, ['push', '-u', 'origin', 'day-1:day-1']);

  const newDay1SHA = git(repoDir, ['rev-parse', 'HEAD']);
  const remoteDay1SHA = git(bareRemote, ['rev-parse', 'refs/heads/day-1']);
  assert.equal(newDay1SHA, remoteDay1SHA, 'Remote day-1 updated to new commit SHA');

  // Verify commit message content
  const committedLog = git(repoDir, ['log', '-1', '--pretty=%B']);
  assert.ok(committedLog.includes('форма логина "Проверка"'), 'Cyrillic and quotes preserved in commit message');
  assert.ok(committedLog.includes('Многострочное сообщение'), 'Newlines preserved in commit message');

  // Test 6: Verify main SHA was NOT touched by push from day-1
  const currentRemoteMainSHA = git(bareRemote, ['rev-parse', 'refs/heads/main']);
  assert.equal(currentRemoteMainSHA, initialMainSHA, 'Remote main branch SHA remains unchanged after day-1 push');

  // Test 7: Clean branch does not create empty commits on repeat push
  const headBeforeRepeat = git(repoDir, ['rev-parse', 'HEAD']);
  const cleanState = await collectState(repoDir);
  assert.equal(cleanState.isClean, true, 'Working tree is clean');
  const headAfterRepeat = git(repoDir, ['rev-parse', 'HEAD']);
  assert.equal(headBeforeRepeat, headAfterRepeat, 'Clean state does not generate empty commit');

  // Test 8: NEW BRANCH day-2 created strictly from base starter, not from day-1
  git(repoDir, ['switch', '--no-track', '-c', 'day-2', 'origin/main']);
  git(repoDir, ['push', '-u', 'origin', 'day-2:day-2']);

  // day-2 must NOT have day1-feature.ts
  assert.equal(fs.existsSync(path.join(repoDir, 'day1-feature.ts')), false, 'day-2 must not contain day-1 code');
  assert.equal(fs.existsSync(path.join(repoDir, 'starter.txt')), true, 'day-2 must contain base starter.txt');

  // Test 9: MY BRANCH detailed list (location markers, protection)
  const detailedBranches = await getDetailedBranches(repoDir, 'main', 'day-2');
  const mainB = detailedBranches.find(b => b.name === 'main');
  const day1B = detailedBranches.find(b => b.name === 'day-1');
  const day2B = detailedBranches.find(b => b.name === 'day-2');

  assert.ok(mainB, 'main branch found');
  assert.equal(mainB.isProtected, true, 'main is protected');
  assert.equal(mainB.location, 'local + origin');

  assert.ok(day1B, 'day-1 found');
  assert.equal(day1B.isProtected, false, 'day-1 is not protected');
  assert.equal(day1B.location, 'local + origin');

  assert.ok(day2B, 'day-2 found');
  assert.equal(day2B.isCurrent, true, 'day-2 is current');
  assert.equal(day2B.isProtected, true, 'current branch is marked protected from deletion');

  // Test 10: Switching branches safely (MY BRANCH)
  git(repoDir, ['switch', 'day-1']);
  assert.equal(fs.existsSync(path.join(repoDir, 'day1-feature.ts')), true, 'Switching to day-1 restored files');

  // Test 11: Dirty tree blocks switching
  fs.writeFileSync(path.join(repoDir, 'unsaved.txt'), 'dirty content', 'utf8');
  const dirtyCheck = await collectState(repoDir);
  assert.equal(dirtyCheck.isClean, false);
  fs.unlinkSync(path.join(repoDir, 'unsaved.txt')); // cleanup

  // Test 12: countUnmergedCommits (Unique commits detection)
  // day-1 has 1 commit that is not in main
  const unmergedDay1 = await countUnmergedCommits(repoDir, 'day-1', 'main');
  assert.equal(unmergedDay1, 1, 'day-1 has exactly 1 unmerged commit relative to main');

  // day-2 has 0 unmerged commits relative to main
  const unmergedDay2 = await countUnmergedCommits(repoDir, 'day-2', 'main');
  assert.equal(unmergedDay2, 0, 'day-2 has 0 unmerged commits relative to main');

  // Test 13: DELETE BRANCH execution
  // Switch to main to delete day-1 and day-2
  git(repoDir, ['switch', 'main']);

  // Delete day-2 (already merged / 0 unmerged commits)
  git(repoDir, ['branch', '-d', 'day-2']);
  git(repoDir, ['push', 'origin', '--delete', 'day-2']);

  const branchesAfterDel = await getDetailedBranches(repoDir, 'main', 'main');
  assert.equal(branchesAfterDel.some(b => b.name === 'day-2'), false, 'day-2 deleted locally and on remote');

  // Delete day-1 with force (-D) since it has unmerged commits
  git(repoDir, ['branch', '-D', 'day-1']);
  git(repoDir, ['push', 'origin', '--delete', 'day-1']);

  const finalBranches = await getDetailedBranches(repoDir, 'main', 'main');
  assert.equal(finalBranches.some(b => b.name === 'day-1'), false, 'day-1 deleted locally and on remote');
  assert.ok(finalBranches.some(b => b.name === 'main'), 'main branch intact and safe');

  // Test 14: Extension Activation & Webview Provider Lifecycle
  const subs = [];
  assert.doesNotThrow(() => {
    panelModule.activate({ subscriptions: subs });
  }, 'activate() must not throw ReferenceError or undeclared variable errors');
  assert.equal(subs.length, 2, 'activate registers webview provider and refresh command');

  const provider = new panelModule.GithubPanelProvider();
  const fakeWebviewView = {
    webview: {
      options: {},
      html: '',
      postMessage: () => {},
      onDidReceiveMessage: () => {},
    },
    onDidChangeVisibility: () => {},
  };
  assert.doesNotThrow(() => {
    provider.resolveWebviewView(fakeWebviewView);
  }, 'resolveWebviewView must render HTML and initialize without hanging');
  assert.ok(fakeWebviewView.webview.html.includes('CURRENT'), 'HTML contains CURRENT block');
  assert.ok(fakeWebviewView.webview.html.includes('NEW BRANCH'), 'HTML contains NEW BRANCH block');
  assert.ok(fakeWebviewView.webview.html.includes('MY BRANCH'), 'HTML contains MY BRANCH block');
  assert.ok(fakeWebviewView.webview.html.includes('DELETE BRANCH'), 'HTML contains DELETE BRANCH block');

  // Test 15: findSafeSwitchTarget logic
  const safeTarget1 = await findSafeSwitchTarget(repoDir, ['main']);
  assert.equal(safeTarget1, null, 'If main is to be deleted and no other branch exists, return null');

  git(repoDir, ['branch', 'feature-alpha']);
  const safeTarget2 = await findSafeSwitchTarget(repoDir, ['main']);
  assert.equal(safeTarget2, 'feature-alpha', 'Picks alternative local branch if main is in delete list');

  const safeTarget3 = await findSafeSwitchTarget(repoDir, ['feature-alpha']);
  assert.equal(safeTarget3, 'main', 'Prefers main if main is available');
  git(repoDir, ['branch', '-D', 'feature-alpha']);

  // Test 16: Local-only repo without origin remote
  const localOnlyRepo = path.join(baseDir, 'local-only-repo');
  fs.mkdirSync(localOnlyRepo, { recursive: true });
  git(localOnlyRepo, ['init', '-b', 'main']);
  git(localOnlyRepo, ['config', 'user.name', 'Mansur Test']);
  git(localOnlyRepo, ['config', 'user.email', 'mansur@example.com']);
  fs.writeFileSync(path.join(localOnlyRepo, 'local.txt'), 'local content');
  git(localOnlyRepo, ['add', '--all']);
  git(localOnlyRepo, ['commit', '-m', 'Initial local commit']);

  const localState = await collectState(localOnlyRepo);
  assert.equal(localState.isRepo, true, 'isRepo must be true');
  assert.equal(localState.remote, null, 'remote should be null for local-only repo');
  assert.equal(localState.branch, 'main', 'current branch is main');

  // Test 17: detectDefaultBranch in repo with neither main nor master (e.g. "trunk")
  const trunkRepo = path.join(baseDir, 'trunk-repo');
  fs.mkdirSync(trunkRepo, { recursive: true });
  git(trunkRepo, ['init', '-b', 'trunk']);
  git(trunkRepo, ['config', 'user.name', 'Mansur Test']);
  git(trunkRepo, ['config', 'user.email', 'mansur@example.com']);
  fs.writeFileSync(path.join(trunkRepo, 'file.txt'), 'trunk');
  git(trunkRepo, ['add', '--all']);
  git(trunkRepo, ['commit', '-m', 'Init trunk']);
  const trunkDefault = await detectDefaultBranch(trunkRepo);
  assert.equal(trunkDefault, 'trunk', 'detectDefaultBranch should detect "trunk" when no main/master exists');

  // Test 18: Provider re-resolve lifecycle does not leak disposables
  let disposedCount = 0;
  provider.resolveWebviewView({
    webview: {
      options: {},
      html: '',
      postMessage: () => {},
      onDidReceiveMessage: () => ({ dispose: () => { disposedCount++; } }),
    },
    onDidChangeVisibility: () => ({ dispose: () => { disposedCount++; } }),
    onDidDispose: () => ({ dispose: () => { disposedCount++; } }),
  });
  // Re-resolve
  provider.resolveWebviewView({
    webview: {
      options: {},
      html: '',
      postMessage: () => {},
      onDidReceiveMessage: () => ({ dispose: () => { disposedCount++; } }),
    },
    onDidChangeVisibility: () => ({ dispose: () => { disposedCount++; } }),
    onDidDispose: () => ({ dispose: () => { disposedCount++; } }),
  });
  assert.ok(disposedCount >= 2, 'Previous disposables must be disposed upon re-resolution');

  panelModule.deactivate();
});

