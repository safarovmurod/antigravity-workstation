'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

function resumePendingSetup(output, options = {}) {
  const directory = options.directory || path.join(os.homedir(), '.gemini', 'config', 'workstation-setup', 'automation-v2');
  const request = path.join(directory, 'request.json'), script = path.join(directory, 'setup-status.js');
  if (!fs.existsSync(request)) return Promise.resolve({ skipped: 'no pending setup request' });
  return new Promise(resolve => {
    function finish(result) { output.appendLine('Pending setup recovery: ' + JSON.stringify(result)); resolve(result); }
    try {
      for (let current = request; current !== path.dirname(current); current = path.dirname(current)) {
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Linked pending setup path is unsupported');
      }
      if (!fs.existsSync(script) || fs.lstatSync(script).isSymbolicLink()) throw new Error('Persistent setup recovery module is missing or linked; rerun the current setup');
      const job = JSON.parse(fs.readFileSync(request, 'utf8'));
      let executable = options.nodeExecutable || 'node';
      if (typeof job.env?.nodeExe === 'string' && path.isAbsolute(job.env.nodeExe) && /(?:^|[\\/])node(?:\.exe)?$/i.test(job.env.nodeExe) && fs.existsSync(job.env.nodeExe)) executable = job.env.nodeExe;
      else if (process.platform === 'win32') {
        const installed = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe');
        if (fs.existsSync(installed)) executable = installed;
      }
      (options.execFile || execFile)(executable, [script, '--resume', request], { cwd: directory, encoding: 'utf8', windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 6000, maxBuffer: 128 * 1024 }, (error, stdout) => {
        let result;
        try { result = JSON.parse(stdout); } catch { /* A failed subprocess must not look applied. */ }
        if (error || !result || typeof result.state !== 'string') finish({ state: 'failed', resumed: false, applied: false,
          reason: 'Pending setup recovery could not run; rerun setup or use workstation-setup status', errorCode: error?.code || 'invalid-recovery-output' });
        else finish(result);
      });
    } catch (error) { finish({ state: 'failed', resumed: false, applied: false, reason: error.message }); }
  });
}

