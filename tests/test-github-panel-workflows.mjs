import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const sourceFile = path.join(root, 'extensions/git-branch-panel/extension.js');
const panelWork = new Map();

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'github-panel-workflow-'));
  t.after(async () => {
    // Windows cannot remove a directory while a state refresh child uses it as cwd.
    for (const pending of panelWork.get(repo) || []) await pending;
    panelWork.delete(repo);
    fs.rmSync(base, { recursive: true, force: true });
  });
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

function loadPanel(repo, language = 'ru') {
  const realRequire = createRequire(sourceFile), opened = [], messages = [];
  let receiver;
  const vscode = {
    env: { language, async openExternal(uri) { opened.push(String(uri)); } },
    Uri: { file: fsPath => ({ fsPath }), parse: value => value },
    extensions: { getExtension() { return null; } },
    window: {
      activeTextEditor: null, activeTerminal: null,
      createOutputChannel: () => ({ appendLine() {} }),
      async showWarningMessage(_message, _options, first) { return first; },
      registerWebviewViewProvider() { return { dispose() {} }; },
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: repo } }],
      getConfiguration: () => ({ get(_key, fallback) { return fallback; } }),
      getWorkspaceFolder: () => null,
    },
    commands: { registerCommand() { return { dispose() {} }; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(sourceFile, 'utf8'), {
    module, exports: module.exports, require: name => name === 'vscode' ? vscode : realRequire(name),
    process, console, Buffer, setTimeout, clearTimeout, URL, structuredClone,
  }, { filename: sourceFile });
  const provider = new module.exports.GithubPanelProvider();
  const sendState = provider._sendState.bind(provider);
  provider._sendState = (...args) => {
    const pending = sendState(...args);
    if (!panelWork.has(repo)) panelWork.set(repo, []);
    panelWork.get(repo).push(pending);
    return pending;
  };
  const view = {
    visible: true,
    webview: {
      options: {}, html: '',
      postMessage(message) { messages.push(message); },
      onDidReceiveMessage(callback) { receiver = callback; return { dispose() {} }; },
    },
    onDidChangeVisibility() { return { dispose() {} }; }, onDidDispose() { return { dispose() {} }; },
  };
  provider.resolveWebviewView(view);
  return { panel: module.exports, provider, view, messages, opened, vscode, send: message => receiver(message) };
}

test('panel selects files, creates a branch from a chosen base and pushes only the selection', async t => {
  const f = fixture(t);
  git(f.repo, 'switch', '-c', 'day-1');
  fs.writeFileSync(path.join(f.repo, 'day.txt'), 'day one\n'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'day'); git(f.repo, 'push', '-u', 'origin', 'day-1');
  git(f.repo, 'switch', 'main');
  fs.writeFileSync(path.join(f.repo, 'selected.txt'), 'selected\n'); fs.writeFileSync(path.join(f.repo, 'later.txt'), 'later\n');
  const h = loadPanel(f.repo);
  await h.send({ command: 'push', commitMessage: 'selected only', selectedFiles: ['selected.txt'], createNewBranch: true,
    newBranchName: 'feature-selected', baseBranch: 'day-1', formatBeforeCommit: false });
  assert.equal(git(f.repo, 'branch', '--show-current'), 'feature-selected');
  assert.equal(fs.existsSync(path.join(f.repo, 'day.txt')), true, 'chosen base branch content is retained');
  assert.equal(git(f.remote, 'show', 'feature-selected:selected.txt'), 'selected');
  assert.throws(() => git(f.remote, 'show', 'feature-selected:later.txt'));
  assert.match(git(f.repo, 'status', '--porcelain'), /later\.txt/);
});

test('safe branch merge reports conflicts and accepts the selected incoming version', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.repo, 'shared.txt'), 'base\n'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'shared'); git(f.repo, 'push');
  git(f.repo, 'switch', '-c', 'incoming'); fs.writeFileSync(path.join(f.repo, 'shared.txt'), 'incoming\n');
  fs.writeFileSync(path.join(f.repo, 'App2.tsx'), 'export default function App2() { return null }\n');
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'incoming'); git(f.repo, 'push', '-u', 'origin', 'incoming');
  git(f.repo, 'switch', 'main');
  git(f.repo, 'branch', '-f', 'incoming', 'main'); // Keep the local branch stale: Pull must prefer the fetched GitHub branch.
  fs.writeFileSync(path.join(f.repo, 'shared.txt'), 'current\n'); git(f.repo, 'commit', '-am', 'current');
  const h = loadPanel(f.repo);
  await h.send({ command: 'pullBranch', sourceBranch: 'incoming' });
  const conflict = h.messages.find(message => message.type === 'mergeConflict');
  assert.deepEqual(Array.from(conflict.conflicts), ['shared.txt']);
  await h.send({ command: 'resolveConflicts', resolutions: { 'shared.txt': 'theirs' } });
  assert.equal(fs.readFileSync(path.join(f.repo, 'shared.txt'), 'utf8'), 'incoming\n');
  assert.equal(fs.readFileSync(path.join(f.repo, 'App2.tsx'), 'utf8'), 'export default function App2() { return null }\n');
  assert.equal(fs.existsSync(path.join(f.repo, '.git', 'MERGE_HEAD')), false);
});

