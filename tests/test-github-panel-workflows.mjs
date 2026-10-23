import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const sourceFile = path.join(root, 'extensions/git-branch-panel/extension.js');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'github-panel-workflow-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const remote = path.join(base, 'remote.git'), repo = path.join(base, 'repo');
  fs.mkdirSync(remote); fs.mkdirSync(repo);
  git(remote, 'init', '--bare', '-b', 'main');
  git(repo, 'init', '-b', 'main');
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
  const f = fixture(t); git(f.repo, 'remote', 'set-url', 'origin', 'https://github.com/example/project.git');
  const ru = loadPanel(f.repo, 'ru');
  assert.match(ru.view.webview.html, /Текущая ветка/); assert.match(ru.view.webview.html, /Получить изменения/);
  await ru.send({ command: 'openPullRequest', baseBranch: 'other' });
  assert.equal(ru.opened[0], 'https://github.com/example/project/compare/other...main?expand=1');
  const en = loadPanel(f.repo, 'en'); assert.match(en.view.webview.html, /Current branch/); assert.match(en.view.webview.html, /Receive changes/);
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
