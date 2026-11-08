import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';

// Real git against disposable bare remotes. The origin URL looks like
// github.com and url.<bare>.insteadOf sends the traffic to the local remote.
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const panelRoot = path.join(root, 'extensions/git-branch-panel');
const { GithubPanelProvider } = require(path.join(panelRoot, 'src/panel-provider.js'));
const ACCOUNT = { id: '583231', label: 'octocat' };
const NOREPLY = '583231+octocat@users.noreply.github.com';
const GITHUB_URL = 'https://github.com/octo/demo.git';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function useGitHubUrl(repo, remote) {
  git(repo, 'remote', 'set-url', 'origin', GITHUB_URL);
  git(repo, 'config', `url.${remote}.insteadOf`, GITHUB_URL);
}

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'github-panel-workflow-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const remote = path.join(base, 'remote.git'), repo = path.join(base, 'repo');
  fs.mkdirSync(remote); fs.mkdirSync(repo);
  git(remote, 'init', '--bare', '-b', 'main');
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'core.autocrlf', 'false');
  git(repo, 'config', 'user.name', 'Panel Test'); git(repo, 'config', 'user.email', 'panel@example.invalid');
  git(repo, 'remote', 'add', 'origin', remote);
  fs.writeFileSync(path.join(repo, 'base.txt'), 'base\n'); git(repo, 'add', '.'); git(repo, 'commit', '-m', 'base'); git(repo, 'push', '-u', 'origin', 'main');
  return { base, remote, repo };
}

function clone(f, name = 'other') {
  const other = path.join(f.base, name);
  git(f.base, 'clone', f.remote, other);
  git(other, 'config', 'user.name', 'Other'); git(other, 'config', 'user.email', 'other@example.invalid');
  return other;
}

function memento() {
  const values = new Map();
  return { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, update: async (key, value) => { values.set(key, value); } };
}

function loadPanel(repo, language = 'ru') {
  const messages = [], prompts = [];
  const vscode = {
    env: { language },
    authentication: { async getSession() { return { account: ACCOUNT }; } },
    window: { async showWarningMessage(text, _options, button) { prompts.push(text); return vscode.answer === undefined ? button : vscode.answer; } },
    workspace: { workspaceFolders: [{ uri: { fsPath: repo } }], textDocuments: [] },
  };
  const provider = new GithubPanelProvider(vscode, { globalState: memento() });
  const view = { webview: { postMessage: message => messages.push(message), onDidReceiveMessage: () => ({ dispose() {} }) } };
  provider.resolveWebviewView(view);
  return { provider, vscode, view, messages, prompts, send: message => provider.handleMessage(message) };
}

const errors = h => h.messages.filter(message => message.type === 'notice' && message.level === 'error');
const lastState = h => h.messages.filter(message => message.type === 'state').at(-1).state;

test('Commit takes only the ticked files under the GitHub noreply identity; Push sends them; the global config is untouched', async t => {
  const f = fixture(t);
  useGitHubUrl(f.repo, f.remote);
  const globalFile = path.join(f.base, 'global.gitconfig');
  fs.writeFileSync(globalFile, '[user]\n\tname = Real Owner\n\temail = owner.private@gmail.com\n');
  const previous = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = globalFile;
  t.after(() => { if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = previous; });
  git(f.repo, 'config', '--unset', 'user.name'); git(f.repo, 'config', '--unset', 'user.email');
  fs.writeFileSync(path.join(f.repo, 'selected.txt'), 'selected\n'); fs.writeFileSync(path.join(f.repo, 'later.txt'), 'later\n');
  const h = loadPanel(f.repo);
  await h.send({ command: 'commit', message: 'feat: форма "Вход"', files: ['selected.txt'] });
  assert.deepEqual(errors(h), []);
  assert.equal(git(f.repo, 'log', '-1', '--format=%an <%ae>%n%s'), `octocat <${NOREPLY}>\nfeat: форма "Вход"`);
  assert.equal(git(f.repo, 'config', '--local', 'user.email'), NOREPLY);
  assert.match(fs.readFileSync(globalFile, 'utf8'), /owner\.private@gmail\.com/);
  assert.match(git(f.repo, 'status', '--porcelain'), /later\.txt/);
  assert.equal(git(f.remote, 'rev-parse', 'main'), git(f.repo, 'rev-parse', 'HEAD~1'), 'Commit does not push');
  assert.equal(lastState(h).ahead, 1);
  await h.send({ command: 'push' });
  assert.equal(git(f.remote, 'show', 'main:selected.txt'), 'selected');
  assert.throws(() => git(f.remote, 'show', 'main:later.txt'));
  assert.equal(lastState(h).ahead, 0);
});

