'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { zipEntries } = require('./vsix-zip.cjs');

const FILES = ['package.json', 'dist/extension.js', 'assets/icon.png', 'LICENSE.txt', 'changelog.md', 'readme.md'];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Repackages the MIT-licensed upstream Jelly Cursor with only its engine
// requirement lowered to the Antigravity engine; every other byte is upstream.
function buildJellyCursor(root = path.resolve(__dirname, '..')) {
  const source = path.join(root, 'extensions/jelly-cursor');
  const upstream = JSON.parse(fs.readFileSync(path.join(source, 'upstream.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const id = manifest.publisher + '.' + manifest.name;
  if (id !== upstream.id || manifest.version !== upstream.version || manifest.engines?.vscode !== upstream.engine) {
    throw new Error('Unexpected Jelly Cursor identity or engine');
  }
  for (const file of FILES.filter(file => file !== 'package.json')) {
    if (sha256(fs.readFileSync(path.join(source, file))) !== upstream.upstreamFiles[file]) throw new Error('Jelly Cursor file differs from upstream: ' + file);
  }
  const vsixManifest = '<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">'
    + '<Metadata><Identity Language="en-US" Id="' + manifest.name + '" Version="' + manifest.version + '" Publisher="' + manifest.publisher + '"/>'
    + '<DisplayName>' + manifest.displayName + '</DisplayName><Description xml:space="preserve">' + manifest.description + '</Description>'
    + '<Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="' + upstream.engine + '"/></Properties></Metadata>'
    + '<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>'
    + '<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>';
  const contentTypes = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + ['json:application/json', 'js:application/javascript', 'png:image/png', 'md:text/markdown', 'txt:text/plain', 'vsixmanifest:text/xml']
      .map(item => '<Default Extension="' + item.split(':')[0] + '" ContentType="' + item.split(':')[1] + '"/>').join('') + '</Types>';
  const payload = FILES.map(file => ['extension/' + file, fs.readFileSync(path.join(source, file))]);
  const bytes = zipEntries([['[Content_Types].xml', Buffer.from(contentTypes)], ['extension.vsixmanifest', Buffer.from(vsixManifest)], ...payload]);
  const pin = { id, version: manifest.version, vsixSha256: sha256(bytes),
    files: Object.fromEntries(payload.map(([file, content]) => [file.slice('extension/'.length), sha256(content)])) };
  return { file: path.join(source, manifest.name + '-' + manifest.version + '.vsix'), bytes, pin };
}

if (require.main === module) {
  const result = buildJellyCursor();
  fs.writeFileSync(result.file, result.bytes);
  fs.writeFileSync(path.join(path.dirname(result.file), 'manifest.json'), JSON.stringify(result.pin, null, 2) + '\n');
  console.log(path.relative(path.resolve(__dirname, '..'), result.file));
}
module.exports = { buildJellyCursor };
