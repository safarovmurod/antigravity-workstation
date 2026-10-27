import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
const { guides, wrap, dimensions } = require('../scripts/build-instructional-animations.cjs');

function gifFrames(bytes) {
  assert.match(bytes.toString('ascii', 0, 6), /^GIF8[79]a$/);
  let pos = 13, count = 0;
  if (bytes[10] & 0x80) pos += 3 * (1 << ((bytes[10] & 7) + 1));
  const skipBlocks = () => { while (true) { const size = bytes[pos++]; assert.notEqual(size, undefined); if (!size) break; pos += size; assert.ok(pos <= bytes.length); } };
  while (pos < bytes.length) {
    const marker = bytes[pos++];
    if (marker === 0x3b) return count;
    if (marker === 0x21) { pos++; skipBlocks(); continue; }
    assert.equal(marker, 0x2c, 'Invalid GIF block');
    const packed = bytes[pos + 8]; pos += 9;
    if (packed & 0x80) pos += 3 * (1 << ((packed & 7) + 1));
    pos++; skipBlocks(); count++;
  }
  assert.fail('GIF has no trailer');
}

test('Seven labelled instructional animations contain moving frames and matching checked MP4 bytes', () => {
  assert.equal(require('../scripts/build-feature-guides.cjs').generate, require('../scripts/build-instructional-animations.cjs').generate,
    'The legacy generator must not overwrite genuine recordings');
  const manifest = require('../docs/feature-guides/instructional-animations.json');
  assert.equal(manifest.type, 'instructional animation, not IDE recording');
  assert.deepEqual(manifest.dimensions, dimensions);
  assert.deepEqual(manifest.guides.map(item => item.id), guides.map(item => item.id));
  for (const guide of manifest.guides) {
    assert.deepEqual(guide.steps, guides.find(item => item.id === guide.id).steps);
    for (const [selection, action, outcome] of guide.steps) {
      assert.ok(wrap(selection, 25).length <= 2 && wrap(action).length <= 3 && wrap(outcome).length <= 3, guide.id + ' text must fit');
    }
    assert.equal(guide.media.length, 2);
    for (const asset of guide.media) {
      const bytes = fs.readFileSync(path.join(root, asset.path));
      assert.equal(bytes.length, asset.bytes);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256);
      if (asset.path.endsWith('.gif')) {
        assert.equal(bytes.readUInt16LE(6), dimensions.width);
        assert.equal(bytes.readUInt16LE(8), dimensions.height);
        assert.equal(gifFrames(bytes), guide.steps.length * 5, 'Each step has four pointer movements and a hold');
      } else {
        assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
        assert.ok(bytes.includes(Buffer.from('moov')) && bytes.includes(Buffer.from('mdat')));
      }
    }
  }
});

