'use strict';
const vscode = require('vscode');
const fonts = require('./fonts.json');
const service = require('./font-service.cjs');
const themes = require('./themes.cjs');
const uiStyle = require('./ui-style.cjs');
const swatches = require('./swatches.cjs');
const { createStudio } = require('./studio.cjs');
const {SHARED,FONT_FAMILY_KEYS,FONT_STYLES,styleSettings,updateGlobal,validate} = require('./appearance.cjs');
let queue = Promise.resolve();
function enqueue(action) { const result = queue.then(action); queue=result.catch(()=>{});return result; }
const read = key => vscode.workspace.getConfiguration(undefined,null).get(key);
const globalValue = key => vscode.workspace.getConfiguration(undefined,null).inspect(key)?.globalValue;
const contributedThemes = (extensions = vscode.extensions?.all || []) => extensions.flatMap(extension => extension.packageJSON?.contributes?.themes || []);
function nativeThemeOptions(extensions) {
  const contributed = contributedThemes(extensions);
  return ['Light', 'Dark'].flatMap(mode => {
    const ids = [`Antigravity ${mode}`, `Antigravity Default ${mode}`, `Default ${mode} Modern`, `Default ${mode}+`];
    const selected = ids.map(id => contributed.find(theme => (theme.id || theme.label) === id)).find(Boolean);
    return selected ? [{ label: `Antigravity ${mode}`, value: selected.id || selected.label, kind: mode.toLowerCase(), builtin: true }] : [];
  });
}
// Four standard VS Code themes that ship with the IDE sit beside Antigravity's
// own pair; the plain Visual Studio themes are left out because Aster palettes
// are drawn over them.
const VSCODE_THEMES = [['Dark+', 'Default Dark+', 'dark'], ['Light+', 'Default Light+', 'light'],
  ['Solarized Dark', 'Solarized Dark', 'dark'], ['Quiet Light', 'Quiet Light', 'light']];
