import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { stripJsonComments, parseJsonc, deepMerge } = require('../lib/jsonc.js');

test('stripJsonComments removes single line and multi line comments', () => {
  const input = `
  {
    // Single line comment
    "key": "value", /* inline comment */
    /*
      multi line
      comment
    */
    "escaped": "http://example.com" // url test
  }
  `;
  const parsed = parseJsonc(input);
  assert.equal(parsed.key, 'value');
  assert.equal(parsed.escaped, 'http://example.com');
});

test('parseJsonc handles trailing commas', () => {
  const input = `{ "a": 1, "b": [1, 2, ], }`;
  const parsed = parseJsonc(input);
  assert.equal(parsed.a, 1);
  assert.deepEqual(parsed.b, [1, 2]);
});

test('JSONC preserves comma/closing-bracket text, escaped quotes and BOM', () => {
  const text = '\uFEFF{"custom":"a,}","other":"b,]","escaped":"\\\"c,}","array":[1,],}';
  assert.deepEqual(parseJsonc(text), { custom: 'a,}', other: 'b,]', escaped: '"c,}', array: [1] });
  assert.throws(() => parseJsonc('{"value":1/* comment */2}'), /parse error/);
});

test('Deep merge replaces a null user object without losing unrelated fields', () => {
  assert.deepEqual(deepMerge({ custom: 1, colors: null }, { colors: { foreground: '#ffffff' } }), { custom: 1, colors: { foreground: '#ffffff' } });
});

test('deepMerge preserves non-conflicting existing settings', () => {
  const userExisting = {
    'custom.plugin.enabled': true,
    'editor.fontSize': 14,
    'workbench.colorCustomizations': {
      'editorCursor.foreground': '#111111',
      'activityBar.background': '#222222',
    },
  };

  const setupSettings = {
    'editor.fontSize': 15,
    'editor.formatOnSave': true,
    'workbench.colorCustomizations': {
      'editorCursor.foreground': '#7DD3FC',
      'editorError.foreground': '#f8717166',
    },
  };

  const merged = deepMerge(userExisting, setupSettings);

  // Overwritten by setup
  assert.equal(merged['editor.fontSize'], 15);
  assert.equal(merged['editor.formatOnSave'], true);
  assert.equal(merged['workbench.colorCustomizations']['editorCursor.foreground'], '#7DD3FC');

  // Preserved from userExisting
  assert.equal(merged['custom.plugin.enabled'], true);
  assert.equal(merged['workbench.colorCustomizations']['activityBar.background'], '#222222');
  assert.equal(merged['workbench.colorCustomizations']['editorError.foreground'], '#f8717166');
});
