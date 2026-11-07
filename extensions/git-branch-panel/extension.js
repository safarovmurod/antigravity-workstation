'use strict';

let vscode;
try {
  vscode = require('vscode');
} catch {
  vscode = {
    window: {
      terminals: [],
      createOutputChannel: () => ({ appendLine: () => {} }),
      showWarningMessage: async (msg, opts, ...items) => (items && items.length > 0 ? items[0] : (typeof opts === 'string' ? opts : 'Удалить')),
      registerWebviewViewProvider: () => ({ dispose: () => {} }),
    },
    commands: { registerCommand: () => ({ dispose: () => {} }) },
    workspace: { workspaceFolders: [] },
    env: { language: 'en' },
  };
}
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

function findGitExecutable() {
  const configured = vscode.workspace.getConfiguration?.('git')?.get('path');
  const candidates = [
    ...(Array.isArray(configured) ? configured : [configured]),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'git.exe'),
  ];
  for (const cand of candidates) {
    if (typeof cand === 'string' && fs.existsSync(cand)) return cand;
  }
  return 'git';
}

let GIT = findGitExecutable();
let nativeGitApi;

async function getNativeRepository(cwd) {
  const extension = vscode.extensions?.getExtension('vscode.git');
  if (!extension || !vscode.Uri?.file) return null;
  if (!extension.isActive) await extension.activate();
  nativeGitApi = extension.exports?.getAPI(1);
  if (!nativeGitApi) return null;
  if (typeof nativeGitApi.git?.path === 'string') GIT = nativeGitApi.git.path;
  const uri = vscode.Uri.file(cwd);
  return nativeGitApi.getRepository(uri) || await nativeGitApi.openRepository?.(uri) || null;
}
const PANEL_ID = 'workstationGithubPanel';
const OUTPUT_CHANNEL_NAME = 'Workstation GitHub Panel';
const SECRET_PATTERNS = [
  /^\.env$/i, /^\.env\..+$/i,
  /\.pem$/i, /\.key$/i,
  /^id_rsa$/i, /^id_ed25519$/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
];
const SECRET_WHITELIST = [/^\.env\.example$/i];

function isRussian() {
  return String(vscode.env?.language || '').toLowerCase().startsWith('ru');
}

function tr(russian, english) {
  return isRussian() ? russian : english;
}

function friendlyError(error) {
  const message = String(error?.message || error || '');
  if (!isRussian()) return message;
  const rules = [
    [/authentication failed|permission denied|could not read username/i, 'GitHub не принял авторизацию. Выполни вход через Git в терминале и повтори.'],
    [/non-fast-forward|fetch first|rejected/i, 'GitHub содержит более новые изменения. Сначала получи и объедини нужную ветку.'],
    [/local changes|would be overwritten|overwritten by checkout/i, 'Локальные изменения мешают операции. Сохрани их или отправь в отдельную ветку.'],
    [/conflict|automatic merge failed/i, 'Обнаружен конфликт файлов. Выбери текущую или входящую версию в блоке конфликтов.'],
    [/already exists/i, 'Ветка с таким именем уже существует. Выбери другое имя.'],
    [/could not resolve host|unable to access|timed? out|timeout/i, 'Нет соединения с GitHub или истекло время ожидания. Проверь интернет и повтори.'],
    [/nothing to commit/i, 'В выбранных файлах нет изменений для commit.'],
    [/not a git repository/i, 'Открытая папка не подключена к Git. Подключи её через терминал.'],
  ];
  return rules.find(([pattern]) => pattern.test(message))?.[1] || (/[А-Яа-яЁё]/.test(message) ? message : 'Операция Git не выполнена. Техническая причина записана в канале Workstation GitHub Panel.');
}

function parsePorcelainZ(output) {
  if (!output) return [];
  const entries = output.split('\0').filter(Boolean), files = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry.length <= 3) continue;
    const status = entry.slice(0, 2), file = entry.slice(3);
    const originalFile = /[RC]/.test(status) ? entries[++index] : null;
    const paths = originalFile ? [file, originalFile] : [file];
    files.push({ file, ...(originalFile ? { originalFile } : {}), status, secret: checkSecretFiles(paths).length > 0 });
  }
  return files;
}

function parseGitHubRemote(remote) {
  if (typeof remote !== 'string') return null;
  const match = remote.trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return match ? { owner: match[1], repository: match[2] } : null;
}

let panelProvider;
let outputChannel;
let disposables = [];

function log(msg) {
  if (!outputChannel) outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

let terminalRefreshTimer = null;

function refreshTerminals(delay = 100) {
  if (terminalRefreshTimer) clearTimeout(terminalRefreshTimer);
  terminalRefreshTimer = setTimeout(() => {
    terminalRefreshTimer = null;
    try {
      const target = (vscode && vscode.window && vscode.window.activeTerminal)
        ? vscode.window.activeTerminal
        : null;
      if (target && typeof target.sendText === 'function') {
        target.sendText('', true);
      }
    } catch (_) {}
  }, delay);
}

async function gitExec(args, cwd) {
  const repository = await getNativeRepository(cwd);
  if (repository && args[0] === 'fetch' && args[1] === 'origin') {
    await repository.fetch({ remote: 'origin', prune: args.includes('--prune') });
    return '';
  }
  if (repository && args[0] === 'push') {
    const origin = args.indexOf('origin');
    if (origin > 0) {
      const destination = args.includes('--delete') ? ':' + args.at(-1) : args.at(-1);
      await repository.push('origin', destination, args.includes('-u'));
      return '';
    }
  }
  return new Promise((resolve, reject) => {
    execFile(GIT, args, { cwd, encoding: 'utf8', timeout: 45000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        log(`git ${args.join(' ')} => ERROR: ${stderr || err.message}`);
        reject(new Error(stderr ? stderr.trim() : err.message));
      } else {
        resolve(stdout ? (args.includes('-z') ? stdout : stdout.trim()) : '');
      }
    });
  });
}

function getWorkspaceRoot() {
  const wf = vscode.workspace.workspaceFolders;
  if (!wf || wf.length === 0) return null;
  const active = vscode.window.activeTextEditor;
  if (active) {
    const folder = vscode.workspace.getWorkspaceFolder(active.document.uri);
    if (folder) return folder.uri.fsPath;
  }
  return wf[0].uri.fsPath;
}

async function isGitRepo(cwd) {
  try {
    await gitExec(['rev-parse', '--git-dir'], cwd);
    return true;
  } catch { return false; }
}

async function getCurrentBranch(cwd) {
  try {
    return await gitExec(['branch', '--show-current'], cwd);
  } catch { return null; }
}

async function getStatus(cwd) {
  return await gitExec(['status', '--porcelain'], cwd);
}

async function getRemote(cwd) {
  try {
    return await gitExec(['remote', 'get-url', 'origin'], cwd);
  } catch { return null; }
}

async function getLocalSHA(cwd) {
  return await gitExec(['rev-parse', 'HEAD'], cwd);
}

async function getRemoteSHA(cwd, branch) {
  try {
    const repository = await getNativeRepository(cwd);
    if (repository) {
      await repository.fetch({ remote: 'origin' });
      return await gitExec(['rev-parse', '--verify', `refs/remotes/origin/${branch}`], cwd);
    }
    const out = await gitExec(['ls-remote', 'origin', `refs/heads/${branch}`], cwd);
    if (!out) return null;
    return out.split('\t')[0].trim();
  } catch { return null; }
}

