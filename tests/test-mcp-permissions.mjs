import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { mergeMcpGrant, readMcpPolicy, applyMcpPermissions, restoreMcpPermissions, fields, stringField, TOPIC_KEY } = require('../lib/mcp-permissions');
function mockCompatibility(t) {
  t.mock.method(require('../lib/native-compatibility'), 'inspectNativeCompatibility', env => ({
    supported: JSON.parse(fs.readFileSync(path.join(env.ideRoot, 'resources/app/product.json'))).ideVersion === '2.5.5',
    reason: 'Unverified test version',
  }));
}
const policy = { allow: ['mcp(*)'], replaceMcpAskAndDeny: true };
function topicEntry(key, value) {
  return stringField(1, Buffer.concat([stringField(1, key), stringField(2, stringField(1, value))]));
}
function getGrants(value) {
  for (const entry of fields(Buffer.from(value, 'base64'))) {
    const pair = fields(entry.value);
    if (pair[0].value.toString() !== 'permission_grants_global') continue;
    return fields(Buffer.from(fields(pair[1].value)[0].value.toString(), 'base64')).map(f => [f.id, f.value.toString()]);
  }
}
test('Global MCP Allow replaces only MCP Ask/Deny, keeps other permissions and exact unrelated topic bytes', () => {
  const foreign = topicEntry('keep-setting', 'KEEP-EXACT');
  const grants = Buffer.concat([stringField(1, 'command(npm)'), stringField(2, 'mcp(old/delete)'), stringField(2, 'write_file(private)'), stringField(3, 'mcp(*)'), stringField(3, 'command(rm)'), stringField(9, 'future-field')]).toString('base64');
  const before = Buffer.concat([foreign, topicEntry('permission_grants_global', grants)]).toString('base64');
  const after = mergeMcpGrant(before, policy);
  assert.deepEqual(readMcpPolicy(after), { allowed: true, conflicts: 0 });
  assert.deepEqual(fields(Buffer.from(after, 'base64'))[0].raw, foreign);
  assert.deepEqual(getGrants(after), [[1, 'command(npm)'], [2, 'write_file(private)'], [3, 'command(rm)'], [9, 'future-field'], [1, 'mcp(*)']]);
  assert.equal(mergeMcpGrant(after, policy), after);
  assert.deepEqual(readMcpPolicy(mergeMcpGrant('', policy)), { allowed: true, conflicts: 0 });
  assert.throws(() => mergeMcpGrant('not base64', policy));
  assert.throws(() => mergeMcpGrant(Buffer.from([10, 99]).toString('base64'), policy));
});
for (const drive of ['C', 'D']) test(`Offline MCP installation and restore with Antigravity on drive ${drive}`, t => {
  mockCompatibility(t);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation mcp '));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { localAppData: path.join(home, 'drive-C', 'Local'), ideRoot: path.join(home, 'drive-' + drive, 'Apps', 'Antigravity IDE'), userSettingsDir: path.join(home, 'User'), backupsDir: path.join(home, 'backups') };
  const app = path.join(env.ideRoot, 'resources', 'app');
  const product = path.join(app, 'product.json');
  fs.mkdirSync(path.join(app, 'out'), { recursive: true });
  fs.writeFileSync(product, JSON.stringify({ ideVersion: '2.5.5' }));
  fs.writeFileSync(path.join(app, 'out', 'main.js'), TOPIC_KEY + ' permission_grants_global AgentPreferencesLifecycle');
  const dbPath = path.join(env.userSettingsDir, 'globalStorage', 'state.vscdb');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const setup = new DatabaseSync(dbPath);
  setup.exec('CREATE TABLE ItemTable(key TEXT PRIMARY KEY,value TEXT)');
  setup.prepare('INSERT INTO ItemTable VALUES(?,?)').run(TOPIC_KEY, '');
  setup.prepare('INSERT INTO ItemTable VALUES(?,?)').run('foreign-auth-row', 'DO-NOT-MODIFY');
  setup.close();
  const opts = { isolated: true };
  assert.equal(applyMcpPermissions(env, { ...opts, dryRun: true }).wouldChange, true);
  assert.equal(fs.existsSync(env.backupsDir), false);
  const result = applyMcpPermissions(env, opts);
  assert.equal(result.applied, true); assert.equal(result.changed, true);
  const backup = new DatabaseSync(path.join(result.backup, 'state.vscdb'), { readOnly: true });
  assert.equal(backup.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value, ''); backup.close();
  assert.equal(applyMcpPermissions(env, opts).changed, false);
  const db = new DatabaseSync(dbPath);
  assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get('foreign-auth-row').value, 'DO-NOT-MODIFY');
  const current = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value;
  assert.equal(restoreMcpPermissions(env, result.backup, opts).restored, true);
  assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value, '');
  assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get('foreign-auth-row').value, 'DO-NOT-MODIFY');
  assert.throws(() => restoreMcpPermissions(env, home, opts));
  db.prepare('UPDATE ItemTable SET value=? WHERE key=?').run(current, TOPIC_KEY);
  fs.writeFileSync(product, JSON.stringify({ ideVersion: '999.0' }));
  assert.equal(applyMcpPermissions(env, opts).applied, false);
  assert.throws(() => restoreMcpPermissions(env, result.backup, opts), /Unverified Antigravity/);
  assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value, current);
  fs.writeFileSync(product, JSON.stringify({ ideVersion: '2.5.5' }));
  db.prepare('UPDATE ItemTable SET value=? WHERE key=?').run('INVALID!', TOPIC_KEY);
  assert.throws(() => applyMcpPermissions(env, opts));
  assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value, 'INVALID!');
  db.close();
});

