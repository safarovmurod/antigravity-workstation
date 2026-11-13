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
