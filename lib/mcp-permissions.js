'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const TOPIC_KEY = 'antigravityUnifiedStateSync.agentPreferences';
const GRANT_KEY = 'permission_grants_global';
const AUTO_ALLOW = Object.freeze(['command(*)', 'read_file(*)', 'write_file(*)', 'read_url(*)', 'unsandboxed(*)', 'mcp(*)']);
const approvalGrant = (value, includeMcp = true) => /^(?:command|read_file|write_file|read_url|unsandboxed)\(/.test(value) || (includeMcp && /^mcp\(/.test(value));

function varint(value) {
  const bytes = [];
  do { const low = value % 128; value = Math.floor(value / 128); bytes.push(low | (value ? 128 : 0)); } while (value);
  return Buffer.from(bytes);
}
function readVarint(bytes, cursor) {
  let value = 0, shift = 0;
  while (cursor.pos < bytes.length && shift <= 49) {
    const byte = bytes[cursor.pos++]; value += (byte & 127) * 2 ** shift;
    if (byte < 128) return value;
    shift += 7;
  }
  throw new Error('Invalid protobuf varint; preferences not changed');
}
function fields(bytes) {
  const cursor = { pos: 0 }, result = [];
  while (cursor.pos < bytes.length) {
    const start = cursor.pos, tag = readVarint(bytes, cursor);
    const id = Math.floor(tag / 8), wire = tag % 8;
    if (!id) throw new Error('Invalid protobuf field');
    let value;
    if (wire === 2) {
      const length = readVarint(bytes, cursor);
      value = bytes.subarray(cursor.pos, cursor.pos + length); cursor.pos += length;
    } else if (wire === 0) value = readVarint(bytes, cursor);
    else if (wire === 1) cursor.pos += 8;
    else if (wire === 5) cursor.pos += 4;
    else throw new Error('Unsupported protobuf wire type');
    if (cursor.pos > bytes.length) throw new Error('Truncated preferences; no write');
    result.push({ id, wire, value, raw: bytes.subarray(start, cursor.pos) });
  }
  return result;
}
function stringField(id, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  return Buffer.concat([varint(id * 8 + 2), varint(bytes.length), bytes]);
}
function decodeBase64(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid base64 preferences');
  return Buffer.from(value, 'base64');
}
function mergeMcpGrant(topicValue, policy) {
  if (JSON.stringify(policy.allow) !== '["mcp(*)"]' || policy.replaceMcpAskAndDeny !== true) throw new Error('Unsupported MCP policy');
  return mergeGrants(topicValue, ['mcp(*)'], value => /^mcp\(/.test(value));
}
function mergeApprovalGrants(topicValue, includeMcp = true) {
  return mergeGrants(topicValue, AUTO_ALLOW.filter(value => includeMcp || value !== 'mcp(*)'), value => approvalGrant(value, includeMcp));
}
function mergeGrants(topicValue, allow, owns) {
  const topic = fields(decodeBase64(topicValue)); let found = false;
  const updated = topic.map(entry => {
    if (entry.id !== 1 || entry.wire !== 2) return entry.raw;
    const pair = fields(entry.value), key = pair.find(field => field.id === 1 && field.wire === 2);
    if (key?.value.toString('utf8') !== GRANT_KEY) return entry.raw;
    if (found) throw new Error('Duplicate grant key'); found = true;
    const rowField = pair.find(field => field.id === 2 && field.wire === 2);
    if (!rowField) throw new Error('Invalid grant row');
    const row = fields(rowField.value), values = row.filter(field => field.id === 1 && field.wire === 2);
    if (values.length !== 1) throw new Error('Invalid grant value');
    const grantFields = fields(decodeBase64(values[0].value.toString('utf8')));
    const kept = grantFields.filter(field => !([2, 3].includes(field.id) && field.wire === 2 && owns(field.value.toString('utf8'))));
    const added = allow.filter(value => !kept.some(field => field.id === 1 && field.wire === 2 && field.value.toString('utf8') === value));
    const grants = Buffer.concat([...kept.map(field => field.raw), ...added.map(value => stringField(1, value))]).toString('base64');
    const newRow = Buffer.concat(row.map(field => field === values[0] ? stringField(1, grants) : field.raw));
    return stringField(1, Buffer.concat(pair.map(field => field === rowField ? stringField(2, newRow) : field.raw)));
  });
  if (!found) updated.push(stringField(1, Buffer.concat([stringField(1, GRANT_KEY), stringField(2, stringField(1, Buffer.concat(allow.map(value => stringField(1, value))).toString('base64')))])));
  return Buffer.concat(updated).toString('base64');
}
function readMcpPolicy(topicValue) {
  for (const entry of fields(decodeBase64(topicValue))) {
    if (entry.id !== 1 || entry.wire !== 2) continue;
    const pair = fields(entry.value);
    if (pair.find(field => field.id === 1)?.value.toString() !== GRANT_KEY) continue;
    const row = fields(pair.find(field => field.id === 2).value);
    const grants = fields(decodeBase64(row.find(field => field.id === 1).value.toString()));
    return {
      allowed: grants.some(field => field.id === 1 && field.wire === 2 && field.value.toString() === 'mcp(*)'),
      conflicts: grants.filter(field => [2, 3].includes(field.id) && field.wire === 2 && /^mcp\(/.test(field.value.toString())).length,
    };
  }
  return { allowed: false, conflicts: 0 };
}
function readApprovalGrants(topicValue, includeMcp = true) {
  const grants = [];
  let found = false;
  for (const entry of fields(decodeBase64(topicValue))) {
    if (entry.id !== 1 || entry.wire !== 2) continue;
    const pair = fields(entry.value);
    if (pair.find(field => field.id === 1)?.value.toString() !== GRANT_KEY) continue;
    if (found) throw new Error('Duplicate global grant key');
    found = true;
    const row = fields(pair.find(field => field.id === 2).value);
    grants.push(...fields(decodeBase64(row.find(field => field.id === 1).value.toString())));
  }
  return {
    allowed: AUTO_ALLOW.filter(value => includeMcp || value !== 'mcp(*)').every(value => grants.some(f => f.id === 1 && f.wire === 2 && f.value.toString() === value)),
    conflicts: grants.filter(f => [2, 3].includes(f.id) && f.wire === 2 && approvalGrant(f.value.toString(), includeMcp)).length,
  };
}
function isIdeRunning() {
  const output = execFileSync('tasklist.exe', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
  return /^"(?:Antigravity IDE|Antigravity|antigravity-ide)\.exe"/im.test(output);
}
function restoreMcpGrants(currentValue, backupValue, owns = value => /^mcp\(/.test(value)) {
  function grantRow(entry) {
    if (entry.id !== 1 || entry.wire !== 2) return null;
    const pair = fields(entry.value);
    if (pair.find(field => field.id === 1 && field.wire === 2)?.value.toString('utf8') !== GRANT_KEY) return null;
    const rows = pair.filter(field => field.id === 2 && field.wire === 2);
    if (rows.length !== 1) throw new Error('Invalid grant row');
    const row = fields(rows[0].value), values = row.filter(field => field.id === 1 && field.wire === 2);
    if (values.length !== 1) throw new Error('Invalid grant value');
    return { pair, row, rowField: rows[0], valueField: values[0], grants: fields(decodeBase64(values[0].value.toString('utf8'))) };
  }
  function isMcp(field) {
    return [1, 2, 3].includes(field.id) && field.wire === 2 && owns(field.value.toString('utf8'));
  }
  const savedRows = fields(decodeBase64(backupValue)).map(grantRow).filter(Boolean);
  if (savedRows.length > 1) throw new Error('Duplicate backup grant key');
  const saved = (savedRows[0]?.grants || []).filter(isMcp).map(field => field.raw);
  let found = false;
  const updated = fields(decodeBase64(currentValue)).map(entry => {
    const current = grantRow(entry);
    if (!current) return entry.raw;
    if (found) throw new Error('Duplicate current grant key');
    found = true;
    const grants = Buffer.concat([...current.grants.filter(field => !isMcp(field)).map(field => field.raw), ...saved]);
    if (!grants.length && !savedRows.length && current.row.length === 1 && current.pair.length === 2) return Buffer.alloc(0);
    const newRow = Buffer.concat(current.row.map(field => field === current.valueField ? stringField(1, grants.toString('base64')) : field.raw));
    return stringField(1, Buffer.concat(current.pair.map(field => field === current.rowField ? stringField(2, newRow) : field.raw)));
  });
  if (!found && saved.length) updated.push(stringField(1, Buffer.concat([stringField(1, GRANT_KEY), stringField(2, stringField(1, Buffer.concat(saved).toString('base64')))])));
  return Buffer.concat(updated).toString('base64');
}
function restoreApprovalGrants(current, saved, includeMcp = true) {
  return restoreMcpGrants(current, saved, value => approvalGrant(value, includeMcp));
}
function applyMcpPermissions(envPaths, options = {}) {
  const root = options.repoRoot || path.resolve(__dirname, '..');
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'ai', 'mcp-permissions.json'), 'utf8'));
  const productPath = path.join(envPaths.ideRoot || path.join(envPaths.localAppData, 'Programs', 'Antigravity IDE'), 'resources', 'app', 'product.json');
  const dbPath = path.join(envPaths.userSettingsDir, 'globalStorage', 'state.vscdb');
  if (!fs.existsSync(productPath) || !fs.existsSync(dbPath)) return { applied: false, reason: 'Open Antigravity once, then close it and run workstation-setup permissions from PowerShell/CMD.' };
  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  const compatibility = require('./native-compatibility').inspectNativeCompatibility({ ...envPaths, ideRoot: path.resolve(path.dirname(productPath), '../..') }, { repoRoot: root });
  if (!compatibility.supported) return { applied: false, reason: compatibility.reason };
  if (!options.isolated && isIdeRunning()) return { applied: false, reason: 'Close all Antigravity windows and run workstation-setup permissions outside the IDE. Live state is not edited.' };
  const db = new DatabaseSync(dbPath, { readOnly: !!options.dryRun });
  try {
    const oldRow = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY);
    const oldValue = oldRow?.value || '';
    const newValue = mergeMcpGrant(oldValue, policy);
    if (newValue === oldValue) return { applied: true, changed: false, ...readMcpPolicy(newValue) };
    if (options.dryRun) return { applied: false, dryRun: true, wouldChange: true };
    const backup = path.join(envPaths.backupsDir, 'mcp-permissions-' + new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(backup, { recursive: true });
    db.prepare('VACUUM INTO ?').run(path.join(backup, 'state.vscdb'));
    fs.writeFileSync(path.join(backup, 'agent-preferences.base64'), oldValue, 'utf8');
    fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ format: 1, topicKey: TOPIC_KEY, hadTopic: !!oldRow, ideVersion: product.ideVersion }, null, 2), 'utf8');
    db.exec('BEGIN IMMEDIATE');
    try {
      if (db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY)?.value !== oldRow?.value) throw new Error('Preferences changed during backup; retry after closing the IDE');
      if (!options.isolated && isIdeRunning()) throw new Error('Antigravity started during backup; close it and retry');
      db.prepare('INSERT INTO ItemTable(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(TOPIC_KEY, newValue);
      const check = readMcpPolicy(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value);
      if (!check.allowed || check.conflicts || db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('MCP permission verification failed');
      db.exec('COMMIT');
      return { applied: true, changed: true, backup, ...check };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  } finally { db.close(); }
}
function restoreMcpPermissions(envPaths, backupDir, options = {}) {
  if (!backupDir) throw new Error('Specify the private mcp-permissions backup directory');
  const resolved = fs.realpathSync(backupDir), root = fs.realpathSync(envPaths.backupsDir);
  if (path.dirname(resolved).toLowerCase() !== root.toLowerCase() || !path.basename(resolved).startsWith('mcp-permissions-')) throw new Error('Backup must be a direct mcp-permissions directory in the user backups folder');
  if (!options.isolated && isIdeRunning()) throw new Error('Close all Antigravity windows before restoring');
  const manifest = JSON.parse(fs.readFileSync(path.join(resolved, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || manifest.topicKey !== TOPIC_KEY || typeof manifest.hadTopic !== 'boolean') throw new Error('Invalid permission backup manifest');
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const appPath = path.join(envPaths.ideRoot || path.join(envPaths.localAppData, 'Programs', 'Antigravity IDE'), 'resources', 'app');
  const product = JSON.parse(fs.readFileSync(path.join(appPath, 'product.json'), 'utf8'));
  const compatibility = require('./native-compatibility').inspectNativeCompatibility({ ...envPaths, ideRoot: path.resolve(appPath, '../..') }, { repoRoot });
  if (!compatibility.supported || manifest.ideVersion !== product.ideVersion) throw new Error('Unverified Antigravity storage version; permissions not restored');
  const value = fs.readFileSync(path.join(resolved, 'agent-preferences.base64'), 'utf8');
  fields(decodeBase64(value));
  const db = new DatabaseSync(path.join(envPaths.userSettingsDir, 'globalStorage', 'state.vscdb'));
  try {
    const newBackup = path.join(envPaths.backupsDir, 'mcp-permissions-before-restore-' + new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(newBackup, { recursive: true });
    db.prepare('VACUUM INTO ?').run(path.join(newBackup, 'state.vscdb'));
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!options.isolated && isIdeRunning()) throw new Error('Antigravity started; restore cancelled');
      const current = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY);
      const restored = restoreMcpGrants(current?.value || '', value);
      if (restored || manifest.hadTopic) db.prepare('INSERT INTO ItemTable(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(TOPIC_KEY, restored);
      else db.prepare('DELETE FROM ItemTable WHERE key=?').run(TOPIC_KEY);
      if ((db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY)?.value || '') !== restored) throw new Error('Permission restore readback failed');
      if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Restore verification failed');
      db.exec('COMMIT');
      return { restored: true, backup: newBackup };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  } finally { db.close(); }
}
module.exports = { mergeMcpGrant, mergeApprovalGrants, restoreApprovalGrants, readApprovalGrants, AUTO_ALLOW, readMcpPolicy, applyMcpPermissions, restoreMcpPermissions, restoreMcpGrants, isIdeRunning, fields, stringField, TOPIC_KEY };
