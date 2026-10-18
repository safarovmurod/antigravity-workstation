'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { guard } = require('./owned-files');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function inventory(directory) {
  guard(path.dirname(directory), path.basename(directory));
  const files = {}, directories = [];
  if (!fs.existsSync(directory)) return { files, directories };
  if (!fs.lstatSync(directory).isDirectory()) throw new Error('Expected an extension directory');
  function visit(relative) {
    const current = relative ? guard(directory, relative) : directory;
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      const file = guard(directory, name);
      if (entry.isDirectory()) { directories.push(name); visit(name); }
      else if (entry.isFile()) files[name] = digest(fs.readFileSync(file));
      else throw new Error('Linked or special extension files cannot be reset safely: ' + file);
    }
  }
  visit('');
  return { files, directories };
}

function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function privateJson(file, value) {
  const temporary = guard(path.dirname(file), path.basename(file) + '.' + crypto.randomUUID() + '.tmp');
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function closed(options = {}) {
  const running = options.isRunning || (options.isolated || process.platform !== 'win32' ? () => false : require('./mcp-permissions').isIdeRunning);
  if (running()) throw new Error('Clean extensions requires every Antigravity window to be closed normally. Run this mode from a separate PowerShell window; no extension files changed.');
}

function inspectBackup(env, directory) {
  const root = guard(env.backupsDir, path.basename(directory || ''));
  if (path.resolve(directory || '') !== root || !/^extension-reset-[a-f0-9-]{36}$/.test(path.basename(root))) throw new Error('Invalid extension reset backup directory');
  const manifestFile = guard(root, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (!manifest || manifest.format !== 1 || manifest.target !== path.resolve(env.extensionsDir)
    || typeof manifest.hadDirectory !== 'boolean' || !['prepared', 'resetting', 'cleared', 'committed', 'restored'].includes(manifest.state)
    || !manifest.inventory || typeof manifest.inventory.files !== 'object' || !Array.isArray(manifest.inventory.directories)) throw new Error('Invalid extension reset backup manifest');
  const source = guard(root, 'packages');
  if (!same(inventory(source), manifest.inventory)) throw new Error('Extension backup checksum/inventory mismatch; no extension files changed');
  return { root, source, manifest, manifestFile };
}

function restoreExtensionReset(env, directory, options = {}) {
  closed(options);
  const info = inspectBackup(env, directory);
  const target = guard(path.dirname(env.extensionsDir), path.basename(env.extensionsDir));
  // Validate the current tree too: a junction introduced after installation must
  // not turn recovery into a write outside the selected IDE profile.
  inventory(target);
  if (options.dryRun) return { restored: false, dryRun: true, backup: info.root };
  const displaced = guard(info.root, 'failed-install-' + crypto.randomUUID());
  if (fs.existsSync(target)) fs.renameSync(target, displaced);
  try {
    if (info.manifest.hadDirectory) fs.cpSync(info.source, target, { recursive: true, errorOnExist: true, force: false });
    if (!same(inventory(target), info.manifest.inventory)) throw new Error('Restored extensions failed checksum verification');
  } catch (error) {
    // Keep both complete copies for an explicit recovery; never delete a tree
    // after a partial filesystem failure.
    throw new Error('Extension recovery did not finish. Backup: ' + info.root + '; displaced installation: ' + displaced + '. ' + error.message);
  }
  privateJson(info.manifestFile, { ...info.manifest, state: 'restored', restoredAt: new Date().toISOString() });
  return { restored: true, backup: info.root, previousInstallation: fs.existsSync(displaced) ? displaced : null };
}

function beginExtensionReset(env, options = {}) {
  closed(options);
  const target = guard(path.dirname(env.extensionsDir), path.basename(env.extensionsDir));
  const before = inventory(target);
  if (options.dryRun) return { dryRun: true, wouldRemoveFiles: Object.keys(before.files).length };
  const root = guard(env.backupsDir, 'extension-reset-' + crypto.randomUUID());
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const source = guard(root, 'packages');
  const hadDirectory = fs.existsSync(target);
  if (hadDirectory) fs.cpSync(target, source, { recursive: true, errorOnExist: true, force: false });
  else fs.mkdirSync(source);
  if (!same(inventory(source), before) || !same(inventory(target), before)) throw new Error('Extensions changed while creating the clean-install backup; no extension files removed. Backup: ' + root);
  const manifestFile = guard(root, 'manifest.json');
  let manifest = { format: 1, state: 'prepared', target: path.resolve(target), hadDirectory, createdAt: new Date().toISOString(), inventory: before };
  privateJson(manifestFile, manifest);
  const transaction = {
    backup: root,
    restore: () => restoreExtensionReset(env, root, options),
    commit() { manifest = { ...manifest, state: 'committed', committedAt: new Date().toISOString() }; privateJson(manifestFile, manifest); return { backup: root, committed: true }; },
  };
  try {
    closed(options);
    manifest.state = 'resetting'; privateJson(manifestFile, manifest);
    // extensions.json and every old package leave the active extension root in
    // one filesystem rename, including unregistered duplicates and .obsolete.
    if (hadDirectory) fs.renameSync(target, guard(root, 'removed-tree'));
    fs.mkdirSync(target, { recursive: true });
    manifest.state = 'cleared'; privateJson(manifestFile, manifest);
    options.log?.('  All previous user extensions archived: ' + root);
    return transaction;
  } catch (error) {
    try { transaction.restore(); }
    catch (restoreError) { throw new Error(error.message + '; ' + restoreError.message); }
    throw error;
  }
}

module.exports = { beginExtensionReset, restoreExtensionReset, inventory };
