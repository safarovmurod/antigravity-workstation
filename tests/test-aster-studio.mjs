import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..'), source = path.join(root, 'extensions/aster-appearance');
const fonts = require('../extensions/aster-appearance/fonts.json'), themes = require('../extensions/aster-appearance/themes.cjs');
const swatches = require('../extensions/aster-appearance/swatches.cjs');
const { FONT_STYLES, STYLE_RULE, validate } = require('../extensions/aster-appearance/appearance.cjs');

// A small fake of the studio webview DOM: elements keep their listeners, so a
// click or a key press runs the panel's own handlers.
function fakePanel(saved) {
  const nodes = new Map(), handlers = {}, posted = [], states = [];
  const element = tag => ({ tag, value: '', textContent: '', className: '', hidden: false, disabled: false, tabIndex: 0, children: [], options: [], dataset: {}, attributes: {}, listeners: {},
    style: { setProperty(key, value) { this[key] = value; } },
    setAttribute(key, value) { this.attributes[key] = String(value); },
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
    fire(type, extra = {}) { for (const handler of this.listeners[type] || []) handler({ currentTarget: this, target: this, preventDefault() {}, ...extra }); },
    click() { if (!this.disabled) this.fire('click'); }, focus() { context.document.activeElement = this; },
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; this.options = items.flatMap(item => item.tag === 'optgroup' ? item.children : [item]); } });
  const node = id => { if (!nodes.has(id)) nodes.set(id, element('#' + id)); return nodes.get(id); };
  const context = vm.createContext({
    acquireVsCodeApi: () => ({ postMessage(value) { posted.push(value); }, getState: () => saved, setState(value) { states.push(structuredClone(value)); } }),
    document: { getElementById: node, createElement: element, fonts: { add() {} }, activeElement: null },
    window: { addEventListener: (type, handler) => handlers[type] = handler, scrollTo(x, y) { context.window.scrollY = y; }, scrollY: 0 },
    Option: function (text, value) { this.text = text; this.value = value; }, FontFace: function () { this.load = async () => this; }, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(source, 'panel.js'), 'utf8'), context);
  const cards = () => node('gallery').children.flatMap(group => group.children[1].children);
  const card = value => cards().find(item => item.dataset.value === value && !(item === cards()[0] && node('gallery').children[0].hidden));
  return { node, handlers, posted, states, cards, card, context };
}
const options = () => [{ label: 'Antigravity Dark', value: 'Antigravity Dark', kind: 'dark', builtin: true, group: 'antigravity' },
  ...themes.THEMES.map(theme => ({ label: theme.name, value: theme.name, kind: theme.type, builtin: false, group: 'aster' }))]
  .map(option => ({ ...option, section: swatches.section(option, themes.find(option.value)), swatch: option.builtin ? swatches.builtinSwatch(option, []) : swatches.asterSwatch(themes.find(option.value)) }));
const fontOptions = fonts.map(font => ({ ...font, files: undefined, preview: [] }));
const applied = (patch = {}) => ({ theme: 'One Dark Pro', current: null, availability: {}, family: "'JetBrains Mono', monospace", size: 15, weight: '400', style: 'normal',
  brightness: 0, contrast: 0, uiFont: false, profileScope: { status: 'application-scoped' }, ...patch });
async function opened(saved, bundledFonts = fontOptions) {
  const panel = fakePanel(saved);
  panel.node('style').replaceChildren(...FONT_STYLES.map(style => ({ value: style.value })));
  await panel.handlers.message({ data: { type: 'init', themes: options(), sections: swatches.SECTIONS, fonts: bundledFonts, styles: FONT_STYLES, state: applied() } });
  return panel;
}

