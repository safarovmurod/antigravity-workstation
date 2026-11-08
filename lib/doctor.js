'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { execSync } = require('child_process');
const { isDeepStrictEqual } = require('node:util');
const { getEnvironmentPaths } = require('./paths');
const { parseJsonc } = require('./jsonc');
const { getInstalledExtensions } = require('./extensions');
const { expectedSettings, homeTemplate, languageCacheFile, workbenchHtmlPath } = require('./profile-settings');
const workbenchUi = require('../extensions/workstation-stability/workbench-ui.cjs');
const { verifyMcpRuntime } = require('./installer');
const memory = require('./system-resources');
const payload = require('./owned-files');
const nativeHooks = require('./native-hooks');
const configMerge = require('./config-merge');
const extensionProfiles = require('./extension-profiles');
const browser = require('./browser-runtime');
const mcpPermissions = require('./mcp-permissions');
const agentAutomation = require('./agent-automation');
const approvals = require('./approval-policies');
const nativeCompatibility = require('./native-compatibility');
const setupStatus = require('./setup-status');
const managedProfile = require('../extensions/workstation-stability/profile.cjs');
const asterFonts = require('../extensions/aster-appearance/fonts.json');
const fontManifest = require('../config/font.json');

function runDoctor(options = {}) {
  const envPaths = getEnvironmentPaths(options.customRoots);
  const log = options.log || console.log;

  const checks = [];
  function addCheck(category, name, status, detail = '') {
    checks.push({ category, name, status, detail });
    const icon = status === 'pass' ? '✓' : status === 'info' ? 'i' : status === 'warn' ? '⚠' : '✗';
    log(`  [${icon}] ${category} -> ${name}${detail ? ` (${detail})` : ''}`);
  }

  log('\n=== Antigravity Setup Doctor ===\n');
  addCheck('System', 'TypeScript memory budget', 'pass', memory.typeScriptMemoryLimit(envPaths.totalMemoryBytes) + ' MiB heap limit, selected from this computer RAM');

  addCheck('System', 'Windows OS', process.platform === 'win32' ? 'pass' : 'fail', process.platform);

  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (major >= 24) {
    addCheck('Node.js', 'Node Version', 'pass', nodeVersion);
  } else {
    addCheck('Node.js', 'Node Version', 'fail', `${nodeVersion} (requires Node >= 24)`);
  }

  try {
    const npmVersion = execSync('npm.cmd --version',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    addCheck('npm', 'npm Version', /^\d+\./.test(npmVersion) && Number(npmVersion.split('.')[0]) >= 10 ? 'pass' : 'fail',
      npmVersion + ' (requires npm >= 10)');
  } catch (_) { addCheck('npm', 'npm Version', 'fail', 'npm not found in PATH'); }

  try {
    const gitVer = execSync('git --version', { encoding: 'utf8' }).trim();
    addCheck('Git', 'Git CLI', 'pass', gitVer);
  } catch (_) {
    addCheck('Git', 'Git CLI', 'fail', 'Git not found in PATH');
  }

  if (fs.existsSync(envPaths.gitBashPath)) {
    addCheck('Git', 'Git Bash Path', 'pass', envPaths.gitBashPath);
  } else {
    addCheck('Git', 'Git Bash Path', 'warn', `Not found at ${envPaths.gitBashPath}`);
  }

  if (envPaths.cliPath && fs.existsSync(envPaths.cliPath)) {
    addCheck('Antigravity', 'IDE CLI', 'pass', envPaths.cliPath);
  } else {
    addCheck('Antigravity', 'IDE CLI', 'warn', 'CLI not found. Check installation in LocalAppData');
  }

  if (fs.existsSync(envPaths.settingsJson)) {
    try {
      const content = fs.readFileSync(envPaths.settingsJson, 'utf8');
      const settings = parseJsonc(content);

      const hasPrettier = settings['editor.defaultFormatter'] === 'esbenp.prettier-vscode';
      const hasCursor = settings['editor.cursorSmoothCaretAnimation'] === 'on';
      const jellyHtml = settings['jellyCursor.workbenchHtmlPath'];
      const jellyPatched = typeof jellyHtml === 'string' && fs.existsSync(jellyHtml)
        && fs.readFileSync(jellyHtml, 'utf8').includes('<!-- jelly-cursor:start -->')
        && fs.existsSync(path.join(path.dirname(jellyHtml), 'jelly-cursor.js'));
      const hasFormatOnSave = settings['editor.formatOnSave'] === true;

      addCheck('Settings', 'settings.json exists', 'pass', envPaths.settingsJson);
      addCheck('Settings', 'Prettier Formatter Default', hasPrettier ? 'pass' : 'warn');
      addCheck('Settings', 'Native Smooth Cursor', hasCursor ? 'pass' : 'warn');
      const jellyDetail = jellyPatched ? 'loaded on next IDE start' : 'restart the IDE once so Workstation Stability installs it';
      addCheck('Settings', 'Jelly Cursor effects patch', jellyPatched ? 'pass' : 'warn', jellyDetail);
      // Aster Atelier's interface font and the hidden hint lines load through this addon.
      const ui = workbenchUi.status(workbenchHtmlPath(envPaths));
      const uiDetail = !ui.found ? 'workbench.html not found in the IDE folder'
        : !ui.installed ? 'close every IDE window and run command 2 again, or restart the IDE once so Workstation Stability adds it'
          : ui.checksum === 'mismatch' ? 'workbench.html differs from its product.json checksum; close the IDE and run command 2 again'
            : 'interface font and hidden hint lines load with every IDE window';
      addCheck('Settings', 'Interface addon (live interface font)', ui.installed && ui.checksum !== 'mismatch' ? 'pass' : 'warn', uiDetail);
      addCheck('Settings', 'Format On Save', hasFormatOnSave ? 'pass' : 'warn');
      const expected = expectedSettings(envPaths);
      const profileFile = path.join(envPaths.geminiConfigDir, 'workstation-setup/editor-profile.json');
      if (fs.existsSync(profileFile)) {
        const profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
        if (profile.schema === 1 && profile.settings && !Array.isArray(profile.settings) && typeof profile.settings === 'object') {
          for (const key of Object.keys(expected)) if (Object.hasOwn(profile.settings, key)) expected[key] = profile.settings[key];
        }
      }
      for (const key of ['errorLens.excludeBySource', 'errorLens.excludeByMessage']) {
        expected[key] = managedProfile.mergeManagedValue(key, settings[key], expected[key]);
      }
      for (const key of ['editor.fontFamily', 'editor.fontSize', 'editor.fontWeight', 'asterAppearance.theme']) {
        if (settings[key] !== undefined) expected[key] = settings[key];
      }
      expected['editor.tokenColorCustomizations'] = managedProfile.mergeManagedValue(
        'editor.tokenColorCustomizations', settings['editor.tokenColorCustomizations'], expected['editor.tokenColorCustomizations']);
      if (typeof settings['workbench.colorTheme'] === 'string' && settings['workbench.colorTheme'].trim()) {
        expected['workbench.colorTheme'] = settings['workbench.colorTheme'];
      }
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
      // A family chosen in Aster Atelier is as valid as the JetBrains Mono default.
      const families = ['JetBrains Mono', ...asterFonts.map(font => font.family)];
      const primary = key => String(settings[key] || '').split(',')[0].trim().replace(/^(['"])(.*)\1$/, '$2');
      const chosen = primary('editor.fontFamily');
      addCheck('Font', 'Bundled font selected for editor and terminal',
        families.includes(chosen) && primary('terminal.integrated.fontFamily') === chosen ? 'pass' : 'warn', chosen || 'not set');
      if (!options.customRoots?.userProfile) {
        const fontDir = path.join(envPaths.localAppData, 'Microsoft', 'Windows', 'Fonts');
        const valid = fontManifest.files.every(file => {
          const target = path.join(fontDir, file.name);
          return fs.existsSync(target) && crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') === file.sha256;
        });
        const fontDetail = valid ? '16 checksums match; registration is verified during install'
          : 'Run full install again to install/verify the font; --skip-font preserves an existing font setup';
        addCheck('Font', 'Pinned user TTF files verified', valid ? 'pass' : 'warn', fontDetail);
      } else addCheck('Font', 'Windows font registration', 'warn', 'Not checked on this platform / isolated profile');
    } catch (e) {
      addCheck('Settings', 'settings.json parsed', 'fail', e.message);
    }
  } else {
    addCheck('Settings', 'settings.json exists', 'fail', 'Not created yet');
  }

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
    addCheck('Settings', 'Display language preference', typeof argv.locale === 'string' && argv.locale.trim() ? 'pass' : 'fail',
      envPaths.argvJson + '; full IDE restart required; the editor helper checks the running language');
  } catch { addCheck('Settings', 'Russian display language selected', 'fail', 'Run full setup to write valid argv.json'); }
  try {
    const cache = JSON.parse(fs.readFileSync(languageCacheFile(envPaths), 'utf8'));
    const ready = typeof cache.ru?.translations?.vscode === 'string' && fs.existsSync(cache.ru.translations.vscode);
    const cacheDetail = ready ? 'Core translation file exists; running language is checked by the editor helper'
      : 'Rerun setup to rebuild the language cache';
    addCheck('Settings', 'Russian startup translation cache', ready ? 'pass' : 'fail', cacheDetail);
  } catch { addCheck('Settings', 'Russian startup translation cache', options.customRoots?.userProfile ? 'warn' : 'fail', 'Language cache absent/invalid; rerun full setup'); }

  const geminiMd = path.join(envPaths.geminiDir, 'GEMINI.md');
  if (fs.existsSync(geminiMd)) {
    const current = fs.readFileSync(geminiMd);
    const expected = fs.readFileSync(path.join(__dirname, '../rules/GEMINI.template.md'));
    addCheck('Rules', 'Global GEMINI.md', current.equals(expected) ? 'pass' : 'fail', geminiMd);
  } else {
    addCheck('Rules', 'Global GEMINI.md', 'fail', 'Not found in ~/.gemini/GEMINI.md');
  }

  for (const name of ['workstation-unified-design', 'workstation-unified-full-stack']) {
    const current = path.join(envPaths.geminiRulesDir, name + '.md');
    const expected = path.join(__dirname, '../rules', name + '.template.md');
    addCheck('Rules', name, fs.existsSync(current) && fs.readFileSync(current).equals(fs.readFileSync(expected)) ? 'pass' : 'warn');
  }
  for (const name of ['design.md', 'full-stack.md']) {
    const current = path.join(envPaths.geminiConfigDir, 'workstation-unified/guides', name);
    const expected = path.join(__dirname, '../resources/guides', name);
    addCheck('Guides', name, fs.existsSync(current) && fs.readFileSync(current).equals(fs.readFileSync(expected)) ? 'pass' : 'warn');
  }

  try {
    const plan = payload.planPayload(envPaths, path.resolve(__dirname, '..'), 'Разработчик');
    addCheck('Payload', 'All managed files', plan.writes.length || plan.removals.length ? 'fail' : 'pass',
      plan.expectedCount + ' expected; ' + plan.writes.length + ' missing/different; ' + plan.removals.length + ' obsolete');
  } catch (error) { addCheck('Payload', 'All managed files', 'fail', error.message); }
  for (const [template, target] of [
    ['config/antigravity-settings.json', path.join(envPaths.geminiDir, 'antigravity/settings.json')],
    ['config/hooks.json', nativeHooks.nativeHooksPath(envPaths)],
    ['config/gemini-config.json', path.join(envPaths.geminiConfigDir, 'config.json')],
  ]) {
    try {
      let expected = JSON.parse(homeTemplate(envPaths, template));
      const actual = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (template === 'config/hooks.json') expected = nativeHooks.mergeNativeHooks(actual, expected);
      else {
        const retired = JSON.parse(homeTemplate(envPaths, 'config/migrations/retired-context-hook.template.json'));
        const active = template === 'config/antigravity-settings.json' ? configMerge.retireOwnedHooks(actual, retired, expected) : actual;
        expected = configMerge.mergeUserConfiguration(active, expected);
      }
      addCheck('Settings', template, isDeepStrictEqual(actual, expected) ? 'pass' : 'fail',
        template === 'config/hooks.json' ? 'Native hook path: ' + target + '; schema and managed definitions verified' : 'Rendered paths and configuration');
    } catch { addCheck('Settings', template, 'fail', 'Missing or invalid managed configuration'); }
  }
  const mentorSkill = path.join(envPaths.geminiSkillsDir, 'workstation-frontend-mentor', 'SKILL.md');
  const agentBrowserSkill = path.join(envPaths.geminiSkillsDir, 'agent-browser', 'SKILL.md');
  const practiceSkill = path.join(envPaths.geminiSkillsDir, 'workstation-practice', 'SKILL.md');
  addCheck('Skills', 'workstation-frontend-mentor skill', fs.existsSync(mentorSkill) ? 'pass' : 'warn');
  addCheck('Skills', 'agent-browser skill', fs.existsSync(agentBrowserSkill) ? 'pass' : 'warn');
  addCheck('Skills', 'workstation-practice skill', fs.existsSync(practiceSkill) ? 'pass' : 'warn');

  const engineScript = path.join(envPaths.geminiScriptsDir, 'practice-engine.mjs');
  addCheck('Scripts', 'practice-engine.mjs', fs.existsSync(engineScript) ? 'pass' : 'warn');
  const mcpRuntimeVerified = verifyMcpRuntime(path.join(envPaths.geminiConfigDir, 'mcp-runtime'));
  addCheck('MCP', 'Pinned local runtimes', options.customRoots?.userProfile ? 'warn' : mcpRuntimeVerified ? 'pass' : 'fail',
    options.customRoots?.userProfile ? 'Dependency installation skipped for isolated profile' : 'Versions and entrypoints checked; tool calls verified separately');

  try {
    const installed = getInstalledExtensions(envPaths.cliPath, { strict: true });
    addCheck('Extensions', 'Total registered extensions', 'pass', `${installed.length} found`);

    const installOptionsFile = path.join(envPaths.geminiConfigDir, 'workstation-setup/install-options.json');
    const savedOptions = fs.existsSync(installOptionsFile) ? JSON.parse(fs.readFileSync(installOptionsFile, 'utf8')) : {};
    const extensionProfile = options.extensionProfile || savedOptions.extensionProfile || 'full';
    const extensionCatalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'extensions.json'), 'utf8'));
    const criticalExts = extensionProfiles.selectExtensions(extensionCatalog, extensionProfile);
    addCheck('Extensions', 'Selected installation profile', 'pass', extensionProfile + '; additional installed extensions are retained');
    for (const ext of criticalExts) {
      const actual = installed.find(i => i.id === ext.id.toLowerCase());
      const unpinned = ext.trackLatest === true;
      const label = ext.id + (ext.version ? '@' + ext.version : ' (latest)');
      const exact = !!actual && typeof ext.version === 'string' && actual.version === ext.version;
      const status = exact ? 'pass'
        : !actual ? 'fail'
        : unpinned ? 'pass'
        : ext.allowCompatibleVersion ? 'warn' : 'fail';
      const detail = !actual
        ? ''
        : unpinned ? `registered ${actual.version}; compatible installed packages are reused; Doctor checks local registration only`
        : exact ? ''
        : `registered ${actual.version}${ext.allowCompatibleVersion ? '; compatible fallback, preferred version unavailable' : '; snapshot version differs'}`;
      addCheck('Extensions', label, status, detail);
    }
  } catch (error) {
    addCheck('Extensions', 'Extension inventory', 'fail', error.message);
  }

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
      addCheck('MCP', 'Unmanaged legacy-name launchers: ' + path.basename(path.dirname(file)), retired.length ? 'warn' : 'pass',
        retired.length ? 'Preserved without ownership proof: ' + retired.join(', ') + '; review manually' : 'No Docker dependency in the managed MCP catalog');
      for (const [name, server] of Object.entries(servers)) {
        const placeholder = /YOUR_[A-Z_]+/.test(JSON.stringify(server));
        const needsConfiguration = server.disabled || placeholder;
        addCheck('MCP', name + ' configuration', needsConfiguration ? 'warn' : 'pass',
          needsConfiguration ? 'Needs local credentials/enablement' : 'Configured; live tools not proven');
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

  try {
    const abVer = execSync('agent-browser --version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    addCheck('Browser Automation', 'agent-browser CLI', 'pass', abVer);
  } catch (_) {
    addCheck('Browser Automation', 'agent-browser CLI', 'warn', 'Not found in PATH (install via npm i -g agent-browser)');
  }

  try {
    const runtime = browser.findBrowserRuntime({ envPaths });
    addCheck('Browser Automation', 'Chromium browser executable', runtime ? 'pass' : 'warn',
      runtime ? runtime.source + ': ' + runtime.executable + '; live launch is verified during install' : 'Not found; run full setup with Chrome or Edge available');
  } catch (error) { addCheck('Browser Automation', 'Chromium browser executable', 'fail', error.message); }

  const permissionDb = path.join(envPaths.userSettingsDir, 'globalStorage', 'state.vscdb');
  if (fs.existsSync(permissionDb)) {
    let db;
    try {
      const { DatabaseSync } = require('node:sqlite');
      db = new DatabaseSync(permissionDb, { readOnly: true });
      const nativeValue = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(mcpPermissions.TOPIC_KEY)?.value || '';
      const policy = mcpPermissions.readMcpPolicy(nativeValue);
      const modes = agentAutomation.readPolicies(nativeValue);
      const automation = Object.entries(agentAutomation.POLICIES).every(([key, value]) => modes[key] === value);
      addCheck('Agent', 'Native terminal/artifact automation', automation ? 'pass' : 'info', automation
        ? 'Stored modes only; Secure Mode, enterprise and project policies may override them; runtime chat not verified'
        : 'Optional Always Proceed is not enabled; your current agent approvals are kept');
      const approvalGrants = mcpPermissions.readApprovalGrants(nativeValue);
      const approvalMatches = approvalGrants.allowed && approvalGrants.conflicts === 0 && Object.entries(approvals.definitions).every(([topicKey, expected]) => {
        const actual = approvals.read(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(topicKey)?.value || '', topicKey);
        return Object.entries(expected).every(([key, value]) => actual[key] === value);
      });
      addCheck('Agent', 'Browser JavaScript, file access and Turbo preferences', approvalMatches ? 'pass' : 'info', approvalMatches
        ? 'Stored native Always/Turbo preferences; explicit project denials and organization controls remain effective'
        : 'Optional Always/Turbo preferences are not enabled; your current choice is kept');
      const tabValue = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(agentAutomation.TAB_TOPIC_KEY)?.value || '';
      const tabModes = agentAutomation.readTabPolicies(tabValue);
      const quiet = Object.entries(agentAutomation.TAB_POLICIES).every(([key, value]) => tabModes[key] === value);
      addCheck('Editor', 'Native AI Tab and next-edit disabled', quiet ? 'pass' : 'info', quiet
        ? 'Stored tabEnabled OFF and tabToJump DISABLED; restart the IDE to load them; live suggestions not verified'
        : 'AI Tab is on; command 3 turns it off (after a normal IDE restart)');
      const mcpAllowed = policy.allowed && !policy.conflicts;
      addCheck('MCP', 'Global auto-allow policy', mcpAllowed ? 'pass' : 'info', mcpAllowed
        ? 'Stored mcp(*) Allow; runtime tool call not proven'
        : 'Optional mcp(*) auto-allow is not enabled; your current MCP approvals are kept');
    } catch (_) { addCheck('MCP', 'Global auto-allow policy', 'warn', 'Unverified storage; no changes made'); }
    finally { db?.close(); }
  } else addCheck('MCP', 'Global auto-allow policy', 'warn', 'Open/close Antigravity once, then run permissions');

  try {
    const compatibility = nativeCompatibility.inspectNativeCompatibility(envPaths);
    addCheck('Native setup', 'Audited IDE compatibility', compatibility.supported ? 'pass' : 'warn', compatibility.reason || compatibility.buildId);
    const nativeStatus = setupStatus.getSetupStatus(envPaths);
    addCheck('Native setup', 'Pending operation', nativeStatus.state === 'failed' || nativeStatus.state === 'invalid' ? 'fail'
      : ['idle', 'applied', 'cancelled'].includes(nativeStatus.state) ? 'pass' : 'warn', nativeStatus.state + ': ' + (nativeStatus.reason || ''));
  } catch (error) { addCheck('Native setup', 'Pending operation', 'warn', error.message); }
  const failures = checks.filter(c => c.status === 'fail');
  const warnings = checks.filter(c => c.status === 'warn');
  const optional = checks.filter(c => c.status === 'info').length;

  log(`\nDoctor Summary: ${checks.length - failures.length - warnings.length - optional} Passed, ${warnings.length} Warnings, ${failures.length} Failures.`
    + (optional ? ` ${optional} optional preferences are left as you set them.` : '') + '\n');

  return {
    ok: failures.length === 0,
    checks,
    failures,
    warnings,
  };
}

module.exports = { runDoctor };
