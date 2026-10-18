import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { ensureJetBrainsMono } = require('../lib/font');
const { runInstaller, ensureMcpRuntime, verifyMcpRuntime, updateMcpConfig } = require('../lib/installer');
const { installExtension, getInstalledExtensions } = require('../lib/extensions');
const { runDoctor } = require('../lib/doctor');
const { getEnvironmentPaths } = require('../lib/paths');
const { expectedSettings, ensureRussianLanguagePack, languageCacheFile } = require('../lib/profile-settings');
const { createBackup, restoreBackup } = require('../lib/backup');
const root = path.resolve(import.meta.dirname, '..');

function russianLanguageFixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-language-pack-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const envPaths = getEnvironmentPaths({ userProfile: home });
  const id = 'ms-ceintl.vscode-language-pack-ru';
  const entry = { identifier: { id, uuid: 'fixture-official-language-pack' }, version: '1.106.0', relativeLocation: id + '-1.106.0' };
  const directory = path.join(envPaths.extensionsDir, entry.relativeLocation);
  const manifest = { publisher: 'MS-CEINTL', name: 'vscode-language-pack-ru', version: entry.version, contributes: { localizations: [{
    languageId: 'ru', languageName: 'Russian', localizedLanguageName: 'Русский', translations: [
      { id: 'vscode', path: './translations/main.i18n.json' },
      { id: 'vscode.typescript-language-features', path: './translations/typescript.i18n.json' },
    ],
  }] } };
  fs.mkdirSync(path.join(directory, 'translations'), { recursive: true });
  for (const translation of manifest.contributes.localizations[0].translations) {
    fs.writeFileSync(path.join(directory, translation.path), JSON.stringify({ version: '1.0.0', contents: { 'vs/test': { sample: 'Тест' } } }));
  }
  const writeRegistration = () => fs.writeFileSync(path.join(envPaths.extensionsDir, 'extensions.json'), JSON.stringify([entry]));
  const writeManifest = () => fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
  writeRegistration();
  writeManifest();
  return { home, envPaths, entry, directory, manifest, writeRegistration, writeManifest, cache: languageCacheFile(envPaths) };
}

test('Registered Russian translations rebuild the startup language cache and repeat without writing', t => {
  const fixture = russianLanguageFixture(t);
  assert.equal(fixture.cache, path.join(path.dirname(fixture.envPaths.userSettingsDir), 'languagepacks.json'));
  assert.equal(fs.existsSync(fixture.cache), false);
  const result = ensureRussianLanguagePack(fixture.envPaths);
  assert.equal(result.verified, true);
  assert.equal(result.version, fixture.entry.version);
  assert.equal(result.unchanged, false);
  const bytes = fs.readFileSync(fixture.cache, 'utf8');
  const cache = JSON.parse(bytes);
  assert.equal(cache.ru.label, 'Русский');
  assert.match(cache.ru.hash, /^[a-f0-9]{32}$/);
  assert.deepEqual(cache.ru.extensions, [{ extensionIdentifier: fixture.entry.identifier, version: fixture.entry.version }]);
  for (const translation of fixture.manifest.contributes.localizations[0].translations) {
    assert.equal(cache.ru.translations[translation.id], path.join(fixture.directory, translation.path));
    assert.equal(JSON.parse(fs.readFileSync(cache.ru.translations[translation.id])).contents['vs/test'].sample, 'Тест');
  }
  fs.utimesSync(fixture.cache, new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));
  const before = fs.statSync(fixture.cache).mtimeMs;
  assert.equal(ensureRussianLanguagePack(fixture.envPaths).unchanged, true);
  assert.equal(fs.readFileSync(fixture.cache, 'utf8'), bytes);
  assert.equal(fs.statSync(fixture.cache).mtimeMs, before);
  assert.deepEqual(fs.readdirSync(path.dirname(fixture.cache)), ['languagepacks.json']);
});

