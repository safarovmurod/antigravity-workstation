import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getEnvironmentPaths } = require('../lib/paths.js');
const { expectedSettings, homeTemplate } = require('../lib/profile-settings.js');
const { runInstaller } = require('../lib/installer.js');
const { installCustomGithubPanel } = require('../lib/extensions.js');
const { getDefaultPaths } = require('../config/jelly-cursor/checkAndRepairJellyCursor.js');
const repoRoot = path.resolve(import.meta.dirname, '..');

function windows(files, { located = [], running = [], registered = [], env = {}, product } = {}) {
  const normalize = file => path.win32.normalize(file).toLowerCase();
  const present = new Set(files.map(normalize));
  for (const file of files) {
    const parent = path.win32.dirname(file);
    const root = path.win32.basename(parent) === 'bin' ? path.win32.dirname(parent) : parent;
    if (/^Antigravity(?: IDE)?$/i.test(path.win32.basename(root))) present.add(normalize(path.win32.join(root, 'resources/app/product.json')));
  }
  return {
    platform: 'win32',
    env: { USERPROFILE: 'C:\\Users\\Test User', APPDATA: 'C:\\Users\\Test User\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\Test User\\AppData\\Local', ProgramFiles: 'C:\\Program Files', ...env },
    existsSync: file => present.has(normalize(file)),
    readFileSync() { if (!product) throw new Error('No product metadata'); return JSON.stringify(product); },
    execFileSync(command, args) {
      if (command === 'where.exe') return args[0] === 'git.exe' ? 'D:\\Tools\\Git\\mingw64\\bin\\git.exe' : located.join('\r\n');
      assert.equal(command, 'powershell.exe');
      return JSON.stringify(args.at(-1).includes('Get-Process') ? running : registered);
    },
  };
}

for (const drive of ['C', 'D']) {
  for (const launcher of ['bin/antigravity-ide.cmd', 'bin/antigravity.cmd', 'bin/agy.cmd', 'Antigravity IDE.exe']) {
    test(`Windows ${drive}: discovers ${launcher} and keeps the user profile separate`, () => {
      const root = `${drive}:\\Custom Apps\\Antigravity IDE`;
      const cli = path.win32.join(root, launcher);
      const gitBash = 'D:\\Tools\\Git\\bin\\bash.exe';
      const io = windows([cli, gitBash], { located: [cli] });
      const env = getEnvironmentPaths({}, io);
      assert.equal(env.cliPath, cli);
      assert.equal(env.ideRoot, root);
      assert.equal(env.settingsJson, 'C:\\Users\\Test User\\AppData\\Roaming\\Antigravity IDE\\User\\settings.json');
      assert.equal(env.gitBashPath, gitBash);
      const settings = expectedSettings(env);
      assert.equal(settings['jellyCursor.workbenchHtmlPath'], root.replace(/\\/g, '/') + '/resources/app/out/vs/code/electron-browser/workbench/workbench.html');
      assert.equal(settings['terminal.integrated.profiles.windows']['Git Bash'].path, gitBash);
      const hooks = JSON.parse(homeTemplate({ ...env, nodeExe: 'D:\\Node Runtime\\node.exe' }, 'config/hooks.json'));
      const command = hooks['gsd-antigravity'].PreToolUse[0].hooks[0].command;
      assert.ok(command.startsWith('"D:/Node Runtime/node.exe" '));
      assert.ok(command.endsWith('"D:/Tools/Git/bin/bash.exe"'));
    });
  }
}

test('The running D: editor wins over an older C: installation on PATH', () => {
  const current = 'D:\\Apps\\Antigravity IDE', old = 'C:\\Program Files\\Antigravity IDE';
  const executable = path.win32.join(current, 'Antigravity IDE.exe');
  const cli = path.win32.join(current, 'bin/antigravity-ide.cmd');
  const previous = path.win32.join(old, 'bin/antigravity-ide.cmd');
  const env = getEnvironmentPaths({}, windows([executable, cli, previous], { running: [executable], located: [previous] }));
  assert.equal(env.ideRoot, current);
  assert.equal(env.cliPath, cli);
});

test('A registered D: installation is found without PATH or the default C: directory', () => {
  const root = 'D:\\Installed Apps\\Antigravity IDE';
  const cli = path.win32.join(root, 'bin/antigravity.cmd');
  const env = getEnvironmentPaths({}, windows([cli], { registered: ['"' + path.win32.join(root, 'Antigravity IDE.exe') + '",0'] }));
  assert.equal(env.ideRoot, root);
  assert.equal(env.cliPath, cli);
});

