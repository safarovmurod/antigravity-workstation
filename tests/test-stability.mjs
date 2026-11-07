import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { buildVsix } = require('../scripts/package-stability.cjs');
const { applyEditorProfile, vendorCompletionSettings, watchEditorProfile } = require('../extensions/workstation-stability/profile.cjs');

test('Guide player packages checked recordings and labelled animations, rejects unknown IDs and uses a script-free scoped Webview', async t => {
  const { guides, registerGuidePlayer, playerHtml } = require('../extensions/workstation-stability/guide-player.cjs');
  const { payload } = require('../scripts/package-stability.cjs');
  const { createHash } = require('node:crypto');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-guide-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const files = payload(root);
  for (const [name, bytes] of files) { fs.mkdirSync(path.dirname(path.join(base, name)), { recursive: true }); fs.writeFileSync(path.join(base, name), bytes); }
  let command, created = 0, options, html;
  const context = { extensionPath: base, subscriptions: [] };
  const vscode = { commands: { registerCommand(id, fn) { assert.equal(id, 'workstationStability.openGuide'); command = fn; return { dispose() {} }; } },
    Uri: { file: value => ({ fsPath: value }) }, ViewColumn: { One: 1 }, window: {
      showQuickPick: async () => undefined,
      createWebviewPanel(_id, _title, _column, config) {
        created++; options = config;
        return { dispose() {}, webview: { cspSource: 'https://fixture.local', asWebviewUri: uri => ({ toString: () => 'https://fixture.local/' + path.basename(uri.fsPath) }), set html(value) { html = value; } } };
      },
    } };
  registerGuidePlayer(vscode, context);
  await command(); assert.equal(created, 0);
  for (const id of ['../personal', 'https://foreign.test/video.mp4', '', {}, null]) await assert.rejects(command(id), /Unknown/);
  for (const guide of guides) {
    assert.equal(createHash('sha256').update(files.get('guide-' + guide.id + '.mp4')).digest('hex'), guide.sha256);
    assert.equal(await command(guide.id), guide.id);
    assert.equal(options.enableScripts, false);
    assert.deepEqual(options.localResourceRoots, [{ fsPath: base }]);
    assert.match(html, /<video controls preload="metadata"/);
    assert.match(html, /default-src 'none'/);
    assert.match(html, guide.kind === 'instructional' ? /not an IDE recording/ : /Actual IDE recording/);
    assert.doesNotMatch(html, /<script/);
  }
  assert.match(playerHtml('"<script>', 'https://fixture.local', '<title>'), /&quot;&lt;script&gt;/);
  const before = created;
  fs.writeFileSync(path.join(base, 'guide-stability.mp4'), 'corrupt');
  await assert.rejects(command('stability'), /checksum mismatch/);
  assert.equal(created, before);
});

function editorProfile(t, options = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-profile-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const file = path.join(base, 'editor-profile.json');
  const settings = require('../config/settings.json');
  const plan = { schema: 1, requestId: randomUUID(), setupVersion: require('../package.json').version, locale: 'ru', settings };
  fs.writeFileSync(file, JSON.stringify(plan));
  const values = { 'user.unrelated': 'KEEP', 'editor.fontSize': 9, '[typescript]': { 'editor.rulers': [120] }, ...options.values };
  const state = {}, updates = [];
  const context = { subscriptions: [], globalState: { get(key) { return state[key]; }, async update(key, value) { state[key] = value; } } };
  let failKey = options.failKey;
  const vscode = { env: { language: options.language || 'ru' }, ConfigurationTarget: { Global: 1 },
    window: {}, extensions: { all: options.extensions || [] },
    workspace: { getConfiguration(_section, scope) { return {
      ...Object.fromEntries(Object.keys(values).filter(key => key.startsWith('[')).map(key => [key, values[key]])),
      inspect(key) { return { globalValue: values[key], defaultValue: null }; },
      get(key) { return options.overrides?.[key] ?? (scope ? values['[' + scope.languageId + ']']?.[key] : undefined) ?? values[key]; },
      async update(key, value, target) {
        assert.equal(target, 1);
        if (key === failKey) throw new Error('Fixture write failure');
        values[key] = value; updates.push(key);
      },
    }; } } };
  return { plan, values, state, updates, file, context, vscode, allowWrites() { failKey = undefined; } };
}

test('A preservation request retains vendor AI completion and edits made after installer planning', async t => {
  const f = editorProfile(t, { values: { 'codeium.enableTabCompletion': true, 'editor.tabSize': 7 }, extensions: [{ packageJSON: { contributes: { configuration: { properties: { 'codeium.enableTabCompletion': { type: 'boolean' } } } } } }] });
  const plan = { ...f.plan, preserveExisting: true, settings: { 'editor.tabSize': 4 } };
  fs.writeFileSync(f.file, JSON.stringify(plan));
  const result = await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.equal(f.values['editor.tabSize'], 7);
  assert.equal(f.values['codeium.enableTabCompletion'], true);
  assert.equal(f.updates.length, 0);
  assert.deepEqual(result.preservedExisting, ['editor.tabSize', 'editor.fontSize']);
  assert.equal(f.values['editor.fontSize'], 9);
  assert.deepEqual(result.vendorCompletionSwitches, []);
});

