'use strict';

const LANGUAGES = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'];
const LEGACY_OVERRIDE = { 'editor.showUnused': false };
const QUIET_KEYS = {
  'typescript.validate.enable': false,
  'javascript.validate.enable': false,
  'typescript.suggestionActions.enabled': false,
  'javascript.suggestionActions.enabled': false
};
const SMOOTH_KEYS = {
  'editor.cursorSmoothCaretAnimation': 'on',
  'editor.cursorBlinking': 'smooth',
  'editor.cursorWidth': 2,
  'editor.smoothScrolling': true
};
const COLOR_CONTAINER = 'workbench.colorCustomizations';
const QUIET_COLORS = {
  'editorError.foreground': '#f8717126',
  'editorWarning.foreground': '#fbbf2426',
  'editorInfo.foreground': '#7dd3fc26',
  'errorLens.errorForeground': '#f8717126',
  'errorLens.warningForeground': '#fbbf2426',
  'errorLens.infoForeground': '#7dd3fc26',
  'errorLens.hintForeground': '#94a3b826',
  'errorLens.errorForegroundLight': '#f8717126',
  'errorLens.warningForegroundLight': '#fbbf2426',
  'errorLens.infoForegroundLight': '#7dd3fc26',
  'errorLens.hintForegroundLight': '#94a3b826',
  'errorLens.errorBackground': '#00000000',
  'errorLens.warningBackground': '#00000000',
  'errorLens.infoBackground': '#00000000',
  'errorLens.hintBackground': '#00000000',
  'errorLens.errorBackgroundLight': '#00000000',
  'errorLens.warningBackgroundLight': '#00000000',
  'errorLens.infoBackgroundLight': '#00000000',
  'errorLens.hintBackgroundLight': '#00000000',
  'errorLens.errorMessageBackground': '#00000000',
  'errorLens.warningMessageBackground': '#00000000',
  'errorLens.infoMessageBackground': '#00000000',
  'errorLens.hintMessageBackground': '#00000000',
  'errorLens.errorRangeBackground': '#00000000',
  'errorLens.warningRangeBackground': '#00000000',
  'errorLens.infoRangeBackground': '#00000000',
  'errorLens.hintRangeBackground': '#00000000'
};
const CALM_LENS = {
  'errorLens.enabled': true,
  'errorLens.followCursor': 'allLines',
  'errorLens.delay': 500,
  'errorLens.enabledDiagnosticLevels': ['error', 'warning', 'info', 'hint'],
  'errorLens.excludeBySource': [],
  'errorLens.excludeByMessage': []
};
const STORE_PREFIX = 'calmTypeScript.v31.managed.';