test('a theme card applies at once, and the state that follows patches the page without rebuilding it', async () => {
  const { node, handlers, posted, cards, card, context } = await opened();
  const gallery = node('gallery').children, built = cards();
  assert.deepEqual(gallery.slice(1).map(group => group.children[0].children[0].textContent), swatches.SECTIONS.filter(item => item.name !== 'VS Code').map(item => item.name));
  assert.equal(card('One Dark Pro').className, 'card applied');
  card('Light Owl').focus(); card('Light Owl').click();
  assert.deepEqual(posted.filter(message => message.type === 'apply-theme').map(message => message.value), ['Light Owl'], 'one click applies, no Apply button');
  assert.match(card('Light Owl').className, /pending/);
  context.window.scrollY = 640;
  await handlers.message({ data: { type: 'state', ...applied({ theme: 'Light Owl' }) } });
  await handlers.message({ data: { type: 'result', action: 'apply-theme', message: 'Тема применена.' } });
  assert.equal(node('gallery').children, gallery, 'the gallery is not rebuilt');
  assert.deepEqual(cards(), built, 'every card is the same element');
  assert.equal(context.window.scrollY, 640, 'the scroll position stays');
  assert.equal(context.document.activeElement, card('Light Owl'), 'focus stays on the chosen card');
  assert.equal(card('Light Owl').className, 'card applied');
  assert.equal(card('One Dark Pro').className, 'card');
  card('Light Owl').click();
  assert.equal(posted.filter(message => message.type === 'apply-theme').length, 1, 'the applied theme is not applied again');
});

test('arrow keys move between cards without applying; a theme chosen elsewhere shows as the current card', async () => {
  const { node, handlers, posted, card, context } = await opened();
  card('One Dark Pro').fire('keydown', { key: 'ArrowRight' });
  assert.notEqual(context.document.activeElement, card('One Dark Pro'));
  assert.equal(posted.filter(message => message.type === 'apply-theme').length, 0);
  assert.equal(node('gallery').children[0].hidden, true);
  await handlers.message({ data: { type: 'state', ...applied({ theme: 'Personal Theme', current: { label: 'Personal Theme', value: 'Personal Theme', swatch: {} } }) } });
  assert.equal(node('gallery').children[0].hidden, false);
  assert.equal(node('gallery').children[0].children[1].children[0].dataset.value, 'Personal Theme');
});

test('the page restores its scroll position after the IDE rebuilds a hidden studio', async () => {
  const { states, context } = await opened({ scrollY: 812 });
  assert.equal(context.window.scrollY, 812);
  assert.ok(Array.isArray(states));
});

test('brightness and contrast stay pending until their own Apply button, which always sends them', async () => {
  const { node, handlers, posted } = await opened();
  assert.equal(node('applyTune').disabled, true, 'nothing pending');
  node('brightness').value = '10'; node('brightness').fire('input');
  assert.equal(node('applyTune').disabled, false);
  assert.match(node('tuneHint').textContent, /Не применено/);
  await handlers.message({ data: { type: 'state', ...applied({ size: 16 }) } });
  assert.equal(node('brightness').value, '10', 'an unrelated refresh keeps the pending value');
  node('applyTune').click();
  assert.deepEqual(JSON.parse(JSON.stringify(posted.filter(message => message.type === 'apply-tune'))), [{ type: 'apply-tune', brightness: 10, contrast: 0 }]);
  assert.equal(node('applyTune').disabled, true, 'busy while applying');
  await handlers.message({ data: { type: 'state', ...applied({ brightness: 10 }) } });
  await handlers.message({ data: { type: 'result', action: 'apply-tune', message: 'ok' } });
  assert.equal(node('applyTune').disabled, true, 'applied, nothing pending');
  node('contrast').value = '-5'; node('contrast').fire('input');
  assert.equal(node('applyTune').disabled, false, 'the button works again after an apply');
  await handlers.message({ data: { type: 'state', ...applied({ theme: 'Antigravity Dark', brightness: 10 }) } });
  assert.equal(node('applyTune').disabled, true, 'only Aster palettes are tuned');
  assert.equal(node('brightness').disabled, true);
});

