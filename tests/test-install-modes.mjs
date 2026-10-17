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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-install-mode-'));
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

test('Ordinary update deliberately reapplies managed settings.json defaults requested by the user', t => {
  const f = fixture(t);
  install(f, { skipExtensions: true });
  const settings = JSON.parse(fs.readFileSync(f.env.settingsJson));
  settings['editor.fontSize'] = 37;
  settings['workbench.colorTheme'] = 'A personal theme';
  settings['editor.inlineSuggest.enabled'] = true;
  settings['personal.unmanaged.setting'] = 'RETAIN';
  write(f.env.settingsJson, JSON.stringify(settings));
  install(f, { skipExtensions: true });
  const after = JSON.parse(fs.readFileSync(f.env.settingsJson));
  const expected = expectedSettings(f.env);
  assert.equal(after['editor.fontSize'], expected['editor.fontSize']);
  assert.equal(after['workbench.colorTheme'], expected['workbench.colorTheme']);
  assert.equal(after['editor.inlineSuggest.enabled'], false);
  assert.equal(after['personal.unmanaged.setting'], 'RETAIN');
});

test('Lite installation persists its requirements and retains an existing optional extension and project files', t => {
  const f = fixture(t);
  const existing = path.join(f.env.extensionsDir, 'ms-mssql.mssql-1.46.0');
  const bytes = 'EXISTING OPTIONAL EXTENSION';
  write(path.join(existing, 'retained.txt'), bytes);
  write(path.join(f.env.extensionsDir, 'extensions.json'), JSON.stringify([
    { identifier: { id: 'ms-mssql.mssql' }, version: '1.46.0', relativeLocation: path.basename(existing) },
  ]));
  const projectFile = path.join(f.root, 'Existing project/src/App.tsx');
  write(projectFile, 'export const App = () => null;');
  install(f, { extensionProfile: 'lite' });
  assert.equal(fs.readFileSync(path.join(existing, 'retained.txt'), 'utf8'), bytes);
  const registered = JSON.parse(fs.readFileSync(path.join(f.env.extensionsDir, 'extensions.json')));
  assert.ok(registered.some(extension => extension.identifier.id === 'ms-mssql.mssql'));
  assert.equal(fs.readFileSync(projectFile, 'utf8'), 'export const App = () => null;');
  const selected = JSON.parse(fs.readFileSync(path.join(f.env.geminiConfigDir, 'mansur-setup/install-options.json')));
  assert.equal(selected.extensionProfile, 'lite');
  const settings = JSON.parse(fs.readFileSync(f.env.settingsJson));
  assert.equal(settings['editor.inlineSuggest.enabled'], false);
  assert.equal(settings['typescript.suggest.autoImports'], true);
});