test('Panel installation packages every guide, repairs a damaged copy, and refuses missing source media before writing', t => {
  const { build } = require('../scripts/package-git-panel.cjs');
  const { installCustomGithubPanel } = require('../lib/extensions');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-guides-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const source = path.join(base, 'source'), extensions = path.join(base, 'extensions');
  fs.cpSync(path.join(root, 'extensions/git-branch-panel'), source, { recursive: true });
  const packaged = build();
  assert.equal(packaged.pin.version, require('../extensions/git-branch-panel/package.json').version);
  assert.deepEqual(fs.readFileSync(packaged.file), packaged.bytes);
  assert.deepEqual(require('../extensions/git-branch-panel/manifest.json'), packaged.pin);
  for (const guide of guides.filter(item => item.id !== 'aster-appearance')) for (const type of ['gif', 'mp4']) {
    const name = `media/${guide.id}.${type}`;
    assert.equal(packaged.pin.files[name], crypto.createHash('sha256').update(fs.readFileSync(path.join(source, name))).digest('hex'));
  }
  fs.mkdirSync(extensions); fs.writeFileSync(path.join(extensions, 'personal.txt'), 'keep');
  assert.equal(installCustomGithubPanel(null, extensions, source, { isolated: true, log() {} }).success, true);
  const target = path.join(extensions, packaged.pin.id + '-' + packaged.pin.version);
  for (const name of Object.keys(packaged.pin.files).filter(file => file.startsWith('media/'))) {
    assert.deepEqual(fs.readFileSync(path.join(target, name)), fs.readFileSync(path.join(source, name)));
  }
  fs.writeFileSync(path.join(target, 'media/delete-branch.gif'), 'damaged');
  assert.equal(installCustomGithubPanel(null, extensions, source, { isolated: true, log() {} }).success, true);
  assert.deepEqual(fs.readFileSync(path.join(target, 'media/delete-branch.gif')), fs.readFileSync(path.join(source, 'media/delete-branch.gif')));
  assert.equal(fs.readFileSync(path.join(extensions, 'personal.txt'), 'utf8'), 'keep');
  fs.unlinkSync(path.join(source, 'media/current-branch.mp4'));
  const missingTarget = path.join(base, 'missing-target');
  assert.throws(() => installCustomGithubPanel(null, missingTarget, source, { isolated: true, log() {} }), /asset missing/);
  assert.equal(fs.existsSync(missingTarget), false);
  fs.copyFileSync(path.join(root, 'extensions/git-branch-panel/media/current-branch.mp4'), path.join(source, 'media/current-branch.mp4'));
  fs.appendFileSync(path.join(source, 'media/current-branch.gif'), 'tampered');
  assert.throws(() => installCustomGithubPanel(null, missingTarget, source, { isolated: true, log() {} }), /source checksum mismatch/);
  assert.equal(fs.existsSync(missingTarget), false);
});

test('Instructional player catalog is derived from the committed media manifest and all versions retain a recording label', () => {
  const catalog = require('../extensions/workstation-stability/instructional-guides.json');
  const acceptance = require('../docs/INSTRUCTIONAL-MEDIA-ACCEPTANCE.json');
  assert.equal(acceptance.criteria.length, 9);
  assert.deepEqual(acceptance.criteria.slice(0, 8).map(item => item.guide), catalog.map(item => item.id));
  assert.ok(acceptance.criteria.every(item => ['DONE', 'PARTIAL', 'BLOCKED', 'NOT TESTED'].includes(item.status)));
  assert.deepEqual(catalog, require('../scripts/build-instructional-catalog.cjs').build());
  const all = require('../extensions/workstation-stability/guide-player.cjs').guides;
  assert.equal(all.filter(item => item.kind === 'recording').length, 2);
  assert.equal(all.filter(item => item.kind === 'instructional').length, 8);
  const aster = require('../scripts/package-aster.cjs').build();
  assert.deepEqual(fs.readFileSync(aster.file), aster.bytes);
  for (const name of ['media/aster-appearance.gif', 'media/aster-appearance.mp4']) assert.ok(aster.pin.files[name]);
  for (const item of catalog) {
    const folder = item.id === 'aster-appearance' ? 'aster-appearance' : item.id === 'stability-instructional' ? 'workstation-stability' : 'git-branch-panel';
    const readme = fs.readFileSync(path.join(root, 'extensions', folder, 'README.md'), 'utf8');
    assert.ok(readme.includes(item.gifUrl), item.id + ' GIF must be referenced by installed Details');
    assert.ok(readme.includes(item.mp4Url), item.id + ' MP4 must be referenced by installed Details');
  }
});

test('Stability instruction has current conflict and restore steps and checked animated media', () => {
  const guide = require('../docs/feature-guides/stability-instructional.json');
  assert.equal(guide.type, 'instructional animation, not IDE recording');
  assert.deepEqual(guide.steps, require('../scripts/build-stability-instructional.cjs').guide.steps);
  assert.ok(guide.steps.some(step => step.join(' ').includes('restore --dry-run')));
  assert.ok(guide.steps.some(step => step.join(' ').includes('Inspect Project Setting Conflicts (Read Only)')));
  for (const [selection, action, outcome] of guide.steps)
    assert.ok(wrap(selection, 25).length <= 2 && wrap(action).length <= 3 && wrap(outcome).length <= 3);
  for (const asset of guide.media) {
    const bytes = fs.readFileSync(path.join(root, asset.path));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    if (asset.path.endsWith('.gif')) assert.equal(gifFrames(bytes), guide.steps.length * 5);
    else assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
  }
});
