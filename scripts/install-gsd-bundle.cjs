'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const { guard } = require('../lib/owned-files');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function destination(key) {
  const roots = { skills: 'skills', agents: 'agents', hooks: 'resources/hooks', 'gsd-core': 'resources/gsd-core', scripts: 'resources/antigravity-runtime/scripts' };
  const [area, ...parts] = key.split('/');
  if (!roots[area]) throw new Error('Unknown GSD manifest root: ' + area);
  return guard(path.join(repo, roots[area]), parts.join('/'));
}
function importBundle(home) {
  const runtime = guard(home, '.gemini/antigravity');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const previous = read(path.join(repo, 'resources/antigravity-runtime/gsd-file-manifest.json'));
  const manifest = read(guard(runtime, 'gsd-file-manifest.json'));
  if (manifest.runtime !== 'antigravity' || manifest.scope !== 'global' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Invalid generated manifest');
  const planned = new Map();
  for (const [key, expected] of Object.entries(manifest.files)) {
    const source = /^(skills|agents)\//.test(key) ? guard(path.join(home, '.gemini/config'), key) : guard(runtime, key);
    let bytes = fs.readFileSync(source);
    if (hash(bytes) !== expected) throw new Error('Generated artifact hash mismatch: ' + key);
    if (bytes.includes(Buffer.from(home))) throw new Error('Temporary home leaked into artifact: ' + key);
    if (key.endsWith('.md')) {
      bytes = Buffer.from(bytes.toString('utf8').replaceAll('~/.gemini/antigravity/agents/', '~/.gemini/config/agents/')
        .replaceAll('~/.gemini/antigravity/skills/', '~/.gemini/config/skills/')
        .replace(/\]\((?:\.\.\/)+(docs\/[^)]*|CONTEXT\.md[^)]*)\)/g,
          `](https://github.com/open-gsd/gsd-core/blob/v${manifest.version}/$1)`));
      manifest.files[key] = hash(bytes);
    }
    if (key.endsWith('/gsd-eval-auditor.compact.md') || key === 'gsd-core/bin/lib/state.cjs') {
      bytes = Buffer.from(bytes.toString('utf8').split('\n').map(line =>
        line.includes('**Project skills:** check') || /^\s*(function scanStatePhaseDirs|storedCompletedPhases,|function reconcileReportedFields)/.test(line)
          ? line.trimEnd() : line).join('\n'));
      manifest.files[key] = hash(bytes);
    }
    planned.set(destination(key), bytes);
  }
  const obsolete = [];
  for (const [key, expected] of Object.entries(previous.files)) {
    const target = destination(key);
    if (!fs.existsSync(target) || hash(fs.readFileSync(target)) !== expected) throw new Error('Existing vendor artifact differs: ' + key);
    if (!Object.hasOwn(manifest.files, key)) obsolete.push(target);
  }
  for (const name of ['gsd-file-manifest.json', 'gsd-install-state.json', '.gsd-profile']) {
    planned.set(path.join(repo, 'resources/antigravity-runtime', name), name === 'gsd-file-manifest.json'
      ? Buffer.from(JSON.stringify(manifest, null, 2) + '\n') : fs.readFileSync(guard(runtime, name)));
  }
  const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-gsd-import-backup-'));
  const snapshots = [...new Set([...planned.keys(), ...obsolete])].map((target, index) => {
    const bytes = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (bytes) fs.writeFileSync(path.join(backup, String(index)), bytes);
    return { target, bytes };
  });
  try {
    for (const [target, bytes] of planned) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
    for (const target of obsolete) fs.unlinkSync(target);
  } catch (error) {
    for (const { target, bytes } of snapshots) {
      if (bytes) fs.writeFileSync(target, bytes);
      else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    throw error;
  }
  console.log(JSON.stringify({ version: manifest.version, imported: planned.size, retired: obsolete.map(target => path.relative(repo, target)), backup }));
}
if (require.main === module) importBundle(path.resolve(process.argv[2]));
module.exports = { importBundle };
