'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { execSync } = require('node:child_process');
const { readJsonFile } = require('./jsonc');
const { guard } = require('./owned-files');

function findBrowserRuntime(options = {}) {
  const { env = process.env, platform = process.platform, envPaths = {} } = options;
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
  const relative = platform === 'win32' ? ['chrome.exe', 'chrome-win64/chrome.exe']
    : platform === 'darwin' ? ['Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'] : ['chrome', 'chrome-linux64/chrome'];
  if (fs.existsSync(cache)) {
    for (const name of fs.readdirSync(cache).filter(name => name.startsWith('chrome-')).sort().reverse()) {
      for (const item of relative) {
        const candidate = path.join(cache, name, item);
        if (file(candidate)) return { executable: candidate, source: 'Chrome for Testing cache', configFile, config };
      }
    }
  }
  let candidates;
  if (platform === 'win32') {
    const roots = [...new Set([envPaths.localAppData || env.LOCALAPPDATA,
      envPaths.programFiles || env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean))];
    candidates = roots.flatMap(root => [
      [path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'Google Chrome'],
      [path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'Microsoft Edge']
    ]);
  } else if (platform === 'darwin') candidates = [
    ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'Google Chrome'],
    ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'Microsoft Edge']
  ];
  else candidates = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
    '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'].map(candidate => [candidate, 'system Chromium']);
  for (const [candidate, source] of candidates) {
    if (file(candidate)) return { executable: candidate, source, configFile, config, configure: true };
  }
  return null;
}

function verifyBrowserRuntime(runtime, options = {}) {
  const { run = execSync, env = process.env } = options;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-browser-check-'));
  const session = 'workstation-setup-' + randomUUID().replaceAll('-', '').slice(0, 16);
  const configFile = path.join(directory, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({ executablePath: runtime.executable,
    profile: path.join(directory, 'profile'), headed: false, idleTimeout: '10s' }));
  const prefix = `agent-browser --config "${configFile}" --session ${session} --profile "${path.join(directory, 'profile')}" --auto-connect false --headed false --json`;
  const probeEnv = { ...env, AGENT_BROWSER_SOCKET_DIR: directory };
  // Only the temporary probe ignores attachment/restore options; proxies and CA trust stay inherited.
  for (const key of ['AGENT_BROWSER_CDP', 'AGENT_BROWSER_PROVIDER', 'AGENT_BROWSER_AUTO_CONNECT',
    'AGENT_BROWSER_SESSION_NAME', 'AGENT_BROWSER_STATE']) delete probeEnv[key];
  const processOptions = { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000,
    cwd: directory, env: probeEnv };
  let opened = false, closed = false;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = JSON.parse(run(prefix + ' open about:blank', processOptions));
        if (result.success !== true || result.data?.url !== 'about:blank') throw new Error('Browser did not open the isolated test page');
        opened = true;
        break;
      } catch (error) {
        const temporary = error.code === 'ETIMEDOUT' || /timed? out|timeout/i.test(error.message || '');
        if (!temporary || attempt === 2) throw error;
        // Cold browser/daemon startup can exceed the first deadline. Close only
        // this probe, then retry the same isolated session, never a user's tab.
        try { run(prefix + ' close', { ...processOptions, timeout: 15000 }); } catch {}
      }
    }
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
    const backup = guard(envPaths.backupsDir, 'agent-browser-' + randomUUID() + '/config.json');
    fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
    fs.writeFileSync(backup, before, { mode: 0o600 });
    log('  Previous browser defaults backed up: ' + backup);
  }
  fs.mkdirSync(path.dirname(runtime.configFile), { recursive: true });
  const temporary = runtime.configFile + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify({ ...current, executablePath: runtime.executable }, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, runtime.configFile);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  log('  Browser executable saved in agent-browser user defaults.');
}

module.exports = { findBrowserRuntime, verifyBrowserRuntime, configureBrowserRuntime };