async function detectDefaultBranch(cwd) {
  try {
    const out = await gitExec(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd);
    if (out) return out.replace(/^origin\//, '');
  } catch {}
  try {
    await gitExec(['rev-parse', '--verify', 'refs/remotes/origin/main'], cwd);
    return 'main';
  } catch {}
  try {
    await gitExec(['rev-parse', '--verify', 'refs/remotes/origin/master'], cwd);
    return 'master';
  } catch {}
  try {
    await gitExec(['rev-parse', '--verify', 'refs/heads/main'], cwd);
    return 'main';
  } catch {}
  try {
    await gitExec(['rev-parse', '--verify', 'refs/heads/master'], cwd);
    return 'master';
  } catch {}
  try {
    const lo = await gitExec(['branch', '--format=%(refname:short)'], cwd);
    const first = lo.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
    if (first) return first;
  } catch {}
  return 'main';
}

async function findSafeSwitchTarget(cwd, branchesToDelete = []) {
  const toDeleteSet = new Set(branchesToDelete);
  let localBranches = [];
  try {
    const lo = await gitExec(['branch', '--format=%(refname:short)'], cwd);
    localBranches = lo.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch {}

  if (localBranches.includes('main') && !toDeleteSet.has('main')) {
    return 'main';
  }
  if (localBranches.includes('master') && !toDeleteSet.has('master')) {
    return 'master';
  }
  for (const b of localBranches) {
    if (!toDeleteSet.has(b)) {
      return b;
    }
  }
  return null;
}

function checkSecretFiles(files) {
  const bad = [];
  for (const f of files) {
    const base = path.basename(f);
    const whitelisted = SECRET_WHITELIST.some(r => r.test(base));
    if (!whitelisted && SECRET_PATTERNS.some(r => r.test(base))) {
      bad.push(f);
    }
  }
  return bad;
}

async function getModifiedAndUntrackedFiles(cwd) {
  const out = await gitExec(['status', '--porcelain', '-z'], cwd);
  return parsePorcelainZ(out).flatMap(item => item.originalFile ? [item.file, item.originalFile] : [item.file]);
}

async function getChangedFiles(cwd) {
  return parsePorcelainZ(await gitExec(['status', '--porcelain', '-z'], cwd));
}

async function getConflictFiles(cwd) {
  const out = await gitExec(['diff', '--name-only', '--diff-filter=U', '-z'], cwd);
  return out ? out.split('\0').filter(Boolean) : [];
}

function selectedChangedFiles(changed, requested) {
  const available = new Set(changed.map(item => item.file));
  if (!Array.isArray(requested) || requested.length === 0) throw new Error(tr('Выбери хотя бы один изменённый файл.', 'Select at least one changed file.'));
  const selected = [...new Set(requested)];
  if (selected.some(file => typeof file !== 'string' || !available.has(file))) {
    throw new Error(tr('Список файлов изменился. Обнови панель и выбери файлы снова.', 'The file list changed. Refresh the panel and select the files again.'));
  }
  return selected;
}

function expandSelectedPaths(changed, selected) {
  return changed.filter(item => selected.includes(item.file)).flatMap(item => item.originalFile ? [item.file, item.originalFile] : [item.file]);
}

async function getDetailedBranches(cwd, defaultBranch, currentBranch) {
  const localBranches = new Set();
  const remoteBranches = new Set();
  try {
    const lo = await gitExec(['branch', '--format=%(refname:short)'], cwd);
    lo.split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && s !== 'origin' && s !== 'HEAD')
      .forEach(b => localBranches.add(b));
  } catch {}
  try {
    const ro = await gitExec(['branch', '-r', '--format=%(refname:short)'], cwd);
    ro.split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && s.startsWith('origin/') && s !== 'origin/HEAD')
      .map(s => s.replace(/^origin\//, ''))
      .filter(b => b && b !== 'origin' && b !== 'HEAD')
      .forEach(b => remoteBranches.add(b));
  } catch {}

  const allNames = [...new Set([...localBranches, ...remoteBranches])]
    .filter(name => name && name !== 'origin' && name !== 'HEAD')
    .sort((a, b) => {
      if (a === 'main' || a === 'master') return -1;
      if (b === 'main' || b === 'master') return 1;
      return a.localeCompare(b);
    });

  const systemProtected = new Set(['main', 'master', defaultBranch].filter(Boolean));
  const protectedNames = new Set(['main', 'master', defaultBranch, currentBranch].filter(Boolean));

  return allNames.map(name => {
    const isLocal = localBranches.has(name);
    const isRemote = remoteBranches.has(name);
    let location = 'local';
    if (isLocal && isRemote) location = 'local + origin';
    else if (isRemote) location = 'origin';

    return {
      name,
      isLocal,
      isRemote,
      location,
      isCurrent: name === currentBranch,
      isProtected: protectedNames.has(name),
      isSystemProtected: systemProtected.has(name),
    };
  });
}

// Fetching is useful but never required: offline work and repositories
// without origin still create, switch and delete branches.
async function bestEffortFetch(cwd, remote) {
  if (!remote) return false;
  try { await gitExec(['fetch', 'origin', '--prune'], cwd); return true; } catch { return false; }
}

// Changes that would block a branch switch are kept in a named stash and come
// back automatically when the user returns to that branch.
const autostashName = branch => 'workstation-autostash:' + branch;
const blocksSwitch = message => /overwritten by checkout|local changes|untracked working tree files would be|Please commit your changes or stash them/i.test(message || '');
async function stashFor(cwd, branch) {
  await gitExec(['stash', 'push', '--include-untracked', '-m', autostashName(branch)], cwd);
}
async function restoreStashFor(cwd, branch) {
  const list = await gitExec(['stash', 'list', '--format=%gd%x09%gs'], cwd).catch(() => '');
  const entry = list.split(/\r?\n/).map(line => line.split('\t')).find(([, subject]) => subject && subject.endsWith(': ' + autostashName(branch)));
  if (!entry) return 'none';
  try { await gitExec(['stash', 'pop', entry[0]], cwd); return 'restored'; } catch { return 'conflict'; }
}

// The author every commit from this panel carries. A value written into this
// repository's own config (for example by a copied project) wins over the
// global one, so it is shown and can be removed before committing.
async function readAuthor(cwd) {
  // One Git call lists every scope in precedence order; the last value wins.
  let lines = [];
  try { lines = (await gitExec(['config', '--show-scope', '--get-regexp', '^user\\.(name|email)$'], cwd)).split(/\r?\n/); } catch {}
  const entries = lines.map(line => /^(\S+)\s+user\.(name|email)\s?(.*)$/.exec(line.trim())).filter(Boolean).map(([, scope, key, value]) => ({ scope, key, value }));
  const pick = (key, scope) => entries.filter(entry => entry.key === key && (!scope || entry.scope === scope)).map(entry => entry.value).pop() || '';
  const author = { name: pick('name'), email: pick('email'), globalName: pick('name', 'global'), globalEmail: pick('email', 'global'),
    localName: pick('name', 'local'), localEmail: pick('email', 'local') };
  author.foreign = Boolean((author.localName && author.globalName && author.localName !== author.globalName)
    || (author.localEmail && author.globalEmail && author.localEmail !== author.globalEmail));
  return author;
}

function hasDirtyEditors(cwd) {
  return vscode.workspace.textDocuments?.some(document => {
    if (!document.isDirty || !document.uri?.fsPath) return false;
    const relative = path.relative(cwd, document.uri.fsPath);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
  }) === true;
}

async function countUnmergedCommits(cwd, branch, baseBranch) {
  let head, base;
  try { head = await gitExec(['rev-parse', '--verify', `refs/heads/${branch}`], cwd); }
  catch { head = await gitExec(['rev-parse', '--verify', `refs/remotes/origin/${branch}`], cwd); }
  try { base = await gitExec(['rev-parse', '--verify', `refs/remotes/origin/${baseBranch || 'main'}`], cwd); }
  catch { base = await gitExec(['rev-parse', '--verify', `refs/heads/${baseBranch || 'main'}`], cwd); }
  const count = Number((await gitExec(['rev-list', '--count', `${base.trim()}..${head.trim()}`], cwd)).trim());
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Cannot verify unmerged commit count');
  return count;
}

async function collectState(cwd = getWorkspaceRoot()) {
  const state = {
    cwd,
    isRepo: false,
    branch: null,
    remote: null,
    status: null,
    isClean: true,
    isProtected: false,
    defaultBranch: 'main',
    mergeInProgress: false,
    rebaseInProgress: false,
    conflicts: [],
    changedFiles: [],
    error: null,
  };

  if (!cwd) {
    state.error = tr('Открой папку проекта.', 'Open a project folder.');
    return state;
  }

  state.isRepo = await isGitRepo(cwd);
  if (!state.isRepo) {
    state.error = tr('Папка ещё не является Git repository. Подключи её через терминал — панель обновится автоматически.', 'This folder is not a Git repository yet. Connect it in the terminal—the panel will refresh automatically.');
    return state;
  }

  state.branch = await getCurrentBranch(cwd);
  if (!state.branch) {
    state.error = tr('Активная ветка не найдена (detached HEAD).', 'No active branch was found (detached HEAD).');
    return state;
  }

  state.remote = await getRemote(cwd);
  state.defaultBranch = await detectDefaultBranch(cwd);
  state.isProtected = ['main', 'master', state.defaultBranch].includes(state.branch);

  const porcelain = await getStatus(cwd);
  state.status = porcelain;
  state.isClean = !porcelain;
  state.changedFiles = parsePorcelainZ(await gitExec(['status', '--porcelain', '-z'], cwd));

  try {
    const rawGitDir = await gitExec(['rev-parse', '--git-dir'], cwd);
    const gitDir = path.isAbsolute(rawGitDir) ? rawGitDir : path.join(cwd, rawGitDir);
    state.mergeInProgress = fs.existsSync(path.join(gitDir, 'MERGE_HEAD'));
    state.rebaseInProgress =
      fs.existsSync(path.join(gitDir, 'rebase-merge')) ||
      fs.existsSync(path.join(gitDir, 'rebase-apply'));
  } catch {}

  if (state.mergeInProgress) state.conflicts = await getConflictFiles(cwd).catch(() => []);
  state.author = await readAuthor(cwd);

  return state;
}

async function formatFiles(cwd, files) {
  if (!vscode.commands?.executeCommand || !vscode.workspace?.openTextDocument || !vscode.workspace?.applyEdit || !vscode.WorkspaceEdit || !vscode.Uri) {
    throw new Error(tr('Форматирование недоступно в этой версии редактора.', 'Formatting is unavailable in this editor version.'));
  }
  for (const relative of files) {
    const file = path.join(cwd, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const uri = vscode.Uri.file(file), document = await vscode.workspace.openTextDocument(uri);
    const editor = vscode.workspace.getConfiguration?.('editor', document);
    const options = { insertSpaces: editor?.get('insertSpaces', true) !== false, tabSize: Number(editor?.get('tabSize', 3)) || 3 };
    const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', uri, options);
    if (!Array.isArray(edits)) throw new Error(tr('Formatter не вернул результат. Проверь Prettier и синтаксис файла: ', 'The formatter returned no result. Check Prettier and file syntax: ') + relative);
    if (edits.length === 0) continue;
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(uri, edits);
    if (!await vscode.workspace.applyEdit(workspaceEdit)) throw new Error(tr('Редактор не применил форматирование: ', 'The editor could not apply formatting: ') + relative);
    if (!await document.save()) throw new Error(tr('Не удалось сохранить отформатированный файл: ', 'Could not save the formatted file: ') + relative);
  }
}

async function createBranchKeepingChanges(cwd, name, baseBranch, state) {
  try { await gitExec(['check-ref-format', '--branch', name], cwd); }
  catch { throw new Error(tr(`Недопустимое имя ветки: "${name}"`, `Invalid branch name: "${name}"`)); }
  await bestEffortFetch(cwd, state.remote);
  const branches = await getDetailedBranches(cwd, state.defaultBranch, state.branch);
  if (branches.some(branch => branch.name === name)) throw new Error(tr(`Ветка "${name}" уже существует.`, `Branch "${name}" already exists.`));
  const base = branches.find(branch => branch.name === baseBranch);
  if (!base) throw new Error(tr(`Исходная ветка "${baseBranch}" не найдена.`, `Base branch "${baseBranch}" was not found.`));
  const baseRef = base.isRemote ? `origin/${baseBranch}` : baseBranch;
  if (baseBranch === state.branch) {
    await gitExec(['switch', '-c', name], cwd);
    return;
  }
  await gitExec(['stash', 'push', '--include-untracked', '-m', `workstation-create-${name}`], cwd);
  try {
    await gitExec(['switch', '--no-track', '-c', name, baseRef], cwd);
  } catch (error) {
    await gitExec(['stash', 'apply', '--index'], cwd).catch(() => {});
    throw error;
  }
  try {
    await gitExec(['stash', 'apply', '--index'], cwd);
    await gitExec(['stash', 'drop'], cwd);
  } catch (error) {
    throw new Error(tr(
      `Ветка "${name}" создана из "${baseBranch}", но изменения конфликтуют с её файлами. Данные сохранены также в git stash; разреши конфликт перед push.`,
      `Branch "${name}" was created from "${baseBranch}", but the changes conflict with its files. The data also remains in git stash; resolve the conflict before pushing.`
    ));
  }
}

class GithubPanelProvider {
  constructor() {
    this._view = null;
    this._busy = false;
    this._viewDisposables = [];
    this._refreshTimer = null;
    this._collecting = false;
  }

  resolveWebviewView(webviewView) {
    for (const d of this._viewDisposables) {
      try { d.dispose(); } catch (_) {}
    }
    this._viewDisposables = [];

    this._view = webviewView;
    log('GITHUB EXPLORER VIEW RESOLVED');
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtml();

    const msgDisp = webviewView.webview.onDidReceiveMessage(async msg => {
      if (!msg || typeof msg.command !== 'string' || this._busy) return;
      const mutation = ['push', 'newBranch', 'switchBranch', 'deleteBranches', 'pullBranch', 'resolveConflicts', 'abortMerge', 'openPullRequest'].includes(msg.command);
      if (mutation) this._busy = true;

      try {
        switch (msg.command) {
          case 'init':
          case 'refresh':
            await this._sendState();
            break;
          case 'syncTerminal':
            refreshTerminals();
            await this._sendState();
            this._postMessage({ type: 'status', text: 'Терминал синхронизирован.' });
            break;
          case 'push':
            await this._handlePush(msg);
            break;
          case 'newBranch':
            await this._handleNewBranch(msg.name, msg.baseBranch);
            break;
          case 'switchBranch':
            await this._handleSwitchBranch(msg.name);
            break;
          case 'deleteBranches':
            await this._handleDeleteBranches(msg.branches);
            break;
          case 'pullBranch':
            await this._handlePullBranch(msg.sourceBranch);
            break;
          case 'resolveConflicts':
            await this._handleResolveConflicts(msg.resolutions, msg.acceptAll === true);
            break;
          case 'abortMerge':
            await this._handleAbortMerge();
            break;
          case 'openPullRequest':
            await this._handleOpenPullRequest(msg.baseBranch);
            break;
        }
      } catch (e) {
        log(`Handler error: ${e.message}`);
        this._postMessage({ type: 'error', text: friendlyError(e) });
      } finally {
        if (mutation) {
          this._busy = false;
          await this._sendState();
        }
      }
    });
    if (msgDisp && typeof msgDisp.dispose === 'function') {
      this._viewDisposables.push(msgDisp);
    }

    if (typeof webviewView.onDidChangeVisibility === 'function') {
      const visDisp = webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) this.refresh();
      });
      if (visDisp && typeof visDisp.dispose === 'function') {
        this._viewDisposables.push(visDisp);
      }
    }

    if (typeof webviewView.onDidDispose === 'function') {
      const dispDisp = webviewView.onDidDispose(() => {
        for (const d of this._viewDisposables) {
          try { d.dispose(); } catch (_) {}
        }
        this._viewDisposables = [];
        this._view = null;
      });
      if (dispDisp && typeof dispDisp.dispose === 'function') {
        this._viewDisposables.push(dispDisp);
      }
    }

    this._sendState();
  }

  async refresh() {
    if (!this._view) return;
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      if (!this._busy && !this._collecting) {
        this._sendState();
      }
    }, 150);
  }

  async _sendState() {
    if (this._collecting) return;
    this._collecting = true;
    try {
      const s = await collectState();
      s.busy = this._busy;
      const branches = s.isRepo && s.branch
        ? await getDetailedBranches(s.cwd, s.defaultBranch, s.branch).catch(() => [])
        : [];
      this._postMessage({ type: 'state', state: s, branches });
    } catch (e) {
      this._postMessage({ type: 'error', text: e.message });
    } finally {
      this._collecting = false;
    }
  }

  _postMessage(msg) {
    if (this._view && this._view.webview) {
      this._view.webview.postMessage(msg);
    }
  }

  async _handlePush(request) {
    const cwd = getWorkspaceRoot();
    if (!cwd) throw new Error(tr('Открой папку проекта.', 'Open a project folder.'));

    const legacyRequest = !request || typeof request !== 'object';
    request = legacyRequest ? { commitMessage: request } : request;

    let state = await collectState(cwd);
    if (state.error) throw new Error(state.error);
    if (state.mergeInProgress || state.rebaseInProgress) throw new Error(tr('Сначала заверши merge/rebase.', 'Finish the merge/rebase first.'));
    let branch = state.branch;

    if (!state.remote) throw new Error(tr('Репозиторий не подключён к origin. Подключи его в терминале; панель обновится автоматически.', 'The repository is not connected to origin. Connect it in the terminal; the panel will refresh automatically.'));

    const changed = await getChangedFiles(cwd);
    let selected = changed.length ? selectedChangedFiles(changed, legacyRequest ? changed.map(item => item.file) : request.selectedFiles) : [];
    let selectedPaths = expandSelectedPaths(changed, selected);
    const msg = typeof request.commitMessage === 'string' ? request.commitMessage.trim() : '';
    if (changed.length && !msg) throw new Error(tr('Введи сообщение коммита.', 'Enter a commit message.'));
    if (checkSecretFiles(selectedPaths).length) throw new Error(tr('Среди выбранных файлов обнаружен секретный файл. Добавь его в .gitignore.', 'Secret file detected among selected files. Add it to .gitignore.'));

    const createNew = request.createNewBranch === true;
    const newName = typeof request.newBranchName === 'string' ? request.newBranchName.trim() : '';
    const baseBranch = typeof request.baseBranch === 'string' && request.baseBranch.trim() ? request.baseBranch.trim() : branch;
    if (createNew && !newName) throw new Error(tr('Введи имя новой ветки.', 'Enter the new branch name.'));
    const target = createNew ? newName : branch;
    const confirmation = await vscode.window.showWarningMessage(
      tr(
        `${selected.length} файл(ов) → ${target} → origin/${target}. Продолжить?`,
        `${selected.length} file(s) → ${target} → origin/${target}. Continue?`
      ),
      { modal: true }, tr('Продолжить', 'Continue'), tr('Отмена', 'Cancel')
    );
    if (confirmation !== tr('Продолжить', 'Continue')) return;

    if (createNew) {
      await createBranchKeepingChanges(cwd, newName, baseBranch, state);
      state = await collectState(cwd);
      if (state.mergeInProgress || state.rebaseInProgress) throw new Error(tr('Новая ветка создана, но перенос изменений требует разрешить конфликт.', 'The new branch was created, but moving the changes requires conflict resolution.'));
      branch = state.branch;
      const afterSwitch = await getChangedFiles(cwd);
      selected = selectedChangedFiles(afterSwitch, selected);
      selectedPaths = expandSelectedPaths(afterSwitch, selected);
    }

    if (!createNew && state.isProtected) {
      const confirmPush = await vscode.window.showWarningMessage(
        `Ветка "${branch}" является базовой (main/master). Точно отправить изменения в origin/${branch}?`,
        { modal: true },
        'Отправить в ' + branch,
        'Отмена'
      );
      if (confirmPush !== 'Отправить в ' + branch) {
        this._postMessage({ type: 'status', text: 'Пуш в базовую ветку отменён пользователем.' });
        return;
      }
    }

    let upstream = null;
    try {
      upstream = await gitExec(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd);
    } catch {}

    if (upstream && upstream !== 'origin/' + branch) {
      throw new Error(`Upstream (${upstream}) does not match origin/${branch}. Resolve tracking before Git Push.`);
    }

    const porcelain = await getStatus(cwd);

    if (porcelain) {
      const latestChanged = await getChangedFiles(cwd);
      selected = selectedChangedFiles(latestChanged, selected);
      selectedPaths = expandSelectedPaths(latestChanged, selected);
      if (request.formatBeforeCommit === true) {
        this._postMessage({ type: 'status', text: tr('Форматирование выбранных файлов...', 'Formatting selected files...') });
        await formatFiles(cwd, selected);
      }

      await this._ensureOwnAuthor(cwd);

      this._postMessage({ type: 'status', text: tr('Подготовка выбранных файлов...', 'Preparing selected files...') });
      await gitExec(['add', '-A', '--', ...selectedPaths], cwd);

      const staged = await gitExec(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], cwd);
      const stagedSecrets = checkSecretFiles(staged.split('\0').filter(Boolean).filter(file => selectedPaths.includes(file)));
      if (stagedSecrets.length > 0) {
        throw new Error(tr('Секретный файл обнаружен после подготовки: ', 'A secret file was detected after staging: ') + stagedSecrets.join(', '));
      }

      this._postMessage({ type: 'status', text: tr('Создание коммита...', 'Creating commit...') });
      await gitExec(['commit', '--only', '-m', msg, '--', ...selectedPaths], cwd);
    } else {
      let unpushedCount = 0;
      try {
        const unpushed = await gitExec(['rev-list', '--count', `origin/${branch}..HEAD`], cwd);
        unpushedCount = parseInt(unpushed, 10) || 0;
      } catch {}

      if (unpushedCount === 0 && upstream) {
        this._postMessage({ type: 'pushOk', branch, message: 'Branch уже синхронизирован', cleanSynced: true });
        return;
      }
    }

    this._postMessage({ type: 'status', text: `Pushing to origin/${branch}...` });
    let pushError = null;
    try {
      await gitExec(['push', '-u', 'origin', `${branch}:${branch}`], cwd);
    } catch (err) {
      pushError = err;
    }

    if (pushError) {
      if (porcelain) {
        throw new Error(`Commit сохранён локально, push не выполнен: ${pushError.message}`);
      } else {
        throw new Error(`Push не выполнен: ${pushError.message}`);
      }
    }

    this._postMessage({ type: 'status', text: 'Verifying remote SHA...' });
    const localSHA = await getLocalSHA(cwd);
    const remoteSHA = await getRemoteSHA(cwd, branch);

    if (localSHA && remoteSHA && localSHA === remoteSHA) {
      this._postMessage({
        type: 'pushOk',
        branch,
        sha: localSHA.slice(0, 7),
        clearInput: true,
        message: `Успешно отправлено: origin/${branch} (${localSHA.slice(0, 7)})`,
      });
    } else {
      throw new Error(`Push verification FAILED. Local: ${localSHA?.slice(0, 7)} Remote: ${remoteSHA?.slice(0, 7) || 'not found'}`);
    }

    await this._sendState();
  }

  // Commits carry the user's own global name and email. A different name
  // written into this repository is shown once and removed only on consent.
  async _ensureOwnAuthor(cwd) {
    const author = await readAuthor(cwd);
    if (author.foreign) {
      const own = `${author.globalName} <${author.globalEmail}>`, other = `${author.localName || author.name} <${author.localEmail || author.email}>`;
      const choice = await vscode.window.showWarningMessage(
        tr(`В этом проекте записан другой автор: ${other}. Делать commit от твоего имени ${own}?`, `This project records another author: ${other}. Commit as ${own}?`),
        { modal: true }, tr('Да, от моего имени', 'Yes, as me'), tr('Оставить как есть', 'Keep as is'));
      if (choice === tr('Да, от моего имени', 'Yes, as me')) {
        for (const key of ['user.name', 'user.email']) await gitExec(['config', '--local', '--unset-all', key], cwd).catch(() => {});
        return readAuthor(cwd);
      }
      if (choice !== tr('Оставить как есть', 'Keep as is')) throw new Error(tr('Commit отменён.', 'Commit cancelled.'));
      return author;
    }
    if (!author.name || !author.email) {
      throw new Error(tr('Git ещё не знает твоё имя. Выполни в терминале:\ngit config --global user.name "Имя Фамилия"\ngit config --global user.email "почта@github"',
        'Git does not know your name yet. Run in the terminal:\ngit config --global user.name "Your Name"\ngit config --global user.email "you@github"'));
    }
    return author;
  }

  // A new branch is created on this computer from the chosen branch (the
  // current one by default) and takes the current changes along. Nothing is
  // pushed: the branch reaches GitHub with the next "Commit и Push".
  async _handleNewBranch(name, requestedBase) {
    if (typeof name !== 'string' || !name.trim()) throw new Error(tr('Введи имя ветки.', 'Enter a branch name.'));
    name = name.trim();
    const cwd = getWorkspaceRoot();
    if (!cwd) throw new Error(tr('Открой папку проекта.', 'Open a project folder.'));
    try { await gitExec(['check-ref-format', '--branch', name], cwd); }
    catch { throw new Error(tr(`Недопустимое имя ветки: "${name}"`, `Invalid branch name: "${name}"`)); }

    const state = await collectState(cwd);
    if (state.error) throw new Error(state.error);
    if (state.mergeInProgress || state.rebaseInProgress) throw new Error(tr('Сначала заверши merge/rebase.', 'Finish the merge/rebase first.'));
    if (hasDirtyEditors(cwd)) throw new Error(tr('Есть несохранённые файлы. Сохрани их (Ctrl+S) и повтори.', 'Some files are unsaved. Save them (Ctrl+S) and try again.'));

    this._postMessage({ type: 'status', text: tr(`Создание ветки "${name}"...`, `Creating branch "${name}"...`) });
    await bestEffortFetch(cwd, state.remote);
    const branches = await getDetailedBranches(cwd, state.defaultBranch, state.branch);
    if (branches.some(branch => branch.name === name)) throw new Error(tr(`Ветка "${name}" уже есть.`, `Branch "${name}" already exists.`));
    const baseBranch = typeof requestedBase === 'string' && requestedBase.trim() ? requestedBase.trim() : state.branch;
    const selectedBase = branches.find(branch => branch.name === baseBranch);
    if (!selectedBase) throw new Error(tr(`Ветка "${baseBranch}" не найдена.`, `Branch "${baseBranch}" was not found.`));

    const carried = !state.isClean;
    if (carried) await createBranchKeepingChanges(cwd, name, baseBranch, state);
    else await gitExec(['switch', '--no-track', '-c', name, selectedBase.isLocal ? baseBranch : 'origin/' + baseBranch], cwd);
    if (await getCurrentBranch(cwd) !== name) throw new Error(tr('Ветка не создалась.', 'The branch was not created.'));

    refreshTerminals();
    this._postMessage({
      type: 'branchOk', branch: name, defaultBranch: baseBranch,
      message: tr(`Ветка "${name}" создана из ${baseBranch}${carried ? ' вместе с твоими изменениями' : ''}. В GitHub она появится после «Commit и Push».`,
        `Branch "${name}" was created from ${baseBranch}${carried ? ' with your changes' : ''}. It reaches GitHub with the next Commit and Push.`),
    });
    await this._sendState();
  }

  // Switching never asks to push first. Changes that would collide with the
  // other branch are kept aside and return when the user comes back.
  async _handleSwitchBranch(name) {
    if (typeof name !== 'string' || !name.trim()) throw new Error(tr('Выбери ветку.', 'Choose a branch.'));
    name = name.trim();
    const cwd = getWorkspaceRoot();
    if (!cwd) throw new Error(tr('Открой папку проекта.', 'Open a project folder.'));
    await gitExec(['check-ref-format', '--branch', name], cwd);

    const s = await collectState(cwd);
    if (s.error) throw new Error(s.error);
    if (s.mergeInProgress || s.rebaseInProgress) throw new Error(tr('Сначала заверши merge/rebase.', 'Finish the merge/rebase first.'));
    if (name === s.branch) return;
    if (hasDirtyEditors(cwd)) throw new Error(tr('Есть несохранённые редакторы. Сохрани их (Ctrl+S); ветка не переключена.', 'Some editors are unsaved. Save them (Ctrl+S); the branch was not switched.'));

    const branches = await getDetailedBranches(cwd, s.defaultBranch, s.branch);
    const target = branches.find(b => b.name === name);
    if (!target) throw new Error(tr(`Ветка "${name}" не найдена.`, `Branch "${name}" was not found.`));
    const run = () => target.isLocal ? gitExec(['switch', name], cwd) : gitExec(['switch', '--track', '-c', name, `origin/${name}`], cwd);

    let kept = false;
    try {
      await run();
    } catch (switchErr) {
      if (!blocksSwitch(switchErr.message)) throw switchErr;
      await stashFor(cwd, s.branch); kept = true;
      try { await run(); } catch (again) { await restoreStashFor(cwd, s.branch); throw again; }
    }
    const currentBranch = await getCurrentBranch(cwd);
    if (currentBranch !== name) throw new Error(tr(`Переключение не подтверждено: сейчас ${currentBranch}.`, `Switch not confirmed: current branch is ${currentBranch}.`));
    const restored = await restoreStashFor(cwd, name);

    refreshTerminals();
    let message = tr(`Переключено на "${name}".`, `Switched to "${name}".`);
    if (kept) message += tr(` Изменения ветки "${s.branch}" отложены и вернутся, когда переключишься обратно.`, ` Changes of "${s.branch}" are kept aside and return when you switch back.`);
    if (restored === 'restored') message += tr(' Отложенные изменения этой ветки возвращены.', ' The kept changes of this branch are back.');
    if (restored === 'conflict') message += tr(' Отложенные изменения не применились сами: они в git stash.', ' The kept changes could not be applied automatically: they are in git stash.');
    this._postMessage({ type: 'switchOk', branch: name, message });
    await this._sendState();
  }

  async _handlePullBranch(sourceBranch) {
    const cwd = getWorkspaceRoot();
    if (!cwd) throw new Error(tr('Открой папку проекта.', 'Open a project folder.'));
    const state = await collectState(cwd);
    if (state.error) throw new Error(state.error);
    if (state.mergeInProgress || state.rebaseInProgress) throw new Error(tr('Сначала заверши текущий merge/rebase.', 'Finish the current merge/rebase first.'));
    if (!state.isClean) throw new Error(tr('Перед получением изменений сохрани или отправь текущие изменения.', 'Commit or send the current changes before receiving another branch.'));
    if (!state.remote) throw new Error(tr('origin не подключён. Подключи repository в терминале.', 'origin is not connected. Connect the repository in the terminal.'));
    if (typeof sourceBranch !== 'string' || !sourceBranch.trim()) throw new Error(tr('Выбери другую исходную ветку.', 'Select a different source branch.'));
    sourceBranch = sourceBranch.trim();
    await gitExec(['check-ref-format', '--branch', sourceBranch], cwd);
    await gitExec(['fetch', 'origin', '--prune'], cwd);
    const branches = await getDetailedBranches(cwd, state.defaultBranch, state.branch);
    const source = branches.find(branch => branch.name === sourceBranch);
    if (!source) throw new Error(tr(`Ветка "${sourceBranch}" не найдена.`, `Branch "${sourceBranch}" was not found.`));
    if (!source.isRemote) throw new Error(tr('Ветка отсутствует в origin. Обнови список веток.', 'The branch is absent from origin. Refresh the branch list.'));
    const sourceRef = `origin/${sourceBranch}`;
    const proceed = await vscode.window.showWarningMessage(
      tr(`Получить изменения из "${sourceBranch}" и объединить с текущей веткой "${state.branch}"?`, `Receive changes from "${sourceBranch}" and merge them into the current branch "${state.branch}"?`),
      { modal: true }, tr('Получить и объединить', 'Receive and merge'), tr('Отмена', 'Cancel')
    );
    if (proceed !== tr('Получить и объединить', 'Receive and merge')) return;
    this._postMessage({ type: 'status', text: tr(`Объединение ${sourceBranch} → ${state.branch}...`, `Merging ${sourceBranch} → ${state.branch}...`) });
    try {
      await gitExec(['merge', '--no-edit', sourceRef], cwd);
    } catch (error) {
      const conflicts = await getConflictFiles(cwd).catch(() => []);
      if (!conflicts.length) throw error;
      this._postMessage({ type: 'mergeConflict', sourceBranch, currentBranch: state.branch, conflicts });
      return;
    }
    this._postMessage({ type: 'mergeOk', text: tr(`Изменения из "${sourceBranch}" добавлены в "${state.branch}". Push отправит результат в GitHub.`, `Changes from "${sourceBranch}" were added to "${state.branch}". Push will send the result to GitHub.`) });
  }

  async _handleResolveConflicts(resolutions, acceptAll = false) {
    const cwd = getWorkspaceRoot();
    const state = await collectState(cwd);
    if (!state.mergeInProgress) throw new Error(tr('Активный merge не найден.', 'No active merge was found.'));
    if (acceptAll) {
      const incoming = await gitExec(['rev-parse', '--verify', 'MERGE_HEAD'], cwd);
      const backup = 'workstation-backup/before-incoming-' + Date.now();
      const proceed = await vscode.window.showWarningMessage(
        tr('Заменить ВСЕ отслеживаемые файлы версией входящей ветки? Локальные дополнительные отслеживаемые файлы будут удалены. Предыдущий commit сохраняется в ' + backup,
          'Replace ALL tracked files with the incoming branch version? Additional local tracked files will be removed. The previous commit is saved at ' + backup),
        { modal: true }, tr('Принять всё из GitHub', 'Accept all from GitHub'), tr('Отмена', 'Cancel'));
      if (proceed !== tr('Принять всё из GitHub', 'Accept all from GitHub')) return;
      await gitExec(['branch', backup, 'HEAD'], cwd);
      await gitExec(['read-tree', '--reset', '-u', incoming], cwd);
      const expected = await gitExec(['rev-parse', incoming + '^{tree}'], cwd);
      const actual = await gitExec(['write-tree'], cwd);
      if (actual !== expected) throw new Error(tr('Проверка полного дерева файлов не прошла. Backup: ', 'Full file tree verification failed. Backup: ') + backup);
      await gitExec(['commit', '--no-edit', '--allow-empty'], cwd);
      this._postMessage({ type: 'mergeOk', text: tr('Все отслеживаемые файлы совпадают с входящей веткой. Backup: ', 'All tracked files match the incoming branch. Backup: ') + backup });
      return;
    }
    const conflicts = await getConflictFiles(cwd);
    if (!resolutions || typeof resolutions !== 'object' || conflicts.some(file => !['ours', 'theirs'].includes(resolutions[file]))) {
      throw new Error(tr('Выбери вариант для каждого конфликтующего файла.', 'Choose a version for every conflicting file.'));
    }
    for (const file of conflicts) {
      const side = resolutions[file] === 'ours' ? '--ours' : '--theirs';
      const stage = resolutions[file] === 'ours' ? 2 : 3;
      let existsOnSide = true;
      try { await gitExec(['cat-file', '-e', `:${stage}:${file}`], cwd); } catch { existsOnSide = false; }
      if (existsOnSide) {
        await gitExec(['checkout', side, '--', file], cwd);
        await gitExec(['add', '--', file], cwd);
      } else {
        await gitExec(['rm', '-f', '--', file], cwd);
      }
    }
    const remaining = await getConflictFiles(cwd);
    if (remaining.length) throw new Error(tr('Остались неразрешённые конфликты: ', 'Unresolved conflicts remain: ') + remaining.join(', '));
    await gitExec(['commit', '--no-edit'], cwd);
    this._postMessage({ type: 'mergeOk', text: tr('Конфликты разрешены. Проверь результат и нажми Push.', 'Conflicts are resolved. Review the result and press Push.') });
  }

  async _handleAbortMerge() {
    const cwd = getWorkspaceRoot();
    const state = await collectState(cwd);
    if (!state.mergeInProgress) return;
    await gitExec(['merge', '--abort'], cwd);
    this._postMessage({ type: 'status', text: tr('Merge отменён; файлы возвращены к состоянию до него.', 'Merge was cancelled; files were restored to their pre-merge state.') });
  }

  async _handleOpenPullRequest(baseBranch) {
    const cwd = getWorkspaceRoot(), state = await collectState(cwd);
    if (state.error) throw new Error(state.error);
    if (!state.remote) throw new Error(tr('origin не подключён.', 'origin is not connected.'));
    const github = parseGitHubRemote(state.remote);
    if (!github) throw new Error(tr('Pull Request поддерживается для origin на github.com.', 'Pull Requests are supported for a github.com origin.'));
    if (typeof baseBranch !== 'string' || !baseBranch.trim() || baseBranch === state.branch) throw new Error(tr('Выбери другую целевую ветку.', 'Select a different target branch.'));
    await gitExec(['check-ref-format', '--branch', baseBranch], cwd);
    const refs = await gitExec(['ls-remote', '--heads', 'origin', `refs/heads/${baseBranch}`, `refs/heads/${state.branch}`], cwd);
    const remoteHeads = new Map(refs.trim().split('\n').filter(Boolean).map(line => {
      const [sha, ref] = line.trim().split(/\s+/);
      return [ref, sha];
    }));
    if (!remoteHeads.has(`refs/heads/${baseBranch}`) || !remoteHeads.has(`refs/heads/${state.branch}`)) {
      throw new Error(tr('Head или base отсутствует в origin. Сначала явно отправь нужную ветку; PR не открыт.', 'Head or base is absent from origin. Explicitly push the required branch first; no PR was opened.'));
    }
    const localHead = (await gitExec(['rev-parse', 'HEAD'], cwd)).trim();
    if (localHead !== remoteHeads.get(`refs/heads/${state.branch}`)) {
      throw new Error(tr('Локальный head отличается от origin. Проверь commits и синхронизируй ветку перед созданием PR.', 'Local head differs from origin. Review commits and synchronize the branch before creating a PR.'));
    }
    const url = `https://github.com/${encodeURIComponent(github.owner)}/${encodeURIComponent(github.repository)}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(state.branch)}?expand=1`;
    if (!vscode.env?.openExternal || !vscode.Uri?.parse) throw new Error(tr('Редактор не может открыть GitHub.', 'The editor cannot open GitHub.'));
    if (!await vscode.env.openExternal(vscode.Uri.parse(url))) throw new Error(tr('GitHub не открылся; PR не создан. Проверь внешний браузер.', 'GitHub did not open; no PR was created. Check the external browser.'));
    this._postMessage({ type: 'status', text: tr('Открыта официальная страница создания Pull Request в GitHub.', 'The official GitHub Pull Request page was opened.') });
  }

  // One confirmation deletes the branch on this computer and in GitHub,
  // pushed or not. Commits that main does not have yet are kept in a backup
  // ref first, and the origin delete is leased to the exact commit shown.
  async _handleDeleteBranches(branchesToDelete) {
    if (!Array.isArray(branchesToDelete) || branchesToDelete.length === 0) throw new Error(tr('Не выбраны ветки для удаления.', 'No branches selected.'));
    const cwd = getWorkspaceRoot();
    if (!cwd) throw new Error(tr('Открой папку проекта.', 'Open a project folder.'));
    for (const name of branchesToDelete) {
      if (typeof name !== 'string' || !name || name.startsWith('-')) throw new Error('Invalid branch name');
      try { await gitExec(['check-ref-format', '--branch', name], cwd); }
      catch { throw new Error(`Invalid branch name: "${name}"`); }
    }
    branchesToDelete = [...new Set(branchesToDelete)];

    const s = await collectState(cwd);
    if (s.error) throw new Error(s.error);
    if (s.mergeInProgress || s.rebaseInProgress) throw new Error(tr('Сначала заверши merge/rebase.', 'Finish the merge/rebase first.'));
    const defaultBranch = s.defaultBranch || 'main';
    const forbidden = new Set(['main', 'master', defaultBranch].filter(Boolean));
    for (const b of branchesToDelete) if (forbidden.has(b)) throw new Error(tr(`Ветку "${b}" удалять нельзя: это основная ветка.`, `"${b}" is the main branch and cannot be deleted.`));
    const deletingCurrent = branchesToDelete.includes(s.branch);
    if (deletingCurrent && hasDirtyEditors(cwd)) throw new Error(tr('Сохрани открытые файлы (Ctrl+S) перед удалением активной ветки.', 'Save open files (Ctrl+S) before deleting the active branch.'));

    const online = await bestEffortFetch(cwd, s.remote);
    let base = null;
    for (const ref of [`refs/remotes/origin/${defaultBranch}`, `refs/heads/${defaultBranch}`]) {
      try { base = (await gitExec(['rev-parse', '--verify', ref], cwd)).trim(); break; } catch {}
    }
    const count = async sha => {
      if (!base || !sha) return 0;
      try { const value = Number((await gitExec(['rev-list', '--count', `${base}..${sha}`], cwd)).trim()); return Number.isSafeInteger(value) && value > 0 ? value : 0; }
      catch { return 0; }
    };
    const plan = [];
    for (const branch of branchesToDelete) {
      let local = null, remote = null;
      try { local = (await gitExec(['rev-parse', '--verify', `refs/heads/${branch}`], cwd)).trim(); } catch {}
      if (s.remote && online) {
        const line = await gitExec(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], cwd).catch(() => '');
        const sha = line.trim().split(/\s+/)[0];
        if (/^[a-f0-9]{40,64}$/i.test(sha || '')) remote = sha;
      }
      if (!local && !remote) throw new Error(tr(`Ветка "${branch}" не найдена.`, `Branch "${branch}" was not found.`));
      plan.push({ branch, local, remote, localOnly: await count(local), remoteOnly: await count(remote) });
    }
    const where = item => item.local && item.remote ? tr('на компьютере и в GitHub', 'on this computer and in GitHub') : item.local ? tr('только на компьютере', 'on this computer only') : tr('только в GitHub', 'in GitHub only');
    const lines = plan.map(item => {
      const unmerged = Math.max(item.localOnly, item.remoteOnly);
      return `${item.branch} — ${where(item)}` + (unmerged ? tr(`; ${unmerged} commit(ов) нет в ${defaultBranch} — они сохранятся в резервной копии`, `; ${unmerged} commit(s) not in ${defaultBranch} — kept in a backup`) : '');
    });
    if (s.remote && !online) lines.push(tr('GitHub сейчас недоступен: удаляется только на компьютере.', 'GitHub is unreachable now: deleting on this computer only.'));
    const confirm = await vscode.window.showWarningMessage(
      tr('Удалить ветки?\n', 'Delete branches?\n') + lines.join('\n'), { modal: true }, tr('Удалить', 'Delete'), tr('Отмена', 'Cancel'));
    if (confirm !== tr('Удалить', 'Delete')) { this._postMessage({ type: 'status', text: tr('Удаление отменено.', 'Deletion cancelled.') }); return; }

    let kept = '';
    if (deletingCurrent) {
      const safeTarget = await findSafeSwitchTarget(cwd, branchesToDelete);
      if (!safeTarget) throw new Error(tr('Нет другой ветки, на которую можно переключиться. Удаление отменено.', 'There is no other branch to switch to. Nothing was deleted.'));
      try { await gitExec(['switch', safeTarget], cwd); }
      catch (err) {
        if (!blocksSwitch(err.message)) throw err;
        await stashFor(cwd, s.branch); kept = s.branch;
        await gitExec(['switch', safeTarget], cwd);
      }
      if (await getCurrentBranch(cwd) !== safeTarget) throw new Error(tr(`Переключение на "${safeTarget}" не подтверждено. Удаление отменено.`, `Switch to "${safeTarget}" not confirmed. Nothing was deleted.`));
    }

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
    const backups = [], deleted = [], failed = [];
    for (const item of plan) {
      const errors = [];
      for (const [sha, unmerged] of [[item.local, item.localOnly], [item.remote, item.remoteOnly]]) {
        if (!sha || !unmerged || backups.some(backup => backup.sha === sha)) continue;
        try {
          await gitExec(['cat-file', '-e', sha + '^{commit}'], cwd);
          const first = `refs/workstation-backup/${item.branch}-${stamp}`;
          const ref = backups.some(backup => backup.ref === first) ? first + '-github' : first;
          await gitExec(['update-ref', ref, sha], cwd);
          backups.push({ ref, sha });
        } catch { errors.push(tr('резервная копия не создана', 'backup failed')); }
      }
      if (errors.length) { failed.push({ name: item.branch, error: errors.join(', ') }); continue; }
      if (item.local) {
        try { await gitExec(['branch', '-D', '--', item.branch], cwd); }
        catch (err) { errors.push(`local: ${err.message}`); }
      }
      if (item.remote && !errors.length) {
        try { await gitExec(['push', `--force-with-lease=refs/heads/${item.branch}:${item.remote}`, 'origin', '--delete', '--', item.branch], cwd); }
        catch (err) { if (!/remote ref does not exist/.test(err.message)) errors.push(`GitHub: ${err.message}`); }
        if (!errors.length) await gitExec(['branch', '-dr', `origin/${item.branch}`], cwd).catch(() => {});
      }
      if (errors.length) failed.push({ name: item.branch, error: errors.join(', ') }); else deleted.push(item.branch);
    }
    await bestEffortFetch(cwd, s.remote);
    refreshTerminals();
    const notes = (backups.length ? tr(' Резервная копия: ', ' Backup: ') + backups.map(backup => backup.ref).join(', ') + '.' : '')
      + (kept ? tr(` Изменения ветки "${kept}" сохранены в git stash.`, ` Changes of "${kept}" are kept in git stash.`) : '');
    if (!failed.length) this._postMessage({ type: 'deleteOk', message: tr('Удалено: ', 'Deleted: ') + deleted.join(', ') + '.' + notes });
    else this._postMessage({ type: 'deletePartial', message: tr('Удалено: ', 'Deleted: ') + (deleted.join(', ') || tr('нет', 'none')) + tr('. Не удалось: ', '. Failed: ') + failed.map(f => `${f.name} (${f.error})`).join('; ') + notes });
    await this._sendState();
  }

  _getHtml() {
    const ui = isRussian() ? {
      current: 'Ветка', refresh: 'Обновить', connected: 'GitHub подключён', missing: 'GitHub (origin) не подключён', clean: 'нет изменений', changes: 'есть изменения',
      files: 'Изменения', noFiles: 'Нет изменённых файлов', author: 'Автор', noAuthor: 'Автор не задан — см. README, шаг «Имя для GitHub»',
      branchName: 'Имя новой ветки', fromBranch: 'Из ветки', format: 'Prettier перед commit',
      commit: 'Сообщение', commitPlaceholder: 'Например: добавил форму входа', push: 'Commit и Push',
      newBranch: 'Новая ветка', createPush: 'Создать', myBranch: 'Переключить ветку',
      receive: 'Получить изменения', receiveFrom: 'Из ветки', receiveInto: 'В ветку', merge: 'Получить',
      pr: 'Pull Request', prFrom: 'Из ветки', prInto: 'В ветку', openPr: 'Открыть в GitHub',
      conflicts: 'Конфликты', ours: 'Оставить моё', theirs: 'Взять из GitHub', keepAll: 'Оставить всё моё', incomingAll: 'Взять всё из GitHub', resolve: 'Применить', abort: 'Отменить merge',
      deleteBranch: 'Удалить ветку', deleteSelected: 'Удалить', noBranches: 'Нет веток для удаления', active: 'активная',
      startPush: 'Commit и Push...', selectFile: 'Выбери хотя бы один файл', selectedFiles: 'файл(ов)', enterBranch: 'Введи имя ветки', switching: 'Переключение на ', preparingDelete: 'Подготовка удаления...',
    } : {
      current: 'Branch', refresh: 'Refresh', connected: 'GitHub connected', missing: 'GitHub (origin) not connected', clean: 'no changes', changes: 'changes',
      files: 'Changes', noFiles: 'No changed files', author: 'Author', noAuthor: 'No author set — see the README step "Your name for GitHub"',
      branchName: 'New branch name', fromBranch: 'From branch', format: 'Prettier before commit',
      commit: 'Message', commitPlaceholder: 'Example: add login form', push: 'Commit and Push',
      newBranch: 'New branch', createPush: 'Create', myBranch: 'Switch branch',
      receive: 'Get changes', receiveFrom: 'From branch', receiveInto: 'Into branch', merge: 'Get',
      pr: 'Pull Request', prFrom: 'From branch', prInto: 'Into branch', openPr: 'Open in GitHub',
      conflicts: 'Conflicts', ours: 'Keep mine', theirs: 'Take from GitHub', keepAll: 'Keep all mine', incomingAll: 'Take all from GitHub', resolve: 'Apply', abort: 'Cancel merge',
      deleteBranch: 'Delete branch', deleteSelected: 'Delete', noBranches: 'No branches to delete', active: 'active',
      startPush: 'Commit and Push...', selectFile: 'Select at least one file', selectedFiles: 'file(s)', enterBranch: 'Enter a branch name', switching: 'Switching to ', preparingDelete: 'Preparing deletion...',
    };
    const U = key => ui[key];
    return `<!DOCTYPE html>
<html lang="${isRussian() ? 'ru' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, transparent);
    padding: 6px 8px 14px;
    user-select: none;
    overflow-y: auto;
    overflow-x: hidden;
    height: 100vh;
    scrollbar-gutter: stable;
    overflow-wrap: anywhere;
  }

  html { height:100%; overflow:hidden; }
  input, select, textarea { max-width:100%; min-width:0; }
  textarea { resize:vertical; max-height:120px; }
  #conflictList { max-height:180px; overflow:auto; }

  .block {
    margin-bottom: 8px;
    border: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,0.2));
    border-radius: 4px;
    background: var(--vscode-sideBar-background, transparent);
    overflow: hidden;
  }

  .block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    background: var(--vscode-sideBarSectionHeader-background, rgba(255,255,255,0.03));
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
  }

  .block-header:hover {
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06));
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .chevron {
    font-size: 9px;
    display: inline-block;
    transition: transform 0.15s ease;
  }

  .block-content {
    padding: 8px;
    background: var(--vscode-sideBar-background, transparent);
  }

  .info-box {
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 6px 8px;
    font-size: 12px;
    line-height: 1.4;
    margin-bottom: 6px;
  }

  .branch-name {
    font-weight: 600;
    color: var(--vscode-textLink-foreground, #4ec9b0);
    word-break: break-all;
  }

  .sub-text {
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    margin-top: 2px;
  }

  .clean-badge { color: #4caf50; font-size: 11px; font-weight: 500; }
  .dirty-badge { color: var(--vscode-editorWarning-foreground, #f0c040); font-size: 11px; font-weight: 500; }
  .protected-warning {
    color: var(--vscode-editorWarning-foreground, #f0c040);
    font-size: 11px;
    margin-top: 4px;
    line-height: 1.3;
  }

  .field-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
    margin: 6px 0 3px;
  }

  textarea {
    width: 100%;
    padding: 5px 7px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 3px;
    font-family: inherit;
    font-size: 12px;
    outline: none;
    resize: vertical;
    min-height: 48px;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }

  textarea:focus { border-color: var(--vscode-focusBorder, #007acc); }

  input[type="text"] {
    width: 100%;
    padding: 5px 7px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 3px;
    font-family: inherit;
    font-size: 12px;
    outline: none;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }

  input[type="text"]:focus { border-color: var(--vscode-focusBorder, #007acc); }

  select {
    width: 100%;
    padding: 5px 7px;
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-dropdown-border, #3c3c3c);
    border-radius: 3px;
    font-family: inherit;
    font-size: 12px;
    outline: none;
    cursor: pointer;
  }

  .hint-text {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
    line-height: 1.3;
  }

  .check-row { display:flex; align-items:flex-start; gap:7px; padding:4px 2px; font-size:11px; line-height:1.35; }
  .check-row input { margin-top:2px; flex:0 0 auto; }
  .file-list { max-height:145px; overflow:auto; border:1px solid var(--vscode-input-border, rgba(128,128,128,.2)); border-radius:3px; padding:3px 5px; background:var(--vscode-input-background); }
  .file-name { word-break:break-all; flex:1; }
  .file-status { color:var(--vscode-descriptionForeground); font-family:var(--vscode-editor-font-family, monospace); }
  .secret-file { color:var(--vscode-errorForeground); }
  .inline-options { display:grid; grid-template-columns:1fr; gap:5px; margin-top:5px; padding:6px; border-left:2px solid var(--vscode-focusBorder); background:rgba(100,100,100,.08); }
  .target-summary { margin-top:6px; padding:6px 8px; border-radius:3px; background:var(--vscode-textBlockQuote-background, rgba(127,127,127,.1)); font-size:11px; line-height:1.4; }
  .flow { color:var(--vscode-descriptionForeground); }

  .btn {
    display: block;
    width: 100%;
    padding: 6px 10px;
    margin-top: 6px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    text-align: center;
  }

  .btn:hover { filter: brightness(1.15); }
  .btn:disabled { opacity: 0.45; cursor: default; filter: none; }

  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .btn-secondary {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #cccccc);
  }

  .btn-danger {
    background: var(--vscode-errorForeground, #f44336);
    color: #ffffff;
  }

  /* Delete branches checklist */
  .branch-checklist {
    max-height: 130px;
    overflow-y: auto;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.2));
    border-radius: 3px;
    padding: 4px;
    background: var(--vscode-input-background);
    margin-top: 4px;
  }

  .branch-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 4px;
    font-size: 11px;
    border-radius: 2px;
  }

  .branch-item:hover {
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05));
  }

  .del-icon-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 2px;
    line-height: 1;
    opacity: 0.7;
  }
  .del-icon-btn:hover {
    background: var(--vscode-errorForeground, #f44336);
    color: #ffffff;
    opacity: 1;
  }

  .refresh-btn {
    background: none;
    border: none;
    color: var(--vscode-sideBarSectionHeader-foreground, inherit);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 5px;
    border-radius: 3px;
    opacity: 0.75;
  }
  .refresh-btn:hover {
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.1));
    opacity: 1;
  }

  /* Status feedback bar */
  .status-bar {
    font-size: 11px;
    padding: 6px 8px;
    border-radius: 3px;
    margin-top: 8px;
    line-height: 1.4;
    display: none;
    word-break: break-word;
  }

  .status-ok {
    background: rgba(76,175,80,0.14);
    color: #4caf50;
    border-left: 3px solid #4caf50;
  }

  .status-warn {
    background: rgba(255,152,0,0.14);
    color: var(--vscode-editorWarning-foreground, #ff9800);
    border-left: 3px solid #ff9800;
  }

  .status-err {
    background: rgba(244,67,54,0.14);
    color: var(--vscode-editorError-foreground, #f44336);
    border-left: 3px solid #f44336;
  }

  .status-info {
    background: rgba(100,100,100,0.14);
    color: var(--vscode-foreground);
    border-left: 3px solid var(--vscode-descriptionForeground);
  }
</style>
</head>
<body>

<!-- 1. CURRENT BLOCK: the branch, its changes and Commit + Push -->
<div class="block" id="blockCurrent">
  <div class="block-header" onclick="toggleBlock('current')">
    <div class="header-left">
      <span class="chevron" id="chevronCurrent">▼</span>
      <span>${U('current')}</span>
    </div>
    <button class="refresh-btn" onclick="event.stopPropagation(); doSyncTerminal();" title="${U('refresh')}">↻</button>
  </div>
  <div class="block-content" id="contentCurrent" onclick="event.stopPropagation()">
    <div class="info-box">
      <div class="branch-name" id="branchName">—</div>
      <div class="sub-text"><span id="remoteStatus">…</span> · <span id="cleanBadge" class="clean-badge" style="display:none">✓ ${U('clean')}</span><span id="dirtyBadge" class="dirty-badge" style="display:none">● ${U('changes')}</span></div>
      <div class="sub-text" id="authorLine"></div>
    </div>

    <div id="pushControls">
      <div class="field-label">${U('files')}</div>
      <div class="file-list" id="changedFiles"></div>
      <div class="field-label">${U('commit')}</div>
      <textarea id="commitInput" placeholder="${U('commitPlaceholder')}" rows="2" onkeydown="if(event.ctrlKey && event.key==='Enter') doPush()"></textarea>
      <label class="check-row"><input type="checkbox" id="formatBeforeCommit"><span>${U('format')}</span></label>
      <div class="target-summary" id="pushTarget"></div>
      <button class="btn btn-primary" id="pushBtn" onclick="doPush()">${U('push')}</button>
    </div>
  </div>
</div>

<!-- 2. SWITCH BRANCH -->
<div class="block" id="blockMyBranch">
  <div class="block-header" onclick="toggleBlock('myBranch')">
    <div class="header-left"><span class="chevron" id="chevronMyBranch">▶</span><span>${U('myBranch')}</span></div>
  </div>
  <div class="block-content" id="contentMyBranch" style="display:none" onclick="event.stopPropagation()">
    <select id="branchSelect" onchange="doSwitchBranch(this.value)"></select>
  </div>
</div>

<!-- 3. NEW BRANCH -->
<div class="block" id="blockNewBranch">
  <div class="block-header" onclick="toggleBlock('newBranch')">
    <div class="header-left"><span class="chevron" id="chevronNewBranch">▶</span><span>${U('newBranch')}</span></div>
  </div>
  <div class="block-content" id="contentNewBranch" style="display:none" onclick="event.stopPropagation()">
    <div class="field-label">${U('branchName')}</div><input type="text" id="newBranchInput" placeholder="day-2" onkeydown="if(event.key==='Enter') doNewBranch()" />
    <div class="field-label">${U('fromBranch')}</div><select id="newBranchBase"></select>
    <button class="btn btn-secondary" id="newBranchBtn" onclick="doNewBranch()">${U('createPush')}</button>
  </div>
</div>

<!-- 4. GET CHANGES -->
<div class="block" id="blockPull">
  <div class="block-header" onclick="toggleBlock('pull')"><div class="header-left"><span class="chevron" id="chevronPull">▶</span><span>${U('receive')}</span></div></div>
  <div class="block-content" id="contentPull" style="display:none" onclick="event.stopPropagation()">
    <div class="field-label">${U('receiveFrom')}</div><select id="pullSource"></select>
    <div class="target-summary"><span class="flow">${U('receiveInto')}:</span> <strong id="pullTarget">—</strong></div>
    <button class="btn btn-primary" id="pullBtn" onclick="doPull()">${U('merge')}</button>
    <div id="conflictPanel" style="display:none"><div class="field-label">${U('conflicts')}</div><div id="conflictList"></div><button class="btn btn-primary" onclick="acceptIncomingTree()">${U('incomingAll')}</button><button class="btn btn-secondary" onclick="resolveAllConflicts('ours')">${U('keepAll')}</button><button class="btn btn-secondary" onclick="resolveConflicts()">${U('resolve')}</button><button class="btn btn-secondary" onclick="abortMerge()">${U('abort')}</button></div>
  </div>
</div>

<!-- 5. DELETE BRANCH -->
<div class="block" id="blockDeleteBranch">
  <div class="block-header" onclick="toggleBlock('deleteBranch')">
    <div class="header-left"><span class="chevron" id="chevronDeleteBranch">▶</span><span>${U('deleteBranch')}</span></div>
  </div>
  <div class="block-content" id="contentDeleteBranch" style="display:none" onclick="event.stopPropagation()">
    <div class="branch-checklist" id="deleteChecklist"><div class="hint-text">${U('noBranches')}</div></div>
    <button class="btn btn-danger" id="deleteBtn" disabled onclick="doDeleteBranches()">${U('deleteSelected')}</button>
  </div>
</div>

<!-- 6. PULL REQUEST (rarely needed) -->
<div class="block" id="blockPr">
  <div class="block-header" onclick="toggleBlock('pr')"><div class="header-left"><span class="chevron" id="chevronPr">▶</span><span>${U('pr')}</span></div></div>
  <div class="block-content" id="contentPr" style="display:none" onclick="event.stopPropagation()">
    <div class="target-summary"><span class="flow">${U('prFrom')}:</span> <strong id="prSource">—</strong></div>
    <div class="field-label">${U('prInto')}</div><select id="prTarget"></select>
    <button class="btn btn-secondary" id="prBtn" onclick="openPullRequest()">${U('openPr')}</button>
  </div>
</div>

<!-- Status Message -->
<div class="status-bar" id="statusBar"></div>

<script>
const vscode = acquireVsCodeApi();
const UI = ${JSON.stringify(ui)};
let currentBranch = null;
let busy = false;
let allBranches = [];
let conflictFiles = [];

const blockStates = {
  current: true,
  newBranch: false,
  myBranch: false,
  pull: false,
  pr: false,
  deleteBranch: false,
};

function toggleBlock(id) {
  blockStates[id] = !blockStates[id];
  renderBlockStates();
}

function renderBlockStates() {
  const map = {
    current: { content: 'contentCurrent', chevron: 'chevronCurrent' },
    newBranch: { content: 'contentNewBranch', chevron: 'chevronNewBranch' },
    myBranch: { content: 'contentMyBranch', chevron: 'chevronMyBranch' },
    pull: { content: 'contentPull', chevron: 'chevronPull' },
    pr: { content: 'contentPr', chevron: 'chevronPr' },
    deleteBranch: { content: 'contentDeleteBranch', chevron: 'chevronDeleteBranch' },
  };

  for (const [key, item] of Object.entries(map)) {
    const el = document.getElementById(item.content);
    const ch = document.getElementById(item.chevron);
    if (el && ch) {
      el.style.display = blockStates[key] ? 'block' : 'none';
      ch.textContent = blockStates[key] ? '▼' : '▶';
    }
  }
}

function setStatus(text, type) {
  const el = document.getElementById('statusBar');
  if (!text) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.className = 'status-bar status-' + type;
  el.textContent = text;
}

function setBusy(val) {
  busy = val;
  document.getElementById('pushBtn').disabled = val;
  document.getElementById('newBranchBtn').disabled = val;
  document.getElementById('branchSelect').disabled = val;
  document.getElementById('newBranchInput').disabled = val;
  document.getElementById('commitInput').disabled = val;
  for (const id of ['pullBtn','prBtn','formatBeforeCommit','newBranchBase']) {
    const element = document.getElementById(id); if (element) element.disabled = val;
  }
  document.querySelectorAll('#changedFiles input').forEach(input => { input.disabled = val || input.dataset.secret === 'true'; });
  document.querySelectorAll('#conflictPanel button, #conflictPanel select').forEach(element => { element.disabled = val; });
  updateDeleteBtnState();
}

function updateDeleteBtnState() {
  const checkboxes = document.querySelectorAll('#deleteChecklist input[type="checkbox"]:checked');
  const btn = document.getElementById('deleteBtn');
  btn.disabled = busy || checkboxes.length === 0;
  btn.textContent = checkboxes.length > 0 ? (UI.deleteSelected + ' (' + checkboxes.length + ')') : UI.deleteSelected;
}

function doPush() {
  if (busy) return;
  const msg = document.getElementById('commitInput').value;
  const selectedFiles = Array.from(document.querySelectorAll('#changedFiles input[type="checkbox"]:checked')).map(input => input.dataset.file);
  if (document.querySelectorAll('#changedFiles input[type="checkbox"]').length && !selectedFiles.length) { setStatus(UI.selectFile, 'err'); return; }
  setBusy(true);
  setStatus(UI.startPush, 'info');
  vscode.postMessage({ command: 'push', commitMessage: msg, selectedFiles, formatBeforeCommit: document.getElementById('formatBeforeCommit').checked });
}

function doNewBranch() {
  if (busy) return;
  const name = document.getElementById('newBranchInput').value.trim();
  if (!name) {
    setStatus(UI.enterBranch, 'err');
    return;
  }
  setBusy(true);
  setStatus(UI.newBranch + '...', 'info');
  vscode.postMessage({ command: 'newBranch', name, baseBranch: document.getElementById('newBranchBase').value });
}

function doSwitchBranch(name) {
  if (busy || !name || name === currentBranch) return;
  setBusy(true);
  setStatus(UI.switching + name + '...', 'info');
  vscode.postMessage({ command: 'switchBranch', name });
}

function doDeleteBranches() {
  if (busy) return;
  const checked = Array.from(document.querySelectorAll('#deleteChecklist input[type="checkbox"]:checked'))
    .map(cb => cb.dataset.branch);

  if (checked.length === 0) return;
  setBusy(true);
  setStatus(UI.preparingDelete, 'info');
  vscode.postMessage({ command: 'deleteBranches', branches: checked });
}

function applyState(state, branches) {
  setBusy(Boolean(state.busy));
  currentBranch = state.branch;
  allBranches = branches || [];

  if (state.error) {
    document.getElementById('branchName').textContent = '—';
    document.getElementById('remoteStatus').textContent = state.error;
    document.getElementById('cleanBadge').style.display = 'none';
    document.getElementById('dirtyBadge').style.display = 'none';
    document.getElementById('authorLine').textContent = '';
    document.getElementById('pushBtn').disabled = true;
    updateBranchSelect([], null);
    updateBranchControls([], null);
    updateChangedFiles([]);
    updateDeleteList([], null);
    return;
  }

  document.getElementById('branchName').textContent = state.branch || '—';
  document.getElementById('remoteStatus').textContent = state.remote
    ? UI.connected
    : UI.missing;

  document.getElementById('cleanBadge').style.display = state.isClean ? '' : 'none';
  document.getElementById('dirtyBadge').style.display = state.isClean ? 'none' : '';

  const author = state.author || {};
  document.getElementById('authorLine').textContent = author.name && author.email
    ? UI.author + ': ' + author.name + ' <' + author.email + '>' + (author.foreign ? ' ⚠' : '') : UI.noAuthor;

  document.getElementById('pushBtn').disabled = busy;
  document.getElementById('commitInput').disabled = busy;

  updateBranchSelect(branches, state.branch);
  updateBranchControls(branches, state.branch);
  updateChangedFiles(state.changedFiles || []);
  updateDeleteList(branches, state.branch);
  document.getElementById('pullTarget').textContent = state.branch || '—';
  document.getElementById('prSource').textContent = state.branch || '—';
  if (state.mergeInProgress && state.conflicts?.length) renderConflicts(state.conflicts);
  else if (!state.mergeInProgress) { conflictFiles = []; document.getElementById('conflictPanel').style.display = 'none'; }
  updateTargetSummary();
  renderBlockStates();
}

function updateChangedFiles(files) {
  const container = document.getElementById('changedFiles');
  const previous = new Map(Array.from(container.querySelectorAll('input[type="checkbox"]'), input => [input.dataset.file, input.checked]));
  container.innerHTML = '';
  if (!files.length) { container.innerHTML = '<div class="hint-text">' + UI.noFiles + '</div>'; return; }
  for (const item of files) {
    const row = document.createElement('label'); row.className = 'check-row' + (item.secret ? ' secret-file' : '');
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !item.secret && (previous.has(item.file) ? previous.get(item.file) : true); input.disabled = item.secret || busy;
    input.dataset.file = item.file; input.dataset.secret = String(item.secret); input.onchange = updateTargetSummary;
    const status = document.createElement('span'); status.className = 'file-status'; status.textContent = item.status;
    const name = document.createElement('span'); name.className = 'file-name'; name.textContent = (item.originalFile ? item.originalFile + ' → ' : '') + item.file + (item.secret ? ' 🔒' : '');
    row.append(input, status, name); container.appendChild(row);
  }
}

function fillBranchSelect(id, branches, selected, excludeCurrent) {
  const select = document.getElementById(id);
  const previous = select.value;
  if ((branches || []).some(branch => branch.name === previous && (!excludeCurrent || branch.name !== currentBranch))) selected = previous;
  select.innerHTML = '';
  for (const branch of branches || []) {
    if (excludeCurrent && branch.name === currentBranch) continue;
    const option = document.createElement('option'); option.value = branch.name;
    option.textContent = branch.name + (branch.isCurrent ? ' (' + UI.active + ')' : '');
    if (branch.name === selected) option.selected = true;
    select.appendChild(option);
  }
  select.disabled = busy || select.options.length === 0;
}

function updateBranchControls(branches, current) {
  const defaultBranch = (branches || []).find(branch => branch.isSystemProtected)?.name || current;
  fillBranchSelect('newBranchBase', branches, current, false);
  fillBranchSelect('pullSource', branches.filter(branch => branch.isRemote), current, false);
  fillBranchSelect('prTarget', branches, defaultBranch, true);
  document.getElementById('pullBtn').disabled = busy || !document.getElementById('pullSource').value;
  document.getElementById('prBtn').disabled = busy || !document.getElementById('prTarget').value;
}

function renderConflicts(files) {
  conflictFiles = files; blockStates.pull = true;
  const panel = document.getElementById('conflictPanel'), list = document.getElementById('conflictList');
  const previous = new Map(Array.from(list.querySelectorAll('select'), select => [select.dataset.conflict, select.value]));
  list.innerHTML = '';
  for (const file of files) {
    const row = document.createElement('div'); row.className = 'check-row';
    const name = document.createElement('span'); name.className = 'file-name'; name.textContent = file;
    const select = document.createElement('select'); select.dataset.conflict = file;
    for (const [value, label] of [['ours', UI.ours], ['theirs', UI.theirs]]) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.appendChild(option); }
    if (previous.has(file)) select.value = previous.get(file);
    row.append(name, select); list.appendChild(row);
  }
  panel.style.display = 'block'; renderBlockStates();
}

function updateBranchSelect(branches, current) {
  const select = document.getElementById('branchSelect');
  select.innerHTML = '';

  if (!branches || branches.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No branches';
    select.appendChild(opt);
    return;
  }

  for (const b of branches) {
    const opt = document.createElement('option');
    opt.value = b.name;
    opt.textContent = b.name;
    if (b.name === current) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }
}

function updateDeleteList(branches, current) {
  const container = document.getElementById('deleteChecklist');
  container.innerHTML = '';

  const deletable = (branches || []).filter(b => !b.isSystemProtected && b.name !== 'main' && b.name !== 'master');

  if (deletable.length === 0) {
    container.innerHTML = '<div class="hint-text">' + UI.noBranches + '</div>';
    updateDeleteBtnState();
    return;
  }

  for (const b of deletable) {
    const row = document.createElement('div');
    row.className = 'branch-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.branch = b.name;
    cb.onchange = updateDeleteBtnState;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = b.name === current ? (b.name + ' (' + UI.active + ')') : b.name;

    row.appendChild(cb);
    row.appendChild(nameSpan);
    container.appendChild(row);
  }

  updateDeleteBtnState();
}

function doSyncTerminal() {
  vscode.postMessage({ command: 'syncTerminal' });
}

function updateTargetSummary() {
  const count = document.querySelectorAll('#changedFiles input[type="checkbox"]:checked').length;
  document.getElementById('pushTarget').textContent = count + ' ' + UI.selectedFiles + ' → ' + (currentBranch || '—');
}

function doPull() {
  const sourceBranch = document.getElementById('pullSource').value;
  if (busy || !sourceBranch) return;
  setBusy(true); setStatus(UI.receive + '...', 'info');
  vscode.postMessage({ command: 'pullBranch', sourceBranch });
}

function openPullRequest() {
  const baseBranch = document.getElementById('prTarget').value;
  if (busy || !baseBranch) return;
  setBusy(true); vscode.postMessage({ command: 'openPullRequest', baseBranch });
}

function resolveConflicts() {
  const resolutions = {};
  document.querySelectorAll('#conflictList select').forEach(select => { resolutions[select.dataset.conflict] = select.value; });
  setBusy(true); vscode.postMessage({ command: 'resolveConflicts', resolutions });
}

function acceptIncomingTree() { if (!busy) { setBusy(true); vscode.postMessage({ command: 'resolveConflicts', acceptAll: true }); } }

function resolveAllConflicts(side) {
  document.querySelectorAll('#conflictList select').forEach(select => { select.value = side; });
  resolveConflicts();
}

function abortMerge() { if (!busy) { setBusy(true); vscode.postMessage({ command: 'abortMerge' }); } }

// Receive messages from extension host
window.addEventListener('message', event => {
  const msg = event.data;
  if (!msg) return;

  switch (msg.type) {
    case 'state':
      applyState(msg.state, msg.branches);
      break;

    case 'status':
      setStatus(msg.text, 'info');
      break;

    case 'pushOk':
      setStatus(msg.message || ('Pushed ' + msg.branch + ' (' + (msg.sha || '') + ')'), 'ok');
      if (msg.clearInput) {
        document.getElementById('commitInput').value = '';
      }
      break;

    case 'branchOk':
      setStatus(msg.message || ('Created and pushed: ' + msg.branch), 'ok');
      document.getElementById('newBranchInput').value = '';
      break;

    case 'mergeOk':
      setStatus(msg.text, 'ok');
      conflictFiles = [];
      document.getElementById('conflictPanel').style.display = 'none';
      break;

    case 'mergeConflict':
      setStatus((UI.conflicts + ': ' + msg.conflicts.length), 'warn');
      renderConflicts(msg.conflicts);
      break;

    case 'switchOk':
      setStatus(msg.message || ('Switched to: ' + msg.branch), 'ok');
      break;

    case 'deleteOk':
      setStatus(msg.message, 'ok');
      break;

    case 'deletePartial':
      setStatus(msg.message, 'warn');
      break;

    case 'warn':
      setStatus(msg.text, 'warn');
      break;

    case 'error':
      setStatus(msg.text, 'err');
      break;
  }
});

// Initialization
vscode.postMessage({ command: 'init' });
renderBlockStates();

setInterval(() => {
  if (!busy && document.visibilityState === 'visible') {
    vscode.postMessage({ command: 'refresh' });
  }
}, 2500);
</script>
</body>
</html>`;
  }
}