function vscodeThemeOptions(extensions, taken = []) {
  const contributed = contributedThemes(extensions);
  return VSCODE_THEMES.flatMap(([label, id, kind]) => {
    const theme = contributed.find(item => (item.id || item.label) === id);
    return theme && !taken.includes(id) ? [{ label, value: id, kind, builtin: true, group: 'vscode' }] : [];
  });
}
// Every option names its studio group: Antigravity, VS Code, calm dark, vivid dark, light.
function themeOptions() {
  const native = nativeThemeOptions().map(option => ({ ...option, group: 'antigravity' }));
  return [...native, ...vscodeThemeOptions(undefined, native.map(option => option.value)),
    ...themes.THEMES.map(theme => ({ label: theme.name, value: theme.name, kind: theme.type, builtin: false, group: 'aster' }))]
    .map(option => ({ ...option, section: swatches.section(option, themes.find(option.value)) }));
}
// The studio cards show each theme in its real colours; the IDE's theme files
// are read once per session.
const builtinSwatches = new Map();
function builtinSwatch(option) {
  if (!builtinSwatches.has(option.value)) builtinSwatches.set(option.value, swatches.builtinSwatch(option, vscode.extensions?.all || []));
  return builtinSwatches.get(option.value);
}
function themeGallery() {
  return themeOptions().map(option => ({ ...option, swatch: option.builtin ? builtinSwatch(option) : swatches.asterSwatch(themes.find(option.value)) }));
}
const themeValues = () => themeOptions().map(option => option.value);
// The studio shows the Aster palette while its Visual Studio base is active.
function currentTheme() {
  const selected = read('workbench.colorTheme'), aster = themes.find(read('asterAppearance.theme'));
  return aster && selected === themes.BASE[aster.type] ? aster.name : selected;
}
// The IDE's own themes offered here get their low-contrast code colours lifted
// in a block for that theme only; the user's own rules there come after and win.
const readableCache = new Map();
function readableChanges(value) {
  const option = themeOptions().find(item => item.builtin && item.value === value);
  if (!option) return {};
  if (!readableCache.has(value)) readableCache.set(value, swatches.readableRules(swatches.builtinTheme(option, vscode.extensions?.all || []), option.kind));
  const all = { ...(globalValue('editor.tokenColorCustomizations') || {}) }, scope = `[${value}]`;
  const block = { ...(all[scope] && typeof all[scope] === 'object' ? all[scope] : {}) };
  const personal = (Array.isArray(block.textMateRules) ? block.textMateRules : []).filter(rule => rule?.name !== swatches.READABLE_RULE);
  const rules = [...readableCache.get(value), ...personal];
  if (rules.length) block.textMateRules = rules; else delete block.textMateRules;
  if (Object.keys(block).length) all[scope] = block; else delete all[scope];
  const changes = JSON.stringify(all) === JSON.stringify(globalValue('editor.tokenColorCustomizations') || {}) ? {} : { 'editor.tokenColorCustomizations': all };
  const semantic = { ...(globalValue('editor.semanticTokenColorCustomizations') || {}) }, selected = semantic[scope] || {};
  const comment = readableCache.get(value).at(-1)?.settings.foreground;
  if (comment && !Object.hasOwn(selected.rules || {}, 'comment') && !Object.hasOwn(semantic.rules || {}, 'comment')) {
    changes['editor.semanticTokenColorCustomizations'] = { ...semantic,
      [scope]: { ...selected, rules: { ...selected.rules, comment } } };
  }
  return changes;
}
function themeChanges(value) {
  validate({ key: 'theme', value }, themeValues(), fonts);
  const aster = themes.find(value);
  return aster ? themes.themeChanges(read, aster) : { 'workbench.colorTheme': value, 'asterAppearance.theme': '', ...readableChanges(value) };
}
// Brightness and contrast retune the Aster palette that is on now.
function tuneChanges(tuned) {
  for (const key of ['brightness', 'contrast']) validate({ key, value: tuned?.[key] }, [], fonts);
  const aster = themes.find(currentTheme());
  if (!aster) throw new Error('Яркость и контраст меняют только темы Aster.');
  return themes.themeChanges(read, aster, { brightness: tuned.brightness, contrast: tuned.contrast });
}
function writeUiStyle() {
  try {
    const result = uiStyle.write(vscode.env.appRoot, { uiFont: read('asterAppearance.uiFont') === true, family: read('editor.fontFamily') });
    if (result.skipped) console.warn('Aster Atelier interface font: ' + result.skipped);
    return result;
  } catch (error) { console.warn('Aster Atelier interface font: ' + error.message); return { error: error.message }; }
}
// Every bundled font has coding ligatures; they are switched on with the font.
function fontChanges(font, weight) {
  const family = `'${font.family}', monospace`;
  const supported = Math.min(font.maxWeight, Math.max(font.minWeight, Math.round((weight - font.minWeight) / font.weightStep) * font.weightStep + font.minWeight));
  return {...Object.fromEntries(FONT_FAMILY_KEYS.map(key => [key, family])), 'editor.fontLigatures': font.fontFeatures || true,
    'editor.fontWeight': String(supported), 'terminal.integrated.fontWeight': supported};
}
// `name` is a FONT_STYLES value (true/false still mean italic/normal); the
// recorded style tells which bold flags Aster set.
function styleChanges(name) {
  const known = value => FONT_STYLES.some(item => item.value === value);
  const previous = known(read('asterAppearance.fontStyle')) ? read('asterAppearance.fontStyle') : 'normal';
  const style = styleSettings({ text: globalValue('editor.tokenColorCustomizations'), semantic: globalValue('editor.semanticTokenColorCustomizations') },
    typeof name === 'boolean' ? name : known(name) ? name : 'normal', previous);
  return { 'editor.tokenColorCustomizations': style.text, 'editor.semanticTokenColorCustomizations': style.semantic };
}
// After an update, or a theme chosen in the IDE's own picker, the chosen style
// and the readable colours still apply.
async function syncLook() {
  const same = (key, value) => JSON.stringify(globalValue(key) ?? {}) === JSON.stringify(value ?? {});
  const style = Object.fromEntries(Object.entries(styleChanges(read('asterAppearance.fontStyle'))).filter(([key, value]) => !same(key, value)));
  if (Object.keys(style).length) await updateGlobal(vscode, style);
  await updateGlobal(vscode, readableChanges(read('workbench.colorTheme')));
}
// Starts a restored palette, follows a palette or tuning chosen in another
// window or in settings.json, or migrates a label from the contributed-theme era.
async function syncTheme() {
  const names = new Set(contributedThemes().flatMap(theme => [theme.id, theme.label]));
  // A profile that never chose a theme only reports the IDE default; the
  // shared palette then applies there too.
  const explicit = key => key === 'workbench.colorTheme' ? globalValue(key) : read(key);
  const theme = themes.pending(explicit, name => names.has(name));
  if (!theme) return;
  // The recorded name is never written back: a newer choice made while this
  // sync runs must not be replaced by the one that started it.
  const changes = themes.themeChanges(read, theme);
  if (read('asterAppearance.theme') === theme.name) delete changes['asterAppearance.theme'];
  await updateGlobal(vscode, changes);
}
// Navigation never applies anything; only a click or Enter writes the theme.
function pickTheme() {
  const picker = vscode.window.createQuickPick(), options = themeOptions(), current = currentTheme();
  const group = (label, list) => list.length ? [{ label, kind: vscode.QuickPickItemKind?.Separator ?? -1 }, ...list] : [];
  const item = option => ({ label: option.label, description: option.value === current ? 'текущая' : '', option });
  picker.items = swatches.SECTIONS.flatMap(({ name }) => group(name, options.filter(o => o.section === name).map(item)));
  picker.placeholder = 'Тема меняется только по клику или Enter';
  picker.onDidAccept(() => {
    const picked = picker.selectedItems[0]?.option;
    picker.hide();
    if (picked) void enqueue(() => updateGlobal(vscode, themeChanges(picked.value))).catch(error => vscode.window.showErrorMessage('Aster Atelier: ' + error.message));
  });
  picker.show();
}

