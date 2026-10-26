'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repository = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function list(directory) {
  return fs.readdirSync(path.join(repository, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = directory + '/' + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Unexpected linked inventory input: ' + relative);
    return entry.isDirectory() ? list(relative) : [relative];
  }).sort();
}
function buildInventory() {
  const gsd = JSON.parse(fs.readFileSync(path.join(repository, 'resources/antigravity-runtime/gsd-file-manifest.json')));
  const bytesByHash = new Map(), entries = [];
  for (const directory of ['skills', 'agents', 'rules']) {
    for (const file of list(directory).filter(file => file.endsWith('.md'))) {
      const bytes = fs.readFileSync(path.join(repository, file)), text = bytes.toString('utf8');
      const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1] || '';
      const digest = hash(bytes);
      const upstream = gsd.files[file] === digest;
      const kind = file.startsWith('agents/') ? 'agent' : file.startsWith('rules/') ? 'rule'
        : file.endsWith('/SKILL.md') ? 'skill' : 'reference';
      const installPath = kind === 'rule' ? file === 'rules/GEMINI.template.md' ? '~/.gemini/GEMINI.md'
        : '~/.gemini/config/rules/' + path.basename(file).replace('.template.md', '.md') : '~/.gemini/config/' + file;
      const dependencies = [...new Set([...text.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]))];
      const duplicates = bytesByHash.get(digest) || [];
      entries.push({ file, kind, installPath, bytes: bytes.length, metadataBytes: Buffer.byteLength(header), sha256: digest,
        source: upstream ? '@opengsd/gsd-core' : file.startsWith('skills/in-chat-screenshot-to-code/') ? 'abi/screenshot-to-code issue638, original supplied ZIP; project-preserving adaptation'
          : file.includes('vercel-react-best-practices') ? 'Vercel React best practices, bundled adaptation'
          : file.startsWith('skills/android-cli/') ? 'Android CLI, bundled upstream stub'
          : file.startsWith('skills/agent-browser/') ? 'agent-browser, bundled upstream discovery stub' : 'Workstation owned adaptation',
        revision: upstream ? gsd.version : file.startsWith('skills/in-chat-screenshot-to-code/')
          ? 'source ZIP sha256:cdf478612a67fa37116bfd18de0e16f44adbee07953a34cf852a742b04134590; adaptation sha256:' + digest : 'content-sha256:' + digest,
        triggerMetadata: header || null, dependencies,
        deployment: 'source present; disposable installer tests cover copied payload, not live model consumption',
        activation: 'NOT TESTED', semanticConflictAudit: upstream ? 'upstream payload preserved; global agreement takes precedence' : 'requires task-specific review',
        identicalEarlierFiles: [...duplicates] });
      duplicates.push(file); bytesByHash.set(digest, duplicates);
    }
  }
  const core = entries.find(item => item.file === 'rules/GEMINI.template.md');
  return { schema: 1, setupVersion: require('../package.json').version, gsdVersion: gsd.version,
    measured: { coreBytes: core.bytes, discoveryHeaderBytes: entries.reduce((sum, item) => sum + item.metadataBytes, 0),
      diskMarkdownBytes: entries.reduce((sum, item) => sum + item.bytes, 0),
      counts: Object.fromEntries(['skill', 'agent', 'rule', 'reference'].map(kind => [kind, entries.filter(item => item.kind === kind).length])) },
    liveContextTokens: null, responseLatency: null,
    caveat: 'UTF-8 disk bytes and frontmatter bytes are not active tokens, provider context consumption, successful activation or measured speed.', entries };
}
if (require.main === module) {
  const result = buildInventory();
  const output = process.argv[2];
  if (output) {
    const destination = path.resolve(output);
    if (path.dirname(destination) !== path.join(repository, 'docs')) throw new Error('Inventory report must stay in repository/docs');
    fs.writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result.measured));
  } else console.log(JSON.stringify(result, null, 2));
}
module.exports = { buildInventory };
