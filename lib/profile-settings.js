'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ideRootFromCli } = require('./install-paths');
const { readJsonFile } = require('./jsonc');
const { guard } = require('./owned-files');

function languageCacheFile(envPaths) {
  return guard(path.dirname(envPaths.userSettingsDir), 'languagepacks.json');
}

function ensureRussianLanguagePack(envPaths, options = {}) {
  const cacheFile = languageCacheFile(envPaths);
  if (options.dryRun) return { dryRun: true, cacheFile };
  const indexFile = path.join(envPaths.extensionsDir, 'extensions.json');
  const index = fs.existsSync(indexFile) ? readJsonFile(indexFile) : [];
  if (!Array.isArray(index)) throw new Error('Invalid extension registration index: ' + indexFile);
  const id = 'ms-ceintl.vscode-language-pack-ru';
  const entry = index.find(item => item.identifier?.id?.toLowerCase() === id);
  if (!entry) {
    if (options.allowMissing) return { skipped: true, reason: 'Russian language pack is not registered in this isolated/extension-skipped profile' };
    throw new Error('Russian language pack not registered; rerun full setup');
  }
  if (typeof entry.relativeLocation !== 'string' || !entry.relativeLocation.toLowerCase().startsWith(id + '-')
    || /[/\\]/.test(entry.relativeLocation)) throw new Error('Unsafe registered Russian language-pack location');
  const root = guard(envPaths.extensionsDir, entry.relativeLocation);
  const manifest = readJsonFile(guard(root, 'package.json'));
  if ((manifest.publisher + '.' + manifest.name).toLowerCase() !== id || manifest.version !== entry.version) {
    throw new Error('Russian language-pack identity/version does not match IDE registration');
  }
  const localization = manifest.contributes?.localizations?.find(item => item.languageId === 'ru');
  if (!localization || !Array.isArray(localization.translations)) throw new Error('Russian language-pack localization manifest missing');
  const translations = {};
  for (const translation of localization.translations) {
    if (typeof translation.id !== 'string' || typeof translation.path !== 'string') throw new Error('Invalid Russian translation entry');
    const relative = translation.path.replace(/^\.\//, '');
    const file = guard(root, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('Russian translation file missing: ' + file);
    const content = readJsonFile(file);
    if (translation.id === 'vscode' && (!content?.contents || typeof content.contents !== 'object' || Array.isArray(content.contents))) {
      throw new Error('Russian core translation contents missing: ' + file);
    }
    translations[translation.id] = file;
  }
  if (!translations.vscode) throw new Error('Russian core editor translation missing');
  const identifier = { id: entry.identifier.id };
  if (entry.identifier.uuid) identifier.uuid = entry.identifier.uuid;
  // This MD5 is VS Code's cache identifier, not an artifact verification bypass.
  const hash = require('node:crypto').createHash('md5').update(identifier.uuid || identifier.id).update(manifest.version).digest('hex');
  const current = fs.existsSync(cacheFile) ? readJsonFile(cacheFile, { emptyValue: {} }) : {};
  if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('Invalid language cache: ' + cacheFile);
  const next = { ...current, ru: { hash, extensions: [{ extensionIdentifier: identifier, version: manifest.version }], translations,
    label: localization.localizedLanguageName || localization.languageName || 'Русский' } };
  const bytes = JSON.stringify(next);
  const unchanged = fs.existsSync(cacheFile) && fs.readFileSync(cacheFile, 'utf8') === bytes;
  if (!unchanged) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const temporary = cacheFile + '.' + require('node:crypto').randomUUID() + '.tmp';
    try { fs.writeFileSync(temporary, bytes); fs.renameSync(temporary, cacheFile); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  return { verified: true, locale: 'ru', version: manifest.version, cacheFile, unchanged };
}

function expectedSettings(envPaths, repoRoot = path.resolve(__dirname, '..')) {
  const settings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/settings.json'), 'utf8'));
  const ideRoot = envPaths.ideRoot || ideRootFromCli(envPaths.cliPath) || path.join(envPaths.localAppData, 'Programs', 'Antigravity IDE');
  const workbenches = ['electron-browser', 'electron-sandbox'].map(renderer => path.join(ideRoot, 'resources/app/out/vs/code', renderer, 'workbench/workbench.html'));
  const workbench = workbenches.find(file => fs.existsSync(file)) || workbenches[0];
  settings['jellyCursor.workbenchHtmlPath'] = workbench.replace(/\\/g, '/');
  if (!envPaths.gitBashPath) throw new Error('Git Bash executable not found; install Git for Windows before restoring terminal settings');
  settings['terminal.integrated.profiles.windows']['Git Bash'].path = envPaths.gitBashPath;
  return settings;
}

function homeTemplate(envPaths, relative, repoRoot = path.resolve(__dirname, '..')) {
  const content = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  if (!envPaths.gitBashPath) throw new Error('Git Bash executable not found for Antigravity hooks');
  const rendered = content
    .replaceAll('${USER_HOME}', () => JSON.stringify(envPaths.userProfile.replace(/\\/g, '/')).slice(1, -1))
    .replaceAll('${NODE_EXE}', () => JSON.stringify(envPaths.nodeExe.replace(/\\/g, '/')).slice(1, -1))
    .replaceAll('${GIT_BASH}', () => JSON.stringify(envPaths.gitBashPath.replace(/\\/g, '/')).slice(1, -1));
  JSON.parse(rendered);
  return rendered;
}

function mergeSettings(current, managed) {
  const result = { ...current, ...managed };
  for (const [key, value] of Object.entries(managed)) {
    if (/^(?:\[[^\]]+\])+$/.test(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = { ...current[key], ...value };
    }
  }
  for (const key of ['files.watcherExclude', 'search.exclude', 'chat.tools.terminal.autoApprove']) {
    if (current[key] && typeof current[key] === 'object' && !Array.isArray(current[key])) result[key] = { ...current[key], ...managed[key] };
  }
  // Preserve explicit command denials even when a managed command is allowed.
  for (const [command, value] of Object.entries(current['chat.tools.terminal.autoApprove'] || {})) {
    if (value === false) result['chat.tools.terminal.autoApprove'][command] = false;
  }
  return result;
}
function mergeKeybindings(current, managed) {
  const slot = binding => JSON.stringify([binding.key, binding.when || '', String(binding.command || '').startsWith('-')]);
  const slots = new Set(managed.map(slot));
  return [...current.filter(binding => !slots.has(slot(binding))), ...managed];
}
module.exports = { expectedSettings, mergeSettings, mergeKeybindings, homeTemplate, ensureRussianLanguagePack, languageCacheFile };
