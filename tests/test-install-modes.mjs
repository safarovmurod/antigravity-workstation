import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { runInstaller } = require('../lib/installer');
const { getEnvironmentPaths } = require('../lib/paths');
const { expectedSettings } = require('../lib/profile-settings');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-install-mode-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const customRoots = { userProfile: path.join(root, 'Profile with spaces'), gitBashPath: process.execPath };
  const env = getEnvironmentPaths(customRoots);
  return { root, customRoots, env };
}
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}
function install(f, extra = {}) {
  const result = runInstaller({ customRoots: f.customRoots, skipAgentBrowser: true,
    skipFont: true, skipPermissions: true, log() {}, ...extra });
  assert.equal(result.success, true, result.failures.join('; '));
  return result;
}

test('Ordinary update reapplies managed defaults while preserving the manually selected theme', t => {
  const f = fixture(t);
  install(f, { skipExtensions: true });
  const settings = JSON.parse(fs.readFileSync(f.env.settingsJson));
  settings['editor.fontSize'] = 37;
  settings['workbench.colorTheme'] = 'A personal theme';
  settings['editor.inlineSuggest.enabled'] = true;
  settings['personal.unmanaged.setting'] = 'RETAIN';
  const edited = JSON.stringify(settings);
  write(f.env.settingsJson, edited);
  const changed = install(f, { skipExtensions: true });
  assert.ok(changed.backupInfo, 'Replacing changed settings must retain the previous bytes');
  assert.equal(fs.readFileSync(path.join(changed.backupInfo.backupDir, 'settings.json'), 'utf8'), edited);
  const after = JSON.parse(fs.readFileSync(f.env.settingsJson));
  const expected = expectedSettings(f.env);
  assert.equal(after['editor.fontSize'], expected['editor.fontSize']);
  assert.equal(after['workbench.colorTheme'], 'A personal theme');
  assert.equal(after['editor.inlineSuggest.enabled'], false);
  assert.equal(after['personal.unmanaged.setting'], 'RETAIN');
});

test('Repeating installation verifies the same payload without another full backup or changed configuration writes', t => {
  const f = fixture(t);
  install(f, { skipExtensions: true });
  const watched = [f.env.settingsJson, f.env.keybindingsJson, f.env.argvJson,
    path.join(f.env.geminiDir, 'GEMINI.md'), path.join(f.env.geminiConfigDir, 'mcp_config.json'),
    path.join(f.env.geminiConfigDir, 'mcp-runtime/package-lock.json'),
    path.join(f.env.geminiSkillsDir, 'agent-browser/SKILL.md')];
  const oldTime = new Date('2020-01-01T00:00:00Z');
  for (const file of watched) fs.utimesSync(file, oldTime, oldTime);
  const before = watched.map(file => ({ bytes: fs.readFileSync(file), mtime: fs.statSync(file).mtimeMs }));
  const backups = fs.readdirSync(f.env.backupsDir).sort();
  const profileFile = path.join(f.env.geminiConfigDir, 'workstation-setup/editor-profile.json');
  const previousProfile = JSON.parse(fs.readFileSync(profileFile));
  for (let iteration = 0; iteration < 3; iteration++) {
    const repeat = install(f, { skipExtensions: true });
    assert.equal(repeat.backupInfo, null);
    assert.equal(repeat.payload.backup, null);
    assert.deepEqual(repeat.payload.changed, []);
    assert.deepEqual(fs.readdirSync(f.env.backupsDir).sort(), backups, 'An unchanged run must not grow the backup tree');
    assert.deepEqual(watched.map(file => ({ bytes: fs.readFileSync(file), mtime: fs.statSync(file).mtimeMs })), before);
  }
  const latestProfile = JSON.parse(fs.readFileSync(profileFile));
  assert.notEqual(latestProfile.requestId, previousProfile.requestId, 'A new request must still reapply the active named IDE profile');
  assert.deepEqual({ ...latestProfile, requestId: previousProfile.requestId }, previousProfile);
});

