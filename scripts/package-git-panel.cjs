'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { zip } = require('./package-aster.cjs');
const root = path.resolve(__dirname, '../extensions/git-branch-panel');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function payload() {
  const files = ['package.json', 'extension.js', 'README.md', 'icon.png', 'LICENSE.txt',
    ...['current-branch', 'new-branch', 'switch-branch', 'get-changes', 'pull-request', 'delete-branch']
      .flatMap(id => ['gif', 'mp4'].map(type => `media/${id}.${type}`))];
  return new Map(files.map(file => [file, fs.readFileSync(path.join(root, file))]));
}
function build() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  if (manifest.publisher !== 'workstation' || manifest.name !== 'git-branch-panel' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Unexpected panel identity');
  const types = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    [['json','application/json'], ['png','image/png'], ['gif','image/gif'], ['mp4','video/mp4'], ['md','text/markdown'], ['js','application/javascript'], ['txt','text/plain'], ['vsixmanifest','text/xml']]
      .map(([ext, type]) => `<Default Extension="${ext}" ContentType="${type}"/>`).join('') + '</Types>';
  const xml = `<?xml version="1.0"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="${manifest.name}" Version="${manifest.version}" Publisher="${manifest.publisher}"/><DisplayName>${manifest.displayName}</DisplayName><Description xml:space="preserve">Git branch operations in the Explorer.</Description><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${manifest.engines.vscode}"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png" Addressable="true"/></Assets></PackageManifest>`;
  const files = payload();
  const entries = [['[Content_Types].xml', Buffer.from(types)], ['extension.vsixmanifest', Buffer.from(xml)],
    ...[...files].map(([name, bytes]) => ['extension/' + name, bytes])];
  const bytes = zip(entries), pin = { id: manifest.publisher + '.' + manifest.name, version: manifest.version,
    vsixSha256: digest(bytes), files: Object.fromEntries([...files].map(([name, content]) => [name, digest(content)])) };
  return { bytes, pin, file: path.join(root, `git-branch-panel-${manifest.version}.vsix`) };
}
if (require.main === module) {
  const result = build(); fs.writeFileSync(result.file, result.bytes);
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(result.pin, null, 2) + '\n');
  console.log(result.file);
}
module.exports = { build, payload };
