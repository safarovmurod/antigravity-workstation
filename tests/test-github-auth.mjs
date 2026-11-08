import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import childProcess from 'node:child_process';
import { createRequire } from 'node:module';

// The panel signs in to GitHub the way Git Bash does: it runs the real git
// executable, so Git Credential Manager supplies the user's own credentials.
const require = createRequire(import.meta.url);
const panelRoot = path.resolve(import.meta.dirname, '../extensions/git-branch-panel');
const runner = require(path.join(panelRoot, 'src/git-runner.js'));
const { explainError } = require(path.join(panelRoot, 'src/git-errors.js'));

function fakeExecFile(t, reply) {
  const calls = [];
  mock.method(childProcess, 'execFile', (file, args, options, callback) => {
    calls.push({ file, args, options });
    const { error = null, stdout = '', stderr = '' } = reply(args);
    setImmediate(() => callback(error, stdout, stderr));
  });
  t.after(() => mock.restoreAll());
  return calls;
}

test('Push and fetch run the configured git executable directly, never the editor Git API', async t => {
  runner.configureGit({ executable: 'D:/Git Portable/cmd/git.exe' });
  t.after(() => runner.configureGit({ executable: 'git' }));
  const calls = fakeExecFile(t, () => ({ stdout: '' }));
  await runner.runGit(['push', '-u', 'origin', 'feature'], 'D:/My Project');
  await runner.runGit(['fetch', 'origin', '--prune'], 'D:/My Project');
  assert.deepEqual(calls.map(call => [call.file, call.args.join(' '), call.options.cwd]), [
    ['D:/Git Portable/cmd/git.exe', 'push -u origin feature', 'D:/My Project'],
    ['D:/Git Portable/cmd/git.exe', 'fetch origin --prune', 'D:/My Project'],
  ]);
  for (const call of calls) {
    assert.equal(call.options.windowsHide, true);
    assert.equal(call.options.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(call.options.env.PATH, process.env.PATH, 'the user environment, including the credential helper, is kept');
  }
});

test('A rejected sign-in shows what git printed and is never retried with another account', async t => {
  const stderr = "remote: Permission to octo/demo.git denied to someone-else.\nfatal: unable to access 'https://github.com/octo/demo.git/': The requested URL returned error: 403";
  const calls = fakeExecFile(t, () => ({ error: Object.assign(new Error('Command failed'), { code: 128 }), stderr }));
  const error = await runner.runGit(['push', 'origin', 'feature'], '/repo').then(() => null, failure => failure);
  assert.equal(error.message, stderr);
  assert.equal(calls.length, 1);
  const explained = explainError(error);
  assert.match(explained.text, /Git Credential Manager/);
  assert.equal(explained.details, stderr);
});

test('A command that does not answer in time stops with a clear timeout message', async t => {
  fakeExecFile(t, () => ({ error: Object.assign(new Error('killed'), { killed: true, signal: 'SIGTERM' }) }));
  const error = await runner.runGit(['push', 'origin', 'feature'], '/repo').then(() => null, failure => failure);
  assert.equal(error.timedOut, true);
  assert.match(error.message, /no answer within 120 s/);
  assert.match(explainError(error).text, /не ответил вовремя/);
});

test('A missing git executable is reported instead of a generic failure', async t => {
  fakeExecFile(t, () => ({ error: Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }) }));
  const error = await runner.runGit(['status'], '/repo').then(() => null, failure => failure);
  assert.equal(error.notFound, true);
  assert.match(explainError(error).text, /Git for Windows/);
});
