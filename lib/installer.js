'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { isDeepStrictEqual } = require('node:util');
const { getEnvironmentPaths } = require('./paths');
const { readJsonFile } = require('./jsonc');
const { createBackup } = require('./backup');
const { installGalleryExtensions, installCustomGithubPanel, installStabilityHelper, installBundledCalmTypeScript, retireLegacyExtensions, galleryTarget } = require('./extensions');
const payload = require('./owned-files');
const { expectedSettings, homeTemplate, ensureRussianLanguagePack, languageCacheFile } = require('./profile-settings');

function verifyMcpRuntime(directory, repoRoot = path.resolve(__dirname, '..')) {
  const dependencies = JSON.parse(fs.readFileSync(path.join(repoRoot, 'resources/mcp-runtime/package.json'), 'utf8')).dependencies;
  const entries = {
    'chrome-devtools-mcp': 'build/src/bin/chrome-devtools-mcp.js',
    '@opengsd/gsd-core': 'bin/gsd-mcp-server.js',
    '@modelcontextprotocol/server-sequential-thinking': 'dist/index.js',
  };
  return Object.entries(entries).every(([name, entry]) => {
    const root = path.join(directory, 'node_modules', name);
    try {
      return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version === dependencies[name]
        && fs.existsSync(path.join(root, entry));
    } catch (_) { return false; }
  });
}

function ensureMcpRuntime(directory, options = {}) {
  const { dryRun = false, isolated = false, repoRoot = path.resolve(__dirname, '..'), log = console.log } = options;
  if (dryRun) { log('  [DRY-RUN] Would verify/install the three pinned local MCP runtimes.'); return { dryRun: true }; }
  if (isolated) { log('  Isolated profile: MCP dependency manifests copied; network installation skipped.'); return { skipped: true }; }
  if (verifyMcpRuntime(directory, repoRoot)) { log('  Three local MCP runtime versions and entrypoints verified.'); return { verified: true, unchanged: true }; }
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!fs.existsSync(npmCli)) throw new Error('npm CLI not found alongside Node.js for local MCP runtime installation');
  log('  Installing the three local MCP runtimes from the pinned package lock...');
  const result = spawnSync(process.execPath, [npmCli, 'ci', '--prefix', directory, '--no-audit', '--no-fund'], { stdio: 'inherit', windowsHide: true, timeout: 180000 });
  if (result.error || result.status !== 0) throw new Error('Local MCP runtime installation failed: ' + (result.error?.message || 'exit ' + result.status));
  if (!verifyMcpRuntime(directory, repoRoot)) throw new Error('Local MCP runtime versions/entrypoints were not verified after installation');
  return { verified: true };
}

function writeIfChanged(filePath, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  if (fs.existsSync(filePath) && fs.readFileSync(filePath).equals(bytes)) return false;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try { fs.writeFileSync(tempPath, bytes); fs.renameSync(tempPath, filePath); }
  finally { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); }
  return true;
}

function safeWriteJson(filePath, data) {
  return writeIfChanged(filePath, JSON.stringify(data, null, 2));
}

function fileNeedsWrite(file, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  return !fs.existsSync(file) || !fs.readFileSync(file).equals(bytes);
}

function profileNeedsBackup(current, next) {
  if (!current) return true;
  const { requestId: previousRequest, ...previous } = current;
  const { requestId: nextRequest, ...desired } = next;
  return !isDeepStrictEqual(previous, desired);
}

function nativeSetupNeedsBackup(env, options = {}) {
  const automation = require('./agent-automation');
  const preview = automation.inspectAutomation(env, { scope: options.autoApprove ? 'all' : 'completion' });
  if (!preview.pendingEquivalent && (!preview.verified || !preview.applied || preview.wouldChange)) return true;
  if (options.autoApprove || options.skipPermissions) return false;
  const { DatabaseSync } = require('node:sqlite');
  const { TOPIC_KEY, mergeMcpGrant } = require('./mcp-permissions');
  const policy = readJsonFile(path.join(options.repoRoot || path.resolve(__dirname, '..'), 'config/ai/mcp-permissions.json'));
  const db = new DatabaseSync(path.join(env.userSettingsDir, 'globalStorage/state.vscdb'), { readOnly: true });
  try {
    db.exec('BEGIN');
    const before = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY)?.value || '';
    const changed = mergeMcpGrant(before, policy) !== before;
    db.exec('COMMIT');
    return changed;
  } finally { db.close(); }
}

