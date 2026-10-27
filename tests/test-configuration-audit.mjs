import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { scan, audit, inventoryValues, inventory } = require('../scripts/audit-configuration.cjs');

test('Configuration audit detects equivalent duplicate keys within each object, including JSONC', () => {
  const result = scan('{\n // comment\n "a": 1, "nest": {"a": [], "a": {}}, "\\u0061": 2,\n}');
  assert.deepEqual(result.duplicates, [{ path: '$["nest"]["a"]', firstLine: 3, line: 3 }, { path: '$["a"]', firstLine: 3, line: 3 }]);
  assert.deepEqual(result.empty, [{ path: '$["nest"]["a"]', type: 'array' }, { path: '$["nest"]["a"]', type: 'object' }]);
  assert.deepEqual(scan('{"a":1,"nested":{"a":2}}').duplicates, []);
  assert.throws(() => scan('{"missing":}'), /JSON/);
});

test('Inventory lists source JSON values and empty defaults without claiming runtime validation', () => {
  const report = inventory();
  assert.equal(report.files, audit().files);
  assert.equal(report.values, report.entries.length);
  assert.ok(report.values > 266);
  assert.ok(report.entries.every(entry => entry.runtimeValidation === 'NOT ASSESSED BY INVENTORY'));
  assert.ok(report.entries.some(entry => entry.file === 'config/settings.json' && entry.pointer === '/editor.tokenColorCustomizations' && entry.type === 'object' && entry.entries === 0));
  assert.ok(report.entries.some(entry => entry.file === 'config/settings.json' && entry.pointer === '/errorLens.excludeByMessage' && entry.type === 'array' && entry.entries === 0));
  assert.ok(report.entries.some(entry => entry.file === 'config/settings.json' && entry.pointer === '/editor.fontSize' && entry.type === 'number'));
  const example = inventoryValues('fixture.json', { 'a/b~c': [null, {}, []] });
  assert.deepEqual(example.map(entry => [entry.pointer, entry.type]), [['', 'object'], ['/a~1b~0c', 'array'], ['/a~1b~0c/0', 'null'], ['/a~1b~0c/1', 'object'], ['/a~1b~0c/2', 'array']]);
  const cli = JSON.parse(execFileSync(process.execPath, [require.resolve('../scripts/audit-configuration.cjs'), '--inventory'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  assert.deepEqual(cli, report);
});

test('Source configuration has no invalid JSON or duplicate keys; neutral defaults remain present', () => {
  const report = audit();
  assert.ok(report.files > 20);
  assert.deepEqual(report.invalid, []);
  assert.deepEqual(report.duplicates, []);
  for (const [file, key, type] of [
    ['config/settings.json', '$["editor.tokenColorCustomizations"]', 'object'],
    ['config/settings.json', '$["errorLens.excludeBySource"]', 'array'],
    ['config/settings.json', '$["errorLens.excludeByMessage"]', 'array'],
    ['config/mcp/active.template.json', '$["mcpServers"]["chrome-devtools-mcp"]["env"]', 'object'],
    ['config/jelly-cursor/jelly-cursor-state.template.json', '$["history"]', 'array'],
    ['extensions/workstation-stability/package.json', '$["contributes"]["configuration"]["properties"]["workstationStability.autoUpdateExcludedExtensions"]["default"]', 'array'],
  ]) assert.ok(report.empty.some(item => item.file === file && item.path === key && item.type === type), key);
});
