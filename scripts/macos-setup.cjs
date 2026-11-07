#!/usr/bin/env node
'use strict';
// Applies the Antigravity Workstation profile on macOS from this source tree.
// It writes the same settings, shortcuts, rules, skills, agents, guides, MCP
// servers and hooks as the Windows installer and merges them by the same rules:
// mode 2 keeps the user's own values, mode 1 first moves everything Antigravity
// keeps into one backup (lib/full-reset.js) and starts the IDE once on a new
// profile. Extensions, the MCP runtime, the browser CLI, fonts and the AI Tab
// switch are handled by docs/prompts/MAC-AI-SETUP.md, which runs this script.
//
//   node scripts/macos-setup.cjs --app "/Applications/Antigravity.app" --mode 2 --node "$(command -v node)"
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { readJsonFile } = require('../lib/jsonc');
const settingsRules = require('../lib/profile-settings');
const quiet = require('../lib/quiet-completion');
const { migrateAppearance } = require('../lib/appearance-migration');
const configMerge = require('../lib/config-merge');
const nativeHooks = require('../lib/native-hooks');
const owned = require('../lib/owned-files');
const { typeScriptMemoryLimit } = require('../lib/system-resources');
const { fullReset } = require('../lib/full-reset');

const repo = path.resolve(__dirname, '..');
const IDE_VERSION = '2.6.0';
// The README modes always manage AI suggestions and the 1-second Auto Save (lib/installer.js).
const QUIET_MANAGED_KEYS = new Set(['editor.inlineSuggest.enabled', 'files.autoSave', 'files.autoSaveDelay']);
const WINDOWS_ONLY = ['terminal.integrated.profiles.windows', 'terminal.integrated.defaultProfile.windows'];
// Only --auto-approve writes these; the README modes never do.
const AUTO_APPROVE_ONLY = ['chat.tools.terminal.autoApprove', 'security.workspace.trust.untrustedFiles'];

const exists = file => fs.existsSync(file);
const readJson = (file, empty) => exists(file) ? readJsonFile(file, { jsonc: true, emptyValue: empty }) : empty;
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i], value = () => { if (!argv[i + 1]) throw new Error(arg + ' needs a value'); return argv[++i]; };
    if (arg === '--app') options.app = value();
    else if (arg === '--mode') options.mode = value();
    else if (arg === '--node') options.node = value();
    else if (arg === '--home') options.home = value();
    else if (arg === '--no-launch') options.launch = false;
    else if (arg === '--allow-other-version') options.allowOtherVersion = true;
    else throw new Error('Unknown option: ' + arg);
  }
  return options;
}

function macPaths(home, app) {
  const productFile = path.join(app, 'Contents', 'Resources', 'app', 'product.json');
  if (!exists(productFile)) throw new Error('Not an Antigravity app bundle (no product.json): ' + app);
  const product = JSON.parse(fs.readFileSync(productFile, 'utf8'));
  const pick = (value, pattern, name) => {
    if (typeof value !== 'string' || !pattern.test(value)) throw new Error('Unexpected product.json ' + name + ': ' + value);
    return value;
  };
  const nameShort = pick(product.nameShort, /^Antigravity(?: IDE)?$/i, 'nameShort');
  const dataFolderName = pick(product.dataFolderName, /^\.antigravity(?:-ide)?$/i, 'dataFolderName');
  const applicationName = pick(product.applicationName, /^antigravity(?:-ide)?$/i, 'applicationName');
  const appSupport = path.join(home, 'Library', 'Application Support');
  const userDir = path.join(appSupport, nameShort, 'User');
  const geminiDir = path.join(home, '.gemini'), configDir = path.join(geminiDir, 'config');
  const workbenches = ['electron-browser', 'electron-sandbox'].map(renderer =>
    path.join(app, 'Contents', 'Resources', 'app', 'out', 'vs', 'code', renderer, 'workbench', 'workbench.html'));
  return {
    product, nameShort, dataFolderName, applicationName, appSupport, userDir, geminiDir, configDir,
    settingsJson: path.join(userDir, 'settings.json'), keybindingsJson: path.join(userDir, 'keybindings.json'),
    stateDb: path.join(userDir, 'globalStorage', 'state.vscdb'), argvJson: path.join(home, dataFolderName, 'argv.json'),
    extensionsDir: path.join(home, dataFolderName, 'extensions'), cli: path.join(app, 'Contents', 'Resources', 'app', 'bin', applicationName),
    workbench: workbenches.find(exists) || workbenches[0], backupsDir: path.join(geminiDir, 'backups'),
  };
}

