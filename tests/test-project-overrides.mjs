import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { inspectProjectConflicts, inspectEditorRuntime, watchEditorProfile } = require('../extensions/mansur-antigravity-stability/profile.cjs');
const desired = { 'editor.inlineSuggest.enabled': false, 'editor.defaultFormatter': 'esbenp.prettier-vscode', 'editor.formatOnSave': true };
const selectorIds = key => /^(?:\[[^\[\]]+\])+$/.test(key) ? [...key.matchAll(/\[([^\]]+)\]/g)].map(match => match[1]) : [];

function fixture(t, options = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-project-overrides-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const uri = file => ({ scheme: 'file', fsPath: file, toString() { return 'file://' + file; } });
  const folders = (options.folders || [{}]).map((settings, index) => {
    const folder = path.join(base, 'folder-' + index), file = path.join(folder, '.vscode', 'settings.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, options.contents?.[index] || JSON.stringify(settings, null, 2));
    return { uri: uri(folder), name: 'folder-' + index, settings, file };
  });
  const workspaceValues = options.workspace || {};
  const workspaceFile = options.multiRoot ? uri(path.join(base, 'project.code-workspace')) : undefined;
  if (workspaceFile) fs.writeFileSync(workspaceFile.fsPath, JSON.stringify({ folders: folders.map(folder => ({ path: folder.uri.fsPath })), settings: workspaceValues }));
  const values = { ...desired, ...options.user }, updates = [], commands = new Map(), output = [], state = {};
  const context = { subscriptions: [], globalState: { get(key) { return state[key]; }, async update(key, value) { state[key] = value; } } };
  const vscode = { env: { language: 'ru' }, ConfigurationTarget: { Global: 1 }, extensions: { all: [] },
    languages: { async getLanguages() { return options.languages || ['python', 'rust', 'kotlin']; } },
    commands: { registerCommand(name, action) { commands.set(name, action); return { dispose() {} }; } },
    window: { activeTextEditor: options.activeLanguage ? { document: { uri: uri(path.join(folders[0].uri.fsPath, 'active.file')), languageId: options.activeLanguage } } : undefined },
    workspace: { workspaceFolders: folders, workspaceFile, textDocuments: options.documentLanguage ? [{ languageId: options.documentLanguage }] : [],
      getConfiguration(_section, scope) {
        const resource = scope?.uri || scope;
        const folder = folders.find(item => resource?.fsPath?.startsWith(item.uri.fsPath)) || (!options.multiRoot ? folders[0] : undefined);
        const workspaceSettings = options.multiRoot ? workspaceValues : folder?.settings || {};
        const folderSettings = options.multiRoot || options.singleFolderInspectFields ? folder?.settings || {} : {};
        const language = scope?.languageId;
        const languageValue = (settings, key) => {
          let value;
          for (const [selector, values] of Object.entries(settings)) if (selectorIds(selector).includes(language) && Object.hasOwn(values, key)) value = values[key];
          return value;
        };
        return { ...Object.fromEntries(Object.keys(values).filter(key => selectorIds(key).length).map(key => [key, values[key]])),
          inspect(key) { return { defaultValue: desired[key], globalValue: values[key], workspaceValue: workspaceSettings[key], workspaceFolderValue: folderSettings[key],
            globalLanguageValue: languageValue(values, key), workspaceLanguageValue: languageValue(workspaceSettings, key), workspaceFolderLanguageValue: languageValue(folderSettings, key),
            languageIds: [...new Set([...Object.keys(values), ...Object.keys(workspaceSettings), ...Object.keys(folderSettings)].flatMap(selectorIds))] }; },
          get(key) {
            let value = desired[key];
            for (const next of [values[key], workspaceSettings[key], folderSettings[key], languageValue(values, key), languageValue(workspaceSettings, key), languageValue(folderSettings, key)]) if (next !== undefined) value = next;
            return value;
          },
          async update(key, value, target) { assert.equal(target, 1); updates.push({ key, value }); values[key] = value; },
        };
      },
    },
  };
  const files = [...folders.map(folder => folder.file), ...(workspaceFile ? [workspaceFile.fsPath] : [])];
  const before = files.map(file => fs.readFileSync(file));
  const planFile = path.join(base, 'editor-profile.json');
  fs.writeFileSync(planFile, JSON.stringify({ schema: 1, requestId: randomUUID(), setupVersion: '2.1.14', locale: 'ru', settings: desired }));
  return { base, vscode, context, folders, values, updates, commands, output, planFile, assertUnchanged() {
    assert.deepEqual(files.map(file => fs.readFileSync(file)), before);
    assert.equal(updates.length, 0, 'Read-only inspection must not call configuration.update');
  } };
}

test('Conflict inspection covers combined selectors, every workspace folder, language APIs and exact source paths without writes', async t => {
  const f = fixture(t, { multiRoot: true, folders: [
    { '[python][rust]': { 'editor.inlineSuggest.enabled': true, 'editor.tabSize': 8 } },
    { '[rust]': { 'editor.defaultFormatter': 'rust-lang.rust-analyzer' } },
  ], workspace: { '[kotlin]': { 'editor.formatOnSave': false } }, user: { '[lua][luau]': { 'editor.inlineSuggest.enabled': true } },
  activeLanguage: 'dart', documentLanguage: 'go', languages: ['python', 'rust', 'kotlin', 'lua'] });
  const result = await inspectProjectConflicts(f.vscode, desired);
  assert.deepEqual(result.checkedLanguages, ['dart', 'go', 'kotlin', 'lua', 'luau', 'python', 'rust']);
  assert.deepEqual(result.checkedFolders, f.folders.map(folder => folder.uri.fsPath));
  for (const languageId of ['python', 'rust']) {
    assert.ok(result.conflicts.some(item => item.key === 'editor.inlineSuggest.enabled' && item.languageId === languageId
      && item.scope === 'workspace-folder' && item.source === f.folders[0].file && item.selector === '[python][rust]' && item.active && item.effective === true));
  }
  assert.ok(result.conflicts.some(item => item.key === 'editor.defaultFormatter' && item.languageId === 'rust' && item.source === f.folders[1].file && item.active));
  assert.ok(result.conflicts.some(item => item.key === 'editor.formatOnSave' && item.languageId === 'kotlin' && item.scope === 'workspace' && item.source.endsWith('project.code-workspace') && item.active));
  assert.ok(result.conflicts.some(item => item.languageId === 'luau' && item.scope === 'user-language' && item.source === null));
  assert.deepEqual(result.readErrors, []);
  f.assertUnchanged();
});

test('Single folder JSONC settings report their actual .vscode/settings.json source and preserve comments and literal commas', async t => {
  const settings = { '[python]': { 'editor.inlineSuggest.enabled': true }, 'personal.literal': 'https://host/a,}//text' };
  const f = fixture(t, { folders: [settings], contents: ['{\n// keep comment\n"[python]": { "editor.inlineSuggest.enabled": true, },\n"personal.literal": "https://host/a,}//text",\n}\n'] });
  const result = await inspectProjectConflicts(f.vscode, desired);
  assert.ok(result.conflicts.some(item => item.key === 'editor.inlineSuggest.enabled' && item.languageId === 'python'
    && item.scope === 'workspace' && item.source === f.folders[0].file && item.selector === '[python]' && item.actual === true && item.active));
  assert.deepEqual(result.readErrors, []);
  f.assertUnchanged();
});

test('Single-folder API workspaceFolderLanguageValue resolves to its actual settings file', async t => {
  const f = fixture(t, { singleFolderInspectFields: true,
    folders: [{ '[python]': { 'editor.inlineSuggest.enabled': true } }], languages: ['python'] });
  const result = await inspectProjectConflicts(f.vscode, desired);
  const active = result.conflicts.find(item => item.key === 'editor.inlineSuggest.enabled'
    && item.languageId === 'python' && item.active);
  assert.ok(active);
  assert.equal(active.scope, 'workspace-folder');
  assert.equal(active.source, f.folders[0].file);
  assert.equal(active.selector, '[python]');
  assert.equal(result.conflicts.some(item => item.active && item.source === null), false);
  f.assertUnchanged();
});

test('A shadowed project declaration is reported honestly without claiming that it controls the effective setting', async t => {
  const f = fixture(t, { folders: [{ 'editor.inlineSuggest.enabled': true }], user: { '[python]': { 'editor.inlineSuggest.enabled': false } }, languages: ['python'] });
  const result = await inspectProjectConflicts(f.vscode, desired);
  assert.ok(result.conflicts.some(item => item.key === 'editor.inlineSuggest.enabled' && item.languageId === null && item.active));
  assert.ok(!result.conflicts.some(item => item.key === 'editor.inlineSuggest.enabled' && item.languageId === 'python' && item.active));
  f.assertUnchanged();
  const multi = fixture(t, { multiRoot: true, workspace: { '[python]': { 'editor.inlineSuggest.enabled': true } },
    folders: [{ '[python]': { 'editor.inlineSuggest.enabled': false } }], languages: ['python'] });
  const shadowed = await inspectProjectConflicts(multi.vscode, desired);
  assert.ok(shadowed.conflicts.some(item => item.key === 'editor.inlineSuggest.enabled' && item.languageId === 'python'
    && item.scope === 'workspace' && item.folder === multi.folders[0].uri.fsPath && item.actual === true && item.effective === false && !item.active));
  multi.assertUnchanged();
});

test('Unreadable or malformed sources are reported without guessing source contents or changing project files', async t => {
  const f = fixture(t, { folders: [{ '[python]': { 'editor.inlineSuggest.enabled': true } }], contents: ['{ private: SECRET_NOT_IN_REPORT'] });
  const result = await inspectProjectConflicts(f.vscode, desired);
  assert.deepEqual(result.readErrors, [{ source: f.folders[0].file, error: 'settings source could not be read or parsed' }]);
  assert.ok(!JSON.stringify(result).includes('SECRET_NOT_IN_REPORT'));
  f.assertUnchanged();
});

test('Runtime inspection and the manual conflict command are read only and preserve chat permissions', async t => {
  const denials = { 'npm install': false, custom: true };
  const f = fixture(t, { folders: [{ '[python]': { 'editor.inlineSuggest.enabled': true } }], user: { 'chat.tools.terminal.autoApprove': denials } });
  const result = await inspectEditorRuntime(f.vscode, f.context, { file: f.planFile });
  assert.equal(result.runtimeSettingsRead, true);
  assert.equal(result.status, 'needs-attention');
  watchEditorProfile(f.vscode, f.context, { appendLine(line) { f.output.push(line); }, show(preserveFocus) { assert.equal(preserveFocus, true); } }, { file: f.planFile });
  const commandResult = await f.commands.get('mansurStability.inspectConflicts')();
  assert.deepEqual(commandResult, result);
  assert.ok(f.output.some(line => line.startsWith('Read-only editor settings report:')));
  assert.deepEqual(f.values['chat.tools.terminal.autoApprove'], denials);
  for (const subscription of f.context.subscriptions) subscription.dispose();
  f.assertUnchanged();
});

function recoveryModule() {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../extensions/mansur-antigravity-stability/extension.js', import.meta.url), 'utf8'), {
    module, process, setTimeout, clearTimeout, require(name) { return name === 'vscode' ? {} : require(name); },
  });
  return module.exports;
}

