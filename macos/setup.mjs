#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import configMerge from '../lib/config-merge.js';
import nativeHooks from '../lib/native-hooks.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function mergeObjects(current, managed) {
  const result = { ...current };
  for (const [key, value] of Object.entries(managed)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeObjects(current?.[key] && typeof current[key] === 'object' && !Array.isArray(current[key]) ? current[key] : {}, value)
      : value;
  }
  return result;
}
const inside = (base, relative) => {
  const absoluteBase = path.resolve(base), target = path.resolve(base, relative);
  if (!target.startsWith(absoluteBase + path.sep) || relative.split(/[\\/]/).includes('..')) throw new Error('Unsafe setup path');
  for (let current = target; ; current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Linked setup path: ' + current);
    if (current === absoluteBase) break;
  }
  return target;
};

function findIde(home = os.homedir(), explicit = process.env.ANTIGRAVITY_INSTALL_DIR) {
  const candidates = explicit ? [explicit] : [
    '/Applications/Antigravity.app', '/Applications/Antigravity IDE.app',
    path.join(home, 'Applications', 'Antigravity.app'), path.join(home, 'Applications', 'Antigravity IDE.app'),
  ];
  for (const app of candidates) {
    if (!path.isAbsolute(app) || !app.endsWith('.app')) throw new Error('ANTIGRAVITY_INSTALL_DIR must be an absolute .app path');
    const appRoot = path.join(app, 'Contents', 'Resources', 'app');
    const product = path.join(appRoot, 'product.json');
    if (!fs.existsSync(product)) continue;
    const identity = readJson(product);
    if (!/^Antigravity(?: IDE)?$/i.test(identity.nameShort || '')) continue;
    const cli = ['antigravity', 'antigravity-ide'].map(name => path.join(appRoot, 'bin', name)).find(fs.existsSync);
    if (!cli) throw new Error('Antigravity IDE command line launcher is missing inside ' + app);
    return { app, appRoot, cli, identity };
  }
  throw new Error('Antigravity IDE was not found. Install it, or set ANTIGRAVITY_INSTALL_DIR to its .app path.');
}

function profilePaths(home, ide) {
  const name = /^Antigravity(?: IDE)?$/i.test(ide.identity.nameShort) ? ide.identity.nameShort : 'Antigravity';
  const folder = /^\.antigravity(?:-ide)?$/.test(ide.identity.dataFolderName || '') ? ide.identity.dataFolderName : '.antigravity';
  const gemini = path.join(home, '.gemini');
  return {
    settings: path.join(home, 'Library', 'Application Support', name, 'User', 'settings.json'),
    keybindings: path.join(home, 'Library', 'Application Support', name, 'User', 'keybindings.json'),
    argv: path.join(home, folder, 'argv.json'),
    extensions: path.join(home, folder, 'extensions'),
    gemini,
    backup: path.join(gemini, 'backups', 'macos-' + new Date().toISOString().replace(/[:.]/g, '-')),
  };
}

function parseJsonc(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  const source = fs.readFileSync(file, 'utf8');
  let result = '', quoted = false, escaped = false, line = false, block = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i], next = source[i + 1];
    if (line) { if (char === '\n') { line = false; result += char; } continue; }
    if (block) { if (char === '*' && next === '/') { block = false; i++; } continue; }
    if (quoted) { result += char; if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') { quoted = true; result += char; continue; }
    if (char === '/' && next === '/') { line = true; i++; continue; }
    if (char === '/' && next === '*') { block = true; i++; continue; }
    result += char;
  }
  return JSON.parse(result.replace(/,\s*([}\]])/g, '$1').replace(/^\uFEFF/, ''));
}