test('A preserved English locale is accepted and does not request a Russian restart', async t => {
  const f = editorProfile(t, { language: 'en' });
  fs.writeFileSync(f.file, JSON.stringify({ ...f.plan, locale: 'en', preserveExisting: true, settings: {} }));
  const result = await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.equal(result.requestedLanguage, 'en');
  assert.equal(result.restartRequired, false);
});

test('Editor applies the whole managed profile, selects formatter/icons and keeps normal completion with AI ghost text disabled', async t => {
  const f = editorProfile(t);
  const result = await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.equal(result.status, 'applied');
  assert.deepEqual(result.failed, []);
  assert.equal(f.values['editor.defaultFormatter'], 'esbenp.prettier-vscode');
  assert.equal(f.values['workbench.iconTheme'], 'material-icon-theme');
  assert.equal(f.values['workbench.colorTheme'], 'Visual Studio Dark');
  assert.equal(f.values['workbench.colorCustomizations']['[One Dark Pro]'], undefined);
  assert.equal(f.values['editor.tokenColorCustomizations']['[One Dark Pro]'], undefined);
  assert.equal(f.values['editor.fontWeight'], '400');
  assert.equal(f.values['window.zoomLevel'], 0);
  assert.equal(f.values['files.autoSave'], 'afterDelay');
  assert.equal(f.values['calmTypeScript.typingPulse'], true);
  assert.equal(f.values['editor.inlineSuggest.enabled'], false);
  assert.equal(f.values['editor.suggestOnTriggerCharacters'], true);
  assert.equal(f.values['typescript.suggest.autoImports'], true);
  assert.equal(f.values['editor.wordBasedSuggestions'], 'off');
  assert.equal(f.values['editor.snippetSuggestions'], 'top');
  assert.equal(f.values['editor.suggest.showWords'], false);
  assert.equal(f.values['editor.suggest.showKeywords'], true);
  assert.equal(f.values['editor.suggest.showVariables'], true);
  assert.equal(f.values['editor.suggest.showFunctions'], true);
  assert.equal(f.values['editor.suggest.showClasses'], true);
  assert.equal(f.values['editor.suggest.showFiles'], true);
  assert.equal(f.values['emmet.showExpandedAbbreviation'], 'always');
  assert.deepEqual(f.values['[typescript]']['editor.rulers'], [120]);
  assert.equal(f.values['[typescript]']['editor.inlineSuggest.enabled'], false);
  assert.equal(f.values['user.unrelated'], 'KEEP');
  assert.equal(f.state.editorProfilePreviousSettings.settings.find(item => item.key === 'editor.fontSize').value, 9);
  const count = f.updates.length;
  f.values['editor.fontSize'] = 17;
  assert.match((await applyEditorProfile(f.vscode, f.context, { file: f.file })).skipped, /already applied/);
  assert.equal(f.updates.length, count);
  assert.equal(f.values['editor.fontSize'], 17);
  f.plan.requestId = randomUUID(); fs.writeFileSync(f.file, JSON.stringify(f.plan));
  await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.equal(f.values['editor.fontSize'], 17, 'A new setup request preserves the selected font size');
});

test('A new setup request preserves a manual theme while explicit Apply can restore the managed default', async t => {
  const f = editorProfile(t, { values: { 'workbench.colorTheme': 'One Dark Pro Flat', 'asterAppearance.theme': 'Nord Light' } });
  await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.equal(f.values['workbench.colorTheme'], 'One Dark Pro Flat');
  f.plan.requestId = randomUUID();
  fs.writeFileSync(f.file, JSON.stringify(f.plan));
  await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.equal(f.values['workbench.colorTheme'], 'One Dark Pro Flat');
  assert.equal(f.values['asterAppearance.theme'], 'Nord Light', 'the chosen Aster palette survives a new setup request');
  await applyEditorProfile(f.vscode, f.context, { file: f.file, force: true });
  assert.equal(f.values['workbench.colorTheme'], 'Visual Studio Dark');
  assert.equal(f.values['asterAppearance.theme'], 'One Dark Pro');
});

test('Empty Error Lens defaults preserve personal exclusion lists on active-profile apply, repeat and explicit reset', async t => {
  const personal = { 'errorLens.excludeBySource': ['personal-linter'], 'errorLens.excludeByMessage': ['^ignore$'] };
  const f = editorProfile(t, { values: personal });
  for (const force of [false, false, true]) {
    const result = await applyEditorProfile(f.vscode, f.context, { file: f.file, force });
    for (const [key, value] of Object.entries(personal)) {
      assert.deepEqual(f.values[key], value);
      assert.ok(!result.overrides?.includes(key), 'Personal lists are not a managed-default conflict');
    }
  }
});

