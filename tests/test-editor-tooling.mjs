import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const { runInstaller } = require('../lib/installer');
const { getEnvironmentPaths } = require('../lib/paths');
const { installGalleryExtensions } = require('../lib/extensions');
const catalog = require('../config/extensions.json');

test('Installation persists library IntelliSense, manual formatting and autosave in a fresh portable profile', t => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-tooling-'));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const userProfile = path.join(base, 'User With Spaces');
    const gitBashPath = path.join(base, 'Git/bin/bash.exe');
    fs.mkdirSync(path.dirname(gitBashPath), { recursive: true });
    fs.writeFileSync(gitBashPath, 'fixture');
    const customRoots = { userProfile, appData: path.join(userProfile, 'AppData/Roaming'), localAppData: path.join(userProfile, 'AppData/Local'), gitBashPath,
        totalMemoryBytes: 4 * 1024 ** 3 };
    const env = getEnvironmentPaths(customRoots);
    const project = path.join(userProfile, 'Existing Project');
    fs.mkdirSync(project, { recursive: true });
    const projectConfigs = { '.editorconfig': 'root=true\n[*]\nindent_size=4\n', '.prettierrc': '{"tabWidth":4}\n' };
    for (const [name, bytes] of Object.entries(projectConfigs)) fs.writeFileSync(path.join(project, name), bytes);
    fs.mkdirSync(path.dirname(env.settingsJson), { recursive: true });
    const oldEditor = { 'editor.tabSize': 2, 'editor.tabCompletion': 'off', 'editor.snippetSuggestions': 'none',
        'editor.suggest.showSnippets': false, 'editor.renderValidationDecorations': 'off', 'editor.rulers': [120] };
    fs.writeFileSync(env.settingsJson, JSON.stringify({ '[typescript]': oldEditor,
        '[javascript][typescript]': oldEditor, '[python]': { 'editor.tabSize': 8 },
        'files.associations': { '*.personal': 'plaintext' },
    'workbench.editorAssociations': { '*.personalbook': 'personal.notebook' },
    'files.watcherExclude': { '**/personal-cache/**': true }, 'search.exclude': { '**/personal-cache': true }, 'emmet.includeLanguages': { 'vue-html': 'html' },
        'tailwindCSS.includeLanguages': { astro: 'html' },
        'workbench.colorCustomizations': { 'editor.background': '#101010' },
        'terminal.integrated.profiles.windows': { PersonalShell: { path: 'C:/personal/shell.exe' } },
        'personal.connectionGroups': [{ name: 'Personal databases', id: 'personal' }] }));
    const result = runInstaller({ applyProfile: true, quietCompletion: true, customRoots, repoRoot, skipExtensions: true, skipAgentBrowser: true, skipPermissions: true, skipFont: true, log() {} });
    assert.equal(result.success, true, result.failures?.join('; '));
    const settings = JSON.parse(fs.readFileSync(env.settingsJson));
    for (const language of ['javascript', 'typescript']) {
        assert.equal(settings[language + '.suggest.enabled'], true);
        assert.equal(settings[language + '.suggest.autoImports'], true);
        assert.equal(settings[language + '.suggest.includeCompletionsForImportStatements'], true);
        assert.equal(Object.hasOwn(settings, language + '.suggest.importStatements'), false);
    }
    assert.equal(settings['typescript.preferences.includePackageJsonAutoImports'], 'on');
    assert.equal(settings['typescript.tsserver.maxTsServerMemory'], 1024, 'The actual 4 GiB profile keeps room for the OS and editor');
    assert.equal(settings['editor.suggest.showInlineDetails'], true);
    assert.equal(settings['editor.inlineSuggest.enabled'], false);
    assert.equal(settings['editor.tabSize'], settings['prettier.tabWidth']);
    assert.equal(settings['prettier.tabWidth'], 3);
    assert.equal(settings['editor.insertSpaces'], true);
    assert.equal(settings['editor.detectIndentation'], false);
    for (const selector of ['[typescript]', '[javascript][typescript]']) {
        assert.equal(settings[selector]['editor.tabSize'], 3);
        assert.equal(settings[selector]['editor.tabCompletion'], 'on');
        assert.equal(settings[selector]['editor.snippetSuggestions'], 'top');
        assert.equal(settings[selector]['editor.suggest.showSnippets'], true);
        assert.equal(settings[selector]['editor.renderValidationDecorations'], 'off');
        assert.deepEqual(settings[selector]['editor.rulers'], [120], 'Personal language settings survive migration');
    }
    assert.equal(settings['[python]']['editor.tabSize'], 8);
    assert.equal(settings['problems.visibility'], true);
    assert.equal(Object.hasOwn(settings, 'editor.renderValidationDecorations'), false);
    assert.equal(settings['files.associations']['*.personal'], 'plaintext');
    assert.equal(settings['workbench.editorAssociations']['*.personalbook'], 'personal.notebook');
    assert.equal(settings['files.watcherExclude']['**/personal-cache/**'], true);
    assert.equal(settings['search.exclude']['**/personal-cache'], true);
    assert.equal(settings['emmet.includeLanguages']['vue-html'], 'html');
    assert.equal(settings['tailwindCSS.includeLanguages'].astro, 'html');
    assert.equal(settings['workbench.colorCustomizations']['editor.background'], '#101010');
    assert.equal(settings['terminal.integrated.profiles.windows'].PersonalShell.path, 'C:/personal/shell.exe');
    assert.deepEqual(settings['personal.connectionGroups'], [{ name: 'Personal databases', id: 'personal' }]);
    const plan = JSON.parse(fs.readFileSync(path.join(env.geminiConfigDir, 'workstation-setup/editor-profile.json')));
    assert.equal(plan.settings['[javascript][typescript]']['editor.tabSize'], 3, 'The active profile receives the migration too');
    assert.equal(plan.settings['[javascript][typescript]']['editor.rulers'], undefined, 'Personal values are not copied into the managed plan');
    assert.equal(plan.settings['personal.connectionGroups'], undefined, 'Personal connection groups are not a managed default');
    assert.equal(settings['emmet.showExpandedAbbreviation'], 'always');
    assert.equal(settings['emmet.triggerExpansionOnTab'], true);
    assert.equal(settings['reactSnippets.settings.importReactOnTop'], false);
    assert.equal(settings['htmlEndTagLabels.labelColor'], '#00000000');
    assert.equal(settings['workbench.colorCustomizations']['htmlEndTagLabels.labelColor'], '#00000000');
    for (const language of ['javascript', 'typescript']) assert.equal(settings[language + '.validate.enable'], true);
    assert.equal(settings['workbench.colorCustomizations']['editorError.foreground'], '#f8717126');
    assert.equal(settings['prettier.useEditorConfig'], true);
    assert.equal(settings['prettier.proseWrap'], 'preserve');
    assert.equal(settings['files.autoSave'], 'afterDelay');
    assert.equal(settings['files.autoSaveDelay'], 1000);
    assert.equal(settings['files.associations']['.env.*'], 'dotenv');
    const bindings = JSON.parse(fs.readFileSync(env.keybindingsJson));
    assert.ok(bindings.some(item => item.key === 'ctrl+shift+f' && item.command === 'editor.action.formatDocument'
        && item.when === 'editorTextFocus && !editorReadonly'));
    assert.ok(bindings.some(item => item.key === 'ctrl+space' && item.command === 'editor.action.triggerSuggest'));
    for (const [name, bytes] of Object.entries(projectConfigs)) assert.equal(fs.readFileSync(path.join(project, name), 'utf8'), bytes);
});

