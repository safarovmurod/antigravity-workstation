import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { applyQuietCompletion, quietSettings, mergeQuietSettings } = require('../lib/quiet-completion');
const { applyEditorProfile } = require('../extensions/workstation-stability/profile.cjs');
const INLINE_KEY = 'editor.inlineSuggest.enabled';

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-quiet-completion-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = {
    settingsJson: path.join(root, 'User', 'settings.json'),
    geminiConfigDir: path.join(root, '.gemini', 'config'),
    backupsDir: path.join(root, 'backups'),
  };
  const profile = path.join(env.geminiConfigDir, 'workstation-setup', 'editor-profile.json');
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  };
  if (options.settings !== undefined) write(env.settingsJson, options.settings);
  if (options.profile !== undefined) write(profile, options.profile);
  const calls = [];
  const queue = (receivedEnv, receivedOptions) => {
    assert.equal(receivedEnv, env);
    calls.push(receivedOptions);
    return receivedOptions.dryRun ? { dryRun: true, wouldQueue: true } : { queued: true };
  };
  return { root, env, profile, calls, queue };
}

function tree(directory, relative = '') {
  const result = {};
  for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isDirectory()) Object.assign(result, tree(directory, name));
    else result[name] = fs.readFileSync(path.join(directory, name)).toString('base64');
  }
  return result;
}

test('Quiet completion overrides all personal language selectors while retaining normal completion and chat denials', () => {
  const current = {
    [INLINE_KEY]: true,
    'editor.suggestOnTriggerCharacters': true,
    'typescript.suggest.autoImports': true,
    'editor.suggest.showFiles': true,
    'chat.tools.terminal.autoApprove': { 'npm install': false, custom: true },
    'personal.setting': 'unchanged',
    '[python]': { [INLINE_KEY]: true, 'editor.tabSize': 8 },
    '[javascript][typescript]': { [INLINE_KEY]: true, 'editor.defaultFormatter': 'personal.formatter' },
  };
  const original = structuredClone(current);
  const managed = quietSettings(current);
  assert.deepEqual(managed['[python]'], { [INLINE_KEY]: false });
  assert.deepEqual(managed['[javascript][typescript]'], { [INLINE_KEY]: false });
  for (const language of ['javascript', 'javascriptreact', 'typescript', 'typescriptreact']) {
    assert.deepEqual(managed['[' + language + ']'], { [INLINE_KEY]: false });
  }
  assert.deepEqual(Object.keys(managed).filter(key => !key.startsWith('[')), [INLINE_KEY]);
  const next = mergeQuietSettings(current, managed);
  assert.equal(next[INLINE_KEY], false);
  assert.equal(next['[python]'][INLINE_KEY], false);
  assert.equal(next['[python]']['editor.tabSize'], 8);
  assert.equal(next['[javascript][typescript]']['editor.defaultFormatter'], 'personal.formatter');
  for (const key of ['editor.suggestOnTriggerCharacters', 'typescript.suggest.autoImports', 'editor.suggest.showFiles']) assert.equal(next[key], true);
  assert.deepEqual(next['chat.tools.terminal.autoApprove'], current['chat.tools.terminal.autoApprove']);
  assert.equal(next['personal.setting'], 'unchanged');
  assert.deepEqual(current, original);
  assert.deepEqual(mergeQuietSettings(next), next);
});