test('Legacy React snippet refresh uses unchanged effective defaults, restores assignment and preserves a concurrent personal change', async t => {
  const { refreshReactSnippets } = require('../extensions/workstation-stability/react-snippets.cjs');
  for (const concurrent of [false, true]) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-react-refresh-'));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    fs.mkdirSync(path.join(base, 'lib/snippets'), { recursive: true });
    const file = path.join(base, 'lib/snippets/generated.json');
    const cache = imports => Object.fromEntries(['rfc', 'rafce'].map(prefix => [prefix, { prefix, body: imports ? ['import React from "react"'] : ['export default function Component() {}'] }]));
    fs.writeFileSync(file, JSON.stringify(cache(true)));
    const values = { importReactOnTop: false }, defaults = { importReactOnTop: true, languageScopes: 'javascript,typescriptreact', prettierEnabled: false, typescript: true };
    const updates = [];
    const configuration = { get: key => values[key] ?? defaults[key], inspect: key => ({ globalValue: values[key], defaultValue: defaults[key] }), async update(key, value, target) {
      assert.equal(target, 1); assert.equal(key, 'languageScopes');
      values[key] = value; updates.push(value);
      assert.equal(values[key] ?? defaults[key], defaults[key], 'Effective scope does not change during the public configuration round-trip');
      fs.writeFileSync(file, JSON.stringify(cache(false)));
      if (concurrent && updates.length === 1) values[key] = 'personal-concurrent-scopes';
    } };
    const vscode = { ConfigurationTarget: { Global: 1 }, workspace: { getConfiguration: () => configuration },
      extensions: { getExtension: () => ({ packageJSON: { version: '4.4.3' }, extensionPath: base, async activate() {} }) } };
    const result = await refreshReactSnippets(vscode);
    assert.equal(result.status, 'refreshed');
    assert.equal(result.reloadWindowMayBeRequired, true);
    assert.deepEqual(updates, concurrent ? [defaults.languageScopes] : [defaults.languageScopes, undefined]);
    assert.equal(values.languageScopes, concurrent ? 'personal-concurrent-scopes' : undefined);
    assert.equal((await refreshReactSnippets(vscode)).status, 'current');
    assert.equal(values.importReactOnTop, false);
  }
});

test('React refresh leaves unknown versions and a deliberate effective React-import override untouched', async () => {
  const { refreshReactSnippets } = require('../extensions/workstation-stability/react-snippets.cjs');
  for (const version of ['4.4.3', '5.0.2']) {
    const vscode = { extensions: { getExtension: () => ({ packageJSON: { version }, async activate() { assert.fail('An override/unknown version must not be activated by refresh'); } }) },
      workspace: { getConfiguration: () => ({ get: () => true, update() { assert.fail('Do not change unrelated preferences'); } }) } };
    assert.equal((await refreshReactSnippets(vscode)).status, version === '4.4.3' ? 'override-preserved' : 'not-needed');
  }
});

test('React refresh rechecks personal overrides after asynchronous vendor activation', async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-react-race-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(path.join(base, 'lib/snippets'), { recursive: true });
  fs.writeFileSync(path.join(base, 'lib/snippets/generated.json'), JSON.stringify({ rfc: { prefix: 'rfc', body: ['import React from "react"'] } }));
  let enabled = false;
  const vscode = { workspace: { getConfiguration: () => ({ get: () => enabled, update() { assert.fail('Do not override a concurrent personal preference'); } }) },
    extensions: { getExtension: () => ({ extensionPath: base, packageJSON: { version: '4.4.3' }, async activate() { enabled = true; } }) } };
  assert.equal((await require('../extensions/workstation-stability/react-snippets.cjs').refreshReactSnippets(vscode)).status, 'override-preserved');
  assert.equal(enabled, true);
});

test('A named active profile migrates its own stale combined language overrides and keeps personal keys', async t => {
  const selector = '[javascript][typescript]';
  const f = editorProfile(t, { values: { [selector]: { 'editor.tabSize': 2, 'editor.tabCompletion': 'off',
    'editor.renderValidationDecorations': 'off', 'editor.rulers': [100] }, '[python]': { 'editor.tabSize': 8 },
    'problems.visibility': false } });
  const result = await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.overrides, ['[python].editor.tabSize'], 'Only the preserved personal Python preference remains different');
  assert.equal(f.values[selector]['editor.tabSize'], 3);
  assert.equal(f.values[selector]['editor.tabCompletion'], 'on');
  assert.equal(f.values[selector]['editor.renderValidationDecorations'], 'off');
  assert.equal(f.values['problems.visibility'], true);
  assert.deepEqual(f.values[selector]['editor.rulers'], [100]);
  assert.equal(f.values['[python]']['editor.tabSize'], 8);
  const count = f.updates.length;
  await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.equal(f.updates.length, count, 'Reopening an applied profile does not repeatedly write settings');
});

test('A profile preserves an unowned diagnostic option when managed language values already match', async t => {
  const settings = require('../config/settings.json');
  const f = editorProfile(t, { values: { '[typescript]': { ...settings['[typescript]'],
    'editor.renderValidationDecorations': 'off', 'editor.rulers': [99] } } });
  const result = await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.deepEqual(result.failed, []);
  assert.equal(f.values['[typescript]']['editor.renderValidationDecorations'], 'off');
  assert.deepEqual(f.values['[typescript]']['editor.rulers'], [99]);
  assert.equal(f.values['problems.visibility'], true);
  const count = f.updates.length;
  await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.equal(f.updates.length, count);
});

