'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function contains(actual, expected) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) return same(actual, expected);
  return !!actual && Object.entries(expected).every(([key, value]) => contains(actual[key], value));
}

// These settings are dictionaries of independent user choices. Updating the
// workstation's entries must not discard personal mappings, colors or shells.
const MERGED_SETTINGS = new Set(['workbench.colorCustomizations', 'files.associations',
  'emmet.includeLanguages', 'tailwindCSS.includeLanguages', 'terminal.integrated.profiles.windows',
  'highlight-matching-tag.styles', 'workbench.editorAssociations', 'files.watcherExclude', 'search.exclude']);
function mergeManagedValue(key, previous, managed) {
  if (!MERGED_SETTINGS.has(key)) {
    if (!/^\[.+\]$/.test(key)) return managed;
    const next = { ...previous, ...managed };
    delete next['editor.renderValidationDecorations'];
    return next;
  }
  function merge(current, desired) {
    if (!desired || typeof desired !== 'object' || Array.isArray(desired)) return desired;
    const next = current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
    for (const [name, value] of Object.entries(desired)) next[name] = merge(next[name], value);
    return next;
  }
  return merge(previous, managed);
}

// Only use vendor switches actually declared by the installed IDE extension.
function vendorCompletionSettings(extensions) {
  const settings = {};
  for (const extension of extensions) {
    const contributions = extension.packageJSON?.contributes?.configuration;
    for (const section of Array.isArray(contributions) ? contributions : [contributions]) {
      for (const [key, definition] of Object.entries(section?.properties || {})) {
        if (!/^(antigravity|codeium)\./i.test(key) || definition.type !== 'boolean') continue;
        if (!/(auto.?complet|super.?complet|inline.?suggest|tab.?complet|(?:^|\.)tab\.|(?:enable|disable)Tab$)/i.test(key)) continue;
        if (/(?:^|\.)(?:disable\w*|\w*Disabled)$/i.test(key)) settings[key] = true;
        else if (/(?:^|\.)(?:enable\w*|\w*Enabled)$/i.test(key)) settings[key] = false;
      }
    }
  }
  return settings;
}

function isRegisteredSetting(vscode, key) {
  if (/^\[.+\]$/.test(key)) return true;
  if (vscode.workspace.getConfiguration().inspect(key)?.defaultValue !== undefined) return true;
  return vscode.extensions.all.some(extension => {
    const configuration = extension.packageJSON?.contributes?.configuration;
    return (Array.isArray(configuration) ? configuration : [configuration]).some(section => Object.hasOwn(section?.properties || {}, key));
  });
}

function selectorLanguages(key) {
  return /^(?:\[[^\[\]]+\])+$/.test(key) ? [...key.matchAll(/\[([^\]]+)\]/g)].map(match => match[1]) : [];
}

// Combined selectors can shadow single-language defaults in named profiles too.
// Only migrate values that this plan manages identically for every language.
function managedLanguageSettings(current, managed) {
  const result = {};
  for (const selector of Object.keys(current)) {
    const ids = selectorLanguages(selector);
    const languages = ids.map(id => managed['[' + id + ']']);
    if (!ids.length || languages.some(value => !value || typeof value !== 'object')) continue;
    const shared = Object.fromEntries(Object.entries(languages[0]).filter(([key, value]) =>
      languages.every(settings => same(settings[key], value))));
    if (Object.keys(shared).length) result[selector] = { ...managed[selector], ...shared };
  }
  return result;
}

// Read JSONC only to locate declared overrides. Effective values always come from
// the editor API, which also accounts for profiles, policies and remote settings.
function parseSettings(content) {
  let quoted = false, escaped = false, stripped = '';
  for (let i = 0; i < content.length; i++) {
    const ch = content[i], next = content[i + 1];
    if (quoted) {
      stripped += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') { quoted = true; stripped += ch; }
    else if (ch === '/' && next === '/') { while (i + 1 < content.length && content[i + 1] !== '\n') i++; stripped += ' '; }
    else if (ch === '/' && next === '*') {
      const end = content.indexOf('*/', i + 2);
      if (end === -1) throw new Error('Incomplete comment');
      i = end + 1; stripped += ' ';
    } else stripped += ch;
  }
  let cleaned = ''; quoted = false; escaped = false;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (!quoted && ch === ',') {
      let after = i + 1;
      while (/\s/.test(stripped[after] || '') && after < stripped.length) after++;
      if (stripped[after] === '}' || stripped[after] === ']') continue;
    }
    cleaned += ch;
    if (quoted && escaped) escaped = false;
    else if (quoted && ch === '\\') escaped = true;
    else if (ch === '"') quoted = !quoted;
  }
  return JSON.parse(cleaned.replace(/^\uFEFF/, ''));
}

