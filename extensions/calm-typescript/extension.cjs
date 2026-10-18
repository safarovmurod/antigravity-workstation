'use strict';

const LANGUAGES = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'];
// Values written by releases up to 3.1.x. They are never applied anymore;
// activation restores them so the calm presentation below is the only quiet effect.
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
  'editor.cursorWidth': 3,
  'editor.smoothScrolling': true
};
// Calm diagnostics: errors and warnings keep their squiggles at 95% transparency
// (alpha 0x0D), including the Error Lens text on each affected line.
const COLOR_CONTAINER = 'workbench.colorCustomizations';
const QUIET_COLORS = {
  'editorError.foreground': '#f871710D',
  'editorWarning.foreground': '#fbbf240D',
  'editorInfo.foreground': '#7dd3fc0D',
  'errorLens.errorForeground': '#f871710D',
  'errorLens.warningForeground': '#fbbf240D',
  'errorLens.infoForeground': '#7dd3fc0D',
  'errorLens.hintForeground': '#94a3b80D',
  'errorLens.errorBackground': '#00000000',
  'errorLens.warningBackground': '#00000000',
  'errorLens.infoBackground': '#00000000',
  'errorLens.hintBackground': '#00000000'
};
const CALM_LENS = {
  'errorLens.enabled': true,
  'errorLens.followCursor': 'allLines',
  'errorLens.delay': 500,
  'errorLens.enabledDiagnosticLevels': ['error', 'warning', 'info', 'hint'],
  'errorLens.excludeBySource': [],
  'errorLens.excludeByMessage': []
};
// Same prefix as 3.1.x so originals stored by older releases stay restorable.
const STORE_PREFIX = 'calmTypeScript.v31.managed.';

function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function createExtension(vscode, context) {
  const { window, workspace, commands } = vscode;
  const subscriptions = context.subscriptions;
  const timers = new Map();
  const pulseTimers = new Map();
  const pulseFrames = [0.28, 0.24, 0.20, 0.16, 0.12, 0.08, 0.04];
  const pulses = pulseFrames.map(alpha => window.createTextEditorDecorationType({
    backgroundColor: `rgba(56, 189, 248, ${alpha})`,
    light: { backgroundColor: `rgba(2, 132, 199, ${alpha})` },
    borderRadius: '3px',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  }));
  subscriptions.push(...pulses);

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

  function clearSaves() {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
  }

  function scheduleSave(document) {
    if (!settings().get('autoSaveAfterTyping', true) || document.uri.scheme !== 'file') return;
    const native = workspace.getConfiguration('files', document.uri).get('autoSave', 'off');
    if (native === 'afterDelay') return; // The built-in feature already provides this.
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    const configured = settings().get('autoSaveDelayMs', 1000);
    const delay = Math.max(300, Math.min(10000, Number(configured) || 1000));
    const handle = setTimeout(async () => {
      timers.delete(key);
      if (!document.isDirty || document.isClosed) return;
      if (workspace.getConfiguration('files', document.uri).get('autoSave', 'off') === 'afterDelay') return;
      try {
        await document.save();
      } catch (error) {
        console.warn('Calm TypeScript: Auto Save failed:', error);
      }
    }, delay);
    timers.set(key, handle);
  }

  // Save original user values once; restore only settings that still match our edits.
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

  // 3.1.x stored the whole previous object per language selector.
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

  // Calm colors merge into the user's own customizations; only keys this
  // extension still owns are removed when quiet mode is disabled.
  async function applyCalmColors(enabled) {
    const key = STORE_PREFIX + 'quietColors';
    const config = workspace.getConfiguration();
    const original = context.globalState.get(key);
    const current = config.inspect(COLOR_CONTAINER)?.globalValue;
    const base = (current && typeof current === 'object' && !Array.isArray(current)) ? { ...current } : {};
    if (enabled) {
      {
        // A 3.2.x backup owns only the two squiggle colors. Record the newly
        // managed Error Lens colors before upgrading, so reset remains exact.
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
    // Restore validation flags disabled by older releases. Quiet mode changes
    // presentation only; it never turns off the language service.
    await applyFlat('quietFlags', QUIET_KEYS, false);
    // Undo the 3.1.x writes (hidden squiggles, unused hints and Error Lens
    // languages) whether or not quiet mode stays enabled.
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
      if (!settings().get('autoSaveAfterTyping', true)) clearSaves();
    }).catch(error => console.error('Calm TypeScript: Unable to sync settings:', error));
    return updating;
  }

  subscriptions.push(workspace.onDidChangeTextDocument(event => {
    if (!event.contentChanges.length) return;
    pulseOnType(event);
    scheduleSave(event.document);
  }));
  subscriptions.push(workspace.onDidCloseTextDocument(document => {
    for (const editor of pulseTimers.keys()) if (editor.document === document) clearPulse(editor);
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.delete(key);
  }));
  subscriptions.push(window.onDidChangeActiveTextEditor(() => {
    clearAllPulses();
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
  }});
  syncSettings();
  return { ready: () => updating };
}

function activate(context) {
  return createExtension(require('vscode'), context);
}

function deactivate() { /* VS Code disposes subscriptions and decorations. */ }

module.exports = { activate, deactivate, createExtension };