test('the font section previews the chosen font and keeps a pending font until Apply or Cancel', async () => {
  const { node, handlers, posted } = await opened();
  assert.equal(node('font').value, 'jetbrainsmono');
  await handlers.message({ data: { type: 'state', ...applied({ weight: 'bold' }) } });
  assert.equal(node('weight').value, 700); assert.equal(node('preview').style.fontWeight, 700);
  assert.match(node('preview').style.fontFamily, /AsterPreview-jetbrainsmono/, 'the bundled file shows the font with its ligatures');
  node('size').value = 30;
  await handlers.message({ data: { type: 'state', ...applied({ size: 18 }) } });
  assert.equal(node('size').value, 30, 'a pending edit survives a refresh');
  assert.equal(node('applyFont').disabled, false);
  assert.equal(posted.filter(message => message.type === 'apply-font').length, 0, 'editing alone never applies a font');
  await handlers.message({ data: { type: 'state', ...applied({ family: 'Personal Mono, monospace' }) } });
  node('cancelFont').click();
  assert.equal(node('font').value, '');
  assert.equal(node('preview').style.fontFamily, 'Personal Mono, monospace');
  assert.match(node('availability').textContent, /Текущий шрифт редактора/);
});

test('seven style choices preview actual weight and slant, survive state reload and yield to a manual weight', async () => {
  assert.deepEqual(FONT_STYLES.map(style => style.value), ['normal', 'italic', 'light', 'medium', 'semibold', 'bold', 'bold-italic']);
  const schema = require('../extensions/aster-appearance/package.json').contributes.configuration.properties['asterAppearance.fontStyle'];
  assert.deepEqual(schema.enum, FONT_STYLES.map(style => style.value));
  for (const style of FONT_STYLES) {
    const { node, handlers, posted } = await opened();
    validate({ key: 'style', value: style.value }, [], fonts);
    node('style').value = style.value; node('style').fire('input');
    const weight = style.weight || 400;
    assert.equal(Number(node('weight').value), weight);
    assert.equal(Number(node('preview').style.fontWeight), weight);
    assert.equal(node('preview').style.fontStyle, style.italic ? 'italic' : 'normal');
    node('size').value = 18; node('size').fire('input');
    node('applyFont').click();
    assert.equal(posted.at(-1).style, style.value);
    assert.equal(posted.at(-1).weight, weight);
    await handlers.message({ data: { type: 'state', ...applied({ size: 18, style: style.value, weight: String(weight) }) } });
    await handlers.message({ data: { type: 'result', action: 'apply-font', message: 'ok' } });
    assert.equal(node('applyFont').disabled, true);
    assert.equal(node('style').value, style.value);
    const reopened = await opened();
    await reopened.handlers.message({ data: { type: 'state', ...applied({ style: style.value, weight: String(weight) }) } });
    assert.equal(reopened.node('style').value, style.value);
    assert.equal(reopened.node('preview').style.fontStyle, style.italic ? 'italic' : 'normal');
    node('weight').value = 800; node('weight').fire('input');
    assert.equal(node('style').value, style.italic ? 'italic' : 'normal');
    assert.equal(Number(node('preview').style.fontWeight), 800);
  }
});

test('a font disables unsupported weight presets and a family change clamps the preview without a false preset', async () => {
  const limited = { ...fontOptions[0], id: 'limited', family: 'Limited Fixture', minWeight: 400, maxWeight: 700 };
  const { node } = await opened(undefined, [...fontOptions, limited]);
  node('style').value = 'light'; node('style').fire('input');
  assert.equal(Number(node('preview').style.fontWeight), 300);
  node('font').value = 'limited'; node('font').fire('change');
  assert.equal(node('style').options.find(option => option.value === 'light').disabled, true);
  assert.equal(node('style').options.find(option => option.value === 'bold').disabled, false);
  assert.equal(node('style').value, 'normal');
  assert.equal(Number(node('preview').style.fontWeight), 400);
  node('font').value = 'jetbrainsmono'; node('font').fire('change');
  assert.equal(node('style').options.find(option => option.value === 'light').disabled, false);
});

