'use strict';

const fs = require('node:fs');
const { inflateRawSync } = require('node:zlib');
const { createHash } = require('node:crypto');

// The Marketplace uses the same small engine-range grammar as VS Code's
// extensionValidator: exact versions, x wildcards, ^ and >=. Unknown syntax is
// rejected; the IDE CLI remains the final compatibility authority.
function engineCompatible(engine, version, date) {
  if (engine === '*') return true;
  if (typeof engine !== 'string' || typeof version !== 'string') return false;
  const current = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  const wanted = /^(\^|>=)?(\d+|x)\.(\d+|x)\.(\d+|x)(?:-(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?|-[0-9a-z.-]+)?$/i.exec(engine.trim());
  if (!current || !wanted) return false;
  const actual = current.slice(1).map(Number), required = wanted.slice(2, 5).map(n => n === 'x' ? 0 : Number(n));
  const exact = wanted.slice(2, 5).map(n => n !== 'x');
  if (!exact[0] || (required[0] === 0 && !exact[1])) return false;
  if (wanted[1] === '^') { exact[2] = false; if (required[0] !== 0) exact[1] = false; }
  if (actual[0] === 1 && required[0] === 0 && wanted[1] !== '>=' && exact.some(value => !value)) {
    required.splice(0, 3, 1, 0, 0); exact.splice(0, 3, true, false, false);
  }
  for (let index = 0; index < 3; index++) {
    if (actual[index] < required[index]) return false;
    if (actual[index] > required[index]) return wanted[1] === '>=' || !exact[index];
  }
  if (wanted[5] && date) {
    const notBefore = Date.UTC(Number(wanted[5]), Number(wanted[6]) - 1, Number(wanted[7]), Number(wanted[8] || 0), Number(wanted[9] || 0));
    if (new Date(date).getTime() < notBefore) return false;
  }
  return true;
}

function selectCompatibleVersion(extension, target) {
  if (!target || !/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(target.version)
    || !/^win32-(?:x64|arm64)$/.test(target.platform)) throw new Error('Invalid IDE compatibility target');
  const versions = (extension.versions || []).filter(item => {
    const property = name => item.properties?.find(value => value.key === name)?.value;
    return /^\d+\.\d+\.\d+$/.test(item.version) && property('Microsoft.VisualStudio.Code.PreRelease') !== 'true'
      && (!item.targetPlatform || item.targetPlatform === 'universal' || item.targetPlatform === target.platform)
      && engineCompatible(property('Microsoft.VisualStudio.Code.Engine'), target.version, target.date);
  }).sort((a, b) => {
    const left = a.version.split('.').map(Number), right = b.version.split('.').map(Number);
    for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return right[index] - left[index];
    return Number(b.targetPlatform === target.platform) - Number(a.targetPlatform === target.platform);
  });
  if (!versions.length) throw new Error('No stable Marketplace release is compatible with VS Code ' + target.version + ' on ' + target.platform);
  return versions[0];
}

async function latestCompatibleVersion(id, target, fetchImpl) {
  const response = await fetchImpl(new URL('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery'), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json;api-version=7.2-preview.1' },
    // IncludeVersions | IncludeFiles | IncludeVersionProperties | IncludeAssetUri.
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: id }], pageNumber: 1, pageSize: 1 }], flags: 147 }),
  });
  if (!response.ok) throw new Error('Microsoft Marketplace metadata returned HTTP ' + response.status);
  const body = await response.json();
  const extension = body.results?.[0]?.extensions?.find(item => `${item.publisher?.publisherName}.${item.extensionName}`.toLowerCase() === id.toLowerCase());
  if (!extension) throw new Error('Marketplace metadata identity mismatch for ' + id);
  if (/\b(?:blocked|unpublished)\b/i.test(extension.flags || '')) throw new Error('Marketplace extension is unavailable: ' + id);
  return selectCompatibleVersion(extension, target);
}

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

async function downloadExtension(id, version, file, fetchImpl = fetch, target) {
  if (!/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i.test(id) || !/^(?:latest|\d+\.\d+\.\d+)$/.test(version)) throw new Error('Invalid extension request');
  const [publisher, name] = id.split('.');
  const selected = version === 'latest' && target ? await latestCompatibleVersion(id, target, fetchImpl) : null;
  const requestedVersion = selected?.version || version;
  let url = new URL(`https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${name}/${requestedVersion}/vspackage`);
  if (selected?.targetPlatform && selected.targetPlatform !== 'universal') url.searchParams.set('targetPlatform', selected.targetPlatform);
  let response;
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (url.protocol !== 'https:' || !(url.hostname === 'marketplace.visualstudio.com' || url.hostname.endsWith('.vsassets.io'))) throw new Error('Unsupported Marketplace redirect');
    // Large legitimate extensions (for example SQL Server, >100 MiB) need a
    // download budget distinct from the small metadata request on slow links.
    response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(600000) });
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
  const manifest = readVsixManifest(bytes, id, requestedVersion === 'latest' ? undefined : requestedVersion);
  if (target && !engineCompatible(manifest.engines?.vscode, target.version, target.date)) throw new Error('Downloaded VSIX engine does not match its compatible Marketplace metadata');
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  return { id, version: manifest.version, targetPlatform: selected?.targetPlatform || null, sha256: createHash('sha256').update(bytes).digest('hex') };
}

module.exports = { readVsixManifest, downloadExtension, engineCompatible, selectCompatibleVersion, latestCompatibleVersion };
if (require.main === module) {
  const [id, version, file, target] = process.argv.slice(2);
  downloadExtension(id, version, file, fetch, target ? JSON.parse(target) : undefined).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
