import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
