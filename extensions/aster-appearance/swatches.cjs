'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { contrast, readable, commentColor } = require('./color.cjs');

// The studio shows every theme as a card in its real colours, sorted into five
// groups, so a theme is found by eye and learnt quickly.
const SECTIONS = [
  { name: 'Antigravity', note: 'Родные темы IDE' },
  { name: 'VS Code', note: 'Стандартные темы VS Code' },
  { name: 'Тёмные · спокойные', note: 'Мягкие цвета для долгой работы' },
  { name: 'Тёмные · яркие', note: 'Насыщенные, контрастные цвета' },
  { name: 'Светлые', note: 'Для светлой комнаты и дня' },
];

// #rgb, #rgba, #rrggbb and #rrggbbaa become #rrggbb; anything else is refused.
function hex(value) {
  if (typeof value !== 'string') return null;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])[0-9a-f]?$/i.exec(value);
  if (short) return ('#' + short[1] + short[1] + short[2] + short[2] + short[3] + short[3]).toLowerCase();
  return /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value.slice(0, 7).toLowerCase() : null;
}

// The generator marks a dark palette vivid when the theme it follows is.
const vivid = theme => theme?.vivid === true;

function section(option, aster) {
  if (option.group === 'antigravity') return 'Antigravity';
  if (option.group === 'vscode') return 'VS Code';
  if (option.kind === 'light') return 'Светлые';
  return aster && vivid(aster) ? 'Тёмные · яркие' : 'Тёмные · спокойные';
}

// Background, text and five code roles; only plain hex colours reach the page.
const KEYS = ['background', 'foreground', 'keyword', 'function', 'string', 'type', 'comment'];
function clean(swatch, kind) {
  const fallback = kind === 'light' ? { background: '#ffffff', foreground: '#1f1f1f' } : { background: '#1f1f1f', foreground: '#d4d4d4' };
  const background = hex(swatch.background) || fallback.background, foreground = hex(swatch.foreground) || fallback.foreground;
  return Object.fromEntries(KEYS.map(key => [key, key === 'background' ? background : key === 'foreground' ? foreground : hex(swatch[key]) || foreground]));
}

function asterSwatch(theme) {
  const roles = theme.roles || {};
  return clean({ background: theme.colors?.['editor.background'], foreground: theme.colors?.['editor.foreground'],
    keyword: roles.keyword, function: roles.functionCall, string: roles.string, type: roles.type, comment: roles.comment }, theme.type);
}