test('Quiet command preserves personal JSONC settings and saves the exact previous settings and full profile privately', t => {
  const beforeSettings = '\uFEFF{\r\n // Personal settings\r\n "editor.inlineSuggest.enabled": true,\r\n "editor.suggestOnTriggerCharacters": true,\r\n "typescript.suggest.autoImports": true,\r\n "chat.tools.terminal.autoApprove": {"npm install": false},\r\n "[python]": {"editor.inlineSuggest.enabled": true, "editor.tabSize": 8},\r\n "[javascript][typescript]": {"editor.inlineSuggest.enabled": true, "editor.defaultFormatter": "personal.formatter"},\r\n "personal.setting": "a,}",\r\n}\r\n';
  const oldRequest = randomUUID();
  const beforeProfile = JSON.stringify({ schema: 1, requestId: oldRequest, setupVersion: '2.1.12', locale: 'ru',
    settings: { 'chat.tools.terminal.autoApprove': { 'npm install': true }, 'editor.fontSize': 30 } }, null, 4) + '\r\n';
  const f = fixture(t, { settings: beforeSettings, profile: beforeProfile });
  const result = applyQuietCompletion(f.env, { queue: f.queue });
  assert.equal(result.success, true);
  assert.equal(result.editor.changed, true);
  assert.equal(result.editor.runtimeVerified, false);
  assert.deepEqual(f.calls, [{ dryRun: false, scope: 'completion' }]);
  const settings = JSON.parse(fs.readFileSync(f.env.settingsJson, 'utf8'));
  assert.equal(settings[INLINE_KEY], false);
  assert.equal(settings['[python]'][INLINE_KEY], false);
  assert.equal(settings['[python]']['editor.tabSize'], 8);
  assert.equal(settings['[javascript][typescript]']['editor.defaultFormatter'], 'personal.formatter');
  assert.deepEqual(settings['chat.tools.terminal.autoApprove'], { 'npm install': false });
  assert.equal(settings['personal.setting'], 'a,}');
  assert.equal(settings['editor.suggestOnTriggerCharacters'], true);
  assert.equal(settings['typescript.suggest.autoImports'], true);
  const plan = JSON.parse(fs.readFileSync(f.profile, 'utf8'));
  assert.notEqual(plan.requestId, oldRequest);
  assert.match(plan.requestId, /^[a-f0-9-]{36}$/);
  assert.equal(plan.schema, 1);
  assert.deepEqual(plan.settings, quietSettings(settings));
  assert.equal(plan.settings['chat.tools.terminal.autoApprove'], undefined);
  assert.equal(plan.settings['editor.fontSize'], undefined);
  const manifest = JSON.parse(fs.readFileSync(path.join(result.editor.backup, 'manifest.json')));
  assert.equal(manifest.format, 1);
  assert.equal(manifest.files.length, 2);
  for (const [target, original] of [[f.env.settingsJson, beforeSettings], [f.profile, beforeProfile]]) {
    const record = manifest.files.find(item => item.target === target);
    assert.equal(record.hadFile, true);
    const file = path.join(result.editor.backup, record.file);
    assert.deepEqual(fs.readFileSync(file), Buffer.from(original));
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  }
  if (process.platform !== 'win32') assert.equal(fs.statSync(result.editor.backup).mode & 0o777, 0o700);
  const afterFirst = tree(f.root);
  const repeat = applyQuietCompletion(f.env, { queue: f.queue });
  assert.equal(repeat.editor.changed, false);
  assert.equal(repeat.editor.backup, undefined);
  assert.deepEqual(tree(f.root), afterFirst);
  assert.equal(JSON.parse(fs.readFileSync(f.profile, 'utf8')).requestId, plan.requestId);
  assert.deepEqual(f.calls[1], { dryRun: false, scope: 'completion' });
});

test('Quiet dry run makes no files or backups and requests only the native completion scope', t => {
  const f = fixture(t, { settings: '{"editor.inlineSuggest.enabled":true}', profile: '{"settings":{"editor.fontSize":35}}' });
  const before = tree(f.root);
  const result = applyQuietCompletion(f.env, { dryRun: true, queue: f.queue });
  assert.equal(result.success, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.editor.saved, false);
  assert.equal(result.editor.changed, true);
  assert.equal(result.editor.backup, undefined);
  assert.deepEqual(f.calls, [{ dryRun: true, scope: 'completion' }]);
  assert.deepEqual(tree(f.root), before);
});

test('Malformed settings or profile JSON is rejected before settings writes, backups or native queueing', t => {
  for (const [settings, profile] of [
    ['{"editor.inlineSuggest.enabled":true', '{}'],
    ['{"editor.inlineSuggest.enabled":true}', '{"settings":{"chat.tools.terminal.autoApprove":'],
    ['[]', '{}'],
    ['{}', 'null'],
  ]) {
    const f = fixture(t, { settings, profile });
    const before = tree(f.root);
    assert.throws(() => applyQuietCompletion(f.env, { queue: f.queue }), /JSON|settings object/);
    assert.deepEqual(tree(f.root), before);
    assert.deepEqual(f.calls, []);
  }
});

test('Linked settings are rejected without changing their target or queueing native changes', t => {
  const f = fixture(t, { profile: '{}' });
  const personal = path.join(f.root, 'personal');
  const target = path.join(personal, 'settings.json');
  const original = '{"editor.inlineSuggest.enabled":true,"personal":"keep"}';
  fs.mkdirSync(personal);
  fs.writeFileSync(target, original);
  if (process.platform === 'win32') {
    fs.symlinkSync(personal, path.dirname(f.env.settingsJson), 'junction');
    assert.equal(fs.lstatSync(path.dirname(f.env.settingsJson)).isSymbolicLink(), true);
    t.diagnostic('Actual Windows directory junction; personal settings remain untouched');
  } else {
    fs.mkdirSync(path.dirname(f.env.settingsJson), { recursive: true });
    fs.symlinkSync(target, f.env.settingsJson);
  }
  assert.throws(() => applyQuietCompletion(f.env, { queue: f.queue }), /Linked/);
  assert.equal(fs.readFileSync(target, 'utf8'), original);
  assert.equal(fs.existsSync(f.env.backupsDir), false);
  assert.deepEqual(f.calls, []);
});

test('Missing preferences are created with quiet settings, and the backup distinguishes absent files', t => {
  const f = fixture(t);
  const result = applyQuietCompletion(f.env, { queue: f.queue });
  assert.equal(JSON.parse(fs.readFileSync(f.env.settingsJson, 'utf8'))[INLINE_KEY], false);
  const manifest = JSON.parse(fs.readFileSync(path.join(result.editor.backup, 'manifest.json')));
  assert.deepEqual(manifest.files.map(item => item.hadFile), [false, false]);
  assert.deepEqual(fs.readdirSync(result.editor.backup), ['manifest.json']);
});

