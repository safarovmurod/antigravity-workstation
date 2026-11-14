'use strict';

const vscode = require('vscode');
const { configureGit, findGitExecutable } = require('./src/git-runner');
const { GithubPanelProvider } = require('./src/panel-provider');

const PANEL_ID = 'workstationGithubPanel';
let outputChannel = null;
let provider = null;

function log(message) {
  if (!outputChannel) outputChannel = vscode.window.createOutputChannel('Workstation GitHub Panel');
  outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

// Dependency folders and git's own object store, logs and lock files change
// in bursts (npm install, fetch) and never change what the panel shows.
const NOISE = /[\\/]node_modules[\\/]|[\\/]\.git[\\/](?:objects|logs|lfs)[\\/]|[\\/]\.git[\\/].*\.lock$/;

function isNoise(uri) {
  return NOISE.test(String(uri?.fsPath || ''));
}

// Edits, branch switches and commits made in the terminal all change files in
// the working tree or in .git, so one watcher keeps the panel current.
function watchRepositoryChanges(refresh) {
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  const onChange = uri => { if (!isNoise(uri)) refresh(); };
  return [watcher, watcher.onDidCreate(onChange), watcher.onDidChange(onChange), watcher.onDidDelete(onChange)];
}

function syncIdentity() {
  provider?.syncWorkspaceIdentity().catch(error => log('Identity: ' + error.message));
}

function activate(context) {
  configureGit({ executable: findGitExecutable(vscode.workspace.getConfiguration('git').get('path')), log });
  provider = new GithubPanelProvider(vscode, context, log);
  const refresh = () => provider?.refresh();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PANEL_ID, provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand(PANEL_ID + '.refresh', refresh),
    ...watchRepositoryChanges(refresh),
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { syncIdentity(); refresh(); }),
    vscode.authentication.onDidChangeSessions(event => { if (event.provider.id === 'github') provider?.onGitHubSessionsChanged(); }),
    { dispose: () => provider?.dispose() },
  );
  syncIdentity();
}

function deactivate() {
  provider = null;
}

module.exports = { activate, deactivate, isNoise };
