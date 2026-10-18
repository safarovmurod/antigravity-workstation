'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJsonFile } = require('./jsonc');

const CONTRACT = 'workstation-setup-payload-v1';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function rootsFor(env) {
  return {
    rules: env.geminiRulesDir,
    skills: env.geminiSkillsDir,
    scripts: env.geminiScriptsDir,
    agents: path.join(env.geminiConfigDir, 'agents'),
    guides: path.join(env.geminiConfigDir, 'workstation-unified', 'guides'),
    // Read-only migration destination; new payload never writes here.
    'legacy-guides': path.join(env.geminiConfigDir, 'mansur-unified', 'guides'),
    hooks: path.join(env.geminiDir, 'antigravity', 'hooks'),
    'gsd-core': path.join(env.geminiDir, 'antigravity', 'gsd-core'),
    'jelly-cursor': path.join(env.antigravityStateDir, 'jelly-cursor'),
    'global-skills': path.join(env.geminiDir, 'skills'),
    'antigravity-runtime': path.join(env.geminiDir, 'antigravity'),
    'mcp-runtime': path.join(env.geminiConfigDir, 'mcp-runtime'),
  };
}

function guard(root, relative) {
  const absolute = path.resolve(root);
  if (typeof relative !== 'string' || !relative || /[\\:\x00]/.test(relative)
    || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid setup-owned relative path');
  const target = path.resolve(absolute, relative);
  const distance = path.relative(absolute, target);
  if (!distance || distance.startsWith('..') || path.isAbsolute(distance)) throw new Error('Setup target outside its allowed root');
  // Check all existing ancestors, including a junction above the selected root.
  let current = path.parse(target).root;
  for (const component of target.slice(current.length).split(path.sep)) {
    current = path.join(current, component);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isSymbolicLink()) throw new Error('Linked setup path is unsupported: ' + current);
  }
  return target;
}

function statePath(env) {
  return guard(env.geminiConfigDir, 'workstation-setup/.installation.json');
}

function targetFor(roots, key) {
  const separator = key.indexOf('/');
  const area = key.slice(0, separator), relative = key.slice(separator + 1);
  if (separator < 1 || !Object.hasOwn(roots, area)) throw new Error('Invalid setup ownership area');
  return guard(roots[area], relative);
}

function read(file) {
  if (!fs.existsSync(file)) return null;
  if (!fs.statSync(file).isFile()) throw new Error('Expected a setup-owned file: ' + file);
  return fs.readFileSync(file);
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(temporary, content); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function sourceTree(source, area, plans) {
  if (!fs.existsSync(source)) return;
  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      // npm ci is supported in this checkout; dependency trees are provisioned
      // separately at the destination and must never enter the owned payload.
      if (area === 'mcp-runtime' && !relative && entry.name === 'node_modules') continue;
      const name = relative ? relative + '/' + entry.name : entry.name;
      const file = guard(source, name);
      if (entry.isDirectory()) visit(file, name);
      else if (entry.isFile()) plans.push({ key: area + '/' + name, content: fs.readFileSync(file) });
      else throw new Error('Unsupported source entry: ' + file);
    }
  }
  visit(source);
}

function collectPayload(repoRoot, displayName) {
  const plans = [];
  const rules = path.join(repoRoot, 'rules');
  for (const name of fs.readdirSync(rules).sort()) {
    if (!name.endsWith('.template.md') || name === 'GEMINI.template.md') continue;
    let content = fs.readFileSync(guard(rules, name), 'utf8');
    plans.push({ key: 'rules/' + name.replace('.template.md', '.md'), content: Buffer.from(content) });
  }
  const skills = path.join(repoRoot, 'skills');
  for (const name of fs.readdirSync(skills).sort()) {
    if (fs.existsSync(path.join(skills, name, 'SKILL.md'))) sourceTree(path.join(skills, name), 'skills/' + name, plans);
  }
  for (const [source, area] of [['agents', 'agents'], ['resources/guides', 'guides'], ['resources/hooks', 'hooks'], ['resources/gsd-core', 'gsd-core'], ['config/jelly-cursor', 'jelly-cursor']]) sourceTree(path.join(repoRoot, source), area, plans);
  for (const area of ['global-skills', 'antigravity-runtime', 'mcp-runtime']) sourceTree(path.join(repoRoot, 'resources', area), area, plans);
  const scripts = path.join(repoRoot, 'scripts');
  for (const name of fs.readdirSync(scripts).sort()) {
    // Installers and the download bootstrap belong in the repository, not the user's runtime directory.
    if (!/\.(mjs|cjs|js|ps1)$/.test(name) || name.startsWith('install-') || ['bootstrap.ps1', 'package-stability.cjs', 'package-calm-typescript.cjs'].includes(name)) continue;
    plans.push({ key: 'scripts/' + name, content: fs.readFileSync(guard(scripts, name)) });
  }
  if (new Set(plans.map(plan => plan.key)).size !== plans.length) throw new Error('Duplicate setup payload destination');
  return plans;
}

