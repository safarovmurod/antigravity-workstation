const fs = require('fs');
const path = require('path');
const os = require('os');

function getDefaultPaths(roots = {}) {
  const userProfile = roots.userProfile || process.env.USERPROFILE || os.homedir();
  const localAppData = roots.localAppData || process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local');
  const appData = roots.appData || process.env.APPDATA || path.join(userProfile, 'AppData', 'Roaming');
  const userSettings = path.join(appData, 'Antigravity IDE', 'User', 'settings.json');
  let ideRoot = path.join(localAppData, 'Programs', 'Antigravity IDE');
  let workbenchHtml = path.join(ideRoot, 'resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html');
  try {
    const settings = JSON.parse(fs.readFileSync(userSettings, 'utf8').replace(/^\uFEFF/, ''));
    const value = settings['jellyCursor.workbenchHtmlPath'];
    const configured = typeof value === 'string' ? path.normalize(value) : null;
    if (typeof configured === 'string' && path.isAbsolute(configured) && path.basename(configured) === 'workbench.html') {
      for (let directory = path.dirname(configured); directory !== path.dirname(directory); directory = path.dirname(directory)) {
        if (fs.existsSync(path.join(directory, 'resources', 'app', 'package.json'))) {
          ideRoot = directory;
          workbenchHtml = configured;
          break;
        }
      }
    }
  } catch { /* Missing settings: report the standard location without guessing another drive. */ }
  const workbenchDir = path.dirname(workbenchHtml);
  return {
    ideRoot,
    packageJson: path.join(ideRoot, 'resources', 'app', 'package.json'),
    workbenchDir,
    workbenchHtml,
    jellyScript: path.join(workbenchDir, 'jelly-cursor.js'),
    templateScript: path.join(userProfile, '.antigravity', 'jelly-cursor', 'jelly-cursor.template.js'),
    stateFile: path.join(userProfile, '.antigravity', 'jelly-cursor', 'jelly-cursor-state.json'),
    userSettings,
  };
}
const DEFAULT_PATHS = getDefaultPaths();

const MARKER = '<!-- MANSUR_JELLY_CURSOR_PATCH -->';
const LEGACY_START_MARKER = '<!-- jelly-cursor:start -->';
const LEGACY_END_MARKER = '<!-- jelly-cursor:end -->';
const SCRIPT_TAG = '<script src="./jelly-cursor.js"></script>';
const FULL_PATCH = `${MARKER}\n${LEGACY_START_MARKER}${SCRIPT_TAG}${LEGACY_END_MARKER}`;

/**
 * Main repair and inspection logic.
 * @param {object} customPaths - Optional custom paths for testing and isolated verification.
 * @returns {object} Result of the check/repair operation.
 */