test('panel localizes itself and opens an official GitHub compare page for Pull Request', async t => {
  const f = fixture(t);
  git(f.repo, 'branch', 'other'); git(f.repo, 'push', 'origin', 'other');
  const ssh = path.join(f.base, 'fixture-ssh.cjs');
  fs.writeFileSync(ssh, `const {spawnSync}=require('node:child_process');const r=spawnSync('git',['upload-pack',${JSON.stringify(f.remote)}],{stdio:'inherit'});process.exit(r.status??1);`);
  git(f.repo, 'config', 'core.sshCommand', `"${process.execPath.replaceAll('\\', '/')}" "${ssh.replaceAll('\\', '/')}"`);
  git(f.repo, 'config', 'ssh.variant', 'simple');
  git(f.repo, 'remote', 'set-url', 'origin', 'git@github.com:example/project.git');
  const ru = loadPanel(f.repo, 'ru');
  assert.match(ru.view.webview.html, /Текущая ветка/); assert.match(ru.view.webview.html, /Получить изменения/);
  await ru.send({ command: 'openPullRequest', baseBranch: 'other' });
  assert.equal(ru.opened[0], 'https://github.com/example/project/compare/other...main?expand=1');
  git(f.repo, 'branch', 'local-only');
  await ru.send({ command: 'openPullRequest', baseBranch: 'local-only' });
  assert.equal(ru.opened.length, 1);
  fs.writeFileSync(path.join(f.repo, 'unpublished.txt'), 'local commit');
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'unpublished');
  await ru.send({ command: 'openPullRequest', baseBranch: 'other' });
  assert.equal(ru.opened.length, 1);
  const en = loadPanel(f.repo, 'en'); assert.match(en.view.webview.html, /Current branch/); assert.match(en.view.webview.html, /Receive changes/);
});

test('Delete defaults preserve unmerged commits and remote refs; force and remote removal require explicit scope', async t => {
  const f = fixture(t);
  git(f.repo, 'switch', '-c', 'unmerged');
  fs.writeFileSync(path.join(f.repo, 'feature.txt'), 'keep commit');
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'feature'); git(f.repo, 'push', '-u', 'origin', 'unmerged');
  git(f.repo, 'switch', 'main');
  const h = loadPanel(f.repo);
  await assert.rejects(h.provider._handleDeleteBranches(['unmerged']), /unmerged commits/);
  assert.ok(git(f.repo, 'rev-parse', 'refs/heads/unmerged'));
  assert.ok(git(f.remote, 'rev-parse', 'refs/heads/unmerged'));
  git(f.repo, 'branch', 'merged'); git(f.repo, 'push', 'origin', 'merged');
  await h.provider._handleDeleteBranches(['merged']);
  assert.throws(() => git(f.repo, 'rev-parse', '--verify', 'refs/heads/merged'));
  assert.ok(git(f.remote, 'rev-parse', 'refs/heads/merged'));
  git(f.repo, 'branch', 'remote-only-delete'); git(f.repo, 'push', 'origin', 'remote-only-delete');
  h.vscode.window.showWarningMessage = async () => 'Удалить только origin';
  await h.provider._handleDeleteBranches(['remote-only-delete']);
  assert.ok(git(f.repo, 'rev-parse', 'refs/heads/remote-only-delete'));
  assert.throws(() => git(f.remote, 'rev-parse', '--verify', 'refs/heads/remote-only-delete'));
  h.vscode.window.showWarningMessage = async () => 'Force local + origin';
  await h.provider._handleDeleteBranches(['unmerged']);
  assert.throws(() => git(f.repo, 'rev-parse', '--verify', 'refs/heads/unmerged'));
  assert.throws(() => git(f.remote, 'rev-parse', '--verify', 'refs/heads/unmerged'));
});

