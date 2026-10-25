'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const SOURCES = ['package.json', 'config/extensions.json', 'lib/extensions.js', 'lib/owned-files.js', 'lib/jsonc.js',
  'scripts/install-gallery-extension.cjs', 'scripts/install-gallery-updates.cjs', 'extensions/workstation-stability/gallery-updates.cjs'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function noLinks(file) {
  for (let current = path.resolve(file); current !== path.dirname(current); current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Linked gallery update path');
  }
}
function read(file) {
  noLinks(file);
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 1024 * 1024) throw new Error('Invalid update metadata file');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('Invalid update metadata JSON'); }
}
function clearDeadLock(file) {
  noLinks(file);
  if (!fs.existsSync(file)) return;
  const bytes = fs.readFileSync(file, 'utf8');
  let previous; try { previous = JSON.parse(bytes); } catch { throw new Error('Invalid installer lock; inspect it before retrying'); }
  if (!Number.isSafeInteger(previous.pid) || previous.pid < 1) throw new Error('Invalid installer lock PID');
  try { process.kill(previous.pid, 0); return; }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  if (fs.readFileSync(file, 'utf8') !== bytes) throw new Error('Installer lock changed; retry later');
  fs.unlinkSync(file);
}
function createPlan(sourceRoot, env, catalog, target) {
  const files = {};
  for (const relative of SOURCES) {
    const file = path.join(sourceRoot, relative); noLinks(file);
    files[relative] = digest(fs.readFileSync(file));
  }
  return { schema: 1, sourceRoot, files, nodeExe: env.nodeExe, cliPath: env.cliPath, extensionsDir: env.extensionsDir,
    ideRoot: env.ideRoot || null, target,
    ids: catalog.filter(item => item.source === 'gallery' && !item.optional).map(item => item.id.toLowerCase()) };
}
function validatePlan(plan) {
  if (plan?.schema !== 1 || !path.isAbsolute(plan.sourceRoot || '') || !path.isAbsolute(plan.nodeExe || '')
    || !path.isAbsolute(plan.cliPath || '') || !path.isAbsolute(plan.extensionsDir || '')
    || !Array.isArray(plan.ids) || !plan.ids.length || new Set(plan.ids).size !== plan.ids.length
    || !plan.files || Object.keys(plan.files).length !== SOURCES.length) throw new Error('Invalid managed gallery update plan');
  if (!/^win32-(x64|arm64)$/.test(plan.target?.platform || '') || !/^\d+\.\d+\.\d+$/.test(plan.target?.version || '')) throw new Error('Invalid IDE update target');
  for (const relative of SOURCES) {
    const file = path.join(plan.sourceRoot, relative); noLinks(file);
    if (digest(fs.readFileSync(file)) !== plan.files[relative]) throw new Error('Gallery update source changed; rerun setup: ' + relative);
  }
  const allowed = read(path.join(plan.sourceRoot, 'config/extensions.json')).filter(item => item.source === 'gallery' && !item.optional).map(item => item.id.toLowerCase());
  if (plan.ids.some(id => typeof id !== 'string' || !allowed.includes(id))) throw new Error('Update plan includes an unmanaged extension');
  const identity = read(path.join(plan.sourceRoot, 'package.json'));
  if (identity.name !== 'antigravity-workstation-setup') throw new Error('Gallery source identity mismatch');
  for (const file of [plan.nodeExe, plan.cliPath, plan.extensionsDir]) noLinks(file);
  if (plan.ideRoot !== null && plan.ideRoot !== undefined) {
    if (!path.isAbsolute(plan.ideRoot)) throw new Error('Invalid installed IDE root');
    noLinks(plan.ideRoot);
  }
  return plan;
}
function runUpdates(profileFile, options = {}) {
  const profile = read(profileFile);
  if (profile.schema !== 1 || !/^[a-f0-9-]{36}$/i.test(profile.requestId || '')) throw new Error('Invalid editor profile identity');
  if (!profile.galleryUpdates) return { state: 'disabled', updated: false };
  const plan = validatePlan(profile.galleryUpdates);
  const lock = path.join(path.dirname(profileFile), 'install.lock'); noLinks(lock);
  clearDeadLock(lock);
  const token = JSON.stringify({ pid: process.pid, started: new Date().toISOString(), scope: 'managed-gallery-update' });
  let descriptor;
  try { descriptor = fs.openSync(lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return { state: 'waiting-for-installer', updated: false }; throw error; }
  try {
    fs.writeFileSync(descriptor, token); fs.closeSync(descriptor); descriptor = undefined;
    if (read(profileFile).requestId !== profile.requestId) return { state: 'superseded', updated: false };
    const engine = options.engine || require(path.join(plan.sourceRoot, 'lib/extensions'));
    const target = plan.ideRoot ? engine.galleryTarget({ ideRoot: plan.ideRoot }) : plan.target;
    const before = engine.getInstalledExtensions(plan.cliPath, { strict: true });
    const exclusions = options.exclude || [];
    if (!Array.isArray(exclusions) || exclusions.some(id => typeof id !== 'string')) throw new Error('Invalid gallery update exclusions');
    const selected = plan.ids.filter(id => before.some(item => item.id === id) && !exclusions.includes(id));
    const failures = [];
    for (const id of selected) {
      try {
        const result = engine.installExtension(plan.cliPath, id, { trackLatest: true,
          extensionsDir: plan.extensionsDir, target, log: options.log || (() => {}) });
        if (!result.success) failures.push(id + ': ' + (result.error || 'update failed'));
      } catch (error) { failures.push(id + ': ' + error.message); }
    }
    const after = engine.getInstalledExtensions(plan.cliPath, { strict: true });
    const updated = selected.flatMap(id => {
      const previous = before.find(item => item.id === id)?.version, current = after.find(item => item.id === id)?.version;
      return current && current !== previous ? [{ id, from: previous, to: current }] : [];
    });
    const index = read(path.join(plan.extensionsDir, 'extensions.json'));
    const nativeState = index.filter(item => selected.includes(item.identifier?.id?.toLowerCase()))
      .map(item => ({ id: item.identifier.id, version: item.version, pinned: item.metadata?.pinned === true, source: item.metadata?.source || 'unknown' }));
    return { state: failures.length ? 'failed' : 'checked', updated,
      checkedAt: new Date().toISOString(), target, failures, ids: selected, nativeState,
      skipped: plan.ids.filter(id => !selected.includes(id)),
      mechanism: 'Workstation verified Marketplace/CLI updater; not the IDE per-extension auto-update switch' };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === token) fs.unlinkSync(lock);
  }
}
function watchGalleryUpdates(vscode, context, output, options = {}) {
  const profileFile = options.profileFile || path.join(os.homedir(), '.gemini/config/workstation-setup/editor-profile.json');
  const stateFile = path.join(path.dirname(profileFile), 'gallery-update-status.json');
  let alive = true, running = false;
  async function check() {
    if (!alive || running || vscode.workspace.getConfiguration('workstationStability').get('autoUpdateManagedExtensions', true) === false) return;
    try {
      if (!fs.existsSync(profileFile)) return;
      const profile = read(profileFile);
      if (!profile.galleryUpdates) return;
      const plan = validatePlan(profile.galleryUpdates);
      let previous; try { previous = read(stateFile); } catch { previous = {}; }
      const delay = previous.state === 'checked' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
      if (previous.requestId === profile.requestId && Number.isFinite(previous.attemptedAt) && Date.now() - previous.attemptedAt < delay) return;
      const lock = path.join(path.dirname(profileFile), 'install.lock');
      clearDeadLock(lock);
      if (fs.existsSync(lock)) return;
      running = true;
      const excluded = vscode.workspace.getConfiguration('workstationStability').get('autoUpdateExcludedExtensions', []);
      (options.execFile || execFile)(plan.nodeExe, [path.join(plan.sourceRoot, 'scripts/install-gallery-updates.cjs'), profileFile, JSON.stringify(excluded)], {
        windowsHide: true, timeout: 1200000, maxBuffer: 512 * 1024, encoding: 'utf8', cwd: plan.sourceRoot,
      }, (error, stdout) => {
        running = false;
        if (!alive) return;
        let result;
        try {
          const line = stdout.split(/\r?\n/).reverse().find(value => value.startsWith('WORKSTATION_GALLERY_UPDATE_RESULT='));
          result = JSON.parse(line.slice('WORKSTATION_GALLERY_UPDATE_RESULT='.length));
        } catch { result = { state: 'failed', reason: 'Updater did not return a valid result' }; }
        if (error && result.state !== 'failed') result = { state: 'failed', reason: 'Bounded updater process failed', code: error.code };
        if (['waiting-for-installer', 'superseded', 'disabled'].includes(result.state)) return;
        try { if (read(profileFile).requestId !== profile.requestId) return; } catch { return; }
        const state = { ...result, requestId: profile.requestId, attemptedAt: Date.now() };
        try {
          noLinks(stateFile);
          const temporary = stateFile + '.' + crypto.randomUUID() + '.tmp';
          fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(temporary, stateFile);
        } catch { output.appendLine('Gallery update status could not be persisted.'); }
        output.appendLine('Managed gallery updater: ' + JSON.stringify(state));
      });
    } catch (error) { running = false; output.appendLine('Managed gallery updater unavailable: ' + error.message); }
  }
  const startup = setTimeout(() => { void check(); }, options.startupDelayMs ?? 60000);
  const interval = setInterval(() => { void check(); }, options.intervalMs ?? 60 * 60 * 1000);
  context.subscriptions.push({ dispose() { alive = false; clearTimeout(startup); clearInterval(interval); } });
}
module.exports = { SOURCES, createPlan, validatePlan, runUpdates, watchGalleryUpdates };