test('Refreshing Russian language registration preserves every other cached language', t => {
  const fixture = russianLanguageFixture(t);
  const previous = { de: { label: 'Deutsch', translations: { vscode: '/foreign/de.json' }, hash: 'preserved' },
    fr: { label: 'Français', extensions: [] }, ru: { label: 'stale', translations: {} } };
  fs.mkdirSync(path.dirname(fixture.cache), { recursive: true });
  fs.writeFileSync(fixture.cache, JSON.stringify(previous));
  ensureRussianLanguagePack(fixture.envPaths);
  const next = JSON.parse(fs.readFileSync(fixture.cache, 'utf8'));
  assert.deepEqual(next.de, previous.de);
  assert.deepEqual(next.fr, previous.fr);
  assert.equal(next.ru.label, 'Русский');
  assert.ok(next.ru.translations.vscode);
});

test('Language cache preview never creates directories or replaces an existing startup cache', t => {
  const fixture = russianLanguageFixture(t);
  assert.equal(ensureRussianLanguagePack(fixture.envPaths, { dryRun: true }).dryRun, true);
  assert.equal(fs.existsSync(path.dirname(fixture.cache)), false);
  fs.mkdirSync(path.dirname(fixture.cache), { recursive: true });
  const previous = '{ "de": { "label": "Deutsch" } }\r\n';
  fs.writeFileSync(fixture.cache, previous);
  fs.utimesSync(fixture.cache, new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));
  const before = fs.statSync(fixture.cache).mtimeMs;
  ensureRussianLanguagePack(fixture.envPaths, { dryRun: true });
  assert.equal(fs.readFileSync(fixture.cache, 'utf8'), previous);
  assert.equal(fs.statSync(fixture.cache).mtimeMs, before);
  assert.deepEqual(fs.readdirSync(path.dirname(fixture.cache)), ['languagepacks.json']);
});

test('Invalid Russian registrations and translation paths cannot overwrite a startup language cache', t => {
  const cases = [
    ['unsafe registered location', fixture => { fixture.entry.relativeLocation = '../foreign'; fixture.writeRegistration(); }, /Unsafe registered/],
    ['wrong extension identity', fixture => { fixture.manifest.publisher = 'foreign'; fixture.writeManifest(); }, /identity\/version/],
    ['wrong registered version', fixture => { fixture.entry.version = '0.0.0'; fixture.writeRegistration(); }, /identity\/version/],
    ['unsafe translation path', fixture => { fixture.manifest.contributes.localizations[0].translations[0].path = '../foreign.json'; fixture.writeManifest(); }, /Invalid setup-owned relative path/],
    ['missing translation file', fixture => { fs.unlinkSync(path.join(fixture.directory, 'translations/main.i18n.json')); }, /translation file missing/],
    ['missing core translation', fixture => { fixture.manifest.contributes.localizations[0].translations.shift(); fixture.writeManifest(); }, /core editor translation missing/],
    ['malformed core translation', fixture => { fs.writeFileSync(path.join(fixture.directory, 'translations/main.i18n.json'), '{invalid'); }, /JSON|translation|i18n/i],
    ['missing core translation contents', fixture => { fs.writeFileSync(path.join(fixture.directory, 'translations/main.i18n.json'), '{"version":"1.0.0"}'); }, /translation|contents/i],
  ];
  for (const [name, change, pattern] of cases) {
    const fixture = russianLanguageFixture(t);
    fs.mkdirSync(path.dirname(fixture.cache), { recursive: true });
    const previous = '{ "de": { "label": "Deutsch" } }\r\n';
    fs.writeFileSync(fixture.cache, previous);
    change(fixture);
    assert.throws(() => ensureRussianLanguagePack(fixture.envPaths), pattern, name);
    assert.equal(fs.readFileSync(fixture.cache, 'utf8'), previous, name);
    assert.deepEqual(fs.readdirSync(path.dirname(fixture.cache)), ['languagepacks.json'], name);
  }
});