function checkAndRepair(customPaths = {}) {
  const paths = { ...DEFAULT_PATHS, ...customPaths };
  const log = [];
  const addLog = (msg) => {
    log.push(msg);
    console.log(`[JellyCursor Repair] ${msg}`);
  };

  addLog('=== Mouse Click Ripple / Jelly Cursor Check ===');

  // 1. Check Antigravity IDE version
  let currentVersion = 'unknown';
  if (fs.existsSync(paths.packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(paths.packageJson, 'utf8'));
      currentVersion = pkg.version || 'unknown';
      addLog(`Antigravity IDE version: ${currentVersion}`);
    } catch (err) {
      const errDetail = `Error reading package.json: ${err.message}`;
      addLog(errDetail);
      return { success: false, reason: errDetail, log };
    }
  } else {
    const errDetail = `package.json not found: ${paths.packageJson}`;
    addLog(errDetail);
    return { success: false, reason: errDetail, log };
  }

  // 2. Read state
  let state = {
    lastPatchedVersion: null,
    lastCheckTime: null,
    history: []
  };

  if (fs.existsSync(paths.stateFile)) {
    try {
      state = JSON.parse(fs.readFileSync(paths.stateFile, 'utf8'));
      addLog(`Previous state version: ${state.lastPatchedVersion || 'none'}`);
    } catch (e) {
      addLog(`State file read warning, initializing fresh state`);
    }
  }

  const isVersionChanged = state.lastPatchedVersion && state.lastPatchedVersion !== currentVersion;
  if (isVersionChanged) {
    addLog(`IDE version changed: ${state.lastPatchedVersion} -> ${currentVersion}`);
  }

  // 3. Check workbench.html
  if (!fs.existsSync(paths.workbenchHtml)) {
    const errDetail = `workbench.html not found: ${paths.workbenchHtml}`;
    addLog(errDetail);
    return { success: false, reason: errDetail, log };
  }

  let htmlContent = fs.readFileSync(paths.workbenchHtml, 'utf8');

  // 4. Safety Check on workbench.html
  const hasClosingHtmlTag = /<\/html\s*>/i.test(htmlContent);
  if (!hasClosingHtmlTag) {
    const errDetail = `Safety check failed: workbench.html missing closing </html> tag`;
    addLog(errDetail);
    return { success: false, reason: errDetail, log };
  }

  // 5. Restore jelly-cursor.js in workbench if missing
  let scriptRestored = false;
  if (!fs.existsSync(paths.jellyScript)) {
    addLog(`jelly-cursor.js missing in ${paths.workbenchDir}. Restoring from template...`);
    if (fs.existsSync(paths.templateScript)) {
      try {
        fs.copyFileSync(paths.templateScript, paths.jellyScript);
        scriptRestored = true;
        addLog(`jelly-cursor.js restored successfully.`);
      } catch (err) {
        const errDetail = `Cannot copy jelly-cursor.js: ${err.message}`;
        addLog(errDetail);
        return { success: false, reason: errDetail, log };
      }
    } else {
      const errDetail = `Template jelly-cursor.template.js missing: ${paths.templateScript}`;
      addLog(errDetail);
      return { success: false, reason: errDetail, log };
    }
  } else {
    addLog(`jelly-cursor.js already present.`);
  }

  // 6. Check patch markers
  const hasMarker = htmlContent.includes(MARKER);
  const hasLegacyPatch = htmlContent.includes(LEGACY_START_MARKER) && htmlContent.includes(LEGACY_END_MARKER);

  let patchApplied = false;
  let backupCreatedPath = null;

  if (hasMarker && hasLegacyPatch) {
    addLog(`Patch already present and valid. No changes needed.`);
  } else if (!hasMarker && hasLegacyPatch) {
    addLog(`Legacy patch detected, upgrading markers...`);
    const backupName = `workbench.html.backup-${currentVersion}-${Date.now()}`;
    const backupPath = path.join(path.dirname(paths.workbenchHtml), backupName);
    fs.copyFileSync(paths.workbenchHtml, backupPath);
    backupCreatedPath = backupPath;
    addLog(`Backup created: ${backupName}`);

    htmlContent = htmlContent.replace(LEGACY_START_MARKER, `${MARKER}\n${LEGACY_START_MARKER}`);
    fs.writeFileSync(paths.workbenchHtml, htmlContent, 'utf8');
    patchApplied = true;
    addLog(`Marker upgraded successfully.`);
  } else {
    addLog(`Patch not found. Applying safe injection...`);
    const backupName = `workbench.html.backup-${currentVersion}-${Date.now()}`;
    const backupPath = path.join(path.dirname(paths.workbenchHtml), backupName);
    fs.copyFileSync(paths.workbenchHtml, backupPath);
    backupCreatedPath = backupPath;
    addLog(`Backup created: ${backupName}`);

    const patchedHtml = htmlContent.replace(/<\/html\s*>/i, `${FULL_PATCH}\n</html>`);
    fs.writeFileSync(paths.workbenchHtml, patchedHtml, 'utf8');
    patchApplied = true;
    addLog(`Patch injected safely into workbench.html.`);
  }

  // 7. Verify settings.json
  let settingsChecked = false;
  const userSettingsPath = paths.userSettings || path.join(appData, 'Antigravity IDE', 'User', 'settings.json');
  if (fs.existsSync(userSettingsPath)) {
    try {
      const rawSettings = fs.readFileSync(userSettingsPath, 'utf8');
      if (rawSettings.includes('"jellyCursor.rippleEnabled": true')) {
        addLog(`Settings notice: rippleEnabled = true`);
        settingsChecked = true;
      } else {
        addLog(`Settings verified: rippleEnabled is disabled (native smooth mode)`);
      }
    } catch (e) {
      addLog(`Settings read notice: ${e.message}`);
    }
  }

  // 8. Update state
  state.lastPatchedVersion = currentVersion;
  state.lastCheckTime = new Date().toISOString();
  if (patchApplied || scriptRestored) {
    state.history.push({
      date: new Date().toISOString(),
      version: currentVersion,
      action: patchApplied ? 'PATCHED' : 'RESTORED_SCRIPT',
      backupPath: backupCreatedPath
    });
  }

  try {
    const stateDir = path.dirname(paths.stateFile);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    fs.writeFileSync(paths.stateFile, JSON.stringify(state, null, 2), 'utf8');
    addLog(`State saved to ${paths.stateFile}`);
  } catch (err) {
    addLog(`State save notice: ${err.message}`);
  }

  addLog('=== Jelly Cursor verification complete ===');

  return {
    success: true,
    version: currentVersion,
    patchAlreadyPresent: hasMarker && hasLegacyPatch,
    patchApplied,
    backupCreated: backupCreatedPath,
    scriptRestored,
    settingsChecked,
    log
  };
}

if (require.main === module) {
  const res = checkAndRepair();
  process.exit(res.success ? 0 : 1);
}

module.exports = { checkAndRepair, getDefaultPaths, DEFAULT_PATHS, MARKER, FULL_PATCH };
