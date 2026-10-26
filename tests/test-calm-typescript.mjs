import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extensions/calm-typescript/extension.cjs', import.meta.url), 'utf8');

async function fixture(overrides = {}, missingErrorLens = false) {
  const settings = { 'calmTypeScript.quietMode': false, 'calmTypeScript.smoothTyping': false,
    'calmTypeScript.autoSaveAfterTyping': false, ...overrides };
  const events = {}, commands = new Map(), timers = new Map(), renders = [], styles = [], calls = [];
  let statusBarItems = 0;
  let serial = 0;
  const state = new Map();
  const subscriptions = [];
  const event = name => handler => {
    events[name] = handler;
    return { dispose() { delete events[name]; } };
  };
  const document = { languageId: 'typescript', uri: { scheme: 'file', toString: () => 'file:///sample.ts' },
    isDirty: true, isClosed: false, saved: 0,
    positionAt: offset => ({ line: 0, character: offset }),
    async save() { this.saved++; return true; } };
  const editor = { document, setDecorations(style, ranges) { renders.push({ style: style.id, ranges }); } };
  const vscode = {
    extensions: { getExtension: () => missingErrorLens ? undefined : ({}) },
    ConfigurationTarget: { Global: 1 }, DecorationRangeBehavior: { ClosedClosed: 2 }, StatusBarAlignment: { Right: 2 },
    Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    window: { activeTextEditor: editor,
      createTextEditorDecorationType(options) {
        const style = { id: styles.length, options, disposed: false, dispose() { this.disposed = true; } };
        styles.push(style); return style;
      },
      createStatusBarItem: () => { statusBarItems++; return { show() {}, hide() {}, dispose() {} }; },
      onDidChangeActiveTextEditor: event('editor'),
      showInformationMessage: message => calls.push(message),
      showWarningMessage: message => calls.push(message) },
    workspace: { getConfiguration(section) {
      return { get: (name, fallback) => settings[section ? section + '.' + name : name] ?? fallback,
        inspect: name => ({ globalValue: settings[name] }),
        async update(name, value) { if (value === undefined) delete settings[name]; else settings[name] = value; } };
    }, onDidChangeTextDocument: event('change'), onDidCloseTextDocument: event('close'),
    onDidChangeConfiguration: event('configuration') },
    commands: { registerCommand(name, handler) { commands.set(name, handler); return { dispose: () => commands.delete(name) }; },
      async executeCommand(name) { calls.push(name); } }
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, console,
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id) });
  const context = { subscriptions, globalState: { get: key => state.get(key),
    async update(key, value) { if (value === undefined) state.delete(key); else state.set(key, value); } } };
  const api = module.exports.createExtension(vscode, context);
  await api.ready();
  return { settings, events, timers, renders, styles, calls, document, editor, vscode, commands, state, statusBarItems,
    change(text, reason) { events.change({ document, reason, contentChanges: [{ text, rangeOffset: 1 }] }); },
    async tick() { const first = timers.entries().next().value; if (first) { timers.delete(first[0]); await first[1].callback(); } },
    async refresh() { events.configuration({ affectsConfiguration: () => true }); await api.ready(); },
    dispose() { for (const item of subscriptions) item.dispose(); } };
}

const legacyBackups = () => new Map([
  ['calmTypeScript.v31.managed.quietFlags', {
    'typescript.validate.enable': { hasValue: true, value: true },
    'javascript.validate.enable': { hasValue: true, value: true },
    'typescript.suggestionActions.enabled': { hasValue: false },
    'javascript.suggestionActions.enabled': { hasValue: false },
  }],
  ['calmTypeScript.v31.managed.quietPresentation', { 'problems.visibility': { hasValue: false, value: undefined } }],
  ['calmTypeScript.v31.managed.quietLanguages', {
    '[javascript]': { hasValue: true, value: { 'editor.tabSize': 2 } },
    '[javascriptreact]': { hasValue: false, value: {} },
    '[typescript]': { hasValue: true, value: { 'editor.defaultFormatter': 'esbenp.prettier-vscode' } },
    '[typescriptreact]': { hasValue: false, value: {} },
  }],
  ['calmTypeScript.v31.managed.quietErrorLens', { hasValue: false, value: [] }],
]);