test('The active editor receives only completion settings, leaving its chat policy and normal completion intact', async t => {
  const f = fixture(t, { settings: JSON.stringify({ [INLINE_KEY]: true, '[python]': { [INLINE_KEY]: true, 'editor.tabSize': 8 } }),
    profile: JSON.stringify({ settings: { 'chat.tools.terminal.autoApprove': { 'npm install': true }, 'editor.fontSize': 99 } }) });
  applyQuietCompletion(f.env, { queue: f.queue });
  const values = { [INLINE_KEY]: true, 'editor.fontSize': 15, 'editor.suggestOnTriggerCharacters': true,
    'typescript.suggest.autoImports': true, 'chat.tools.terminal.autoApprove': { 'npm install': false },
    '[python]': { [INLINE_KEY]: true, 'editor.tabSize': 8 } };
  const updates = [], state = {};
  const context = { globalState: { get(key) { return state[key]; }, async update(key, value) { state[key] = value; } } };
  const vscode = { env: { language: 'ru' }, ConfigurationTarget: { Global: 1 }, window: {}, extensions: { all: [] },
    workspace: { getConfiguration(_section, scope) { return {
      inspect(key) { return { globalValue: values[key], defaultValue: null }; },
      get(key) { return (scope ? values['[' + scope.languageId + ']']?.[key] : undefined) ?? values[key]; },
      async update(key, value, target) { assert.equal(target, 1); values[key] = value; updates.push(key); },
    }; } } };
  const result = await applyEditorProfile(vscode, context, { file: f.profile });
  assert.equal(result.status, 'applied');
  assert.equal(values[INLINE_KEY], false);
  assert.equal(values['[python]'][INLINE_KEY], false);
  assert.equal(values['[python]']['editor.tabSize'], 8);
  assert.equal(values['editor.suggestOnTriggerCharacters'], true);
  assert.equal(values['typescript.suggest.autoImports'], true);
  assert.deepEqual(values['chat.tools.terminal.autoApprove'], { 'npm install': false });
  assert.equal(values['editor.fontSize'], 15);
  assert.equal(updates.some(key => key.startsWith('chat.')), false);
  assert.equal(updates.includes('editor.fontSize'), false);
});

test('Full install disables AI in personal Python and combined selectors without discarding their indentation or chat denials', t => {
  const f = fixture(t);
  const { getEnvironmentPaths } = require('../lib/paths');
  const { runInstaller } = require('../lib/installer');
  const customRoots = { userProfile: path.join(f.root, 'Full Profile With Spaces'), gitBashPath: process.execPath };
  const env = getEnvironmentPaths(customRoots);
  const original = {
    'editor.inlineSuggest.enabled': true,
    'personal.setting': 'keep',
    'chat.tools.terminal.autoApprove': { 'npm install': false, custom: true },
    '[python]': { 'editor.inlineSuggest.enabled': true, 'editor.tabSize': 8, 'editor.insertSpaces': false },
    '[javascript][typescript]': { 'editor.inlineSuggest.enabled': true, 'editor.tabSize': 6,
      'editor.insertSpaces': false, 'editor.defaultFormatter': 'personal.formatter' },
  };
  fs.mkdirSync(path.dirname(env.settingsJson), { recursive: true });
  fs.writeFileSync(env.settingsJson, JSON.stringify(original));
  const result = runInstaller({ customRoots, repoRoot: path.resolve(import.meta.dirname, '..'),
    skipExtensions: true, skipAgentBrowser: true, skipFont: true, skipPermissions: true, log() {} });
  assert.equal(result.success, true, result.failures.join('; '));
  const settings = JSON.parse(fs.readFileSync(env.settingsJson, 'utf8'));
  assert.equal(settings[INLINE_KEY], false);
  assert.deepEqual(settings['[python]'], { ...original['[python]'], [INLINE_KEY]: false });
  assert.deepEqual(settings['[javascript][typescript]'], { ...original['[javascript][typescript]'], [INLINE_KEY]: false });
  assert.equal(settings['personal.setting'], 'keep');
  assert.equal(settings['chat.tools.terminal.autoApprove']['npm install'], false);
  assert.equal(settings['chat.tools.terminal.autoApprove'].custom, true);
  assert.equal(settings['editor.suggestOnTriggerCharacters'], true);
  assert.equal(settings['typescript.suggest.autoImports'], true);
  const plan = JSON.parse(fs.readFileSync(path.join(env.geminiConfigDir, 'workstation-setup/editor-profile.json'), 'utf8'));
  assert.deepEqual(plan.settings['[python]'], { [INLINE_KEY]: false });
  assert.deepEqual(plan.settings['[javascript][typescript]'], { [INLINE_KEY]: false });
  assert.equal(plan.settings['chat.tools.terminal.autoApprove']['npm install'], false);
});