test('A linked language-cache parent is rejected before altering foreign files', t => {
  const fixture = russianLanguageFixture(t);
  const foreign = path.join(fixture.home, 'foreign-profile');
  fs.mkdirSync(foreign);
  const cache = path.join(foreign, 'languagepacks.json');
  const previous = '{ "de": { "label": "Deutsch" } }\r\n';
  fs.writeFileSync(cache, previous);
  const link = path.join(fixture.home, 'linked-profile');
  fs.symlinkSync(foreign, link, 'junction');
  assert.throws(() => ensureRussianLanguagePack({ ...fixture.envPaths, userSettingsDir: path.join(link, 'User') }), /Linked setup path/);
  assert.equal(fs.readFileSync(cache, 'utf8'), previous);
});

test('Backup restores exact language-cache snapshots and older backups preserve the shared language cache', t => {
  for (const mode of ['existing', 'absent', 'legacy']) {
    const existing = mode === 'existing';
    const fixture = russianLanguageFixture(t);
    const previous = '{\r\n  "de": { "label": "Deutsch" },\r\n  "ru": { "label": "old" }\r\n}\r\n';
    if (existing) {
      fs.mkdirSync(path.dirname(fixture.cache), { recursive: true });
      fs.writeFileSync(fixture.cache, previous);
    }
    const backup = createBackup(fixture.envPaths, 'language-cache');
    if (mode === 'legacy') {
      const manifestFile = path.join(backup.backupDir, 'backup-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      delete manifest.schemaVersion; delete manifest.absent;
      fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    }
    assert.equal(backup.backedUp.includes('languagepacks.json'), existing);
    ensureRussianLanguagePack(fixture.envPaths);
    assert.equal(JSON.parse(fs.readFileSync(fixture.cache)).ru.label, 'Русский');
    if (!existing) {
      const cache = JSON.parse(fs.readFileSync(fixture.cache));
      cache.de = { label: 'Deutsch', translations: { vscode: '/foreign/de.json' } };
      cache.fr = { label: 'Français', translations: { vscode: '/foreign/fr.json' } };
      fs.writeFileSync(fixture.cache, JSON.stringify(cache, null, 2) + '\n');
    }
    const beforeRestore = fs.readFileSync(fixture.cache, 'utf8');
    restoreBackup(backup.backupDir, fixture.envPaths, { dryRun: true });
    assert.equal(fs.readFileSync(fixture.cache, 'utf8'), beforeRestore);
    restoreBackup(backup.backupDir, fixture.envPaths);
    if (existing) assert.equal(fs.readFileSync(fixture.cache, 'utf8'), previous);
    else if (mode === 'legacy') assert.equal(fs.readFileSync(fixture.cache, 'utf8'), beforeRestore);
    else assert.equal(fs.existsSync(fixture.cache), false, 'Version 2 backups explicitly restore original absence');
  }
});

test('MCP update removes retired Docker/GitHub launchers, keeps other credentials and repeats without changes', () => {
  const current = { customTop: true, mcpServers: {
    'docker-mcp': { command: 'docker', args: ['old-image'] },
    gsd: { command: 'npx', args: ['old-gsd'], env: { STALE_PATH: 'old', API_TOKEN: 'LOCAL_VALUE' }, disabled: true, $typeName: 'old' },
    'github-mcp-server': { command: 'old-github', env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'LOCAL_GITHUB_VALUE' }, headers: { Authorization: 'Bearer LOCAL_VALUE' } },
    personal: { command: 'personal-launcher', env: { TOKEN: 'KEEP_PERSONAL_VALUE' } },
  } };
  const original = structuredClone(current);
  const template = { mcpServers: {
    gsd: { command: 'node', args: ['current-gsd.js'] },
    'github-mcp-server': { command: 'docker', args: ['run', 'current-image'], disabled: true },
  } };
  const updated = updateMcpConfig(current, template);
  assert.deepEqual(updated.mcpServers.gsd, { command: 'node', args: ['current-gsd.js'], env: { API_TOKEN: 'LOCAL_VALUE' }, disabled: true });
  assert.equal(updated.mcpServers['github-mcp-server'], undefined);
  assert.equal(updated.mcpServers['docker-mcp'], undefined);
  assert.deepEqual(updated.mcpServers.personal, original.mcpServers.personal);
  assert.equal(updated.customTop, true);
  assert.deepEqual(current, original);
  assert.deepEqual(updateMcpConfig(updated, template), updated);
});