test('every font previews its configured ligatures and Cancel restores the applied feature set', async () => {
  const defaults = '"liga" 1, "calt" 1';
  for (const font of fonts) {
    const { node, handlers } = await opened();
    node('font').value = font.id; node('font').fire('change');
    assert.equal(node('preview').style.fontFeatureSettings, font.fontFeatures || defaults, font.family);
    node('cancelFont').click();
    assert.equal(node('font').value, 'jetbrainsmono');
    assert.equal(node('preview').style.fontFeatureSettings, defaults);
    await handlers.message({ data: { type: 'state', ...applied({ family: "'" + font.family + "', monospace" }) } });
    assert.equal(node('font').value, font.id);
    assert.equal(node('preview').style.fontFeatureSettings, font.fontFeatures || defaults);
    node('font').value = 'jetbrainsmono'; node('font').fire('change');
    assert.equal(node('preview').style.fontFeatureSettings, defaults);
    node('cancelFont').click();
    assert.equal(node('font').value, font.id);
    assert.equal(node('preview').style.fontFeatureSettings, font.fontFeatures || defaults, 'cancel restores ' + font.family);
  }
});

// The extension with a fake IDE: the studio page is written once; every later
// change arrives as a state message.
function host(values = {}, service = {}, bundledFonts = fonts) {
  const commands = new Map(), posted = [], writes = [], notices = [];
  let receive, htmlWrites = 0;
  const webview = { cspSource: 'csp', asWebviewUri: uri => uri, postMessage: async value => { posted.push(value); return true; },
    onDidReceiveMessage: callback => { receive = callback; return { dispose() {} }; } };
  Object.defineProperty(webview, 'html', { set() { htmlWrites++; }, get() { return ''; } });
  const vscode = { ConfigurationTarget: { Global: 1 }, version: '1.107.0', env: { appRoot: os.tmpdir() }, extensions: { all: [] },
    Uri: { file: file => ({ fsPath: file, toString: () => file }) }, ViewColumn: { One: 1 },
    commands: { registerCommand: (name, callback) => { commands.set(name, callback); return { dispose() {} }; } },
    window: { visibleTextEditors: [], createWebviewPanel: () => ({ webview, onDidDispose: () => ({ dispose() {} }), reveal() {}, dispose() {} }),
      showErrorMessage: message => assert.fail(message), showInformationMessage: message => notices.push(message) },
    workspace: { onDidChangeConfiguration: () => ({ dispose() {} }), getConfiguration: () => ({ get: key => values[key], inspect: key => ({ globalValue: values[key] }),
      update: async (key, value) => { writes.push(key); values[key] = structuredClone(value); } }) } };
  const fontService = { installed: async () => Object.fromEntries(fonts.map(font => [font.id, true])), recorded: () => [], ensureBundled: async () => ({ added: [], failed: [] }), ...service };
  const module = { exports: {} }, nativeRequire = createRequire(path.join(source, 'extension.cjs'));
  const loader = name => name === 'vscode' ? vscode : name === './fonts.json' ? bundledFonts : name === './font-service.cjs' ? fontService
    : name === './profiles.cjs' ? { ensureAllProfiles: async () => ({ status: 'application-scoped' }) } : nativeRequire(name);
  vm.runInNewContext(fs.readFileSync(path.join(source, 'extension.cjs'), 'utf8'), { module, exports: module.exports, require: loader, setTimeout, clearTimeout, console });
  const context = { extensionPath: source, subscriptions: [], globalStorageUri: { fsPath: os.tmpdir() }, globalState: { get: () => undefined, update: async () => {} } };
  const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(resolve => setImmediate(resolve)); };
  return { module, context, commands, posted, writes, values, notices, settle, receive: message => receive(message), htmlWrites: () => htmlWrites };
}