function updateMcpConfig(current, template) {
  function overlay(previous, managed) {
    if (!managed || typeof managed !== 'object' || Array.isArray(managed)) return structuredClone(managed);
    const merged = previous && typeof previous === 'object' && !Array.isArray(previous) ? structuredClone(previous) : {};
    for (const [key, value] of Object.entries(managed)) merged[key] = overlay(merged[key], value);
    return merged;
  }
  const result = structuredClone(current);
  result.mcpServers ||= {};
  for (const [name, definition] of Object.entries(template.mcpServers)) {
    if (['docker-mcp', 'github-mcp-server'].includes(name)) continue;
    const previous = current.mcpServers?.[name];
    const server = overlay(previous, definition);
    if (previous && (Object.hasOwn(server, 'disabled') || typeof previous.disabled === 'boolean')) server.disabled = previous.disabled === true;
    for (const field of ['env', 'headers']) {
      const credentials = { ...server[field] };
      for (const [key, value] of Object.entries(previous?.[field] || {})) {
        if (/token|key|secret|password|authorization/i.test(key)) credentials[key] = value;
      }
      if (Object.keys(credentials).length) server[field] = credentials;
    }
    delete server.$typeName;
    result.mcpServers[name] = server;
  }
  return result;
}

function runInstallerCore(options = {}) {
  const {
    displayName = 'Разработчик',
    dryRun = false,
    skipExtensions = false,
    cleanExtensions = false,
    skipAgentBrowser = false,
    skipFont = false,
    skipPermissions = false,
    autoApprove = false,
    rulesOnly = false,
    extensionProfile = 'full',
    home,
    customRoots = {},
    repoRoot = path.resolve(__dirname, '..'),
    log = console.log,
  } = options;
  if (autoApprove && (skipPermissions || rulesOnly)) throw new Error('--auto-approve conflicts with approval preservation or rules-only mode');
  if (cleanExtensions && (skipExtensions || rulesOnly || extensionProfile !== 'full')) throw new Error('--clean-extensions requires a full extension installation');

  if (rulesOnly) {
    const env = getEnvironmentPaths({ ...customRoots, ...(home ? { userProfile: home } : {}) });
    const files = [
      ['rules/GEMINI.template.md', path.join(env.geminiDir, 'GEMINI.md')],
      ...['workstation-unified-design', 'workstation-unified-full-stack'].map(name =>
        ['rules/' + name + '.template.md', path.join(env.geminiRulesDir, name + '.md')]),
      ...['design.md', 'full-stack.md'].map(name =>
        ['resources/guides/' + name, path.join(env.geminiConfigDir, 'workstation-unified/guides', name)]),
    ];
    const changed = files.filter(([source, target]) => {
      payload.guard(path.dirname(target), path.basename(target));
      return !fs.existsSync(target) || !fs.readFileSync(target).equals(fs.readFileSync(path.join(repoRoot, source)));
    });
    if (dryRun) return { success: true, dryRun: true, changed: changed.map(([, target]) => target), backup: null };
    const backup = changed.length ? createBackup(env, 'rules-only') : null;
    for (const [source, target] of changed) writeIfChanged(target, fs.readFileSync(path.join(repoRoot, source)));
    return { success: true, dryRun: false, changed: changed.map(([, target]) => target), backup: backup?.backupDir || null };
  }

  log('\n=== Workstation Antigravity Setup Installer ===');
  log(`  User Display Name : ${displayName}`);
  log(`  Dry Run Mode      : ${dryRun ? 'YES (No changes will be written)' : 'NO'}`);
  log(`  Skip Extensions   : ${skipExtensions ? 'YES' : 'NO'}`);
  log(`  Source Repository : ${repoRoot}\n`);

  const envPaths = getEnvironmentPaths(customRoots);
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Full setup requires Node.js >=24 (GSD Core and agent-browser runtime)');
  if (typeof displayName !== 'string' || !displayName.trim() || /[\r\n]/.test(displayName) || displayName.length > 80) throw new Error('Name must be one nonempty line, at most 80 characters');
  const isolated = !!customRoots.userProfile;
  const extensionCatalog = readJsonFile(path.join(repoRoot, 'config/extensions.json'));
  const selectedExtensions = require('./extension-profiles').selectExtensions(extensionCatalog, extensionProfile);
  log('  Extension profile: ' + extensionProfile + (cleanExtensions ? '; verified required packages are reused; other user extensions are archived.' : '; unrelated existing extensions are retained.'));
  if (process.platform !== 'win32' && !isolated && !dryRun) throw new Error('Full IDE setup requires Windows; use install --rules-only on this platform');
  if (process.platform === 'win32' && !isolated && !dryRun && !envPaths.cliPath) throw new Error('Antigravity IDE not found. Open the installed IDE or set ANTIGRAVITY_INSTALL_DIR to its folder, then rerun setup.');
  if (envPaths.ideRoot) log('  Antigravity installation: ' + envPaths.ideRoot);
  const failures = [];
  log('[0/10] Validating existing profile JSON...');
  const antigravitySettings = path.join(envPaths.geminiDir, 'antigravity/settings.json');
  const hooksConfig = require('./native-hooks').nativeHooksPath(envPaths);
  const legacyHooksConfig = path.join(envPaths.geminiConfigDir, 'hooks.json');
  const geminiConfig = path.join(envPaths.geminiConfigDir, 'config.json');
  const editorProfile = path.join(envPaths.geminiConfigDir, 'workstation-setup/editor-profile.json');
  const installOptionsFile = path.join(envPaths.geminiConfigDir, 'workstation-setup/install-options.json');
  payload.guard(path.dirname(editorProfile), path.basename(editorProfile));
  payload.guard(path.dirname(installOptionsFile), path.basename(installOptionsFile));
  if (fs.existsSync(editorProfile)) readJsonFile(editorProfile);
  if (fs.existsSync(installOptionsFile)) readJsonFile(installOptionsFile);
  const localeCache = languageCacheFile(envPaths);
  if (fs.existsSync(localeCache)) readJsonFile(localeCache, { emptyValue: {} });
  for (const target of [envPaths.settingsJson, envPaths.keybindingsJson, envPaths.argvJson, antigravitySettings, hooksConfig, legacyHooksConfig, geminiConfig, path.join(envPaths.geminiDir, 'GEMINI.md'), path.join(envPaths.geminiConfigDir, 'mcp_config.json'), path.join(envPaths.geminiDir, 'antigravity/mcp_config.json')]) {
    payload.guard(path.dirname(target), path.basename(target));
  }
  for (const target of [path.join(envPaths.geminiConfigDir, 'mcp_config.json'), path.join(envPaths.geminiDir, 'antigravity/mcp_config.json')]) {
    if (fs.existsSync(target)) {
      const config = readJsonFile(target, { emptyValue: {} });
      if (!config || typeof config !== 'object' || Array.isArray(config) || (config.mcpServers !== undefined && (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)))) throw new Error('Invalid MCP config shape in "' + target + '"; no changes made');
    }
  }
  for (const target of [envPaths.settingsJson, envPaths.keybindingsJson, envPaths.argvJson]) {
    if (fs.existsSync(target)) {
      const parsed = readJsonFile(target, { jsonc: true, emptyValue: target === envPaths.keybindingsJson ? [] : {} });
      if (target === envPaths.keybindingsJson ? !Array.isArray(parsed) : (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('Invalid settings/keybindings JSON shape in "' + target + '"; no changes made');
    }
  }
  for (const target of [antigravitySettings, hooksConfig, legacyHooksConfig, geminiConfig]) {
    if (fs.existsSync(target)) {
      const config = readJsonFile(target, { emptyValue: {} });
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid config object in "' + target + '"; no changes made');
    }
  }
  const setupSettings = expectedSettings(envPaths, repoRoot);
  const setupBindings = readJsonFile(path.join(repoRoot, 'config/keybindings.json'));
  if (!Array.isArray(setupBindings)) throw new Error('Source keybindings must contain an array');
  const setupArgv = readJsonFile(path.join(repoRoot, 'config/argv.json'));
  if (!setupArgv || typeof setupArgv !== 'object' || Array.isArray(setupArgv)) throw new Error('Source argv must contain an object');
  const globalInstructions = fs.readFileSync(path.join(repoRoot, 'rules/GEMINI.template.md'));
  const renderedConfigs = [
    ['config/antigravity-settings.json', antigravitySettings],
    ['config/hooks.json', hooksConfig],
    ['config/gemini-config.json', geminiConfig],
  ].map(([source, target]) => {
    const rendered = homeTemplate(envPaths, source, repoRoot);
    const current = fs.existsSync(target) ? readJsonFile(target, { emptyValue: {} }) : {};
    if (source !== 'config/hooks.json') {
      const merge = require('./config-merge');
      const managed = JSON.parse(rendered);
      const retired = JSON.parse(homeTemplate(envPaths, 'config/migrations/retired-context-hook.template.json', repoRoot));
      const active = source === 'config/antigravity-settings.json' ? merge.retireOwnedHooks(current, retired, managed) : current;
      return [JSON.stringify(merge.mergeConfiguration(active, managed), null, 2), target];
    }
    const legacy = fs.existsSync(legacyHooksConfig) ? readJsonFile(legacyHooksConfig, { emptyValue: {} }) : {};
    const merged = require('./native-hooks').mergeNativeHooks({ ...legacy, ...current }, JSON.parse(rendered));
    return [JSON.stringify(merged, null, 2), target];
  });
  const mcpTemplates = ['active.template.json', 'mcp_antigravity.template.json'].map(name => JSON.parse(homeTemplate(envPaths, 'config/mcp/' + name, repoRoot)));
  payload.validateSourcePayload(repoRoot);
  const payloadPlan = payload.planPayload(envPaths, repoRoot, displayName);
  if (!skipExtensions) for (const name of ['git-branch-panel', 'workstation-stability', 'calm-typescript']) {
    const manifest = path.join(repoRoot, 'extensions', name, 'package.json');
    if (!fs.existsSync(manifest)) throw new Error('Downloaded setup is missing a required bundled extension: ' + name + '; no setup changes made');
  }

  const currentSettings = fs.existsSync(envPaths.settingsJson) ? readJsonFile(envPaths.settingsJson, { jsonc: true, emptyValue: {} }) : {};
  Object.assign(setupSettings, require('./profile-settings').managedLanguageSettings(currentSettings, setupSettings));
  const quiet = require('./quiet-completion');
  Object.assign(setupSettings, quiet.mergeQuietSettings(setupSettings, quiet.quietSettings(currentSettings)));
  const mergedSettings = quiet.mergeQuietSettings(require('./profile-settings').mergeSettings(currentSettings, setupSettings));
  setupSettings['chat.tools.terminal.autoApprove'] = mergedSettings['chat.tools.terminal.autoApprove'];
  const currentBindings = fs.existsSync(envPaths.keybindingsJson) ? readJsonFile(envPaths.keybindingsJson, { jsonc: true, emptyValue: [] }) : [];
  const mergedBindings = require('./profile-settings').mergeKeybindings(currentBindings, setupBindings);
  const currentArgv = fs.existsSync(envPaths.argvJson) ? readJsonFile(envPaths.argvJson, { jsonc: true, emptyValue: {} }) : {};
  const mergedArgv = { ...currentArgv, ...setupArgv };
  const mcpConfigs = [path.join(envPaths.geminiConfigDir, 'mcp_config.json'), path.join(envPaths.geminiDir, 'antigravity/mcp_config.json')]
    .map((target, index) => [target, updateMcpConfig(fs.existsSync(target) ? readJsonFile(target, { emptyValue: {} }) : { mcpServers: {} }, mcpTemplates[index])]);
  const setupVersion = readJsonFile(path.join(repoRoot, 'package.json')).version;
  const installedOptions = { schema: 1, extensionProfile, setupVersion };
  const profileRequest = { schema: 1, requestId: require('node:crypto').randomUUID(), setupVersion, locale: 'ru', settings: setupSettings };
  if (!isolated && !skipExtensions && envPaths.cliPath) {
    profileRequest.galleryUpdates = require('../extensions/workstation-stability/gallery-updates.cjs')
      .createPlan(repoRoot, envPaths, selectedExtensions, galleryTarget(envPaths));
  }
  const currentProfile = fs.existsSync(editorProfile) ? readJsonFile(editorProfile) : null;
  const managedFilePlan = [
    [envPaths.settingsJson, JSON.stringify(mergedSettings, null, 2)],
    [envPaths.keybindingsJson, JSON.stringify(mergedBindings, null, 2)],
    [envPaths.argvJson, JSON.stringify(mergedArgv, null, 2)],
    [path.join(envPaths.geminiDir, 'GEMINI.md'), globalInstructions],
    ...renderedConfigs.map(([rendered, target]) => [target, rendered]),
    ...mcpConfigs.map(([target, value]) => [target, JSON.stringify(value, null, 2)]),
    [installOptionsFile, JSON.stringify(installedOptions, null, 2)],
  ];
  const originalFiles = new Map([...managedFilePlan, [editorProfile, null]].map(([target]) =>
    [target, fs.existsSync(target) ? fs.readFileSync(target) : null]));
  const writeManaged = (target, content) => {
    const before = originalFiles.get(target), current = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (before === null ? current !== null : current === null || !before.equals(current)) {
      throw new Error('Profile file changed during installation; existing changes preserved. Rerun setup: ' + target);
    }
    return writeIfChanged(target, content);
  };
  const writeManagedJson = (target, value) => writeManaged(target, JSON.stringify(value, null, 2));
  const profileFilesChanged = managedFilePlan.some(([target, content]) => fileNeedsWrite(target, content))
    || profileNeedsBackup(currentProfile, profileRequest);
  let needsBackup = profileFilesChanged || payloadPlan.writes.length > 0 || payloadPlan.removals.length > 0;
  if (!dryRun && !isolated && !needsBackup) {
    try { needsBackup = nativeSetupNeedsBackup(envPaths, { autoApprove, skipPermissions, repoRoot }); }
    catch { needsBackup = true; }
  }

  if (process.platform !== 'win32' && !customRoots.userProfile) {
    log('  [WARNING] Non-Windows OS detected. Antigravity IDE paths are optimized for Windows.');
  }

  let backupInfo = null;
  if (!dryRun && needsBackup) {
    log('[1/10] 🛡️ Creating pre-install backup...');
    try {
      if (!isolated) require('./agent-automation').cancelPendingWorkers(envPaths);
      backupInfo = createBackup(envPaths, 'pre-install');
      if (!isolated) {
        const snapshot = require('./rollback').captureNativeBackup(envPaths, backupInfo.backupDir,
          { scope: skipPermissions ? 'completion' : 'all', includeMcp: !skipPermissions, includeAgentPolicies: autoApprove });
        if (!snapshot.captured) throw new Error(snapshot.reason);
        backupInfo.nativeBackup = snapshot.backup;
      }
      log(`  Backup created at: ${backupInfo.backupDir}`);
    } catch (err) {
      throw new Error('Backup failed; installation stopped before changes: ' + err.message);
    }
  } else if (dryRun) {
    log('[1/10] [DRY-RUN] Skipping pre-install backup.');
  } else {
    log('[1/10] Managed configuration is unchanged; keeping existing backups without creating another copy.');
  }

  log('\n[2/10] 🎨 Installing/verifying JetBrains Mono...');
  let font = null;
  if (skipFont || isolated) {
    font = { installed: false, skipped: true, reason: isolated ? 'Isolated test profile: no system font changes' : '--skip-font' };
    log('  Font skipped: ' + font.reason);
  } else {
    try {
      font = require('./font').ensureJetBrainsMono({ dryRun, log, repoRoot });
      if (font.skipped) { log('  ' + font.reason); failures.push(font.reason); }
    } catch (error) { font = { installed: false, error: error.message }; failures.push('Font: ' + error.message); log('  ✗ ' + error.message); }
  }

  log('\n[3/10] Configuring Editor Settings (settings.json)...');

  if (dryRun) {
    log(`  [DRY-RUN] Would restore ${Object.keys(setupSettings).length} exact settings into ${envPaths.settingsJson}`);
  } else {
    const changed = writeManagedJson(envPaths.settingsJson, mergedSettings);
    log(changed ? `  Managed settings applied; personal settings and command denials preserved in ${envPaths.settingsJson}`
      : `  Managed settings already match; verified without rewriting ${envPaths.settingsJson}`);
  }

  log('\n[4/10] Configuring Keybindings (keybindings.json)...');
  const sourceKeybindingsPath = path.join(repoRoot, 'config', 'keybindings.json');
  if (fs.existsSync(sourceKeybindingsPath)) {
    if (dryRun) {
      log(`  [DRY-RUN] Would restore ${setupBindings.length} exact keybindings to ${envPaths.keybindingsJson}`);
    } else {
      const changed = writeManagedJson(envPaths.keybindingsJson, mergedBindings);
      log(changed ? '  Managed keybindings applied; unrelated shortcuts preserved.' : '  Managed keybindings already match; no file rewrite needed.');
    }
  }

  log('\n[5/10] Configuring IDE Locale (argv.json)...');
  const sourceArgvPath = path.join(repoRoot, 'config', 'argv.json');
  if (fs.existsSync(sourceArgvPath)) {
    if (dryRun) {
      log(`  [DRY-RUN] Would update ${envPaths.argvJson}`);
    } else {
      const changed = writeManagedJson(envPaths.argvJson, mergedArgv);
      log(changed ? '  IDE argv.json updated successfully.' : '  IDE locale settings already match; no file rewrite needed.');
    }
  }

  log('\n[6/10] 🧠 Updating managed global instructions...');
  const globalFile = path.join(envPaths.geminiDir, 'GEMINI.md');
  const instructionsChanged = !dryRun && writeManaged(globalFile, globalInstructions);
  log('  Global instructions: ' + (dryRun ? 'preview' : instructionsChanged ? 'current Antigravity snapshot applied' : 'already match; verified without copying'));
  for (const [rendered, target] of renderedConfigs) {
    if (!dryRun) writeManaged(target, rendered);
  }

  log('\n[7/10] 🧩 Updating skills, rules, agents and runtime files...');
  const payloadResult = payload.applyPayload(envPaths, payloadPlan, { dryRun });
  const skillsSourceDir = path.join(repoRoot, 'skills');
  const skillNames = fs.readdirSync(skillsSourceDir).filter(name => fs.existsSync(path.join(skillsSourceDir, name, 'SKILL.md'))).sort();
  if (payloadResult.changed.length) {
    for (const [index, name] of skillNames.entries()) log('  Skill [' + (index + 1) + '/' + skillNames.length + '] ' + Math.round(100 * (index + 1) / skillNames.length) + '%: ' + name);
  } else log('  All ' + skillNames.length + ' skills and ' + payloadPlan.expectedCount + ' managed payload files verified; 0 changed, no copies needed.');
  log('  Payload files changed: ' + payloadResult.changed.length + '; obsolete removed: ' + payloadResult.removed.length + '; edited obsolete preserved: ' + payloadResult.preserved.length);
  if (payloadResult.backup) log('  Private payload backup: ' + payloadResult.backup);
  for (const kept of payloadResult.preserved) log('  Preserved edited old file: ' + kept);
  if (!dryRun) {
    const installedSkills = fs.readdirSync(envPaths.geminiSkillsDir).filter(name => /^[a-z0-9][a-z0-9-]*$/.test(name) && fs.existsSync(path.join(envPaths.geminiSkillsDir, name, 'SKILL.md'))).sort();
    safeWriteJson(path.join(envPaths.geminiConfigDir, 'skill-inventory.json'), { skills: installedSkills });
  }
  try {
    ensureMcpRuntime(path.join(envPaths.geminiConfigDir, 'mcp-runtime'), { dryRun, isolated, repoRoot, log });
  } catch (error) {
    failures.push('MCP runtime: ' + error.message);
    log('  Failed to provision local MCP runtimes: ' + error.message);
  }

  if (!dryRun) for (const [target, value] of mcpConfigs) writeManagedJson(target, value);

  log('\n[8/10] 🛠️ Installing Extensions (live CLI output)...');
  if (cleanExtensions) options.prepareExtensionReset(selectedExtensions);
  const panelSourceDir = path.join(repoRoot, 'extensions', 'git-branch-panel');
  if (!skipExtensions && fs.existsSync(panelSourceDir)) {
    try {
      const panel = installCustomGithubPanel(envPaths.cliPath, envPaths.extensionsDir, panelSourceDir, { dryRun, log, isolated });
      if (!panel.success) failures.push('Workstation GitHub Panel not registered');
    } catch (err) {
      failures.push('Custom extension: ' + err.message);
    }
  }

  if (!skipExtensions && !isolated && envPaths.cliPath && fs.existsSync(envPaths.cliPath)) {
    const extListFile = path.join(repoRoot, 'config', 'extensions.json');
    if (fs.existsSync(extListFile)) {
      const galleryResult = installGalleryExtensions(envPaths.cliPath, selectedExtensions, { dryRun, log, extensionsDir: envPaths.extensionsDir,
        target: galleryTarget(envPaths) });
      failures.push(...galleryResult.failures);
    }
  } else if (skipExtensions) {
    log('  Skipping all extension installation as requested.');
  } else if (isolated) {
    log('  Isolated profile: gallery CLI skipped; local helpers copied only to the fixture.');
  } else {
    log('  Antigravity CLI not found. Extensions can be installed later via Extension Manager.');
    failures.push('Antigravity CLI missing: extensions not installed');
  }

  const helperSourceDir = path.join(repoRoot, 'extensions/workstation-stability');
  if (!skipExtensions && fs.existsSync(helperSourceDir)) {
    try {
      const helper = installStabilityHelper(envPaths.cliPath, envPaths.extensionsDir, helperSourceDir, { dryRun, log, isolated });
      if (!helper.success) failures.push('Stability helper not registered');
    } catch (error) { failures.push('Stability helper: ' + error.message); }
  }

  if (!skipExtensions) {
    try {
      const calmTypeScript = installBundledCalmTypeScript(envPaths.cliPath, envPaths.extensionsDir,
        path.join(repoRoot, 'extensions/calm-typescript'), { dryRun, log, isolated });
      if (!calmTypeScript.success) failures.push('Calm TypeScript: ' + calmTypeScript.reason);
    } catch (error) { failures.push('Calm TypeScript: ' + error.message); }
  }

  if (!skipExtensions && failures.length === 0) {
    try { retireLegacyExtensions(envPaths, { dryRun, isolated, log }); }
    catch (error) { failures.push('Retired extensions: ' + error.message); }
  }

  try {
    const language = ensureRussianLanguagePack(envPaths, { dryRun, allowMissing: isolated || skipExtensions });
    log('  Russian display language: ' + (language.verified ? 'installed translations and startup cache verified; full IDE restart required.'
      : language.dryRun ? '[DRY-RUN] Would verify installed translations and rebuild the startup language cache.' : language.reason));
  } catch (error) { failures.push('Russian language: ' + error.message); log('  ' + error.message); }

  log('\n[9/10] 🌐 Browser CLI and runtime (live download output)...');
  if (!skipAgentBrowser && !isolated) {
    try {
      ensureAgentBrowser({ dryRun, log, envPaths, version: JSON.parse(fs.readFileSync(path.join(repoRoot, 'skills', 'agent-browser', 'metadata.json'), 'utf8')).version });
    } catch (error) { failures.push('Browser: ' + error.message); log('  ✗ ' + error.message); }
  }

  log('\n[10/10] 🔌 MCP permissions and final report');
  let mcpPermissions = null;
  let automation = null;
  if (autoApprove && !isolated) {
    try {
      automation = require('./agent-automation').queueAutomation(envPaths, { dryRun });
      if (automation.queued) log('  Native automation PENDING: it will apply after all IDE windows close normally. Status: ' + automation.statusFile);
      else if (automation.applied) log('  Native terminal/artifact Always Proceed, MCP Allow and AI Tab OFF saved and read back; start a new IDE session.');
      else if (!dryRun) failures.push('Native automation: ' + automation.reason);
    } catch (error) { failures.push('Native automation: ' + error.message); }
  } else if (skipPermissions) {
    mcpPermissions = { applied: false, skipped: true, reason: '--skip-permissions: existing approvals preserved; safe to run inside the IDE' };
    log('  ' + mcpPermissions.reason);
  } else if (!isolated) {
    try {
      mcpPermissions = require('./mcp-permissions').applyMcpPermissions(envPaths, { repoRoot, dryRun });
      if (mcpPermissions.applied) log('  MCP: global mcp(*) Allow saved; accounts/tokens unchanged.');
      else if (!dryRun) { failures.push('MCP permissions deferred: ' + mcpPermissions.reason); log('  ' + mcpPermissions.reason); }
    } catch (error) { failures.push('MCP permissions: ' + error.message); }
  }
  if (!autoApprove && !isolated) {
    try {
      automation = require('./agent-automation').queueAutomation(envPaths, { dryRun, scope: 'completion' });
      if (automation.queued) log('  Native AI Tab OFF PENDING: it will apply after all IDE windows close normally. Status: ' + automation.statusFile);
      else if (automation.applied) log('  Native AI Tab OFF saved and read back; chat approvals preserved.');
      else if (!dryRun) failures.push('Native AI completion: ' + automation.reason);
    } catch (error) { failures.push('Native AI completion: ' + error.message); }
  }
  if (!dryRun) {
    writeManagedJson(installOptionsFile, installedOptions);
    writeManagedJson(editorProfile, profileRequest);
    log('  Editor profile queued: the bundled helper applies and verifies it in the active IDE profile after restart.');
  }
  log('====================================================');
  log(failures.length ? 'Setup incomplete: ' + failures.join('; ') : dryRun ? '✓ Preview complete; no setup files changed.' : '✓ Setup files applied; runtime chat/auth require separate verification.');
  if (backupInfo) {
    log(`✓ Pre-install backup saved at: ${backupInfo.backupDir}`);
  }
  log('★ IMPORTANT NEXT STEPS:');
  log('  1. Save your work, fully close every Antigravity window, then reopen the IDE. Russian display language requires a full restart.');
  log('  2. Docker/GitHub MCP launchers removed; other MCP credentials preserved. The editor helper verifies the active settings.');
  log('  3. Native MCP Refresh may fail in IDE 2.5.5; setup does not fix that vendor lifecycle defect.');
  log(font && font.installed ? '  4. Font: JetBrains Mono installed/verified; editor and terminal select it through settings.json.' : '  4. Font: ' + (font?.reason || font?.error || 'not installed'));
  log('====================================================\n');

  return { success: failures.length === 0, failures, backupInfo, payload: payloadResult, dryRun, mcpPermissions, automation, font };
}

function ensureAgentBrowser(options = {}) {
  const { dryRun = false, log = console.log, version = '0.38.1', run = execSync,
    env = process.env, platform = process.platform, envPaths = getEnvironmentPaths() } = options;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid agent-browser version');
  log('\nVerifying agent-browser CLI and browser runtime...');
  if (dryRun) {
    log('  [DRY-RUN] Would verify the CLI, reuse configured/cached Chrome or Edge, and download Chrome only when no runtime exists.');
    return { dryRun: true };
  }

  let cliInstalled = false;
  let abVersion = '';
  try {
    abVersion = run('agent-browser --version', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env,
    }).trim();
    cliInstalled = abVersion === 'agent-browser ' + version;
    log(`  agent-browser CLI reports ${abVersion}.`);
  } catch (_) {
    cliInstalled = false;
  }

  if (!cliInstalled) {
    log('  Installing the pinned agent-browser CLI globally via npm...');
    try {
      run('npm install -g agent-browser@' + version, { encoding: 'utf8', stdio: 'inherit', env });
      const verified = run('agent-browser --version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }).trim();
      if (verified !== 'agent-browser ' + version) throw new Error('CLI version mismatch after installation');
      log('  agent-browser CLI installed and version verified.');
    } catch (error) {
      throw new Error(`Failed to install agent-browser CLI: ${error.message}. Please install manually using: npm install -g agent-browser@${version}`);
    }
  }

  const browser = require('./browser-runtime');
  let runtime = browser.findBrowserRuntime({ env, platform, envPaths });
  if (!runtime) {
    log('  No usable browser executable found; downloading Chrome via agent-browser install...');
    try { run('agent-browser install', { stdio: 'inherit', env }); }
    catch (error) { throw new Error('Browser download failed: ' + error.message + '. Existing settings remain installed; retry with Chrome or Edge installed.'); }
    runtime = browser.findBrowserRuntime({ env, platform, envPaths });
    if (!runtime) throw new Error('Browser installer finished without a usable executable');
  }
  log(`  Using ${runtime.source}: ${runtime.executable}`);
  const verified = browser.verifyBrowserRuntime(runtime, { run, env });
  browser.configureBrowserRuntime(runtime, envPaths, log);
  log('  Browser opened and closed an isolated test page successfully.');
  return verified;
}


function preflightNativeSetup(env, options = {}) {
  const compatibility = require('./native-compatibility').inspectNativeCompatibility(env, { repoRoot: options.repoRoot });
  if (!compatibility.supported) throw new Error('Native setup preflight: ' + compatibility.reason + '; no setup changes made');
  const profile = path.join(env.userSettingsDir, 'globalStorage/state.vscdb');
  payload.guard(path.dirname(profile), path.basename(profile));
  if (!fs.existsSync(profile)) throw new Error('Open Antigravity once to initialize the native profile, then retry setup; no setup changes made');
  let db;
  try {
    if (!fs.statSync(profile).isFile()) throw new Error('Not a database file');
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(profile, { readOnly: true });
    db.exec('BEGIN');
    const automation = require('./agent-automation');
    const tab = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(automation.TAB_TOPIC_KEY)?.value || '';
    automation.mergeTabPolicies(tab);
    if (options.nativeScope !== 'completion' && !options.skipPermissions) {
      const { TOPIC_KEY, mergeMcpGrant } = require('./mcp-permissions');
      const agent = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY)?.value || '';
      if (options.autoApprove) {
        automation.mergePolicies(agent);
        const approvals = require('./approval-policies');
        for (const key of approvals.EXTRA_TOPIC_KEYS) approvals.merge(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(key)?.value || '', key);
      }
      mergeMcpGrant(agent, { allow: ['mcp(*)'], replaceMcpAskAndDeny: true });
    }
    db.exec('COMMIT');
  } catch {
    throw new Error('Native profile database or managed preferences are invalid; no setup changes made');
  } finally { db?.close(); }
  return compatibility;
}