test('Quiet mode upgrades the 3.1.x hidden diagnostics to calm 80% colors and restores validation', async t => {
  const f = await fixture({ 'calmTypeScript.quietMode': true });
  f.settings['typescript.validate.enable'] = false;
  f.settings['javascript.suggestionActions.enabled'] = false;
  f.settings['problems.visibility'] = false;
  f.settings['[typescript]'] = { 'editor.defaultFormatter': 'esbenp.prettier-vscode', 'editor.showUnused': false };
  f.settings['[javascript]'] = { 'editor.tabSize': 2, 'editor.showUnused': false };
  f.settings['[python]'] = { 'editor.tabSize': 4 };
  f.settings['errorLens.excludeLanguages'] = ['python', 'typescript', 'javascript', 'javascriptreact', 'typescriptreact'];
  f.vscode.workspace.__setState?.();
  for (const [key, value] of legacyBackups()) f.state.set(key, value);
  await f.refresh();
  assert.equal(f.settings['typescript.validate.enable'], true, '3.1.x validation damage is repaired');
  assert.equal(f.settings['javascript.suggestionActions.enabled'], undefined);
  assert.equal(f.settings['problems.visibility'], undefined, 'Squiggles become visible again');
  assert.equal(f.settings['[typescript]']['editor.showUnused'], undefined, 'Unused hints become visible again');
  assert.equal(f.settings['[typescript]']['editor.defaultFormatter'], 'esbenp.prettier-vscode', 'Unrelated keys survive');
  assert.equal(f.settings['[javascript]']['editor.tabSize'], 2, 'Unrelated keys survive');
  assert.deepEqual(f.settings['[python]'], { 'editor.tabSize': 4 }, 'Non-managed selectors untouched');
  assert.deepEqual(f.settings['errorLens.excludeLanguages'], ['python'], 'Only the four managed languages are un-excluded');
  const colors = f.settings['workbench.colorCustomizations'];
  assert.equal(colors['editorError.foreground'], '#f8717133');
  assert.equal(colors['editorWarning.foreground'], '#fbbf2433');
  for (const key of ['quietFlags', 'quietPresentation', 'quietLanguages', 'quietErrorLens']) {
    assert.equal(f.state.has('calmTypeScript.v31.managed.' + key), false, key + ' backup cleared');
  }
  assert.equal(f.state.has('calmTypeScript.v31.managed.quietColors'), true, 'Calm colors are owned while enabled');
  f.dispose();
});

test('Missing Error Lens does not block calm colors, smooth typing, or subsequent configuration updates', async t => {
  const f = await fixture({ 'calmTypeScript.quietMode': true, 'calmTypeScript.smoothTyping': true }, true);
  assert.equal(f.settings['workbench.colorCustomizations']['editorError.foreground'], '#f8717133');
  assert.equal(f.settings['workbench.colorCustomizations']['editorWarning.foreground'], '#fbbf2433');
  assert.equal(f.settings['editor.cursorSmoothCaretAnimation'], 'on');
  assert.equal(f.settings['errorLens.excludeLanguages'], undefined);
  f.settings['calmTypeScript.smoothTyping'] = false; await f.refresh();
  assert.equal(f.settings['editor.cursorSmoothCaretAnimation'], undefined);
  assert.equal(f.settings['workbench.colorCustomizations']['editorError.foreground'], '#f8717133', 'Quiet colors stay while quietMode is on');
  f.dispose();
});

test('Quiet mode shows every diagnostic line at 80% transparency and upgrades a 3.2.0 color backup without losing reset values', async () => {
  const f = await fixture({ 'calmTypeScript.quietMode': false,
    'workbench.colorCustomizations': { 'errorLens.errorForeground': '#f8717188', 'custom.foreground': '#abcdef' },
    'errorLens.followCursor': 'activeLine', 'errorLens.excludeByMessage': ['old-hidden-error'] });
  f.state.set('calmTypeScript.v31.managed.quietColors', { 'editorError.foreground': { hasValue: false }, 'editorWarning.foreground': { hasValue: false } });
  f.settings['calmTypeScript.quietMode'] = true; await f.refresh();
  const colors = f.settings['workbench.colorCustomizations'];
  for (const key of ['errorLens.errorForeground', 'errorLens.warningForeground', 'errorLens.infoForeground', 'errorLens.hintForeground']) {
    assert.equal(colors[key].slice(-2), '33');
  }
  assert.equal(f.settings['errorLens.followCursor'], 'allLines');
  assert.equal(f.settings['errorLens.excludeByMessage'].length, 0);
  assert.equal(f.settings['typescript.validate.enable'], undefined, 'Language validation is never disabled');
  f.settings['calmTypeScript.quietMode'] = false; await f.refresh();
  assert.equal(f.settings['workbench.colorCustomizations']['errorLens.errorForeground'], '#f8717188');
  assert.equal(f.settings['workbench.colorCustomizations']['custom.foreground'], '#abcdef');
  assert.equal(f.settings['errorLens.followCursor'], 'activeLine');
  assert.deepEqual(f.settings['errorLens.excludeByMessage'], ['old-hidden-error']);
  f.dispose();
});

test('Calm colors merge into existing customizations and disable restores the owned keys', async t => {
  const f = await fixture({
    'calmTypeScript.quietMode': true,
    'workbench.colorCustomizations': { 'editorLineNumber.foreground': '#111111', 'editorError.foreground': '#ff0000' },
  });
  const colors = f.settings['workbench.colorCustomizations'];
  assert.equal(colors['editorLineNumber.foreground'], '#111111', 'User customizations survive the merge');
  assert.equal(colors['editorError.foreground'], '#f8717133', 'Our value wins while quiet mode is on');
  assert.equal(colors['editorWarning.foreground'], '#fbbf2433');
  f.settings['workbench.colorCustomizations']['editorWarning.foreground'] = '#00ff00';
  f.settings['calmTypeScript.quietMode'] = false; await f.refresh();
  const after = f.settings['workbench.colorCustomizations'];
  assert.equal(after['editorError.foreground'], '#ff0000', 'Original user value restored');
  assert.equal(after['editorWarning.foreground'], '#00ff00', 'A later user edit is preserved');
  assert.equal(after['editorLineNumber.foreground'], '#111111');
  assert.equal(f.state.has('calmTypeScript.v31.managed.quietColors'), false);
  f.dispose();
});