test('An isolated user profile never inherits real Windows AppData directories', () => {
  const saved = { APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA };
  try {
    process.env.APPDATA = path.join(os.tmpdir(), 'foreign-real-roaming');
    process.env.LOCALAPPDATA = path.join(os.tmpdir(), 'foreign-real-local');
    const home = path.join(os.tmpdir(), 'isolated-user');
    const paths = getEnvironmentPaths({ userProfile: home });
    assert.equal(paths.appData, path.join(home, 'AppData/Roaming'));
    assert.equal(paths.localAppData, path.join(home, 'AppData/Local'));
    const explicit = getEnvironmentPaths({ userProfile: home, appData: path.join(home, 'custom-roaming') });
    assert.equal(explicit.appData, path.join(home, 'custom-roaming'));
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('Bundled official fonts match every pinned checksum and include the license', () => {
  const pin = require('../config/font.json');
  for (const file of pin.files) {
    const bytes = fs.readFileSync(path.join(root, 'resources/jetbrains-mono/ttf', file.name));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.name);
  }
  assert.match(fs.readFileSync(path.join(root, 'resources/jetbrains-mono/OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE/);
});

test('Doctor reports corrupted skill inventory without crashing or claiming success', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-doctor-inventory-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, '.gemini/config/skill-inventory.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const bytes of ['{broken', '{"skills":null}', '{"skills":[]}', '{"skills":["../foreign"]}']) {
    fs.writeFileSync(file, bytes);
    const result = runDoctor({ customRoots: { userProfile: home }, log: () => {} });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some(check => check.category === 'Skills' && check.name === 'Complete catalog'));
  }
});

test('Doctor compares the whole managed settings template and rejects non-array keybindings', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-doctor-settings-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const gitBashPath = path.join(home, 'Git/bin/bash.exe');
  fs.mkdirSync(path.dirname(gitBashPath), { recursive: true });
  fs.writeFileSync(gitBashPath, 'fixture only');
  const customRoots = { userProfile: home, gitBashPath };
  const directory = getEnvironmentPaths(customRoots).userSettingsDir;
  fs.mkdirSync(directory, { recursive: true });
  const settings = structuredClone(expectedSettings(getEnvironmentPaths(customRoots), root));
  settings['user.foreignSetting'] = 'preserved';
  const file = path.join(directory, 'settings.json');
  fs.writeFileSync(file, JSON.stringify(settings));
  let result = runDoctor({ customRoots, log: () => {} });
  assert.equal(result.checks.find(check => check.name === 'Managed editor settings').status, 'pass');
  delete settings['workbench.colorTheme'];
  fs.writeFileSync(file, JSON.stringify(settings));
  fs.writeFileSync(path.join(directory, 'keybindings.json'), '{}');
  result = runDoctor({ customRoots, log: () => {} });
  const check = result.checks.find(check => check.name === 'Managed editor settings');
  assert.equal(check.status, 'fail');
  assert.match(check.detail, /workbench.colorTheme/);
  assert.ok(result.failures.some(check => check.name === 'keybindings.json valid'));
});

test('Font preview and unsupported platform never start download or change system files', () => {
  const never = () => { throw new Error('Unexpected process launch'); };
  const messages = [];
  const preview = ensureJetBrainsMono({ platform: 'win32', dryRun: true, run: never, log: line => messages.push(line) });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.installed, false);
  assert.match(messages.join('\n'), /16 verified TTFs/);
  const unsupported = ensureJetBrainsMono({ platform: 'linux', run: never });
  assert.equal(unsupported.skipped, true);
  assert.equal(unsupported.installed, false);
});

test('Font Windows process contract streams output and rejects failed verification/launch', () => {
  let calls = 0;
  const result = ensureJetBrainsMono({ platform: 'win32', log: () => {}, run: (file, args, options) => {
    calls++;
    assert.equal(file, 'powershell.exe');
    assert.equal(options.stdio, 'inherit');
    assert.ok(args.includes('-NonInteractive'));
    assert.equal(args[args.indexOf('-ManifestPath') + 1], path.join(root, 'config/font.json'));
    assert.match(options.env.PSModulePath, /WindowsPowerShell\\v1\.0\\Modules$/);
    assert.ok(args.includes(path.join(root, 'scripts/install-font.ps1')));
    return { status: 0 };
  } });
  assert.equal(calls, 1);
  assert.equal(result.installed, true); // Simulated process success, not a Windows runtime test.
  assert.throws(() => ensureJetBrainsMono({ platform: 'win32', log: () => {}, run: () => ({ status: 1 }) }), /verification failed/);
  assert.throws(() => ensureJetBrainsMono({ platform: 'win32', log: () => {}, run: () => ({ error: new Error('Missing PowerShell'), status: null }) }), /Missing PowerShell/);
});

test('Font failure retains the actual stage and reason in the final error and cleans its report', () => {
  let reportPath;
  assert.throws(() => ensureJetBrainsMono({ platform: 'win32', log: () => {}, run: (_file, args) => {
    reportPath = args[args.indexOf('-ErrorReportPath') + 1];
    fs.writeFileSync(reportPath, JSON.stringify({ stage: 'Download official JetBrains Mono archive', message: 'Connection timed out' }));
    return { status: 1 };
  } }), /Download official JetBrains Mono archive: Connection timed out/);
  assert.equal(fs.existsSync(reportPath), false);
  assert.throws(() => ensureJetBrainsMono({ platform: 'win32', log: () => {}, run: (_file, args) => {
    reportPath = args[args.indexOf('-ErrorReportPath') + 1];
    fs.writeFileSync(reportPath, 'invalid report');
    return { status: 1 };
  } }), /verification failed \(exit 1\)/);
  assert.equal(fs.existsSync(reportPath), false);
});

test('Invalid font pin is rejected before a subprocess can launch', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-font-manifest-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(path.join(base, 'config'));
  const pin = require('../config/font.json');
  fs.writeFileSync(path.join(base, 'config/font.json'), JSON.stringify({ ...pin, url: 'https://example.com/unverified.zip' }));
  assert.throws(() => ensureJetBrainsMono({ repoRoot: base, platform: 'win32', run: () => { throw new Error('Must not run'); } }), /Invalid pinned/);
});

