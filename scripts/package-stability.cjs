'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// A deterministic VSIX (ZIP) built with Node alone; no downloaded build tools.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function buildVsix(root = path.resolve(__dirname, '..')) {
  const source = path.join(root, 'extensions/mansur-antigravity-stability');
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  if (manifest.publisher !== 'mansur' || manifest.name !== 'antigravity-stability-helper' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Unexpected helper identity');
  const entries = [
    ['[Content_Types].xml', Buffer.from('<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="txt" ContentType="text/plain"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>')],
    ['extension.vsixmanifest', Buffer.from('<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="antigravity-stability-helper" Version="'+manifest.version+'" Publisher="mansur"/><DisplayName>Mansur Antigravity Stability</DisplayName><Description xml:space="preserve">Applies the managed editor profile and restores audited extension fixes.</Description><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.107.0"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/></Assets></PackageManifest>')],
    ...['package.json', 'extension.js', 'maintenance.cjs', 'profile.cjs', 'README.md'].map(name => ['extension/' + name, fs.readFileSync(path.join(source, name))]),
    ['extension/LICENSE.txt', fs.readFileSync(path.join(root, 'LICENSE'))],
  ];
  const local = [], central = [];
  let offset = 0;
  for (const [name, bytes] of entries) {
    const filename = Buffer.from(name);
    const compressed = zlib.deflateRawSync(bytes, { level: 9 });
    const crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return { file: path.join(source, 'mansur-antigravity-stability-' + manifest.version + '.vsix'), bytes: Buffer.concat([...local, directory, end]) };
}
if (require.main === module) {
  const result = buildVsix();
  fs.writeFileSync(result.file, result.bytes);
  console.log(path.relative(path.resolve(__dirname, '..'), result.file));
}
module.exports = { buildVsix };
