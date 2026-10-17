'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { guard } = require('./owned-files');
const { restoreBackup, validateBackup } = require('./backup');
const automation = require('./agent-automation');
const { TOPIC_KEY, isIdeRunning, restoreMcpGrants } = require('./mcp-permissions');

const SNAPSHOT_FILES = Object.freeze({
  [TOPIC_KEY]: 'agent-preferences.base64',
  [automation.TAB_TOPIC_KEY]: 'tab-preferences.base64',
});

function privateWrite(file, bytes) {
  guard(path.dirname(file), path.basename(file));
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, bytes, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

function privateDirectory(directory, env, prefix) {
  if (!directory) throw new Error('Specify a private setup backup directory');
  guard(path.dirname(directory), path.basename(directory));
  const actual = fs.realpathSync(directory), root = fs.realpathSync(env.backupsDir);
  if (path.dirname(actual) !== root || !path.basename(actual).startsWith(prefix) || !fs.statSync(actual).isDirectory()) {
    throw new Error('Invalid private backup directory');
  }
  return actual;
}

function backupInfo(directory, env) {
  const quiet = path.basename(path.resolve(directory || '')).startsWith('quiet-completion-');
  const backup = privateDirectory(directory, env, quiet ? 'quiet-completion-' : 'setup-backup-');
  const manifestFile = guard(backup, quiet ? 'manifest.json' : 'backup-manifest.json');
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid setup backup manifest');
  if (!quiet) return { backup, manifestFile, manifest, quiet: false, files: validateBackup(backup, env) };

  const targets = new Set([path.resolve(env.settingsJson), path.resolve(env.geminiConfigDir, 'mansur-setup/editor-profile.json')]);
  if (manifest.format !== 1 || !Array.isArray(manifest.files) || manifest.files.length > 2
    || new Set(manifest.files.map(file => file?.target)).size !== manifest.files.length
    || new Set(manifest.files.map(file => file?.file)).size !== manifest.files.length) throw new Error('Invalid quiet-completion backup manifest');
  const files = manifest.files.map(file => {
    if (!file || typeof file.target !== 'string' || !path.isAbsolute(file.target) || !targets.has(file.target)
      || typeof file.hadFile !== 'boolean' || !/^[01]\.json$/.test(file.file)) throw new Error('Invalid quiet-completion backup target');
    const target = guard(path.dirname(file.target), path.basename(file.target));
    const source = guard(backup, file.file);
    if (fs.existsSync(target) && !fs.statSync(target).isFile()) throw new Error('Expected a configuration file: ' + target);
    if (file.hadFile !== fs.existsSync(source) || (file.hadFile && !fs.statSync(source).isFile())) throw new Error('Invalid quiet-completion backup contents');
    return { ...file, source, target };
  });
  return { backup, manifestFile, manifest, quiet: true, files };
}

function nativeBackupInfo(info, env) {
  const name = info.manifest.nativeAutomationBackup;
  if (name === undefined) return null;
  if (typeof name !== 'string' || !/^agent-automation-[a-zA-Z0-9-]+$/.test(name)) throw new Error('Invalid linked native backup');
  const directory = privateDirectory(guard(env.backupsDir, name), env, 'agent-automation-');
  const manifestFile = guard(directory, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (!manifest || manifest.format !== 2 || manifest.mainSha256 !== automation.NATIVE_MAIN_SHA256
    || typeof manifest.includeMcp !== 'boolean' || !['all', 'completion'].includes(manifest.scope)
    || (manifest.includeAgentPolicies !== undefined && typeof manifest.includeAgentPolicies !== 'boolean')
    || (manifest.scope === 'completion' && manifest.includeAgentPolicies === true)
    || (manifest.scope === 'completion' && manifest.includeMcp)) throw new Error('Invalid linked native backup manifest');
  const expected = manifest.scope === 'all' ? [TOPIC_KEY, automation.TAB_TOPIC_KEY] : [automation.TAB_TOPIC_KEY];
  if (!Array.isArray(manifest.topics) || manifest.topics.length !== expected.length
    || new Set(manifest.topics.map(topic => topic?.topicKey)).size !== expected.length) throw new Error('Invalid linked native topics');
  for (const topic of manifest.topics) {
    if (!topic || !expected.includes(topic.topicKey) || typeof topic.hadTopic !== 'boolean'
      || topic.file !== SNAPSHOT_FILES[topic.topicKey]) throw new Error('Invalid linked native topic');
    const file = guard(directory, topic.file);
    const value = fs.readFileSync(file, 'utf8');
    if (!topic.hadTopic && value !== '') throw new Error('Invalid absent native topic snapshot');
    if (topic.topicKey === TOPIC_KEY) {
      if (manifest.includeAgentPolicies === false) restoreMcpGrants('', value);
      else automation.restorePolicies('', value, manifest.includeMcp);
    }
    else automation.readTabPolicies(value);
  }
  return { directory, manifest };
}

// Capture only the settings this operation owns, never account rows or a whole
// state.vscdb. A read transaction gives both topics the same SQLite snapshot,
// including a live IDE's committed WAL contents, without acquiring a write lock.
function captureNativeBackup(env, backupDir, options = {}) {
  const scope = options.scope || 'all';
  if (!['all', 'completion'].includes(scope)) throw new Error('Invalid native snapshot scope');
  const reason = automation.validateNative(env);
  if (reason) return { captured: false, reason };
  const info = backupInfo(backupDir, env);
  const includeAgentPolicies = scope === 'all' && options.includeAgentPolicies !== false;
  if (info.manifest.nativeAutomationBackup !== undefined) {
    const existing = nativeBackupInfo(info, env);
    if (existing.manifest.scope !== scope || existing.manifest.includeMcp !== (scope === 'all' && options.includeMcp !== false)
      || (existing.manifest.scope === 'all' && existing.manifest.includeAgentPolicies !== false) !== includeAgentPolicies) throw new Error('Native backup scope does not match this setup operation');
    return { captured: true, backup: existing.directory, linked: true, changed: false };
  }
  const dbFile = guard(env.userSettingsDir, 'globalStorage/state.vscdb');
  if (!fs.existsSync(dbFile)) return { captured: false, reason: 'Antigravity native profile is not initialized; no native snapshot was captured' };
  const keys = scope === 'completion' ? [automation.TAB_TOPIC_KEY] : [TOPIC_KEY, automation.TAB_TOPIC_KEY];
  const includeMcp = scope === 'all' && options.includeMcp !== false;
  const db = new DatabaseSync(dbFile, { readOnly: true });
  let topics;
  try {
    db.exec('BEGIN');
    topics = keys.map(topicKey => {
      const row = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(topicKey);
      const value = topicKey === TOPIC_KEY
        ? (includeAgentPolicies ? automation.restorePolicies('', row?.value || '', includeMcp)
          : includeMcp ? restoreMcpGrants('', row?.value || '') : '')
        : automation.restoreTabPolicies('', row?.value || '');
      return { topicKey, hadTopic: !!row, file: SNAPSHOT_FILES[topicKey], value };
    });
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally { db.close(); }
  if (options.dryRun) return { captured: false, dryRun: true, wouldCapture: true, scope };
  const directory = guard(env.backupsDir, 'agent-automation-' + crypto.randomUUID());
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const topic of topics) privateWrite(path.join(directory, topic.file), topic.value);
  privateWrite(path.join(directory, 'manifest.json'), JSON.stringify({ format: 2, scope, includeMcp, includeAgentPolicies,
    mainSha256: automation.NATIVE_MAIN_SHA256, topics: topics.map(({ value, ...topic }) => topic) }));
  privateWrite(info.manifestFile, JSON.stringify({ ...info.manifest, nativeAutomationBackup: path.basename(directory) }, null, 2));
  return { captured: true, backup: directory, linked: true, changed: true };
}

function cancelPendingWorkers(env) {
  if (automation.cancelPendingWorkers) return automation.cancelPendingWorkers(env);
  // Compatibility with the two previously published worker directories. Their
  // request readers check this flag again inside the SQLite transaction.
  const jobs = ['automation', 'automation-v2'].map(name => guard(env.geminiConfigDir, 'mansur-setup/' + name + '/request.json'))
    .filter(file => fs.existsSync(file)).map(file => ({ file, job: JSON.parse(fs.readFileSync(file, 'utf8')) }));
  for (const { job } of jobs) if (!job || typeof job !== 'object' || Array.isArray(job)) throw new Error('Invalid pending automation request');
  for (const { file, job } of jobs) if (!job.cancelled) privateWrite(file, JSON.stringify({ ...job, cancelled: true }));
}

function restoreFiles(info, env, options) {
  if (!info.quiet) return restoreBackup(info.backup, env, options);
  const restored = [], removed = [];
  for (const file of info.files) {
    if (file.hadFile) {
      if (!options.dryRun) privateWrite(file.target, fs.readFileSync(file.source));
      restored.push(file.target);
    } else if (fs.existsSync(file.target)) {
      if (!options.dryRun) fs.unlinkSync(file.target);
      removed.push(file.target);
    }
  }
  return { restored, removed, preserved: [], dryRun: !!options.dryRun };
}

function restoreSetup(backupDir, env, options = {}) {
  // Validate every file target and native snapshot before cancelling or changing
  // anything. File operations and SQLite cannot share an atomic transaction, so
  // a later I/O failure is reported explicitly with the completed phase.
  const info = backupInfo(backupDir, env);
  const linked = nativeBackupInfo(info, env);
  if (info.quiet && info.files.length === 0 && !linked) throw new Error('Empty quiet-completion backup has no linked native preferences snapshot');
  const native = linked ? { available: true, backup: linked.directory }
    : { available: false, applied: false, reason: 'This legacy/file-only backup has no native preferences snapshot; Tab and chat permissions cannot be restored from it' };
  const running = options.isRunning || (env.isWindows === false ? () => false : isIdeRunning);
  if (!options.dryRun) cancelPendingWorkers(env);
  const base = { dryRun: !!options.dryRun, pendingCancelled: !options.dryRun, native };
  if (running()) return { ...base, success: false, complete: false, deferred: true,
    reason: 'Close every Antigravity window normally, then rerun restore; no configuration files or native preferences were restored' };
  if (linked) {
    const preview = automation.restoreAutomation(env, linked.directory, { dryRun: true, isRunning: running });
    if (!preview.applied && !preview.wouldChange) return { ...base, success: false, complete: false,
      deferred: !!preview.deferred, native: { ...native, ...preview }, reason: preview.reason };
    if (!options.dryRun) {
      let result;
      try { result = automation.restoreAutomation(env, linked.directory, { isRunning: running }); }
      catch (error) { return { ...base, success: false, complete: false, partial: false, phase: 'native', reason: error.message }; }
      if (!result.applied) return { ...base, success: false, complete: false, native: { ...native, ...result }, deferred: !!result.deferred, reason: result.reason };
      Object.assign(native, result);
    } else Object.assign(native, preview);
  }
  try {
    if (running()) throw new Error('Antigravity restarted before restoring configuration files; close it and rerun restore');
    const files = restoreFiles(info, env, options);
    return { ...base, success: true, complete: !!linked, files, ...files };
  } catch (error) {
    return { ...base, success: false, complete: false, partial: true, phase: 'files',
      files: { complete: false }, reason: 'File restore did not finish; earlier file writes may have completed. ' + error.message };
  }
}

module.exports = { captureNativeBackup, restoreSetup };