test('Full installer reports real skill completion, preserves IDE approvals in scoped opt-out and selects both fonts', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-progress-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const gitBashPath = path.join(home, 'Git/bin/bash.exe');
  fs.mkdirSync(path.dirname(gitBashPath), { recursive: true });
  fs.writeFileSync(gitBashPath, 'fixture only');
  const db = path.join(home, 'AppData/Roaming/Antigravity IDE/User/globalStorage/state.vscdb');
  fs.mkdirSync(path.dirname(db), { recursive: true });
  fs.writeFileSync(db, 'FOREIGN DB: do not touch');
  const messages = [];
  const result = runInstaller({ customRoots: { userProfile: home, gitBashPath }, skipExtensions: true, skipAgentBrowser: true,
    skipPermissions: true, log: line => messages.push(line) });
  assert.equal(result.success, true);
  assert.equal(result.font.skipped, true, 'Isolated profile must not install real fonts');
  assert.equal(result.mcpPermissions.skipped, true);
  assert.equal(fs.readFileSync(db, 'utf8'), 'FOREIGN DB: do not touch');
  const settings = JSON.parse(fs.readFileSync(path.join(home, 'AppData/Roaming/Antigravity IDE/User/settings.json')));
  for (const key of ['editor.fontFamily', 'terminal.integrated.fontFamily']) assert.match(settings[key], /JetBrains Mono/);
  const skillMessages = messages.filter(line => /^  Skill \[/.test(line));
  const bundledSkills = require('../config/skill-inventory.json').skills.length;
  assert.equal(skillMessages.length, bundledSkills);
  assert.ok(skillMessages.at(-1).includes(`[${bundledSkills}/${bundledSkills}] 100%`));
  assert.ok(skillMessages.some(line => line.includes('mansur-frontend-mentor')));
  assert.ok(skillMessages.some(line => line.includes('mansur-practice')));
  const backups = path.join(home, '.gemini/backups');
  const before = fs.readdirSync(backups);
  const preview = execFileSync(process.execPath, [path.join(root, 'bin/mansur-setup.js'), 'backup', '--dry-run'],
    { encoding: 'utf8', env: { ...process.env, USERPROFILE: home, APPDATA: path.join(home, 'AppData/Roaming'), LOCALAPPDATA: path.join(home, 'AppData/Local') } });
  assert.match(preview, /DRY-RUN/);
  assert.deepEqual(fs.readdirSync(backups), before, 'Manual backup preview must not write a backup');
});

