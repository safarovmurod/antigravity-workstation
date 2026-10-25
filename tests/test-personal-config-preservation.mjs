import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
  const screenshotRoot = path.join(env.geminiSkillsDir, 'in-chat-screenshot-to-code');
  for (const relative of ['SKILL.md', 'SOURCE.md', 'references/replication_instructions.md', 'references/stack_recipes.md', 'references/repo_orientation.md']) {
    assert.deepEqual(fs.readFileSync(path.join(screenshotRoot, relative)), fs.readFileSync(path.resolve(import.meta.dirname, '../skills/in-chat-screenshot-to-code', relative)));
  }
  assert.equal(fs.existsSync(path.join(env.geminiSkillsDir, '.DS_Store')), false);
  assert.equal(fs.existsSync(path.join(env.geminiSkillsDir, '__MACOSX')), false);
  for (const file of ['audit-context-inventory.cjs', 'build-corrective-checklist.cjs', 'clean-owned-comments.cjs', 'build-feature-guides.cjs'])
    assert.equal(fs.existsSync(path.join(env.geminiScriptsDir, file)), false, 'Source-only development tooling must not be globally deployed');
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
  const managed = { userSettings: { useAiCredits: true }, permissions: { allow: ['managed permission', 'managed permission'] },
    hooks: { BeforeTool: [{ matcher: 'Read', hooks: [managedHook] }] } };
  const next = mergeConfiguration(before, managed);
  assert.deepEqual(before, snapshot);
  assert.deepEqual(next.otherPlugin, before.otherPlugin);
  assert.deepEqual(next.userSettings, { personal: true, useAiCredits: true });
  assert.deepEqual(next.permissions, { allow: ['personal permission', 'managed permission'], deny: ['personal denial'] });
  assert.deepEqual(next.hooks.BeforeTool, [{ matcher: 'Read', label: 'keep metadata', hooks: [managedHook, personalHook] }]);
  assert.deepEqual(next.hooks.PersonalEvent, before.hooks.PersonalEvent);
  assert.deepEqual(mergeConfiguration(next, managed), next);
  assert.deepEqual(mergeConfiguration({}, managed), { ...managed, permissions: { allow: ['managed permission'] } });
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

