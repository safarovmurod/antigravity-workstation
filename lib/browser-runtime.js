'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execSync, execFileSync } = require('node:child_process');
const { readJsonFile } = require('./jsonc');
const { guard } = require('./owned-files');

function findBrowserRuntime(options = {}) {
  const { env = process.env, envPaths = {} } = options;
  const home = envPaths.userProfile || os.homedir();
  const configFile = env.AGENT_BROWSER_CONFIG || path.join(home, '.agent-browser', 'config.json');
  if (env.AGENT_BROWSER_CONFIG && !fs.existsSync(configFile)) throw new Error('Configured browser defaults file not found: ' + configFile);
  const config = fs.existsSync(configFile) ? readJsonFile(configFile, { emptyValue: {} }) : {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid browser config object: ' + configFile);
  function file(candidate) { return typeof candidate === 'string' && fs.existsSync(candidate) && fs.statSync(candidate).isFile(); }
  const explicit = env.AGENT_BROWSER_EXECUTABLE_PATH || config.executablePath;
  if (explicit !== undefined) {
    if (!file(explicit)) throw new Error('Configured browser executable not found: ' + explicit);
    return { executable: explicit, source: 'configured', configFile, config };
  }
  const cache = path.join(home, '.agent-browser', 'browsers');
  const relative = ['chrome.exe', 'chrome-win64/chrome.exe'];
  if (fs.existsSync(cache)) {
    for (const name of fs.readdirSync(cache).filter(name => name.startsWith('chrome-')).sort().reverse()) {
      for (const item of relative) {
        const candidate = path.join(cache, name, item);
        if (file(candidate)) return { executable: candidate, source: 'Chrome for Testing cache', configFile, config };
      }
    }
  }
  const roots = [...new Set([envPaths.localAppData || env.LOCALAPPDATA,
    envPaths.programFiles || env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean))];
  const candidates = roots.flatMap(root => [
    [path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'Google Chrome'],
    [path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'Microsoft Edge']
  ]);
  for (const [candidate, source] of candidates) {
    if (file(candidate)) return { executable: candidate, source, configFile, config, configure: true };
  }
  return null;
}

function verifyBrowserRuntime(runtime, options = {}) {
  const { run = execSync, env = process.env } = options;
  let session = 'workstation-setup-' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  if (process.platform === 'win32') {
    // The pinned CLI mistakes any listener on its session-hashed TCP port for its own daemon.
    session = execFileSync(process.execPath, ['-e', `
      const net = require('node:net'), crypto = require('node:crypto');
      function select(session) {
        let hash = 0;
        for (const character of session) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
        const server = net.createServer();
        server.once('error', error => {
          if (!['EADDRINUSE', 'EACCES'].includes(error.code)) throw error;
          select('workstation-setup-' + crypto.randomUUID().replaceAll('-', '').slice(0, 16));
        });
        server.listen(49152 + Math.abs(hash) % 16383, '127.0.0.1', () => {
          server.close(() => process.stdout.write(session));
        });
      }
      select(process.argv[1]);
    `, session], { encoding: 'utf8', windowsHide: true, timeout: 5000 }).trim();
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-browser-check-'));
  const configFile = path.join(directory, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({ executablePath: runtime.executable,
    profile: path.join(directory, 'profile'), headed: false, idleTimeout: '10s' }));
  const prefix = `agent-browser --config "${configFile}" --session ${session} --profile "${path.join(directory, 'profile')}" --auto-connect false --headed false --json`;
  const probeEnv = { ...env, AGENT_BROWSER_SOCKET_DIR: directory };
  for (const key of ['AGENT_BROWSER_CDP', 'AGENT_BROWSER_PROVIDER', 'AGENT_BROWSER_AUTO_CONNECT',
    'AGENT_BROWSER_SESSION_NAME', 'AGENT_BROWSER_STATE', 'AGENT_BROWSER_NAMESPACE']) delete probeEnv[key];
  const processOptions = { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000,
    cwd: directory, env: probeEnv };
  let opened = false, closed = false;
  try {
    // Unlike open, wait carries an operation timeout through the pinned CLI's socket read budget.
    const ready = JSON.parse(run(prefix + ' wait --fn true --timeout 60000', processOptions));
    if (ready.success !== true || ready.data?.result !== true) throw new Error('Browser did not become ready in the isolated session');
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = JSON.parse(run(prefix + ' open about:blank', processOptions));
        if (result.success !== true || result.data?.url !== 'about:blank') throw new Error('Browser did not open the isolated test page');
        opened = true;
        break;
      } catch (error) {
        const temporary = error.code === 'ETIMEDOUT' || /timed? out|timeout/i.test(error.message || '');
        if (!temporary || attempt === 2) throw error;
        try { run(prefix + ' close', { ...processOptions, timeout: 15000 }); } catch {}
      }
    }
  } catch (error) {
    // --json reports launch failures on stdout, which execSync omits from error.message.
    try {
      const response = JSON.parse(String(error.stdout || ''));
      if (response.success === false && typeof response.error === 'string') error.message += '; ' + response.error;
    } catch {}
    throw error;
  } finally {
    try {
      const result = JSON.parse(run(prefix + ' close', { ...processOptions, timeout: 15000 }));
      closed = result.success === true;
      if (opened && !closed) throw new Error('Browser verification session could not be closed');
    } catch (error) { if (opened) throw error; }
    finally { if (closed) fs.rmSync(directory, { recursive: true, force: true }); }
  }
  return { verified: true, executable: runtime.executable, source: runtime.source };
}

function configureBrowserRuntime(runtime, envPaths, log = console.log) {
  if (!runtime.configure) return;
  guard(path.dirname(runtime.configFile), path.basename(runtime.configFile));
  const before = fs.existsSync(runtime.configFile) ? fs.readFileSync(runtime.configFile) : null;
  const current = before ? readJsonFile(runtime.configFile, { emptyValue: {} }) : {};
  if (!current || typeof current !== 'object' || Array.isArray(current)
    || (current.executablePath && current.executablePath !== runtime.executable)) throw new Error('Browser defaults changed during verification; existing file preserved');
  if (before) {
    const backup = guard(envPaths.backupsDir, 'agent-browser-' + crypto.randomUUID() + '/config.json');
    fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
    fs.writeFileSync(backup, before, { mode: 0o600 });
    log('  Previous browser defaults backed up: ' + backup);
  }
  fs.mkdirSync(path.dirname(runtime.configFile), { recursive: true });
  const temporary = runtime.configFile + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify({ ...current, executablePath: runtime.executable }, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, runtime.configFile);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  log('  Browser executable saved in agent-browser user defaults.');
}

module.exports = { findBrowserRuntime, verifyBrowserRuntime, configureBrowserRuntime };
