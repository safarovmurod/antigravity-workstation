import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const { mergeConfiguration } = require('../lib/config-merge');
const { mergeSettings } = require('../lib/profile-settings');
const { mergeManagedValue } = require('../extensions/workstation-stability/profile.cjs');

test('Retiring a known exact hook preserves modified hooks, mixed foreign hooks and group metadata', () => {
  const { retireOwnedHooks } = require('../lib/config-merge');
  const old = { type: 'command', command: 'known owned command', timeout: 10 };
  const retired = { hooks: { AfterTool: [{ matcher: 'Read', hooks: [old] }] } };
  const changed = { ...old, timeout: 99 };
  const foreign = { type: 'command', command: 'foreign command' };
  const current = { hooks: { AfterTool: [{ matcher: 'Read', hooks: [old] },
    { matcher: 'Read', label: 'personal', hooks: [old, foreign] }, { matcher: 'Read', hooks: [changed] }] } };
  const next = retireOwnedHooks(current, retired, {});
  assert.deepEqual(next.hooks.AfterTool, [{ matcher: 'Read', label: 'personal', hooks: [foreign] }, { matcher: 'Read', hooks: [changed] }]);
  assert.deepEqual(retireOwnedHooks(next, retired, {}), next);
  assert.deepEqual(retireOwnedHooks(current, retired, retired), current);
});

test('Real installer preserves personal configuration through update, repeat and backup rollback', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-personal-merge-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const customRoots = { userProfile: path.join(root, 'User with spaces'), gitBashPath: process.execPath };
  const env = require('../lib/paths').getEnvironmentPaths(customRoots);
  const options = { customRoots, skipExtensions: true, skipAgentBrowser: true, skipFont: true, skipPermissions: true, log() {} };
  const run = () => {
    const result = require('../lib/installer').runInstaller(options);
    assert.equal(result.success, true, result.failures.join('; '));
    return result;
  };
  run();
  const files = [path.join(env.geminiDir, 'antigravity/settings.json'), path.join(env.geminiConfigDir, 'config.json')];
  const originals = files.map(file => {
    const value = JSON.parse(fs.readFileSync(file));
    value.personalPlugin = { nested: { list: ['original', 'keep'] } };
    value.userSettings = { ...value.userSettings, personal: { flag: true } };
    const bytes = JSON.stringify(value, null, 3);
    fs.writeFileSync(file, bytes);
    return bytes;
  });
  const updated = run();
  for (const file of files) {
    const value = JSON.parse(fs.readFileSync(file));
    assert.deepEqual(value.personalPlugin, { nested: { list: ['original', 'keep'] } });
    assert.deepEqual(value.userSettings.personal, { flag: true });
  }
  const after = files.map(file => fs.readFileSync(file, 'utf8'));
  run();
  assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), after);
  const doctor = require('../lib/doctor').runDoctor({ customRoots, log() {} });
  for (const template of ['config/antigravity-settings.json', 'config/gemini-config.json']) {
    assert.equal(doctor.checks.find(item => item.name === template).status, 'pass');
  }
  require('../lib/backup').restoreBackup(updated.backupInfo.backupDir, env);
  assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), originals);
});

test('Configuration updates preserve nested personal values, permissions and foreign hook groups and are idempotent', () => {
  const managedHook = { type: 'command', command: 'managed command', timeout: 10 };
  const personalHook = { type: 'command', command: 'personal command', timeout: 55 };
  const before = { userSettings: { personal: true, useAiCredits: false }, otherPlugin: { nested: ['keep'] },
    permissions: { allow: ['personal permission'], deny: ['personal denial'] },
    hooks: { BeforeTool: [{ matcher: 'Read', label: 'keep metadata', hooks: [{ ...managedHook, timeout: 1 }, personalHook] }],
      PersonalEvent: [{ hooks: [personalHook] }] } };
  const snapshot = structuredClone(before);
  const managed = { userSettings: { useAiCredits: true }, permissions: { allow: ['managed permission'] },
    hooks: { BeforeTool: [{ matcher: 'Read', hooks: [managedHook] }] } };
  const next = mergeConfiguration(before, managed);
  assert.deepEqual(before, snapshot);
  assert.deepEqual(next.otherPlugin, before.otherPlugin);
  assert.deepEqual(next.userSettings, { personal: true, useAiCredits: true });
  assert.deepEqual(next.permissions, { allow: ['personal permission', 'managed permission'], deny: ['personal denial'] });
  assert.deepEqual(next.hooks.BeforeTool, [{ matcher: 'Read', label: 'keep metadata', hooks: [managedHook, personalHook] }]);
  assert.deepEqual(next.hooks.PersonalEvent, before.hooks.PersonalEvent);
  assert.deepEqual(mergeConfiguration(next, managed), next);
  assert.deepEqual(mergeConfiguration({}, managed), managed);
});

test('Personal theme token rules survive installer and editor application with personal rules retaining last priority', () => {
  const ownRule = { scope: 'comment', settings: { fontStyle: 'italic' } };
  const userRule = { scope: 'comment', settings: { foreground: '#123456' } };
  const previous = { '[Light+]': { textMateRules: [userRule] }, textMateRules: [userRule],
    '[One Dark Pro]': { textMateRules: [userRule], personalSetting: true } };
  const desired = { '[One Dark Pro]': { comments: '#7F848E', textMateRules: [ownRule] } };
  const merged = mergeSettings({ 'workbench.colorTheme': 'Light+', 'editor.tokenColorCustomizations': previous },
    { 'workbench.colorTheme': 'One Dark Pro', 'editor.tokenColorCustomizations': desired });
  assert.equal(merged['workbench.colorTheme'], 'Light+');
  const tokens = merged['editor.tokenColorCustomizations'];
  assert.deepEqual(tokens['[Light+]'], previous['[Light+]']);
  assert.deepEqual(tokens.textMateRules, [userRule]);
  assert.deepEqual(tokens['[One Dark Pro]'].textMateRules, [ownRule, userRule]);
  assert.equal(tokens['[One Dark Pro]'].personalSetting, true);
  assert.deepEqual(mergeManagedValue('editor.tokenColorCustomizations', tokens, desired), tokens);
});