function activate(context) {
  log('WORKSTATION GITHUB PANEL ACTIVATING');
  panelProvider = new GithubPanelProvider();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PANEL_ID, panelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('workstationGithubPanel.refresh', () => {
      if (panelProvider) panelProvider.refresh();
    })
  );

  if (vscode && vscode.workspace) {
    if (typeof vscode.workspace.onDidSaveTextDocument === 'function') {
      context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(() => {
          if (panelProvider) panelProvider.refresh();
        })
      );
    }
    if (typeof vscode.workspace.onDidCreateFiles === 'function') {
      context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(() => {
          if (panelProvider) panelProvider.refresh();
        })
      );
    }
    if (typeof vscode.workspace.onDidDeleteFiles === 'function') {
      context.subscriptions.push(
        vscode.workspace.onDidDeleteFiles(() => {
          if (panelProvider) panelProvider.refresh();
        })
      );
    }
  }

  log('WORKSTATION GITHUB PANEL ACTIVATED');
}

function deactivate() {
  nativeGitApi = undefined;
  if (terminalRefreshTimer) {
    clearTimeout(terminalRefreshTimer);
    terminalRefreshTimer = null;
  }
  if (panelProvider) {
    if (panelProvider._refreshTimer) {
      clearTimeout(panelProvider._refreshTimer);
      panelProvider._refreshTimer = null;
    }
    if (Array.isArray(panelProvider._viewDisposables)) {
      for (const d of panelProvider._viewDisposables) {
        try { d.dispose(); } catch (_) {}
      }
      panelProvider._viewDisposables = [];
    }
    panelProvider = null;
  }
  for (const d of disposables) {
    try { d.dispose(); } catch (_) {}
  }
  disposables = [];
}

module.exports = {
  activate,
  deactivate,
  GithubPanelProvider,
  collectState,
  getDetailedBranches,
  detectDefaultBranch,
  findSafeSwitchTarget,
  checkSecretFiles,
  parsePorcelainZ,
  parseGitHubRemote,
  selectedChangedFiles,
  expandSelectedPaths,
  getChangedFiles,
  getConflictFiles,
  countUnmergedCommits,
  gitExec,
  formatFiles,
};