test('choosing a theme in the studio writes it at once and answers with a state patch, never new HTML', async () => {
  const ide = host({ 'workbench.colorTheme': 'Visual Studio Dark', 'asterAppearance.theme': 'One Dark Pro' });
  await ide.module.exports.activate(ide.context);
  await ide.commands.get('asterAppearance.open')();
  ide.receive({ type: 'ready' }); await ide.settle();
  assert.equal(ide.posted.filter(message => message.type === 'init').length, 1);
  assert.equal(ide.htmlWrites(), 1);
  ide.posted.length = 0;
  ide.receive({ type: 'apply-theme', value: 'Tokyo Night' }); await ide.settle();
  assert.equal(ide.values['asterAppearance.theme'], 'Tokyo Night');
  assert.deepEqual(ide.posted.map(message => message.type), ['state', 'result']);
  assert.equal(ide.posted[0].theme, 'Tokyo Night');
  assert.equal(ide.htmlWrites(), 1, 'the page is never rewritten');
  ide.receive({ type: 'apply-tune', brightness: 10, contrast: -5 }); await ide.settle();
  assert.equal(ide.values['asterAppearance.brightness'], 10); assert.equal(ide.values['asterAppearance.contrast'], -5);
  assert.equal(ide.posted.at(-1).message, 'Яркость и контраст применены.');
  await ide.commands.get('asterAppearance.open')();
  assert.equal(ide.htmlWrites(), 1, 'opening an open studio only reveals it');
});

test('applying a font switches its coding ligatures on', async () => {
  const ide = host({ 'workbench.colorTheme': 'Visual Studio Dark', 'editor.fontLigatures': false });
  await ide.module.exports.activate(ide.context);
  await ide.commands.get('asterAppearance.open')();
  ide.receive({ type: 'apply-font', font: 'firacode', size: 15, weight: 400, style: 'normal', uiFont: false });
  await ide.settle();
  ide.receive({ type: 'probe-result', id: ide.posted.find(message => message.type === 'probe').id, loaded: true }); await ide.settle();
  assert.equal(ide.values['editor.fontLigatures'], true);
  assert.equal(ide.values['editor.fontFamily'], "'Fira Code', monospace");
  assert.match(ide.posted.at(-1).message, /^Шрифт применён\./);
});

test('Apply enables each bundled font feature set and switching back removes the previous font feature overrides', async () => {
  const ide = host({ 'workbench.colorTheme': 'Visual Studio Dark', 'editor.fontLigatures': false });
  await ide.module.exports.activate(ide.context);
  await ide.commands.get('asterAppearance.open')();
  const apply = async font => {
    ide.receive({ type: 'apply-font', font: font.id, size: 15, weight: 400, style: 'normal', uiFont: false });
    await ide.settle();
    const request = ide.posted.filter(message => message.type === 'probe').at(-1);
    ide.receive({ type: 'probe-result', id: request.id, loaded: true }); await ide.settle();
    assert.equal(ide.values['editor.fontLigatures'], font.fontFeatures || true, font.family);
    assert.equal(ide.values['editor.fontFamily'], "'" + font.family + "', monospace");
    assert.ok(!ide.posted.at(-1).error);
  };
  for (const font of fonts) {
    await apply(font);
    await apply(fonts[0]);
    assert.equal(ide.values['editor.fontLigatures'], true, 'original family restores its default features');
  }
});