function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function createExtension(vscode, context) {
  const { window, workspace, commands } = vscode;
  const subscriptions = context.subscriptions;
  const timers = new Map();
  const pulseTimers = new Map();
  // Half the earlier strength: the typed character is still traceable, but a
  // fast typist no longer sees a blinking strip along the line.
  const pulseFrames = [0.14, 0.12, 0.10, 0.08, 0.06, 0.04, 0.02];
  const pulses = pulseFrames.map(alpha => window.createTextEditorDecorationType({
    backgroundColor: `rgba(56, 189, 248, ${alpha})`,
    light: { backgroundColor: `rgba(2, 132, 199, ${alpha})` },
    borderRadius: '3px',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  }));
  subscriptions.push(...pulses);
  // A manual save (Ctrl+S) softly washes the cursor lines green for 300 ms.
  // Auto Save and this extension's own pause-based save stay silent, so the
  // editor never flashes while the user is only typing.
  const saveFrames = [0.10, 0.08, 0.06, 0.04, 0.02];
  const savePulses = saveFrames.map(alpha => window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: `rgba(74, 222, 128, ${alpha})`,
    light: { backgroundColor: `rgba(22, 163, 74, ${alpha})` }
  }));
  subscriptions.push(...savePulses);
  const saveTimers = new Map();
  const manualSaves = new Set();
  const ownSaves = new Set();
  const MANUAL_SAVE = vscode.TextDocumentSaveReason?.Manual ?? 1;

  function settings() {
    return workspace.getConfiguration('calmTypeScript');
  }

  function clearPulse(editor) {
    const pending = pulseTimers.get(editor);
    if (pending) pending.forEach(clearTimeout);
    pulseTimers.delete(editor);
    for (const style of pulses) editor.setDecorations(style, []);
  }

  function clearAllPulses() {
    for (const editor of pulseTimers.keys()) clearPulse(editor);
  }

  function pulseOnType(event) {
    clearAllPulses();
    if (!settings().get('typingPulse', true)) return;
    if (event.reason !== undefined || !LANGUAGES.includes(event.document.languageId)) return;
    if (event.contentChanges.length !== 1) return;
    const change = event.contentChanges[0];
    if (!change.text || change.text.length > 2 || /[\r\n]/.test(change.text)) return;
    const editor = window.activeTextEditor;
    if (!editor || editor.document !== event.document) return;
    const start = event.document.positionAt(change.rangeOffset);
    const end = event.document.positionAt(change.rangeOffset + change.text.length);
    if (start.line !== end.line) return;
    const range = new vscode.Range(start, end);
    editor.setDecorations(pulses[0], [range]);
    const sequence = pulseFrames.map((_, index) => setTimeout(() => {
      editor.setDecorations(pulses[index], []);
      if (index + 1 < pulses.length) editor.setDecorations(pulses[index + 1], [range]);
      else pulseTimers.delete(editor);
    }, (index + 1) * 40));
    pulseTimers.set(editor, sequence);
  }

  function clearSavePulse(editor) {
    const pending = saveTimers.get(editor);
    if (pending) pending.forEach(clearTimeout);
    saveTimers.delete(editor);
    for (const style of savePulses) editor.setDecorations(style, []);
  }

  function clearAllSavePulses() {
    for (const editor of saveTimers.keys()) clearSavePulse(editor);
  }

  function pulseOnSave(document) {
    if (!manualSaves.delete(document) || !settings().get('savePulse', true)) return;
    const editor = window.activeTextEditor;
    if (!editor || editor.document !== document || !editor.selections?.length) return;
    clearSavePulse(editor);
    const ranges = editor.selections.map(selection => new vscode.Range(selection.active, selection.active));
    editor.setDecorations(savePulses[0], ranges);
    const sequence = saveFrames.map((_, index) => setTimeout(() => {
      editor.setDecorations(savePulses[index], []);
      if (index + 1 < savePulses.length) editor.setDecorations(savePulses[index + 1], ranges);
      else saveTimers.delete(editor);
    }, (index + 1) * 60));
    saveTimers.set(editor, sequence);
  }

  function clearSaves() {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
  }

  function scheduleSave(document) {
    if (!settings().get('autoSaveAfterTyping', true) || document.uri.scheme !== 'file') return;
    const native = workspace.getConfiguration('files', document.uri).get('autoSave', 'off');
    if (native === 'afterDelay') return;
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    const configured = settings().get('autoSaveDelayMs', 1000);
    const delay = Math.max(300, Math.min(10000, Number(configured) || 1000));
    const handle = setTimeout(async () => {
      timers.delete(key);
      if (!document.isDirty || document.isClosed) return;
      if (workspace.getConfiguration('files', document.uri).get('autoSave', 'off') === 'afterDelay') return;
      ownSaves.add(document);
      try {
        await document.save();
      } catch (error) {
        console.warn('Calm TypeScript: Auto Save failed:', error);
      } finally {
        ownSaves.delete(document);
      }
    }, delay);
    timers.set(key, handle);
  }

  async function applyFlat(group, changes, enabled) {
    const key = STORE_PREFIX + group;
    const config = workspace.getConfiguration();
    const original = context.globalState.get(key);
    if (enabled) {
      if (!original) {
        const backup = {};
        for (const name of Object.keys(changes)) {
          const old = config.inspect(name)?.globalValue;
          backup[name] = { hasValue: old !== undefined, value: old };
        }
        await context.globalState.update(key, backup);
      }
      for (const [name, value] of Object.entries(changes)) {
        if (!equal(config.inspect(name)?.globalValue, value)) {
          await config.update(name, value, vscode.ConfigurationTarget.Global);
        }
      }
    } else if (!enabled && original) {
      for (const [name, value] of Object.entries(changes)) {
        if (equal(config.inspect(name)?.globalValue, value)) {
          const before = original[name];
          await config.update(name, before.hasValue ? before.value : undefined, vscode.ConfigurationTarget.Global);
        }
      }
      await context.globalState.update(key, undefined);
    }
  }

  async function restoreLegacyLanguages() {
    const key = STORE_PREFIX + 'quietLanguages';
    const original = context.globalState.get(key);
    if (!original) return;
    const config = workspace.getConfiguration();
    for (const language of LANGUAGES) {
      const name = `[${language}]`;
      const current = { ...(config.inspect(name)?.globalValue || {}) };
      const previous = original[name]?.value || {};
      for (const [setting, quietValue] of Object.entries({ ...LEGACY_OVERRIDE, 'editor.renderValidationDecorations': 'off' })) {
        if (!equal(current[setting], quietValue)) continue;
        if (Object.prototype.hasOwnProperty.call(previous, setting)) current[setting] = previous[setting];
        else delete current[setting];
      }
      await config.update(name, Object.keys(current).length ? current : undefined, vscode.ConfigurationTarget.Global);
    }
    await context.globalState.update(key, undefined);
  }

  async function restoreLegacyErrorLens() {
    const lensKey = STORE_PREFIX + 'quietErrorLens';
    const lensPrevious = context.globalState.get(lensKey);
    if (!lensPrevious) return;
    const config = workspace.getConfiguration();
    if (vscode.extensions.getExtension('usernamehw.errorlens')) {
      const lensSettings = config.inspect('errorLens.excludeLanguages');
      if (lensSettings) {
        const current = Array.isArray(lensSettings.globalValue) ? lensSettings.globalValue : [];
        const added = LANGUAGES.filter(language => !lensPrevious.value.includes(language));
        const after = current.filter(language => !added.includes(language));
        await config.update('errorLens.excludeLanguages',
          after.length || lensPrevious.hasValue ? after : undefined,
          vscode.ConfigurationTarget.Global);
      }
    }
    await context.globalState.update(lensKey, undefined);
  }

  async function applyCalmColors(enabled) {
    const key = STORE_PREFIX + 'quietColors';
    const config = workspace.getConfiguration();
    const original = context.globalState.get(key);
    const current = config.inspect(COLOR_CONTAINER)?.globalValue;
    const base = (current && typeof current === 'object' && !Array.isArray(current)) ? { ...current } : {};
    if (enabled) {
      {
        const backup = { ...original };
        for (const color of Object.keys(QUIET_COLORS)) {
          if (!Object.hasOwn(backup, color)) backup[color] = { hasValue: Object.hasOwn(base, color), value: base[color] };
        }
        if (!equal(backup, original)) await context.globalState.update(key, backup);
      }
      const next = { ...base, ...QUIET_COLORS };
      if (!equal(base, next)) await config.update(COLOR_CONTAINER, next, vscode.ConfigurationTarget.Global);
      return;
    }
    if (!original) return;
    let changed = false;
    for (const [color, value] of Object.entries(QUIET_COLORS)) {
      if (!equal(base[color], value)) continue;
      const before = original[color];
      if (before && before.hasValue) base[color] = before.value;
      else delete base[color];
      changed = true;
    }
    if (changed) await config.update(COLOR_CONTAINER, Object.keys(base).length ? base : undefined, vscode.ConfigurationTarget.Global);
    await context.globalState.update(key, undefined);
  }

  async function applyQuiet(enabled) {
    await applyFlat('quietFlags', QUIET_KEYS, false);
    await applyFlat('quietPresentation', { 'problems.visibility': false }, false);
    await restoreLegacyLanguages();
    await restoreLegacyErrorLens();
    await applyCalmColors(enabled);
    if (vscode.extensions.getExtension('usernamehw.errorlens')) await applyFlat('calmLens', CALM_LENS, enabled);
  }

  let updating = Promise.resolve();
  function syncSettings() {
    updating = updating.then(async () => {
      await applyQuiet(settings().get('quietMode', true));
      await applyFlat('smooth', SMOOTH_KEYS, settings().get('smoothTyping', true));
      if (!settings().get('typingPulse', true)) clearAllPulses();
      if (!settings().get('savePulse', true)) clearAllSavePulses();
      if (!settings().get('autoSaveAfterTyping', true)) clearSaves();
    }).catch(error => console.error('Calm TypeScript: Unable to sync settings:', error));
    return updating;
  }

  subscriptions.push(workspace.onDidChangeTextDocument(event => {
    if (!event.contentChanges.length) return;
    pulseOnType(event);
    scheduleSave(event.document);
  }));
  // The will-save listener only records the reason and returns at once; it
  // never calls waitUntil, so it cannot delay or time out a save.
  subscriptions.push(workspace.onWillSaveTextDocument(event => {
    if (event.reason === MANUAL_SAVE && !ownSaves.has(event.document)) manualSaves.add(event.document);
    else manualSaves.delete(event.document);
  }));
  subscriptions.push(workspace.onDidSaveTextDocument(pulseOnSave));
  subscriptions.push(workspace.onDidCloseTextDocument(document => {
    for (const editor of pulseTimers.keys()) if (editor.document === document) clearPulse(editor);
    for (const editor of saveTimers.keys()) if (editor.document === document) clearSavePulse(editor);
    manualSaves.delete(document);
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.delete(key);
  }));
  subscriptions.push(window.onDidChangeActiveTextEditor(() => {
    clearAllPulses();
    clearAllSavePulses();
  }));
  subscriptions.push(workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('calmTypeScript')) syncSettings();
  }));
  subscriptions.push(commands.registerCommand('calmTypeScript.resetManagedSettings', async () => {
    try {
      await applyQuiet(false);
      await applyFlat('smooth', SMOOTH_KEYS, false);
      clearAllPulses();
      clearSaves();
      void window.showInformationMessage('Calm TypeScript: managed editor values were restored to your originals. They are reapplied only while the matching Calm TypeScript settings are enabled.');
    } catch (error) {
      window.showWarningMessage(`Calm TypeScript: Reset failed: ${String(error.message || error)}`);
    }
  }));

  subscriptions.push({ dispose() {
    clearSaves();
    clearAllPulses();
    clearAllSavePulses();
  }});
  syncSettings();
  return { ready: () => updating };
}

function activate(context) {
  return createExtension(require('vscode'), context);
}

function deactivate() {   }

module.exports = { activate, deactivate, createExtension, QUIET_COLORS, CALM_LENS, SMOOTH_KEYS };