test('Extension success requires actual CLI registration; a success message alone cannot pass', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-extension-progress-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const cli = path.join(base, process.platform === 'win32' ? 'test-ide.cmd' : 'test-ide');
  const script = process.platform === 'win32' ? path.join(base, 'test-ide.js') : cli;
  const registered = path.join(base, 'registered');
  fs.writeFileSync(script, `#!${process.execPath}\nconst fs = require('node:fs');\nif (process.argv.includes('--list-extensions') && fs.existsSync(${JSON.stringify(registered)})) console.log('test.demo@1.0.0');\nelse if (process.argv.includes('--install-extension')) console.log('successfully installed');\n`);
  if (process.platform === 'win32') fs.writeFileSync(cli, `@"${process.execPath}" "${script}" %*\r\n`);
  else fs.chmodSync(cli, 0o755);
  assert.equal(installExtension(cli, 'test.demo', { log: () => {} }).success, false);
  fs.writeFileSync(registered, 'registered');
  assert.equal(installExtension(cli, 'test.demo', { log: () => {} }).success, true);
});

function inventoryCli(t, responses) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-extension-inventory-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const cli = path.join(base, process.platform === 'win32' ? 'test-ide.cmd' : 'test-ide');
  const script = process.platform === 'win32' ? path.join(base, 'test-ide.cjs') : cli;
  const counter = path.join(base, 'attempts');
  fs.writeFileSync(script, `#!${process.execPath}
const fs = require('node:fs');
const counter = ${JSON.stringify(counter)};
const attempt = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0;
fs.writeFileSync(counter, String(attempt + 1));
const responses = ${JSON.stringify(responses)};
const response = responses[Math.min(attempt, responses.length - 1)];
console.log(response.output);
process.exit(response.status);
`);
  if (process.platform === 'win32') fs.writeFileSync(cli, `@"${process.execPath}" "${script}" %*\r\n`);
  else fs.chmodSync(cli, 0o755);
  return { cli, base, attempts: () => Number(fs.readFileSync(counter, 'utf8')) };
}

test('Extension inventory retries CLI errors and parses only registered extension rows', t => {
  const fixture = inventoryCli(t, [
    { output: 'temporary CLI failure', status: 1 },
    { output: '[warning] a.b@1.0.0\ncontact support@example.com\nMANCHO.ts-mancho@2.0.0\ntest.demo@1.0.0-beta.1', status: 0 },
  ]);
  assert.deepEqual(getInstalledExtensions(fixture.cli, { strict: true }).map(({ id, version }) => ({ id, version })), [
    { id: 'mancho.ts-mancho', version: '2.0.0' },
    { id: 'test.demo', version: '1.0.0-beta.1' },
  ]);
  assert.equal(fixture.attempts(), 2);
});

test('A transient empty extension list is retried even when the CLI exits successfully', t => {
  const fixture = inventoryCli(t, [
    { output: '', status: 0 },
    { output: 'mancho.ts-mancho@2.0.0', status: 0 },
  ]);
  assert.equal(getInstalledExtensions(fixture.cli, { strict: true })[0].id, 'mancho.ts-mancho');
  assert.equal(fixture.attempts(), 2);
});

