'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const owned = require('./owned-files');
const { languageCacheFile } = require('./profile-settings');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function managedFiles(env) {
  return [
    [languageCacheFile(env), 'languagepacks.json'],
    [path.join(env.geminiConfigDir, 'workstation-setup/editor-profile.json'), 'editor-profile.json'],
    [path.join(env.geminiConfigDir, 'workstation-setup/install-options.json'), 'install-options.json'],
    [path.join(env.geminiConfigDir, 'mansur-setup/.installation.json'), 'legacy-setup-installation.json'],
    [path.join(env.geminiConfigDir, 'mansur-setup/editor-profile.json'), 'legacy-editor-profile.json'],
    [path.join(env.geminiConfigDir, 'mansur-setup/install-options.json'), 'legacy-install-options.json'],
    [env.settingsJson, 'settings.json'], [env.keybindingsJson, 'keybindings.json'], [env.argvJson, 'argv.json'],
    [path.join(env.geminiDir, 'GEMINI.md'), 'GEMINI.md'],
    [path.join(env.geminiDir, 'antigravity/settings.json'), 'antigravity-settings.json'],
    [path.join(env.geminiConfigDir, 'hooks.json'), 'hooks.json'],
    [require('./native-hooks').nativeHooksPath(env), 'native-hooks.json'],
    [path.join(env.geminiConfigDir, 'config.json'), 'gemini-config.json'],
    [path.join(env.geminiConfigDir, 'mcp_config.json'), 'mcp_config.json'],
    [path.join(env.geminiConfigDir, 'skill-inventory.json'), 'skill-inventory.json'],
    [path.join(env.geminiDir, 'antigravity/mcp_config.json'), 'mcp-antigravity.json'],
    [owned.statePath(env), 'setup-installation.json'],
    ...['.gsd-profile', 'gsd-install-state.json', 'gsd-file-manifest.json'].map(name => [path.join(env.geminiDir, 'antigravity', name), 'antigravity-runtime/' + name]),
    ...['package.json', 'package-lock.json'].map(name => [path.join(env.geminiConfigDir, 'mcp-runtime', name), 'mcp-runtime/' + name]),
  ].map(([src, dest]) => ({ src, dest }));
}

function checkTree(directory) {
  owned.guard(path.dirname(directory), path.basename(directory));
  if (!fs.existsSync(directory)) return;
  if (!fs.statSync(directory).isDirectory()) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = owned.guard(directory, entry.name);
    if (entry.isDirectory()) checkTree(file);
  }
}