test('Updating replaces retired import and validation settings while preserving personal settings and backup bytes', t => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-import-settings-'));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const customRoots = { userProfile: path.join(base, 'Existing User'), gitBashPath: process.execPath };
    const env = getEnvironmentPaths(customRoots);
    const options = { applyProfile: true, quietCompletion: true, customRoots, repoRoot, skipExtensions: true, skipAgentBrowser: true,
        skipPermissions: true, skipFont: true, log() {} };
    const initial = runInstaller(options);
    assert.equal(initial.success, true, initial.failures?.join('; '));
    const existing = JSON.parse(fs.readFileSync(env.settingsJson));
    for (const language of ['javascript', 'typescript']) {
        existing[language + '.suggest.importStatements'] = false;
        existing[language + '.suggest.includeCompletionsForImportStatements'] = false;
    }
    existing['personal.importPreference'] = 'retain';
    existing['editor.renderValidationDecorations'] = 'off';
    existing['problems.visibility'] = false;
    existing['[python]'] = { 'editor.tabSize': 8, 'editor.renderValidationDecorations': 'off' };
    existing['[javascript][typescript]'] = { 'editor.rulers': [88], 'editor.renderValidationDecorations': 'off' };
    existing['[typescript]']['editor.renderValidationDecorations'] = 'off';
    existing['[typescript]']['editor.rulers'] = [99];
    const before = JSON.stringify(existing, null, 2);
    fs.writeFileSync(env.settingsJson, before);

    const updated = runInstaller(options);
    assert.equal(updated.success, true, updated.failures?.join('; '));
    assert.ok(updated.backupInfo, 'The existing profile must be backed up before migration');
    assert.equal(fs.readFileSync(path.join(updated.backupInfo.backupDir, 'settings.json'), 'utf8'), before);
    const settings = JSON.parse(fs.readFileSync(env.settingsJson));
    const plan = JSON.parse(fs.readFileSync(path.join(env.geminiConfigDir, 'workstation-setup/editor-profile.json')));
    for (const language of ['javascript', 'typescript']) {
        const key = language + '.suggest.includeCompletionsForImportStatements';
        assert.equal(settings[key], true);
        assert.equal(plan.settings[key], true, 'The active-profile helper receives the supported key');
        assert.equal(settings[language + '.suggest.importStatements'], false);
        assert.equal(Object.hasOwn(plan.settings, language + '.suggest.importStatements'), false);
    }
    assert.equal(settings['personal.importPreference'], 'retain');
    assert.equal(settings['problems.visibility'], true);
    assert.equal(plan.settings['problems.visibility'], true);
    assert.equal(settings['editor.renderValidationDecorations'], 'off');
    assert.equal(Object.hasOwn(plan.settings, 'editor.renderValidationDecorations'), false);
    for (const [selector, value] of Object.entries(settings)) {
        if (/^(?:\[[^\[\]]+\])+$/.test(selector)) {
            assert.equal(value['editor.renderValidationDecorations'], existing[selector]?.['editor.renderValidationDecorations'], selector);
            assert.equal(Object.hasOwn(value, 'problems.visibility'), false, 'Window settings are not written into language overrides');
        }
    }
    assert.equal(settings['[python]']['editor.tabSize'], 8);
    assert.deepEqual(settings['[javascript][typescript]']['editor.rulers'], [88]);
    assert.deepEqual(settings['[typescript]']['editor.rulers'], [99]);
    const after = fs.readFileSync(env.settingsJson);
    const repeated = runInstaller(options);
    assert.equal(repeated.success, true, repeated.failures?.join('; '));
    assert.equal(repeated.backupInfo, null, 'Repeating the migrated profile creates no duplicate backup');
    assert.deepEqual(fs.readFileSync(env.settingsJson), after);
});

test('Every requested gallery tool participates in the latest-compatible installer, without Live Server or an extra import provider', () => {
    const calls = [];
    const result = installGalleryExtensions('fixture-cli', catalog, {
        listInstalled: () => [],
        install(_cli, id, options) { calls.push({ id: id.toLowerCase(), options }); return { success: true, version: '9.0.0' }; },
        log() {},
    });
    assert.deepEqual(result.failures, []);
    for (const id of ['vincaslt.highlight-matching-tag', 'anteprimorac.html-end-tag-labels', 'mikestead.dotenv',
        'chakrounanas.turbo-console-log', 'editorconfig.editorconfig', 'esbenp.prettier-vscode']) {
        const request = calls.find(item => item.id === id);
        assert.ok(request, id + ' reaches the installer');
        assert.equal(request.options.trackLatest, true);
        assert.equal(request.options.version, undefined);
    }
    assert.ok(!catalog.some(item => item.id.toLowerCase() === 'ritwickdey.liveserver'));
    assert.ok(catalog.filter(item => item.source === 'gallery').every(item => item.trackLatest && !item.version));
    assert.ok(!catalog.some(item => /auto.?import/i.test(item.name)), 'Built-in TypeScript owns symbol imports');
});