test('A GH007 rejection is fixed by rewriting only unpushed commits to the noreply author and pushing again', async t => {
  const f = fixture(t);
  useGitHubUrl(f.repo, f.remote);
  const hook = path.join(f.remote, 'hooks/pre-receive');
  fs.writeFileSync(hook, '#!/bin/sh\nwhile read old new ref; do\n  for email in $(git log --format=%ae "$new" --not --all); do\n    case "$email" in *users.noreply.github.com) ;; *) echo "error: GH007: Your push would publish a private email address." >&2; exit 1;; esac\n  done\ndone\n');
  fs.chmodSync(hook, 0o755);
  const pushedBase = git(f.repo, 'rev-parse', 'HEAD');
  for (const name of ['one', 'two']) {
    fs.writeFileSync(path.join(f.repo, name + '.txt'), name);
    git(f.repo, 'add', '.'); git(f.repo, '-c', 'user.email=me@gmail.com', 'commit', '-m', name);
  }
  const h = loadPanel(f.repo);
  await h.send({ command: 'push' });
  assert.equal(errors(h)[0].action, 'fixAuthor');
  await h.send({ command: 'fixAuthor' });
  assert.match(h.prompts[0], /2 commit/);
  assert.equal(git(f.repo, 'log', '--format=%ae', `${pushedBase}..HEAD`), `${NOREPLY}\n${NOREPLY}`);
  assert.equal(git(f.repo, 'log', '-1', '--format=%ae', pushedBase), 'panel@example.invalid', 'commits already on GitHub keep their author');
  assert.equal(git(f.remote, 'rev-parse', 'main'), git(f.repo, 'rev-parse', 'HEAD'));
});

test('Push rejected because GitHub is ahead: Get and merge integrates the same branch, then Push succeeds', async t => {
  const f = fixture(t), other = clone(f);
  fs.writeFileSync(path.join(other, 'remote.txt'), 'server\n'); git(other, 'add', '.'); git(other, 'commit', '-m', 'server'); git(other, 'push');
  fs.writeFileSync(path.join(f.repo, 'local.txt'), 'keep local\n');
  const h = loadPanel(f.repo);
  await h.send({ command: 'commit', message: 'local', files: ['local.txt'] });
  await h.send({ command: 'push' });
  assert.equal(errors(h)[0].action, 'syncBranch');
  assert.match(errors(h)[0].details, /rejected/);
  assert.equal(git(f.repo, 'show', 'HEAD:local.txt'), 'keep local');
  await h.send({ command: 'syncBranch' });
  assert.equal(fs.readFileSync(path.join(f.repo, 'remote.txt'), 'utf8'), 'server\n');
  await h.send({ command: 'push' });
  assert.equal(errors(h).length, 1);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), git(f.remote, 'rev-parse', 'main'));
});

test('Live state reflects commits, branch switches and GitHub commits made outside the panel', async t => {
  const f = fixture(t), other = clone(f), h = loadPanel(f.repo);
  await h.send({ command: 'ready' });
  assert.deepEqual([lastState(h).ahead, lastState(h).behind, lastState(h).changedFiles.length], [0, 0, 0]);
  fs.writeFileSync(path.join(f.repo, 'edit.txt'), 'x');
  await h.send({ command: 'refresh' });
  assert.equal(lastState(h).changedFiles[0].file, 'edit.txt');
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'terminal commit');
  git(other, 'commit', '--allow-empty', '-m', 'remote'); git(other, 'push');
  git(f.repo, 'fetch');
  await h.send({ command: 'refresh' });
  assert.deepEqual([lastState(h).ahead, lastState(h).behind, lastState(h).changedFiles.length], [1, 1, 0]);
  git(f.repo, 'switch', '-c', 'terminal-branch');
  await h.send({ command: 'refresh' });
  assert.equal(lastState(h).branch, 'terminal-branch');
  assert.equal(lastState(h).remoteBranchExists, false);
});