test('The active profile retains personal colors, language mappings, shells and connection groups while applying managed entries', async t => {
  const personal = { 'workbench.colorCustomizations': { 'editor.background': '#101010' },
    'files.associations': { '*.personal': 'plaintext' },
    'workbench.editorAssociations': { '*.personalbook': 'personal.notebook' },
    'files.watcherExclude': { '**/personal-cache/**': true }, 'search.exclude': { '**/personal-cache': true }, 'emmet.includeLanguages': { 'vue-html': 'html' },
    'tailwindCSS.includeLanguages': { astro: 'html' },
    'terminal.integrated.profiles.windows': { PersonalShell: { path: 'C:/personal/shell.exe' } },
    'personal.connectionGroups': [{ name: 'Personal databases', id: 'personal' }] };
  const f = editorProfile(t, { values: personal });
  const result = await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.overrides, []);
  assert.equal(f.values['workbench.colorCustomizations']['editor.background'], '#101010');
  assert.equal(f.values['workbench.colorCustomizations']['editorError.foreground'], '#f8717126');
  assert.equal(f.values['files.associations']['*.personal'], 'plaintext');
  assert.equal(f.values['workbench.editorAssociations']['*.personalbook'], 'personal.notebook');
  assert.equal(f.values['files.watcherExclude']['**/personal-cache/**'], true);
  assert.equal(f.values['search.exclude']['**/personal-cache'], true);
  assert.equal(f.values['files.associations']['*.tsx'], 'typescriptreact');
  assert.equal(f.values['emmet.includeLanguages']['vue-html'], 'html');
  assert.equal(f.values['tailwindCSS.includeLanguages'].astro, 'html');
  assert.equal(f.values['terminal.integrated.profiles.windows'].PersonalShell.path, 'C:/personal/shell.exe');
  assert.deepEqual(f.values['personal.connectionGroups'], personal['personal.connectionGroups']);
});

test('Runtime reports English as requiring full restart and reports workspace overrides without modifying the project', async t => {
  const overrides = { 'editor.defaultFormatter': 'project.formatter' };
  const f = editorProfile(t, { language: 'en', overrides });
  const result = await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.equal(result.status, 'needs-attention');
  assert.equal(result.restartRequired, true);
  assert.ok(result.overrides.includes('editor.defaultFormatter'));
  assert.ok(result.overrides.includes('[typescript].editor.defaultFormatter'));
  assert.deepEqual(overrides, { 'editor.defaultFormatter': 'project.formatter' });
  const english = editorProfile(t, { language: 'en' });
  assert.equal((await applyEditorProfile(english.vscode, english.context, { file: english.file })).status, 'restart-required');
});

test('Failed active-profile writes remain retryable and are not reported as applied', async t => {
  const f = editorProfile(t, { failKey: 'editor.defaultFormatter' });
  const result = await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.deepEqual(result.failed, ['editor.defaultFormatter']);
  assert.equal(result.status, 'needs-attention');
  assert.equal(f.state.editorProfileRequest, undefined);
  assert.equal(f.state.editorProfilePreviousSettings.settings.find(item => item.key === 'editor.fontSize').value, 9);
  f.allowWrites();
  assert.equal((await applyEditorProfile(f.vscode, f.context, { file: f.file })).status, 'applied');
  assert.equal(f.state.editorProfilePreviousSettings.settings.find(item => item.key === 'editor.fontSize').value, 9);
});

test('The same setup request rechecks the actual language after restart without rewriting settings', async t => {
  const f = editorProfile(t, { language: 'en' });
  assert.equal((await applyEditorProfile(f.vscode, f.context, { file: f.file })).restartRequired, true);
  const writes = f.updates.length;
  f.vscode.env.language = 'ru';
  const current = await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.equal(current.status, 'applied');
  assert.equal(current.restartRequired, false);
  assert.equal(current.language, 'ru');
  assert.equal(f.updates.length, writes);
});

