import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { validateNativeHooks, mergeNativeHooks } = require('../lib/native-hooks');
const { runInstaller } = require('../lib/installer');
const { getEnvironmentPaths } = require('../lib/paths');
const { runDoctor } = require('../lib/doctor');
const { restoreBackup } = require('../lib/backup');
const managed = require('../config/hooks.json');

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-native-hooks-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const customRoots = { userProfile: path.join(base, 'User with spaces'), gitBashPath: process.execPath };
  const env = getEnvironmentPaths(customRoots);
  const hooksFile = env.nativeHooksJson;
  const install = repoRoot => runInstaller({ customRoots, repoRoot: repoRoot || root,
    skipExtensions: true, skipAgentBrowser: true, skipFont: true, skipPermissions: true, log() {} });
  return { base, customRoots, env, hooksFile, install };
}

test('Every managed native event uses a command group, including PreInvocation', () => {
  assert.equal(validateNativeHooks(managed), managed);
  const plugin = managed['gsd-antigravity'];
  assert.equal(plugin.enabled, true);
  for (const event of ['PreToolUse', 'PostToolUse', 'PreInvocation']) {
    assert.ok(plugin[event].length > 0);
    assert.ok(plugin[event][0].hooks[0].command.includes('gsd-antigravity-adapter.cjs'));
  }
  const legacy = structuredClone(managed);
  legacy['gsd-antigravity'].PreInvocation = [plugin.PreInvocation[0].hooks[0]];
  assert.throws(() => validateNativeHooks(legacy), /PreInvocation/);
  assert.throws(() => validateNativeHooks({ broken: { PreToolUse: [{ hooks: [{ command: '' }] }] } }), /Invalid native hook command/);
  assert.throws(() => mergeNativeHooks({}, {}), /Managed GSD native hook is missing/);
  const missing = structuredClone(managed);
  missing['gsd-antigravity'].PostToolUse = [];
  assert.throws(() => mergeNativeHooks({}, missing), /PostToolUse/);
});

test('A real update repairs the old native hook shape and preserves personal plugins, exact backup and repeat', t => {
  const f = fixture(t);
  assert.equal(f.install().success, true);
  const previous = JSON.parse(fs.readFileSync(f.hooksFile));
  previous['gsd-antigravity'].PreInvocation = [previous['gsd-antigravity'].PreInvocation[0].hooks[0]];
  previous.personal = { enabled: true, Stop: [{ hooks: [{ type: 'command', command: 'echo personal' }] }] };
  const bytes = JSON.stringify(previous, null, 2);
  fs.writeFileSync(f.hooksFile, bytes);
  const update = f.install();
  assert.equal(update.success, true, update.failures?.join('; '));
  assert.equal(fs.readFileSync(path.join(update.backupInfo.backupDir, 'native-hooks.json'), 'utf8'), bytes);
  const current = JSON.parse(fs.readFileSync(f.hooksFile));
  assert.deepEqual(current.personal, previous.personal);
  validateNativeHooks(current);
  assert.ok(current['gsd-antigravity'].PreInvocation[0].hooks[0].command.includes(f.env.nodeExe.replace(/\\/g, '/')));
  const doctor = runDoctor({ customRoots: f.customRoots, log() {} });
  assert.equal(doctor.checks.find(x => x.name === 'config/hooks.json').status, 'pass');
  const after = fs.readFileSync(f.hooksFile);
  const repeated = f.install();
  assert.equal(repeated.success, true);
  assert.equal(repeated.backupInfo, null);
  assert.deepEqual(fs.readFileSync(f.hooksFile), after);
});

test('An explicit native hook disable is preserved and Doctor reports its inactive state', t => {
  const f = fixture(t);
  assert.equal(f.install().success, true);
  const current = JSON.parse(fs.readFileSync(f.hooksFile));
  current['gsd-antigravity'].enabled = false;
  fs.writeFileSync(f.hooksFile, JSON.stringify(current, null, 2));
  assert.equal(f.install().success, true);
  assert.equal(JSON.parse(fs.readFileSync(f.hooksFile))['gsd-antigravity'].enabled, false);
  const doctor = runDoctor({ customRoots: f.customRoots, log() {} });
  assert.equal(doctor.checks.find(x => x.name === 'GSD native hooks enabled').status, 'warn');
  assert.equal(mergeNativeHooks(current, managed)['gsd-antigravity'].enabled, false);
});