function uriLabel(uri) { return uri?.scheme && uri.scheme !== 'file' ? uri.toString() : uri?.fsPath || uri?.path; }
function folderSettingsUri(vscode, uri) {
  if (vscode.Uri?.joinPath) return vscode.Uri.joinPath(uri, '.vscode', 'settings.json');
  if (uri?.fsPath) return { scheme: uri.scheme || 'file', fsPath: path.join(uri.fsPath, '.vscode', 'settings.json') };
}

async function inspectProjectConflicts(vscode, desired) {
  const workspace = vscode.workspace, root = workspace.getConfiguration(undefined, null);
  // Window settings cannot be inspected with a resource/language scope. Doing
  // so floods the real extension host log once for every registered language.
  const windowSettings = new Set(['files.associations']);
  for (const extension of vscode.extensions.all) {
    const configuration = extension.packageJSON?.contributes?.configuration;
    for (const section of Array.isArray(configuration) ? configuration : [configuration]) {
      for (const [key, definition] of Object.entries(section?.properties || {})) {
        if (!definition.scope || ['window', 'application', 'machine', 'machine-overridable'].includes(definition.scope)) windowSettings.add(key);
      }
    }
  }
  const isWindowSetting = key => windowSettings.has(key) || /^(workbench|terminal|explorer|chat|inlineChat|accessibility)\./.test(key);
  const folders = workspace.workspaceFolders || [];
  const sources = [], readErrors = [];
  const userSelectors = Object.fromEntries(Object.keys(root).filter(key => selectorLanguages(key).length)
    .map(key => [key, root.inspect(key)?.globalValue || root.get(key)]));
  async function source(uri, scope, folder, isWorkspaceFile = false) {
    if (!uri) return;
    const label = uriLabel(uri);
    try {
      let bytes;
      if ((!uri.scheme || uri.scheme === 'file') && uri.fsPath) {
        if (!fs.existsSync(uri.fsPath)) return;
        const info = fs.statSync(uri.fsPath);
        if (!info.isFile() || info.size > 8 * 1024 * 1024) throw new Error('Unsupported settings file');
        bytes = fs.readFileSync(uri.fsPath);
      } else if (workspace.fs?.readFile) bytes = await workspace.fs.readFile(uri);
      else return;
      if (bytes.length > 8 * 1024 * 1024) throw new Error('Settings file too large');
      const parsed = parseSettings(Buffer.from(bytes).toString('utf8'));
      const settings = isWorkspaceFile ? parsed.settings || {} : parsed;
      sources.push({ scope, folder, source: label, settings });
    } catch (error) {
      if (!['ENOENT', 'FileNotFound'].includes(error.code)) readErrors.push({ source: label, error: 'settings source could not be read or parsed' });
    }
  }
  await source(workspace.workspaceFile, 'workspace', undefined, true);
  for (const folder of folders) await source(folderSettingsUri(vscode, folder.uri), workspace.workspaceFile ? 'workspace-folder' : 'workspace', uriLabel(folder.uri));
  const keys = new Set(), languages = new Set();
  for (const [key, value] of Object.entries(desired)) {
    const ids = selectorLanguages(key);
    if (ids.length) { ids.forEach(id => languages.add(id)); Object.keys(value || {}).forEach(key => keys.add(key)); }
    else keys.add(key);
  }
  // languageIds is provided by inspect() even for selectors absent from the
  // managed profile; root properties cover combined user selectors as well.
  for (const key of keys) for (const id of root.inspect(key)?.languageIds || []) languages.add(id);
  for (const selector of [...Object.keys(root), ...sources.flatMap(item => Object.keys(item.settings))]) {
    selectorLanguages(selector).forEach(id => languages.add(id));
  }
  try { for (const id of await vscode.languages?.getLanguages?.() || []) languages.add(id); }
  catch { readErrors.push({ source: 'editor languages API', error: 'registered languages could not be enumerated' }); }
  for (const document of workspace.textDocuments || []) if (document.languageId) languages.add(document.languageId);
  const active = vscode.window.activeTextEditor?.document;
  if (active?.languageId) languages.add(active.languageId);
  const contexts = [...(!folders.length || workspace.workspaceFile ? [{ uri: undefined, folder: undefined }] : []),
    ...folders.map(folder => ({ uri: folder.uri, folder: uriLabel(folder.uri) }))];
  if (active?.uri && !folders.length) contexts.push({ uri: active.uri, folder: undefined });
  const conflicts = [], seen = new Set();
  function expected(key, languageId) {
    let value = desired[key];
    if (languageId) {
      for (const [selector, values] of Object.entries(desired)) if (selectorLanguages(selector).includes(languageId) && Object.hasOwn(values || {}, key)) value = values[key];
    }
    return value;
  }
  function add(conflict) {
    const identity = JSON.stringify([conflict.key, conflict.languageId, conflict.scope, conflict.source, conflict.selector, conflict.folder, conflict.actual]);
    if (!seen.has(identity)) { seen.add(identity); conflicts.push(conflict); }
  }
  for (const context of contexts) {
    for (const languageId of [undefined, ...languages]) {
      const config = languageId ? workspace.getConfiguration(undefined, { uri: context.uri, languageId }) : context.uri ? workspace.getConfiguration(undefined, context.uri) : root;
      for (const key of keys) {
        if (languageId && isWindowSetting(key)) continue;
        if (languageId && !/^(editor\.|files\.|prettier\.|oxc\.|antigravity\.|codeium\.)/.test(key)
          && !Object.keys(desired).some(selector => selectorLanguages(selector).includes(languageId) && Object.hasOwn(desired[selector] || {}, key))) continue;
        const want = expected(key, languageId);
        if (want === undefined) continue;
        const scoped = isWindowSetting(key) ? root : config;
        const inspected = scoped.inspect(key), actual = scoped.get(key);
        if (!inspected) continue;
        if (contains(actual, want)) continue;
        // These fields are in the documented precedence order: language
        // overrides win over non-language settings at narrower scopes.
        const levels = [
          ['defaultValue', 'default'], ['globalValue', 'user'], ['workspaceValue', 'workspace'], ['workspaceFolderValue', 'workspace-folder'],
          ['defaultLanguageValue', 'default-language'], ['globalLanguageValue', 'user-language'],
          ['workspaceLanguageValue', 'workspace'], ['workspaceFolderLanguageValue', 'workspace-folder'], ['policyValue', 'policy'],
        ];
        let winning;
        for (const [field, scope] of levels) if (inspected?.[field] !== undefined) winning = { field, scope, value: inspected[field] };
        // A global setting deliberately leaves the IDE's language defaults in
        // effect. They are informational unless this plan explicitly manages
        // that setting for the language. User/project/policy overrides still
        // indicate a real conflict with the managed global value.
        const managedLanguage = languageId && Object.entries(desired).some(([selector, values]) =>
          selectorLanguages(selector).includes(languageId) && Object.hasOwn(values || {}, key));
        const active = winning?.scope !== 'default-language' || !!managedLanguage;
        // The editor may expose the single folder's settings through both
        // workspace and workspace-folder inspect fields. Both refer to the
        // same .vscode/settings.json when no .code-workspace file is open.
        const location = sources.find(item => (item.scope === winning?.scope
          || (!workspace.workspaceFile && folders.length === 1 && item.scope === 'workspace' && winning?.scope === 'workspace-folder'))
          && (!item.folder || item.folder === context.folder));
        const declarations = location?.settings || (winning?.scope === 'user-language' ? userSelectors : undefined);
        const declared = winning?.field.includes('Language') && languageId && declarations ? Object.keys(declarations).filter(selector =>
          selectorLanguages(selector).includes(languageId) && same(declarations[selector]?.[key], winning.value)) : [];
        add({ key, languageId: languageId || null, scope: winning?.scope || 'effective', source: location?.source || null,
          selector: declared.length ? declared.join(', ') : null,
          folder: context.folder || null, expected: want, actual, effective: actual, active });
      }
    }
  }
  // Also expose shadowed declarations, so a later removal of another override
  // does not unexpectedly reactivate a conflicting project preference.
  for (const item of sources) {
    for (const [selector, values] of Object.entries(item.settings)) {
      const ids = selectorLanguages(selector);
      for (const languageId of ids.length ? ids : [undefined]) for (const key of ids.length ? Object.keys(values || {}) : [selector]) {
        if (!keys.has(key)) continue;
        const want = expected(key, languageId), actual = ids.length ? values[key] : values;
        if (want === undefined || contains(actual, want)) continue;
        for (const context of contexts.filter(context => !item.folder || context.folder === item.folder)) {
          const config = languageId ? workspace.getConfiguration(undefined, { uri: context.uri, languageId }) : context.uri ? workspace.getConfiguration(undefined, context.uri) : root;
          const effective = (isWindowSetting(key) ? root : config).get(key);
          add({ key, languageId: languageId || null, scope: item.scope, source: item.source, selector: ids.length ? selector : null,
            folder: context.folder || null, expected: want, actual, effective, active: !contains(effective, want) && same(effective, actual) });
        }
      }
    }
  }
  return { conflicts, checkedLanguages: [...languages].sort(), checkedFolders: folders.map(folder => uriLabel(folder.uri)), readErrors };
}