function macSettings(ide, current = {}) {
  const managed = readJson(path.join(root, 'config', 'settings.json'));
  for (const key of ['editor.inlineSuggest.enabled', 'chat.tools.terminal.autoApprove', 'security.workspace.trust.untrustedFiles']) delete managed[key];
  for (const key of Object.keys(managed)) if (key.startsWith('[') && managed[key] && typeof managed[key] === 'object') delete managed[key]['editor.inlineSuggest.enabled'];
  delete managed['terminal.integrated.defaultProfile.windows'];
  delete managed['terminal.integrated.profiles.windows'];
  managed['terminal.integrated.defaultProfile.osx'] = 'zsh';
  managed['terminal.integrated.profiles.osx'] = { zsh: { path: '/bin/zsh' } };
  const workbenches = ['electron-browser', 'electron-sandbox'].map(renderer =>
    path.join(ide.appRoot, 'out', 'vs', 'code', renderer, 'workbench', 'workbench.html'));
  managed['jellyCursor.workbenchHtmlPath'] = workbenches.find(fs.existsSync) || workbenches[0];
  // Existing user values win at every level; workstation supplies only missing defaults.
  const merged = mergeObjects(managed, current);
  for (const key of ['workbench.colorTheme', 'editor.fontFamily', 'editor.fontSize', 'editor.fontWeight']) {
    if (current[key] !== undefined) merged[key] = current[key];
  }
  for (const [command, value] of Object.entries(current['chat.tools.terminal.autoApprove'] || {})) {
    if (value === false) merged['chat.tools.terminal.autoApprove'][command] = false;
  }
  return merged;
}

function macKeybindings(current = []) {
  const managed = readJson(path.join(root, 'config', 'keybindings.json')).map(binding =>
    ({ ...binding, key: ['ctrl+shift+f', 'ctrl+alt+f'].includes(binding.key) ? binding.key.replace(/^ctrl\+/, 'cmd+') : binding.key }));
  const slots = new Set(current.map(item => item.key + ':' + (item.when || '')));
  return [...current, ...managed.filter(item => !slots.has(item.key + ':' + (item.when || '')))];
}

function verifyFonts(home) {
  const manifest = readJson(path.join(root, 'config', 'font.json'));
  if (manifest.family !== 'JetBrains Mono' || !Array.isArray(manifest.files) || manifest.files.length !== 16) throw new Error('Invalid font manifest');
  const fonts = path.join(home, 'Library', 'Fonts');
  for (const file of manifest.files) {
    if (!/^JetBrainsMono-[A-Za-z]+\.ttf$/.test(file.name) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid font entry');
    const bundled = inside(path.join(root, 'resources', 'jetbrains-mono', 'ttf'), file.name);
    if (!fs.existsSync(bundled) || sha256(bundled) !== file.sha256) throw new Error('Bundled font checksum mismatch: ' + file.name);
    const installed = inside(fonts, file.name);
    if (fs.existsSync(installed) && sha256(installed) !== file.sha256) throw new Error('Personal font differs; preserved: ' + installed);
  }
  return { fonts, manifest };
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', timeout: 600000 });
  if (result.error || result.status !== 0) throw new Error(command + ' failed: ' + (result.error?.message || 'exit ' + result.status));
}

function runCaptured(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error(command + ' failed: ' + (result.error?.message || result.stderr));
  return result.stdout;
}

function copyTree(source, target, save) {
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const from = inside(source, entry.name), to = inside(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to, save);
    else if (entry.isFile()) save(to, fs.readFileSync(from), true);
    else throw new Error('Unsupported source entry: ' + from);
  }
}

