import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const practiceEnginePath = path.resolve(__dirname, '..', 'scripts', 'practice-engine.mjs');

function git(repoPath, args) {
  const res = spawnSync('git', args, { cwd: repoPath, encoding: 'utf8' });
  return res;
}

test('Practice Engine Git Guards in synthetic repository', (t) => {
  const tempRepo = path.join(os.tmpdir(), `practice-test-repo-${Date.now()}`);
  fs.mkdirSync(tempRepo, { recursive: true });

  t.after(() => {
    try {
      fs.rmSync(tempRepo, { recursive: true, force: true });
    } catch (_) {}
  });

  // Initialize a bare git repository as remote origin
  const bareOrigin = path.join(os.tmpdir(), `practice-bare-origin-${Date.now()}`);
  fs.mkdirSync(bareOrigin, { recursive: true });
  git(bareOrigin, ['init', '--bare']);

  t.after(() => {
    try {
      fs.rmSync(bareOrigin, { recursive: true, force: true });
    } catch (_) {}
  });

  // Initialize working repo
  git(tempRepo, ['init', '-b', 'main']);
  git(tempRepo, ['config', 'user.name', 'Test Runner']);
  git(tempRepo, ['config', 'user.email', 'test@example.com']);
  git(tempRepo, ['remote', 'add', 'origin', bareOrigin]);

  // Initial starter commit on main
  fs.writeFileSync(path.join(tempRepo, 'starter.txt'), 'clean starter', 'utf8');
  git(tempRepo, ['add', '--all']);
  git(tempRepo, ['commit', '-m', 'Initial starter on main']);
  git(tempRepo, ['push', '-u', 'origin', 'main']);

  // 1. Guard test: practice:save should be BLOCKED on main
  const saveOnMain = spawnSync('node', [practiceEnginePath, 'save'], {
    cwd: tempRepo,
    encoding: 'utf8',
  });
  assert.equal(saveOnMain.status, 1, 'Save directly on main must exit with code 1');
  assert.ok(
    saveOnMain.stderr.includes('Save is not allowed directly on main'),
    'Should inform user that save on main is forbidden'
  );

  // 2. Guard test: practice:new should be BLOCKED if working tree is dirty
  fs.writeFileSync(path.join(tempRepo, 'dirty.txt'), 'uncommitted changes', 'utf8');
  const newDirty = spawnSync('node', [practiceEnginePath, 'new', 'day1'], {
    cwd: tempRepo,
    encoding: 'utf8',
  });
  assert.equal(newDirty.status, 1, 'Creating new practice with dirty tree must fail');
  assert.ok(
    newDirty.stderr.includes('uncommitted changes'),
    'Should alert user about uncommitted changes blocking switch'
  );

  // Clean dirty file
  fs.unlinkSync(path.join(tempRepo, 'dirty.txt'));

  // 3. Create practice branch cleanly
  const createClean = spawnSync('node', [practiceEnginePath, 'new', 'day1'], {
    cwd: tempRepo,
    encoding: 'utf8',
  });
  assert.equal(createClean.status, 0, 'Clean branch creation should succeed');

  const currentBranch = git(tempRepo, ['branch', '--show-current']).stdout.trim();
  assert.equal(currentBranch, 'day1');

  // 4. Save progress on practice branch
  fs.writeFileSync(path.join(tempRepo, 'solution.txt'), 'practice code', 'utf8');
  const savePractice = spawnSync('node', [practiceEnginePath, 'save'], {
    cwd: tempRepo,
    encoding: 'utf8',
  });
  assert.equal(savePractice.status, 0, 'Save on practice branch should succeed');

  // 5. Switch between branches cleanly
  git(tempRepo, ['switch', 'main']);
  const openBranch = spawnSync('node', [practiceEnginePath, 'open', 'day1'], {
    cwd: tempRepo,
    encoding: 'utf8',
  });
  assert.equal(openBranch.status, 0, 'Opening existing practice branch should succeed');
  assert.equal(git(tempRepo, ['branch', '--show-current']).stdout.trim(), 'day1');
});
