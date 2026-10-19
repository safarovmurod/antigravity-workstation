'use strict';
// Explicit opt-in local GUI test. Only a newly created disposable profile is written.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const repo = path.resolve(__dirname, '../..');
const { getEnvironmentPaths } = require('../../lib/paths');
function digest(file) { return fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null; }
async function main() {
  if (process.platform !== 'win32') throw new Error('This test requires the installed Windows Antigravity IDE');
  const exe = process.env.WORKSTATION_IDE_EXE;
  const source = process.env.WORKSTATION_IDE_TEST_EXTENSIONS;
  if (!exe || !fs.existsSync(exe) || !source || !fs.existsSync(path.join(source, 'extensions.json'))) {
    throw new Error('Set WORKSTATION_IDE_EXE and WORKSTATION_IDE_TEST_EXTENSIONS to the installed IDE and a provisioned test extension directory');
  }
  const product = JSON.parse(fs.readFileSync(path.join(path.dirname(exe), 'resources/app/product.json')));
  if (!/^Antigravity(?: IDE)?$/i.test(product.nameShort)) throw new Error('The executable must belong to Antigravity IDE');
  if (fs.existsSync(path.join(path.dirname(exe), 'data'))) throw new Error('Portable IDE data would override profile isolation; use a non-portable test installation');
  const real = getEnvironmentPaths();
  const protectedFiles = [real.settingsJson, real.keybindingsJson, real.argvJson, path.join(real.extensionsDir, 'extensions.json')];
  const before = protectedFiles.map(digest);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-ide-test-'));
  const home = path.join(base, 'Test User');
  const roots = { userProfile: home, ideRoot: path.dirname(exe), cliPath: null };
  const envPaths = getEnvironmentPaths(roots);
  console.log('Isolated IDE test directory: ' + base);
  fs.cpSync(source, envPaths.extensionsDir, { recursive: true });
  const indexFile = path.join(envPaths.extensionsDir, 'extensions.json');
  const index = JSON.parse(fs.readFileSync(indexFile));
  for (const item of index) {
    const name = item.relativeLocation || path.basename(item.location.path);
    item.relativeLocation = name;
    item.location = { $mid: 1, scheme: 'file', path: path.join(envPaths.extensionsDir, name).replace(/\\/g, '/') };
  }
  fs.writeFileSync(indexFile, JSON.stringify(index));
  const result = require('../../lib/installer').runInstaller({ customRoots: roots,
    skipExtensions: true, skipAgentBrowser: true, skipFont: true, skipPermissions: true, displayName: 'IDE Test', log() {} });
  assert.equal(result.success, true, result.failures?.join('; '));
  const settings = JSON.parse(fs.readFileSync(envPaths.settingsJson));
  settings['editor.inlineSuggest.enabled'] = true;
  fs.writeFileSync(envPaths.settingsJson, JSON.stringify(settings));
  const workspace = path.join(base, 'Workspace');
  fs.mkdirSync(workspace);
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(__dirname, 'fixture', name), path.join(workspace, name));
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const dependencies = spawnSync(process.execPath, [npmCli, 'ci', '--prefix', workspace, '--ignore-scripts', '--no-audit', '--no-fund'],
    { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(dependencies.status, 0, 'Test project Oxlint installation failed: ' + dependencies.stdout + dependencies.stderr);
  for (const [name, value] of Object.entries({
    'completion.ts': 'const localVariable = 1;\nloca\nSmokeCo\n',
    'Component.ts': 'export const SmokeComponent = 42;\n',
    'native-react.tsx': 'import type * as React from "react";\nconsole.\nexport const button = <button onc />;\n',
    'validation.ts': 'export const age: number = "wrong";\n',
    'format.ts': 'const answer={value:42}\n',
    'spelling.txt': 'This qqqmispelingzzz should be reported.\n',
    'lint.ts': 'debugger;\nexport const valid = 1;\n',
    '.oxlintrc.json': JSON.stringify({ rules: { 'no-debugger': 'error' } }),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' }, include: ['*.ts', '*.tsx'] }),
  })) fs.writeFileSync(path.join(workspace, name), value);
  require('../editor-tooling-host.cjs').writeFixture(workspace);
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'extensions/calm-typescript/package.json')));
  const oldMancho = JSON.parse(fs.readFileSync(indexFile)).filter(item => item.identifier?.id === 'workstation.calm-typescript');
  for (const entry of oldMancho) {
    const folder = entry.relativeLocation;
    assert.ok(folder && !/[\\/]/.test(folder) && folder.startsWith('workstation.calm-typescript-'));
    fs.rmSync(path.join(envPaths.extensionsDir, folder), { recursive: true, force: true });
  }
  const currentIndex = JSON.parse(fs.readFileSync(indexFile)).filter(item => item.identifier?.id !== 'workstation.calm-typescript');
  fs.writeFileSync(indexFile, JSON.stringify(currentIndex));
  const workstationRegistration = spawnSync(exe, [path.join(path.dirname(exe), 'resources/app/out/cli.js'),
    '--user-data-dir=' + path.dirname(envPaths.userSettingsDir), '--extensions-dir=' + envPaths.extensionsDir,
    '--install-extension', path.join(repo, 'extensions/calm-typescript/calm-typescript-' + manifest.version + '.vsix'), '--force'],
  { env: { ...process.env, USERPROFILE: home, HOME: home, APPDATA: envPaths.appData, LOCALAPPDATA: envPaths.localAppData, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(workstationRegistration.status, 0, 'Current Mancho registration failed: ' + workstationRegistration.stdout + workstationRegistration.stderr);
  require('../editor-tooling-host.cjs').stageGitPanel(repo, envPaths.extensionsDir);
  const reports = [];
  const childEnv = { ...process.env, USERPROFILE: home, HOME: home, APPDATA: envPaths.appData,
    LOCALAPPDATA: envPaths.localAppData, VSCODE_PORTABLE: '', WORKSTATION_IDE_HOLD: process.env.WORKSTATION_IDE_HOLD || '',
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const helper = require('../../extensions/workstation-stability/package.json');
  const registration = spawnSync(exe, [path.join(path.dirname(exe), 'resources/app/out/cli.js'),
    '--user-data-dir=' + path.dirname(envPaths.userSettingsDir), '--extensions-dir=' + envPaths.extensionsDir,
    '--install-extension', path.join(repo, 'extensions/workstation-stability/workstation-stability-' + helper.version + '.vsix'), '--force'],
  { env: { ...childEnv, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(registration.status, 0, 'Current helper VSIX registration failed: ' + registration.stdout + registration.stderr);
  for (const phase of ['initial', 'reopened']) {
    const resultFile = path.join(base, phase + '.json');
    const args = ['--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
      '--user-data-dir=' + path.dirname(envPaths.userSettingsDir), '--extensions-dir=' + envPaths.extensionsDir,
      '--extensionDevelopmentPath=' + __dirname, '--locale=ru', '--new-window', workspace];
    const child = spawn(exe, args, { env: { ...childEnv, WORKSTATION_IDE_PHASE: phase, WORKSTATION_IDE_RESULT: resultFile }, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
    const status = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Isolated IDE test exceeded 240 seconds; log: ' + log.slice(-6000))); }, 240000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
    fs.writeFileSync(path.join(base, phase + '.log'), log);
    const report = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile)) : { passed: false, error: log.slice(-6000) };
    reports.push(report);
    console.log(JSON.stringify(report, null, 2));
    assert.equal(status, 0, phase + ' IDE process failed');
    assert.equal(report.passed, true, report.error);
  }
  assert.deepEqual(protectedFiles.map(digest), before, 'Real user profile remains unchanged');
  const report = { passed: true, nativeVersion: product.ideVersion, ideExecutable: exe,
    nativeMainSha256: digest(path.join(path.dirname(exe), 'resources/app/out/main.js')),
    isolatedDirectory: base, userProfileUnchanged: true, phases: reports };
  if (process.env.WORKSTATION_IDE_REPORT) fs.writeFileSync(process.env.WORKSTATION_IDE_REPORT, JSON.stringify(report, null, 2));
  console.log('Actual IDE open/reopen verification passed; real user settings unchanged.');
  // Keep this explicitly named test directory for inspectable logs; never clean a caller-supplied directory.
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