function install(options = {}) {
  if (process.platform !== 'darwin' && !options.testPlatform) throw new Error('macOS installer can only run on a Mac');
  if (!options.testPlatform) {
    if (!['arm64', 'x64'].includes(process.arch)) throw new Error('This macOS architecture was not verified: ' + process.arch);
    const darwinMajor = Number(os.release().split('.')[0]);
    if (!Number.isInteger(darwinMajor) || darwinMajor < 23) throw new Error('macOS 14 or newer is required for this installer');
  }
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or newer is required');
  const home = options.home || os.homedir();
  const ide = options.ide || findIde(home);
  const paths = profilePaths(home, ide);
  const running = spawnSync('pgrep', ['-f', '/Antigravity( IDE)?\\.app/Contents/MacOS/'], { encoding: 'utf8', timeout: 5000 });
  if (!options.testPlatform && (running.error || ![0, 1].includes(running.status))) throw new Error('Cannot verify that Antigravity is closed');
  if (!options.testPlatform && running.status === 0) throw new Error('Close all Antigravity windows before clean setup');
  const { fonts, manifest } = verifyFonts(home);
  const catalog = readJson(path.join(root, 'config', 'extensions.json'));
  const gallery = catalog.filter(item => item.source === 'gallery' && !item.optional).map(item => item.id);
  const custom = ['git-branch-panel', 'workstation-stability', 'calm-typescript', 'aster-appearance'].map(name => {
    const dir = path.join(root, 'extensions', name);
    const pkg = readJson(path.join(dir, 'package.json'));
    const artifact = path.join(dir, `${name}-${pkg.version}.vsix`);
    if (!fs.existsSync(artifact)) throw new Error('Missing bundled VSIX: ' + path.basename(artifact));
    return artifact;
  });
  for (const vsix of custom) {
    const dir = path.dirname(vsix), manifestPath = path.join(dir, 'manifest.json');
    const pkg = readJson(path.join(dir, 'package.json'));
    if (!path.basename(vsix).includes(pkg.version)) throw new Error('Bundled VSIX version mismatch: ' + path.basename(vsix));
    if (fs.existsSync(manifestPath)) {
      const manifest = readJson(manifestPath);
      if (manifest.version !== pkg.version || manifest.vsixSha256 !== sha256(vsix))
        throw new Error('Bundled VSIX checksum mismatch: ' + path.basename(vsix));
    }
  }
  const settings = macSettings(ide, parseJsonc(paths.settings, {}));
  const bindings = macKeybindings(parseJsonc(paths.keybindings, []));
  const argv = { ...parseJsonc(paths.argv, {}), ...readJson(path.join(root, 'config', 'argv.json')) };
  const changes = [];
  const ownershipFile = path.join(paths.gemini, 'config', 'workstation-setup', 'macos-owned.json');
  const previousOwnership = parseJsonc(ownershipFile, { files: {} }).files || {};
  const ownership = { ...previousOwnership }, preserved = [];
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const save = (target, bytes, managed = false) => {
    const relative = path.relative(home, target);
    if (managed && fs.existsSync(target) && previousOwnership[relative] !== digest(fs.readFileSync(target))) {
      preserved.push(relative);
      return;
    }
    if (fs.existsSync(target) && fs.readFileSync(target).equals(Buffer.from(bytes))) return;
    // Previously unowned files are never overwritten by a managed bundle update.
    inside(home, path.relative(home, target));
    const backupFile = inside(paths.backup, path.relative(home, target));
    if (fs.existsSync(target)) { fs.mkdirSync(path.dirname(backupFile), { recursive: true }); fs.copyFileSync(target, backupFile); }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    changes.push({ target, backupFile, existed: fs.existsSync(backupFile) });
    if (managed) ownership[relative] = digest(bytes);
  };
  const saveJson = (target, data) => save(target, Buffer.from(JSON.stringify(data, null, 2) + '\n'));
  const render = relative => fs.readFileSync(path.join(root, relative), 'utf8')
    .replaceAll('${USER_HOME}', JSON.stringify(home).slice(1, -1))
    .replaceAll('${NODE_EXE}', JSON.stringify(process.execPath).slice(1, -1))
    .replaceAll('${GIT_BASH}', '/bin/bash');
  // Never archive or replace the user's entire extensions directory.
  // The official IDE CLI will only install specific managed IDs.
  try {
    fs.mkdirSync(paths.backup, { recursive: true });
    saveJson(paths.settings, settings);
    saveJson(paths.keybindings, bindings);
    saveJson(paths.argv, argv);
    save(path.join(paths.gemini, 'GEMINI.md'), fs.readFileSync(path.join(root, 'rules', 'GEMINI.template.md')), true);
    for (const file of fs.readdirSync(path.join(root, 'rules')).filter(name => name.endsWith('.template.md') && name !== 'GEMINI.template.md')) {
      save(path.join(paths.gemini, 'config', 'rules', file.replace('.template.md', '.md')), fs.readFileSync(path.join(root, 'rules', file)), true);
    }
    for (const [source, target] of [
      ['skills', path.join(paths.gemini, 'config', 'skills')],
      ['agents', path.join(paths.gemini, 'config', 'agents')],
      ['resources/guides', path.join(paths.gemini, 'config', 'workstation-unified', 'guides')],
      ['resources/hooks', path.join(paths.gemini, 'antigravity', 'hooks')],
      ['resources/gsd-core', path.join(paths.gemini, 'antigravity', 'gsd-core')],
      ['resources/global-skills', path.join(paths.gemini, 'skills')],
      ['resources/antigravity-runtime', path.join(paths.gemini, 'antigravity')],
      ['resources/mcp-runtime', path.join(paths.gemini, 'config', 'mcp-runtime')],
      ['config/jelly-cursor', path.join(home, '.antigravity', 'jelly-cursor')],
    ]) copyTree(path.join(root, source), target, save);
    for (const [source, target] of [
      ['config/antigravity-settings.json', path.join(paths.gemini, 'antigravity', 'settings.json')],
      ['config/hooks.json', path.join(paths.gemini, 'antigravity', 'hooks.json')],
      ['config/gemini-config.json', path.join(paths.gemini, 'config', 'config.json')],
    ]) {
      const current = parseJsonc(target, {}), managed = JSON.parse(render(source));
      saveJson(target, source === 'config/hooks.json'
        ? nativeHooks.mergeNativeHooks(current, managed)
        : configMerge.mergeUserConfiguration(current, managed));
    }
    for (const [source, target] of [
      ['config/mcp/active.template.json', path.join(paths.gemini, 'config', 'mcp_config.json')],
      ['config/mcp/mcp_antigravity.template.json', path.join(paths.gemini, 'antigravity', 'mcp_config.json')],
    ]) {
      const current = parseJsonc(target, { mcpServers: {} });
      const managed = JSON.parse(render(source));
      saveJson(target, mergeObjects(managed, current));
    }
    fs.mkdirSync(fonts, { recursive: true });
    for (const file of manifest.files) {
      const target = inside(fonts, file.name);
      if (!fs.existsSync(target)) save(target, fs.readFileSync(path.join(root, 'resources', 'jetbrains-mono', 'ttf', file.name)));
    }
    saveJson(ownershipFile, { version: 1, files: ownership });
    if (preserved.length) console.warn('Preserved '+preserved.length+' modified or unowned files; no overwrite. Examples: '+preserved.slice(0, 5).join(', '));
    run('npm', ['ci', '--prefix', path.join(paths.gemini, 'config', 'mcp-runtime'), '--no-audit', '--no-fund']);
    for (const id of gallery) run(ide.cli, ['--install-extension', id, '--force']);
    for (const vsix of custom) run(ide.cli, ['--install-extension', vsix, '--force']);
    const installed = runCaptured(ide.cli, ['--list-extensions']).toLowerCase();
    const installedIds = installed.split(/\r?\n/);
    for (const id of gallery) if (!installedIds.includes(id.toLowerCase())) throw new Error('Extension was not registered: ' + id);
    for (const name of ['git-branch-panel', 'workstation-stability', 'calm-typescript', 'aster-appearance']) {
      const manifest = readJson(path.join(root, 'extensions', name, 'package.json'));
      const id = (manifest.publisher + '.' + manifest.name).toLowerCase();
      if (!installedIds.includes(id)) throw new Error('Bundled extension was not registered: ' + id);
    }
    console.log('Mac setup completed. Backup: ' + paths.backup);
    console.log('Reopen Antigravity IDE. Native AI Tab and agent approval preferences were preserved.');
    return { backup: paths.backup, settings: paths.settings, extensions: gallery.length + custom.length };
  } catch (error) {
    for (const change of changes.reverse()) {
      if (change.existed) fs.copyFileSync(change.backupFile, change.target);
      else if (fs.existsSync(change.target)) fs.unlinkSync(change.target);
    }
    throw new Error(error.message + '; file changes were rolled back. External CLI/npm installs may require separate recovery. Backup: ' + paths.backup);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] !== 'install') throw new Error('Usage: node macos/setup.mjs install');
    install();
  } catch (error) { console.error('Mac setup failed: ' + error.message); process.exitCode = 1; }
}

export { findIde, profilePaths, macSettings, macKeybindings, verifyFonts, install };
