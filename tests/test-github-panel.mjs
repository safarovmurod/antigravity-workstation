import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Module, { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import './test-github-panel-workflows.mjs';
import './test-github-panel-commands.mjs';

const require = createRequire(import.meta.url);
const panelRoot = path.resolve(import.meta.dirname, '../extensions/git-branch-panel');
const state = require(path.join(panelRoot, 'src/git-state.js'));
const { findSafeSwitchTarget } = require(path.join(panelRoot, 'src/actions/branches.js'));
const { GithubPanelProvider } = require(path.join(panelRoot, 'src/panel-provider.js'));
const { cleanOutput } = require(path.join(panelRoot, 'src/git-runner.js'));

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function repository(t, branch = 'main') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-state-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-b', branch);
  git(repo, 'config', 'user.name', 'Workstation Test'); git(repo, 'config', 'user.email', 'workstation@example.invalid');
  fs.writeFileSync(path.join(repo, 'starter.txt'), 'starter\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'starter');
  return { base, repo };
}

test('State lists branches, the default branch, changed files and commits waiting for push', async t => {
  const { base, repo } = repository(t);
  const remote = path.join(base, 'remote.git');
  git(base, 'init', '--bare', '-b', 'main', remote);
  git(repo, 'remote', 'add', 'origin', remote); git(repo, 'push', '-u', 'origin', 'main');
  git(repo, 'switch', '-c', 'day-1');
  fs.writeFileSync(path.join(repo, 'day.ts'), 'export {};\n');
  const dirty = await state.collectState(repo);
  assert.equal(dirty.branch, 'day-1');
  assert.equal(dirty.defaultBranch, 'main');
  assert.deepEqual(dirty.changedFiles.map(item => item.file), ['day.ts']);
  assert.equal(dirty.remoteBranchExists, false);
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'day');
  const clean = await state.collectState(repo);
  assert.deepEqual([clean.ahead, clean.behind, clean.changedFiles.length], [1, 0, 0]);
  const main = clean.branches.find(branch => branch.name === 'main');
  assert.deepEqual([main.isLocal, main.isRemote, main.isDefault], [true, true, true]);
  assert.equal(clean.branches.find(branch => branch.name === 'day-1').isCurrent, true);
  assert.equal(clean.isGitHub, false);
});

test('State works without origin, with a trunk default branch and outside a repository', async t => {
  const local = repository(t);
  const localState = await state.collectState(local.repo);
  assert.deepEqual([localState.isRepo, localState.remote, localState.ahead], [true, null, 0]);
  const trunk = repository(t, 'trunk');
  assert.equal((await state.collectState(trunk.repo)).defaultBranch, 'trunk');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-no-repo-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const none = await state.collectState(outside);
  assert.equal(none.isRepo, false);
  assert.match(none.error, /Git/);
});

test('A safe switch target prefers main and never a branch being deleted', async t => {
  const { repo } = repository(t);
  assert.equal(await findSafeSwitchTarget(repo, ['main']), null);
  git(repo, 'branch', 'feature-alpha');
  assert.equal(await findSafeSwitchTarget(repo, ['main']), 'feature-alpha');
  assert.equal(await findSafeSwitchTarget(repo, ['feature-alpha']), 'main');
});

test('Secret names, porcelain parsing, GitHub remotes and git output cleanup', () => {
  assert.equal(state.checkSecretFiles(['.env', '.env.local', 'id_rsa', 'secret.pem', 'app.key', 'service-account.json']).length, 6);
  assert.deepEqual(state.checkSecretFiles(['.env.example', 'index.ts', 'App.tsx']), []);
  assert.deepEqual(JSON.parse(JSON.stringify(state.parsePorcelainZ(' M file name.ts\0?? .env\0R  new.ts\0old.ts\0'))), [
    { file: 'file name.ts', status: ' M', secret: false }, { file: '.env', status: '??', secret: true },
    { file: 'new.ts', originalFile: 'old.ts', status: 'R ', secret: false },
  ]);
  for (const remote of ['git@github.com:owner/repo.git', 'ssh://git@github.com/owner/repo.git', 'https://github.com/owner/repo']) {
    assert.deepEqual({ ...state.parseGitHubRemote(remote) }, { owner: 'owner', repository: 'repo' }, remote);
  }
  assert.equal(state.parseGitHubRemote('https://example.com/owner/repo.git'), null);
  assert.equal(state.usesGitHubIdentity(null), false, 'a project without origin keeps its own git config');
  assert.equal(state.usesGitHubIdentity('git@github.com:owner/repo.git'), true);
  assert.equal(state.usesGitHubIdentity('https://gitlab.com/owner/repo.git'), false);
  assert.equal(cleanOutput('Rebasing (1/2)\r\x1b[KRebasing (2/2)\nerror: x\n'), 'Rebasing (2/2)\nerror: x');
});