test('Get changes reports conflicts, applies the chosen version and finishes the merge', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.repo, 'shared.txt'), 'base\n'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'shared'); git(f.repo, 'push');
  git(f.repo, 'switch', '-c', 'incoming'); fs.writeFileSync(path.join(f.repo, 'shared.txt'), 'incoming\n');
  fs.writeFileSync(path.join(f.repo, 'App2.tsx'), 'export default function App2() { return null }\n');
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'incoming'); git(f.repo, 'push', '-u', 'origin', 'incoming');
  git(f.repo, 'switch', 'main'); git(f.repo, 'branch', '-D', 'incoming');
  fs.writeFileSync(path.join(f.repo, 'shared.txt'), 'current\n'); git(f.repo, 'commit', '-am', 'current');
  const h = loadPanel(f.repo);
  await h.send({ command: 'pullBranch', sourceBranch: 'incoming' });
  assert.ok(h.messages.some(message => message.level === 'warn' && /Конфликт/.test(message.text)));
  assert.deepEqual(lastState(h).conflicts, ['shared.txt']);
  await h.send({ command: 'resolveConflicts', resolutions: { 'shared.txt': 'theirs' } });
  assert.equal(fs.readFileSync(path.join(f.repo, 'shared.txt'), 'utf8'), 'incoming\n');
  assert.equal(fs.existsSync(path.join(f.repo, 'App2.tsx')), true);
  assert.equal(fs.existsSync(path.join(f.repo, '.git', 'MERGE_HEAD')), false);
});

test('A conflicted merge can be cancelled and the files return to their previous state', async t => {
  const f = fixture(t);
  git(f.repo, 'switch', '-c', 'incoming'); fs.writeFileSync(path.join(f.repo, 'base.txt'), 'incoming\n');
  git(f.repo, 'commit', '-am', 'incoming'); git(f.repo, 'push', '-u', 'origin', 'incoming');
  git(f.repo, 'switch', 'main'); fs.writeFileSync(path.join(f.repo, 'base.txt'), 'local\n'); git(f.repo, 'commit', '-am', 'local');
  const before = git(f.repo, 'rev-parse', 'HEAD'), h = loadPanel(f.repo);
  await h.send({ command: 'pullBranch', sourceBranch: 'incoming' });
  await h.send({ command: 'abortOperation' });
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before);
  assert.equal(fs.readFileSync(path.join(f.repo, 'base.txt'), 'utf8'), 'local\n');
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('Get changes is refused with uncommitted files and fails safely when GitHub is unreachable', async t => {
  const f = fixture(t), h = loadPanel(f.repo);
  fs.writeFileSync(path.join(f.repo, 'base.txt'), 'unsaved local work\n');
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.equal(errors(h)[0].text, 'Сначала сделай Commit своих изменений.');
  assert.equal(fs.readFileSync(path.join(f.repo, 'base.txt'), 'utf8'), 'unsaved local work\n');
  git(f.repo, 'checkout', '--', 'base.txt');
  const before = git(f.repo, 'rev-parse', 'HEAD');
  git(f.repo, 'remote', 'set-url', 'origin', path.join(f.base, 'missing-server.git'));
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.match(errors(h)[1].text, /missing-server\.git/, 'the reason git printed is shown');
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before);
});

test('Delete removes a branch locally and in GitHub with one confirmation and backs up unmerged commits', async t => {
  const f = fixture(t);
  git(f.repo, 'switch', '-c', 'unmerged');
  fs.writeFileSync(path.join(f.repo, 'feature.txt'), 'keep commit');
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'feature'); git(f.repo, 'push', '-u', 'origin', 'unmerged');
  const unmergedSha = git(f.repo, 'rev-parse', 'HEAD');
  git(f.repo, 'switch', 'main'); git(f.repo, 'branch', 'never-pushed');
  const h = loadPanel(f.repo);
  h.vscode.answer = null;
  await h.send({ command: 'deleteBranches', branches: ['unmerged'] });
  assert.match(h.prompts[0], /unmerged — на компьютере и в GitHub; 1 commit\(ов\) нет в main/);
  assert.ok(git(f.remote, 'rev-parse', 'refs/heads/unmerged'), 'Cancel keeps the GitHub branch');
  h.vscode.answer = undefined;
  await h.send({ command: 'deleteBranches', branches: ['unmerged', 'never-pushed'] });
  for (const branch of ['unmerged', 'never-pushed']) assert.throws(() => git(f.repo, 'rev-parse', '--verify', 'refs/heads/' + branch));
  assert.throws(() => git(f.remote, 'rev-parse', '--verify', 'refs/heads/unmerged'));
  const backup = git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/workstation-backup/');
  assert.match(backup, new RegExp('^refs/workstation-backup/unmerged-\\d{8}T\\d{6} ' + unmergedSha + '$'));
  assert.ok(h.messages.some(message => message.level === 'ok' && /Резервная копия/.test(message.text)));
  await h.send({ command: 'deleteBranches', branches: ['main'] });
  assert.match(errors(h)[0].text, /основная ветка/);
  await h.send({ command: 'deleteBranches', branches: ['--all'] });
  assert.match(errors(h)[1].text, /Недопустимое имя ветки/);
});