function readProfile(file) {
  if (!fs.existsSync(file)) return;
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Linked editor profile is unsupported');
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (plan.schema !== 1 || typeof plan.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(plan.requestId)
    || plan.locale !== 'ru' || !plan.settings || Array.isArray(plan.settings) || typeof plan.settings !== 'object') throw new Error('Invalid managed editor profile');
  return plan;
}

async function inspectEditorRuntime(vscode, context, options = {}) {
  const file = options.file || path.join(os.homedir(), '.gemini/config/workstation-setup/editor-profile.json');
  const plan = readProfile(file);
  if (!plan) return { skipped: 'no setup profile' };
  const diagnostics = await inspectProjectConflicts(vscode, { ...plan.settings, ...vendorCompletionSettings(vscode.extensions.all) });
  return { setupVersion: plan.setupVersion, language: vscode.env.language, ...diagnostics,
    status: diagnostics.readErrors.length || diagnostics.conflicts.some(item => item.active) ? 'needs-attention' : 'checked', runtimeSettingsRead: true };
}

async function applyEditorProfile(vscode, context, options = {}) {
  const file = options.file || path.join(os.homedir(), '.gemini/config/workstation-setup/editor-profile.json');
  const plan = readProfile(file);
  if (!plan) return { skipped: 'no setup profile' };
  const alreadyApplied = !options.force && context.globalState.get('editorProfileRequest') === plan.requestId;
  const config = vscode.workspace.getConfiguration(undefined, null);
  const desired = { ...plan.settings, ...vendorCompletionSettings(vscode.extensions.all) };
  if (!options.force && typeof config.inspect('workbench.colorTheme')?.globalValue === 'string') {
    desired['workbench.colorTheme'] = config.inspect('workbench.colorTheme').globalValue;
  }
  Object.assign(desired, managedLanguageSettings(config, desired));
  if (context.globalState.get('editorProfilePreviousSettings')?.requestId !== plan.requestId) {
    await context.globalState.update('editorProfilePreviousSettings', { requestId: plan.requestId,
      settings: Object.keys(desired).map(key => ({ key, value: config.inspect(key)?.globalValue })) });
  }
  const failed = [], overrides = [], applied = [], unavailable = [];
  for (const [key, value] of Object.entries(desired)) {
    try {
      const inspected = config.inspect(key);
      if (!isRegisteredSetting(vscode, key)) {
        unavailable.push(key);
        // Keep version-specific/optional extension keys out of API writes.
        continue;
      }
      const previous = inspected?.globalValue;
      const retiredLanguageOption = /^\[.+\]$/.test(key)
        && Object.hasOwn(previous || {}, 'editor.renderValidationDecorations');
      if (!alreadyApplied && (!contains(previous, value) || retiredLanguageOption)) {
        const next = mergeManagedValue(key, previous, value);
        await config.update(key, next, vscode.ConfigurationTarget.Global);
        applied.push(key);
      }
      if (!contains(vscode.workspace.getConfiguration(undefined, null).get(key), value)) overrides.push(key);
    } catch { failed.push(key); }
  }
  const diagnostics = await inspectProjectConflicts(vscode, Object.fromEntries(Object.entries(desired).filter(([key]) => !unavailable.includes(key))));
  for (const conflict of diagnostics.conflicts) if (conflict.active) {
    const key = conflict.languageId ? '[' + conflict.languageId + '].' + conflict.key : conflict.key;
    if (!overrides.includes(key)) overrides.push(key);
  }
  const restartRequired = !/^ru(?:-|$)/i.test(vscode.env.language);
  const result = { setupVersion: plan.setupVersion, settingsApplied: applied.length, settingsChecked: Object.keys(desired).length - unavailable.length,
    failed, overrides, unavailable, ...diagnostics, language: vscode.env.language, requestedLanguage: plan.locale, restartRequired,
    vendorCompletionSwitches: Object.keys(vendorCompletionSettings(vscode.extensions.all)),
    status: failed.length || overrides.length || diagnostics.readErrors.length ? 'needs-attention' : restartRequired ? 'restart-required' : 'applied' };
  if (alreadyApplied) result.skipped = 'already applied in this IDE profile; verified current values';
  await context.globalState.update('editorProfileStatus', result);
  if (!failed.length) await context.globalState.update('editorProfileRequest', plan.requestId);
  return result;
}