function loadRegistry(env, roots) {
  const current = statePath(env);
  const legacy = guard(env.geminiConfigDir, 'mansur-setup/.installation.json');
  const registry = fs.existsSync(current) ? current : legacy;
  const bytes = read(registry);
  if (!bytes) return null;
  const state = readJsonFile(registry);
  if (!state || typeof state !== 'object') throw new Error('Invalid full setup ownership registry: ' + registry + '; no changes made');
  if (state.schema !== 1 || ![CONTRACT, 'mansur-setup-payload-v1'].includes(state.contract) || !Array.isArray(state.files)
    || state.files.some(file => !file || typeof file.key !== 'string' || !/^[a-f0-9]{64}$/.test(file.hash))
    || new Set(state.files.map(file => file.key)).size !== state.files.length) throw new Error('Invalid full setup ownership registry: ' + registry + '; no changes made');
  if (state.contract === 'mansur-setup-payload-v1') {
    state.files = state.files.map(file => ({ ...file, key: file.key.startsWith('guides/') ? 'legacy-guides/' + file.key.slice(7) : file.key }));
  }
  for (const file of state.files) targetFor(roots, file.key);
  Object.defineProperty(state, 'sourceRegistry', { value: registry });
  return state;
}

function planPayload(env, repoRoot, displayName) {
  const roots = rootsFor(env), plans = collectPayload(repoRoot, displayName);
  const previous = loadRegistry(env, roots);
  const legacyFile = path.join(repoRoot, 'config', 'migrations', 'legacy-payload.json');
  const legacy = fs.existsSync(legacyFile) ? readJsonFile(legacyFile) : { files: {}, templates: {} };
  if (legacy.schema !== undefined && legacy.schema !== 1) throw new Error('Invalid legacy payload catalog');
  const previousFiles = new Map((previous?.files || []).map(file => [file.key, file.hash]));
  const writes = [], removals = [], preserved = [];
  for (const plan of plans) {
    const target = targetFor(roots, plan.key), current = read(target);
    const expected = digest(plan.content), currentHash = current && digest(current);
    const oldHash = previousFiles.get(plan.key);
    const text = current?.toString('utf8'), sourceText = plan.content.toString('utf8');
    const equivalentText = current !== null && Buffer.from(text).equals(current) && Buffer.from(sourceText).equals(plan.content)
      && text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n') === sourceText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (current !== null && currentHash !== expected && currentHash !== oldHash && !equivalentText) {
      const known = [...(legacy.files?.[plan.key] || [])];
      const storedTemplates = legacy.templates?.[plan.key];
      const templates = Array.isArray(storedTemplates) ? storedTemplates : [storedTemplates];
      for (const template of templates) {
        if (typeof template !== 'string') continue;
        const rendered = template.replaceAll('{{DISPLAY_NAME}}', displayName).replace(/\r\n/g, '\n');
        known.push(digest(Buffer.from(rendered)), digest(Buffer.from(rendered.replace(/\n/g, '\r\n'))));
      }
      if (previous || !known.includes(currentHash)) throw new Error('Setup conflict: edited or unregistered ' + target + '; preserve and reconcile it before updating');
    }
    if (currentHash !== expected) writes.push({ ...plan, target, before: current });
  }
  const active = new Set(plans.map(plan => plan.key));
  // Legacy catalog is evidence of individual old bytes, never permission to delete an entire directory.
  const candidates = previous ? previous.files : Object.entries(legacy.files || {}).map(([key, hashes]) => ({ key, hashes }));
  for (const item of candidates) {
    if (active.has(item.key)) continue;
    const target = targetFor(roots, item.key), current = read(target);
    if (current === null) continue;
    const known = item.hash ? [item.hash] : item.hashes;
    if (known.includes(digest(current))) removals.push({ key: item.key, target, before: current });
    else preserved.push(target);
  }
  const next = { schema: 1, contract: CONTRACT, files: plans.map(plan => ({ key: plan.key, hash: digest(plan.content) })) };
  const registry = statePath(env), registryBytes = Buffer.from(JSON.stringify(next, null, 2) + '\n');
  const oldRegistry = read(registry);
  if (!oldRegistry?.equals(registryBytes)) writes.push({ key: 'registry', target: registry, content: registryBytes, before: oldRegistry });
  if (previous?.sourceRegistry !== undefined && previous.sourceRegistry !== registry) {
    removals.push({ key: 'legacy-registry', target: previous.sourceRegistry, before: read(previous.sourceRegistry) });
    for (const name of ['editor-profile.json', 'install-options.json']) {
      const target = guard(path.dirname(previous.sourceRegistry), name), before = read(target);
      if (before !== null) {
        readJsonFile(target); // Corrupt metadata is reported before any mutation.
        removals.push({ key: 'legacy-' + name, target, before });
      }
    }
  }
  return { writes, removals, preserved, roots, expectedCount: plans.length };
}