test('An unrelated agy wrapper on PATH is not mistaken for the registered IDE on D:', () => {
  const wrapper = 'C:\\Tools\\bin\\agy.cmd';
  const root = 'D:\\Apps\\Antigravity IDE';
  const cli = path.win32.join(root, 'bin/antigravity-ide.cmd');
  const env = getEnvironmentPaths({}, windows([wrapper, cli], { located: [wrapper], registered: [root] }));
  assert.equal(env.cliPath, cli);
  assert.equal(env.ideRoot, root);
});

test('A registered nested D: editor wins over an abandoned C: copy in the default folder and PATH', () => {
  const current = 'D:\\Барномаҳои ман\\Tools (current)\\My editor';
  const cli = path.win32.join(current, 'bin/antigravity-ide.cmd');
  const previous = 'C:\\Program Files\\Antigravity IDE\\bin\\antigravity-ide.cmd';
  const metadata = path.win32.join(current, 'resources/app/product.json');
  const env = getEnvironmentPaths({}, windows([cli, metadata, previous], { registered: [current], located: [previous] }));
  assert.equal(env.ideRoot, current);
  assert.equal(env.cliPath, cli);
});

test('Standard Program Files detection works on a relocated system drive', () => {
  const cli = 'D:\\Program Files\\Antigravity IDE\\bin\\antigravity-ide.cmd';
  const env = getEnvironmentPaths({}, windows([cli], { env: { ProgramFiles: 'D:\\Program Files', SystemDrive: 'D:' } }));
  assert.equal(env.cliPath, cli);
  assert.equal(env.ideRoot, 'D:\\Program Files\\Antigravity IDE');
});

test('A D: user profile and redirected APPDATA are honored with the IDE on C:', () => {
  const cli = 'C:\\Apps\\Antigravity IDE\\bin\\antigravity-ide.cmd';
  const env = getEnvironmentPaths({}, windows([cli], { located: [cli], env: { USERPROFILE: 'D:\\Users\\Test User', APPDATA: 'D:\\Roaming', LOCALAPPDATA: 'D:\\Local' } }));
  assert.equal(env.settingsJson, 'D:\\Roaming\\Antigravity IDE\\User\\settings.json');
  assert.equal(env.extensionsDir, 'D:\\Users\\Test User\\.antigravity-ide\\extensions');
  assert.equal(env.backupsDir, 'D:\\Users\\Test User\\.gemini\\backups');
  assert.equal(env.ideRoot, 'C:\\Apps\\Antigravity IDE');
});

test('An unregistered installation can use an explicit root without falling back to another drive', () => {
  const cli = 'D:\\Portable Apps\\Antigravity IDE\\bin\\agy.cmd';
  const io = windows([cli], { env: { ANTIGRAVITY_INSTALL_DIR: 'D:\\Portable Apps\\Antigravity IDE' } });
  assert.equal(getEnvironmentPaths({}, io).cliPath, cli);
  io.env.ANTIGRAVITY_INSTALL_DIR = 'D:\\Missing App';
  assert.throws(() => getEnvironmentPaths({}, io), /Antigravity executable not found/);
});

for (const drive of ['C', 'D', 'E']) {
  for (const discovery of ['running', 'located', 'registered', 'explicit']) {
    test(`${discovery} discovery accepts an arbitrary nested ${drive}: installation with Tajik letters and spaces`, () => {
      const root = `${drive}:\\Барномаҳои ман\\Tools (current)\\Editor build\\My editor`;
      const cli = path.win32.join(root, 'bin/antigravity-ide.cmd');
      const executable = path.win32.join(root, 'Antigravity IDE.exe');
      const metadata = path.win32.join(root, 'resources/app/product.json');
      const options = { product: { nameShort: 'Antigravity IDE', dataFolderName: '.antigravity-ide' } };
      if (discovery === 'running') options.running = [executable];
      if (discovery === 'located') options.located = [cli];
      if (discovery === 'registered') options.registered = ['"' + executable + '",0'];
      if (discovery === 'explicit') options.env = { ANTIGRAVITY_INSTALL_DIR: root };
      const env = getEnvironmentPaths({}, windows([cli, executable, metadata], options));
      assert.equal(env.ideRoot, root);
      assert.equal(env.cliPath, cli);
      assert.equal(env.settingsJson, 'C:\\Users\\Test User\\AppData\\Roaming\\Antigravity IDE\\User\\settings.json');
      assert.equal(env.extensionsDir, 'C:\\Users\\Test User\\.antigravity-ide\\extensions');
      assert.equal(env.argvJson, 'C:\\Users\\Test User\\.antigravity-ide\\argv.json');
    });
  }
}

test('An explicit relative or missing IDE folder never silently selects another installation', () => {
  const cli = 'C:\\Program Files\\Antigravity IDE\\bin\\antigravity-ide.cmd';
  for (const invalid of ['relative/IDE', 'D:Editor', '\\Apps\\IDE']) {
    assert.throws(() => getEnvironmentPaths({}, windows([cli], { env: { ANTIGRAVITY_INSTALL_DIR: invalid } })), /absolute installation folder/);
  }
  assert.throws(() => getEnvironmentPaths({}, windows([cli], { env: { ANTIGRAVITY_INSTALL_DIR: 'D:\\Absent IDE' } })), /executable not found/);
});

