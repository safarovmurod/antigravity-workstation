'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { isDeepStrictEqual } = require('node:util');
const { getEnvironmentPaths } = require('./paths');
const { parseJsonc } = require('./jsonc');
const { getInstalledExtensions } = require('./extensions');
const { expectedSettings, homeTemplate, languageCacheFile } = require('./profile-settings');
const { verifyMcpRuntime } = require('./installer');

function matchesSnapshot(source, target) {
  if (!fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink()) return false;
  if (fs.statSync(source).isFile()) return fs.statSync(target).isFile() && fs.readFileSync(source).equals(fs.readFileSync(target));
  return fs.statSync(target).isDirectory() && fs.readdirSync(source).every(name => matchesSnapshot(path.join(source, name), path.join(target, name)));
}

function runDoctor(options = {}) {
  const envPaths = getEnvironmentPaths(options.customRoots);
  const log = options.log || console.log;

  const checks = [];
  function addCheck(category, name, status, detail = '') {
    checks.push({ category, name, status, detail });
    const icon = status === 'pass' ? '✓' : status === 'warn' ? '⚠' : '✗';
    log(`  [${icon}] ${category} -> ${name}${detail ? ` (${detail})` : ''}`);
  }

  log('\n=== Antigravity Setup Doctor ===\n');

  // 1. Environment & Prerequisites
  if (process.platform === 'win32') {
    addCheck('System', 'Windows OS', 'pass', process.platform);
  } else {
    addCheck('System', 'Windows OS', 'warn', `Non-Windows platform (${process.platform})`);
  }

  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (major >= 24) {
    addCheck('Node.js', 'Node Version', 'pass', nodeVersion);
  } else {
    addCheck('Node.js', 'Node Version', 'fail', `${nodeVersion} (requires Node >= 24)`);
  }

  try {
    const npmVersion = execSync(process.platform === 'win32' ? 'npm.cmd --version' : 'npm --version',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    addCheck('npm', 'npm Version', /^\d+\./.test(npmVersion) && Number(npmVersion.split('.')[0]) >= 10 ? 'pass' : 'fail',
      npmVersion + ' (requires npm >= 10)');
  } catch (_) { addCheck('npm', 'npm Version', 'fail', 'npm not found in PATH'); }

  // Git check
  try {
    const gitVer = execSync('git --version', { encoding: 'utf8' }).trim();
    addCheck('Git', 'Git CLI', 'pass', gitVer);
  } catch (_) {
    addCheck('Git', 'Git CLI', 'fail', 'Git not found in PATH');
  }

  // Git Bash path
  if (fs.existsSync(envPaths.gitBashPath)) {
    addCheck('Git', 'Git Bash Path', 'pass', envPaths.gitBashPath);
  } else {
    addCheck('Git', 'Git Bash Path', 'warn', `Not found at ${envPaths.gitBashPath}`);
  }

  // 2. Antigravity IDE
  if (envPaths.cliPath && fs.existsSync(envPaths.cliPath)) {
    addCheck('Antigravity', 'IDE CLI', 'pass', envPaths.cliPath);
  } else {
    addCheck('Antigravity', 'IDE CLI', 'warn', 'CLI not found. Check installation in LocalAppData');
  }

  // 3. Configuration & User Settings
  if (fs.existsSync(envPaths.settingsJson)) {
    try {
      const content = fs.readFileSync(envPaths.settingsJson, 'utf8');
      const settings = parseJsonc(content);

      const hasPrettier = settings['editor.defaultFormatter'] === 'esbenp.prettier-vscode';
      const hasCursor = settings['editor.cursorSmoothCaretAnimation'] === 'on';
      const hasRippleDisabled = settings['jellyCursor.rippleEnabled'] === false;
      const hasFormatOnSave = settings['editor.formatOnSave'] === true;

      addCheck('Settings', 'settings.json exists', 'pass', envPaths.settingsJson);
      addCheck('Settings', 'Prettier Formatter Default', hasPrettier ? 'pass' : 'warn');
      addCheck('Settings', 'Native Smooth Cursor', hasCursor ? 'pass' : 'warn');
      addCheck('Settings', 'Jelly Ripple Disabled', hasRippleDisabled ? 'pass' : 'warn');
      addCheck('Settings', 'Format On Save', hasFormatOnSave ? 'pass' : 'warn');
      const expected = expectedSettings(envPaths);
      function matchesExpected(actual, expected) {
        if (Array.isArray(expected)) return JSON.stringify(actual) === JSON.stringify(expected);
        if (expected && typeof expected === 'object') {
          return actual && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => matchesExpected(actual[key], value));
        }
        return actual === expected;
      }
      const commandPolicy = settings['chat.tools.terminal.autoApprove'];
      for (const command of Object.keys(expected['chat.tools.terminal.autoApprove'] || {})) {
        if (commandPolicy?.[command] === false) expected['chat.tools.terminal.autoApprove'][command] = false;
      }
      const changedSettings = Object.keys(expected).filter(key => !matchesExpected(settings[key], expected[key]));
      addCheck('Settings', 'Managed editor settings', changedSettings.length ? 'fail' : 'pass',
        `${Object.keys(expected).length} expected; ${changedSettings.length} missing/different`
        + (changedSettings.length ? ': ' + changedSettings.slice(0, 8).join(', ') : ''));
      addCheck('Font', 'JetBrains Mono selected for editor and terminal',
        String(settings['editor.fontFamily'] || '').includes('JetBrains Mono') && String(settings['terminal.integrated.fontFamily'] || '').includes('JetBrains Mono') ? 'pass' : 'warn');
      if (process.platform === 'win32' && !options.customRoots?.userProfile) {
        const manifest = require('../config/font.json');
        const crypto = require('node:crypto');
        const fontDir = path.join(envPaths.localAppData, 'Microsoft', 'Windows', 'Fonts');
        const valid = manifest.files.every(file => {
          const target = path.join(fontDir, file.name);
          return fs.existsSync(target) && crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') === file.sha256;
        });
        addCheck('Font', 'Pinned user TTF files verified', valid ? 'pass' : 'warn', valid ? '16 checksums match; registration is verified during install' : 'Run full install again to install/verify the font; --skip-font preserves an existing font setup');
      } else addCheck('Font', 'Windows font registration', 'warn', 'Not checked on this platform / isolated profile');
    } catch (e) {
      addCheck('Settings', 'settings.json parsed', 'fail', e.message);
    }
  } else {
    addCheck('Settings', 'settings.json exists', 'fail', 'Not created yet');
  }

  // Keybindings
  if (fs.existsSync(envPaths.keybindingsJson)) {
    try {
      const kb = parseJsonc(fs.readFileSync(envPaths.keybindingsJson, 'utf8'), []);
      if (!Array.isArray(kb)) throw new Error('keybindings.json must contain an array');
      const count = kb.length;
      addCheck('Settings', 'keybindings.json valid', 'pass', `${count} entries`);
      const expected = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/keybindings.json'), 'utf8'));
      addCheck('Settings', 'Managed keybindings', expected.every(binding => kb.some(actual => isDeepStrictEqual(actual, binding))) ? 'pass' : 'fail');
    } catch (e) {
      addCheck('Settings', 'keybindings.json valid', 'fail', e.message);
    }
  } else {
    addCheck('Settings', 'keybindings.json valid', 'fail', 'Not created yet');
  }

  try {
    const argv = parseJsonc(fs.readFileSync(envPaths.argvJson, 'utf8'));
    addCheck('Settings', 'Russian display language selected', argv.locale === 'ru' ? 'pass' : 'fail',
      envPaths.argvJson + '; full IDE restart required; the editor helper checks the running language');
  } catch { addCheck('Settings', 'Russian display language selected', 'fail', 'Run full setup to write valid argv.json'); }
  try {
    const cache = JSON.parse(fs.readFileSync(languageCacheFile(envPaths), 'utf8'));
    const ready = typeof cache.ru?.translations?.vscode === 'string' && fs.existsSync(cache.ru.translations.vscode);
    addCheck('Settings', 'Russian startup translation cache', ready ? 'pass' : 'fail', ready ? 'Core translation file exists; running language is checked by the editor helper' : 'Rerun setup to rebuild the language cache');
  } catch { addCheck('Settings', 'Russian startup translation cache', options.customRoots?.userProfile ? 'warn' : 'fail', 'Language cache absent/invalid; rerun full setup'); }

  // 4. Global Rules and Gemini Config
  const geminiMd = path.join(envPaths.geminiDir, 'GEMINI.md');
  if (fs.existsSync(geminiMd)) {
    const current = fs.readFileSync(geminiMd);
    const expected = fs.readFileSync(path.join(__dirname, '../rules/GEMINI.template.md'));
    addCheck('Rules', 'Global GEMINI.md', current.equals(expected) ? 'pass' : 'fail', geminiMd);
  } else {
    addCheck('Rules', 'Global GEMINI.md', 'fail', 'Not found in ~/.gemini/GEMINI.md');
  }

  for (const name of ['mansur-unified-design', 'mansur-unified-full-stack']) {
    const current = path.join(envPaths.geminiRulesDir, name + '.md');
    const expected = path.join(__dirname, '../rules', name + '.template.md');
    addCheck('Rules', name, fs.existsSync(current) && fs.readFileSync(current).equals(fs.readFileSync(expected)) ? 'pass' : 'warn');
  }
  for (const name of ['design.md', 'full-stack.md']) {
    const current = path.join(envPaths.geminiConfigDir, 'mansur-unified/guides', name);
    const expected = path.join(__dirname, '../resources/guides', name);
    addCheck('Guides', name, fs.existsSync(current) && fs.readFileSync(current).equals(fs.readFileSync(expected)) ? 'pass' : 'warn');
  }

  // 5. Skills
  try {
    const plan = require('./owned-files').planPayload(envPaths, path.resolve(__dirname, '..'), 'Мансур');
    addCheck('Payload', 'All managed files', plan.writes.length || plan.removals.length ? 'fail' : 'pass',
      plan.expectedCount + ' expected; ' + plan.writes.length + ' missing/different; ' + plan.removals.length + ' obsolete');
  } catch (error) { addCheck('Payload', 'All managed files', 'fail', error.message); }
  for (const [template, target] of [
    ['config/antigravity-settings.json', path.join(envPaths.geminiDir, 'antigravity/settings.json')],
    ['config/hooks.json', path.join(envPaths.geminiConfigDir, 'hooks.json')],
    ['config/gemini-config.json', path.join(envPaths.geminiConfigDir, 'config.json')],
  ]) {
    try {
      const expected = JSON.parse(homeTemplate(envPaths, template));
      const actual = JSON.parse(fs.readFileSync(target, 'utf8'));
      addCheck('Settings', template, isDeepStrictEqual(actual, expected) ? 'pass' : 'fail', 'Rendered paths and configuration');
    } catch { addCheck('Settings', template, 'fail', 'Missing or invalid managed configuration'); }
  }
  const mentorSkill = path.join(envPaths.geminiSkillsDir, 'mansur-frontend-mentor', 'SKILL.md');
  const agentBrowserSkill = path.join(envPaths.geminiSkillsDir, 'agent-browser', 'SKILL.md');
  const practiceSkill = path.join(envPaths.geminiSkillsDir, 'mansur-practice', 'SKILL.md');
  const vercelSkill = path.join(envPaths.geminiSkillsDir, 'vercel-react-best-practices', 'SKILL.md');
  addCheck('Skills', 'mansur-frontend-mentor skill', fs.existsSync(mentorSkill) ? 'pass' : 'warn');
  addCheck('Skills', 'agent-browser skill', fs.existsSync(agentBrowserSkill) ? 'pass' : 'warn');
  addCheck('Skills', 'mansur-practice skill', fs.existsSync(practiceSkill) ? 'pass' : 'warn');
  addCheck('Skills', 'vercel-react-best-practices skill', fs.existsSync(vercelSkill) ? 'pass' : 'warn');

  // 6. Scripts & Practice Engine
  const engineScript = path.join(envPaths.geminiScriptsDir, 'practice-engine.mjs');
  addCheck('Scripts', 'practice-engine.mjs', fs.existsSync(engineScript) ? 'pass' : 'warn');
  const runtimeSource = path.join(__dirname, '../resources/antigravity-runtime');
  const runtimeTarget = path.join(envPaths.geminiDir, 'antigravity');
  addCheck('Scripts', 'Antigravity runtime scripts', matchesSnapshot(path.join(runtimeSource, 'scripts'), path.join(runtimeTarget, 'scripts')) ? 'pass' : 'fail', '23 source files');
  const additionalSkillsMatch = matchesSnapshot(path.join(__dirname, '../resources/global-skills'), path.join(envPaths.geminiDir, 'skills'))
    && matchesSnapshot(path.join(runtimeSource, 'skills'), path.join(runtimeTarget, 'skills'));
  addCheck('Skills', 'Additional Android skill locations', additionalSkillsMatch ? 'pass' : 'fail', 'Both current skill directories');
  const gsdConfigMatches = ['.gsd-profile', 'gsd-install-state.json', 'gsd-file-manifest.json'].every(name => matchesSnapshot(path.join(runtimeSource, name), path.join(runtimeTarget, name)));
  addCheck('Settings', 'GSD profile and installation manifests', gsdConfigMatches ? 'pass' : 'fail');
  const mcpRuntimeVerified = verifyMcpRuntime(path.join(envPaths.geminiConfigDir, 'mcp-runtime'));
  addCheck('MCP', 'Three pinned local runtimes', options.customRoots?.userProfile ? 'warn' : mcpRuntimeVerified ? 'pass' : 'fail',
    options.customRoots?.userProfile ? 'Dependency installation skipped for isolated profile' : 'Versions and entrypoints checked; tool calls verified separately');

  // 7. Extensions
  try {
    const installed = getInstalledExtensions(envPaths.cliPath, { strict: true });
    addCheck('Extensions', 'Total registered extensions', 'pass', `${installed.length} found`);

    const installOptionsFile = path.join(envPaths.geminiConfigDir, 'mansur-setup/install-options.json');
    const savedOptions = fs.existsSync(installOptionsFile) ? JSON.parse(fs.readFileSync(installOptionsFile, 'utf8')) : {};
    const extensionProfile = options.extensionProfile || savedOptions.extensionProfile || 'full';
    const criticalExts = require('./extension-profiles').selectExtensions(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'extensions.json'), 'utf8')), extensionProfile);
    addCheck('Extensions', 'Selected installation profile', 'pass', extensionProfile + '; additional installed extensions are retained');
    for (const ext of criticalExts) {
      const actual = installed.find(i => i.id === ext.id.toLowerCase());
      const unpinned = ext.trackLatest === true;
      const label = ext.id + (ext.version ? '@' + ext.version : ' (latest)');
      const exact = actual?.version === ext.version;
      const status = exact ? 'pass'
        : unpinned ? (actual ? 'pass' : 'fail')
        : ext.optional === true || (actual && ext.allowCompatibleVersion) ? 'warn' : 'fail';
      const detail = !actual
        ? (ext.optional === true ? 'Not installed: optional cursor decoration, excluded from default setup' : '')
        : unpinned ? `registered ${actual.version}; latest is checked online during install/update (Doctor checks local registration only)`
        : exact ? ''
        : `registered ${actual.version}${ext.allowCompatibleVersion ? '; compatible fallback, preferred version unavailable' : '; snapshot version differs'}`;
      addCheck('Extensions', label, status, detail);
    }
  } catch (error) {
    addCheck('Extensions', 'Extension inventory', 'fail', error.message);
  }

  // MCP credentials are never printed. Docker is only needed for a docker entry.
  for (const file of [path.join(envPaths.geminiConfigDir, 'mcp_config.json'), path.join(envPaths.geminiDir, 'antigravity', 'mcp_config.json')]) {
    if (!fs.existsSync(file)) { addCheck('MCP', path.basename(path.dirname(file)), 'fail', 'Config absent'); continue; }
    try {
      const servers = JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers || {};
      const template = path.dirname(file) === envPaths.geminiConfigDir ? 'active.template.json' : 'mcp_antigravity.template.json';
      const expected = JSON.parse(homeTemplate(envPaths, 'config/mcp/' + template)).mcpServers;
      for (const [name, definition] of Object.entries(expected)) {
        const actual = servers[name];
        const matches = actual?.command === definition.command && isDeepStrictEqual(actual?.args, definition.args);
        addCheck('MCP', name + ' launcher: ' + path.basename(path.dirname(file)), matches ? 'pass' : 'fail',
          matches ? 'Matches pinned local runtime' : 'Missing or incorrect command/arguments; rerun setup');
      }
      const retired = ['docker-mcp', 'github-mcp-server'].filter(name => Object.hasOwn(servers, name));
      addCheck('MCP', 'Retired Docker/GitHub launchers absent: ' + path.basename(path.dirname(file)), retired.length ? 'fail' : 'pass',
        retired.length ? 'Rerun setup to remove retired launchers' : 'No Docker dependency in the managed MCP catalog');
      for (const [name, server] of Object.entries(servers)) {
        const placeholder = /YOUR_[A-Z_]+/.test(JSON.stringify(server));
        addCheck('MCP', name + ' configuration', server.disabled || placeholder ? 'warn' : 'pass', server.disabled || placeholder ? 'Needs local credentials/enablement' : 'Configured; live tools not proven');
        if (server.command === 'docker' && !server.disabled) {
          try { execSync('docker --version', { stdio: 'ignore' }); addCheck('MCP', 'Docker launcher', 'pass'); }
          catch (_) { addCheck('MCP', 'Docker launcher', 'warn', 'Required by this entry; hosted alternative in docs/MCP_SETUP.md'); }
        }
      }
    } catch (_) { addCheck('MCP', 'Config JSON', 'fail', 'Invalid JSON; not showing contents'); }
  }
  const inventoryPath = path.join(envPaths.geminiConfigDir, 'skill-inventory.json');
  if (fs.existsSync(inventoryPath)) {
    try {
      const names = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')).skills;
      if (!Array.isArray(names) || !names.length || names.some(name => typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(name))) {
        throw new Error('Invalid skill inventory');
      }
      const missing = names.filter(name => !fs.existsSync(path.join(envPaths.geminiSkillsDir, name, 'SKILL.md')));
      addCheck('Skills', 'Complete catalog', missing.length ? 'fail' : 'pass', names.length + ' expected, ' + missing.length + ' missing');
    } catch (_) { addCheck('Skills', 'Complete catalog', 'fail', 'Invalid skill inventory; rerun install to rebuild it'); }
  } else addCheck('Skills', 'Complete catalog', 'warn', 'Run installer');
  const gsd = path.join(envPaths.geminiDir, 'antigravity', 'gsd-core', 'workflows', 'fast.md');
  addCheck('Skills', 'GSD workflow dependency', fs.existsSync(gsd) ? 'pass' : 'warn');

  // 9. Browser Automation & Runtime
  try {
    const abVer = execSync('agent-browser --version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    addCheck('Browser Automation', 'agent-browser CLI', 'pass', abVer);
  } catch (_) {
    addCheck('Browser Automation', 'agent-browser CLI', 'warn', 'Not found in PATH (install via npm i -g agent-browser)');
  }

  try {
    const runtime = require('./browser-runtime').findBrowserRuntime({ envPaths });
    addCheck('Browser Automation', 'Chromium browser executable', runtime ? 'pass' : 'warn',
      runtime ? runtime.source + ': ' + runtime.executable + '; live launch is verified during install' : 'Not found; run full setup with Chrome or Edge available');
  } catch (error) { addCheck('Browser Automation', 'Chromium browser executable', 'fail', error.message); }

  const permissionDb = path.join(envPaths.userSettingsDir, 'globalStorage', 'state.vscdb');
  if (fs.existsSync(permissionDb)) {
    let db;
    try {
      const { DatabaseSync } = require('node:sqlite');
      db = new DatabaseSync(permissionDb, { readOnly: true });
      const { TOPIC_KEY, readMcpPolicy } = require('./mcp-permissions');
      const nativeValue = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY)?.value || '';
      const policy = readMcpPolicy(nativeValue);
      const { readPolicies, POLICIES, TAB_TOPIC_KEY, TAB_POLICIES, readTabPolicies } = require('./agent-automation');
      const modes = readPolicies(nativeValue);
      addCheck('Agent', 'Native terminal/artifact automation', Object.entries(POLICIES).every(([key, value]) => modes[key] === value) ? 'pass' : 'warn',
        'Stored modes only; Secure Mode, enterprise and project policies may override them; runtime chat not verified');
      const tabModes = readTabPolicies(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TAB_TOPIC_KEY)?.value || '');
      addCheck('Editor', 'Native AI Tab and next-edit disabled', Object.entries(TAB_POLICIES).every(([key, value]) => tabModes[key] === value) ? 'pass' : 'warn',
        'Stored tabEnabled OFF and tabToJump DISABLED; restart the IDE to load them; live suggestions not verified');
      addCheck('MCP', 'Global auto-allow policy', policy.allowed && !policy.conflicts ? 'pass' : 'warn', policy.allowed && !policy.conflicts ? 'Stored mcp(*) Allow; runtime tool call not proven' : 'Run permissions with Antigravity closed');
    } catch (_) { addCheck('MCP', 'Global auto-allow policy', 'warn', 'Unverified storage; no changes made'); }
    finally { db?.close(); }
  } else addCheck('MCP', 'Global auto-allow policy', 'warn', 'Open/close Antigravity once, then run permissions');

  try {
    const compatibility = require('./native-compatibility').inspectNativeCompatibility(envPaths);
    addCheck('Native setup', 'Audited IDE compatibility', compatibility.supported ? 'pass' : 'warn', compatibility.reason || compatibility.buildId);
    const nativeStatus = require('./setup-status').getSetupStatus(envPaths);
    addCheck('Native setup', 'Pending operation', nativeStatus.state === 'failed' || nativeStatus.state === 'invalid' ? 'fail'
      : ['idle', 'applied', 'cancelled'].includes(nativeStatus.state) ? 'pass' : 'warn', nativeStatus.state + ': ' + (nativeStatus.reason || ''));
  } catch (error) { addCheck('Native setup', 'Pending operation', 'warn', error.message); }
  const failures = checks.filter(c => c.status === 'fail');
  const warnings = checks.filter(c => c.status === 'warn');

  log(`\nDoctor Summary: ${checks.length - failures.length - warnings.length} Passed, ${warnings.length} Warnings, ${failures.length} Failures.\n`);

  return {
    ok: failures.length === 0,
    checks,
    failures,
    warnings,
  };
}

module.exports = { runDoctor };