function watchEditorProfile(vscode, context, output, options = {}) {
  const file = options.file || path.join(os.homedir(), '.gemini/config/workstation-setup/editor-profile.json');
  const directory = path.dirname(file);
  let disposed = false, timer, running, rerun = false, pendingForce = false;
  const indicator = vscode.window.createStatusBarItem?.(vscode.StatusBarAlignment?.Right, 20);
  if (indicator) {
    indicator.command = 'workstationStability.inspectConflicts';
    context.subscriptions.push(indicator);
  }
  function showStatus(result) {
    if (!indicator) return;
    if (result.skipped === 'no setup profile') { indicator.hide?.(); return; }
    const count = new Set(result.conflicts?.filter(item => item.active).map(item => JSON.stringify([item.key, item.source, item.selector]))).size;
    const incomplete = result.readErrors?.length;
    indicator.text = count || incomplete ? '$(warning) Workstation: ' + (count || '?') : '$(check) Workstation';
    indicator.tooltip = incomplete ? 'Some settings sources could not be inspected. Click for the read-only report.' : count ? 'Managed settings differ in this editor. Click for exact scope and settings file.' : 'Workstation managed settings checked. Click for the read-only report.';
    indicator.show();
  }
  async function apply(force = false) {
    if (disposed) return;
    if (running) { rerun = true; pendingForce = pendingForce || force; return running; }
    running = applyEditorProfile(vscode, context, { force, file });
    try {
      const result = await running;
      if (!disposed) {
        output.appendLine('Editor profile: ' + JSON.stringify(result));
        showStatus(result);
        if (!result.skipped && !result.failed.length && !result.overrides.length && result.restartRequired) {
          void vscode.window.showInformationMessage('Русский язык выбран. Сохраните работу, полностью закройте все окна Antigravity и откройте IDE снова. Reload Window не меняет язык.');
        }
      }
      return result;
    } catch {
      if (!disposed) output.appendLine('Editor profile failed to apply; rerun setup or use Workstation: Apply and Check Editor Settings.');
    } finally {
      running = undefined;
      if (rerun && !disposed) { rerun = false; schedule(); }
    }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(() => { const forced = pendingForce; pendingForce = false; void apply(forced); }, 600); }
  context.subscriptions.push(vscode.commands.registerCommand('workstationStability.applySettings', () => apply(true)));
  context.subscriptions.push(vscode.commands.registerCommand('workstationStability.inspectConflicts', async () => {
    try {
      const result = await inspectEditorRuntime(vscode, context, { file });
      output.appendLine('Read-only editor settings report: ' + JSON.stringify(result));
      showStatus(result);
      output.show?.(true);
      return result;
    } catch {
      const result = { status: 'failed', error: 'Managed editor profile could not be read. Existing settings were preserved.' };
      output.appendLine(JSON.stringify(result)); output.show?.(true); return result;
    }
  }));
  if (vscode.workspace.onDidChangeConfiguration) context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(schedule));
  if (vscode.workspace.onDidChangeWorkspaceFolders) context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(schedule));
  if (vscode.window.onDidChangeActiveTextEditor) context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(schedule));
  if (fs.existsSync(directory)) {
    const watcher = fs.watch(directory, (_event, filename) => { if (!filename || filename === path.basename(file)) schedule(); });
    watcher.on('error', () => { if (!disposed) output.appendLine('Profile watcher unavailable; settings will be checked at next startup.'); });
    context.subscriptions.push({ dispose() { watcher.close(); } });
  }
  context.subscriptions.push({ dispose() { disposed = true; clearTimeout(timer); } });
  schedule();
}

module.exports = { applyEditorProfile, vendorCompletionSettings, isRegisteredSetting, watchEditorProfile, inspectProjectConflicts, inspectEditorRuntime, managedLanguageSettings, mergeManagedValue };
