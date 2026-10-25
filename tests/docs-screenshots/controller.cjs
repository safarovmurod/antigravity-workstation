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
    call(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: ' + method)); }, 20000);
        pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
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
  const editor = pages.filter(page => /Workstation documentation/i.test(page.title) || /\/workbench\.html(?:[?#]|$)/i.test(page.url));
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
    await connection.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await connection.call('Page.bringToFront');
    await pause(700);
    const result = await connection.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
    fs.writeFileSync(destination, Buffer.from(result.data, 'base64'));
    const text = await connection.call('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
    if (descriptor.name === '06-inline-after') assert.match(text.result.value, /Inline Suggest/i, 'The last image must show the ordinary inline-suggestion setting');
    const controls = await connection.call('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('button, input, [role="switch"], [role="checkbox"]')).map(element => ({ text: element.innerText || '', label: element.getAttribute('aria-label'), role: element.getAttribute('role'), checked: element.getAttribute('aria-checked'), value: element.value, context: element.parentElement?.innerText?.slice(0, 300) })).filter(element => element.label || element.checked !== null)`, returnByValue: true });
    write(destination.replace(/\.png$/, '.json'), { ...descriptor, title: page.title, url: page.url, visibleText: text.result.value, controls: controls.result.value,
      pages: pages.map(p => ({ title: p.title, url: p.url, id: p.id })) });
  } finally { connection.close(); }
}

async function disableNativeTab(port) {
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const actions = [];
  for (const page of pages.filter(p => p.type === 'page' && p.webSocketDebuggerUrl)) {
    const connection = await cdp(page.webSocketDebuggerUrl);
    try {
      const text = await connection.call('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
      if (!/Suggestions in Editor/.test(text.result.value) || !/Tab to Jump/.test(text.result.value)) continue;
      for (const label of ['Tab to Jump', 'Suggestions in Editor']) {
        const expression = `(function () {
          const label = ${JSON.stringify(label)};
          const element = Array.from(document.querySelectorAll('[role="switch"]')).find(element => {
            const box = element.getBoundingClientRect();
            if (!box.width || !box.height) return false;
            let row = element;
            for (let level = 0; row && level < 7; level++, row = row.parentElement) {
              if (row.innerText.includes(label) && row.querySelectorAll('[role="switch"]').length === 1) return true;
            }
            return false;
          });
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return { checked: element.getAttribute('aria-checked'), x: box.x + box.width / 2, y: box.y + box.height / 2 };
        })()`;
        const initial = (await connection.call('Runtime.evaluate', { expression, returnByValue: true })).result.value;
        assert.equal(initial?.checked, 'true', 'Actual native switch is on before the documented click: ' + label);
        await connection.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: initial.x, y: initial.y, button: 'left', clickCount: 1 });
        await connection.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: initial.x, y: initial.y, button: 'left', clickCount: 1 });
        await until(async () => (await connection.call('Runtime.evaluate', { expression, returnByValue: true })).result.value?.checked === 'false', label + ' native UI switch off');
        actions.push({ label, before: true, after: false, click: { x: initial.x, y: initial.y } });
      }
      return actions;
    } finally { connection.close(); }
  }
  throw new Error('Actual native Tab settings page was not found for the documented clicks');
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
  const gitFixture = require('./panel-recording.cjs').prepareFixture(directory);
  const signals = path.join(directory, 'signals');
  fs.mkdirSync(workspace, { recursive: true }); fs.mkdirSync(signals, { recursive: true }); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'example.ts'), 'const total: number = "example";\nconst visible: boolean = 42;\n\nconsole.log(total, visible);\n');
  fs.writeFileSync(path.join(workspace, 'component.ts'), 'export const WorkstationHelper = 123;\n');
  fs.writeFileSync(path.join(workspace, 'completion.ts'), 'const result = WorkstationHel');
  write(path.join(workspace, 'tsconfig.json'), { compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' }, include: ['*.ts'] });
  write(path.join(workspace, '.vscode/settings.json'), { 'editor.fontSize': 21 });
  write(path.join(env.geminiConfigDir, 'workstation-setup/editor-profile.json'), { schema: 1, requestId: require('node:crypto').randomUUID(),
    setupVersion: require(path.join(repo, 'package.json')).version, locale: 'ru', settings: { 'editor.fontSize': 20 } });
  write(env.settingsJson, { 'window.title': 'Workstation documentation', 'workbench.startupEditor': 'none', 'workbench.colorTheme': 'Default Dark Modern',
    'editor.fontSize': 20, 'editor.minimap.enabled': false, 'editor.inlineSuggest.enabled': true, 'files.autoSave': 'off',
    'security.workspace.trust.enabled': false, 'calmTypeScript.quietMode': false, 'calmTypeScript.autoSaveAfterTyping': false,
    'errorLens.followCursor': 'allLines', 'errorLens.delay': 300, 'window.zoomLevel': 0, 'window.dialogStyle': 'custom' });
  const errorLens = path.join(directory, 'errorlens.vsix');
  await require(path.join(repo, 'scripts/install-gallery-extension.cjs')).downloadExtension('usernamehw.errorlens', 'latest', errorLens,
    fetch, require(path.join(repo, 'lib/extensions')).galleryTarget({ ideRoot }));
  const manifest = read(path.join(repo, 'extensions/calm-typescript/manifest.json'));
  const stabilityVersion = require(path.join(repo, 'extensions/workstation-stability/package.json')).version;
  for (const artifact of [errorLens, path.join(repo, 'extensions/calm-typescript/calm-typescript-' + manifest.version + '.vsix'),
    path.join(repo, 'extensions/workstation-stability/workstation-stability-' + stabilityVersion + '.vsix')]) {
    execFileSync(executable, [path.join(ideRoot, 'resources/app/out/cli.js'), '--user-data-dir', path.dirname(env.userSettingsDir), '--extensions-dir', env.extensionsDir, '--install-extension', artifact, '--force'],
      { windowsHide: true, timeout: 120000, stdio: 'pipe', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  }
  const captured = [];
  const wrapper = path.join(directory, 'documentation editor CLI.cmd');
  fs.writeFileSync(wrapper, require('../windows-native-smoke/full-catalog.cjs').wrapperText(executable,
    path.join(ideRoot, 'resources/app/out/cli.js'), path.dirname(env.userSettingsDir), env.extensionsDir));
  const panelInstall = require(path.join(repo, 'lib/extensions')).installCustomGithubPanel(wrapper, env.extensionsDir,
    path.join(repo, 'extensions/git-branch-panel'), { log: console.log });
  assert.equal(panelInstall.success, true, 'Actual Git Branch Panel must be installed through the official CLI');
  const recordings = [];
  let documentedSwitches;
  async function phase(name, stages, port, activeWorkspace = workspace) {
    const log = fs.openSync(path.join(output, name + '-ide.log'), 'a');
    const child = spawn(executable, ['--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
      '--user-data-dir', path.dirname(env.userSettingsDir), '--extensions-dir', env.extensionsDir, '--remote-debugging-port=' + port,
      '--extensionDevelopmentPath=' + __dirname,
      ...(name === 'git' ? [] : ['--extensionTestsPath=' + path.join(__dirname, 'test-runner.cjs')]), '--new-window', activeWorkspace], {
      windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, USERPROFILE: env.userProfile,
        APPDATA: env.appData, LOCALAPPDATA: env.localAppData, WORKSTATION_DOCS_SIGNALS: signals, WORKSTATION_DOCS_PHASE: name,
        WORKSTATION_DOCS_GIT: gitFixture.repo }
    });
    fs.closeSync(log);
    let recording;
    let recordingDescriptor;
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
        if (descriptor.startClip) {
          recording = await require('./recording.cjs').startRecording(port, cdp, output, descriptor.startClip, descriptor.caption);
          recordingDescriptor = descriptor;
        }
        else if (recording && descriptor.caption) await recording.caption(descriptor.caption);
        await screenshot(port, descriptor, path.join(output, stage + '.png'));
        captured.push(stage);
        if (stage === '04-ai-before') documentedSwitches = await disableNativeTab(port);
        if (descriptor.clickSetting) write(path.join(output, stage + '-click.json'),
          await require('./recording.cjs').clickSetting(port, cdp, descriptor.clickSetting, true));
        if (descriptor.pressEnter) { await pause(1700); await require('./recording.cjs').enter(port, cdp); await pause(1000); }
        if (descriptor.panelAction) write(path.join(output, stage + '-action.json'),
          await require('./panel-recording.cjs').perform(descriptor.panelAction, gitFixture, port, cdp, recording, output, stage));
        if (recording) await pause(1700);
        if (descriptor.stopClip && recording) {
          recordings.push({ ...await recording.stop(), installed: recordingDescriptor.installed }); recording = undefined;
        }
        fs.writeFileSync(path.join(signals, stage + '.done'), 'captured');
      }
      await until(() => fs.existsSync(path.join(signals, name + '.complete.json')), name + ' completed');
      await until(() => child.exitCode !== null, name + ' normal IDE shutdown');
    } catch (error) {
      if (recording) try { await recording.stop(); } catch {}
      child.kill(); throw error;
    }
  }
  await phase('before', ['01-diagnostics-before', '02-diagnostics-after', '03-open-ai-settings', '04-ai-before', '05-ai-after', '06-inline-after',
    '07-calm-start', '08-calm-settings', '09-calm-after', '10-calm-completion', '11-calm-import', '12-calm-reset', '13-calm-end',
    '14-stability-start', '15-stability-inspect', '16-stability-report', '17-stability-file', '18-stability-status', '19-stability-end'], 9341);
  if (process.env.WORKSTATION_DOCS_SCOPE !== 'calm-stability') try {
    await phase('git', ['20-current-start', '21-current-view', '22-current-end', '23-new-start', '24-new-create', '25-new-end',
      '26-switch-start', '27-switch-unsaved', '28-switch-uncommitted', '29-switch-clean', '30-switch-end', '31-receive-prepare',
      '32-receive-start', '33-receive-click', '34-receive-conflict', '35-receive-resolve', '36-receive-end', '37-delete-start',
      '38-delete-unmerged', '39-delete-unsaved', '40-delete-merged', '41-delete-end', '42-pr-prepare', '43-pr-start', '44-pr-open',
      '45-pr-github', '46-pr-end'], 9341, gitFixture.repo);
  } finally { if (gitFixture.browser && gitFixture.browser.exitCode === null) gitFixture.browser.kill(); }
  write(path.join(output, 'result.json'), { passed: true, captured, recordings, documentedSwitches, commit: process.env.GITHUB_SHA,
    recordingScope: process.env.WORKSTATION_DOCS_SCOPE === 'calm-stability' ? 'calm-stability' : 'all-eight',
    allEightRecorded: process.env.WORKSTATION_DOCS_SCOPE !== 'calm-stability',
    provenance: 'Unmodified Page.captureScreenshot output from the official audited Windows Antigravity IDE, disposable GitHub-hosted profile. Calm/Stability use official extension-test mode; Git uses a normal development host because extension-test mode refuses real dialogs. Actual native confirmation dialogs must be clicked. Documentation clicks the two actual native UI switches; production installer persistence is covered by the separate Native Windows IDE smoke. No account/session is imported or created.' });
}

if (require.main === module) main(...process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { cdp, main };