test('porcelain parser keeps whitespace and flags secret filenames while GitHub remote parsing is strict', () => {
  const h = loadPanel('/tmp/unused');
  assert.deepEqual(JSON.parse(JSON.stringify(h.panel.parsePorcelainZ(' M file name.ts\0?? .env\0'))), [
    { file: 'file name.ts', status: ' M', secret: false }, { file: '.env', status: '??', secret: true },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(h.panel.parseGitHubRemote('git@github.com:owner/repo.git'))), { owner: 'owner', repository: 'repo' });
  assert.deepEqual(JSON.parse(JSON.stringify(h.panel.parseGitHubRemote('ssh://git@github.com/owner/repo.git'))), { owner: 'owner', repository: 'repo' });
  assert.equal(h.panel.parseGitHubRemote('https://example.com/owner/repo.git'), null);
});

test('same-branch Pull downloads fresh origin commits and repeats safely', async t => {
  const f = fixture(t), other = path.join(f.base, 'other');
  git(f.base, 'clone', f.remote, other);
  git(other, 'config', 'user.name', 'Remote'); git(other, 'config', 'user.email', 'remote@example.invalid');
  fs.writeFileSync(path.join(other, 'App2.tsx'), 'remote app\n');
  git(other, 'add', '.'); git(other, 'commit', '-m', 'remote update'); git(other, 'push');
  const h = loadPanel(f.repo);
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), git(other, 'rev-parse', 'HEAD'));
  assert.equal(fs.readFileSync(path.join(f.repo, 'App2.tsx'), 'utf8'), 'remote app\n');
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.equal(h.messages.filter(m => m.type === 'error').length, 0);
  assert.match(h.view.webview.html, /filter\(branch => branch.isRemote\), current, false/);
});

test('accept all incoming replaces the entire tracked tree and retains a backup', async t => {
  const f = fixture(t);
  git(f.repo, 'switch', '-c', 'incoming');
  fs.writeFileSync(path.join(f.repo, 'base.txt'), 'incoming\n');
  fs.writeFileSync(path.join(f.repo, 'App2.tsx'), 'complete remote app\n');
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'incoming'); git(f.repo, 'push', '-u', 'origin', 'incoming');
  const incoming = git(f.repo, 'rev-parse', 'HEAD');
  git(f.repo, 'switch', 'main');
  fs.writeFileSync(path.join(f.repo, 'base.txt'), 'current\n');
  fs.writeFileSync(path.join(f.repo, 'local-only.txt'), 'must survive in backup\n');
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'local');
  const previous = git(f.repo, 'rev-parse', 'HEAD');
  const h = loadPanel(f.repo);
  await h.send({ command: 'pullBranch', sourceBranch: 'incoming' });
  await h.send({ command: 'resolveConflicts', acceptAll: true });
  assert.equal(git(f.repo, 'rev-parse', 'HEAD^{tree}'), git(f.repo, 'rev-parse', incoming + '^{tree}'));
  assert.equal(fs.existsSync(path.join(f.repo, 'local-only.txt')), false);
  const backup = git(f.repo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/workstation-backup/');
  assert.equal(git(f.repo, 'rev-parse', backup), previous);
  assert.equal(git(f.repo, 'show', backup + ':local-only.txt'), 'must survive in backup');
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('dirty working files prevent Pull without changing them', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.repo, 'base.txt'), 'unsaved local work\n');
  const h = loadPanel(f.repo);
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.ok(h.messages.some(m => m.type === 'error'));
  assert.equal(fs.readFileSync(path.join(f.repo, 'base.txt'), 'utf8'), 'unsaved local work\n');
});


test('formatting uses language-specific indentation, applies edits and verifies save', async t => {
  const f = fixture(t), h = loadPanel(f.repo);
  const file = path.join(f.repo, 'format.ts'); fs.writeFileSync(file, 'const x=1');
  const doc = { uri: { fsPath: file }, languageId: 'typescript', async save() { return true; } };
  h.vscode.workspace.openTextDocument = async () => doc;
  h.vscode.workspace.getConfiguration = (section, scope) => {
    assert.equal(section, 'editor'); assert.equal(scope, doc);
    return { get(key, fallback) { return key === 'tabSize' ? 3 : fallback; } };
  };
  let applied = false;
  h.vscode.WorkspaceEdit = class { set(uri, edits) { assert.equal(uri.fsPath, file); assert.equal(edits.length, 1); } };
  h.vscode.commands.executeCommand = async (command, uri, options) => {
    assert.equal(command, 'vscode.executeFormatDocumentProvider');
    assert.equal(options.tabSize, 3); assert.equal(options.insertSpaces, true);
    return [{ newText: 'const x = 1' }];
  };
  h.vscode.workspace.applyEdit = async () => { applied = true; return true; };
  await h.panel.formatFiles(f.repo, ['format.ts']); assert.equal(applied, true);
  doc.save = async () => false;
  await assert.rejects(h.panel.formatFiles(f.repo, ['format.ts']), /сохранить/);
  h.vscode.commands.executeCommand = async () => undefined;
  await assert.rejects(h.panel.formatFiles(f.repo, ['format.ts']), /Formatter/);
});