test('Actual 3.0.24 installer profile migrates complete GSD1.15 to1.18, repeats and rolls back three times without losing personal settings', t => {
  const repository = path.resolve(import.meta.dirname, '..');
  const baseline = '31ee01f4fe6bcf75ff93cc56e6889a0cd9760009';
  try { execFileSync('git', ['cat-file', '-e', baseline + '^{commit}'], { cwd: repository, stdio: 'pipe' }); }
  catch { return t.skip('Exact baseline Git object is unavailable; fetch that immutable commit before claiming prior-version migration coverage'); }
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-prior-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const source = path.join(base, 'baseline'); fs.mkdirSync(source);
  const archive = execFileSync('git', ['archive', '--format=tar', baseline], { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
  const archiveFile = path.join(base, 'baseline.tar'); fs.writeFileSync(archiveFile, archive);
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/tar.exe') : 'tar';
  execFileSync(tar, ['-xf', archiveFile, '-C', source], { maxBuffer: 1024 * 1024 });
  const customRoots = { userProfile: path.join(base, 'User with spaces'), gitBashPath: process.execPath };
  const env = require('../lib/paths').getEnvironmentPaths(customRoots);
  const options = { customRoots, skipExtensions: true, skipAgentBrowser: true, skipFont: true, skipPermissions: true, log() {} };
  const previous = require(path.join(source, 'lib/installer.js')).runInstaller({ ...options, repoRoot: source });
  assert.equal(previous.success, true, previous.failures.join('; '));
  const runtime = path.join(env.geminiDir, 'antigravity');
  const versionFile = path.join(runtime, 'gsd-core/VERSION');
  assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '1.15.0');
  const personalRule = { scope: 'comment.personal', settings: { foreground: '#123456' } };
  const settings = JSON.parse(fs.readFileSync(env.settingsJson));
  settings['workbench.colorTheme'] = 'Default Light+';
  settings['editor.tokenColorCustomizations']['[Light+]'] = { textMateRules: [personalRule] };
  settings['editor.tokenColorCustomizations'].textMateRules = [personalRule];
  settings['foreign.setting'] = { nested: ['keep', 42] };
  fs.writeFileSync(env.settingsJson, JSON.stringify(settings, null, 3));
  const configs = [path.join(runtime, 'settings.json'), path.join(env.geminiConfigDir, 'config.json')];
  for (const file of configs) {
    const config = JSON.parse(fs.readFileSync(file)); config.foreignPlugin = { nested: { list: [1, 'keep'] } };
    fs.writeFileSync(file, JSON.stringify(config, null, 3));
  }
  const privateSkill = path.join(env.geminiSkillsDir, 'personal-fixture/SKILL.md');
  fs.mkdirSync(path.dirname(privateSkill)); fs.writeFileSync(privateSkill, 'Private fixture skill, never owned by Setup\n');
  const configBytes = [env.settingsJson, ...configs].map(file => fs.readFileSync(file));
  const roots = { 'gsd-core': path.join(runtime, 'gsd-core'), skills: env.geminiSkillsDir,
    agents: path.join(env.geminiConfigDir, 'agents'), hooks: path.join(runtime, 'hooks'), scripts: path.join(runtime, 'scripts') };
  const snapshot = () => {
    const output = {};
    function walk(directory, prefix) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name), key = prefix + '/' + entry.name;
        if (entry.isDirectory()) walk(file, key);
        else output[key] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      }
    }
    for (const [key, directory] of Object.entries(roots)) walk(directory, key);
    for (const name of ['gsd-file-manifest.json', 'gsd-install-state.json', '.gsd-profile'])
      output[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime, name))).digest('hex');
    for (const name of ['package.json', 'package-lock.json']) output['mcp-runtime/' + name] = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(env.geminiConfigDir, 'mcp-runtime', name))).digest('hex');
    return output;
  };
  const before = snapshot();
  for (let cycle = 0; cycle < 3; cycle++) {
    const updated = require('../lib/installer').runInstaller(options);
    assert.equal(updated.success, true, updated.failures.join('; '));
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '1.18.0');
    const manifest = JSON.parse(fs.readFileSync(path.join(runtime, 'gsd-file-manifest.json')));
    assert.equal(manifest.version, '1.18.0');
    for (const [relative, expected] of Object.entries(manifest.files)) {
      const slash = relative.indexOf('/'), area = relative.slice(0, slash), name = relative.slice(slash + 1);
      assert.ok(roots[area], relative);
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(roots[area], name))).digest('hex'), expected, relative);
    }
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal(require('../lib/installer').runInstaller(options).success, true);
      const current = JSON.parse(fs.readFileSync(env.settingsJson));
      assert.equal(current['workbench.colorTheme'], 'Default Light+');
      assert.deepEqual(current['foreign.setting'], settings['foreign.setting']);
      assert.deepEqual(current['editor.tokenColorCustomizations']['[Light+]'], { textMateRules: [personalRule] });
      assert.deepEqual(current['editor.tokenColorCustomizations'].textMateRules, [personalRule]);
      for (const file of configs) assert.deepEqual(JSON.parse(fs.readFileSync(file)).foreignPlugin, { nested: { list: [1, 'keep'] } });
      assert.equal(fs.readFileSync(privateSkill, 'utf8'), 'Private fixture skill, never owned by Setup\n');
    }
    require('../lib/backup').restoreBackup(updated.backupInfo.backupDir, env);
    assert.deepEqual(snapshot(), before, 'All prior runtime/skills/agents/scripts/state/lock bytes must return after rollback');
    assert.deepEqual([env.settingsJson, ...configs].map(file => fs.readFileSync(file)), configBytes);
  }
});
