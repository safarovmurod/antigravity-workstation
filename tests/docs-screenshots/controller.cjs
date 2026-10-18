'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
async function until(check, label, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await check(); if (result) return result; await pause(250); }
  throw new Error('Screenshot controller timed out: ' + label);
}

async function cdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (entry) { pending.delete(message.id); message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result); }
  });
  return {
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: ' + method)); }, 20000);
        pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); }
  };
}

async function screenshot(port, descriptor, destination) {
  const pages = await until(async () => {
    try { const response = await fetch('http://127.0.0.1:' + port + '/json/list'); return (await response.json()).filter(page => page.type === 'page'); }
    catch { return false; }
  }, 'Electron debugging target');
  const editor = pages.filter(page => /workbench|Workstation documentation/i.test(page.title + ' ' + page.url));
  let page = editor[0] || pages[0];
  if (descriptor.target === 'settings') {
    page = await until(async () => {
      const current = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      const observed = [];
      for (const candidate of current.filter(p => p.type === 'page' && p.webSocketDebuggerUrl)) {
        const probe = await cdp(candidate.webSocketDebuggerUrl);
        try {
          const visible = await probe.call('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
          observed.push({ title: candidate.title, url: candidate.url, visibleText: visible.result.value });
          write(destination.replace(/\.png$/, '-targets.json'), observed);
          if (/Tab to Jump/i.test(visible.result.value) && /Suggestions in Editor|Tab Autocomplete/i.test(visible.result.value)) return candidate;
        } finally { probe.close(); }
      }
      return false;
    }, 'the real native Tab settings page', 30000);
  }
  assert.ok(page?.webSocketDebuggerUrl, 'The actual official IDE exposes its rendered page');
  const connection = await cdp(page.webSocketDebuggerUrl);
  try {
    const window = await connection.call('Browser.getWindowForTarget');
    await connection.call('Browser.setWindowBounds', { windowId: window.windowId, bounds: { windowState: 'normal', width: 1440, height: 1000 } });
    await connection.call('Page.bringToFront');
    await pause(700);
    const result = await connection.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
    fs.writeFileSync(destination, Buffer.from(result.data, 'base64'));
    // Inspectable provenance: target and visible text are captured from the same official renderer.
    const text = await connection.call('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
    const controls = await connection.call('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('button, input, [role="switch"], [role="checkbox"]')).map(element => ({ text: element.innerText || '', label: element.getAttribute('aria-label'), role: element.getAttribute('role'), checked: element.getAttribute('aria-checked'), value: element.value, context: element.parentElement?.innerText?.slice(0, 300) })).filter(element => element.label || element.checked !== null)`, returnByValue: true });
    write(destination.replace(/\.png$/, '.json'), { ...descriptor, title: page.title, url: page.url, visibleText: text.result.value, controls: controls.result.value,
      pages: pages.map(p => ({ title: p.title, url: p.url, id: p.id })) });
  } finally { connection.close(); }
}

async function main(ideRoot, executable, directory, output) {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('Only an isolated GitHub-hosted Windows runner may run screenshot capture');
  }
  const native = require(path.join(repo, 'lib/agent-automation'));
  const { getEnvironmentPaths } = require(path.join(repo, 'lib/paths'));
  const env = getEnvironmentPaths({ userProfile: path.join(directory, 'documentation-home'), ideRoot, cliPath: executable });
  assert.equal(native.validateNative(env), null, 'Official IDE must match the audited build');
  const workspace = path.join(directory, 'example');
  const signals = path.join(directory, 'signals');
  fs.mkdirSync(workspace, { recursive: true }); fs.mkdirSync(signals, { recursive: true }); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'example.ts'), 'const total: number = "example";\nconst visible: boolean = 42;\n\nconsole.log(total, visible);\n');
  write(env.settingsJson, { 'window.title': 'Workstation documentation', 'workbench.startupEditor': 'none', 'workbench.colorTheme': 'Default Dark Modern',
    'editor.fontSize': 20, 'editor.minimap.enabled': false, 'editor.inlineSuggest.enabled': true, 'files.autoSave': 'off',
    'security.workspace.trust.enabled': false, 'calmTypeScript.quietMode': false, 'calmTypeScript.autoSaveAfterTyping': false,
    'errorLens.followCursor': 'allLines', 'errorLens.delay': 300, 'window.zoomLevel': 0 });
  const errorLens = path.join(directory, 'errorlens.vsix');
  await require(path.join(repo, 'scripts/install-gallery-extension.cjs')).downloadExtension('usernamehw.errorlens', '3.29.0', errorLens);
  const manifest = read(path.join(repo, 'extensions/calm-typescript/manifest.json'));
  for (const artifact of [errorLens, path.join(repo, 'extensions/calm-typescript/calm-typescript-' + manifest.version + '.vsix')]) {
    execFileSync(executable, [path.join(ideRoot, 'resources/app/out/cli.js'), '--user-data-dir', path.dirname(env.userSettingsDir), '--extensions-dir', env.extensionsDir, '--install-extension', artifact, '--force'],
      { windowsHide: true, timeout: 120000, stdio: 'pipe', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  }
  const captured = [];
  async function phase(name, stages, port) {
    const log = fs.openSync(path.join(output, name + '-ide.log'), 'a');
    const child = spawn(executable, ['--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
      '--user-data-dir', path.dirname(env.userSettingsDir), '--extensions-dir', env.extensionsDir, '--remote-debugging-port=' + port,
      '--extensionDevelopmentPath=' + __dirname, '--new-window', workspace], {
      windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, WORKSTATION_DOCS_SIGNALS: signals, WORKSTATION_DOCS_PHASE: name }
    });
    fs.closeSync(log);
    try {
      for (const stage of stages) {
        const file = path.join(signals, stage + '.ready.json');
        await until(() => {
          const failure = path.join(signals, 'failure.json');
          if (fs.existsSync(failure)) throw new Error(read(failure).error);
          if (child.exitCode !== null) throw new Error('IDE exited before ' + stage + ': ' + child.exitCode);
          return fs.existsSync(file);
        }, stage);
        const descriptor = read(file);
        await screenshot(port, descriptor, path.join(output, stage + '.png'));
        captured.push(stage);
        fs.writeFileSync(path.join(signals, stage + '.done'), 'captured');
      }
      await until(() => fs.existsSync(path.join(signals, name + '.complete.json')), name + ' completed');
      await until(() => child.exitCode !== null, name + ' normal IDE shutdown');
    } catch (error) {
      // Failure artifacts remain readable, and only the owned hosted-runner child is stopped.
      child.kill(); throw error;
    }
  }
  await phase('before', ['01-diagnostics-before', '02-diagnostics-after', '03-open-ai-settings', '04-ai-before'], 9341);
  await until(() => !require(path.join(repo, 'lib/mcp-permissions')).isIdeRunning(), 'all isolated IDE processes closed');
  const applied = native.update(env, { scope: 'completion' });
  assert.equal(applied.applied, true, JSON.stringify(applied));
  const settings = read(env.settingsJson);
  write(env.settingsJson, { ...settings, 'editor.inlineSuggest.enabled': false });
  await phase('after', ['05-ai-after', '06-inline-after'], 9342);
  write(path.join(output, 'result.json'), { passed: true, captured, native: applied, commit: process.env.GITHUB_SHA,
    provenance: 'Unmodified Page.captureScreenshot output from the official audited Windows Antigravity IDE, disposable GitHub-hosted profile.' });
}

if (require.main === module) main(...process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { cdp, main };