test('every style applies real weight and code slant, and restart keeps personal rules and the chosen style', async () => {
  for (const style of FONT_STYLES) {
    const personal = { name: 'personal colour', scope: 'comment', settings: { foreground: '#123456' } };
    const ide = host({ 'workbench.colorTheme': 'Visual Studio Dark', 'editor.tokenColorCustomizations': { textMateRules: [personal] },
      'editor.semanticTokenColorCustomizations': { rules: { 'class.readonly': { foreground: '#abcdef' } } } });
    await ide.module.exports.activate(ide.context);
    await ide.commands.get('asterAppearance.open')();
    ide.receive({ type: 'apply-font', font: 'jetbrainsmono', size: 18, weight: style.weight || 400, style: style.value, uiFont: false });
    await ide.settle();
    ide.receive({ type: 'probe-result', id: ide.posted.find(message => message.type === 'probe').id, loaded: true }); await ide.settle();
    assert.equal(ide.values['asterAppearance.fontStyle'], style.value);
    assert.equal(ide.values['editor.fontWeight'], String(style.weight || 400));
    assert.equal(ide.values['terminal.integrated.fontWeight'], style.weight || 400);
    const tokenRules = ide.values['editor.tokenColorCustomizations'].textMateRules;
    assert.deepEqual(tokenRules.find(rule => rule.name === personal.name), personal);
    assert.equal(tokenRules.find(rule => rule.name === STYLE_RULE).settings.fontStyle, style.italic ? 'italic' : '');
    assert.deepEqual(ide.values['editor.semanticTokenColorCustomizations'].rules['class.readonly'], { foreground: '#abcdef' });
    assert.equal(ide.values['editor.semanticTokenColorCustomizations'].rules['*']?.italic === true, style.italic);
    const values = structuredClone(ide.values), restarted = host(values);
    await restarted.module.exports.activate(restarted.context);
    assert.deepEqual(values, ide.values, style.value + ' survives a new host');
  }
});

test('invalid preset weight and unavailable family weight are refused before installing or writing settings', async () => {
  const limited = fonts.map(font => font.id === 'jetbrainsmono' ? { ...font, minWeight: 400 } : font);
  const ide = host({ 'workbench.colorTheme': 'Visual Studio Dark' }, {}, limited);
  await ide.module.exports.activate(ide.context);
  await ide.commands.get('asterAppearance.open')();
  const before = structuredClone(ide.values);
  for (const choice of [{ style: 'light', weight: 300 }, { style: 'bold', weight: 600 }]) {
    ide.receive({ type: 'apply-font', font: 'jetbrainsmono', size: 15, uiFont: false, ...choice });
    await ide.settle();
    assert.ok(ide.posted.at(-1).error);
    assert.deepEqual(ide.values, before);
    assert.equal(ide.posted.some(message => message.type === 'probe'), false);
  }
});

// The real font service against a fake OS: fc-list, fc-cache and the user's
// font folder live in a temporary directory.
function fontService(home) {
  const listed = new Set(), calls = [];
  const execFile = (file, args, options, callback) => {
    calls.push(file);
    if (file === 'fc-list') return callback(null, [...listed].join('\n'), '');
    if (file === 'fc-cache') { for (const name of fs.readdirSync(path.join(home, '.local/share/fonts'))) listed.add(fonts.find(font => name.startsWith('Aster-' + font.id + '-')).family); return callback(null, '', ''); }
    return callback(new Error('unexpected ' + file));
  };
  const module = { exports: {} }, nativeRequire = createRequire(path.join(source, 'font-service.cjs'));
  const loader = name => name === 'node:child_process' ? { execFile } : name === 'node:os' ? { ...os, homedir: () => home } : nativeRequire(name);
  vm.runInNewContext(fs.readFileSync(path.join(source, 'font-service.cjs'), 'utf8'), { module, exports: module.exports, require: loader, process: { platform: 'linux', pid: 1 }, Buffer, console });
  return { service: module.exports, calls, listed };
}

