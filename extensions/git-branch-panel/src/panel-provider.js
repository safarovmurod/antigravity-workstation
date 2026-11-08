'use strict';

const path = require('path');
const { runGit, GitError } = require('./git-runner');
const { collectState, readOriginUrl, usesGitHubIdentity } = require('./git-state');
const { PanelError, explainError } = require('./git-errors');
const { RepositoryIdentities, writeLocalIdentity, hasGitIdentity } = require('./identity');
const { renderHtml } = require('./webview-html');
const { setLanguage, tr } = require('./text');
const commitPush = require('./actions/commit-push');
const merge = require('./actions/merge');
const branches = require('./actions/branches');

const REFRESH_DELAY_MS = 300;

async function fetchFromGitHub(panel) {
  const cwd = panel.workspaceRoot();
  if (!await readOriginUrl(cwd)) return;
  panel.progress(tr('Получение данных из GitHub…', 'Fetching from GitHub…'));
  await runGit(['fetch', 'origin', '--prune'], cwd);
  panel.notice('clear');
}

async function signIn(panel) {
  const identity = await panel.identities.signIn();
  if (!identity) throw new PanelError(tr('Не удалось войти в GitHub.', 'Could not sign in to GitHub.'));
  panel.identityWritten.clear();
  panel.notice('ok', tr(`Вход в GitHub: ${identity.login}.`, `Signed in to GitHub: ${identity.login}.`));
}

// Webview command -> function(panel, message). No other command changes the repository.
const ACTIONS = {
  commit: commitPush.commit,
  push: commitPush.push,
  fixAuthor: commitPush.fixAuthorAndPush,
  syncBranch: merge.syncBranch,
  pullBranch: merge.pullBranch,
  resolveConflicts: merge.resolveConflicts,
  abortOperation: merge.abortOperation,
  newBranch: branches.newBranch,
  switchBranch: branches.switchBranch,
  deleteBranches: branches.deleteBranches,
  fetch: fetchFromGitHub,
  signIn,
};

class GithubPanelProvider {
  constructor(vscode, context = {}, log = () => {}) {
    this.vscode = vscode;
    this.log = log;
    setLanguage(vscode.env?.language);
    this.identities = new RepositoryIdentities(vscode.authentication, context.globalState);
    this.identityWritten = new Map();
    this.view = null;
    this.viewDisposables = [];
    this.busy = false;
    this.refreshTimer = null;
    this.collecting = null;
    this.refreshAgain = false;
  }

  resolveWebviewView(view) {
    this.disposeView();
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = renderHtml();
    this.viewDisposables = [
      view.webview.onDidReceiveMessage(message => this.handleMessage(message)),
      view.onDidChangeVisibility?.(() => { if (view.visible) this.refresh(); }),
      view.onDidDispose?.(() => { this.disposeView(); this.view = null; }),
    ].filter(item => item && typeof item.dispose === 'function');
  }

  disposeView() {
    for (const disposable of this.viewDisposables) {
      try { disposable.dispose(); } catch {}
    }
    this.viewDisposables = [];
  }

  dispose() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.disposeView();
    this.view = null;
  }

  async handleMessage(message) {
    const command = message?.command;
    if (command === 'ready' || command === 'refresh') return this.sendState();
    const action = Object.hasOwn(ACTIONS, command) ? ACTIONS[command] : null;
    if (!action || this.busy) return;
    this.busy = true;
    try {
      await action(this, message);
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
      await this.sendState();
    }
  }

  refresh() {
    if (!this.view) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.sendState();
    }, REFRESH_DELAY_MS);
  }

  // A refresh asked for while one is running runs again afterwards, so the
  // panel never stays on data read before the latest change.
  async sendState() {
    if (!this.view || this.busy) return;
    if (this.collecting) {
      this.refreshAgain = true;
      return this.collecting;
    }
    this.collecting = this.collectAndPost();
    try {
      await this.collecting;
    } finally {
      this.collecting = null;
    }
    if (this.refreshAgain) {
      this.refreshAgain = false;
      await this.sendState();
    }
  }

  async collectAndPost() {
    try {
      const state = await collectState(this.workspaceRootOrNull());
      state.busy = this.busy;
      this.post({ type: 'state', state });
      await this.syncIdentity(state);
    } catch (error) {
      this.showError(error);
    }
  }

  post(message) {
    this.view?.webview?.postMessage(message);
  }

  notice(level, text, extra = {}) {
    this.post({ type: 'notice', level, text, ...extra });
  }

  progress(text) {
    this.notice('info', text);
  }

  showError(error) {
    const { text, details, action } = explainError(error);
    if (!(error instanceof GitError)) this.log(details ? `${text}\n${details}` : text);
    this.notice('error', text, { details, action });
  }

  async confirm(text, button) {
    return await this.vscode.window.showWarningMessage(text, { modal: true }, button) === button;
  }

  workspaceRootOrNull() {
    const folders = this.vscode.workspace?.workspaceFolders;
    if (!folders?.length) return null;
    const document = this.vscode.window?.activeTextEditor?.document;
    const folder = document && this.vscode.workspace.getWorkspaceFolder?.(document.uri);
    return (folder || folders[0]).uri.fsPath;
  }

  workspaceRoot() {
    const cwd = this.workspaceRootOrNull();
    if (!cwd) throw new PanelError(tr('Открой папку проекта.', 'Open a project folder.'));
    return cwd;
  }

  hasUnsavedEditors(cwd) {
    return (this.vscode.workspace?.textDocuments || []).some(document => {
      if (!document.isDirty || !document.uri?.fsPath) return false;
      const relative = path.relative(cwd, document.uri.fsPath);
      return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
    });
  }

  // Called before every commit, merge and push. Returns null when git's own
  // identity is used: a repository on another server, or no GitHub identity
  // could be found but git already has user.name and user.email.
  async requireIdentity(cwd, state) {
    if (!usesGitHubIdentity(state.remote)) return null;
    const identity = await this.identities.forRepository(state.root, state.remote);
    if (!identity) {
      if (await hasGitIdentity(cwd)) return null;
      throw new PanelError(tr('Нужно войти в GitHub.', 'Sign in to GitHub first.'), { action: 'signIn' });
    }
    await writeLocalIdentity(cwd, identity);
    this.identityWritten.set(state.root, identity.email);
    return identity;
  }

  // Runs whenever a GitHub repository is opened or the account changes, so
  // commits made in the terminal carry the same identity.
  async syncIdentity(state) {
    if (!state.isRepo || !state.isGitHub) return;
    try {
      const identity = await this.identities.forRepository(state.root, state.remote);
      if (!identity || this.identityWritten.get(state.root) === identity.email) return;
      if (await writeLocalIdentity(state.cwd, identity)) this.log(`${state.root}: user.name ${identity.name}, user.email ${identity.email}`);
      this.identityWritten.set(state.root, identity.email);
    } catch (error) {
      this.log('Identity: ' + error.message);
    }
  }

  async syncWorkspaceIdentity() {
    const cwd = this.workspaceRootOrNull();
    if (cwd) await this.syncIdentity(await collectState(cwd));
  }

  onGitHubSessionsChanged() {
    this.identities.forgetSession();
    this.identityWritten.clear();
    this.syncWorkspaceIdentity().catch(error => this.log('Identity: ' + error.message));
    this.refresh();
  }
}

module.exports = { GithubPanelProvider, ACTIONS };