const ideRunning = app => spawnSync('pgrep', ['-f', path.join(app, 'Contents', 'MacOS') + '/'], { stdio: 'ignore' }).status === 0;

// After a full reset the IDE is as on a new Mac; one short start creates its
// profile. The window is the setup's own and holds no work.
function firstStart(app, paths, log) {
  log('Starting Antigravity once on the new profile; it closes by itself...');
  spawnSync('open', [app], { stdio: 'ignore' });
  for (let waited = 0; !exists(paths.stateDb); waited++) {
    if (waited >= 180) throw new Error('Antigravity did not create its new profile within 3 minutes: ' + paths.stateDb);
    pause(1000);
  }
  pause(10000);
  spawnSync('osascript', ['-e', 'tell application "' + app.replace(/"/g, '\\"') + '" to quit'], { stdio: 'ignore' });
  for (let waited = 0; ideRunning(app); waited++) {
    if (waited >= 90) { spawnSync('pkill', ['-f', path.join(app, 'Contents', 'MacOS') + '/'], { stdio: 'ignore' }); pause(3000); break; }
    pause(1000);
  }
  if (ideRunning(app)) throw new Error('The new Antigravity window did not close; quit it (Cmd+Q) and run mode 2.');
}

// lib/installer.js updateMcpConfig: managed servers are refreshed, personal
// servers and their credentials stay, the setup-3.0 GSD server goes.
function updateMcpConfig(current, template) {
  const overlay = (previous, managed) => {
    if (!managed || typeof managed !== 'object' || Array.isArray(managed)) return structuredClone(managed);
    const merged = previous && typeof previous === 'object' && !Array.isArray(previous) ? structuredClone(previous) : {};
    for (const [key, value] of Object.entries(managed)) merged[key] = overlay(merged[key], value);
    return merged;
  };
  const result = structuredClone(current);
  result.mcpServers ||= {};
  const gsd = result.mcpServers.gsd;
  if (Array.isArray(gsd?.args) && gsd.args.some(arg => /mcp-runtime[\\/]node_modules[\\/]@opengsd[\\/]gsd-core[\\/]/.test(String(arg)))) delete result.mcpServers.gsd;
  for (const [name, definition] of Object.entries(template.mcpServers)) {
    const previous = current.mcpServers?.[name];
    const server = overlay(previous, definition);
    if (previous && (Object.hasOwn(server, 'disabled') || typeof previous.disabled === 'boolean')) server.disabled = previous.disabled === true;
    for (const field of ['env', 'headers']) {
      const credentials = { ...server[field] };
      for (const [key, value] of Object.entries(previous?.[field] || {})) if (/token|key|secret|password|authorization/i.test(key)) credentials[key] = value;
      if (Object.keys(credentials).length) server[field] = credentials;
    }
    delete server.$typeName;
    result.mcpServers[name] = server;
  }
  return result;
}

function run(options = {}) {
  const log = options.log || console.error;
  const home = path.resolve(options.home || os.homedir());
  const app = options.app && path.resolve(options.app);
  const mode = String(options.mode || '');
  if (!app) throw new Error('--app is required (the Antigravity .app bundle)');
  if (!['1', '2'].includes(mode)) throw new Error('--mode must be 1 (full reset) or 2 (install or update)');
  if (process.platform !== 'darwin' && !options.home) throw new Error('This script is for macOS; Windows uses scripts/bootstrap.ps1');
  const live = !options.home;
  const paths = macPaths(home, app);
  const ideVersion = String(paths.product.ideVersion || '');
  if (ideVersion !== IDE_VERSION && !options.allowOtherVersion) throw new Error('Antigravity ' + IDE_VERSION + ' is required; this app is ' + (ideVersion || 'unknown') + '. Nothing was changed.');
  if (live && ideRunning(app)) throw new Error('Quit Antigravity first (Cmd+Q on every window); nothing was changed.');
  const nodeExe = options.node || process.execPath;
  const setupVersion = readJsonFile(path.join(repo, 'package.json')).version;

  let resetBackup = null;
  if (mode === '1') {
    const reset = fullReset({ appData: paths.appSupport, userProfile: home, ideRoot: null, geminiDir: paths.geminiDir, backupsDir: paths.backupsDir }, { repoRoot: repo });
    resetBackup = reset.backup;
    log('Full reset backup: ' + reset.backup);
    if (live && options.launch !== false) firstStart(app, paths, log);
  }

  // Everything is read and checked before the first write.
  owned.validateSourcePayload(repo);
  const payloadEnv = { geminiDir: paths.geminiDir, geminiConfigDir: paths.configDir, geminiRulesDir: path.join(paths.configDir, 'rules'),
    geminiSkillsDir: path.join(paths.configDir, 'skills'), geminiScriptsDir: path.join(paths.geminiDir, 'scripts'),
    antigravityStateDir: path.join(home, '.antigravity'), backupsDir: paths.backupsDir };
  const payloadPlan = owned.planPayload(payloadEnv, repo, 'Разработчик');

  const setupSettings = JSON.parse(fs.readFileSync(path.join(repo, 'config', 'settings.json'), 'utf8'));
  for (const key of [...WINDOWS_ONLY, ...AUTO_APPROVE_ONLY]) delete setupSettings[key];
  setupSettings['typescript.tsserver.maxTsServerMemory'] = typeScriptMemoryLimit(options.totalMemoryBytes || os.totalmem());
  setupSettings['jellyCursor.workbenchHtmlPath'] = paths.workbench;
  const currentSettings = mode === '1' ? {} : readJson(paths.settingsJson, {});
  const editorProfile = path.join(paths.configDir, 'workstation-setup', 'editor-profile.json');
  const migration = migrateAppearance(currentSettings, readJson(editorProfile, null));
  Object.assign(setupSettings, settingsRules.managedLanguageSettings(currentSettings, setupSettings));
  Object.assign(setupSettings, quiet.mergeQuietSettings(setupSettings, quiet.quietSettings(currentSettings)));
  for (const key of Object.keys(setupSettings)) {
    if (!Object.hasOwn(currentSettings, key) || QUIET_MANAGED_KEYS.has(key) || key.startsWith('[')) continue;
    if ((currentSettings[key] && typeof currentSettings[key] === 'object') || settingsRules.isRetiredManagedValue(key, currentSettings[key])) continue;
    setupSettings[key] = structuredClone(migration.settings[key]);
  }
  const settings = settingsRules.mergeSettings(migration.settings, setupSettings, { userLanguageOverrides: false });
  for (const key of Object.keys(currentSettings)) {
    if (!Object.hasOwn(settings, key) && !settingsRules.isRetiredSetting(key)) settings[key] = structuredClone(currentSettings[key]);
  }
  const setupBindings = readJsonFile(path.join(repo, 'config', 'keybindings.json'));
  const keybindings = settingsRules.mergeKeybindings(setupBindings, mode === '1' ? [] : readJson(paths.keybindingsJson, []));
  if (!Array.isArray(keybindings)) throw new Error('keybindings.json must contain an array: ' + paths.keybindingsJson);
  const argv = { ...readJsonFile(path.join(repo, 'config', 'argv.json')), ...readJson(paths.argvJson, {}) };

  const template = relative => JSON.parse(settingsRules.homeTemplate({ userProfile: home, nodeExe, gitBashPath: '/bin/bash' }, relative, repo));
  const agentSettingsFile = path.join(paths.geminiDir, 'antigravity', 'settings.json');
  const agentManaged = template('config/antigravity-settings.json');
  const agentActive = configMerge.retireOwnedHooks(readJson(agentSettingsFile, {}), template('config/migrations/retired-context-hook.template.json'), agentManaged);
  const geminiConfigFile = path.join(paths.configDir, 'config.json');
  const hooksFile = nativeHooks.nativeHooksPath({ geminiDir: paths.geminiDir, applicationName: paths.applicationName });
  const legacyHooks = readJson(path.join(paths.configDir, 'hooks.json'), {});
  const mcpFiles = [[path.join(paths.configDir, 'mcp_config.json'), 'active.template.json'],
    [path.join(paths.geminiDir, 'antigravity', 'mcp_config.json'), 'mcp_antigravity.template.json']];
  const json = value => JSON.stringify(value, null, 2);
  const writes = [
    [paths.settingsJson, json(settings)],
    [paths.keybindingsJson, json(keybindings)],
    [paths.argvJson, json(argv)],
    [path.join(paths.geminiDir, 'GEMINI.md'), fs.readFileSync(path.join(repo, 'rules', 'GEMINI.template.md'))],
    [agentSettingsFile, json(configMerge.mergeUserConfiguration(agentActive, agentManaged, { allowPermissions: false }))],
    [geminiConfigFile, json(configMerge.mergeUserConfiguration(readJson(geminiConfigFile, {}), template('config/gemini-config.json'), { allowPermissions: false }))],
    [hooksFile, json(nativeHooks.mergeNativeHooks({ ...legacyHooks, ...readJson(hooksFile, {}) }, template('config/hooks.json')))],
    ...mcpFiles.map(([file, name]) => [file, json(updateMcpConfig(readJson(file, { mcpServers: {} }), template('config/mcp/' + name)))]),
    [path.join(paths.configDir, 'workstation-setup', 'install-options.json'), json({ schema: 1, extensionProfile: 'full', setupVersion })],
    // The Stability extension applies these settings to the active IDE profile on its next start.
    [editorProfile, json({ schema: 1, requestId: crypto.randomUUID(), setupVersion, locale: typeof argv.locale === 'string' ? argv.locale : 'ru',
      preserveExisting: false, settings: setupSettings })],
  ];

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
  const backup = path.join(paths.backupsDir, 'macos-setup-' + stamp);
  const written = [];
  for (const [file, content] of writes) {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    if (exists(file) && fs.readFileSync(file).equals(bytes)) continue;
    if (exists(file)) {
      const copy = path.join(backup, path.relative(home, file));
      fs.mkdirSync(path.dirname(copy), { recursive: true, mode: 0o700 });
      fs.copyFileSync(file, copy);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, file);
    written.push(file);
  }
  const payload = owned.applyPayload(payloadEnv, payloadPlan);
  const skillsDir = payloadEnv.geminiSkillsDir;
  const skills = fs.readdirSync(skillsDir).filter(name => /^[a-z0-9][a-z0-9-]*$/.test(name) && exists(path.join(skillsDir, name, 'SKILL.md'))).sort();
  fs.writeFileSync(path.join(paths.configDir, 'skill-inventory.json'), json({ skills }));

  return { ideVersion, mode, app, cli: paths.cli, userDir: paths.userDir, extensionsDir: paths.extensionsDir, stateDb: paths.stateDb,
    workbench: paths.workbench, resetBackup, backup: exists(backup) ? backup : null, written,
    payload: { changed: payload.changed.length, removed: payload.removed, preserved: payload.preserved, backup: payload.backup } };
}

if (require.main === module) {
  try { console.log(JSON.stringify(run(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error('macOS setup stopped: ' + error.message); process.exit(1); }
}

module.exports = { run, parseArgs, macPaths, updateMcpConfig };
