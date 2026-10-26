'use strict';

const fs = require('node:fs');
const { inflateRawSync } = require('node:zlib');
const { createHash } = require('node:crypto');

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
  if (wanted[5]) {
    if (!date || !Number.isFinite(new Date(date).getTime())) return false;
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
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: id }], pageNumber: 1, pageSize: 1 }], flags: 147 }),
  });
  if (!response.ok) throw new Error('Microsoft Marketplace metadata returned HTTP ' + response.status);
  const body = await response.json();
  const extension = body.results?.[0]?.extensions?.find(item => `${item.publisher?.publisherName}.${item.extensionName}`.toLowerCase() === id.toLowerCase());
  if (!extension) throw new Error('Marketplace metadata identity mismatch for ' + id);
  if (/\b(?:blocked|unpublished)\b/i.test(extension.flags || '')) throw new Error('Marketplace extension is unavailable: ' + id);
  const selected = selectCompatibleVersion(extension, target);
  const stable = (extension.versions || []).filter(item => /^\d+\.\d+\.\d+$/.test(item.version)
    && item.properties?.find(property => property.key === 'Microsoft.VisualStudio.Code.PreRelease')?.value !== 'true');
  const absoluteLatestVersion = stable.map(item => item.version).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
  return { ...selected, absoluteLatestVersion, selectionReason: absoluteLatestVersion === selected.version
    ? 'Latest stable matches the IDE target' : `Newer stable releases do not match VS Code ${target.version}, ${target.platform}, or its build date` };
}

function parseVsixManifest(size, read, expectedId, expectedVersion) {
  if (size < 22) throw new Error('Invalid or truncated VSIX archive');
  const tailOffset = Math.max(0, size - 65557), tail = read(tailOffset, size - tailOffset);
  let end = -1;
  for (let offset = tail.length - 22; offset >= 0; offset--) {
    if (tail.readUInt32LE(offset) === 0x06054b50 && offset + 22 + tail.readUInt16LE(offset + 20) === tail.length) { end = offset; break; }
  }
  if (end < 0) throw new Error('Invalid or truncated VSIX archive');
  const entries = tail.readUInt16LE(end + 10), central = tail.readUInt32LE(end + 16), endOffset = tailOffset + end;
  if (!entries || entries === 65535 || tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6)
    || central + tail.readUInt32LE(end + 12) !== endOffset) throw new Error('Invalid VSIX directory');
  let offset = central, manifest;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > endOffset) throw new Error('Invalid VSIX directory');
    const header = read(offset, 46);
    if (header.readUInt32LE(0) !== 0x02014b50) throw new Error('Invalid VSIX directory');
    const compressedSize = header.readUInt32LE(20), length = header.readUInt32LE(24);
    const nameLength = header.readUInt16LE(28), extraLength = header.readUInt16LE(30), commentLength = header.readUInt16LE(32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > endOffset) throw new Error('Invalid VSIX entry');
    const name = read(offset + 46, nameLength).toString('utf8');
    if (name === 'extension/package.json') {
      if (manifest || length > 1024 * 1024 || compressedSize > 2 * 1024 * 1024 || (header.readUInt16LE(8) & 1)) throw new Error('Invalid VSIX manifest entry');
      const local = header.readUInt32LE(42);
      if (local + 30 > central) throw new Error('Invalid VSIX local header');
      const localHeader = read(local, 30);
      if (localHeader.readUInt32LE(0) !== 0x04034b50) throw new Error('Invalid VSIX local header');
      const start = local + 30 + localHeader.readUInt16LE(26) + localHeader.readUInt16LE(28);
      if (start + compressedSize > central) throw new Error('Truncated VSIX manifest');
      const compressed = read(start, compressedSize), method = header.readUInt16LE(10);
      const content = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 1024 * 1024 }) : null;
      if (!content || content.length !== length) throw new Error('Invalid VSIX manifest size or compression');
      let crc = 0xffffffff;
      for (const byte of content) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
      if (((crc ^ 0xffffffff) >>> 0) !== header.readUInt32LE(16)) throw new Error('VSIX manifest checksum mismatch');
      manifest = JSON.parse(content.toString('utf8'));
    }
    offset = next;
  }
  if (offset !== endOffset) throw new Error('Invalid VSIX directory');
  if (!manifest || `${manifest.publisher}.${manifest.name}`.toLowerCase() !== expectedId.toLowerCase()
    || !/^\d+\.\d+\.\d+(?:[-+][0-9a-z.+-]+)?$/i.test(manifest.version)
    || (expectedVersion && manifest.version !== expectedVersion)) throw new Error('Downloaded VSIX identity or version mismatch');
  return manifest;
}

function readVsixManifest(bytes, expectedId, expectedVersion) {
  return parseVsixManifest(bytes.length, (offset, length) => bytes.subarray(offset, offset + length), expectedId, expectedVersion);
}

function readVsixManifestFile(file, expectedId, expectedVersion) {
  const fd = fs.openSync(file, 'r');
  try {
    return parseVsixManifest(fs.fstatSync(fd).size, (offset, length) => {
      const bytes = Buffer.alloc(length);
      let received = 0;
      while (received < length) {
        const count = fs.readSync(fd, bytes, received, length - received, offset + received);
        if (!count) throw new Error('Truncated VSIX file');
        received += count;
      }
      return bytes;
    }, expectedId, expectedVersion);
  } finally { fs.closeSync(fd); }
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
    response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(600000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 5) throw new Error('Invalid Marketplace redirect');
      url = new URL(location, url);
    } else break;
  }
  if (!response.ok) throw new Error(`Microsoft Marketplace returned HTTP ${response.status} for ${id}@${version}`);
  let fd, created = false, size = 0;
  const hash = createHash('sha256');
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    created = true;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 128 * 1024 * 1024) throw new Error('VSIX download exceeds size limit');
      let written = 0;
      while (written < chunk.length) {
        const count = fs.writeSync(fd, chunk, written, chunk.length - written);
        if (!count) throw new Error('VSIX download could not be written');
        written += count;
      }
      hash.update(chunk);
    }
    fs.closeSync(fd); fd = undefined;
    const manifest = readVsixManifestFile(file, id, requestedVersion === 'latest' ? undefined : requestedVersion);
    if (target && !engineCompatible(manifest.engines?.vscode, target.version, target.date)) throw new Error('Downloaded VSIX engine does not match its compatible Marketplace metadata');
    return { id, version: manifest.version, targetPlatform: selected?.targetPlatform || null, sha256: hash.digest('hex') };
  } catch (error) {
    if (fd !== undefined) { fs.closeSync(fd); fd = undefined; }
    if (created) fs.unlinkSync(file);
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

module.exports = { readVsixManifest, readVsixManifestFile, downloadExtension, engineCompatible, selectCompatibleVersion, latestCompatibleVersion };
if (require.main === module) {
  const [id, version, file, target] = process.argv.slice(2);
  const work = id === '--metadata'
    ? latestCompatibleVersion(version, JSON.parse(file), fetch)
    : downloadExtension(id, version, file, fetch, target ? JSON.parse(target) : undefined);
  work.then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