test('Typing pulse survives dirty-state events, fades in seven bounded frames, and supports UTF-16 characters', async t => {
  const f = await fixture();
  f.change('я');
  assert.equal(f.styles.length, 7);
  assert.equal(f.renders.at(-1).ranges[0].end.character, 2);
  const count = f.renders.length;
  f.events.change({ document: f.document, contentChanges: [] });
  assert.equal(f.renders.length, count, 'A dirty-state notification must not erase the pulse');
  assert.equal(f.timers.size, 7);
  assert.equal([...f.timers.values()].at(-1).delay, 280);
  for (let index = 0; index < 7; index++) await f.tick();
  assert.equal(f.timers.size, 0);
  assert.equal(f.renders.filter(item => item.ranges.length).length, 7);
  f.change('😀');
  assert.equal(f.renders.at(-1).ranges[0].end.character, 3);
  assert.equal(f.styles.length, 7, 'Decoration types are reused');
  f.dispose();
  assert.equal(f.timers.size, 0);
  assert.ok(f.styles.every(style => style.disposed));
});

test('Pulse skips Undo/Redo, large pastes and other languages, and clears on editor switch, close and disable', async t => {
  const f = await fixture();
  f.change('x', 1); f.change('x', 2); f.change('long paste'); f.change('\n');
  f.document.languageId = 'python'; f.change('x');
  assert.equal(f.renders.length, 0);
  f.document.languageId = 'typescript';
  f.change('x'); f.events.editor();
  assert.equal(f.timers.size, 0);
  assert.equal(f.renders.at(-1).ranges.length, 0);
  f.change('x'); f.events.close(f.document);
  assert.equal(f.timers.size, 0);
  f.change('x'); f.settings['calmTypeScript.typingPulse'] = false; await f.refresh();
  assert.equal(f.timers.size, 0);
  assert.equal(f.renders.at(-1).ranges.length, 0);
  f.dispose();
});

test('Pause-based save restarts on edits, defers to native Auto Save, and cancels on disable or close', async t => {
  const f = await fixture({ 'calmTypeScript.autoSaveAfterTyping': true, 'calmTypeScript.typingPulse': false,
    'calmTypeScript.autoSaveDelayMs': 650 });
  f.change('x'); f.change('y');
  assert.equal(f.timers.size, 1);
  assert.equal([...f.timers.values()][0].delay, 650);
  await f.tick();
  assert.equal(f.document.saved, 1);
  f.change('x'); f.settings['files.autoSave'] = 'afterDelay'; await f.tick();
  assert.equal(f.document.saved, 1, 'Native delayed save owns the write');
  f.change('x'); assert.equal(f.timers.size, 0);
  f.settings['files.autoSave'] = 'off';
  f.change('x'); f.events.close(f.document); assert.equal(f.timers.size, 0);
  f.change('x'); f.settings['calmTypeScript.autoSaveAfterTyping'] = false; await f.refresh();
  assert.equal(f.timers.size, 0);
  f.document.uri.scheme = 'untitled';
  f.settings['calmTypeScript.autoSaveAfterTyping'] = true;
  f.change('x'); assert.equal(f.timers.size, 0);
  f.dispose();
});

test('The Format button is gone and the reset command restores every managed value', async t => {
  const f = await fixture({ 'calmTypeScript.quietMode': true, 'calmTypeScript.smoothTyping': true });
  assert.equal(f.statusBarItems, 0, 'No status bar item is created anymore');
  assert.equal(f.commands.has('calmTypeScript.formatDocument'), false, 'The format command is removed');
  assert.equal(f.commands.has('calmTypeScript.resetManagedSettings'), true, 'The reset command is registered');
  assert.equal(f.settings['workbench.colorCustomizations']['editorError.foreground'], '#f8717133');
  assert.equal(f.settings['editor.cursorWidth'], 2);
  await f.commands.get('calmTypeScript.resetManagedSettings')();
  assert.equal(f.settings['workbench.colorCustomizations'], undefined, 'Calm colors restored');
  assert.equal(f.settings['editor.cursorWidth'], undefined, 'Smooth keys restored');
  assert.equal(f.settings['editor.cursorSmoothCaretAnimation'], undefined);
  assert.equal(f.settings['editor.cursorBlinking'], undefined);
  assert.equal(f.settings['editor.smoothScrolling'], undefined);
  assert.equal(f.state.has('calmTypeScript.v31.managed.quietColors'), false);
  assert.equal(f.state.has('calmTypeScript.v31.managed.smooth'), false);
  assert.ok(f.calls.some(message => String(message).includes('restored')), 'The user is told the reset happened');
  f.dispose();
});
