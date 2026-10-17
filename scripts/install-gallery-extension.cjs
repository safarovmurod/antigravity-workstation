'use strict';

const fs = require('node:fs');
const { inflateRawSync } = require('node:zlib');
const { createHash } = require('node:crypto');

function readVsixManifest(bytes, expectedId, expectedVersion) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0) throw new Error('Invalid or truncated VSIX archive');
  const entries = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16), manifest;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid VSIX directory');
    const size = bytes.readUInt32LE(offset + 20), length = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end) throw new Error('Invalid VSIX entry');
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === 'extension/package.json') {
      if (manifest || length > 1024 * 1024 || (bytes.readUInt16LE(offset + 8) & 1)) throw new Error('Invalid VSIX manifest entry');
      const local = bytes.readUInt32LE(offset + 42);
      if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid VSIX local header');
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      if (start + size > bytes.readUInt32LE(end + 16)) throw new Error('Truncated VSIX manifest');
      const compressed = bytes.subarray(start, start + size), method = bytes.readUInt16LE(offset + 10);
      const content = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 1024 * 1024 }) : null;
      if (!content || content.length !== length) throw new Error('Invalid VSIX manifest size or compression');
      let crc = 0xffffffff;
      for (const byte of content) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
      if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32LE(offset + 16)) throw new Error('VSIX manifest checksum mismatch');
      manifest = JSON.parse(content.toString('utf8'));
    }
    offset = next;
  }
  if (!manifest || `${manifest.publisher}.${manifest.name}`.toLowerCase() !== expectedId.toLowerCase()
    || !/^\d+\.\d+\.\d+(?:[-+][0-9a-z.+-]+)?$/i.test(manifest.version)
    || (expectedVersion && manifest.version !== expectedVersion)) throw new Error('Downloaded VSIX identity or version mismatch');
  return manifest;
}

async function downloadExtension(id, version, file, fetchImpl = fetch) {
  if (!/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i.test(id) || !/^(?:latest|\d+\.\d+\.\d+)$/.test(version)) throw new Error('Invalid extension request');
  const [publisher, name] = id.split('.');
  let url = new URL(`https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${name}/${version}/vspackage`);
  let response;
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (url.protocol !== 'https:' || !(url.hostname === 'marketplace.visualstudio.com' || url.hostname.endsWith('.vsassets.io'))) throw new Error('Unsupported Marketplace redirect');
    response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(90000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 5) throw new Error('Invalid Marketplace redirect');
      url = new URL(location, url);
    } else break;
  }
  if (!response.ok) throw new Error(`Microsoft Marketplace returned HTTP ${response.status} for ${id}@${version}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 128 * 1024 * 1024) throw new Error('VSIX download exceeds size limit');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const manifest = readVsixManifest(bytes, id, version === 'latest' ? undefined : version);
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  return { id, version: manifest.version, sha256: createHash('sha256').update(bytes).digest('hex') };
}

module.exports = { readVsixManifest, downloadExtension };
if (require.main === module) {
  downloadExtension(...process.argv.slice(2)).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
