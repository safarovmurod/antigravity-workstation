import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { formatConflictReport } = require('../extensions/workstation-stability/profile.cjs');

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