// The IDE's own theme files are JSON with comments and trailing commas.
function parseJsonc(text) {
  let out = '', inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (inString) {
      out += char;
      if (char === '\\') { out += next ?? ''; i++; } else if (char === '"') inString = false;
    } else if (char === '"') { inString = true; out += char; }
    else if (char === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; }
    else if (char === '/' && next === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 1; }
    else out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

// A theme file can include another; its own entries come after the included ones and win.
function readTheme(file, depth = 0) {
  const json = parseJsonc(fs.readFileSync(file, 'utf8'));
  const base = typeof json.include === 'string' && depth < 5
    ? readTheme(path.resolve(path.dirname(file), json.include), depth + 1) : { colors: {}, tokenColors: [], semanticTokenColors: {} };
  return { colors: { ...base.colors, ...(json.colors || {}) },
    tokenColors: [...base.tokenColors, ...(Array.isArray(json.tokenColors) ? json.tokenColors : [])],
    semanticTokenColors: { ...base.semanticTokenColors, ...(json.semanticTokenColors || {}) } };
}

const SCOPES = {
  keyword: ['keyword', 'keyword.control', 'storage.type', 'storage'],
  function: ['entity.name.function', 'support.function'],
  string: ['string', 'string.quoted'],
  type: ['entity.name.type', 'support.type', 'entity.name.class', 'support.class'],
  comment: ['comment', 'punctuation.definition.comment'],
};
function scopeColor(tokenColors, scopes) {
  for (const wanted of scopes) {
    let found;
    for (const entry of tokenColors) {
      const list = Array.isArray(entry?.scope) ? entry.scope : typeof entry?.scope === 'string' ? entry.scope.split(',') : [];
      if (list.some(scope => String(scope).trim() === wanted) && hex(entry.settings?.foreground)) found = entry.settings.foreground;
    }
    if (found) return found;
  }
  return undefined;
}
function semanticColor(tokens, role) {
  const value = tokens[role];
  return typeof value === 'string' ? value : value?.foreground;
}

// The IDE ships its theme files with the extension that contributes them.
function builtinTheme(option, extensions = []) {
  for (const extension of extensions) {
    const contributed = (extension.packageJSON?.contributes?.themes || []).find(item => (item.id || item.label) === option.value);
    if (!contributed || typeof contributed.path !== 'string' || typeof extension.extensionPath !== 'string') continue;
    try { return readTheme(path.join(extension.extensionPath, contributed.path)); } catch { return null; }
  }
  return null;
}

// Native themes keep their other colours. Comments always carry real colour
// at 5:1; other code colours are lifted only when they read below 4.6:1.
const READABLE_RULE = 'Aster Atelier · readable';
const COMMENT_SCOPES = ['comment', 'punctuation.definition.comment', 'comment.block.documentation',
  'comment.block.documentation punctuation.definition.comment', 'storage.type.class.jsdoc',
  'punctuation.definition.block.tag.jsdoc', 'variable.other.jsdoc', 'entity.name.type.instance.jsdoc'];
const isComment = scope => /(?:^|[.\s])comment(?:[.\s]|$)|jsdoc/.test(scope);
function builtinComment(theme, kind, background) {
  const source = hex(semanticColor(theme.semanticTokenColors || {}, 'comment'))
    || hex(scopeColor(theme.tokenColors || [], SCOPES.comment)) || (kind === 'light' ? '#008000' : '#6a9955');
  return commentColor(source, background);
}
function readableRules(theme, kind) {
  if (!theme) return [];
  const background = hex(theme.colors?.['editor.background']) || (kind === 'light' ? '#ffffff' : '#1e1e1e');
  const rules = (theme.tokenColors || []).flatMap(rule => {
    const colour = hex(rule?.settings?.foreground);
    if (!colour || rule.scope === undefined) return [];
    const scopes = [].concat(rule.scope).flatMap(scope => String(scope).split(',')).map(scope => scope.trim()).filter(Boolean);
    return [false, true].flatMap(comment => {
      const selected = scopes.filter(scope => isComment(scope) === comment);
      if (!selected.length || (!comment && contrast(colour, background) >= 4.6)) return [];
      return [{ name: READABLE_RULE, scope: selected.length === scopes.length ? rule.scope : selected,
        settings: { foreground: comment ? commentColor(colour, background) : readable(colour, background) } }];
    });
  });
  rules.push({ name: READABLE_RULE, scope: COMMENT_SCOPES, settings: { foreground: builtinComment(theme, kind, background) } });
  return rules;
}

function builtinSwatch(option, extensions = []) {
  const theme = builtinTheme(option, extensions) || { colors: {}, tokenColors: [], semanticTokenColors: {} };
  const global = theme.tokenColors.find(entry => entry && entry.scope === undefined && entry.settings)?.settings || {};
  const color = role => scopeColor(theme.tokenColors, SCOPES[role]) || semanticColor(theme.semanticTokenColors, role);
  const swatch = clean({ background: theme.colors['editor.background'] || global.background, foreground: theme.colors['editor.foreground'] || global.foreground,
    keyword: color('keyword'), function: color('function'), string: color('string'), type: color('type'), comment: color('comment') }, option.kind);
  // The card shows the code colours as the editor draws them, lifted like readableRules().
  for (const key of ['keyword', 'function', 'string', 'type', 'comment']) {
    if (swatch[key] !== swatch.foreground && contrast(swatch[key], swatch.background) < 4.6) swatch[key] = readable(swatch[key], swatch.background);
  }
  swatch.comment = builtinComment(theme, option.kind, swatch.background);
  return swatch;
}

module.exports = { SECTIONS, KEYS, READABLE_RULE, hex, vivid, section, asterSwatch, builtinTheme, builtinSwatch, readableRules, parseJsonc, readTheme };
