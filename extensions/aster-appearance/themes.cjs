'use strict';
const fs = require('node:fs');
const path = require('node:path');
const palettes = require('./palettes.cjs');
const { tune, commentColor } = require('./color.cjs');

// Aster palettes are not contributed as IDE themes: the IDE's own theme pickers
// preview every row they pass over. A palette is applied as theme-scoped
// customizations over the plain Visual Studio theme of the same kind (Antigravity
// itself uses Default Modern), and only through Aster's click-to-apply controls.
const BASE = { dark: 'Visual Studio Dark', light: 'Visual Studio Light' };
const KEYS = { colors: 'workbench.colorCustomizations', tokens: 'editor.tokenColorCustomizations', semantic: 'editor.semanticTokenColorCustomizations' };
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const THEMES = palettes.map(([name]) => JSON.parse(fs.readFileSync(path.join(__dirname, 'themes', slug(name) + '.json'), 'utf8')));
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function find(name) {
  if (typeof name !== 'string') return undefined;
  const key = name.trim().toLowerCase();
  return THEMES.find(theme => theme.name.toLowerCase() === key) || THEMES.find(theme => theme.name === palettes.legacy[key]);
}

// Studio brightness and contrast, in percent. They retune only the code
// colours of an Aster palette; workbench colours stay exactly as designed.
const RANGE = { brightness: [-30, 30], contrast: [-20, 30] };
function tuning(value = {}) {
  return Object.fromEntries(Object.entries(RANGE).map(([key, [low, high]]) => {
    const number = Math.round(Number(value[key]) || 0);
    return [key, Math.min(high, Math.max(low, number))];
  }));
}

function blocks(theme, colorCustomizations, tuned = {}) {
  // Colors the user (or the managed setup) sets for every theme keep winning.
  const general = new Set(Object.keys(object(colorCustomizations)).filter(key => !key.startsWith('[')));
  const { brightness, contrast } = tuning(tuned), background = theme.colors['editor.background'];
  const ink = color => tune(color, background, brightness, contrast);
  const comments = new Set([theme.roles.comment, theme.roles.docComment]);
  const tokenInk = color => comments.has(color) ? commentColor(ink(color), background) : ink(color);
  return {
    colors: Object.fromEntries(Object.entries(theme.colors).filter(([key]) => !general.has(key))),
    tokens: { textMateRules: theme.tokenColors.map(rule => ({ ...rule, settings: { ...rule.settings, foreground: tokenInk(rule.settings.foreground) } })) },
    semantic: { enabled: theme.semanticHighlighting === true, rules: Object.fromEntries(Object.entries(theme.semanticTokenColors).map(([key, color]) => [key, tokenInk(color)])) },
  };
}

// A block is Aster's when it has the shape of one of its palettes (code colours
// may be retuned by the studio); anything else in a base-theme scope belongs to
// the user and is left alone.
const scopes = rules => JSON.stringify((Array.isArray(rules) ? rules : []).map(rule => rule?.scope));
function owned(kind, block) {
  return THEMES.some(theme => {
    const expected = blocks(theme, {})[kind];
    if (kind === 'tokens') return Object.keys(object(block)).length === 1 && scopes(block.textMateRules) === scopes(expected.textMateRules);
    if (kind === 'semantic') return object(block).enabled === true && Object.keys(object(block)).length === 2
      && same(Object.keys(object(block.rules)), Object.keys(expected.rules));
    return Object.keys(object(block)).length > 0 && Object.entries(object(block)).every(([key, value]) => expected[key] === value);
  });
}

function themeChanges(read, theme, tuned) {
  const base = BASE[theme.type], other = `[${BASE[theme.type === 'dark' ? 'light' : 'dark']}]`, scope = `[${base}]`;
  const levels = tuning(tuned || { brightness: read('asterAppearance.brightness'), contrast: read('asterAppearance.contrast') });
  const desired = blocks(theme, read(KEYS.colors), levels);
  const changes = {};
  for (const [kind, key] of Object.entries(KEYS)) {
    const next = { ...object(read(key)), [scope]: desired[kind] };
    if (next[other] !== undefined && owned(kind, next[other])) delete next[other];
    changes[key] = next;
  }
  changes['workbench.colorTheme'] = base;
  changes['asterAppearance.theme'] = theme.name;
  if (tuned) {
    changes['asterAppearance.brightness'] = levels.brightness;
    changes['asterAppearance.contrast'] = levels.contrast;
  }
  return changes;
}

// The palette to restore at startup: an earlier contributed label still in
// workbench.colorTheme (unless another extension really provides a theme of
// that name), or the recorded palette while its base theme is active.
function pending(read, contributed = () => false) {
  const selected = read('workbench.colorTheme');
  const legacy = contributed(selected) ? undefined : find(selected);
  if (legacy) return legacy;
  const theme = find(read('asterAppearance.theme'));
  if (!theme || (selected && selected !== BASE[theme.type])) return undefined;
  return theme;
}

module.exports = { BASE, KEYS, THEMES, RANGE, find, tuning, blocks, owned, themeChanges, pending };