function runInstaller(options = {}) {
  const env = getEnvironmentPaths(options.customRoots || {});
  if (options.cleanExtensions && (options.skipExtensions || options.rulesOnly || (options.extensionProfile && options.extensionProfile !== 'full'))) {
    throw new Error('--clean-extensions requires a full extension installation');
  }
  if (options.cleanExtensions && !options.customRoots?.userProfile && process.platform === 'win32' && require('./mcp-permissions').isIdeRunning()) {
    throw new Error('Clean extensions requires every Antigravity window to be closed normally. Run this mode from a separate PowerShell window; no setup changes made.');
  }
  function execute() {
    let reset = null;
    const rollback = () => {
      if (!reset || options.dryRun) return null;
      const restored = reset.restore();
      (options.log || console.log)('  Previous extension packages and registration restored after setup failure. Backup: ' + reset.backup);
      return restored;
    };
    try {
      const result = runInstallerCore({ ...options, prepareExtensionReset(selectedExtensions) {
        const reusable = require('./extensions').selectCleanExtensionPackages(env, selectedExtensions,
          { isolated: !!options.customRoots?.userProfile });
        reset = require('./extension-reset').beginExtensionReset(env, { dryRun: options.dryRun,
          isolated: !!options.customRoots?.userProfile, log: options.log || console.log, ...reusable });
      } });
      if (reset && !options.dryRun) result.extensionReset = result.success ? reset.commit() : rollback();
      return result;
    } catch (error) {
      try { rollback(); }
      catch (restoreError) { throw new Error(error.message + '; rollback failed: ' + restoreError.message); }
      throw error;
    }
  }
  if (!options.rulesOnly && !options.customRoots?.userProfile) {
    if (process.platform !== 'win32' && !options.dryRun) throw new Error('Full IDE setup requires Windows; use install --rules-only on this platform');
    if (process.platform === 'win32') {
      preflightNativeSetup(env, options);
      require('./system-resources').preflightResources(env, { log: options.log });
    }
  }
  if (options.dryRun || options.rulesOnly) return execute();
  const lock = payload.guard(env.geminiConfigDir, 'workstation-setup/install.lock');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  let descriptor;
  try { descriptor = fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const oldBytes = fs.readFileSync(lock, 'utf8');
    let old;
    try { old = JSON.parse(oldBytes); } catch { throw new Error('Invalid interrupted setup lock; inspect ' + lock); }
    if (!Number.isSafeInteger(old.pid) || old.pid < 1) throw new Error('Invalid setup lock PID');
    try { process.kill(old.pid, 0); throw new Error('Another setup is running: ' + lock); }
    catch (aliveError) { if (aliveError.code !== 'ESRCH') throw aliveError; }
    if (fs.readFileSync(lock, 'utf8') !== oldBytes) throw new Error('Setup lock changed; retry later');
    fs.unlinkSync(lock);
    descriptor = fs.openSync(lock, 'wx', 0o600);
  }
  const token = JSON.stringify({ pid: process.pid, started: new Date().toISOString() });
  try { fs.writeFileSync(descriptor, token); fs.closeSync(descriptor); descriptor = null; return execute(); }
  finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    if (fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === token) fs.unlinkSync(lock);
  }
}

module.exports = { runInstaller, preflightNativeSetup, ensureAgentBrowser, ensureMcpRuntime, verifyMcpRuntime, updateMcpConfig };
