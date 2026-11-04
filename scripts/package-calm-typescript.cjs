'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { zipEntries } = require('./vsix-zip.cjs');

function buildCalmTypeScript(root = path.resolve(__dirname, '..')) {
  const source = path.join(root, 'extensions/calm-typescript');
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const id = manifest.publisher + '.' + manifest.name;
  if (id !== 'workstation.calm-typescript' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Unexpected Calm TypeScript identity');
  const bundle = fs.readFileSync(path.join(source, 'extension.cjs'));
  const entries = [
    ['[Content_Types].xml', Buffer.from('<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="png" ContentType="image/png"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="txt" ContentType="text/plain"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>')],
    ['extension.vsixmanifest', Buffer.from('<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="calm-typescript" Version="' + manifest.version + '" Publisher="workstation"/><DisplayName>Calm TypeScript</DisplayName><Description xml:space="preserve">Visual-only quiet JS/TS diagnostics, typing pulse, Auto Save, and Format.</Description><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.107.0"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>')],
    ['extension/package.json', fs.readFileSync(path.join(source, 'package.json'))],
    ['extension/icon.png', fs.readFileSync(path.join(source, 'icon.png'))],
    ['extension/README.md', fs.readFileSync(path.join(source, 'README.md'))],
    ['extension/dist/extension.cjs', bundle],
    ['extension/LICENSE.txt', fs.readFileSync(path.join(root, 'LICENSE'))],
  ];
  const bytes = zipEntries(entries);
  const sha256 = content => crypto.createHash('sha256').update(content).digest('hex');
  return { file: path.join(source, 'calm-typescript-' + manifest.version + '.vsix'), bytes, pin: { id, version: manifest.version, vsixSha256: sha256(bytes), extensionBundleSha256: sha256(bundle) } };
}

if (require.main === module) {
  const result = buildCalmTypeScript();
  fs.writeFileSync(result.file, result.bytes);
  fs.writeFileSync(path.join(path.dirname(result.file), 'manifest.json'), JSON.stringify(result.pin, null, 2) + '\n');
  console.log(path.relative(path.resolve(__dirname, '..'), result.file));
}
module.exports = { buildCalmTypeScript };
