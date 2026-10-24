'use strict';

// Isolated child fixture: a valid ZIP with a large self-extracting prefix.
// The generated network chunks are independent and never retained by the source.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const helper = process.argv[3] || path.resolve(__dirname, '../scripts/install-gallery-extension.cjs');
const { downloadExtension } = require(helper);
const padding = 96 * 1024 * 1024;
const archive = fs.readFileSync(path.resolve(__dirname, '../extensions/calm-typescript/calm-typescript-3.3.2.vsix'));
const end = archive.length - 22;
assert.equal(archive.readUInt32LE(end), 0x06054b50);
let offset = archive.readUInt32LE(end + 16);
archive.writeUInt32LE(offset + padding, end + 16);
while (offset < end) {
  assert.equal(archive.readUInt32LE(offset), 0x02014b50);
  archive.writeUInt32LE(archive.readUInt32LE(offset + 42) + padding, offset + 42);
  offset += 46 + archive.readUInt16LE(offset + 28) + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32);
}
const hash = createHash('sha256'), baseline = process.resourceUsage().maxRSS;
const file = path.join(process.argv[2], 'large.vsix');
async function* chunks() {
  for (let written = 0; written < padding; written += 65536) {
    const chunk = Buffer.alloc(65536);
    hash.update(chunk); yield chunk;
  }
  hash.update(archive); yield archive;
}
downloadExtension('workstation.calm-typescript', '3.3.2', file, async () => ({ ok: true, status: 200, body: chunks() }))
  .then(result => {
    assert.equal(result.sha256, hash.digest('hex'));
    assert.equal(fs.statSync(file).size, padding + archive.length);
    console.log(JSON.stringify({ passed: true, bytes: padding + archive.length,
      peakRssGrowthBytes: (process.resourceUsage().maxRSS - baseline) * 1024, version: result.version }));
  }).catch(error => { console.error(error.stack); process.exitCode = 1; });