test('Startup and a new installer request automatically apply settings through the watched profile without manual commands', async t => {
  const f = editorProfile(t);
  const commands = new Map(), output = [];
  f.vscode.commands = { registerCommand(key, action) { commands.set(key, action); return { dispose() { commands.delete(key); } }; } };
  f.vscode.window.showWarningMessage = async () => assert.fail('No partial settings expected');
  f.vscode.window.showInformationMessage = async () => assert.fail('Russian is already active');
  watchEditorProfile(f.vscode, f.context, { appendLine(line) { output.push(line); } }, { file: f.file });
  t.after(() => { for (const disposable of f.context.subscriptions) disposable.dispose(); });
  async function waitForRequest() {
    const until = Date.now() + 5000;
    while (f.state.editorProfileRequest !== f.plan.requestId && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(f.state.editorProfileRequest, f.plan.requestId);
  }
  await waitForRequest();
  assert.equal(f.values['editor.fontSize'], 9, 'Startup preserves the personal font size');
  f.values['editor.fontSize'] = 8;
  f.plan.requestId = randomUUID(); fs.writeFileSync(f.file, JSON.stringify(f.plan));
  await waitForRequest();
  assert.equal(f.values['editor.fontSize'], 8, 'A repeated setup request preserves the changed font size');
  assert.ok(commands.has('workstationStability.applySettings'));
  assert.ok(output.some(line => line.includes('"status":"applied"')));
});

test('A manual Apply issued while a check is running keeps its force (K4 regression)', async t => {
  const f = editorProfile(t);
  f.vscode.window.showWarningMessage = async () => 'Restore defaults';
  const commands = new Map();
  f.vscode.commands = { registerCommand(key, action) { commands.set(key, action); return { dispose() { commands.delete(key); } }; } };
  let changeHandler;
  f.vscode.workspace.onDidChangeConfiguration = handler => { changeHandler = handler; return { dispose() {} }; };
  const originalUpdate = f.context.globalState.update.bind(f.context.globalState);
  let hold;
  f.context.globalState.update = async (key, value) => {
    if (key === 'editorProfileStatus' && hold) await hold.promise;
    return originalUpdate(key, value);
  };
  watchEditorProfile(f.vscode, f.context, { appendLine() {}, show() {} }, { file: f.file });
  t.after(() => { for (const disposable of f.context.subscriptions) disposable.dispose(); });
  await new Promise(resolve => setTimeout(resolve, 900));
  assert.equal(f.state.editorProfileRequest, f.plan.requestId, 'The initial check applied and recorded the request');
  f.values['editor.fontSize'] = 17;
  hold = {}; hold.promise = new Promise(resolve => { hold.resolve = resolve; });
  changeHandler();
  await new Promise(resolve => setTimeout(resolve, 700));
  const manual = commands.get('workstationStability.applySettings')();
  hold.resolve(); hold = null;
  await manual;
  await new Promise(resolve => setTimeout(resolve, 900));
  assert.equal(f.values['editor.fontSize'], f.plan.settings['editor.fontSize'], 'The forced rerun restored the managed value');
  assert.ok(f.updates.includes('editor.fontSize'), 'The forced rerun actually wrote the setting');
});

test('Force-defaults command explains theme replacement and Cancel preserves personal theme and tokens', async t => {
  const personal = { scope: 'comment.custom', settings: { foreground: '#123456' } };
  const f = editorProfile(t, { values: { 'workbench.colorTheme': 'Light+',
    'editor.tokenColorCustomizations': { '[Light+]': { comments: '#234567' }, textMateRules: [personal] } } });
  const commands = new Map(); let choice = 'Cancel';
  f.vscode.commands = { registerCommand(key, action) { commands.set(key, action); return { dispose() {} }; } };
  f.vscode.window.showWarningMessage = async (message, options) => {
    assert.match(message, /theme will be replaced/); assert.equal(options.modal, true); return choice;
  };
  watchEditorProfile(f.vscode, f.context, { appendLine() {} }, { file: f.file });
  t.after(() => f.context.subscriptions.forEach(item => item.dispose()));
  await new Promise(resolve => setTimeout(resolve, 900));
  const before = JSON.stringify(f.values);
  assert.deepEqual(await commands.get('workstationStability.applySettings')(), { cancelled: true });
  assert.equal(JSON.stringify(f.values), before);
  choice = 'Restore defaults'; await commands.get('workstationStability.applySettings')();
  assert.equal(f.values['workbench.colorTheme'], 'Visual Studio Dark');
  assert.equal(f.values['editor.tokenColorCustomizations']['[Light+]'].comments, '#234567');
  assert.ok(f.values['editor.tokenColorCustomizations'].textMateRules.some(rule => JSON.stringify(rule) === JSON.stringify(personal)));
});

test('An unregistered optional setting is reported unavailable instead of being written or counted as configured', async t => {
  const f = editorProfile(t);
  const get = f.vscode.workspace.getConfiguration;
  f.vscode.workspace.getConfiguration = (...args) => {
    const configuration = get(...args);
    const inspect = configuration.inspect;
    configuration.inspect = key => key.startsWith('jellyCursor.') ? { globalValue: true } : inspect(key);
    return configuration;
  };
  const result = await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.ok(result.unavailable.includes('jellyCursor.rippleEnabled'));
  assert.ok(!f.updates.some(key => key.startsWith('jellyCursor.')));
  assert.equal(result.settingsChecked, Object.keys(f.plan.settings).length - result.unavailable.length);
  assert.deepEqual(result.failed, []);
});

test('Vendor AI switches come only from actual installed configuration declarations and do not affect chat or native IntelliSense', async t => {
  const extensions = [{ packageJSON: { contributes: { configuration: { properties: {
    'antigravity.enableTabAutocomplete': { type: 'boolean' },
    'antigravity.autocomplete.enabled': { type: 'boolean' },
    'antigravity.disableSupercomplete': { type: 'boolean' },
    'antigravity.chat.enabled': { type: 'boolean' },
    'antigravity.autocomplete.model': { type: 'string' },
    'editor.suggestOnTriggerCharacters': { type: 'boolean' },
  } } } } }];
  assert.deepEqual(vendorCompletionSettings(extensions), {
    'antigravity.enableTabAutocomplete': false, 'antigravity.autocomplete.enabled': false,
    'antigravity.disableSupercomplete': true,
  });
  const f = editorProfile(t, { extensions });
  const result = await applyEditorProfile(f.vscode, f.context, { file: f.file });
  assert.equal(result.vendorCompletionSwitches.length, 3);
  assert.equal(f.values['antigravity.enableTabAutocomplete'], false);
  assert.equal(f.values['antigravity.disableSupercomplete'], true);
  assert.equal(f.values['antigravity.chat.enabled'], undefined);
  assert.equal(f.values['editor.suggestOnTriggerCharacters'], true);
});

test('Published stability VSIX reproduces source bytes, its MIT license and shortcuts available in every profile', () => {
  assert.deepEqual(require('../extensions/workstation-stability/package.json').contributes.keybindings, require('../config/keybindings.json'));
  const tab = require('../config/keybindings.json').find(item => item.key === 'tab');
  assert.equal(tab.command, 'acceptSelectedSuggestion');
  for (const guard of ['editorTextFocus', 'suggestWidgetVisible', 'suggestWidgetHasFocusedSuggestion', '!editorReadonly', '!tabMovesFocus']) {
    assert.ok(tab.when.split(' && ').includes(guard), 'Tab must respect context: ' + guard);
  }
  const result = buildVsix();
  assert.deepEqual(fs.readFileSync(result.file), result.bytes);
  let offset = 0;
  const names = [];
  while (result.bytes.readUInt32LE(offset) === 0x04034b50) {
    const header = result.bytes.subarray(offset, offset + 30);
    const size = header.readUInt32LE(18), nameSize = header.readUInt16LE(26), extraSize = header.readUInt16LE(28);
    const name = result.bytes.subarray(offset + 30, offset + 30 + nameSize).toString('utf8');
    const start = offset + 30 + nameSize + extraSize;
    const bytes = inflateRawSync(result.bytes.subarray(start, start + size));
    names.push(name);
    if (name.startsWith('extension/')) {
      const source = name === 'extension/LICENSE.txt' ? fs.readFileSync(path.join(root, 'LICENSE')) : require('../scripts/package-stability.cjs').payload(root).get(name.slice(10));
      assert.ok(source, 'Every packaged asset has an independently checked source: ' + name);
      assert.deepEqual(bytes, source, name);
    }
    offset = start + size;
  }
  assert.equal(names.length, 28);
  assert.ok(names.includes('extension/instructional-guides.json'));
  for (const guide of require('../extensions/workstation-stability/guide-player.cjs').guides)
    assert.ok(names.includes('extension/guide-' + guide.id + '.mp4'), guide.id);
  assert.ok(names.includes('extension/questions.cjs'));
  assert.ok(names.includes('extension/icon.png'), 'The published extension includes its actual icon');
  assert.equal(result.bytes.readUInt32LE(offset), 0x02014b50);
});

for (const [name, file, count] of [
  ['Global helper concurrency, lifecycle and manual recovery', 'stability-helper.cjs', 12],
  ['Maintenance backups, unknown versions, traversal and update races', 'stability-maintenance.cjs', 20],
]) {
  test(name, () => {
    const result = execFileSync(process.execPath, [path.join(root, 'tests/fixtures', file)], { encoding: 'utf8', timeout: 20000 });
    assert.equal(JSON.parse(result).passed, count);
  });
}

test('The skill inventory is exactly the frontend skills plus the workflow skill', () => {
  const inventory = require('../config/skill-inventory.json');
  const actual = fs.readdirSync(path.join(root, 'skills')).filter(name => fs.existsSync(path.join(root, 'skills', name, 'SKILL.md'))).sort();
  assert.deepEqual(inventory.skills, actual);
  assert.deepEqual(actual, ['agent-browser', 'in-chat-screenshot-to-code', 'project-coding-rules', 'vercel-react-best-practices',
    'workstation-frontend-mentor', 'workstation-practice', 'workstation-workflow']);
});

test('Helper upgrade backup keeps subdirectory files and never aborts the upgrade', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'stability-helper-backup-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const extensionsDir = path.join(base, 'extensions');
  const oldDir = path.join(extensionsDir, 'workstation.stability-helper-1.3.18');
  fs.mkdirSync(path.join(oldDir, 'media'), { recursive: true });
  fs.writeFileSync(path.join(oldDir, 'package.json'), '{"version":"1.3.18"}');
  fs.writeFileSync(path.join(oldDir, 'media', 'stability-instructional.gif'), 'gif-bytes');
  fs.writeFileSync(path.join(extensionsDir, 'extensions.json'), JSON.stringify([
    { identifier: { id: 'workstation.stability-helper' }, version: '1.3.18', relativeLocation: 'workstation.stability-helper-1.3.18' },
  ]));
  const { backupRegisteredHelper } = require('../lib/extensions');
  const backup = backupRegisteredHelper(extensionsDir, JSON.parse(fs.readFileSync(path.join(extensionsDir, 'extensions.json'))),
    'workstation.stability-helper', ['package.json', 'media/stability-instructional.gif'], path.join(base, 'backup'));
  assert.equal(fs.readFileSync(path.join(backup, 'workstation.stability-helper-1.3.18-package.json'), 'utf8'), '{"version":"1.3.18"}');
  assert.equal(fs.readFileSync(path.join(backup, 'workstation.stability-helper-1.3.18-media', 'stability-instructional.gif'), 'utf8'), 'gif-bytes');
  assert.ok(fs.existsSync(path.join(backup, 'extensions-index.json')), 'the extension index lands in the backup');
});