test('Activation registers the view, refresh command, file watcher and account listener; changes refresh the view live', async t => {
  const { repo } = repository(t);
  const handlers = {}, subscriptions = [], messages = [];
  const event = name => listener => { handlers[name] = listener; return { dispose() {} }; };
  let provider;
  const vscode = {
    env: { language: 'ru' },
    authentication: { getSession: async () => undefined, onDidChangeSessions: event('sessions') },
    window: {
      createOutputChannel: () => ({ appendLine() {} }),
      registerWebviewViewProvider: (id, value) => { provider = value; return { id, dispose() {} }; },
      onDidChangeActiveTextEditor: event('editor'),
    },
    commands: { registerCommand: (id, callback) => { handlers[id] = callback; return { dispose() {} }; } },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: repo } }],
      getConfiguration: () => ({ get: () => undefined }),
      createFileSystemWatcher: pattern => ({ pattern, onDidCreate: event('create'), onDidChange: event('change'), onDidDelete: event('delete'), dispose() {} }),
      onDidChangeWorkspaceFolders: event('folders'),
    },
  };
  const load = Module._load;
  Module._load = function (request, ...rest) { return request === 'vscode' ? vscode : load.call(this, request, ...rest); };
  t.after(() => { Module._load = load; });
  const extension = require(path.join(panelRoot, 'extension.js'));
  extension.activate({ subscriptions, globalState: { get: (_key, fallback) => fallback, update: async () => {} } });
  assert.ok(provider instanceof GithubPanelProvider);
  // Bursts in dependency folders and git's object store never refresh the panel.
  for (const noisy of ['C:\\app\\node_modules\\react\\index.js', '/app/node_modules/x.js', 'C:\\app\\.git\\objects\\ab\\cdef', '/app/.git/index.lock', '/app/.git/logs/HEAD']) {
    assert.equal(extension.isNoise({ fsPath: noisy }), true, noisy);
  }
  for (const useful of ['C:\\app\\src\\App.tsx', '/app/.git/HEAD', '/app/.git/index', '/app/.git/refs/heads/main', '/app/.gitignore']) {
    assert.equal(extension.isNoise({ fsPath: useful }), false, useful);
  }
  assert.ok(subscriptions.some(item => item.pattern === '**/*'), 'one watcher covers the working tree and .git');
  for (const name of ['workstationGithubPanel.refresh', 'create', 'change', 'delete', 'editor', 'folders', 'sessions']) assert.equal(typeof handlers[name], 'function', name);
  provider.resolveWebviewView({ webview: { postMessage: message => messages.push(message), onDidReceiveMessage: () => ({ dispose() {} }) } });
  fs.writeFileSync(path.join(repo, 'typed-in-editor.ts'), 'x');
  handlers.change();
  await new Promise(resolve => setTimeout(resolve, 900));
  const last = messages.filter(message => message.type === 'state').at(-1);
  assert.ok(last, 'a file change posts fresh state without pressing refresh');
  assert.ok(last.state.changedFiles.some(item => item.file === 'typed-in-editor.ts'));
  extension.deactivate();
  for (const item of subscriptions) item.dispose?.();
});

test('A hidden panel does not read git until it is shown again', async t => {
  const { repo } = repository(t);
  const messages = [];
  const provider = new GithubPanelProvider({ env: { language: 'ru' }, authentication: { getSession: async () => undefined }, workspace: { workspaceFolders: [{ uri: { fsPath: repo } }] } });
  provider.identities.lookupUser = async () => null;
  const view = { visible: false, webview: { postMessage: message => messages.push(message), onDidReceiveMessage: () => ({ dispose() {} }) } };
  provider.resolveWebviewView(view);
  provider.refresh();
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(messages.length, 0);
  view.visible = true;
  provider.refresh();
  await new Promise(resolve => setTimeout(resolve, 900));
  assert.ok(messages.some(message => message.type === 'state'));
  provider.dispose();
});

test('Re-resolving the view disposes the previous listeners', () => {
  const provider = new GithubPanelProvider({ env: { language: 'en' }, workspace: {} });
  let disposed = 0;
  const view = () => ({
    webview: { postMessage() {}, onDidReceiveMessage: () => ({ dispose: () => { disposed++; } }) },
    onDidChangeVisibility: () => ({ dispose: () => { disposed++; } }),
    onDidDispose: () => ({ dispose: () => { disposed++; } }),
  });
  const first = view();
  provider.resolveWebviewView(first);
  assert.match(first.webview.html, /Delete branch/);
  provider.resolveWebviewView(view());
  assert.equal(disposed, 3);
  provider.dispose();
});
