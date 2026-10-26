'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { fields, stringField, TOPIC_KEY, mergeMcpGrant, isIdeRunning } = require('./mcp-permissions');
const approvals = require('./approval-policies');

const { NATIVE_MAIN_SHA256 } = require('./native-compatibility');
const POLICIES = Object.freeze({ terminalAutoExecutionPolicySentinelKey: 3, artifactReviewPolicySentinelKey: 2 });
const TAB_TOPIC_KEY = 'antigravityUnifiedStateSync.tabPreferences';
const TAB_POLICIES = Object.freeze({ tabEnabled: 1, tabToJump: 2 });
const WORKER_PROTOCOL = 2;
const WORKER_DIRECTORY = 'automation-v2';
const SNAPSHOT_FILES = Object.freeze({ [TOPIC_KEY]: 'agent-preferences.base64', [TAB_TOPIC_KEY]: 'tab-preferences.base64', ...approvals.SNAPSHOT_FILES });

function decode(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid native preferences; no write');
  return Buffer.from(value, 'base64');
}
function entryData(entry) {
  if (entry.id !== 1 || entry.wire !== 2) return null;
  const pair = fields(entry.value), keys = pair.filter(f => f.id === 1 && f.wire === 2);
  if (keys.length !== 1) throw new Error('Invalid preference map key');
  return { pair, key: keys[0].value.toString('utf8') };
}
function replaceValue(entry, encoded) {
  const { pair } = entryData(entry);
  const rows = pair.filter(f => f.id === 2 && f.wire === 2);
  if (rows.length !== 1) throw new Error('Invalid native preference row');
  const row = fields(rows[0].value), values = row.filter(f => f.id === 1 && f.wire === 2);
  if (values.length !== 1) throw new Error('Invalid native preference value');
  const primitive = fields(decode(values[0].value.toString('utf8')));
  const nextValue = Buffer.concat(primitive.map(f => f.id === 2 && f.wire === 0 ? decode(encoded) : f.raw)).toString('base64');
  const next = Buffer.concat(row.map(f => f === values[0] ? stringField(1, nextValue) : f.raw));
  return stringField(1, Buffer.concat(pair.map(f => f === rows[0] ? stringField(2, next) : f.raw)));
}
function mapEntry(key, encoded) {
  return stringField(1, Buffer.concat([stringField(1, key), stringField(2, stringField(1, encoded))]));
}
function readNativePolicies(value, policies, booleanKeys = []) {
  const result = {};
  for (const entry of fields(decode(value))) {
    const data = entryData(entry);
    if (!data || ![...Object.keys(policies), ...booleanKeys].includes(data.key)) continue;
    if (Object.hasOwn(result, data.key)) throw new Error('Duplicate native preference');
    const rows = data.pair.filter(f => f.id === 2 && f.wire === 2);
    if (rows.length !== 1) throw new Error('Invalid native preference row');
    const values = fields(rows[0].value).filter(f => f.id === 1 && f.wire === 2);
    if (values.length !== 1) throw new Error('Invalid native preference value');
    const primitive = fields(decode(values[0].value.toString('utf8')));
    const kind = Object.hasOwn(policies, data.key) ? 2 : 1;
    if (primitive.filter(f => f.wire === 0 && f.id === kind).length !== 1 || primitive.some(f => f.id <= 5 && (f.id !== kind || f.wire !== 0))) throw new Error('Unexpected native preference type');
    result[data.key] = primitive.find(f => f.id === kind).value;
  }
  return result;
}
function readPolicies(value) {
  return readNativePolicies(value, POLICIES, ['secureModeSentinelKey', 'enableTerminalSandboxSentinelKey']);
}
function readTabPolicies(value) {
  return readNativePolicies(value, TAB_POLICIES);
}
function mergeNativePolicies(value, policies, reader) {
  reader(value);
  const seen = new Set();
  const entries = fields(decode(value)).map(entry => {
    const data = entryData(entry);
    if (!data || !Object.hasOwn(policies, data.key)) return entry.raw;
    seen.add(data.key);
    return replaceValue(entry, Buffer.from([16, policies[data.key]]).toString('base64'));
  });
  for (const [key, mode] of Object.entries(policies)) if (!seen.has(key)) entries.push(mapEntry(key, Buffer.from([16, mode]).toString('base64')));
  return Buffer.concat(entries).toString('base64');
}
function mergePolicies(value, includeMcp = true, includeApprovals = true) {
  let next = mergeNativePolicies(value, POLICIES, readPolicies);
  if (includeApprovals) next = approvals.merge(next, TOPIC_KEY);
  if (includeApprovals) return require('./mcp-permissions').mergeApprovalGrants(next, includeMcp);
  return includeMcp ? mergeMcpGrant(next, { allow: ['mcp(*)'], replaceMcpAskAndDeny: true }) : next;
}
function mergeTabPolicies(value) {
  return mergeNativePolicies(value, TAB_POLICIES, readTabPolicies);
}
function restoreNativePolicies(current, saved, policies, reader) {
  reader(current); reader(saved);
  const keys = new Set(Object.keys(policies));
  const originals = new Map();
  for (const entry of fields(decode(saved))) {
    const data = entryData(entry);
    if (data && keys.has(data.key)) originals.set(data.key, entry.raw);
  }
  const next = [];
  const seen = new Set();
  for (const entry of fields(decode(current))) {
    const data = entryData(entry);
    if (!data || !keys.has(data.key)) { next.push(entry.raw); continue; }
    seen.add(data.key);
    if (originals.has(data.key)) next.push(originals.get(data.key));
  }
  for (const [key, raw] of originals) if (!seen.has(key)) next.push(raw);
  return Buffer.concat(next).toString('base64');
}
function restorePolicies(current, saved, includeMcp, includeApprovals = true) {
  let result = restoreNativePolicies(current, saved, POLICIES, readPolicies);
  if (includeApprovals) result = approvals.restore(result, saved, TOPIC_KEY);
  if (includeApprovals) return require('./mcp-permissions').restoreApprovalGrants(result, saved, includeMcp);
  return includeMcp ? require('./mcp-permissions').restoreMcpGrants(result, saved) : result;
}
function restoreTabPolicies(current, saved) {
  return restoreNativePolicies(current, saved, TAB_POLICIES, readTabPolicies);
}
function assertNoLinks(file) {
  for (let cursor = path.resolve(file); ; cursor = path.dirname(cursor)) {
    try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Linked automation path refused: ' + cursor); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path.dirname(cursor) === cursor) break;
  }
}
function validateNative(env) {
  return require('./native-compatibility').validateNative(env);
}
function savePrivate(file, value) {
  assertNoLinks(file);
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (fs.existsSync(file) && fs.readFileSync(file).equals(bytes)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(temporary, bytes, { mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
  return true;
}
function cancelRequest(file) {
  assertNoLinks(file);
  if (!fs.existsSync(file)) return;
  const job = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!job.cancelled) savePrivate(file, JSON.stringify({ ...job, cancelled: true }));
}
function cancelPendingWorkers(env) {
  for (const directory of ['workstation-setup', 'mansur-setup']) {
    for (const name of ['automation', WORKER_DIRECTORY]) cancelRequest(path.join(env.geminiConfigDir, directory, name, 'request.json'));
  }
}
function scopeFor(options) {
  const scope = options.scope ?? 'all';
  if (!['all', 'completion'].includes(scope)) throw new Error('Invalid automation scope; use all or completion');
  return scope;
}
function topicSpecs(options) {
  if (options.restore) {
    const topics = options.restore.topics || [{ topicKey: TOPIC_KEY, hadTopic: options.restore.hadTopic, value: options.restore.value }];
    return topics.map(topic => ({ ...topic, includeApprovalPolicies: options.restore.includeApprovalPolicies === true,
      includeMcp: topic.topicKey === TOPIC_KEY && options.restore.includeMcp === true,
      includeAgentPolicies: topic.topicKey === TOPIC_KEY && options.restore.includeAgentPolicies !== false }));
  }
  const tab = { topicKey: TAB_TOPIC_KEY };
  return scopeFor(options) === 'completion' ? [tab] : [
    { topicKey: TOPIC_KEY, includeMcp: options.includeMcp !== false, includeApprovalPolicies: true }, tab,
    ...approvals.EXTRA_TOPIC_KEYS.map(topicKey => ({ topicKey, includeApprovalPolicies: true })),
  ];
}
function policyResult(snapshots, scope) {
  const result = { scope };
  for (const snapshot of snapshots) {
    if (snapshot.topicKey === TOPIC_KEY) {
      if (snapshot.includeAgentPolicies !== false) result.storedPolicies = readPolicies(snapshot.after);
      else if (snapshot.includeMcp) result.storedMcpPolicy = require('./mcp-permissions').readMcpPolicy(snapshot.after);
      if (snapshot.includeApprovalPolicies) result.storedApprovalPolicies = { ...result.storedApprovalPolicies, [TOPIC_KEY]: approvals.read(snapshot.after, TOPIC_KEY) };
    } else if (snapshot.topicKey === TAB_TOPIC_KEY) result.storedTabPolicies = readTabPolicies(snapshot.after);
    else result.storedApprovalPolicies = { ...result.storedApprovalPolicies, [snapshot.topicKey]: approvals.read(snapshot.after, snapshot.topicKey) };
  }
  return result;
}
function cancelledError() {
  const error = new Error('Pending automation was cancelled or superseded');
  error.code = 'WORKSTATION_AUTOMATION_CANCELLED';
  return error;
}
function projectSnapshots(db, options) {
  return topicSpecs(options).map(spec => {
    const row = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(spec.topicKey);
    const before = row?.value || '';
    let after;
    if (spec.topicKey === TOPIC_KEY) after = options.restore
      ? spec.includeAgentPolicies ? restorePolicies(before, spec.value, spec.includeMcp, spec.includeApprovalPolicies)
        : spec.includeMcp ? require('./mcp-permissions').restoreMcpGrants(before, spec.value) : before
      : mergePolicies(before, spec.includeMcp);
    else if (spec.topicKey === TAB_TOPIC_KEY) after = options.restore ? restoreTabPolicies(before, spec.value) : mergeTabPolicies(before);
    else if (approvals.EXTRA_TOPIC_KEYS.includes(spec.topicKey)) after = options.restore
      ? approvals.restore(before, spec.value, spec.topicKey) : approvals.merge(before, spec.topicKey);
    else throw new Error('Invalid native automation topic');
    return { ...spec, row, before, after };
  });
}
function snapshotsMatch(snapshots, options) {
  return snapshots.every(snapshot => {
    const shouldExist = !(options.restore && !snapshot.hadTopic && !snapshot.after);
    return !!snapshot.row === shouldExist && snapshot.after === snapshot.before;
  });
}
function inspectStoredAutomation(env, options = {}) {
  const scope = scopeFor(options);
  const base = { verified: false, applied: false, wouldChange: true, scope, policyResult: null, runtimeVerified: false };
  try {
    for (const relative of ['resources/app/product.json', 'resources/app/out/main.js']) assertNoLinks(path.join(env.ideRoot || '', relative));
    const reason = validateNative(env);
    if (reason) return { ...base, reason };
    const running = options.isRunning || isIdeRunning;
    if (running()) return { ...base, deferred: true, reason: 'Waiting for all Antigravity windows to close normally' };
    const dbFile = path.join(env.userSettingsDir, 'globalStorage', 'state.vscdb');
    assertNoLinks(dbFile);
    if (!fs.existsSync(dbFile)) return { ...base, reason: 'Native profile has not been initialized' };
    const hasWal = () => ['-wal', '-shm'].some(suffix => { assertNoLinks(dbFile + suffix); return fs.existsSync(dbFile + suffix); });
    if (hasWal()) return { ...base, deferred: true, reason: 'Native profile still has a WAL/SHM file' };
    const db = new DatabaseSync(dbFile, { readOnly: true });
    let transaction = false;
    try {
      db.exec('BEGIN'); transaction = true;
      const snapshots = projectSnapshots(db, options);
      const result = policyResult(snapshots, scope);
      const applied = snapshotsMatch(snapshots, options);
      if (running() || hasWal()) return { ...base, deferred: true, reason: 'Native profile reopened during inspection' };
      db.exec('COMMIT'); transaction = false;
      return { ...base, verified: true, applied, wouldChange: !applied, policyResult: result };
    } finally { if (transaction) db.exec('ROLLBACK'); db.close(); }
  } catch (error) { return { ...base, reason: error.message }; }
}
function inspectAutomation(env, options = {}) {
  const pending = findReusableAutomationRequest(env, { ...options, onlyPending: true });
  return { ...inspectStoredAutomation(env, options), pendingEquivalent: !!pending, pending };
}
function update(env, options = {}) {
  const scope = options.restore?.scope || (options.restore ? 'agent' : scopeFor(options));
  const reason = validateNative(env);
  if (reason) return { applied: false, scope, reason };
  if (!options.dryRun && !options.isCancelled) cancelPendingWorkers(env);
  const running = options.isRunning || isIdeRunning;
  if (running()) return { applied: false, scope, deferred: true, reason: 'Waiting for all Antigravity windows to close normally' };
  const dbFile = path.join(env.userSettingsDir, 'globalStorage', 'state.vscdb');
  assertNoLinks(dbFile);
  if (!fs.existsSync(dbFile)) return { applied: false, scope, reason: 'Open Antigravity once to initialize its profile, close it, then retry automation' };
  for (const suffix of ['-wal', '-shm']) if (fs.existsSync(dbFile + suffix)) return { applied: false, scope, deferred: true, reason: 'Native profile still has a WAL/SHM file; waiting for a clean IDE shutdown' };
  const db = new DatabaseSync(dbFile, { readOnly: !!options.dryRun });
  try {
    const snapshots = projectSnapshots(db, options);
    const policies = policyResult(snapshots, scope);
    if (snapshotsMatch(snapshots, options)) return { applied: true, changed: false, ...policies, runtimeVerified: false };
    if (options.dryRun) return { applied: false, dryRun: true, wouldChange: true, ...policies };
    const backup = path.join(env.backupsDir, 'agent-automation-' + crypto.randomUUID());
    assertNoLinks(backup);
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    db.prepare('VACUUM INTO ?').run(path.join(backup, 'state.vscdb'));
    fs.chmodSync(path.join(backup, 'state.vscdb'), 0o600);
    const topics = snapshots.map(snapshot => {
      const file = SNAPSHOT_FILES[snapshot.topicKey];
      savePrivate(path.join(backup, file), snapshot.before);
      return { topicKey: snapshot.topicKey, hadTopic: !!snapshot.row, file };
    });
    savePrivate(path.join(backup, 'manifest.json'), JSON.stringify({ format: snapshots.some(snapshot => snapshot.includeApprovalPolicies) && scope === 'all' ? 3 : 2, scope, topics,
      includeApprovalPolicies: snapshots.some(snapshot => snapshot.includeApprovalPolicies),
      includeMcp: snapshots.some(snapshot => snapshot.includeMcp), includeAgentPolicies: snapshots.some(snapshot => snapshot.topicKey === TOPIC_KEY && snapshot.includeAgentPolicies !== false), mainSha256: NATIVE_MAIN_SHA256 }));
    db.exec('BEGIN IMMEDIATE');
    try {
      if (options.isCancelled?.()) throw cancelledError();
      if (running()) throw new Error('Antigravity restarted; automation cancelled');
      for (const snapshot of snapshots) {
        const current = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(snapshot.topicKey);
        if (!!current !== !!snapshot.row || current?.value !== snapshot.row?.value) throw new Error('Native preferences changed concurrently; retry after closing IDE');
      }
      for (const snapshot of snapshots) {
        if (options.restore && !snapshot.hadTopic && !snapshot.after) db.prepare('DELETE FROM ItemTable WHERE key=?').run(snapshot.topicKey);
        else db.prepare('INSERT INTO ItemTable(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(snapshot.topicKey, snapshot.after);
      }
      for (const snapshot of snapshots) {
        const actual = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(snapshot.topicKey);
        const deleted = options.restore && !snapshot.hadTopic && !snapshot.after;
        if ((actual?.value || '') !== snapshot.after || !!actual === !!deleted) throw new Error('Native automation readback failed');
      }
      if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Native automation integrity check failed');
      if (options.isCancelled?.()) throw cancelledError();
      if (running()) throw new Error('Antigravity restarted; automation cancelled');
      db.exec('COMMIT');
      return { applied: true, changed: true, backup, ...policies, runtimeVerified: false };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  } finally { db.close(); }
}
function restoreAutomation(env, directory, options = {}) {
  if (!directory) throw new Error('Specify the private agent-automation backup directory');
  assertNoLinks(directory);
  const backup = fs.realpathSync(directory), root = fs.realpathSync(env.backupsDir);
  if (path.dirname(backup).toLowerCase() !== root.toLowerCase() || !path.basename(backup).startsWith('agent-automation-')) throw new Error('Invalid automation backup directory');
  const manifestFile = path.join(backup, 'manifest.json');
  assertNoLinks(manifestFile);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.mainSha256 !== NATIVE_MAIN_SHA256 || typeof manifest.includeMcp !== 'boolean'
    || (manifest.includeAgentPolicies !== undefined && typeof manifest.includeAgentPolicies !== 'boolean')) throw new Error('Invalid automation backup manifest');
  let scope, topics;
  if (manifest.format === 1) {
    if (manifest.topicKey !== TOPIC_KEY || typeof manifest.hadTopic !== 'boolean') throw new Error('Invalid automation backup manifest');
    scope = 'agent';
    topics = [{ topicKey: TOPIC_KEY, hadTopic: manifest.hadTopic, file: SNAPSHOT_FILES[TOPIC_KEY] }];
  } else if ([2, 3].includes(manifest.format)) {
    scope = manifest.scope;
    const expected = scope === 'all' ? [TOPIC_KEY, TAB_TOPIC_KEY, ...(manifest.format === 3 ? approvals.EXTRA_TOPIC_KEYS : [])]
      : scope === 'completion' ? [TAB_TOPIC_KEY] : scope === 'agent' ? [TOPIC_KEY] : [];
    if (manifest.format === 3 && (scope !== 'all' || manifest.includeApprovalPolicies !== true || manifest.includeAgentPolicies === false)) throw new Error('Invalid approval backup manifest');
    if (!expected.length || !Array.isArray(manifest.topics) || manifest.topics.length !== expected.length
      || manifest.topics.some(topic => !topic || typeof topic !== 'object' || Array.isArray(topic))
      || new Set(manifest.topics.map(topic => topic.topicKey)).size !== expected.length
      || manifest.topics.some(topic => !expected.includes(topic.topicKey) || typeof topic.hadTopic !== 'boolean' || topic.file !== SNAPSHOT_FILES[topic.topicKey])
      || (scope === 'completion' && manifest.includeMcp)) throw new Error('Invalid automation backup manifest');
    topics = manifest.topics;
  } else throw new Error('Invalid automation backup manifest');
  const snapshots = topics.map(topic => {
    const file = path.join(backup, topic.file);
    assertNoLinks(file);
    const value = fs.readFileSync(file, 'utf8');
    if (topic.topicKey === TAB_TOPIC_KEY) readTabPolicies(value);
    else if (approvals.EXTRA_TOPIC_KEYS.includes(topic.topicKey)) approvals.read(value, topic.topicKey);
    else if (manifest.includeAgentPolicies !== false) readPolicies(value);
    else if (manifest.includeMcp) require('./mcp-permissions').restoreMcpGrants('', value);
    else fields(decode(value));
    if (manifest.format === 3 && topic.topicKey === TOPIC_KEY) {
      approvals.read(value, TOPIC_KEY);
      require('./mcp-permissions').restoreApprovalGrants('', value, manifest.includeMcp);
    }
    return { topicKey: topic.topicKey, hadTopic: topic.hadTopic, value };
  });
  if (!options.dryRun) cancelPendingWorkers(env);
  return update(env, { ...options, restore: { scope, topics: snapshots, includeMcp: manifest.includeMcp,
    includeAgentPolicies: manifest.includeAgentPolicies !== false, includeApprovalPolicies: manifest.format === 3 } });
}
function workerRuntimeFiles(directory) {
  const files = ['agent-automation.js', 'approval-policies.js', 'mcp-permissions.js', 'setup-status.js', 'native-compatibility.js']
    .map(name => ({ source: path.join(__dirname, name), target: path.join(directory, name) }));
  const sourceCatalog = [path.join(__dirname, '..', 'config', 'native-compatibility.json'), path.join(__dirname, 'native-compatibility.json')].find(file => fs.existsSync(file));
  if (!sourceCatalog) throw new Error('Native compatibility catalog missing; recovery runtime not installed');
  return [...files, { source: sourceCatalog, target: path.join(directory, 'native-compatibility.json') }];
}
function persistWorkerRuntime(directory) {
  for (const { source, target } of workerRuntimeFiles(directory)) {
    if (path.resolve(source) !== path.resolve(target)) savePrivate(target, fs.readFileSync(source));
  }
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  return value;
}
function findReusableAutomationRequest(env, options = {}) {
  const scope = scopeFor(options), includeMcp = scope === 'all' && options.includeMcp !== false;
  try {
    for (const relative of ['resources/app/product.json', 'resources/app/out/main.js']) assertNoLinks(path.join(env.ideRoot || '', relative));
    if (validateNative(env)) return null;
    const directory = path.join(env.geminiConfigDir, 'workstation-setup', WORKER_DIRECTORY);
    const request = path.join(directory, 'request.json');
    assertNoLinks(request);
    if (!fs.existsSync(request)) return null;
    const before = fs.readFileSync(request);
    const job = JSON.parse(before);
    if (job.protocolVersion !== WORKER_PROTOCOL || job.cancelled || job.scope !== scope || job.includeMcp !== includeMcp
      || JSON.stringify(stableValue(job.env)) !== JSON.stringify(stableValue(env))) return null;
    if (!workerRuntimeFiles(directory).every(({ source, target }) => {
      assertNoLinks(target);
      return fs.existsSync(target) && fs.readFileSync(target).equals(fs.readFileSync(source));
    })) return null;
    const status = require('./setup-status').getSetupStatus(env, { ...options, inspectPreferences: false });
    if (status.requestId !== job.requestId || status.scope !== scope || status.includeMcp !== includeMcp) return null;
    const statusFile = workerStatusFile(request, job.requestId);
    assertNoLinks(statusFile);
    const saved = fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, 'utf8')) : null;
    if (saved && (saved.protocolVersion !== WORKER_PROTOCOL || saved.requestId !== job.requestId
      || saved.scope !== scope || saved.includeMcp !== includeMcp
      || !Number.isFinite(Date.parse(saved.updatedAt)))) return null;
    let result;
    if (['starting', 'waiting'].includes(status.state)) result = { applied: false, queued: true, reused: true, scope,
      protocolVersion: WORKER_PROTOCOL, requestId: job.requestId, statusFile, reason: status.reason, runtimeVerified: false };
    else if (!options.onlyPending && saved?.state === 'applied') {
      const inspection = inspectStoredAutomation(env, options);
      if (inspection.verified && inspection.applied) result = { applied: true, changed: false, reused: true,
        ...inspection.policyResult, runtimeVerified: false, protocolVersion: WORKER_PROTOCOL, requestId: job.requestId, statusFile };
    }
    if (!fs.readFileSync(request).equals(before)) return null;
    return result || null;
  } catch { return null; }
}
function pruneWorkerStatuses(request, currentRequestId) {
  const directory = path.dirname(request);
  const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  const filename = new RegExp('^status-(' + uuid + ')\\.json$');
  const keys = new Set(['protocolVersion', 'requestId', 'scope', 'includeMcp', 'updatedAt', 'state', 'launcherPid', 'bootTimeMs', 'pid',
    'reason', 'recoverable', 'applied', 'changed', 'runtimeVerified', 'backup', 'storedPolicies', 'storedTabPolicies', 'storedApprovalPolicies',
    'storedMcpPolicy', 'completedAt', 'cancelled', 'timedOut', 'deferred', 'dryRun', 'wouldChange']);
  const statuses = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const match = filename.exec(entry.name);
    if (!match || !entry.isFile() || entry.isSymbolicLink()) continue;
    const file = path.join(directory, entry.name);
    try {
      assertNoLinks(file);
      const bytes = fs.readFileSync(file), value = JSON.parse(bytes);
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.protocolVersion !== WORKER_PROTOCOL || value.requestId !== match[1]
        || !['all', 'completion'].includes(value.scope) || typeof value.includeMcp !== 'boolean' || (value.scope === 'completion' && value.includeMcp)
        || !['starting', 'waiting', 'applied', 'failed', 'cancelled'].includes(value.state) || !Number.isFinite(Date.parse(value.updatedAt))
        || Object.keys(value).some(key => !keys.has(key))) continue;
      statuses.push({ file, bytes, requestId: value.requestId, updatedAt: Date.parse(value.updatedAt) });
    } catch {   }
  }
  statuses.sort((left, right) => Number(right.requestId === currentRequestId) - Number(left.requestId === currentRequestId) || right.updatedAt - left.updatedAt);
  for (const entry of statuses.slice(3)) {
    assertNoLinks(entry.file);
    if (fs.readFileSync(entry.file).equals(entry.bytes)) fs.unlinkSync(entry.file);
  }
}
function launchWorker(request, job, options = {}) {
  const statusFile = workerStatusFile(request, job.requestId);
  writeWorkerStatus(request, statusFile, job.requestId, { state: 'starting', launcherPid: process.pid, bootTimeMs: Date.now() - os.uptime() * 1000 });
  const savedNode = typeof job.env.nodeExe === 'string' ? job.env.nodeExe : '';
  const nodeExecutable = savedNode && fs.existsSync(savedNode) ? savedNode : process.execPath;
  const child = (options.spawn || spawn)(nodeExecutable, [path.join(path.dirname(request), 'agent-automation.js'), request, job.requestId], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', error => writeWorkerStatus(request, statusFile, job.requestId, { state: 'failed', recoverable: true, reason: error.message }));
  if (!child.pid) {
    writeWorkerStatus(request, statusFile, job.requestId, { state: 'failed', recoverable: true, reason: 'Could not start the automation worker' });
    return { applied: false, scope: job.scope, reason: 'Could not start the automation worker', statusFile };
  }
  child.unref();
  return { applied: false, queued: true, scope: job.scope, protocolVersion: WORKER_PROTOCOL, requestId: job.requestId, statusFile };
}
function queueAutomation(env, options = {}) {
  if (!options.dryRun) {
    const reusable = findReusableAutomationRequest(env, options);
    if (reusable) return reusable;
  }
  const result = update(env, options);
  if (options.dryRun && result.deferred) return { ...result, dryRun: true, wouldQueue: true };
  if (options.dryRun) return result;
  const directory = path.join(env.geminiConfigDir, 'workstation-setup', WORKER_DIRECTORY);
  const request = path.join(directory, 'request.json');
  assertNoLinks(directory);
  persistWorkerRuntime(directory);
  const requestId = crypto.randomUUID();
  const statusFile = workerStatusFile(request, requestId);
  const scope = scopeFor(options);
  const job = { protocolVersion: WORKER_PROTOCOL, requestId, env, scope, includeMcp: scope === 'all' && options.includeMcp !== false, requestedAt: new Date().toISOString() };
  savePrivate(request, JSON.stringify(job));
  if (!result.deferred) {
    writeWorkerStatus(request, statusFile, requestId, { ...result, state: result.applied ? 'applied' : 'failed', completedAt: new Date().toISOString() });
    pruneWorkerStatuses(request, requestId);
    return { ...result, protocolVersion: WORKER_PROTOCOL, requestId, statusFile };
  }
  const queued = { ...result, ...launchWorker(request, job, options) };
  pruneWorkerStatuses(request, requestId);
  return queued;
}
function workerStatusFile(request, requestId) {
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId))) throw new Error('Invalid automation request ID');
  return path.join(path.dirname(request), requestId ? 'status-' + requestId + '.json' : 'status.json');
}
function writeWorkerStatus(request, statusFile, requestId, status) {
  const job = JSON.parse(fs.readFileSync(request, 'utf8'));
  if (job.requestId !== requestId) return false;
  savePrivate(statusFile, JSON.stringify({ protocolVersion: WORKER_PROTOCOL, requestId, scope: job.scope || 'all', includeMcp: job.includeMcp, updatedAt: new Date().toISOString(), ...status }));
  return true;
}
async function runWorker(request, options = {}) {
  assertNoLinks(request);
  const initial = JSON.parse(fs.readFileSync(request, 'utf8'));
  const requestId = options.requestId ?? initial.requestId;
  const statusFile = workerStatusFile(request, requestId);
  const matches = job => job.requestId === requestId && job.scope === initial.scope && job.includeMcp === initial.includeMcp
    && JSON.stringify(job.env) === JSON.stringify(initial.env);
  const readJob = () => JSON.parse(fs.readFileSync(request, 'utf8'));
  if (!matches(initial)) return { applied: false, superseded: true };
  if (!options.apply && initial.protocolVersion !== WORKER_PROTOCOL) throw new Error('Unsupported automation worker protocol; rerun setup');
  writeWorkerStatus(request, statusFile, requestId, { state: 'waiting', pid: process.pid, bootTimeMs: Date.now() - os.uptime() * 1000 });
  const deadline = Date.now() + (options.timeoutMs ?? 24 * 60 * 60 * 1000);
  const attempt = options.apply || update;
  while (Date.now() < deadline) {
    const job = readJob();
    if (!matches(job)) return { applied: false, superseded: true };
    if (job.cancelled) {
      const result = { applied: false, cancelled: true };
      writeWorkerStatus(request, statusFile, requestId, { state: 'cancelled', ...result });
      return result;
    }
    let result;
    try {
      result = attempt(job.env, { scope: job.scope || 'all', includeMcp: job.includeMcp,
        isCancelled: () => { const latest = readJob(); return !matches(latest) || latest.cancelled === true; } });
    } catch (error) {
      const latest = readJob();
      if (!matches(latest)) return { applied: false, superseded: true };
      if (error.code !== 'WORKSTATION_AUTOMATION_CANCELLED' || !latest.cancelled) throw error;
      result = { applied: false, cancelled: true };
    }
    if (!matches(readJob())) return { applied: false, superseded: true };
    if (!result.deferred) {
      writeWorkerStatus(request, statusFile, requestId, { state: result.cancelled ? 'cancelled' : result.applied ? 'applied' : 'failed', completedAt: new Date().toISOString(), ...result });
      return result;
    }
    writeWorkerStatus(request, statusFile, requestId, { state: 'waiting', pid: process.pid, bootTimeMs: Date.now() - os.uptime() * 1000, reason: result.reason || 'Waiting for Antigravity to close normally' });
    await new Promise(resolve => setTimeout(resolve, options.intervalMs ?? 2000));
  }
  const result = { applied: false, timedOut: true, reason: 'Waiting timed out; run workstation-setup resume or reopen Antigravity to resume this pending request' };
  writeWorkerStatus(request, statusFile, requestId, { state: 'failed', ...result });
  return result;
}
if (require.main === module) runWorker(process.argv[2], { requestId: process.argv[3] }).catch(error => {
  try { writeWorkerStatus(process.argv[2], workerStatusFile(process.argv[2], process.argv[3]), process.argv[3], { state: 'failed', reason: error.message }); } catch {}
  process.exitCode = 1;
});
module.exports = { POLICIES, TAB_TOPIC_KEY, TAB_POLICIES, SNAPSHOT_FILES, NATIVE_MAIN_SHA256, readPolicies, mergePolicies, restorePolicies,
  readTabPolicies, mergeTabPolicies, restoreTabPolicies, validateNative, update, inspectAutomation, findReusableAutomationRequest, restoreAutomation, queueAutomation, runWorker,
  cancelPendingWorkers, assertNoLinks, savePrivate, workerStatusFile, writeWorkerStatus, persistWorkerRuntime, pruneWorkerStatuses, launchWorker, WORKER_PROTOCOL, WORKER_DIRECTORY };