test('Deleting the active branch keeps its changes in git stash; an unsaved editor stops it first', async t => {
  const f = fixture(t);
  git(f.repo, 'switch', '-c', 'work'); git(f.repo, 'push', '-u', 'origin', 'work');
  fs.writeFileSync(path.join(f.repo, 'base.txt'), 'edited on work\n');
  const h = loadPanel(f.repo);
  h.vscode.workspace.textDocuments = [{ isDirty: true, uri: { fsPath: path.join(f.repo, 'base.txt') } }];
  await h.send({ command: 'deleteBranches', branches: ['work'] });
  assert.match(errors(h)[0].text, /Сохрани/);
  assert.equal(git(f.repo, 'branch', '--show-current'), 'work');
  h.vscode.workspace.textDocuments = [];
  await h.send({ command: 'deleteBranches', branches: ['work'] });
  assert.equal(git(f.repo, 'branch', '--show-current'), 'main');
  assert.throws(() => git(f.remote, 'rev-parse', '--verify', 'refs/heads/work'));
  const kept = git(f.repo, 'diff', 'HEAD', '--', 'base.txt') || git(f.repo, 'stash', 'show', '-p', 'stash@{0}');
  assert.match(kept, /edited on work/);
});

test('A newer GitHub push after the confirmation survives the delete lease', async t => {
  const f = fixture(t);
  git(f.repo, 'branch', 'lease-race'); git(f.repo, 'push', 'origin', 'lease-race');
  const old = git(f.repo, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.repo, 'concurrent.txt'), 'new push');
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'concurrent push fixture');
  const newer = git(f.repo, 'rev-parse', 'HEAD');
  git(f.repo, 'push', 'origin', 'HEAD:refs/heads/race-object-staging');
  git(f.repo, 'reset', '--hard', old);
  const h = loadPanel(f.repo);
  h.vscode.window.showWarningMessage = async (_text, _options, button) => {
    git(f.remote, 'update-ref', 'refs/heads/lease-race', newer, old);
    return button;
  };
  await h.send({ command: 'deleteBranches', branches: ['lease-race'] });
  assert.equal(git(f.remote, 'rev-parse', 'refs/heads/lease-race'), newer);
  assert.ok(h.messages.some(message => message.level === 'warn' && /stale info|rejected/i.test(message.text)));
});

test('Switch never asks to push: colliding changes are kept aside and return when switching back', async t => {
  const f = fixture(t); git(f.repo, 'switch', '-c', 'other');
  fs.writeFileSync(path.join(f.repo, 'base.txt'), 'other branch\n'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'other');
  git(f.repo, 'switch', 'main');
  const h = loadPanel(f.repo);
  fs.writeFileSync(path.join(f.repo, 'base.txt'), 'saved local change\n');
  fs.writeFileSync(path.join(f.repo, 'new-file.txt'), 'untracked work\n');
  await h.send({ command: 'switchBranch', name: 'other' });
  assert.equal(git(f.repo, 'branch', '--show-current'), 'other');
  assert.equal(fs.readFileSync(path.join(f.repo, 'base.txt'), 'utf8'), 'other branch\n');
  assert.ok(h.messages.some(message => message.level === 'ok' && /отложены/.test(message.text)));
  await h.send({ command: 'switchBranch', name: 'main' });
  assert.equal(fs.readFileSync(path.join(f.repo, 'base.txt'), 'utf8'), 'saved local change\n');
  assert.equal(fs.readFileSync(path.join(f.repo, 'new-file.txt'), 'utf8'), 'untracked work\n');
  assert.equal(git(f.repo, 'stash', 'list'), '');
});