test('Stability re-applies the Jelly Cursor DOM patch with Jelly Cursor\'s own command when the IDE dropped it', async t => {
  const { ensureJellyPatch } = require('../extensions/workstation-stability/jelly-patch.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jelly-patch-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const html = path.join(directory, 'workbench.html');
  fs.writeFileSync(html, '<html></html>');
  const executed = [], lines = [];
  let installed = true;
  const vscode = {
    extensions: { getExtension: id => installed && id === 'iranon.jelly-cursor' ? { activate: async () => {} } : undefined },
    workspace: { getConfiguration: () => ({ get: () => html }) },
    commands: { async executeCommand(command) {
      executed.push(command);
      fs.writeFileSync(html, '<html><!-- jelly-cursor:start --><script src="./jelly-cursor.js"></script><!-- jelly-cursor:end --></html>');
      fs.writeFileSync(path.join(directory, 'jelly-cursor.js'), '//');
    } },
  };
  const output = { appendLine: line => lines.push(line) };
  assert.deepEqual(await ensureJellyPatch(vscode, output), { patched: true, integrity: false, blink: true });
  assert.deepEqual(executed, ['jellyCursor.installDomPatch']);
  assert.deepEqual(await ensureJellyPatch(vscode, output), { patched: true, unchanged: true, integrity: false, blink: false }, 'an existing patch is not rewritten');
  assert.equal(executed.length, 1);
  installed = false;
  assert.match((await ensureJellyPatch(vscode, output)).skipped, /not installed/);
});

test('Changed Jelly Cursor settings reinstall the patch once; unchanged settings leave it alone', async t => {
  const { ensureJellyPatch } = require('../extensions/workstation-stability/jelly-patch.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jelly-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const html = path.join(directory, 'workbench.html'), script = path.join(directory, 'jelly-cursor.js');
  fs.writeFileSync(html, '<html><!-- jelly-cursor:start --><script src="./jelly-cursor.js"></script><!-- jelly-cursor:end --></html>');
  fs.writeFileSync(script, '// old'); fs.utimesSync(script, 1, 1);
  const settings = { workbenchHtmlPath: html, glowSize: 12, reminders: false }, stored = new Map(), executed = [];
  const vscode = {
    extensions: { getExtension: () => ({ activate: async () => {}, packageJSON: { contributes: { configuration: { properties:
      { 'jellyCursor.glowSize': {}, 'jellyCursor.reminders': {}, 'jellyCursor.workbenchHtmlPath': {} } } } } }) },
    workspace: { getConfiguration: () => ({ get: key => settings[key] }) },
    commands: { async executeCommand(command) { executed.push(command); fs.writeFileSync(script, '// baked ' + settings.glowSize); } },
  };
  const state = { get: key => stored.get(key), update: async (key, value) => stored.set(key, value) }, output = { appendLine() {} };
  assert.deepEqual(await ensureJellyPatch(vscode, output, state), { patched: true, integrity: false, blink: true }, 'a patch with unknown settings is rebuilt');
  assert.ok(fs.readFileSync(script, 'utf8').startsWith('// baked 12\n/* workstation-blink:start */'));
  assert.equal((await ensureJellyPatch(vscode, output, state)).unchanged, true);
  settings.reminders = true;
  assert.equal((await ensureJellyPatch(vscode, output, state)).unchanged, true, 'runtime-only settings need no reinstall');
  settings.glowSize = 20;
  assert.deepEqual(await ensureJellyPatch(vscode, output, state), { patched: true, integrity: false, blink: true });
  assert.equal(executed.length, 2);
});

test('The drawn Jelly caret follows the native blink of the focused editor and never fades below its minimum', t => {
  const { ensureBlink } = require('../extensions/workstation-stability/jelly-patch.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jelly-blink-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const script = path.join(directory, 'jelly-cursor.js');
  fs.writeFileSync(script, '// jelly');
  assert.equal(ensureBlink(script, 0.12), true);
  assert.equal(ensureBlink(script, 0.12), false, 'the addon is appended only once');
  assert.equal(ensureBlink(script, 0.2), true, 'a new minimum replaces the old addon');
  const text = fs.readFileSync(script, 'utf8');
  assert.equal(text.split('workstation-blink:start').length, 2);
  assert.ok(text.startsWith('// jelly\n'));
  const run = (layerOpacity, focused = true) => {
    const overlay = { style: {} }, layer = {}, frames = [], styles = [];
    const document = { querySelector: selector => selector === '.jelly-cursor-layer' ? overlay : focused ? layer : null,
      createElement: () => ({}), head: { appendChild: element => styles.push(element.textContent) } };
    vm.runInNewContext(text, { document, getComputedStyle: () => ({ opacity: layerOpacity }), requestAnimationFrame: callback => frames.push(callback),
      fetch: async () => ({ ok: true, text: async () => '' }), setInterval: () => 0 });
    assert.match(styles.join(''), /\.cursors-layer\.cursor-smooth[^{]*\{ animation-iteration-count: infinite !important; \}/, 'the resting blink does not stop after ten seconds');
    frames.shift()();
    assert.equal(frames.length, 1, 'the mirror keeps running every frame');
    return overlay.style.opacity;
  };
  assert.equal(run('1'), '1');
  assert.equal(run('0.5'), '0.5', 'mid-fade follows the native blink');
  assert.equal(run('0'), '0.2', 'the caret never fades below the configured minimum');
  assert.equal(run('0', false), '1', 'without a focused editor the caret stays fully visible');
});

test('The workbench addon hides both boxed hint lines and applies workstation-ui.css live', async t => {
  const { ensureBlink, UI_STYLE } = require('../extensions/workstation-stability/jelly-patch.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-ui-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const script = path.join(directory, 'jelly-cursor.js');
  fs.writeFileSync(script, '// jelly');
  assert.equal(ensureBlink(script, 0.12), true);
  assert.ok(fs.existsSync(path.join(directory, UI_STYLE)), 'the style file exists before Aster writes it');
  fs.writeFileSync(path.join(directory, UI_STYLE), '.mine { color: red; }');
  assert.equal(ensureBlink(script, 0.12), false, 'an existing style file is never overwritten');
  assert.equal(fs.readFileSync(path.join(directory, UI_STYLE), 'utf8'), '.mine { color: red; }');
  const text = fs.readFileSync(script, 'utf8');
  assert.equal(text.split('workstation-ui:start').length, 2);
  const elements = [], ticks = [];
  let css = '.monaco-workbench { font-family: A !important; }';
  const document = { visibilityState: 'visible', querySelector: () => null, createElement: () => ({}), head: { appendChild: element => elements.push(element) } };
  vm.runInNewContext(text, { document, getComputedStyle: () => ({ opacity: '1' }), requestAnimationFrame: () => {},
    fetch: async url => { assert.match(url, /^workstation-ui\.css\?t=\d+$/); return { ok: true, text: async () => css }; },
    setInterval: (callback, delay) => { assert.equal(delay, 2000); ticks.push(callback); return 1; } });
  const fixed = elements.find(element => element.id === 'workstation-ui-fixed'), live = elements.find(element => element.id === 'workstation-ui-live');
  for (const id of ['antigravity.inlayHint', 'antigravity.markerHoverInlayHint']) assert.ok(fixed.textContent.includes(`[widgetid="${id}"]`), id + ' is hidden');
  assert.match(fixed.textContent, /display: none !important/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(live.textContent, css, 'the written style applies without a reload');
  css = ''; ticks[0](); await new Promise(resolve => setImmediate(resolve));
  assert.equal(live.textContent, '', 'clearing the file brings the IDE font back');
});

test('The Jelly Cursor patch waits until the IDE integrity check has read the original workbench.html', async t => {
  const { scheduleJellyPatch } = require('../extensions/workstation-stability/jelly-patch.cjs');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const looked = [], subscriptions = [];
  const vscode = { extensions: { getExtension: id => { looked.push(id); } } };
  scheduleJellyPatch(vscode, { subscriptions }, { appendLine() {} });
  t.mock.timers.tick(59999);
  assert.deepEqual(looked, [], 'nothing is patched while the startup integrity check can still run');
  t.mock.timers.tick(1);
  assert.deepEqual(looked, ['iranon.jelly-cursor']);
  scheduleJellyPatch(vscode, { subscriptions }, { appendLine() {} });
  subscriptions.at(-1).dispose();
  t.mock.timers.tick(60000);
  assert.equal(looked.length, 1, 'closing the window cancels a pending patch');
});

test('Only the patched workbench.html checksum is refreshed, and only for a file Jelly Cursor manages', t => {
  const { syncIntegrity } = require('../extensions/workstation-stability/jelly-patch.cjs');
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'jelly-integrity-'));
  t.after(() => fs.rmSync(app, { recursive: true, force: true }));
  const html = path.join(app, 'out/vs/code/electron-browser/workbench/workbench.html');
  fs.mkdirSync(path.dirname(html), { recursive: true });
  const digest = text => require('node:crypto').createHash('sha256').update(text).digest('base64').replace(/=+$/, '');
  fs.writeFileSync(html, '<html>original</html>');
  const product = path.join(app, 'product.json');
  const original = '{\n\t"nameShort": "Antigravity IDE",\n\t"checksums": {\n\t\t"vs/workbench/workbench.desktop.main.js": "KEEP",\n\t\t"vs/code/electron-browser/workbench/workbench.html": "'
    + digest('<html>original</html>') + '"\n\t}\n}\n';
  fs.writeFileSync(product, original);
  fs.writeFileSync(html, '<html>original<!-- jelly-cursor:start --></html>');
  assert.equal(syncIntegrity(html), false, 'no Jelly backup: the checksum is not touched');
  assert.equal(fs.readFileSync(product, 'utf8'), original);
  fs.writeFileSync(html + '.jelly-cursor-backup', '<html>original</html>');
  assert.equal(syncIntegrity(html), true);
  const updated = fs.readFileSync(product, 'utf8');
  assert.equal(JSON.parse(updated).checksums['vs/code/electron-browser/workbench/workbench.html'], digest(fs.readFileSync(html)));
  assert.equal(JSON.parse(updated).checksums['vs/workbench/workbench.desktop.main.js'], 'KEEP');
  assert.equal(updated.replace(digest(fs.readFileSync(html)), digest('<html>original</html>')), original, 'only one value changes; formatting is kept');
  assert.equal(syncIntegrity(html), false, 'already current');
});
