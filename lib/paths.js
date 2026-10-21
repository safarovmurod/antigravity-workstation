'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { findAntigravity } = require('./install-paths');

function getEnvironmentPaths(customRoots = {}, runtime = {}) {
  const isWindows = (runtime.platform || process.platform) === 'win32';
  const paths = isWindows ? path.win32 : path;
  const env = runtime.env || process.env;
  const exists = runtime.existsSync || fs.existsSync;
  const run = runtime.execFileSync || execFileSync;
  const userProfile = customRoots.userProfile || env.USERPROFILE || os.homedir();
  const appData = customRoots.appData || (!customRoots.userProfile && env.APPDATA) || paths.join(userProfile, 'AppData', 'Roaming');
  const localAppData = customRoots.localAppData || (!customRoots.userProfile && env.LOCALAPPDATA) || paths.join(userProfile, 'AppData', 'Local');
  const programFiles = env.ProgramFiles || path.win32.join(env.SystemDrive || 'C:', 'Program Files');
  const { cliPath, ideRoot } = findAntigravity({ ...customRoots, localAppData, programFiles, isolated: !!customRoots.userProfile }, runtime);
  let userDataName = 'Antigravity IDE', dataFolderName = '.antigravity-ide', applicationName = 'antigravity-ide';
  if (ideRoot) {
    try {
      const read = runtime.readFileSync || fs.readFileSync;
      const product = JSON.parse(read(paths.join(ideRoot, 'resources', 'app', 'product.json'), 'utf8'));
      if (/^Antigravity(?: IDE)?$/i.test(product.nameShort)) userDataName = product.nameShort;
      if (/^\.antigravity(?:-ide)?$/i.test(product.dataFolderName)) dataFolderName = product.dataFolderName;
      if (/^antigravity(?:-ide)?$/i.test(product.applicationName)) applicationName = product.applicationName;
    } catch { /* Default to the current IDE profile when metadata is unavailable. */ }
  }

  // 2. User directories
  const userSettingsDir = paths.join(appData, userDataName, 'User');
  const extensionsDir = paths.join(userProfile, dataFolderName, 'extensions');
  const geminiDir = paths.join(userProfile, '.gemini');
  const geminiConfigDir = paths.join(geminiDir, 'config');
  const geminiRulesDir = paths.join(geminiConfigDir, 'rules');
  const geminiSkillsDir = paths.join(geminiConfigDir, 'skills');
  const geminiScriptsDir = paths.join(geminiDir, 'scripts');
  const antigravityToolsDir = paths.join(userProfile, '.antigravity-tools');
  const antigravityStateDir = paths.join(userProfile, '.antigravity');
  const backupsDir = paths.join(geminiDir, 'backups');

  // 3. Resolve the Git Bash installed alongside the Git executable on PATH.
  const gitBashCandidates = [customRoots.gitBashPath];
  if (isWindows && !(customRoots.gitBashPath && exists(customRoots.gitBashPath))) {
    try {
      const gitExecutables = run('where.exe', ['git.exe'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 5000 }).trim().split(/\r?\n/);
      for (const gitExe of gitExecutables) {
        let directory = paths.dirname(gitExe);
        for (let level = 0; level < 3; level++, directory = paths.dirname(directory)) {
          gitBashCandidates.push(paths.join(directory, 'bin', 'bash.exe'), paths.join(directory, 'usr', 'bin', 'bash.exe'));
        }
      }
    } catch (_) {}
  }
  gitBashCandidates.push(paths.join(programFiles, 'Git', 'bin', 'bash.exe'));
  const gitBashPath = gitBashCandidates.find(candidate => candidate && exists(candidate))
    || (customRoots.userProfile && !isWindows ? path.win32.join(programFiles, 'Git', 'bin', 'bash.exe') : null);

  return {
    isWindows,
    userProfile,
    appData,
    localAppData,
    programFiles,
    cliPath,
    ideRoot,
    userSettingsDir,
    settingsJson: paths.join(userSettingsDir, 'settings.json'),
    keybindingsJson: paths.join(userSettingsDir, 'keybindings.json'),
    argvJson: paths.join(userProfile, dataFolderName, 'argv.json'),
    extensionsDir,
    geminiDir,
    geminiConfigDir,
    applicationName,
    nativeHooksJson: paths.join(geminiDir, applicationName, 'hooks.json'),
    geminiRulesDir,
    geminiSkillsDir,
    geminiScriptsDir,
    antigravityToolsDir,
    antigravityStateDir,
    backupsDir,
    gitBashPath,
    nodeExe: process.execPath,
    totalMemoryBytes: customRoots.totalMemoryBytes ?? (runtime.totalmem || os.totalmem)(),
  };
}

module.exports = { getEnvironmentPaths };
