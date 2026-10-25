'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJsonFile } = require('./jsonc');
const { guard } = require('./owned-files');

const INLINE_KEY = 'editor.inlineSuggest.enabled';
const LANGUAGES = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'];

function quietSettings(current = {}) {
  const result = { [INLINE_KEY]: false };
  const scopes = new Set([...LANGUAGES.map(language => '[' + language + ']'),
    ...Object.keys(current).filter(key => /^(?:\[[^\]]+\])+$/.test(key))]);
  for (const key of scopes) result[key] = { [INLINE_KEY]: false };
  return result;
}
function mergeQuietSettings(current, managed = quietSettings(current)) {
  const result = { ...current, ...managed };
  for (const [key, value] of Object.entries(managed)) {
    if (key.startsWith('[')) result[key] = { ...current[key], ...value };
  }
  return result;
}
function snapshot(file) {
  guard(path.dirname(file), path.basename(file));
  if (!fs.existsSync(file)) return { file, bytes: null, value: {} };
  const bytes = fs.readFileSync(file);
  const value = readJsonFile(file, { jsonc: true, emptyValue: {} });
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid quiet-completion settings object: ' + file);
  return { file, bytes, value };
}
function atomicWrite(file, bytes) {
  guard(path.dirname(file), path.basename(file));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(temporary, bytes, { mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}
function applyQuietCompletion(env, options = {}) {
  if (!options.queue) require('./installer').preflightNativeSetup(env, { nativeScope: 'completion' });
  const settings = snapshot(env.settingsJson);
  const profile = snapshot(path.join(env.geminiConfigDir, 'workstation-setup/editor-profile.json'));
  const desired = quietSettings(settings.value);
  const merged = mergeQuietSettings(settings.value, desired);
  const version = require('../package.json').version;
  const plan = { schema: 1, requestId: crypto.randomUUID(), setupVersion: version, locale: 'ru', settings: desired };
  const settingsChanged = JSON.stringify(settings.value) !== JSON.stringify(merged);
  const profileChanged = profile.value.schema !== 1 || typeof profile.value.requestId !== 'string'
    || !/^[a-f0-9-]{36}$/.test(profile.value.requestId) || profile.value.setupVersion !== version
    || profile.value.locale !== 'ru' || JSON.stringify(profile.value.settings) !== JSON.stringify(desired);
  const changes = [settingsChanged && { ...settings, next: merged }, profileChanged && { ...profile, next: plan }].filter(Boolean);
  let nativeNeedsChange = false;
  if (env.ideRoot) {
    const automation = require('./agent-automation');
    const reusable = automation.findReusableAutomationRequest(env, { scope: 'completion' });
    if (!options.dryRun && !reusable) automation.cancelPendingWorkers(env);
    const inspection = automation.inspectAutomation(env, { scope: 'completion' });
    nativeNeedsChange = !reusable?.queued && (!inspection.verified || inspection.wouldChange);
  }
  let backup;
  if (!options.dryRun && (changes.length || nativeNeedsChange)) {
    backup = guard(env.backupsDir, 'quiet-completion-' + crypto.randomUUID());
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    const files = changes.map((change, index) => ({ target: change.file, hadFile: change.bytes !== null, file: index + '.json' }));
    for (const [index, change] of changes.entries()) if (change.bytes !== null) atomicWrite(path.join(backup, index + '.json'), change.bytes);
    atomicWrite(path.join(backup, 'manifest.json'), JSON.stringify({ format: 1, files }));
    if (env.ideRoot) {
      const nativeSnapshot = require('./rollback').captureNativeBackup(env, backup, { scope: 'completion', includeMcp: false });
      if (!nativeSnapshot.captured) throw new Error(nativeSnapshot.reason);
    }
    for (const change of changes) {
      const current = fs.existsSync(change.file) ? fs.readFileSync(change.file) : null;
      if (change.bytes === null ? current !== null : !current?.equals(change.bytes)) throw new Error('Editor preferences changed concurrently; rerun quiet-completion');
    }
    for (const change of changes) atomicWrite(change.file, JSON.stringify(change.next, null, 2));
  }
  const native = (options.queue || require('./agent-automation').queueAutomation)(env, { dryRun: !!options.dryRun, scope: 'completion' });
  return { success: !!(native.applied || native.queued || native.dryRun), dryRun: !!options.dryRun,
    editor: { saved: !options.dryRun, changed: changes.length > 0, backup, inlineSuggestionsEnabled: false,
      settingsFile: settings.file, profileFile: profile.file, runtimeVerified: false }, native };
}
function verifyQuietCompletion(env, options = {}) {
  const failures = [];
  for (const file of [env.settingsJson, path.join(env.geminiConfigDir, 'workstation-setup/editor-profile.json')]) {
    try {
      const current = snapshot(file);
      if (!current.bytes) { failures.push('Missing completion settings: ' + file); continue; }
      const values = file === env.settingsJson ? current.value : current.value.settings;
      if (!values || typeof values !== 'object' || Array.isArray(values)) { failures.push('Invalid completion settings: ' + file); continue; }
      for (const key of Object.keys(quietSettings(values))) {
        if ((key === INLINE_KEY ? values[key] : values[key]?.[INLINE_KEY]) !== false) failures.push('AI inline suggestions not disabled: ' + key + ' in ' + file);
      }
    } catch (error) { failures.push(error.message); }
  }
  const native = (options.getStatus || require('./setup-status').getSetupStatus)(env);
  if (native.scope !== 'completion' || native.state !== 'applied' || native.storedPreferences?.matches !== true) {
    failures.push('Native completion state not verified: ' + (native.reason || native.state || 'unknown'));
  }
  return { ok: failures.length === 0, scope: 'quiet-completion', failures, runtimeVerified: false };
}
module.exports = { INLINE_KEY, LANGUAGES, quietSettings, mergeQuietSettings, applyQuietCompletion, verifyQuietCompletion };