function activate(context) {
  const output = vscode.window.createOutputChannel('Workstation Antigravity Stability');
  let running;
  let rerun = false;
  let child;
  let timer;
  let alive = true;
  let reconnecting = false;
  let lockToken;
  const lockFile = path.join(context.globalStorageUri.fsPath, 'maintenance.lock');
  context.subscriptions.push(output);
  require('./profile.cjs').watchEditorProfile(vscode, context, output);
  // One bounded attempt per activation. The persisted module validates the old
  // request and resumes its original scope; it never creates new chat grants.
  void resumePendingSetup(output).then(result => context.globalState.update('pendingSetupRecoveryStatus', result))
    .catch(() => { if (alive) output.appendLine('Pending setup recovery status could not be saved.'); });

  function releaseLock() {
    if (!lockToken) return;
    try {
      const saved = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (saved.token === lockToken) fs.unlinkSync(lockFile);
    } catch { /* A missing lock does not affect the protected extensions. */ }
    lockToken = undefined;
  }

  function acquireLock() {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    if (fs.existsSync(lockFile)) {
      const saved = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (!Number.isInteger(saved.pid) || saved.pid <= 0 || typeof saved.token !== 'string') return false;
      let ownerIsAlive = true;
      try { process.kill(saved.pid, 0); }
      catch (error) { if (error.code === 'ESRCH') ownerIsAlive = false; }
      if (ownerIsAlive) return false;
      // Remove only the unchanged lock belonging to a process that no longer exists.
      if (JSON.parse(fs.readFileSync(lockFile, 'utf8')).token !== saved.token) return false;
      fs.unlinkSync(lockFile);
    }
    const token = crypto.randomBytes(12).toString('hex');
    try {
      fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, token }), { flag: 'wx' });
      lockToken = token;
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      throw error;
    }
  }

  function extensionsRoot() {
    const extension = vscode.extensions.getExtension('anteprimorac.html-end-tag-labels') ||
      vscode.extensions.getExtension('formulahendry.auto-rename-tag') ||
      vscode.extensions.getExtension('workstation.stability-helper');
    return path.dirname(extension ? extension.extensionPath : context.extensionPath);
  }

  function nodeExecutable() {
    if (process.platform === 'win32') {
      const installed = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe');
      if (fs.existsSync(installed)) return installed;
    }
    return 'node';
  }

  async function notify(result) {
    if (!alive) return;
    if (result.reviewRequired || result.error) {
      const details = result.targets || [];
      const signature = crypto.createHash('sha256').update(JSON.stringify({ details, error: result.error, errorCode: result.errorCode })).digest('hex');
      const notices = context.globalState.get('reviewNotices', {});
      if (notices[signature]) return;
      await context.globalState.update('reviewNotices', { ...notices, [signature]: true });
      if (!alive) return;
      const message = result.error ? 'Разработчик, санҷиши helper иҷро нашуд. Output-и helper-ро санҷ.' :
        'Разработчик, версия ё коди нави extension санҷиши алоҳида мехоҳад. Коди ношинос тағйир дода нашуд.';
      const action = await vscode.window.showWarningMessage(message, 'Show Status');
      if (alive && action === 'Show Status') output.show(true);
    } else if (result.changed) {
      const action = await vscode.window.showInformationMessage('Разработчик, ислоҳҳои маълум барқарор шуданд. Барои бор кардани коди нав window-ро аз нав кушо.', 'Reload Window', 'Show Status');
      if (!alive) return;
      if (action === 'Reload Window') await vscode.commands.executeCommand('workbench.action.reloadWindow');
      if (action === 'Show Status') output.show(true);
    }
  }

  function invokeCli(repair) {
    return new Promise((resolve) => {
      if (repair) {
        try {
          if (!acquireLock()) {
            resolve({ mode: 'repair', changed: false, reviewRequired: false, targets: [], skipped: 'another_window_is_checking' });
            return;
          }
        } catch (error) {
          resolve({ mode: 'repair', changed: false, reviewRequired: true, targets: [], error: 'maintenance_lock_unavailable', errorCode: error.code || error.name });
          return;
        }
      }
      const args = [path.join(context.extensionPath, 'maintenance.cjs'), '--extensions-dir', extensionsRoot(),
        '--backup-dir', path.join(os.homedir(), '.gemini', 'backups', 'antigravity-extension-maintenance')];
      if (repair) args.push('--repair');
      child = execFile(nodeExecutable(), args, { cwd: context.extensionPath, encoding: 'utf8', windowsHide: true, timeout: 6000, maxBuffer: 128 * 1024 }, (error, stdout) => {
        releaseLock();
        let result;
        try { result = JSON.parse(stdout); } catch { result = undefined; }
        if (!result || !Array.isArray(result.targets) || (error && !(error.code === 2 && result.reviewRequired))) {
          result = { mode: repair ? 'repair' : 'status', changed: false, reviewRequired: true, targets: [],
            error: 'maintenance_process_failed', errorCode: error && (error.code || error.name) };
        }
        resolve(result);
      });
    });
  }

  async function scan(repair, reason) {
    if (running) {
      if (repair) rerun = true;
      return running;
    }
    const current = invokeCli(repair);
    running = current;
    try {
      const result = await current;
      if (alive) {
        output.appendLine(JSON.stringify({ reason, ...result }));
        void notify(result).catch(() => { if (alive) output.appendLine('Notice could not be displayed.'); });
      }
      return result;
    } finally {
      if (running === current) running = undefined;
      child = undefined;
      if (rerun && alive) {
        rerun = false;
        schedule('queued extension change');
      }
    }
  }

  function schedule(reason) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void scan(true, reason).catch(() => { if (alive) output.appendLine('Maintenance check failed.'); });
    }, 700);
  }

  context.subscriptions.push(vscode.commands.registerCommand('workstationStability.status', async () => {
    const result = await scan(false, 'manual status');
    output.show(true);
    return result;
  }));
  context.subscriptions.push(vscode.commands.registerCommand('workstationStability.repair', async () => {
    const result = await scan(true, 'manual repair');
    output.show(true);
    return result;
  }));
  context.subscriptions.push(vscode.commands.registerCommand('workstationStability.reconnectMcp', async () => {
    if (reconnecting) return;
    reconnecting = true;
    try {
      // A restored MCP status tab can refresh old server instances during startup.
      const mcpTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs)
        .filter(tab => tab.label === 'Manage MCPs' && !tab.isDirty);
      if (mcpTabs.length && !await vscode.window.tabGroups.close(mcpTabs, true)) {
        throw new Error('MCP status tab did not close');
      }
      await vscode.commands.executeCommand('antigravity.killLanguageServerAndReloadWindow');
    }
    catch { await vscode.window.showWarningMessage('Разработчик, native MCP recovery иҷро нашуд. Output-и Antigravity-ро санҷ.'); }
    finally { reconnecting = false; }
  }));
  context.subscriptions.push(vscode.extensions.onDidChange(() => schedule('extensions changed')));
  context.subscriptions.push({ dispose() {
    alive = false;
    if (timer) clearTimeout(timer);
    if (child) child.kill();
    releaseLock();
  } });
  schedule('startup');
}

module.exports = { activate, resumePendingSetup };
