import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const { runInstaller } = require('../lib/installer.js');
const { runDoctor } = require('../lib/doctor.js');
const { getEnvironmentPaths } = require('../lib/paths.js');
const { expectedSettings, homeTemplate } = require('../lib/profile-settings.js');
const { restoreBackup } = require('../lib/backup.js');
const { collectPayload, statePath } = require('../lib/owned-files.js');
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-current-'));
  t.after(() => {
    const resolved = path.resolve(base);
    const tempRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(tempRoot) || !path.basename(resolved).startsWith('workstation-current-')) throw new Error('Unsafe fixture cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const userProfile = path.join(base, 'User Profile With Spaces');
  const gitBashPath = path.join(base, 'Git/bin/bash.exe');
  put(gitBashPath, 'fixture only');
  const customRoots = { userProfile, appData: path.join(userProfile, 'AppData/Roaming'), localAppData: path.join(userProfile, 'AppData/Local'), gitBashPath };
  return { base, customRoots, env: getEnvironmentPaths(customRoots) };
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function put(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }

test('Doctor requires a real registration for each latest extension', t => {
  const { base, customRoots } = fixture(t);
  const cli = path.join(base, process.platform === 'win32' ? 'inventory.cmd' : 'inventory');
  const catalog = readJson(path.join(repoRoot, 'config/extensions.json'));
  for (const missing of [[], ['oxc.oxc-vscode'], ['streetsidesoftware.code-spell-checker'], ['oxc.oxc-vscode', 'streetsidesoftware.code-spell-checker']]) {
    const inventory = catalog.filter(ext => !missing.includes(ext.id)).map(ext => ext.id + '@' + (ext.version || '9.0.0'));
    put(cli, process.platform === 'win32' ? '@echo off\r\n' + inventory.map(line => 'echo ' + line).join('\r\n') + '\r\n'
      : '#!' + process.execPath + '\nconsole.log(' + JSON.stringify(inventory.join('\n')) + ');\n');
    if (process.platform !== 'win32') fs.chmodSync(cli, 0o755);
    const result = runDoctor({ customRoots: { ...customRoots, cliPath: cli }, log() {} });
    for (const ext of catalog.filter(ext => ext.trackLatest)) {
      assert.equal(result.checks.find(check => check.name === ext.id + ' (latest)').status, missing.includes(ext.id) ? 'fail' : 'pass', ext.id);
    }
  }
});

test('Invalid destination JSON stops before any current-profile file is written', t => {
  const { customRoots, env } = fixture(t);
  put(env.settingsJson, '{"keep":true}');
  put(env.keybindingsJson, '{broken');
  assert.throws(() => runInstaller({ customRoots, skipExtensions: true, repoRoot, log() {} }), /JSONC parse error/);
  assert.equal(fs.readFileSync(env.settingsJson, 'utf8'), '{"keep":true}');
  assert.equal(fs.existsSync(path.join(env.geminiDir, 'GEMINI.md')), false);
});

function profileJsonFiles(env) {
  return [
    [env.settingsJson, 'settings.json'],
    [env.keybindingsJson, 'keybindings.json'],
    [env.argvJson, 'argv.json'],
    [path.join(env.geminiDir, 'antigravity/settings.json'), 'antigravity-settings.json'],
    [env.nativeHooksJson, 'native-hooks.json'],
    [path.join(env.geminiConfigDir, 'config.json'), 'gemini-config.json'],
    [path.join(env.geminiConfigDir, 'mcp_config.json'), 'mcp_config.json'],
    [path.join(env.geminiDir, 'antigravity/mcp_config.json'), 'mcp-antigravity.json'],
  ];
}

test('Full install accepts empty optional profile JSON and backs up the exact original bytes', t => {
  const { customRoots, env } = fixture(t);
  const files = profileJsonFiles(env).map(([target, backup], index) => [target, backup, ['', ' \r\n', '\uFEFF \r\n'][index % 3]]);
  for (const [target, , bytes] of files) put(target, bytes);
  const result = runInstaller({ customRoots, repoRoot,
    skipAgentBrowser: true, skipFont: true, skipPermissions: true, log() {} });
  assert.equal(result.success, true, result.failures.join('; '));
  for (const [target, backup, bytes] of files) {
    assert.equal(fs.readFileSync(path.join(result.backupInfo.backupDir, backup), 'utf8'), bytes);
    assert.ok(readJson(target), 'Installer must replace the empty config with valid JSON: ' + target);
  }
  assert.deepEqual(readJson(env.settingsJson), expectedSettings(env, repoRoot));
  assert.ok(readJson(path.join(env.geminiConfigDir, 'mcp_config.json')).mcpServers.gsd);
  assert.ok(readJson(path.join(env.geminiDir, 'antigravity/mcp_config.json')).mcpServers.gsd);
  assert.ok(readJson(path.join(env.extensionsDir, 'extensions.json')).some(item => item.identifier?.id === 'workstation.calm-typescript'));
  assert.ok(fs.existsSync(path.join(env.extensionsDir, 'workstation.stability-helper-1.3.8/maintenance.cjs')));
  assert.ok(fs.existsSync(path.join(env.extensionsDir, 'workstation.git-branch-panel-1.3.0/extension.js')));
  assert.equal(runDoctor({ customRoots, log() {} }).checks.find(item => item.name === 'Managed editor settings').status, 'pass');
  restoreBackup(result.backupInfo.backupDir, env);
  assert.equal(fs.existsSync(path.join(env.geminiConfigDir, 'workstation-setup/editor-profile.json')), false);
  for (const [target, , bytes] of files) assert.equal(fs.readFileSync(target, 'utf8'), bytes);
});

for (let index = 0; index < 8; index++) {
  test('Truncated profile JSON reports its exact path and leaves the profile untouched: destination ' + (index + 1), t => {
    const { customRoots, env } = fixture(t);
    const [target] = profileJsonFiles(env)[index];
    const bytes = '{"localToken":"PRIVATE_FIXTURE_VALUE"';
    put(target, bytes);
    const untouched = path.join(env.geminiDir, 'GEMINI.md');
    put(untouched, 'Existing instructions');
    assert.throws(() => runInstaller({ customRoots, repoRoot, skipExtensions: true, log() {} }), error => {
      assert.ok(error.message.includes(target), 'Must identify the broken file, not just JSON input');
      assert.ok(!error.message.includes('PRIVATE_FIXTURE_VALUE'), 'Do not include config contents in errors');
      return true;
    });
    assert.equal(fs.readFileSync(target, 'utf8'), bytes);
    assert.equal(fs.readFileSync(untouched, 'utf8'), 'Existing instructions');
    assert.equal(fs.existsSync(env.backupsDir), false);
    assert.equal(fs.existsSync(path.join(env.geminiScriptsDir, 'runtime-health.mjs')), false);
  });
}

test('Empty ownership registry is not treated as a fresh install and reports the registry path', t => {
  const { customRoots, env } = fixture(t);
  const registry = statePath(env);
  put(registry, '');
  put(env.settingsJson, '{"personal":true}');
  assert.throws(() => runInstaller({ customRoots, repoRoot, log() {} }), error => {
    assert.ok(error.message.includes(registry));
    return true;
  });
  assert.equal(fs.readFileSync(registry, 'utf8'), '');
  assert.equal(fs.readFileSync(env.settingsJson, 'utf8'), '{"personal":true}');
});

test('Invalid configuration error includes its path without exposing private JSON values', t => {
  const { customRoots, env } = fixture(t);
  const target = path.join(env.geminiConfigDir, 'mcp_config.json');
  put(target, 'PRIVATE_FIXTURE_TOKEN');
  assert.throws(() => runInstaller({ customRoots, repoRoot, log() {} }), error => {
    assert.ok(error.message.includes(target));
    assert.ok(!error.message.includes('PRIVATE_FIXTURE_TOKEN'));
    return true;
  });
  assert.equal(fs.readFileSync(target, 'utf8'), 'PRIVATE_FIXTURE_TOKEN');
});

test('Repository declares the exact current settings, rules, guides and three local extensions', () => {
  const settings = readJson(path.join(repoRoot, 'config/settings.json'));
  assert.equal(Object.keys(settings).length, 263);
  assert.equal(settings['editor.wordBasedSuggestions'], 'off');
  assert.equal(settings['editor.suggest.showKeywords'], true);
  assert.equal(settings['editor.suggest.showVariables'], true);
  assert.equal(settings['typescript.suggest.autoImports'], true);
  assert.equal(settings['javascript.suggest.autoImports'], true);
  assert.equal(settings['chat.tools.terminal.autoApprove']['npx tsc --noEmit'], true);
  assert.ok(readJson(path.join(repoRoot, 'config/antigravity-settings.json')).permissions.allow.includes('command(npx tsc --noEmit)'));
  assert.deepEqual(fs.readdirSync(path.join(repoRoot, 'rules')).sort(), [
    'GEMINI.template.md', 'workstation-unified-design.template.md', 'workstation-unified-full-stack.template.md',
  ]);
  assert.deepEqual(fs.readdirSync(path.join(repoRoot, 'resources/guides')).sort(), ['design.md', 'full-stack.md']);
  const extensions = readJson(path.join(repoRoot, 'config/extensions.json'));
  assert.equal(extensions.length, 26);
  assert.equal(new Set(extensions.map(item => item.id.toLowerCase())).size, extensions.length);
  assert.equal(extensions.filter(item => item.source === 'gallery').length, 23);
  assert.deepEqual(extensions.filter(item => item.optional).map(item => item.id), ['iranon.jelly-cursor']);
  assert.equal(extensions.filter(item => !item.optional).length, 25);
  assert.deepEqual(extensions.filter(item => item.source === 'local-vsix').map(item => item.id).sort(), [
    'workstation.calm-typescript', 'workstation.git-branch-panel', 'workstation.stability-helper',
  ]);
  const tsRoot = path.join(repoRoot, 'extensions/calm-typescript');
  const manifest = readJson(path.join(tsRoot, 'manifest.json'));
  assert.equal(manifest.id, 'workstation.calm-typescript');
  assert.equal(manifest.version, '3.3.1');
  assert.deepEqual(fs.readdirSync(tsRoot).filter(name => name.endsWith('.vsix')), ['calm-typescript-' + manifest.version + '.vsix']);
  assert.equal(sha256(path.join(tsRoot, 'calm-typescript-3.3.1.vsix')), manifest.vsixSha256);
  assert.equal(extensions.find(item => item.id === manifest.id).version, manifest.version);
  for (const [directory, id] of [
    ['workstation-stability', 'workstation.stability-helper'],
    ['git-branch-panel', 'workstation.git-branch-panel'],
  ]) {
    const manifest = readJson(path.join(repoRoot, 'extensions', directory, 'package.json'));
    assert.equal(manifest.publisher + '.' + manifest.name, id);
    assert.equal(extensions.find(item => item.id === id).version, manifest.version);
  }
});

test('Payload discovers a new skill, rule and script without changing installer code', t => {
  const { base } = fixture(t);
  const source = path.join(base, 'source');
  put(path.join(source, 'rules/future-demo.template.md'), '---\ntrigger: always_on\n---\nCurrent rule.\n');
  put(path.join(source, 'skills/future-demo/SKILL.md'), '---\nname: future-demo\n---\nCurrent skill.\n');
  put(path.join(source, 'scripts/future-demo.mjs'), 'export const current = true;\n');
  for (const name of ['agents', 'resources/guides', 'resources/hooks', 'resources/gsd-core', 'config/jelly-cursor']) fs.mkdirSync(path.join(source, name), { recursive: true });
  const payload = collectPayload(source, 'Шеф');
  assert.deepEqual(payload.map(item => item.key).sort(), [
    'rules/future-demo.md', 'scripts/future-demo.mjs', 'skills/future-demo/SKILL.md',
  ]);
});

test('One isolated full install applies managed settings, keeps personal keys and exercises all three bundled packages', t => {
  const { customRoots, env } = fixture(t);
  put(env.settingsJson, JSON.stringify({ 'user.customSetting': 'KEEP', 'editor.fontSize': 12 }));
  for (const file of [path.join(env.geminiConfigDir, 'mcp_config.json'), path.join(env.geminiDir, 'antigravity/mcp_config.json')]) {
    put(file, JSON.stringify({ mcpServers: { 'docker-mcp': { command: 'docker' },
      'github-mcp-server': { command: 'docker', env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'PRIVATE_FIXTURE_VALUE' } },
      personal: { command: 'custom', env: { API_TOKEN: 'KEEP_PRIVATE_FIXTURE_VALUE' } } } }));
  }
  const staleTs = path.join(env.extensionsDir, 'workstation.calm-typescript-1.1.0');
  put(path.join(staleTs, 'old.txt'), 'old package');
  put(path.join(staleTs, 'package.json'), JSON.stringify({ publisher: 'workstation', name: 'calm-typescript', version: '1.1.0' }));
  const options = { customRoots, repoRoot, skipAgentBrowser: true, skipPermissions: true, log() {} };
  const preview = runInstaller({ ...options, dryRun: true });
  assert.equal(preview.success, true);
  assert.equal(fs.existsSync(path.join(env.geminiDir, 'GEMINI.md')), false);
  const result = runInstaller(options);
  assert.equal(result.success, true, result.failures.join('; '));

  const expected = expectedSettings(env, repoRoot);
  const installed = readJson(env.settingsJson);
  assert.deepEqual(installed, { ...expected, 'user.customSetting': 'KEEP' });
  const plan = readJson(path.join(env.geminiConfigDir, 'workstation-setup/editor-profile.json'));
  assert.deepEqual(plan.settings, expected);
  assert.equal(plan.locale, 'ru');
  assert.equal(readJson(env.argvJson).locale, 'ru');
  for (const file of [path.join(env.geminiConfigDir, 'mcp_config.json'), path.join(env.geminiDir, 'antigravity/mcp_config.json')]) {
    const servers = readJson(file).mcpServers;
    assert.equal(servers['docker-mcp'], undefined);
    assert.equal(servers['github-mcp-server'], undefined);
    assert.equal(servers.personal.env.API_TOKEN, 'KEEP_PRIVATE_FIXTURE_VALUE');
  }
  assert.equal(readJson(path.join(result.backupInfo.backupDir, 'mcp_config.json')).mcpServers['github-mcp-server'].env.GITHUB_PERSONAL_ACCESS_TOKEN, 'PRIVATE_FIXTURE_VALUE');
  assert.equal(installed['user.customSetting'], 'KEEP');
  assert.equal(installed['terminal.integrated.profiles.windows']['Git Bash'].path, env.gitBashPath);
  assert.doesNotMatch(JSON.stringify(installed), /\$\{(?:GIT_BASH_PATH|ANTIGRAVITY_WORKBENCH_HTML)\}/);
  assert.equal(fs.readFileSync(path.join(env.geminiDir, 'GEMINI.md'), 'utf8'), fs.readFileSync(path.join(repoRoot, 'rules/GEMINI.template.md'), 'utf8'));
  for (const name of ['workstation-unified-design', 'workstation-unified-full-stack']) {
    assert.equal(fs.readFileSync(path.join(env.geminiRulesDir, name + '.md'), 'utf8'), fs.readFileSync(path.join(repoRoot, 'rules', name + '.template.md'), 'utf8'));
  }
  assert.deepEqual(fs.readdirSync(env.geminiRulesDir).sort(), ['workstation-unified-design.md', 'workstation-unified-full-stack.md']);
  for (const name of ['design.md', 'full-stack.md']) {
    assert.equal(fs.readFileSync(path.join(env.geminiConfigDir, 'workstation-unified/guides', name), 'utf8'), fs.readFileSync(path.join(repoRoot, 'resources/guides', name), 'utf8'));
  }
  for (const [source, target] of [
    ['config/antigravity-settings.json', path.join(env.geminiDir, 'antigravity/settings.json')],
    ['config/gemini-config.json', path.join(env.geminiConfigDir, 'config.json')],
    ['config/hooks.json', env.nativeHooksJson],
  ]) assert.deepEqual(readJson(target), JSON.parse(homeTemplate(env, source, repoRoot)), source);
  const bundledSkills = readJson(path.join(repoRoot, 'config/skill-inventory.json')).skills;
  assert.deepEqual(readJson(path.join(env.geminiConfigDir, 'skill-inventory.json')).skills, bundledSkills);
  for (const skill of bundledSkills) assert.ok(fs.existsSync(path.join(env.geminiSkillsDir, skill, 'SKILL.md')), skill);
  const additionalPayload = collectPayload(repoRoot, 'Шеф').filter(item => item.key.startsWith('global-skills/') || item.key.startsWith('antigravity-runtime/'));
  assert.equal(additionalPayload.length, 32, 'The complete runtime and extra skill snapshot must be included');
  for (const item of additionalPayload) {
    const target = item.key.startsWith('global-skills/')
      ? path.join(env.geminiDir, 'skills', item.key.slice('global-skills/'.length))
      : path.join(env.geminiDir, 'antigravity', item.key.slice('antigravity-runtime/'.length));
    assert.ok(fs.readFileSync(target).equals(item.content), item.key);
  }
  assert.equal(fs.readFileSync(path.join(env.geminiDir, 'antigravity/.gsd-profile'), 'utf8'), 'full\n');
  for (const name of ['package.json', 'package-lock.json']) {
    assert.ok(fs.readFileSync(path.join(env.geminiConfigDir, 'mcp-runtime', name)).equals(fs.readFileSync(path.join(repoRoot, 'resources/mcp-runtime', name))), name);
  }
  const mcpConfig = readJson(path.join(env.geminiConfigDir, 'mcp_config.json'));
  for (const name of ['chrome-devtools-mcp', 'gsd', 'sequential-thinking']) {
    assert.equal(mcpConfig.mcpServers[name].command, process.execPath.replace(/\\/g, '/'));
    assert.ok(mcpConfig.mcpServers[name].args[0].startsWith(env.userProfile.replace(/\\/g, '/') + '/.gemini/config/mcp-runtime/'));
    assert.doesNotMatch(JSON.stringify(mcpConfig.mcpServers[name]), /\$\{(?:USER_HOME|NODE_EXE)\}/);
  }

  const index = readJson(path.join(env.extensionsDir, 'extensions.json'));
  const tsEntry = index.find(item => item.identifier?.id === 'workstation.calm-typescript' && item.version === '3.3.1');
  assert.ok(tsEntry, 'Calm TypeScript must be registered in isolated extension index');
  const tsBundle = path.join(env.extensionsDir, tsEntry.relativeLocation, 'dist/extension.cjs');
  assert.ok(fs.existsSync(tsBundle));
  const tsManifest = readJson(path.join(repoRoot, 'extensions/calm-typescript/manifest.json'));
  assert.equal(sha256(tsBundle), tsManifest.extensionBundleSha256);
  assert.equal(fs.existsSync(staleTs), false, 'Unregistered Calm TypeScript 1.1.0 directory must be archived');
  const staleBackups = fs.readdirSync(env.backupsDir).filter(name => name.startsWith('calm-typescript-stale-'));
  assert.ok(staleBackups.some(name => fs.existsSync(path.join(env.backupsDir, name, 'workstation.calm-typescript-1.1.0', 'old.txt'))));
  for (const [directory, id, version, required] of [
    ['workstation-stability', 'workstation.stability-helper', '1.3.8', 'maintenance.cjs'],
    ['git-branch-panel', 'workstation.git-branch-panel', '1.3.0', 'extension.js'],
  ]) {
    const target = path.join(env.extensionsDir, id + '-' + version, required);
    assert.ok(fs.existsSync(target), `Bundled ${id}@${version} missing ${required}`);
    assert.equal(sha256(target), sha256(path.join(repoRoot, 'extensions', directory, required)));
  }
  const doctor = runDoctor({ customRoots, log() {} });
  assert.equal(doctor.checks.find(item => item.name === 'Managed editor settings').status, 'pass');
  for (const name of ['Antigravity runtime scripts', 'Additional Android skill locations', 'GSD profile and installation manifests']) {
    assert.equal(doctor.checks.find(item => item.name === name).status, 'pass', name);
  }

  const watched = [env.settingsJson, path.join(env.geminiDir, 'GEMINI.md'), path.join(env.geminiRulesDir, 'workstation-unified-design.md')];
  const mtimes = watched.map(file => fs.statSync(file).mtimeMs);
  const repeat = runInstaller(options);
  assert.equal(repeat.success, true, repeat.failures.join('; '));
  assert.deepEqual(watched.map(file => fs.statSync(file).mtimeMs), mtimes);
});
