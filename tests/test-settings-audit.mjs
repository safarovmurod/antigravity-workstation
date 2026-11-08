import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { auditManagedSettings, validate } = require('./settings-audit-host.cjs');

// A fake IDE: core settings answer inspect() with a default, extensions contribute schemas.
function fakeIde(core, extensions) {
  return {
    extensions: { all: extensions.map(([id, properties]) => ({ id, packageJSON: { contributes: { configuration: [{ properties }] } } })) },
    workspace: { getConfiguration: () => ({ inspect: key => (Object.hasOwn(core, key) ? { key, defaultValue: core[key] } : { key }) }) },
  };
}

test('the settings audit accepts registered settings with valid values, including language blocks', () => {
  const ide = fakeIde({ 'editor.tabSize': 4, 'editor.defaultFormatter': null, 'files.autoSave': 'off' }, [
    ['esbenp.prettier-vscode', { 'prettier.semi': { type: 'boolean' }, 'prettier.tabWidth': { type: 'integer', minimum: 0 } }],
    ['usernamehw.errorlens', { 'errorLens.followCursor': { type: 'string', enum: ['allLines', 'activeLine'] } }],
  ]);
  const report = auditManagedSettings(ide, { 'editor.tabSize': 3, 'files.autoSave': 'afterDelay', 'prettier.semi': false, 'prettier.tabWidth': 3,
    'errorLens.followCursor': 'allLines', '[typescript]': { 'editor.defaultFormatter': 'esbenp.prettier-vscode', 'editor.tabSize': 3 } });
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.equal(report.checked, 7);
  assert.equal(report.core, 4);
  assert.equal(report.extension, 3);
  assert.equal(report.languageBlocks, 1);
  assert.deepEqual(report.owners, { 'esbenp.prettier-vscode': 2, 'usernamehw.errorlens': 1 });
});

test('the settings audit reports unknown keys, wrong values, non-overridable language keys and deprecations', () => {
  const ide = fakeIde({ 'editor.tabSize': 4 }, [
    ['vendor.tool', {
      'tool.mode': { type: 'string', enum: ['fast', 'safe'] },
      'tool.size': { type: 'number', minimum: 1, maximum: 10 },
      'tool.list': { type: 'array', items: { type: 'string' } },
      'tool.old': { type: 'boolean', deprecationMessage: 'Use tool.mode instead.' },
      'tool.global': { type: 'boolean' },
      'tool.perLanguage': { type: 'boolean', scope: 'language-overridable' },
    }],
  ]);
  const report = auditManagedSettings(ide, { 'tool.mode': 'turbo', 'tool.size': 11, 'tool.list': ['a', 2], 'tool.old': true, 'tool.removed': 1,
    'editor.tabSize': '3', '[css]': { 'tool.global': true, 'tool.perLanguage': true, 'editor.unknownOption': true }, '[html]': 'x' });
  assert.equal(report.passed, false);
  assert.deepEqual(report.unregistered, ['tool.removed', '[css].editor.unknownOption']);
  assert.deepEqual(report.invalid, ['tool.mode: "turbo" is not one of "fast", "safe"', 'tool.size: 11 is above 10', 'tool.list[1]: 2 is not string',
    '[html]: a language block must be an object']);
  assert.deepEqual(report.notOverridable, ['[css].tool.global'], 'an extension setting the extension reads globally never applies per language');
  assert.deepEqual(report.deprecated, [{ key: 'tool.old', message: 'Use tool.mode instead.' }]);
  assert.equal(report.core, 1, 'an IDE setting is checked for registration only: its value type is not known here');
});

test('schema validation follows nested objects and accepts any of several types', () => {
  const schema = { type: 'object', properties: { size: { type: ['integer', 'null'], minimum: 0 }, name: { type: 'string' } } };
  assert.deepEqual(validate({ size: null, name: 'x', other: 1 }, schema, 'k'), []);
  assert.deepEqual(validate({ size: -1, name: 3 }, schema, 'k'), ['k.size: -1 is below 0', 'k.name: 3 is not string']);
  assert.deepEqual(validate(1.5, { type: 'integer' }, 'n'), ['n: 1.5 is not integer']);
  assert.deepEqual(validate('anything', undefined, 'free'), []);
});
