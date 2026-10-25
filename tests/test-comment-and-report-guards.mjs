import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isProtectedComment } = require('../scripts/clean-owned-comments.cjs');
const { formatConflictReport } = require('../extensions/workstation-stability/profile.cjs');

test('PowerShell cleanup preserves its compiler directive and exact source hashes after executable-token proof', () => {
  const { createHash } = require('node:crypto');
  const root = path.resolve(import.meta.dirname, '..');
  const ledger = require('../docs/OWNED-POWERSHELL-COMMENT-CLEANUP.json');
  assert.equal(ledger.tokenEquivalent, true); assert.equal(ledger.removed, 101); assert.equal(ledger.files.length, 9);
  assert.ok(ledger.preserved.some(item => item.text === '#Requires -Version 5.1'));
  assert.ok(fs.readFileSync(path.join(root, 'extensions/git-branch-panel/install-github-panel.ps1'), 'utf8').startsWith('#Requires -Version 5.1'));
  for (const file of ledger.files) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, file.file))).digest('hex'), file.afterSha256);
});

test('Comment cleanup retains interpreter selection even when the parser omits #! from its comment value', () => {
  const source = '#!/usr/bin/env node\nprocess.exit(0);\n';
  assert.equal(isProtectedComment(source, { start: 0, end: 19, value: '/usr/bin/env node' }), true);
  for (const value of ['@license MIT', '@ts-check', '@type {number}', '# sourceMappingURL=x', 'istanbul ignore next'])
    assert.equal(isProtectedComment('/*' + value + '*/', { start: 0, end: value.length + 4, value }), true);
  assert.equal(isProtectedComment('// ordinary explanation', { start: 0, end: 23, value: ' ordinary explanation' }), false);
  for (const value of ['before returning packages', 'API returns a wrapper', 'webpack files are temporary'])
    assert.equal(isProtectedComment('//' + value, { start: 0, end: value.length + 2, value }), false);
  for (const value of ['@returns {number}', 'webpackChunkName: "fixture"'])
    assert.equal(isProtectedComment('/*' + value + '*/', { start: 0, end: value.length + 4, value }), true);
});

test('Actual CLI hashbang selects Node when executed by the OS', { skip: process.platform === 'win32' }, t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-shebang-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const header = fs.readFileSync(path.resolve(import.meta.dirname, '../bin/workstation-setup.js'), 'utf8').split('\n')[0];
  const probe = path.join(base, 'interpreter-probe');
  fs.writeFileSync(probe, header + '\nprocess.stdout.write("NODE_INTERPRETER_OK");\n', { mode: 0o700 });
  assert.equal(execFileSync(probe, [], { encoding: 'utf8' }), 'NODE_INTERPRETER_OK');
});

test('Readable conflict report deduplicates equivalent language contexts without hiding exact source or values', () => {
  const conflict = { key: 'editor.fontSize', scope: 'workspace', source: 'C:\\Fixture with spaces\\.vscode\\settings.json',
    expected: 20, actual: 21, active: true, selector: null };
  const result = { conflicts: [{ ...conflict, languageId: 'typescript' }, { ...conflict, languageId: 'javascript' }], readErrors: [] };
  const original = JSON.stringify(result), report = formatConflictReport(result);
  assert.match(report, /Active setting conflicts: 1/);
  assert.ok(report.includes(conflict.source));
  assert.match(report, /Current: 21\nManaged: 20/);
  assert.match(report, /No project settings or code were changed/);
  assert.equal(JSON.stringify(result), original);
});
