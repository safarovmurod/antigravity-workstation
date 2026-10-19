import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { typeScriptMemoryLimit, inspectResources, preflightResources } = require('../lib/system-resources');
const MIB = 1024 * 1024, GIB = 1024 * MIB;
const env = { userSettingsDir: path.join(os.tmpdir(), 'owned-resource-fixture', 'User'),
  extensionsDir: path.join(os.tmpdir(), 'owned-resource-fixture', 'extensions'),
  backupsDir: path.join(os.tmpdir(), 'owned-resource-fixture', 'backups') };
function runtime(overrides = {}) {
  return { totalmem: () => 4 * GIB, freemem: () => 2 * GIB, existsSync: () => true,
    statfsSync: () => ({ bavail: 10000000n, bsize: 4096n }), ...overrides };
}

test('Small and large RAM configurations receive bounded TypeScript heaps instead of the same 4 GiB cap', () => {
  for (const [gib, wanted] of [[1, 256], [2, 512], [4, 1024], [8, 2048], [16, 4096], [64, 4096]]) {
    assert.equal(typeScriptMemoryLimit(gib * GIB), wanted, gib + ' GiB RAM');
  }
  for (const unknown of [NaN, Infinity, 0, -1]) assert.equal(typeScriptMemoryLimit(unknown), 1024);
});

test('Low available RAM and storage warn without selecting a reduced extension profile or disabling features', () => {
  const report = inspectResources(env, runtime({ freemem: () => 128 * MIB, statfsSync: () => ({ bavail: 32000n, bsize: 4096n }) }));
  assert.equal(report.typeScriptMemoryMiB, 1024);
  assert.ok(report.warnings.some(value => value.includes('RAM')));
  assert.ok(report.warnings.some(value => value.includes('disk space')));
  assert.ok(report.storage.length >= 2);
  assert.equal(Object.hasOwn(report, 'extensionProfile'), false);
});

test('A full destination disk fails the read-only resource preflight before the installer can write a profile', () => {
  let messages = 0;
  assert.throws(() => preflightResources(env, { log() { messages++; }, runtime: runtime({ statfsSync: () => ({ bavail: 0n, bsize: 4096n }) }) }), /No available disk space/);
  assert.equal(messages, 0);
});

test('Unavailable disk counters are reported honestly rather than misclassifying the computer model', () => {
  const report = inspectResources(env, runtime({ statfsSync() { throw new Error('Access denied'); } }));
  assert.equal(report.storage.length, 0);
  assert.ok(report.warnings.every(value => value.includes('could not be determined')));
});