// Settings events are collected for 150 ms and handled once. Every handler is
// idempotent, so the events of the extension's own writes change nothing more.
const WATCHED = {
  palette: ['asterAppearance.theme', 'asterAppearance.brightness', 'asterAppearance.contrast'],
  readable: ['workbench.colorTheme'],
  uiStyle: ['asterAppearance.uiFont', 'editor.fontFamily'],
  studio: SHARED,
};
function watchSettings(studio) {
  const due = new Set();
  let timer;
  async function handle(jobs) {
    if (jobs.includes('palette')) await syncTheme();
    if (jobs.includes('readable')) await updateGlobal(vscode, readableChanges(read('workbench.colorTheme')));
    if (jobs.includes('uiStyle')) writeUiStyle();
    if (jobs.includes('studio')) await studio.update();
  }
  const listener = vscode.workspace.onDidChangeConfiguration(event => {
    for (const [job, keys] of Object.entries(WATCHED)) if (keys.some(key => event.affectsConfiguration(key))) due.add(job);
    if (!due.size) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const jobs = [...due]; due.clear();
      enqueue(() => handle(jobs)).catch(error => console.warn('Aster Atelier settings: ' + error.message));
    }, 150);
  });
  return { dispose() { clearTimeout(timer); listener.dispose(); } };
}

// Bundled fonts are installed once per font version for this OS user; the
// notice appears only for fonts installed now.
async function installBundledFonts(context) {
  const result = await service.ensureBundled(context.extensionPath, fonts, context.globalStorageUri.fsPath);
  for (const failure of result.failed) console.warn('Aster Atelier fonts: ' + failure);
  if (result.added.length) void vscode.window.showInformationMessage(`Aster Atelier установил шрифты (${result.added.length}). Они появятся в редакторе после полного перезапуска IDE.`);
}

function activate(context) {
  const studio = createStudio({ vscode, context, enqueue, read, fonts, service, themes, gallery: themeGallery, sections: swatches.SECTIONS,
    currentTheme, builtinSwatch, applyTheme: value => updateGlobal(vscode, themeChanges(value)), applyTune: tuned => updateGlobal(vscode, tuneChanges(tuned)),
    fontChanges, styleChanges, writeUiStyle });
  context.subscriptions.push(studio, watchSettings(studio),
    vscode.commands.registerCommand('asterAppearance.open', () => studio.open()),
    vscode.commands.registerCommand('asterAppearance.selectTheme', () => pickTheme()));
  return enqueue(async () => {
    const scope = await require('./profiles.cjs').ensureAllProfiles(vscode, context);
    await context.globalState.update('applicationScopeVerification', scope);
    if (scope.status !== 'application-scoped') console.warn('Aster Atelier: ' + scope.reason);
    await syncTheme();
    await syncLook();
    writeUiStyle();
    await installBundledFonts(context).catch(error => console.warn('Aster Atelier fonts: ' + error.message));
  }).catch(error => vscode.window.showErrorMessage('Aster Atelier: ' + error.message));
}
module.exports={activate,nativeThemeOptions,vscodeThemeOptions,themeOptions,themeGallery,FONT_FAMILY_KEYS};