test('New branch is created locally from the current or a chosen branch with its changes, also without origin', async t => {
  const f = fixture(t);
  git(f.repo, 'switch', '-c', 'day-1');
  fs.writeFileSync(path.join(f.repo, 'day.txt'), 'day one\n'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'day');
  git(f.repo, 'switch', 'main');
  fs.writeFileSync(path.join(f.repo, 'base.txt'), 'started on main\n');
  const h = loadPanel(f.repo);
  await h.send({ command: 'newBranch', name: 'day-2' });
  assert.equal(git(f.repo, 'branch', '--show-current'), 'day-2');
  assert.equal(fs.readFileSync(path.join(f.repo, 'base.txt'), 'utf8'), 'started on main\n');
  assert.throws(() => git(f.remote, 'rev-parse', '--verify', 'refs/heads/day-2'), 'nothing is pushed');
  await h.send({ command: 'newBranch', name: 'day-2' });
  assert.match(errors(h)[0].text, /уже есть/);
  await h.send({ command: 'newBranch', name: 'from-day-1', baseBranch: 'day-1' });
  assert.equal(git(f.repo, 'branch', '--show-current'), 'from-day-1');
  assert.equal(fs.existsSync(path.join(f.repo, 'day.txt')), true);
  assert.equal(fs.readFileSync(path.join(f.repo, 'base.txt'), 'utf8'), 'started on main\n');
  git(f.repo, 'remote', 'remove', 'origin');
  await h.send({ command: 'newBranch', name: 'offline', baseBranch: 'main' });
  assert.equal(git(f.repo, 'branch', '--show-current'), 'offline');
});

test('Secret files are never committed', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.repo, '.env'), 'TOKEN=1');
  const h = loadPanel(f.repo);
  await h.send({ command: 'ready' });
  assert.equal(lastState(h).changedFiles.find(item => item.file === '.env').secret, true);
  await h.send({ command: 'commit', message: 'secret', files: ['.env'] });
  assert.match(errors(h)[0].text, /секретный файл/);
  assert.equal(git(f.repo, 'diff', '--cached', '--name-only'), '');
});