test('offline Pull reports an error and preserves local commits and files', async t => {
  const f = fixture(t), h = loadPanel(f.repo), before = git(f.repo, 'rev-parse', 'HEAD');
  git(f.repo, 'remote', 'set-url', 'origin', path.join(f.base, 'missing-server.git'));
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.ok(h.messages.some(m => m.type === 'error'));
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before);
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('rejected server push retains the commit and can be retried', async t => {
  const f = fixture(t), h = loadPanel(f.repo);
  git(f.remote, 'config', 'receive.denyNonFastForwards', 'true');
  const other = path.join(f.base, 'other'); git(f.base, 'clone', f.remote, other);
  git(other, 'config', 'user.name', 'Other'); git(other, 'config', 'user.email', 'other@example.invalid');
  fs.writeFileSync(path.join(other, 'remote.txt'), 'server\n'); git(other, 'add', '.'); git(other, 'commit', '-m', 'server'); git(other, 'push');
  fs.writeFileSync(path.join(f.repo, 'local.txt'), 'keep local\n');
  await h.send({ command: 'push', selectedFiles: ['local.txt'], commitMessage: 'local' });
  assert.ok(h.messages.some(m => m.type === 'error'));
  assert.equal(git(f.repo, 'show', 'HEAD:local.txt'), 'keep local');
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  await h.send({ command: 'push', selectedFiles: [], commitMessage: '' });
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), git(f.remote, 'rev-parse', 'main'));
  assert.equal(fs.readFileSync(path.join(f.repo, 'remote.txt'), 'utf8'), 'server\n');
});