test('bundled fonts install once per font version: no reinstall, no second notice after a restart or in another window', async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-fonts-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const storage = path.join(base, 'storage'), home = path.join(base, 'home');
  const first = fontService(home);
  const [one, other] = await Promise.all([first.service.ensureBundled(source, fonts, storage), first.service.ensureBundled(source, fonts, storage)]);
  assert.deepEqual([one.added.length, other.added.length].sort(), [0, fonts.length], 'two windows starting together install once');
  assert.equal(first.calls.filter(file => file === 'fc-cache').length, fonts.length);
  // A restart: a new extension host, the same storage. Even if font detection
  // no longer lists the fonts, the record stops a second install.
  const restart = fontService(home);
  assert.deepEqual(JSON.parse(JSON.stringify(await restart.service.ensureBundled(source, fonts, storage))), { added: [], failed: [] });
  assert.equal(restart.calls.length, 0, 'nothing is run at all');
  // A new font version is installed once again.
  const updated = fonts.map(font => font.id === 'lilex' ? { ...font, files: font.files.map(file => file.file.endsWith('.ttf') ? { ...file, sha256: '0'.repeat(64) } : file) } : font);
  assert.deepEqual(restart.service.recorded(storage, updated).includes('lilex'), false);
  // The extension shows the notice only when fonts were installed now.
  const notices = [];
  for (const result of [{ added: fonts.map(font => font.id), failed: [] }, { added: [], failed: [] }, { added: [], failed: [], busy: true }]) {
    const ide = host({ 'workbench.colorTheme': 'Visual Studio Dark' }, { ensureBundled: async () => result });
    await ide.module.exports.activate(ide.context);
    notices.push(...ide.notices);
  }
  assert.equal(notices.length, 1);
  assert.ok(notices[0].includes('установил шрифты (' + fonts.length + ')'));
});

test('window opacity is gone from the extension, its settings and its package', () => {
  const pkg = require('../extensions/aster-appearance/package.json');
  assert.equal(pkg.contributes.configuration.properties['asterAppearance.windowOpacity'], undefined);
  assert.equal(fs.existsSync(path.join(source, 'window-opacity.ps1')), false);
  for (const file of ['extension.cjs', 'studio.cjs', 'panel.js', 'panel.css', 'appearance.cjs', 'README.md', 'THEMES.md'])
    assert.doesNotMatch(fs.readFileSync(path.join(source, file), 'utf8'), /windowOpacity|window-opacity|window opacity|прозрачност/i, file);
  const { validate, SHARED } = require('../extensions/aster-appearance/appearance.cjs');
  assert.throws(() => validate({ key: 'opacity', value: 80 }, [], fonts));
  assert.ok(!SHARED.some(key => /opacity/i.test(key)));
  assert.ok(!Object.keys(require('../scripts/package-aster.cjs').build().pin.files).some(file => /opacity|\.gif$|\.mp4$/.test(file)));
  assert.equal(require('../lib/profile-settings').isRetiredSetting('asterAppearance.windowOpacity'), true, 'a value written earlier leaves the profile on the next setup');
});

// GSUB feature tags straight from the font file.
function gsubFeatures(bytes) {
  const tables = bytes.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const record = 12 + i * 16;
    if (bytes.toString('ascii', record, record + 4) !== 'GSUB') continue;
    const table = bytes.readUInt32BE(record + 8), list = table + bytes.readUInt16BE(table + 6);
    return new Set(Array.from({ length: bytes.readUInt16BE(list) }, (_, index) => bytes.toString('ascii', list + 2 + index * 6, list + 6 + index * 6)));
  }
  return new Set();
}
test('every bundled font has measured coding ligatures with its configured OpenType features present in the file', () => {
  const required = ['===', '!==', '=>', '<=', '>=', '->', '!=', '&&'];
  assert.equal(fonts[0].family, 'JetBrains Mono');
  for (const font of fonts) {
    const files = font.files.filter(file => file.file.endsWith('.ttf'));
    assert.ok(files.length > 0, font.family);
    for (const file of files) {
      assert.deepEqual(required.filter(text => !file.ligatures.includes(text)), [], file.file + ' draws every coding ligature');
      const tags = gsubFeatures(fs.readFileSync(path.join(source, file.file)));
      for (const tag of font.fontFeatures ? [...font.fontFeatures.matchAll(/'([a-z0-9]{4})'/g)].map(match => match[1]) : ['calt'])
        assert.ok(tags.has(tag), file.file + ' carries configured feature ' + tag);
    }
  }
  assert.match(fs.readFileSync(path.join(source, 'panel.css'), 'utf8'), /#preview \{[^}]*"calt" 1/, 'the preview draws ligatures too');
});