test('A changed source instruction is backed up once, replaced in place and then repeats without another snapshot', t => {
  const f = fixture(t), repoRoot = path.resolve(import.meta.dirname, '..'), source = path.join(f.root, 'source');
  for (const name of ['config', 'rules', 'resources', 'skills', 'scripts', 'agents', 'package.json']) {
    fs.cpSync(path.join(repoRoot, name), path.join(source, name), { recursive: true,
      filter: file => !file.split(path.sep).includes('node_modules') });
  }
  install(f, { skipExtensions: true, repoRoot: source });
  const instructions = path.join(f.env.geminiDir, 'GEMINI.md'), original = fs.readFileSync(instructions, 'utf8');
  const updated = original + '\nUpdated source revision for the repeat-install regression.\n';
  write(path.join(source, 'rules/GEMINI.template.md'), updated);
  const changed = install(f, { skipExtensions: true, repoRoot: source });
  assert.ok(changed.backupInfo);
  assert.equal(fs.readFileSync(path.join(changed.backupInfo.backupDir, 'GEMINI.md'), 'utf8'), original);
  assert.equal(fs.readFileSync(instructions, 'utf8'), updated);
  assert.equal(changed.payload.backup, null, 'The unchanged payload must not get another private copy');
  const backups = fs.readdirSync(f.env.backupsDir).sort();
  const repeated = install(f, { skipExtensions: true, repoRoot: source });
  assert.equal(repeated.backupInfo, null);
  assert.deepEqual(fs.readdirSync(f.env.backupsDir).sort(), backups);
  assert.equal(fs.readFileSync(instructions, 'utf8'), updated);
});

test('A profile edit made after planning is preserved instead of being overwritten by a repeat installation', t => {
  const f = fixture(t);
  install(f, { skipExtensions: true });
  const settings = JSON.parse(fs.readFileSync(f.env.settingsJson));
  settings['personal.edit.during.setup'] = 'PRESERVE';
  const edited = JSON.stringify(settings);
  let changed = false;
  assert.throws(() => install(f, { skipExtensions: true, log(line) {
    if (!changed && line.includes('[3/10] Configuring Editor Settings')) {
      write(f.env.settingsJson, edited);
      changed = true;
    }
  } }), /Profile file changed during installation.*existing changes preserved/);
  assert.equal(changed, true);
  assert.equal(fs.readFileSync(f.env.settingsJson, 'utf8'), edited);
});

test('Lite installation persists its requirements and retains an existing optional extension and project files', t => {
  const f = fixture(t);
  const existing = path.join(f.env.extensionsDir, 'foreign.optional-extension-1.46.0');
  const bytes = 'EXISTING OPTIONAL EXTENSION';
  write(path.join(existing, 'retained.txt'), bytes);
  write(path.join(f.env.extensionsDir, 'extensions.json'), JSON.stringify([
    { identifier: { id: 'foreign.optional-extension' }, version: '1.46.0', relativeLocation: path.basename(existing) },
  ]));
  const projectFile = path.join(f.root, 'Existing project/src/App.tsx');
  write(projectFile, 'export const App = () => null;');
  install(f, { extensionProfile: 'lite' });
  assert.equal(fs.readFileSync(path.join(existing, 'retained.txt'), 'utf8'), bytes);
  const registered = JSON.parse(fs.readFileSync(path.join(f.env.extensionsDir, 'extensions.json')));
  assert.ok(registered.some(extension => extension.identifier.id === 'foreign.optional-extension'));
  assert.equal(fs.readFileSync(projectFile, 'utf8'), 'export const App = () => null;');
  const selected = JSON.parse(fs.readFileSync(path.join(f.env.geminiConfigDir, 'workstation-setup/install-options.json')));
  assert.equal(selected.extensionProfile, 'lite');
  const settings = JSON.parse(fs.readFileSync(f.env.settingsJson));
  assert.equal(settings['editor.inlineSuggest.enabled'], false);
  assert.equal(settings['typescript.suggest.autoImports'], true);
});