function createBackup(envPaths, label = 'installer') {
  checkTree(languageCacheFile(envPaths));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(envPaths.backupsDir, `setup-backup-${label}-${timestamp}-${require('node:crypto').randomUUID()}`);
  owned.guard(envPaths.backupsDir, path.basename(backupDir));
  const targets = managedFiles(envPaths);
  for (const target of targets) checkTree(target.src);
  for (const source of [path.join(envPaths.geminiConfigDir, 'workstation-setup/editor-profile.json'), envPaths.settingsJson, envPaths.keybindingsJson, envPaths.argvJson, path.join(envPaths.geminiDir, 'GEMINI.md'), envPaths.geminiRulesDir, envPaths.geminiSkillsDir, envPaths.geminiScriptsDir,
    path.join(envPaths.geminiConfigDir, 'agents'), path.join(envPaths.geminiDir, 'antigravity/gsd-core'), path.join(envPaths.geminiDir, 'antigravity/hooks'), path.join(envPaths.antigravityStateDir, 'jelly-cursor'), path.join(envPaths.geminiConfigDir, 'workstation-unified'),
    path.join(envPaths.geminiDir, 'antigravity/settings.json'), path.join(envPaths.geminiConfigDir, 'hooks.json'), path.join(envPaths.geminiConfigDir, 'config.json'),
    path.join(envPaths.geminiDir, 'skills'), path.join(envPaths.geminiDir, 'antigravity/scripts'), path.join(envPaths.geminiDir, 'antigravity/skills'),
    ...['.gsd-profile', 'gsd-install-state.json', 'gsd-file-manifest.json'].map(name => path.join(envPaths.geminiDir, 'antigravity', name)),
    ...['package.json', 'package-lock.json'].map(name => path.join(envPaths.geminiConfigDir, 'mcp-runtime', name)),
    path.join(envPaths.geminiConfigDir, 'mcp_config.json'), path.join(envPaths.geminiDir, 'antigravity/mcp_config.json'), owned.statePath(envPaths)]) checkTree(source);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  }

  const backedUp = [];

  for (const t of targets) {
    if (fs.existsSync(t.src)) {
      const destPath = path.join(backupDir, t.dest);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(t.src, destPath);
      backedUp.push(t.dest);
    }
  }

  if (fs.existsSync(envPaths.geminiRulesDir)) {
    const rulesBackup = path.join(backupDir, 'rules');
    fs.cpSync(envPaths.geminiRulesDir, rulesBackup, { recursive: true });
    backedUp.push('rules/');
  }

  for (const [source, name] of [
    [envPaths.geminiSkillsDir, 'skills'],
    [envPaths.geminiScriptsDir, 'scripts'],
    [path.join(envPaths.geminiConfigDir, 'agents'), 'agents'],
    [path.join(envPaths.geminiDir, 'antigravity', 'gsd-core'), 'gsd-core'],
    [path.join(envPaths.geminiDir, 'antigravity', 'hooks'), 'hooks'],
    [path.join(envPaths.antigravityStateDir, 'jelly-cursor'), 'jelly-cursor'],
    [path.join(envPaths.geminiConfigDir, 'workstation-unified'), 'workstation-unified'],
    [path.join(envPaths.geminiConfigDir, 'mansur-unified'), 'legacy-unified'],
    [path.join(envPaths.geminiDir, 'skills'), 'global-skills'],
    [path.join(envPaths.geminiDir, 'antigravity', 'skills'), 'antigravity-runtime/skills'],
    [path.join(envPaths.geminiDir, 'antigravity', 'scripts'), 'antigravity-runtime/scripts'],
  ]) {
    checkTree(source);
    if (fs.existsSync(source)) {
      fs.cpSync(source, path.join(backupDir, name), { recursive: true });
      backedUp.push(name + '/');
    }
  }
  const manifest = {
    schemaVersion: 2,
    absent: targets.filter(target => !fs.existsSync(target.src)).map(target => target.dest),
    date: new Date().toISOString(),
    label,
    backedUp,
    envPaths: {
      settingsJson: envPaths.settingsJson,
      keybindingsJson: envPaths.keybindingsJson,
      argvJson: envPaths.argvJson,
      geminiDir: envPaths.geminiDir,
    }
  };
  const files = {};
  const walkBackup = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walkBackup(file);
      else if (entry.isFile()) files[path.relative(backupDir, file).split(path.sep).join('/')] = sha256(fs.readFileSync(file));
    }
  };
  walkBackup(backupDir);
  manifest.files = files;
  fs.writeFileSync(path.join(backupDir, 'backup-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  return { backupDir, backedUp };
}

function restoreBackup(backupDir, envPaths, options = {}) {
  if (!fs.existsSync(backupDir)) {
    throw new Error(`Backup directory not found: ${backupDir}`);
  }

  const restored = [];
  checkTree(languageCacheFile(envPaths));
  checkTree(backupDir);
  const registryCopy = path.join(backupDir, 'setup-installation.json');
  const legacyBrand = (fs.existsSync(registryCopy) && JSON.parse(fs.readFileSync(registryCopy, 'utf8')).contract === 'mansur-setup-payload-v1')
    || fs.existsSync(path.join(backupDir, 'mansur-unified'));
  const legacyMetadata = {
    'editor-profile.json': 'editor-profile.json',
    'install-options.json': 'install-options.json',
    'setup-installation.json': '.installation.json',
  };
  const fileTargets = managedFiles(envPaths).map(target => legacyBrand && Object.hasOwn(legacyMetadata, target.dest)
    ? { ...target, src: owned.guard(envPaths.geminiConfigDir, 'mansur-setup/' + legacyMetadata[target.dest]) } : target);
  for (const target of fileTargets) checkTree(target.src);
  for (const target of fileTargets) {
    const source = path.join(backupDir, target.dest);
    if (fs.existsSync(source) && !fs.statSync(source).isFile()) throw new Error('Expected a backup configuration file: ' + source);
    if (fs.existsSync(target.src) && !fs.statSync(target.src).isFile()) throw new Error('Expected a configuration file: ' + target.src);
  }
  const manifestPath = path.join(backupDir, 'backup-manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Backup manifest is missing; the backup is incomplete and nothing was restored: ' + backupDir);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw new Error('Invalid backup manifest; nothing was restored');
  if(manifest.schemaVersion!==2&&((manifest.schemaVersion!==undefined&&manifest.schemaVersion!==1)
    ||typeof manifest.date!=='string'||!Array.isArray(manifest.backedUp)||manifest.backedUp.some(name=>typeof name!=='string')))
    throw new Error('Invalid or unsupported legacy backup manifest; nothing was restored');
  const corrupted = [];
  if(manifest.schemaVersion===2&&(!manifest.files||typeof manifest.files!=='object'||Array.isArray(manifest.files)))throw new Error('Invalid backup checksum inventory; nothing was restored');
  if (manifest.files && typeof manifest.files === 'object' && !Array.isArray(manifest.files)) {
    for (const [relative, hash] of Object.entries(manifest.files)) {
      if (typeof relative !== 'string' || !relative || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)
        || relative.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new Error('Invalid backup manifest file entry; nothing was restored');
      }
      const file = owned.guard(backupDir, relative);
      if (!fs.existsSync(file)) throw new Error(`Backup is incomplete: "${relative}" is listed in its manifest but missing; nothing was restored`);
      if (sha256(fs.readFileSync(file)) !== hash) corrupted.push(relative);
    }
  }
  if (corrupted.length) throw new Error('Backup checksum mismatch: ' + corrupted.join(', ') + '; nothing was restored');
  if(manifest.schemaVersion===2){
    const inspect=directory=>{
      for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
        const file=path.join(directory,entry.name),relative=path.relative(backupDir,file).split(path.sep).join('/');
        if(entry.isDirectory())inspect(file);
        else if(relative!=='backup-manifest.json'&&!Object.hasOwn(manifest.files,relative))throw new Error('Unlisted backup file: '+relative+'; nothing was restored');
      }
    };
    inspect(backupDir);
  }
  const absent = manifest.schemaVersion === 2 ? manifest.absent : [];
  if (!Array.isArray(absent) || new Set(absent).size !== absent.length
    || absent.some(name => !fileTargets.some(target => target.dest === name) || fs.existsSync(path.join(backupDir, name)))) {
    throw new Error('Invalid absent-file backup manifest; nothing restored');
  }
  const removeAbsent = fileTargets.filter(target => absent.includes(target.dest) && fs.existsSync(target.src));
  for (const target of removeAbsent) if (!fs.statSync(target.src).isFile()) throw new Error('Expected a configuration file: ' + target.src);
  for (const directory of [path.join(envPaths.geminiConfigDir, 'workstation-setup/editor-profile.json'), envPaths.settingsJson, envPaths.keybindingsJson, envPaths.geminiRulesDir, envPaths.geminiSkillsDir, envPaths.geminiScriptsDir, path.join(envPaths.geminiConfigDir, 'agents'), path.join(envPaths.geminiDir, 'antigravity/gsd-core'), path.join(envPaths.geminiDir, 'antigravity/hooks'), path.join(envPaths.antigravityStateDir, 'jelly-cursor'), path.join(envPaths.geminiConfigDir, 'workstation-unified')]) checkTree(directory);
  for (const file of [envPaths.argvJson, path.join(envPaths.geminiDir, 'GEMINI.md'), path.join(envPaths.geminiDir, 'antigravity/settings.json'), path.join(envPaths.geminiConfigDir, 'hooks.json'), path.join(envPaths.geminiConfigDir, 'config.json'), path.join(envPaths.geminiConfigDir, 'mcp_config.json'), path.join(envPaths.geminiDir, 'antigravity/mcp_config.json'), owned.statePath(envPaths), path.join(envPaths.geminiConfigDir, 'mansur-unified')]) checkTree(file);
  for (const relative of ['skills', 'antigravity/skills', 'antigravity/scripts', 'antigravity/.gsd-profile', 'antigravity/gsd-install-state.json', 'antigravity/gsd-file-manifest.json']) checkTree(path.join(envPaths.geminiDir, relative));
  for (const name of ['package.json', 'package-lock.json']) checkTree(path.join(envPaths.geminiConfigDir, 'mcp-runtime', name));
  const extras = owned.restorePayloadExtras(envPaths, backupDir, { dryRun: true });
  if (!options.dryRun) owned.restorePayloadExtras(envPaths, backupDir);
  for (const [name, target] of [
    ['skills', envPaths.geminiSkillsDir], ['scripts', envPaths.geminiScriptsDir],
    ['agents', path.join(envPaths.geminiConfigDir, 'agents')],
    ['gsd-core', path.join(envPaths.geminiDir, 'antigravity', 'gsd-core')],
    ['hooks', path.join(envPaths.geminiDir, 'antigravity', 'hooks')],
    ['jelly-cursor', path.join(envPaths.antigravityStateDir, 'jelly-cursor')],
    ['workstation-unified', path.join(envPaths.geminiConfigDir, 'workstation-unified')],
    ['legacy-unified', path.join(envPaths.geminiConfigDir, 'mansur-unified')],
    ['mansur-unified', path.join(envPaths.geminiConfigDir, 'mansur-unified')],
    ['global-skills', path.join(envPaths.geminiDir, 'skills')],
    ['antigravity-runtime/skills', path.join(envPaths.geminiDir, 'antigravity', 'skills')],
    ['antigravity-runtime/scripts', path.join(envPaths.geminiDir, 'antigravity', 'scripts')],
  ]) {
    const source = path.join(backupDir, name);
    if (fs.existsSync(source)) {
      if (!options.dryRun) fs.cpSync(source, target, { recursive: true });
      restored.push(name + '/');
    }
  }

  const targets = fileTargets.map(target => ({ src: path.join(backupDir, target.dest), dest: target.src }));

  for (const t of targets) {
    if (fs.existsSync(t.src)) {
      const destDir = path.dirname(t.dest);
      if (!options.dryRun) {
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(t.src, t.dest);
      }
      restored.push(path.basename(t.dest));
    }
  }

  const rulesBackup = path.join(backupDir, 'rules');
  if (fs.existsSync(rulesBackup)) {
    if (!options.dryRun && !fs.existsSync(envPaths.geminiRulesDir)) {
      fs.mkdirSync(envPaths.geminiRulesDir, { recursive: true });
    }
    if (!options.dryRun) fs.cpSync(rulesBackup, envPaths.geminiRulesDir, { recursive: true });
    restored.push('rules/');
  }

  if (!options.dryRun) {
    if (legacyBrand) {
      for (const name of ['editor-profile.json', 'install-options.json', '.installation.json']) {
        const current = owned.guard(envPaths.geminiConfigDir, 'workstation-setup/' + name);
        if (fs.existsSync(current)) fs.unlinkSync(current);
      }
    }
    for (const target of removeAbsent) if (fs.existsSync(target.src)) fs.unlinkSync(target.src);
    const profileFile = path.join(envPaths.geminiConfigDir, 'workstation-setup/editor-profile.json');
    if (manifest.schemaVersion!==2&&!fs.existsSync(path.join(backupDir, 'editor-profile.json')) && fs.existsSync(profileFile)) fs.unlinkSync(profileFile);
    if (manifest.schemaVersion!==2&&!fs.existsSync(path.join(backupDir, 'setup-installation.json')) && fs.existsSync(owned.statePath(envPaths))) fs.unlinkSync(owned.statePath(envPaths));
  }
  return { restored, removed: [...new Set([...extras.removed, ...removeAbsent.map(target => target.src)])], preserved: extras.preserved, corrupted, dryRun: !!options.dryRun };
}

function listBackups(envPaths) {
  if (!fs.existsSync(envPaths.backupsDir)) return [];
  const entries = fs.readdirSync(envPaths.backupsDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && (e.name.startsWith('setup-backup-') || e.name.startsWith('quiet-completion-')))
    .map(e => {
      const dirPath = path.join(envPaths.backupsDir, e.name);
      let manifest = null;
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(dirPath, e.name.startsWith('quiet-completion-') ? 'manifest.json' : 'backup-manifest.json'), 'utf8'));
      } catch (_) {}
      return {
        name: e.name,
        path: dirPath,
        date: typeof manifest?.date === 'string' ? manifest.date : fs.statSync(dirPath).mtime.toISOString(),
        manifest,
        incomplete: manifest === null,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function validateBackup(backupDir, envPaths) {
  return restoreBackup(backupDir, envPaths, { dryRun: true });
}

module.exports = { createBackup, restoreBackup, validateBackup, listBackups };