test('Permission restore keeps later AI preferences, non-MCP permissions and unrelated database rows', t => {
  mockCompatibility(t);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation mcp restore '));
  const env = { localAppData: path.join(home, 'Local'), userSettingsDir: path.join(home, 'User'), backupsDir: path.join(home, 'backups') };
  const app = path.join(env.localAppData, 'Programs', 'Antigravity IDE', 'resources', 'app');
  fs.mkdirSync(path.join(app, 'out'), { recursive: true });
  fs.writeFileSync(path.join(app, 'product.json'), JSON.stringify({ ideVersion: '2.5.5' }));
  fs.writeFileSync(path.join(app, 'out', 'main.js'), TOPIC_KEY + ' permission_grants_global AgentPreferencesLifecycle');
  const dbPath = path.join(env.userSettingsDir, 'globalStorage', 'state.vscdb');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  t.after(() => { db.close(); fs.rmSync(home, { recursive: true, force: true }); });
  db.exec('CREATE TABLE ItemTable(key TEXT PRIMARY KEY,value TEXT)');
  const oldGrants = Buffer.concat([stringField(3, 'mcp(*)'), stringField(2, 'mcp(server/delete)'), stringField(1, 'command(old)')]).toString('base64');
  db.prepare('INSERT INTO ItemTable VALUES(?,?)').run(TOPIC_KEY, Buffer.concat([topicEntry('model', 'OLD'), topicEntry('permission_grants_global', oldGrants)]).toString('base64'));
  db.prepare('INSERT INTO ItemTable VALUES(?,?)').run('foreign-auth-row', 'RETAIN');
  const result = applyMcpPermissions(env, { isolated: true });
  const laterPreference = topicEntry('model', 'NEW');
  const laterGrants = Buffer.concat([stringField(1, 'mcp(*)'), stringField(1, 'command(new)'), stringField(9, 'future')]).toString('base64');
  db.prepare('UPDATE ItemTable SET value=? WHERE key=?').run(Buffer.concat([laterPreference, topicEntry('permission_grants_global', laterGrants)]).toString('base64'), TOPIC_KEY);
  assert.equal(restoreMcpPermissions(env, result.backup, { isolated: true }).restored, true);
  const restored = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value;
  assert.deepEqual(fields(Buffer.from(restored, 'base64'))[0].raw, laterPreference);
  assert.deepEqual(getGrants(restored), [[1, 'command(new)'], [9, 'future'], [3, 'mcp(*)'], [2, 'mcp(server/delete)']]);
  assert.equal(db.prepare('SELECT value FROM ItemTable WHERE key=?').get('foreign-auth-row').value, 'RETAIN');
});
