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
        'mssql.connectionGroups': [{ name: 'Personal databases', id: 'personal' }] }));
    const result = runInstaller({ customRoots, repoRoot, skipExtensions: true, skipAgentBrowser: true, skipPermissions: true, skipFont: true, log() {} });
    assert.equal(result.success, true, result.failures?.join('; '));
    const settings = JSON.parse(fs.readFileSync(env.settingsJson));
    for (const language of ['javascript', 'typescript']) {
        assert.equal(settings[language + '.suggest.enabled'], true);
        assert.equal(settings[language + '.suggest.autoImports'], true);
        assert.equal(settings[language + '.suggest.importStatements'], true);
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
        assert.equal(settings[selector]['editor.renderValidationDecorations'], 'on');
        assert.deepEqual(settings[selector]['editor.rulers'], [120], 'Personal language settings survive migration');
    }
    assert.equal(settings['[python]']['editor.tabSize'], 8);
    assert.equal(settings['files.associations']['*.personal'], 'plaintext');
    assert.equal(settings['workbench.editorAssociations']['*.personalbook'], 'personal.notebook');
    assert.equal(settings['files.watcherExclude']['**/personal-cache/**'], true);
    assert.equal(settings['search.exclude']['**/personal-cache'], true);
    assert.equal(settings['emmet.includeLanguages']['vue-html'], 'html');
    assert.equal(settings['tailwindCSS.includeLanguages'].astro, 'html');
    assert.equal(settings['workbench.colorCustomizations']['editor.background'], '#101010');
    assert.equal(settings['terminal.integrated.profiles.windows'].PersonalShell.path, 'C:/personal/shell.exe');
    assert.deepEqual(settings['mssql.connectionGroups'], [{ name: 'Personal databases', id: 'personal' }]);
    const plan = JSON.parse(fs.readFileSync(path.join(env.geminiConfigDir, 'workstation-setup/editor-profile.json')));
    assert.equal(plan.settings['[javascript][typescript]']['editor.tabSize'], 3, 'The active profile receives the migration too');
    assert.equal(plan.settings['[javascript][typescript]']['editor.rulers'], undefined, 'Personal values are not copied into the managed plan');
    assert.equal(plan.settings['mssql.connectionGroups'], undefined, 'SQL connection groups are personal state, not a managed default');
    assert.equal(settings['emmet.showExpandedAbbreviation'], 'always');
    assert.equal(settings['emmet.triggerExpansionOnTab'], true);
    assert.equal(settings['reactSnippets.settings.importReactOnTop'], true);
    for (const language of ['javascript', 'typescript']) assert.equal(settings[language + '.validate.enable'], true);
    assert.equal(settings['workbench.colorCustomizations']['editorError.foreground'], '#f8717133');
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
