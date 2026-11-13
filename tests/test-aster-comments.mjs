import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = path.resolve(import.meta.dirname, '../extensions/aster-appearance');
const { contrast, toOklch } = require('../extensions/aster-appearance/color.cjs');

test('native semantic comments receive the coloured theme rule while personal rules and fields survive', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-semantic-comments-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'dark.json'), JSON.stringify({ colors: { 'editor.background': '#1e1e1e' },
    tokenColors: [{ scope: 'comment', settings: { foreground: '#999999' } }], semanticTokenColors: { comment: '#999999' } }));
  const values = { 'editor.tokenColorCustomizations': { '[Default Dark+]': { textMateRules: [
    { name: 'personal', scope: 'string', settings: { foreground: '#abcdef' } } ] } },
    'editor.semanticTokenColorCustomizations': { enabled: false, rules: { variable: '#fedcba' },
      '[Personal]': { rules: { comment: '#ffffff' } }, '[Default Dark+]': { enabled: true, rules: { function: { foreground: '#112233', italic: true } } } } };
  const original = structuredClone(values);
  const vscode = { extensions: { all: [{ extensionPath: directory,
    packageJSON: { contributes: { themes: [{ id: 'Default Dark+', path: 'dark.json' }] } } }] },
    workspace: { getConfiguration: () => ({ get: key => values[key], inspect: key => ({ globalValue: values[key] }) }) } };
  const module = { exports: {} }, nativeRequire = createRequire(path.join(source, 'extension.cjs'));
  vm.runInNewContext(fs.readFileSync(path.join(source, 'extension.cjs'), 'utf8') + '\nmodule.exports.readableChanges = readableChanges;',
    { module, exports: module.exports, require: name => name === 'vscode' ? vscode : nativeRequire(name), setTimeout, clearTimeout, console });
  const changes = () => JSON.parse(JSON.stringify(module.exports.readableChanges('Default Dark+')));
  const first = changes(), semantic = first['editor.semanticTokenColorCustomizations'];
  const comment = semantic['[Default Dark+]'].rules.comment;
  assert.ok(contrast(comment, '#1e1e1e') >= 5);
  assert.ok(toOklch(comment)[1] >= .08);
  assert.equal(semantic.enabled, false);
  assert.equal(semantic['[Default Dark+]'].enabled, true);
  assert.deepEqual(semantic.rules, original['editor.semanticTokenColorCustomizations'].rules);
  assert.deepEqual(semantic['[Personal]'], original['editor.semanticTokenColorCustomizations']['[Personal]']);
  assert.deepEqual(semantic['[Default Dark+]'].rules.function, original['editor.semanticTokenColorCustomizations']['[Default Dark+]'].rules.function);
  assert.deepEqual(first['editor.tokenColorCustomizations']['[Default Dark+]'].textMateRules.at(-1),
    original['editor.tokenColorCustomizations']['[Default Dark+]'].textMateRules[0]);
  assert.deepEqual(values, original, 'constructing changes never mutates personal input');
  Object.assign(values, first);
  assert.deepEqual(changes(), {}, 'applying the result is idempotent');
  for (const personal of ['#808080', { foreground: '#777777', italic: false }]) {
    values['editor.semanticTokenColorCustomizations']['[Default Dark+]'].rules.comment = personal;
    assert.equal(changes()['editor.semanticTokenColorCustomizations'], undefined, 'an explicit personal theme comment wins');
  }
  delete values['editor.semanticTokenColorCustomizations']['[Default Dark+]'].rules.comment;
  values['editor.semanticTokenColorCustomizations'].rules.comment = '#999999';
  assert.equal(changes()['editor.semanticTokenColorCustomizations'], undefined, 'an explicit personal global comment wins');
});

test('Aster comments are a clear green family colour, never grey, and never look like the strings', () => {
  const themes = require('../extensions/aster-appearance/themes.cjs');
  const { COMMENT_HUES } = require('../extensions/aster-appearance/color.cjs');
  const hueGap = (a, b) => Math.abs(((toOklch(a)[2] - toOklch(b)[2]) + 540) % 360 - 180);
  for (const theme of themes.THEMES) {
    const background = theme.colors['editor.background'], comment = theme.roles.comment;
    const [, chroma, hue] = toOklch(comment);
    assert.ok(chroma >= 0.085, theme.name + ' comment ' + comment + ' is clearly coloured');
    assert.ok(COMMENT_HUES.some(item => Math.abs(item - hue) < 6), theme.name + ' comment ' + comment + ' is from the green family (hue ' + hue.toFixed(0) + ')');
    assert.ok(contrast(comment, background) >= 5, theme.name + ' comment reads at 5:1');
    assert.match(comment, /^#[0-9a-f]{6}$/, theme.name + ' comment is opaque, never transparent');
    if (toOklch(theme.roles.string)[1] >= 0.04) assert.ok(hueGap(comment, theme.roles.string) >= 28, theme.name + ' comment and string differ in hue');
    assert.ok(toOklch(theme.roles.docComment)[1] >= 0.075 && Math.abs(toOklch(theme.roles.docComment)[2] - hue) < 12, theme.name + ' doc comment is a tone of the comment');
    // The applied block keeps the comment as built (the studio tuning is 0 here).
    assert.equal(themes.blocks(theme, {}).semantic.rules.comment, require('../extensions/aster-appearance/color.cjs').commentColor(comment, background));
    assert.ok(toOklch(themes.blocks(theme, {}).semantic.rules.comment)[1] >= 0.08);
  }
  // A grey or greyish comment of an IDE theme (Quiet Light #AAAAAA, Solarized Dark #586E75) becomes the comment green.
  const { commentColor } = require('../extensions/aster-appearance/color.cjs');
  for (const [grey, background] of [['#aaaaaa', '#f5f5f5'], ['#586e75', '#002b36']]) {
    const coloured = commentColor(grey, background);
    assert.ok(toOklch(coloured)[1] >= 0.08 && Math.abs(toOklch(coloured)[2] - 150) < 20 && contrast(coloured, background) >= 5, grey + ' -> ' + coloured);
  }
});