test('Unusable extension output fails strict inventory after three attempts', t => {
  const fixture = inventoryCli(t, [{ output: '[warning] temporary CLI issue', status: 0 }]);
  assert.throws(() => getInstalledExtensions(fixture.cli, { strict: true }), /failed after 3 attempts: CLI returned no extension inventory/);
  assert.equal(fixture.attempts(), 3);
  assert.deepEqual(getInstalledExtensions(fixture.cli), []);
  assert.equal(fixture.attempts(), 6);
  assert.throws(() => getInstalledExtensions(path.join(fixture.base, 'missing'), { strict: true }), /CLI unavailable/);
});

test('Doctor reports an inventory failure without declaring every extension missing', t => {
  const fixture = inventoryCli(t, [{ output: '[warning] inventory unavailable', status: 0 }]);
  const result = runDoctor({ customRoots: { userProfile: path.join(fixture.base, 'profile'), cliPath: fixture.cli }, log() {} });
  const extensionChecks = result.checks.filter(check => check.category === 'Extensions');
  assert.equal(result.ok, false);
  assert.equal(extensionChecks.length, 1);
  assert.equal(extensionChecks[0].name, 'Extension inventory');
  assert.equal(extensionChecks[0].status, 'fail');
  assert.match(extensionChecks[0].detail, /no extension inventory/);
  assert.equal(fixture.attempts(), 3);
});

test('Doctor identifies absent optional Jelly Cursor without claiming it was installed or failing its check', t => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'config/extensions.json'), 'utf8'));
  const fixture = inventoryCli(t, [{
    output: catalog.filter(ext => !ext.optional).map(ext => `${ext.id}@${ext.version || '9.0.0'}`).join('\n'), status: 0,
  }]);
  const result = runDoctor({ customRoots: { userProfile: path.join(fixture.base, 'profile'), cliPath: fixture.cli }, log() {} });
  const checks = result.checks.filter(check => check.category === 'Extensions');
  const jelly = checks.find(check => check.name.startsWith('iranon.jelly-cursor@'));
  assert.equal(jelly.status, 'warn');
  assert.match(jelly.detail, /Not installed: optional cursor decoration/);
  assert.ok(checks.filter(check => check !== jelly).every(check => check.status === 'pass'));
  assert.equal(fixture.attempts(), 1);
});

test('Local MCP runtime requires all three pinned versions and entrypoints; previews and isolated installs never launch npm', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-mcp-runtime-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  assert.equal(verifyMcpRuntime(base), false);
  assert.deepEqual(ensureMcpRuntime(base, { dryRun: true, log() {} }), { dryRun: true });
  assert.deepEqual(ensureMcpRuntime(base, { isolated: true, log() {} }), { skipped: true });
  assert.deepEqual(fs.readdirSync(base), []);
  const dependencies = JSON.parse(fs.readFileSync(path.join(root, 'resources/mcp-runtime/package.json'), 'utf8')).dependencies;
  for (const [name, entry] of [
    ['chrome-devtools-mcp', 'build/src/bin/chrome-devtools-mcp.js'],
    ['@opengsd/gsd-core', 'bin/gsd-mcp-server.js'],
    ['@modelcontextprotocol/server-sequential-thinking', 'dist/index.js'],
  ]) {
    const directory = path.join(base, 'node_modules', name);
    fs.mkdirSync(path.dirname(path.join(directory, entry)), { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version: dependencies[name] }));
    fs.writeFileSync(path.join(directory, entry), '');
  }
  assert.equal(verifyMcpRuntime(base), true);
  assert.deepEqual(ensureMcpRuntime(base, { log() {} }), { verified: true, unchanged: true });
  const manifest = path.join(base, 'node_modules/chrome-devtools-mcp/package.json');
  fs.writeFileSync(manifest, '{"version":"0.0.0"}');
  assert.equal(verifyMcpRuntime(base), false);
  fs.writeFileSync(manifest, JSON.stringify({ version: dependencies['chrome-devtools-mcp'] }));
  fs.unlinkSync(path.join(base, 'node_modules/@opengsd/gsd-core/bin/gsd-mcp-server.js'));
  assert.equal(verifyMcpRuntime(base), false);
});
