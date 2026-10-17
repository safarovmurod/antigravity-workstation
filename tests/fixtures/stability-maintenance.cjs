'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TARGETS, digest, patchSource, runMaintenance } = require('../../extensions/mansur-antigravity-stability/maintenance.cjs');
const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'stability-maintenance-'));
process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
// Small original fixtures exercise filesystem behavior without redistributing vendor bundles.
const snapshots = ["class Decorations {\n    parse(input) {\n        const plugins = [];\n        const ast = babelParser.parse(input.getText(), {\n            plugins,\n        });\n        return ast;\n    }\n    update() {\n        if (!this.activeEditor) { return; }\n    }\n    dispose() {\n        this.activeEditor = undefined;\n    }\n}\n","let d={},c=\"\";function listener(e){const s=e.document.getText(),m=[];let v=0;return s;}\n"].map(text => Buffer.from(text));
for (const [index, target] of TARGETS.entries()) {
  target.originalHash = digest(snapshots[index]);
  target.patchedHash = digest(patchSource(target, snapshots[index].toString('utf8')));
}
let nextFixture = 1;
const results = [];

function fixture(ids = TARGETS.map((target) => target.id)) {
  const directory = path.join(root, String(nextFixture++));
  const extensionsDir = path.join(directory, 'extensions');
  const backupDir = path.join(directory, 'backups');
  fs.mkdirSync(extensionsDir, { recursive: true });
  const entries = [];
  const files = {};
  for (const [index, target] of TARGETS.entries()) {
    if (!ids.includes(target.id)) continue;
    const relativeLocation = target.id + '-' + target.version + '-universal';
    const extensionDir = path.join(extensionsDir, relativeLocation);
    const file = path.join(extensionDir, target.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const split = target.id.indexOf('.');
    fs.writeFileSync(path.join(extensionDir, 'package.json'), JSON.stringify({ publisher: target.id.slice(0, split), name: target.id.slice(split + 1), version: target.version }));
    fs.writeFileSync(file, snapshots[index]);
    entries.push({ identifier: { id: target.id }, version: target.version, relativeLocation });
    files[target.id] = file;
  }
  const unrelatedDir = path.join(extensionsDir, 'unrelated.extension-1.0.0');
  fs.mkdirSync(unrelatedDir);
  const unrelated = path.join(unrelatedDir, 'untouched.txt');
  fs.writeFileSync(unrelated, 'keep unrelated working data');
  entries.push({ identifier: { id: 'unrelated.extension' }, version: '1.0.0', relativeLocation: 'unrelated.extension-1.0.0' });
  fs.writeFileSync(path.join(extensionsDir, 'extensions.json'), JSON.stringify(entries));
  return { extensionsDir, backupDir, files, entries, unrelated };
}

function find(result, id = TARGETS[0].id) { return result.targets.find((target) => target.id === id); }
function saveIndex(data) { fs.writeFileSync(path.join(data.extensionsDir, 'extensions.json'), JSON.stringify(data.entries)); }
function check(name, run) { run(); results.push({ name, result: 'PASS' }); }

check('Synthetic fixture hashes and exact replacement hashes match', () => {
  for (const [index, target] of TARGETS.entries()) {
    const original = snapshots[index];
    assert.equal(digest(original), target.originalHash);
    assert.equal(digest(patchSource(target, original.toString('utf8'))), target.patchedHash);
  }
});

check('Default status is read-only and creates no backup', () => {
  const data = fixture();
  const result = runMaintenance(data);
  assert.equal(result.changed, false);
  for (const target of TARGETS) {
    assert.equal(find(result, target.id).status, 'repair_available');
    assert.equal(digest(fs.readFileSync(data.files[target.id])), target.originalHash);
  }
  assert.equal(fs.existsSync(data.backupDir), false);
});

check('Repair patches exactly two known originals and validates final hashes', () => {
  const data = fixture();
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(result.changed, true);
  assert.equal(result.reloadRecommended, true);
  for (const target of TARGETS) {
    assert.equal(find(result, target.id).status, 'repaired');
    assert.equal(digest(fs.readFileSync(data.files[target.id])), target.patchedHash);
    assert.equal(digest(fs.readFileSync(find(result, target.id).backup)), target.originalHash);
  }
  assert.equal(fs.readFileSync(data.unrelated, 'utf8'), 'keep unrelated working data');
});

check('Second repair is idempotent: protected, no write, no additional backup', () => {
  const data = fixture();
  runMaintenance({ ...data, repair: true });
  const before = TARGETS.map((target) => fs.statSync(data.files[target.id]).mtimeMs);
  const backups = fs.readdirSync(data.backupDir);
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(result.changed, false);
  assert.equal(result.reviewRequired, false);
  assert.deepEqual(result.targets.map((target) => target.status), ['protected', 'protected']);
  assert.deepEqual(TARGETS.map((target) => fs.statSync(data.files[target.id]).mtimeMs), before);
  assert.deepEqual(fs.readdirSync(data.backupDir), backups);
});

check('Same-version reinstall of known original is repaired using existing verified backup', () => {
  const data = fixture();
  runMaintenance({ ...data, repair: true });
  fs.writeFileSync(data.files[TARGETS[0].id], snapshots[0]);
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(find(result).status, 'repaired');
  assert.equal(find(result, TARGETS[1].id).status, 'protected');
  assert.equal(fs.readdirSync(data.backupDir).length, 2);
});

check('Unknown future version is reported and never patched', () => {
  const data = fixture([TARGETS[0].id]);
  const manifestFile = path.join(path.dirname(path.dirname(data.files[TARGETS[0].id])), 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.version = '2.0.0';
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  data.entries[0].version = '2.0.0';
  saveIndex(data);
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(find(result).reason, 'unknown_version');
  assert.equal(digest(fs.readFileSync(data.files[TARGETS[0].id])), TARGETS[0].originalHash);
  assert.equal(fs.existsSync(data.backupDir), false);
});

check('Unknown same-version source hash is reported and never overwritten', () => {
  const data = fixture([TARGETS[0].id]);
  fs.appendFileSync(data.files[TARGETS[0].id], '\n// unknown vendor or user change\n');
  const before = digest(fs.readFileSync(data.files[TARGETS[0].id]));
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(find(result).reason, 'unknown_source_hash');
  assert.equal(digest(fs.readFileSync(data.files[TARGETS[0].id])), before);
  assert.equal(fs.existsSync(data.backupDir), false);
});

check('Active install index is used; obsolete known folder is not blindly patched', () => {
  const data = fixture([TARGETS[0].id]);
  const oldFile = data.files[TARGETS[0].id];
  const newLocation = TARGETS[0].id + '-2.0.0-universal';
  const newDirectory = path.join(data.extensionsDir, newLocation);
  fs.mkdirSync(path.join(newDirectory, 'out'), { recursive: true });
  fs.writeFileSync(path.join(newDirectory, TARGETS[0].file), snapshots[0]);
  fs.writeFileSync(path.join(newDirectory, 'package.json'), JSON.stringify({ publisher: 'anteprimorac', name: 'html-end-tag-labels', version: '2.0.0' }));
  data.entries[0] = { identifier: { id: TARGETS[0].id }, version: '2.0.0', relativeLocation: newLocation };
  saveIndex(data);
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(find(result).reason, 'unknown_version');
  assert.equal(digest(fs.readFileSync(oldFile)), TARGETS[0].originalHash);
});

check('Traversal path in extension index is rejected without writes', () => {
  const data = fixture([TARGETS[0].id]);
  data.entries[0].relativeLocation = '../outside';
  saveIndex(data);
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(find(result).reason, 'unsafe_relative_location');
  assert.equal(fs.existsSync(data.backupDir), false);
});

check('Duplicate active target entries require review', () => {
  const data = fixture([TARGETS[0].id]);
  data.entries.push({ ...data.entries[0] });
  saveIndex(data);
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(find(result).reason, 'ambiguous_installed_entries');
  assert.equal(fs.existsSync(data.backupDir), false);
});

check('Manifest identity mismatch is rejected', () => {
  const data = fixture([TARGETS[0].id]);
  const manifestFile = path.join(path.dirname(path.dirname(data.files[TARGETS[0].id])), 'package.json');
  fs.writeFileSync(manifestFile, JSON.stringify({ publisher: 'other', name: 'extension', version: '1.0.0' }));
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(find(result).reason, 'manifest_id_mismatch');
  assert.equal(fs.existsSync(data.backupDir), false);
});

check('Existing backup conflict aborts repair and preserves both files', () => {
  const data = fixture([TARGETS[0].id]);
  fs.mkdirSync(data.backupDir);
  const target = TARGETS[0];
  const backup = path.join(data.backupDir, target.id + '-' + target.version + '-' + target.originalHash.slice(0, 12) + '.js');
  fs.writeFileSync(backup, 'keep existing backup');
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(find(result).reason, 'backup_conflict');
  assert.equal(fs.readFileSync(backup, 'utf8'), 'keep existing backup');
  assert.equal(digest(fs.readFileSync(data.files[target.id])), target.originalHash);
});

check('Updater source change before replacement aborts and is preserved', () => {
  const data = fixture([TARGETS[0].id]);
  const result = runMaintenance({ ...data, repair: true, beforeReplace({ file }) { fs.appendFileSync(file, '\n// changed while helper was scanning\n'); } });
  assert.equal(find(result).reason, 'changed_during_scan');
  assert.equal(fs.readFileSync(data.files[TARGETS[0].id], 'utf8').endsWith('// changed while helper was scanning\n'), true);
  assert.equal(fs.readdirSync(path.dirname(data.files[TARGETS[0].id])).some((name) => name.includes('.mansur-maintenance-')), false);
});

check('Updater manifest/index version change before replacement aborts', () => {
  const data = fixture([TARGETS[0].id]);
  const result = runMaintenance({ ...data, repair: true, beforeReplace() {
    data.entries[0].version = '2.0.0';
    saveIndex(data);
  } });
  assert.equal(find(result).reason, 'changed_during_scan');
  assert.equal(digest(fs.readFileSync(data.files[TARGETS[0].id])), TARGETS[0].originalHash);
});

check('Malformed install index is reported without guessing directories', () => {
  const data = fixture();
  fs.writeFileSync(path.join(data.extensionsDir, 'extensions.json'), '{invalid');
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(result.reviewRequired, true);
  assert.equal(result.targets.every((target) => target.reason === 'extensions_index_unavailable_or_invalid'), true);
  assert.equal(fs.existsSync(data.backupDir), false);
});

check('Absent target extensions are harmless no-op', () => {
  const data = fixture([]);
  const result = runMaintenance({ ...data, repair: true });
  assert.equal(result.changed, false);
  assert.equal(result.reviewRequired, false);
  assert.equal(result.targets.every((target) => target.status === 'not_installed'), true);
});

check('CLI status reports synthetic code as unknown and remains read-only', () => {
  const data = fixture();
  const processResult = spawnSync(process.execPath, [path.resolve(__dirname, '../../extensions/mansur-antigravity-stability/maintenance.cjs'), '--extensions-dir', data.extensionsDir, '--backup-dir', data.backupDir], { encoding: 'utf8', timeout: 6000, windowsHide: true });
  assert.equal(processResult.status, 2);
  assert.equal(JSON.parse(processResult.stdout).mode, 'status');
  assert.equal(fs.existsSync(data.backupDir), false);
});

check('CLI returns review status for unknown code rather than overwriting', () => {
  const data = fixture([TARGETS[0].id]);
  fs.appendFileSync(data.files[TARGETS[0].id], '\n// newer code\n');
  const before = digest(fs.readFileSync(data.files[TARGETS[0].id]));
  const processResult = spawnSync(process.execPath, [path.resolve(__dirname, '../../extensions/mansur-antigravity-stability/maintenance.cjs'), '--repair', '--extensions-dir', data.extensionsDir, '--backup-dir', data.backupDir], { encoding: 'utf8', timeout: 6000, windowsHide: true });
  assert.equal(processResult.status, 2);
  assert.equal(JSON.parse(processResult.stdout).reviewRequired, true);
  assert.equal(digest(fs.readFileSync(data.files[TARGETS[0].id])), before);
});

const report = { scope: 'isolated work fixtures only', fixtureRoot: root, passed: results.length, checks: results };
console.log(JSON.stringify(report, null, 2));