test('Real HTTP Git server: Commit, Push and Get changes work and an outage is reported without changes', async t => {
  const f = fixture(t);
  git(f.remote, 'config', 'http.receivepack', 'true');
  let unavailable = false;
  const server = http.createServer((request, response) => {
    if (unavailable) { response.writeHead(503); response.end('Temporary test server outage'); return; }
    const url = new URL(request.url, 'http://localhost');
    const backend = spawn('git', ['http-backend'], { env: { ...process.env,
      GIT_PROJECT_ROOT: f.base, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: url.pathname,
      QUERY_STRING: url.search.slice(1), REQUEST_METHOD: request.method,
      CONTENT_TYPE: request.headers['content-type'] || '', REMOTE_USER: 'test-user',
    }, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; backend.stdout.on('data', chunk => chunks.push(chunk));
    backend.stderr.resume(); backend.on('error', error => { response.writeHead(500); response.end(error.message); });
    request.pipe(backend.stdin); backend.stdin.on('error', () => {});
    backend.on('close', () => {
      if (response.writableEnded) return;
      const bytes = Buffer.concat(chunks), split = bytes.indexOf('\r\n\r\n');
      if (split < 0) { response.writeHead(500); response.end('Invalid CGI response'); return; }
      const headers = {}; let status = 200;
      for (const line of bytes.subarray(0, split).toString().split('\r\n')) {
        const colon = line.indexOf(':'); if (colon < 0) continue;
        const key = line.slice(0, colon), value = line.slice(colon + 1).trim();
        if (key.toLowerCase() === 'status') status = parseInt(value, 10); else headers[key] = value;
      }
      response.writeHead(status, headers); response.end(bytes.subarray(split + 4));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  git(f.repo, 'remote', 'set-url', 'origin', 'http://127.0.0.1:' + server.address().port + '/remote.git');
  const h = loadPanel(f.repo);
  fs.writeFileSync(path.join(f.repo, 'network.txt'), 'HTTP push payload\n');
  await h.send({ command: 'commit', message: 'HTTP push', files: ['network.txt'] });
  await h.send({ command: 'push' });
  assert.equal(git(f.remote, 'show', 'main:network.txt'), 'HTTP push payload');
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.deepEqual(errors(h), []);
  unavailable = true;
  const before = git(f.repo, 'rev-parse', 'HEAD');
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.match(errors(h)[0].text + errors(h)[0].details, /503|unable to access/);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before);
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('Same-branch Get changes works with a CRLF checkout and keeps a clean tree', async t => {
  const f = fixture(t), other = clone(f, 'Другой пользователь with spaces');
  git(f.repo, 'config', 'core.autocrlf', 'true');
  git(other, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(other, 'App2.tsx'), 'export function App2() {\n   return null\n}\n');
  git(other, 'add', '.'); git(other, 'commit', '-m', 'CRLF checkout fixture'); git(other, 'push');
  const h = loadPanel(f.repo);
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.deepEqual(errors(h), []);
  const bytes = fs.readFileSync(path.join(f.repo, 'App2.tsx'), 'utf8');
  assert.match(bytes, /\r\n/);
  assert.equal(bytes.replace(/\r\n/g, '\n'), 'export function App2() {\n   return null\n}\n');
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('Panel text follows the editor language', () => {
  const ru = loadPanel(os.tmpdir(), 'ru').view.webview.html;
  assert.match(ru, /Получить изменения/); assert.match(ru, />Commit</); assert.match(ru, />Push</);
  const en = loadPanel(os.tmpdir(), 'en').view.webview.html;
  assert.match(en, /Get changes/); assert.match(en, /Delete branch/);
});

function loadView() {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.style = {}; this.value = ''; this.listeners = {}; }
    set innerHTML(value) { this.children = []; }
    appendChild(child) {
      this.children.push(child);
      if (this.tag === 'select' && (this.children.length === 1 || child.selected)) this.value = child.value;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    querySelector() { return new Element('span'); }
    querySelectorAll(selector) {
      const all = this.children.flatMap(child => [child, ...child.querySelectorAll(selector)]);
      return all.filter(child => child.tag === selector);
    }
    get options() { return this.children; }
  }
  const elements = new Map(), posted = [];
  const selects = ['branchSelect', 'newBranchBase', 'pullSource'];
  const document = {
    createElement: tag => new Element(tag),
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element(selects.includes(id) ? 'select' : 'div')); return elements.get(id); },
    querySelectorAll: () => [], addEventListener() {}, visibilityState: 'hidden',
  };
  const context = { document, UI: require(path.join(panelRoot, 'src/webview-html.js')).RUSSIAN, acquireVsCodeApi: () => ({ postMessage: message => posted.push(message) }),
    window: { addEventListener() {} }, setInterval() {}, JSON, Object, Array, Map, Set, Boolean, String };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(panelRoot, 'src/webview/view.js'), 'utf8'), context);
  return { context, document, posted };
}

test('Live webview refresh keeps unticked files, the chosen source branch and conflict choices', () => {
  const { context, document } = loadView();
  const files = [{ file: 'chosen.ts', status: ' M', secret: false }, { file: 'later.ts', status: '??', secret: false }];
  context.updateChangedFiles(files);
  const inputs = () => document.getElementById('changedFiles').querySelectorAll('input');
  assert.deepEqual(inputs().map(input => input.checked), [true, true], 'every file is ticked by default');
  inputs()[1].checked = false;
  context.updateChangedFiles([...files, { file: 'new.ts', status: '??', secret: false }]);
  assert.deepEqual(inputs().map(input => input.checked), [true, false, true]);
  const branches = [{ name: 'main' }, { name: 'day-2' }];
  context.fillBranchSelect('pullSource', branches, 'main', true);
  document.getElementById('pullSource').value = 'day-2';
  context.fillBranchSelect('pullSource', branches, 'main', true);
  assert.equal(document.getElementById('pullSource').value, 'day-2');
  context.renderConflicts(['file.ts']);
  document.getElementById('conflictList').querySelectorAll('select')[0].value = 'theirs';
  context.renderConflicts(['file.ts']);
  assert.equal(document.getElementById('conflictList').querySelectorAll('select')[0].value, 'theirs');
});

test('Push is enabled only when there is something to push and GitHub is not ahead', () => {
  const { context } = loadView();
  const base = { remote: GITHUB_URL, hasCommits: true, ahead: 2, behind: 0, remoteBranchExists: true, mergeInProgress: false };
  assert.equal(context.canPush(base), true);
  assert.equal(context.canPush({ ...base, ahead: 0 }), false);
  assert.equal(context.canPush({ ...base, ahead: 0, remoteBranchExists: false }), true, 'a new branch can be published');
  assert.equal(context.canPush({ ...base, behind: 1 }), false);
  assert.equal(context.canPush({ ...base, remote: null }), false);
});