test('Closed editor discovery also queries Windows App Paths registration', () => {
  const root = 'D:\\Custom nested apps\\Муҳит\\My editor';
  const cli = path.win32.join(root, 'bin/antigravity.cmd');
  const metadata = path.win32.join(root, 'resources/app/product.json');
  const io = windows([cli, metadata]);
  const original = io.execFileSync;
  io.execFileSync = (command, args, options) => {
    if (command === 'powershell.exe' && !args.at(-1).includes('Get-Process')) {
      assert.ok(args.at(-1).includes('App Paths'));
      assert.ok(args.at(-1).includes("$key.GetValue('')"));
      return JSON.stringify([path.win32.join(root, 'Antigravity IDE.exe')]);
    }
    return original(command, args, options);
  };
  assert.equal(getEnvironmentPaths({}, io).cliPath, cli);
});

test('Profile directory names follow the detected product metadata', () => {
  const cli = 'D:\\Apps\\Antigravity\\bin\\antigravity.cmd';
  const env = getEnvironmentPaths({}, windows([cli], { located: [cli], product: { nameShort: 'Antigravity', dataFolderName: '.antigravity' } }));
  assert.equal(env.settingsJson, 'C:\\Users\\Test User\\AppData\\Roaming\\Antigravity\\User\\settings.json');
  assert.equal(env.extensionsDir, 'C:\\Users\\Test User\\.antigravity\\extensions');
  assert.equal(env.argvJson, 'C:\\Users\\Test User\\.antigravity\\argv.json');
});

for (const drive of ['C', 'D']) test(`Real filesystem install uses an IDE root on drive-${drive} and user files on drive-C`, t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-install-drive-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const ide = path.join(base, 'drive-' + drive, 'Барномаҳои ман', 'Tools (current)', 'My editor');
  const userProfile = path.join(base, 'drive-C', 'Users', 'Test User');
  const cliPath = path.join(ide, 'Antigravity IDE.exe');
  const gitBashPath = path.join(base, 'Git with spaces', 'bin', 'bash.exe');
  const workbench = path.join(ide, 'resources/app/out/vs/code/electron-sandbox/workbench/workbench.html');
  for (const [file, text] of [[cliPath, 'fixture'], [gitBashPath, 'fixture'], [workbench, '<html></html>'], [path.join(ide, 'resources/app/package.json'), '{"version":"fixture"}']]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  const customRoots = { userProfile, cliPath, gitBashPath };
  const env = getEnvironmentPaths(customRoots);
  assert.equal(env.ideRoot, ide);
  const options = { customRoots, skipExtensions: true, skipAgentBrowser: true, skipFont: true, skipPermissions: true, log() {} };
  const result = runInstaller(options);
  assert.equal(result.success, true, result.failures.join('; '));
  const settings = JSON.parse(fs.readFileSync(env.settingsJson, 'utf8'));
  assert.equal(settings['jellyCursor.workbenchHtmlPath'], workbench.replace(/\\/g, '/'));
  assert.equal(settings['typescript.validate.enable'], true);
  const jelly = getDefaultPaths({ userProfile, appData: env.appData, localAppData: env.localAppData });
  assert.equal(jelly.ideRoot, ide);
  assert.equal(jelly.workbenchHtml, workbench);
  assert.ok(fs.existsSync(path.join(userProfile, '.gemini/GEMINI.md')));
  assert.equal(fs.existsSync(path.join(env.localAppData, 'Programs/Antigravity IDE')), false);
  assert.equal(runInstaller(options).success, true);
});

test('GitHub Panel installation receives the resolved D: CLI and C: extension directory', () => {
  const cli = 'D:\\Apps\\Antigravity IDE\\bin\\antigravity-ide.cmd';
  const destination = 'C:\\Users\\Test User\\.antigravity-ide\\extensions';
  const source = path.join(repoRoot, 'extensions/git-branch-panel');
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  let launched = false;
  const result = installCustomGithubPanel(cli, destination, source, {
    platform: 'win32', log() {},
    run(command, args) {
      launched = true;
      assert.equal(command, 'powershell.exe');
      assert.equal(args[args.indexOf('-CliPath') + 1], cli);
      assert.equal(args[args.indexOf('-ExtensionsDir') + 1], destination);
      return { status: 0 };
    },
    listInstalled(received) {
      assert.equal(received, cli);
      return [{ id: manifest.publisher + '.' + manifest.name, version: manifest.version }];
    },
  });
  assert.equal(launched, true);
  assert.equal(result.success, true);
});
