import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const catalog = require('../config/extensions.json');
const { EXTENSION_PROFILES, selectExtensions } = require('../lib/extension-profiles');

test('Default full extension profile keeps the complete catalog and optional/version policies', () => {
  const selected = selectExtensions(catalog);
  assert.deepEqual(selected, catalog);
  assert.notStrictEqual(selected, catalog);
  for (let i = 0; i < catalog.length; i++) assert.strictEqual(selected[i], catalog[i]);
  assert.deepEqual(selectExtensions(catalog, 'full'), catalog);
  assert.equal(selected.find(extension => extension.id === 'iranon.jelly-cursor').optional, true);
});

test('Lite selects eleven catalog entries in original order and includes all managed helpers', () => {
  const selected = selectExtensions(catalog, 'lite');
  assert.equal(selected.length, 11);
  assert.deepEqual(selected.map(extension => extension.id), catalog.filter(extension => EXTENSION_PROFILES.lite.include.includes(extension.id)).map(extension => extension.id));
  assert.deepEqual(selected.filter(extension => extension.source === 'local-vsix'),
    catalog.filter(extension => extension.source === 'local-vsix'));
  for (const id of ['esbenp.prettier-vscode', 'pkief.material-icon-theme', 'zhuangtongfa.Material-theme', 'ms-ceintl.vscode-language-pack-ru',
    'christian-kohler.path-intellisense', 'christian-kohler.npm-intellisense']) {
    assert.ok(selected.some(extension => extension.id === id), id);
  }
  for (const id of ['dsznajder.es7-react-js-snippets', 'oxc.oxc-vscode', 'iranon.jelly-cursor']) {
    assert.ok(!selected.some(extension => extension.id === id), id);
    assert.ok(catalog.some(extension => extension.id === id), id + ' remains available in full');
  }
});

test('Selecting lite neither mutates nor narrows the source catalog', () => {
  const before = structuredClone(catalog);
  const selected = selectExtensions(catalog, 'lite');
  assert.deepEqual(catalog, before);
  selected.pop();
  assert.deepEqual(catalog, before);
  assert.ok(Object.isFrozen(EXTENSION_PROFILES.lite.include));
});

test('Unknown extension profiles and invalid or duplicate catalog identifiers fail before installation', () => {
  for (const profile of ['minimal', '', null, 'constructor', '__proto__']) {
    assert.throws(() => selectExtensions(catalog, profile), /Unknown extension profile/);
  }
  assert.throws(() => selectExtensions(null), /catalog must be an array/);
  assert.throws(() => selectExtensions([{ id: 'bad/id' }]), /Invalid extension identifier/);
  assert.throws(() => selectExtensions([catalog[0], { ...catalog[0], id: catalog[0].id.toUpperCase() }]),
    /Duplicate extension identifier/);
});

test('A profile cannot silently omit an unavailable required catalog entry', () => {
  const missing = 'workstation.stability-helper';
  assert.throws(() => selectExtensions(catalog.filter(extension => extension.id !== missing), 'lite'),
    new RegExp('references missing catalog entry: ' + missing.replaceAll('.', '\\.')));
  assert.deepEqual(selectExtensions([], 'full'), []);
});