test('A structurally invalid source hook stops before backup or any profile change', t => {
  const f = fixture(t), source = path.join(f.base, 'Invalid source');
  for (const folder of ['config', 'rules']) fs.cpSync(path.join(root, folder), path.join(source, folder), { recursive: true });
  for (const folder of ['skills', 'scripts']) fs.mkdirSync(path.join(source, folder));
  const bad = structuredClone(managed);
  bad['gsd-antigravity'].PreInvocation = [managed['gsd-antigravity'].PreInvocation[0].hooks[0]];
  fs.writeFileSync(path.join(source, 'config/hooks.json'), JSON.stringify(bad));
  fs.mkdirSync(path.dirname(f.env.settingsJson), { recursive: true });
  fs.writeFileSync(f.env.settingsJson, '{"personal":true}');
  assert.throws(() => f.install(source), /PreInvocation/);
  assert.equal(fs.readFileSync(f.env.settingsJson, 'utf8'), '{"personal":true}');
  assert.equal(fs.existsSync(f.env.backupsDir), false);
  assert.equal(fs.existsSync(f.env.argvJson), false);
});

test('Legacy hooks migrate to the actual native location; native personal definitions win and both originals restore exactly', t => {
  const f = fixture(t), legacyFile = path.join(f.env.geminiConfigDir, 'hooks.json');
  const plugin = command => ({ Stop: [{ hooks: [{ command }] }] });
  const legacy = JSON.stringify({ legacyPersonal: plugin('echo legacy'), shared: plugin('echo old'), 'gsd-antigravity': { enabled: false } });
  const native = JSON.stringify({ shared: plugin('echo current'), nativePersonal: plugin('echo native') });
  fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
  fs.mkdirSync(path.dirname(f.hooksFile), { recursive: true });
  fs.writeFileSync(legacyFile, legacy);
  fs.writeFileSync(f.hooksFile, native);
  const result = f.install();
  assert.equal(result.success, true);
  const installed = JSON.parse(fs.readFileSync(f.hooksFile));
  assert.deepEqual(installed.shared, plugin('echo current'));
  assert.deepEqual(installed.legacyPersonal, plugin('echo legacy'));
  assert.deepEqual(installed.nativePersonal, plugin('echo native'));
  assert.equal(installed['gsd-antigravity'].enabled, false);
  assert.equal(fs.readFileSync(legacyFile, 'utf8'), legacy);
  assert.equal(fs.readFileSync(path.join(result.backupInfo.backupDir, 'native-hooks.json'), 'utf8'), native);
  assert.equal(fs.readFileSync(path.join(result.backupInfo.backupDir, 'hooks.json'), 'utf8'), legacy);
  assert.equal(f.install().backupInfo, null);
  restoreBackup(result.backupInfo.backupDir, f.env);
  assert.equal(fs.readFileSync(f.hooksFile, 'utf8'), native);
  assert.equal(fs.readFileSync(legacyFile, 'utf8'), legacy);
});

test('Legacy-only migration creates the native file once and rollback removes precisely that new file', t => {
  const f = fixture(t), legacyFile = path.join(f.env.geminiConfigDir, 'hooks.json');
  const previous = JSON.stringify({ 'gsd-antigravity': { PreInvocation: [{ command: 'retired bare command' }] } });
  fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
  fs.writeFileSync(legacyFile, previous);
  assert.equal(fs.existsSync(f.hooksFile), false);
  const result = f.install();
  assert.equal(result.success, true);
  validateNativeHooks(JSON.parse(fs.readFileSync(f.hooksFile)));
  assert.equal(f.install().backupInfo, null);
  restoreBackup(result.backupInfo.backupDir, f.env);
  assert.equal(fs.existsSync(f.hooksFile), false);
  assert.equal(fs.readFileSync(legacyFile, 'utf8'), previous);
});

test('An invalid personal native hook is retained and stops setup before any mutation', t => {
  const f = fixture(t), before = '{"personal":{"Stop":[{"command":"bare invalid group"}]}}';
  fs.mkdirSync(path.dirname(f.hooksFile), { recursive: true });
  fs.writeFileSync(f.hooksFile, before);
  assert.throws(() => f.install(), /personal.Stop/);
  assert.equal(fs.readFileSync(f.hooksFile, 'utf8'), before);
  assert.equal(fs.existsSync(f.env.settingsJson), false);
  assert.equal(fs.existsSync(f.env.backupsDir), false);
});