test('Helper recovery invokes only the persisted resume API in a bounded hidden process and preserves completion scope', async t => {
  const f = fixture(t), directory = path.join(f.base, 'automation-v2');
  fs.mkdirSync(directory);
  const request = { scope: 'completion', includeMcp: false, env: { nodeExe: process.execPath } };
  const requestFile = path.join(directory, 'request.json');
  fs.writeFileSync(requestFile, JSON.stringify(request));
  fs.writeFileSync(path.join(directory, 'setup-status.js'), '// persistent installed module');
  const calls = [], lines = [];
  const result = await recoveryModule().resumePendingSetup({ appendLine(line) { lines.push(line); } }, { directory,
    execFile(executable, args, options, callback) {
      calls.push({ executable, args, options });
      callback(null, JSON.stringify({ state: 'starting', scope: 'completion', resumed: true, applied: false, runtimeVerified: false }));
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, process.execPath);
  assert.deepEqual(Array.from(calls[0].args), [path.join(directory, 'setup-status.js'), '--resume', requestFile]);
  assert.equal(calls[0].options.timeout, 6000);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(result.scope, 'completion');
  assert.equal(result.applied, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(requestFile)), request);
  assert.ok(lines[0].includes('"resumed":true'));
  f.assertUnchanged();
});

test('Missing recovery modules and child process failures never claim the pending setup was applied', async t => {
  const f = fixture(t), directory = path.join(f.base, 'automation-v2');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'request.json'), JSON.stringify({ env: {} }));
  const lines = [], output = { appendLine(line) { lines.push(line); } };
  let invoked = false;
  const recovery = recoveryModule();
  const missing = await recovery.resumePendingSetup(output, { directory, execFile() { invoked = true; } });
  assert.equal(missing.state, 'failed');
  assert.equal(missing.applied, false);
  assert.equal(invoked, false);
  fs.writeFileSync(path.join(directory, 'setup-status.js'), '// module');
  const failed = await recovery.resumePendingSetup(output, { directory, execFile(_exe, _args, _options, callback) { callback({ code: 'ENOENT' }, ''); } });
  assert.equal(failed.state, 'failed');
  assert.equal(failed.applied, false);
  assert.equal(failed.errorCode, 'ENOENT');
  assert.equal(lines.length, 2);
});
