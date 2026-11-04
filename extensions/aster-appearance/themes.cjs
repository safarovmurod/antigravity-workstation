'use strict';
const fs = require('node:fs');
const path = require('node:path');
const palettes = require('./palettes.cjs');

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

function blocks(theme, colorCustomizations) {
  // Colors the user (or the managed setup) sets for every theme keep winning.
  const general = new Set(Object.keys(object(colorCustomizations)).filter(key => !key.startsWith('[')));
  return {
    colors: Object.fromEntries(Object.entries(theme.colors).filter(([key]) => !general.has(key))),
    tokens: { textMateRules: theme.tokenColors },
    semantic: { enabled: true, rules: theme.semanticTokenColors },
  };
}

// A block is Aster's when it matches one of its palettes; anything else in a
// base-theme scope belongs to the user and is left alone.
function owned(kind, block) {
  return THEMES.some(theme => {
    const expected = blocks(theme, {})[kind];
    if (kind !== 'colors') return same(block, expected);
    return Object.keys(object(block)).length > 0 && Object.entries(object(block)).every(([key, value]) => expected[key] === value);
  });
}

function themeChanges(read, theme) {
  const base = BASE[theme.type], other = `[${BASE[theme.type === 'dark' ? 'light' : 'dark']}]`, scope = `[${base}]`;
  const desired = blocks(theme, read(KEYS.colors));
  const changes = {};
  for (const [kind, key] of Object.entries(KEYS)) {
    const next = { ...object(read(key)), [scope]: desired[kind] };
    if (next[other] !== undefined && owned(kind, next[other])) delete next[other];
    changes[key] = next;
  }
  changes['workbench.colorTheme'] = base;
  changes['asterAppearance.theme'] = theme.name;
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

module.exports = { BASE, KEYS, THEMES, find, blocks, themeChanges, pending };
