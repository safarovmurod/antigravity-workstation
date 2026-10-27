import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { scan, audit } = require('../scripts/audit-configuration.cjs');

test('Configuration audit detects equivalent duplicate keys within each object, including JSONC', () => {
  const result = scan('{\n // comment\n "a": 1, "nest": {"a": [], "a": {}}, "\\u0061": 2,\n}');
  assert.deepEqual(result.duplicates, [{ path: '$["nest"]["a"]', firstLine: 3, line: 3 }, { path: '$["a"]', firstLine: 3, line: 3 }]);
  assert.deepEqual(result.empty, [{ path: '$["nest"]["a"]', type: 'array' }, { path: '$["nest"]["a"]', type: 'object' }]);
  assert.deepEqual(scan('{"a":1,"nested":{"a":2}}').duplicates, []);
  assert.throws(() => scan('{"missing":}'), /JSON/);
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
