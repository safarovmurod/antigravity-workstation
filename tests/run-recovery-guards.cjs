'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const bundle = process.env.WORKSTATION_ANTIGRAVITY_MAIN;
if (!bundle || !fs.existsSync(bundle)) {
  throw new Error('Recovery guard verification requires WORKSTATION_ANTIGRAVITY_MAIN from the audited official IDE; skipping this case is not a passing result');
}
const output = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-recovery-guards-'));
fs.mkdirSync(output, { recursive: true });
const reportFile = path.join(output, 'recovery-guards.xml');
const pattern = 'Backup rejects a linked skill inventory|Restore rejects dangling destination links|Linked settings are rejected|A real detached recovery';
const result = spawnSync(process.execPath, ['--test', '--test-name-pattern=' + pattern,
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=junit', '--test-reporter-destination=' + reportFile,
  ...['test-audit-regressions.mjs', 'test-quiet-completion.mjs', 'test-setup-status.mjs'].map(file => path.join(__dirname, file))],
{ cwd: root, windowsHide: true, stdio: 'inherit', timeout: 120000 });
if (result.error) throw result.error;
assert.equal(result.status, 0, 'Linked-path and detached-worker checks must pass');
const xml = fs.readFileSync(reportFile, 'utf8');
const count = tag => (xml.match(new RegExp('<' + tag + '(?:\\s|/|>)', 'g')) || []).length;
assert.equal(count('testcase'), 4, 'Exactly the four previously skipped cases must run');
assert.equal(count('skipped'), 0, 'None of the four regression cases may be skipped');
assert.equal(count('failure') + count('error'), 0, 'None of the four regression cases may fail');
const report = { passed: true, testedAt: new Date().toISOString(), platform: process.platform,
  architecture: process.arch, tests: 4, passedCount: 4, failed: 0, skipped: 0,
  linkedPaths: process.platform === 'win32' ? 'Actual NTFS junctions, including an absent target; no admin or Developer Mode required' : 'Actual filesystem symbolic links',
  recovery: 'Real detached Node worker and SQLite changes; only its OS process-inventory response is a test fixture',
  personalIdeProfileChanged: false };
fs.writeFileSync(path.join(output, 'recovery-guards.json'), JSON.stringify(report, null, 2) + '\n');
console.log('PASS: all four recovery/link regressions executed; 4 passed, 0 failed, 0 skipped.');
