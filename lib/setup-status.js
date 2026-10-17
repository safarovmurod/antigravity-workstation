'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { TOPIC_KEY, readMcpPolicy } = require('./mcp-permissions');
const automation = require('./agent-automation');

function workerDirectory(env) { return path.join(env.geminiConfigDir, 'mansur-setup', automation.WORKER_DIRECTORY); }
function samePath(left, right) {
  return typeof left === 'string' && typeof right === 'string' && path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}
function assertJob(job, env, request) {
  if (!job || typeof job !== 'object' || Array.isArray(job) || job.protocolVersion !== automation.WORKER_PROTOCOL
    || typeof job.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(job.requestId)
    || !['all', 'completion'].includes(job.scope) || typeof job.includeMcp !== 'boolean'
    || (job.scope === 'completion' && job.includeMcp) || !Number.isFinite(Date.parse(job.requestedAt))
    || !job.env || typeof job.env !== 'object' || Array.isArray(job.env)
    || !samePath(job.env.geminiConfigDir, env.geminiConfigDir) || !samePath(job.env.userSettingsDir, env.userSettingsDir)
    || typeof job.env.backupsDir !== 'string' || !samePath(path.dirname(request), workerDirectory(env))) {
    throw new Error('Invalid or foreign pending request; rerun setup for this profile');
  }
}
function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
function storedPreferences(env, job) {
  const result = { available: false, matches: null, runtimeVerified: false };
  const dbFile = path.join(env.userSettingsDir, 'globalStorage', 'state.vscdb');
  try {
    automation.assertNoLinks(dbFile);
    if (!fs.existsSync(dbFile)) return { ...result, reason: 'Native profile has not been initialized' };
    const db = new DatabaseSync(dbFile, { readOnly: true });
    try {
      const get = key => db.prepare('SELECT value FROM ItemTable WHERE key=?').get(key)?.value || '';
      result.tabPolicies = automation.readTabPolicies(get(automation.TAB_TOPIC_KEY));
      let matches = Object.entries(automation.TAB_POLICIES).every(([key, value]) => result.tabPolicies[key] === value);
      if (job.scope === 'all') {
        result.agentPolicies = automation.readPolicies(get(TOPIC_KEY));
        matches &&= Object.entries(automation.POLICIES).every(([key, value]) => result.agentPolicies[key] === value);
        if (job.includeMcp) {
          result.mcp = readMcpPolicy(get(TOPIC_KEY));
          matches &&= result.mcp.allowed && result.mcp.conflicts === 0;
        }
      }
      return { ...result, available: true, matches };
    } finally { db.close(); }
  } catch (error) { return { ...result, reason: error.message }; }
}
function getSetupStatus(env, options = {}) {
  const request = path.join(workerDirectory(env), 'request.json');
  const base = { state: 'idle', applied: false, recoverable: false, runtimeVerified: false, requestFile: request };
  try {
    automation.assertNoLinks(request);
    if (!fs.existsSync(request)) {
      const legacy = path.join(env.geminiConfigDir, 'mansur-setup', 'automation', 'request.json');
      automation.assertNoLinks(legacy);
      if (fs.existsSync(legacy) && !JSON.parse(fs.readFileSync(legacy, 'utf8')).cancelled) return { ...base, state: 'legacy-pending', reason: 'An older worker protocol exists; rerun the current setup to replace it safely' };
      return { ...base, reason: 'No native automation request recorded for this profile' };
    }
    const job = JSON.parse(fs.readFileSync(request, 'utf8'));
    assertJob(job, env, request);
    const statusFile = automation.workerStatusFile(request, job.requestId);
    automation.assertNoLinks(statusFile);
    const status = fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, 'utf8')) : null;
    const details = { ...base, scope: job.scope, includeMcp: job.includeMcp, requestId: job.requestId, requestedAt: job.requestedAt, statusFile,
      storedPreferences: storedPreferences(env, job) };
    if (job.cancelled || status?.state === 'cancelled') return { ...details, state: 'cancelled', reason: 'This request was cancelled or restored; it will not be resumed' };
    if (status && ((status.scope !== undefined && status.scope !== job.scope) || (status.includeMcp !== undefined && status.includeMcp !== job.includeMcp))) return { ...details, state: 'invalid', reason: 'The pending request scope differs from its recorded authorization; rerun setup' };
    if (status && status.requestId !== job.requestId) return { ...details, state: 'superseded', reason: 'Status belongs to another request; rerun setup to create a consistent request' };
    if (status?.state === 'applied') {
      if (details.storedPreferences.matches === true) return { ...details, state: 'applied', applied: true, completedAt: status.completedAt, backup: status.backup, reason: 'Requested preferences are stored; live Antigravity behavior has not been verified' };
      return { ...details, state: details.storedPreferences.available ? 'drifted' : 'unverified', reason: details.storedPreferences.reason || 'Stored preferences no longer match this completed request; rerun setup if you want to apply them again' };
    }
    const now = options.now ?? Date.now();
    const alive = options.isProcessAlive || isProcessAlive;
    const bootTimeMs = options.bootTimeMs ?? Date.now() - os.uptime() * 1000;
    const sameBoot = Number.isFinite(status?.bootTimeMs) ? Math.abs(status.bootTimeMs - bootTimeMs) < 60000
      : Date.parse(job.requestedAt) >= bootTimeMs - 60000;
    const workerAlive = sameBoot && alive(status?.pid);
    const heartbeatAgeMs = now - Date.parse(status?.updatedAt || job.requestedAt);
    if (status?.state === 'waiting' && workerAlive) return { ...details, state: heartbeatAgeMs > 30000 ? 'stale-worker' : 'waiting', worker: { pid: status.pid, alive: true, heartbeatAgeMs }, reason: heartbeatAgeMs > 30000 ? 'A process with the worker PID is alive, but its heartbeat is stale; rerun setup to supersede the old request safely' : status.reason || 'Worker is waiting for all Antigravity windows to close normally' };
    if (!status && heartbeatAgeMs < 10000) return { ...details, state: 'starting', reason: 'The new request is waiting for its worker to start' };
    if (status?.state === 'starting' && sameBoot && heartbeatAgeMs < 10000) return { ...details, state: 'starting', reason: 'The pending worker is starting' };
    if (status?.state === 'failed' && !status.timedOut && !status.recoverable) return { ...details, state: 'failed', reason: status.reason || 'Native automation failed; correct the reported problem and rerun setup' };
    return { ...details, state: status?.timedOut ? 'expired' : 'interrupted', recoverable: true, worker: { pid: status?.pid || null, alive: false },
      reason: status?.timedOut ? 'The previous waiting period expired; this same authorized request can resume' : 'The pending worker is no longer running; this same authorized request can resume' };
  } catch (error) { return { ...base, state: 'invalid', reason: error.message }; }
}
function recoverPending(env, options = {}) {
  let status = getSetupStatus(env, options);
  if (!status.recoverable) return { ...status, resumed: false };
  if (options.dryRun) return { ...status, resumed: false, dryRun: true, wouldResume: true };
  const request = status.requestFile;
  const lock = path.join(path.dirname(request), 'resume.lock');
  automation.assertNoLinks(lock);
  let descriptor;
  try {
    try { descriptor = fs.openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let existing = null;
      try { existing = JSON.parse(fs.readFileSync(lock, 'utf8')); } catch { existing = null; }
      const alive = options.isProcessAlive || isProcessAlive;
      const currentBoot = options.bootTimeMs ?? Date.now() - os.uptime() * 1000;
      // Only a parsable lock owned by a live same-boot process may block recovery.
      // A corrupt (crash-truncated) or stale lock cannot own it and is replaced.
      const ownerAlive = existing !== null && typeof existing === 'object' && !Array.isArray(existing)
        && Number.isSafeInteger(existing.pid) && existing.pid > 0
        && (!Number.isFinite(existing.bootTimeMs) || Math.abs(existing.bootTimeMs - currentBoot) < 60000)
        && alive(existing.pid);
      if (ownerAlive) return { ...status, resumed: false, state: 'starting', recoverable: false, reason: 'Another process is resuming this request' };
      // A missing, unreadable, or stale lock cannot own the recovery; replace it.
      // A concurrent replacement is tolerated: the retried attempt sees its lock.
      try { fs.unlinkSync(lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      descriptor = fs.openSync(lock, 'wx', 0o600);
    }
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, bootTimeMs: Date.now() - os.uptime() * 1000 }));
    // Recheck while holding the lock. Restore/cancellation and a concurrent newer request win.
    const before = fs.readFileSync(request, 'utf8');
    status = getSetupStatus(env, options);
    if (!status.recoverable) return { ...status, resumed: false };
    const job = JSON.parse(before);
    assertJob(job, env, request);
    if (job.requestId !== status.requestId || job.cancelled) return { ...status, resumed: false };
    automation.persistWorkerRuntime(path.dirname(request));
    if (fs.readFileSync(request, 'utf8') !== before) return { ...getSetupStatus(env, options), resumed: false };
    const result = automation.launchWorker(request, job, options);
    return { ...status, ...result, state: result.queued ? 'starting' : 'failed', resumed: result.queued === true, recoverable: false, reason: result.queued ? 'Resumed the original pending request with its original scope' : result.reason, runtimeVerified: false };
  } catch (error) { return { ...status, resumed: false, reason: error.message }; }
  finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
      fs.rmSync(lock, { force: true });
    }
  }
}
function formatSetupStatus(status) {
  const lines = ['Native setup: ' + status.state, status.reason || ''];
  if (status.scope) lines.push('Scope: ' + status.scope);
  if (status.storedPreferences) lines.push('Stored preferences: ' + (status.storedPreferences.matches === true ? 'match request' : status.storedPreferences.available ? 'do not match request' : 'unavailable'));
  lines.push('Live Antigravity behavior: not verified');
  if (status.recoverable) lines.push('Recovery: run mansur-setup resume, or reopen Antigravity with the stability helper enabled');
  return lines.filter(Boolean).join('\n');
}
if (require.main === module) {
  try {
    const command = process.argv[2];
    if (!['--resume', '--status'].includes(command) || !process.argv[3]) throw new Error('Usage: node setup-status.js --status|--resume <request.json> [--json]');
    const request = path.resolve(process.argv[3]);
    automation.assertNoLinks(request);
    const job = JSON.parse(fs.readFileSync(request, 'utf8'));
    assertJob(job, job.env, request);
    const result = command === '--status' ? getSetupStatus(job.env) : recoverPending(job.env);
    console.log(command === '--status' && !process.argv.includes('--json') ? formatSetupStatus(result) : JSON.stringify(result));
    if (command === '--resume' && (result.state === 'failed' || result.state === 'invalid')) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { getSetupStatus, recoverPending, formatSetupStatus, storedPreferences, workerDirectory };