function applyPayload(env, plan, options = {}) {
  const changed = [...plan.writes, ...plan.removals].map(item => item.target);
  if (options.dryRun || !changed.length) return { changed, removed: plan.removals.map(item => item.target), preserved: plan.preserved, backup: null, dryRun: !!options.dryRun };
  const backup = guard(env.backupsDir, 'setup-payload-' + Date.now() + '-' + crypto.randomUUID());
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  // Verify all bytes again before backup and mutation to detect a concurrent user edit.
  const changes = [...plan.writes.filter(item => item.key !== 'registry'), ...plan.removals, ...plan.writes.filter(item => item.key === 'registry')];
  for (const item of changes) {
    guard(path.dirname(item.target), path.basename(item.target));
    const current = read(item.target);
    if ((current === null ? null : digest(current)) !== (item.before === null ? null : digest(item.before))) throw new Error('Setup file changed during installation: ' + item.target);
  }
  const records = changes.map((item, index) => {
    if (item.before !== null) fs.writeFileSync(path.join(backup, index + '.bak'), item.before, { mode: 0o600 });
    return { file: index + '.bak', target: item.target, beforeHash: item.before === null ? null : digest(item.before), afterHash: item.content ? digest(item.content) : null };
  });
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ schema: 1, contract: CONTRACT, status: 'pending', records }, null, 2));
  const completed = [];
  try {
    for (const item of changes) {
      guard(path.dirname(item.target), path.basename(item.target));
      const current = read(item.target);
      if ((current === null ? null : digest(current)) !== (item.before === null ? null : digest(item.before))) throw new Error('Setup file changed before replacement: ' + item.target);
      if (item.content === undefined) fs.unlinkSync(item.target);
      else atomicWrite(item.target, item.content);
      completed.push(item);
    }
    atomicWrite(path.join(backup, 'manifest.json'), Buffer.from(JSON.stringify({ schema: 1, contract: CONTRACT, status: 'complete', records }, null, 2)));
  } catch (error) {
    try {
      for (const item of completed.reverse()) {
        const current = read(item.target), installedHash = item.content === undefined ? null : digest(item.content);
        if ((current === null ? null : digest(current)) !== installedHash) throw new Error('User edit preserved during rollback: ' + item.target);
        if (item.before === null) { if (fs.existsSync(item.target)) fs.unlinkSync(item.target); }
        else atomicWrite(item.target, item.before);
      }
    } catch (rollbackError) { throw new Error('Setup payload rollback incomplete; backup: ' + backup + '; ' + error.message + '; ' + rollbackError.message); }
    throw new Error('Setup payload failed and was rolled back; backup: ' + backup + '; ' + error.message);
  }
  return { changed, removed: plan.removals.map(item => item.target), preserved: plan.preserved, backup, dryRun: false };
}

function restorePayloadExtras(env, backupDir, options = {}) {
  const roots = rootsFor(env), current = loadRegistry(env, roots);
  if (!current) return { removed: [], preserved: [] };
  const removed = [], preserved = [], removals = [];
  for (const file of current.files) {
    const target = targetFor(roots, file.key);
    const oldFile = guard(backupDir, file.key);
    if (fs.existsSync(oldFile) || !fs.existsSync(target)) continue;
    if (digest(fs.readFileSync(target)) === file.hash) { removals.push(target); removed.push(target); }
    else preserved.push(target);
  }
  if (!options.dryRun) for (const file of removals) fs.unlinkSync(file);
  return { removed, preserved };
}

module.exports = { collectPayload, planPayload, applyPayload, guard, digest, statePath, restorePayloadExtras };
