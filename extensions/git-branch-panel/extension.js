// git-branch-panel — extension.js
// Custom GitHub Explorer panel for Antigravity IDE (VS Code fork)
// Provides CURRENT, NEW BRANCH, MY BRANCH, and DELETE BRANCH blocks
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
  // The built-in Git API owns the editor's authentication/askpass integration.
  // Never copy an account token into settings, a command line or our storage.
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
        // NUL-delimited Git records include significant leading status spaces
        // and filename whitespace. Never trim machine-readable output.
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

  // 1. Prefer main
  if (localBranches.includes('main') && !toDeleteSet.has('main')) {
    return 'main';
  }
  // 2. Otherwise master
  if (localBranches.includes('master') && !toDeleteSet.has('master')) {
    return 'master';
  }
  // 3. Otherwise first existing local branch not in deletion set
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
  if (!out) return [];
  const entries = out.split('\0').filter(Boolean);
  const files = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry.length > 3) {
      files.push(entry.slice(3));
      // A rename/copy has a second, unprefixed source pathname in -z format.
      if (/[RC]/.test(entry.slice(0, 2))) index++;
    }
  }
  return files;
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

async function countUnmergedCommits(cwd, branch, baseBranch) {
  let count = 0;
  const baseRef = baseBranch ? `origin/${baseBranch}` : 'origin/main';
  try {
    const out = await gitExec(['rev-list', '--count', `${baseRef}..refs/heads/${branch}`], cwd);
    count += parseInt(out.trim(), 10) || 0;
  } catch {
    try {
      const out2 = await gitExec(['rev-list', '--count', `refs/heads/${baseBranch}..refs/heads/${branch}`], cwd);
      count += parseInt(out2.trim(), 10) || 0;
    } catch {}
  }
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
    error: null,
  };

  if (!cwd) {
    state.error = 'No workspace open';
    return state;
  }

  state.isRepo = await isGitRepo(cwd);
  if (!state.isRepo) {
    state.error = 'Not a Git repository';
    return state;
  }

  state.branch = await getCurrentBranch(cwd);
  if (!state.branch) {
    state.error = 'Detached HEAD or no branch';
    return state;
  }

  state.remote = await getRemote(cwd);
  state.defaultBranch = await detectDefaultBranch(cwd);
  state.isProtected = ['main', 'master', state.defaultBranch].includes(state.branch);

  const porcelain = await getStatus(cwd);
  state.status = porcelain;
  state.isClean = !porcelain;

  try {
    const rawGitDir = await gitExec(['rev-parse', '--git-dir'], cwd);
    const gitDir = path.isAbsolute(rawGitDir) ? rawGitDir : path.join(cwd, rawGitDir);
    state.mergeInProgress = fs.existsSync(path.join(gitDir, 'MERGE_HEAD'));
    state.rebaseInProgress =
      fs.existsSync(path.join(gitDir, 'rebase-merge')) ||
      fs.existsSync(path.join(gitDir, 'rebase-apply'));
  } catch {}

  return state;
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
    // Clean up previous view disposables if re-resolving
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
      const mutation = ['push', 'newBranch', 'switchBranch', 'deleteBranches'].includes(msg.command);
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
            await this._handlePush(msg.commitMessage);
            break;
          case 'newBranch':
            await this._handleNewBranch(msg.name);
            break;
          case 'switchBranch':
            await this._handleSwitchBranch(msg.name);
            break;
          case 'deleteBranches':
            await this._handleDeleteBranches(msg.branches);
            break;
        }
      } catch (e) {
        log(`Handler error: ${e.message}`);
        this._postMessage({ type: 'error', text: e.message });
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

  // 1. CURRENT: Commit Message + Git Push
  async _handlePush(commitMessage) {
    const cwd = getWorkspaceRoot();
    if (!cwd) throw new Error('No workspace open');

    const state = await collectState(cwd);
    if (state.error) throw new Error(state.error);
    if (state.mergeInProgress || state.rebaseInProgress) throw new Error('Finish the merge/rebase first.');
    const branch = state.branch;

    // Protection check
    if (state.isProtected) {
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

    if (!state.remote) {
      throw new Error('origin: missing. Configure the repository remote first.');
    }

    // Upstream tracking check
    let upstream = null;
    try {
      upstream = await gitExec(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd);
    } catch {}

    if (upstream && upstream !== 'origin/' + branch) {
      throw new Error(`Upstream (${upstream}) does not match origin/${branch}. Resolve tracking before Git Push.`);
    }

    const porcelain = await getStatus(cwd);

    if (porcelain) {
      // Dirty working tree requires a commit message
      const msg = typeof commitMessage === 'string' ? commitMessage.trim() : '';
      if (!msg) {
        throw new Error('Введи commit message для сохранения изменений.');
      }

      // Pre-staging secret checks
      const files = await getModifiedAndUntrackedFiles(cwd);
      const badFiles = checkSecretFiles(files);
      if (badFiles.length > 0) {
        throw new Error(`Secret file detected: ${badFiles.join(', ')}. Add to .gitignore first.`);
      }

      // Git user identity check
      try {
        await gitExec(['config', 'user.name'], cwd);
        await gitExec(['config', 'user.email'], cwd);
      } catch {
        throw new Error('Git user.name / user.email not configured. Run: git config --global user.name "Your Name"');
      }

      this._postMessage({ type: 'status', text: 'Adding files...' });
      await gitExec(['add', '--all'], cwd);

      // Post-staging secret re-check
      const staged = await gitExec(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], cwd);
      const stagedSecrets = checkSecretFiles(staged.split('\0').filter(Boolean));
      if (stagedSecrets.length > 0) {
        throw new Error('Secret file detected in index: ' + stagedSecrets.join(', '));
      }

      this._postMessage({ type: 'status', text: 'Committing...' });
      await gitExec(['commit', '-m', msg], cwd);
    } else {
      // Working tree clean: check if there are unpushed commits
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

    // Explicit source/destination push
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

    // Verify remote SHA matches local SHA
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

  // 2. NEW BRANCH: Create, Switch, and Push from Base Template
  async _handleNewBranch(name) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Branch name required');
    }
    name = name.trim();
    const cwd = getWorkspaceRoot();
    if (!cwd) throw new Error('No workspace open');

    // Git name validation
    try {
      await gitExec(['check-ref-format', '--branch', name], cwd);
    } catch {
      throw new Error(`Invalid branch name: "${name}"`);
    }

    // Dirty check: must be clean to prevent carrying over practice changes
    const porcelain = await getStatus(cwd);
    if (porcelain) {
      throw new Error('Рабочая директория содержит изменения. Сначала сделай Git Push или сохрани изменения.');
    }

    const state = await collectState(cwd);
    if (state.error) throw new Error(state.error);
    if (state.mergeInProgress || state.rebaseInProgress) throw new Error('Finish the merge/rebase first.');
    if (!state.remote) throw new Error('origin: missing');

    this._postMessage({ type: 'status', text: 'Fetching origin...' });
    try {
      await gitExec(['fetch', 'origin', '--prune'], cwd);
    } catch (err) {
      throw new Error(`Failed to fetch origin: ${err.message}`);
    }

    const branches = await getDetailedBranches(cwd, state.defaultBranch, state.branch);
    if (branches.some(b => b.name === name)) {
      throw new Error(`Branch "${name}" already exists locally or on origin.`);
    }

    const defaultBranch = state.defaultBranch || 'main';
    const baseRef = 'origin/' + defaultBranch;

    this._postMessage({ type: 'status', text: `Creating branch "${name}" from ${baseRef}...` });
    // Switch to clean branch from remote default
    try {
      await gitExec(['switch', '--no-track', '-c', name, baseRef], cwd);
    } catch {
      // Fallback if origin/default not found: local default
      await gitExec(['switch', '--no-track', '-c', name, defaultBranch], cwd);
    }

    // Initial push to origin
    this._postMessage({ type: 'status', text: `Pushing initial branch "${name}" to origin...` });
    let pushErr = null;
    try {
      await gitExec(['push', '-u', 'origin', `${name}:${name}`], cwd);
    } catch (err) {
      pushErr = err;
    }

    if (pushErr) {
      this._postMessage({
        type: 'warn',
        text: `Branch "${name}" создан локально и активен, но отправить на origin не удалось: ${pushErr.message}`,
      });
      await this._sendState();
      return;
    }

    // Verify remote SHA
    const localSHA = await getLocalSHA(cwd);
    const remoteSHA = await getRemoteSHA(cwd, name);
    if (localSHA && remoteSHA && localSHA === remoteSHA) {
      refreshTerminals();
      this._postMessage({
        type: 'branchOk',
        branch: name,
        defaultBranch,
        message: `Branch "${name}" создан от ${defaultBranch} и опубликован на origin.`,
      });
    } else {
      throw new Error(`Remote SHA verification failed for "${name}".`);
    }

    await this._sendState();
  }

  // 3. MY BRANCH: Switch branch safely
  async _handleSwitchBranch(name) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('Branch name required');
    name = name.trim();
    const cwd = getWorkspaceRoot();
    if (!cwd) throw new Error('No workspace open');

    await gitExec(['check-ref-format', '--branch', name], cwd);

    const s = await collectState(cwd);
    if (s.error) throw new Error(s.error);
    if (s.mergeInProgress || s.rebaseInProgress) throw new Error('Finish merge/rebase first');

    const branches = await getDetailedBranches(cwd, s.defaultBranch, s.branch);
    const target = branches.find(b => b.name === name);
    if (!target) throw new Error(`Branch "${name}" not found`);

    try {
      if (target.isLocal) {
        await gitExec(['switch', name], cwd);
      } else {
        await gitExec(['switch', '--track', '-c', name, `origin/${name}`], cwd);
      }
    } catch (switchErr) {
      if (switchErr.message.includes('overwritten by checkout') || switchErr.message.includes('local changes')) {
        throw new Error(`Изменения в файлах конфликтуют с веткой "${name}". Сделай Git Push или сохрани изменения перед переключением.`);
      }
      throw switchErr;
    }

    const currentBranch = await getCurrentBranch(cwd);
    if (currentBranch !== name) {
      throw new Error(`Switch verification FAILED. Current: ${currentBranch}`);
    }

    refreshTerminals();

    this._postMessage({
      type: 'switchOk',
      branch: name,
      message: `Переключено на "${name}".`,
    });

    await this._sendState();
  }

  // 4. DELETE BRANCH: Delete selected branches with safety checks
  async _handleDeleteBranches(branchesToDelete) {
    if (!Array.isArray(branchesToDelete) || branchesToDelete.length === 0) {
      throw new Error('Не выбраны ветки для удаления.');
    }

    const cwd = getWorkspaceRoot();
    if (!cwd) throw new Error('No workspace open');

    // Validate the complete request before confirming, switching, or deleting.
    for (const name of branchesToDelete) {
      if (typeof name !== 'string' || !name || name.startsWith('-')) throw new Error('Invalid branch name');
      try { await gitExec(['check-ref-format', '--branch', name], cwd); }
      catch { throw new Error(`Invalid branch name: "${name}"`); }
    }
    branchesToDelete = [...new Set(branchesToDelete)];

    const s = await collectState(cwd);
    if (s.error) throw new Error(s.error);
    if (s.mergeInProgress || s.rebaseInProgress) throw new Error('Finish the merge/rebase first.');

    const defaultBranch = s.defaultBranch || 'main';
    const forbidden = new Set(['main', 'master', defaultBranch].filter(Boolean));

    for (const b of branchesToDelete) {
      if (forbidden.has(b)) {
        throw new Error(`Ветку "${b}" удалять запрещено (защищённая ветка).`);
      }
    }

    // Confirmation 1: Overview confirmation
    const targetsDescription = branchesToDelete.join(', ');
    const confirm = await vscode.window.showWarningMessage(
      `Вы точно хотите удалить следующие ветки: ${targetsDescription}?`,
      { modal: true },
      'Удалить',
      'Отмена'
    );
    if (confirm !== 'Удалить') {
      this._postMessage({ type: 'status', text: 'Удаление отменено.' });
      return;
    }

    // If active branch is to be deleted, safely determine and switch to safe branch first
    if (branchesToDelete.includes(s.branch)) {
      const safeTarget = await findSafeSwitchTarget(cwd, branchesToDelete);
      if (!safeTarget) {
        throw new Error('Не найдена безопасная ветка для переключения перед удалением активной ветки. Удаление отменено.');
      }
      try {
        await gitExec(['switch', safeTarget], cwd);
      } catch (err) {
        throw new Error(`Не удалось переключиться на ${safeTarget} перед удалением: ${err.message}`);
      }
      const switchedBranch = await getCurrentBranch(cwd);
      if (switchedBranch !== safeTarget) {
        throw new Error(`Переключение на "${safeTarget}" не подтверждено. Удаление отменено.`);
      }
    }

    const deleted = [];
    const failed = [];

    for (const b of branchesToDelete) {
      let bSuccess = true;
      let errMsgs = [];

      // 1. Delete local branch forcefully (-D)
      try {
        await gitExec(['branch', '-D', '--', b], cwd);
      } catch (err) {
        if (!err.message.includes('not found')) {
          errMsgs.push(`local: ${err.message}`);
          bSuccess = false;
        }
      }

      // 2. Delete remote branch on origin only if remote exists
      if (s.remote) {
        try {
          await gitExec(['push', 'origin', '--delete', '--', b], cwd);
        } catch (err) {
          if (!err.message.includes('remote ref does not exist')) {
            errMsgs.push(`remote: ${err.message}`);
            bSuccess = false;
          }
        }
      }

      // 3. Delete remote-tracking reference if still present
      try {
        await gitExec(['branch', '-dr', `origin/${b}`], cwd);
      } catch {}

      if (bSuccess) {
        deleted.push(b);
      } else {
        failed.push({ name: b, error: errMsgs.join(', ') });
      }
    }

    // Fetch prune to clean remote refs
    try { await gitExec(['fetch', 'origin', '--prune'], cwd); } catch {}
    refreshTerminals();

    if (failed.length === 0) {
      this._postMessage({
        type: 'deleteOk',
        message: `Успешно удалены ветки: ${deleted.join(', ')}`,
      });
    } else {
      this._postMessage({
        type: 'deletePartial',
        message: `Удалено: ${deleted.join(', ') || 'нет'}. Ошибки: ${failed.map(f => `${f.name} (${f.error})`).join('; ')}`,
      });
    }

    await this._sendState();
  }

  _getHtml() {
    return `<!DOCTYPE html>
<html lang="en">
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
  }

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

<!-- 1. CURRENT BLOCK -->
<div class="block" id="blockCurrent">
  <div class="block-header" onclick="toggleBlock('current')">
    <div class="header-left">
      <span class="chevron" id="chevronCurrent">▼</span>
      <span>Current</span>
    </div>
    <button class="refresh-btn" onclick="event.stopPropagation(); doSyncTerminal();" title="Синхронизировать статус и терминал">🔄</button>
  </div>
  <div class="block-content" id="contentCurrent" onclick="event.stopPropagation()">
    <div class="info-box">
      <div class="branch-name" id="branchName">—</div>
      <div class="sub-text" id="remoteStatus">loading...</div>
      <div id="cleanBadge" class="clean-badge" style="display:none">✓ Clean</div>
      <div id="dirtyBadge" class="dirty-badge" style="display:none">● Changes</div>
      <div id="protectedWarning" class="protected-warning" style="display:none">
        Внимание: базовый branch (main/master). При Git Push потребуется подтверждение.
      </div>
    </div>

    <div id="pushControls">
      <div class="field-label">Commit message</div>
      <textarea id="commitInput" placeholder="Например: add login form" rows="2" onkeydown="if(event.ctrlKey && event.key==='Enter') doPush()"></textarea>
      <button class="btn btn-primary" id="pushBtn" onclick="doPush()">Git Push</button>
      <button class="btn btn-secondary" style="margin-top:5px;font-size:11px;padding:4px 8px;" onclick="doSyncTerminal()" title="Синхронизировать промпт терминала Git Bash">🔄 Синхронизировать терминал</button>
    </div>
  </div>
</div>

<!-- 2. NEW BRANCH BLOCK -->
<div class="block" id="blockNewBranch">
  <div class="block-header" onclick="toggleBlock('newBranch')">
    <div class="header-left">
      <span class="chevron" id="chevronNewBranch">▶</span>
      <span>New Branch</span>
    </div>
  </div>
  <div class="block-content" id="contentNewBranch" style="display:none" onclick="event.stopPropagation()">
    <input type="text" id="newBranchInput" placeholder="day-2" onkeydown="if(event.key==='Enter') doNewBranch()" />
    <button class="btn btn-secondary" id="newBranchBtn" onclick="doNewBranch()">Create & Push</button>
    <div class="hint-text">Новый branch создаётся из базового шаблона</div>
  </div>
</div>

<!-- 3. MY BRANCH BLOCK -->
<div class="block" id="blockMyBranch">
  <div class="block-header" onclick="toggleBlock('myBranch')">
    <div class="header-left">
      <span class="chevron" id="chevronMyBranch">▶</span>
      <span>My Branch</span>
    </div>
  </div>
  <div class="block-content" id="contentMyBranch" style="display:none" onclick="event.stopPropagation()">
    <select id="branchSelect" onchange="doSwitchBranch(this.value)"></select>
  </div>
</div>

<!-- 4. DELETE BRANCH BLOCK -->
<div class="block" id="blockDeleteBranch">
  <div class="block-header" onclick="toggleBlock('deleteBranch')">
    <div class="header-left">
      <span class="chevron" id="chevronDeleteBranch">▶</span>
      <span>Delete Branch</span>
    </div>
  </div>
  <div class="block-content" id="contentDeleteBranch" style="display:none" onclick="event.stopPropagation()">
    <div class="branch-checklist" id="deleteChecklist">
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);padding:4px;">Нет доступных веток</div>
    </div>
    <button class="btn btn-danger" id="deleteBtn" disabled onclick="doDeleteBranches()">Delete selected</button>
  </div>
</div>

<!-- Status Message -->
<div class="status-bar" id="statusBar"></div>

<script>
const vscode = acquireVsCodeApi();
let currentBranch = null;
let busy = false;
let allBranches = [];

const blockStates = {
  current: true,
  newBranch: false,
  myBranch: false,
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
  updateDeleteBtnState();
}

function updateDeleteBtnState() {
  const checkboxes = document.querySelectorAll('#deleteChecklist input[type="checkbox"]:checked');
  const btn = document.getElementById('deleteBtn');
  btn.disabled = busy || checkboxes.length === 0;
  btn.textContent = checkboxes.length > 0 ? ('Delete selected (' + checkboxes.length + ')') : 'Delete selected';
}

function doPush() {
  if (busy) return;
  const msg = document.getElementById('commitInput').value;
  setBusy(true);
  setStatus('Starting push...', 'info');
  vscode.postMessage({ command: 'push', commitMessage: msg });
}

function doNewBranch() {
  if (busy) return;
  const name = document.getElementById('newBranchInput').value.trim();
  if (!name) {
    setStatus('Enter branch name', 'err');
    return;
  }
  setBusy(true);
  setStatus('Creating branch from template...', 'info');
  vscode.postMessage({ command: 'newBranch', name });
}

function doSwitchBranch(name) {
  if (busy || !name || name === currentBranch) return;
  setBusy(true);
  setStatus('Switching to ' + name + '...', 'info');
  vscode.postMessage({ command: 'switchBranch', name });
}

function doDeleteBranches() {
  if (busy) return;
  const checked = Array.from(document.querySelectorAll('#deleteChecklist input[type="checkbox"]:checked'))
    .map(cb => cb.dataset.branch);

  if (checked.length === 0) return;
  setBusy(true);
  setStatus('Preparing deletion...', 'info');
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
    document.getElementById('protectedWarning').style.display = 'none';
    document.getElementById('pushBtn').disabled = true;
    updateBranchSelect([], null);
    updateDeleteList([], null);
    return;
  }

  document.getElementById('branchName').textContent = state.branch || '—';
  document.getElementById('remoteStatus').textContent = state.remote
    ? 'origin: connected'
    : 'origin: missing';

  document.getElementById('cleanBadge').style.display = state.isClean ? '' : 'none';
  document.getElementById('dirtyBadge').style.display = state.isClean ? 'none' : '';

  // Protected branch handling
  if (state.isProtected) {
    document.getElementById('protectedWarning').style.display = 'block';
  } else {
    document.getElementById('protectedWarning').style.display = 'none';
  }

  document.getElementById('pushBtn').disabled = busy;
  document.getElementById('commitInput').disabled = busy;

  updateBranchSelect(branches, state.branch);
  updateDeleteList(branches, state.branch);
  renderBlockStates();
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
    container.innerHTML = '<div style="font-size:11px;color:var(--vscode-descriptionForeground);padding:4px;">Нет веток для удаления</div>';
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
    nameSpan.textContent = b.name === current ? (b.name + ' (активный)') : b.name;

    const delBtn = document.createElement('button');
    delBtn.className = 'del-icon-btn';
    delBtn.title = 'Удалить ветку ' + b.name;
    delBtn.textContent = '✕';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      doDeleteSingleBranch(b.name);
    };

    row.appendChild(cb);
    row.appendChild(nameSpan);
    row.appendChild(delBtn);
    container.appendChild(row);
  }

  updateDeleteBtnState();
}

function doDeleteSingleBranch(name) {
  if (busy || !name) return;
  setBusy(true);
  setStatus('Preparing deletion...', 'info');
  vscode.postMessage({ command: 'deleteBranches', branches: [name] });
}

function doSyncTerminal() {
  vscode.postMessage({ command: 'syncTerminal' });
}

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
  countUnmergedCommits,
  gitExec,
};