test('conflicted merge can be aborted and restores the original tree', async t => {
  const f = fixture(t), h = loadPanel(f.repo);
  git(f.repo, 'switch', '-c', 'incoming'); fs.writeFileSync(path.join(f.repo, 'base.txt'), 'incoming\n');
  git(f.repo, 'commit', '-am', 'incoming'); git(f.repo, 'push', '-u', 'origin', 'incoming');
  git(f.repo, 'switch', 'main'); fs.writeFileSync(path.join(f.repo, 'base.txt'), 'local\n'); git(f.repo, 'commit', '-am', 'local');
  const before = git(f.repo, 'rev-parse', 'HEAD');
  await h.send({ command: 'pullBranch', sourceBranch: 'incoming' });
  await h.send({ command: 'abortMerge' });
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before);
  assert.equal(fs.readFileSync(path.join(f.repo, 'base.txt'), 'utf8'), 'local\n');
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('cancelled full incoming replacement retains the merge and creates no backup', async t => {
  const f = fixture(t), h = loadPanel(f.repo);
  git(f.repo, 'switch', '-c', 'incoming'); fs.writeFileSync(path.join(f.repo, 'base.txt'), 'incoming\n');
  git(f.repo, 'commit', '-am', 'incoming'); git(f.repo, 'push', '-u', 'origin', 'incoming');
  git(f.repo, 'switch', 'main'); fs.writeFileSync(path.join(f.repo, 'base.txt'), 'local\n'); git(f.repo, 'commit', '-am', 'local');
  await h.send({ command: 'pullBranch', sourceBranch: 'incoming' });
  const before = fs.readFileSync(path.join(f.repo, 'base.txt'), 'utf8');
  h.vscode.window.showWarningMessage = async () => undefined;
  await h.send({ command: 'resolveConflicts', acceptAll: true });
  assert.equal(fs.readFileSync(path.join(f.repo, 'base.txt'), 'utf8'), before);
  assert.equal(git(f.repo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/workstation-backup/'), '');
  assert.equal(fs.existsSync(path.join(f.repo, '.git/MERGE_HEAD')), true);
});

test('live webview refresh preserves deselected files, source branch and conflict choices', () => {
  const h = loadPanel('/tmp/unused'), html = h.view.webview.html;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.style = {}; this.value = ''; }
    set innerHTML(value) { this.children = []; this._html = value; }
    get innerHTML() { return this._html || ''; }
    appendChild(child) {
      this.children.push(child);
      if (this.tag === 'select' && (this.children.length === 1 || child.selected)) this.value = child.value;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    get options() { return this.children; }
    querySelectorAll(selector) {
      const all = this.children.flatMap(child => [child, ...child.querySelectorAll(selector)]);
      return all.filter(child => selector === 'select' ? child.tag === 'select' : child.tag === 'input');
    }
  }
  const elements = new Map();
  const document = { createElement: tag => new Element(tag), getElementById(id) {
    if (!elements.has(id)) elements.set(id, new Element(['source', 'branch'].some(key => id.toLowerCase().includes(key)) ? 'select' : 'div'));
    return elements.get(id);
  } };
  // Evaluate the actual shipped client functions with a small DOM; no copied implementation.
  const names = ['updateChangedFiles', 'fillBranchSelect', 'renderConflicts'];
  const context = { document, busy: false, currentBranch: 'main', UI: { ours: 'ours', theirs: 'theirs', active: 'active' },
    blockStates: {}, conflictFiles: [], updateTargetSummary() {}, renderBlockStates() {} };
  vm.createContext(context);
  for (const name of names) {
    const start = html.indexOf('function ' + name + '(');
    const end = html.indexOf('\nfunction ', start + 1);
    vm.runInContext(html.slice(start, end), context);
  }
  context.updateChangedFiles([{ file: 'chosen.ts', secret: false }, { file: 'later.ts', secret: false }]);
  document.getElementById('changedFiles').querySelectorAll('input')[1].checked = false;
  context.updateChangedFiles([{ file: 'chosen.ts', secret: false }, { file: 'later.ts', secret: false }]);
  assert.equal(document.getElementById('changedFiles').querySelectorAll('input')[1].checked, false);
  const branches = [{ name: 'main' }, { name: 'day-2' }];
  context.fillBranchSelect('pullSource', branches, 'main', false);
  document.getElementById('pullSource').value = 'day-2';
  context.fillBranchSelect('pullSource', branches, 'main', false);
  assert.equal(document.getElementById('pullSource').value, 'day-2');
  context.renderConflicts(['file.ts']);
  document.getElementById('conflictList').querySelectorAll('select')[0].value = 'theirs';
  context.renderConflicts(['file.ts']);
  assert.equal(document.getElementById('conflictList').querySelectorAll('select')[0].value, 'theirs');
});


test('actual HTTP Git server supports push and Pull and safely reports server outage', async t => {
  const f = fixture(t);
  git(f.remote, 'config', 'http.receivepack', 'true');
  let unavailable = false;
  const server = http.createServer(async (request, response) => {
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
      const headers = {}, lines = bytes.subarray(0, split).toString().split('\r\n'); let status = 200;
      for (const line of lines) { const colon = line.indexOf(':'); if (colon < 0) continue;
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
  await h.send({ command: 'push', selectedFiles: ['network.txt'], commitMessage: 'HTTP push' });
  assert.equal(git(f.remote, 'show', 'main:network.txt'), 'HTTP push payload');
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.equal(h.messages.filter(m => m.type === 'error').length, 0);
  unavailable = true;
  const before = git(f.repo, 'rev-parse', 'HEAD');
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.ok(h.messages.some(m => m.type === 'error'));
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before);
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('same-branch Pull works with CRLF checkout and preserves a clean tree', async t => {
  const f = fixture(t), other = path.join(f.base, 'Другой пользователь with spaces');
  git(f.repo, 'config', 'core.autocrlf', 'true');
  git(f.base, 'clone', f.remote, other);
  git(other, 'config', 'user.name', 'Other user'); git(other, 'config', 'user.email', 'other@example.invalid');
  git(other, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(other, 'App2.tsx'), 'export function App2() {\n   return null\n}\n');
  git(other, 'add', '.'); git(other, 'commit', '-m', 'CRLF checkout fixture'); git(other, 'push');
  const h = loadPanel(f.repo);
  await h.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.equal(h.messages.filter(message => message.type === 'error').length, 0);
  const bytes = fs.readFileSync(path.join(f.repo, 'App2.tsx'), 'utf8');
  assert.match(bytes, /\r\n/);
  assert.equal(bytes.replace(/\r\n/g, '\n'), 'export function App2() {\n   return null\n}\n');
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});
