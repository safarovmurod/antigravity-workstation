import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { inspectNativeCompatibility, validateNative, validateCatalog, loadCatalog, NATIVE_MAIN_SHA256, installationArchitecture } = require('../lib/native-compatibility');
const root = path.resolve(import.meta.dirname, '..');

function fixture(t, product = { ideVersion: '2.5.5' }, main = 'not the official Antigravity bundle') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation compatibility '));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { ideRoot: path.join(home, 'IDE') };
  const app = path.join(env.ideRoot, 'resources', 'app');
  fs.mkdirSync(path.join(app, 'out'), { recursive: true });
  fs.writeFileSync(path.join(app, 'product.json'), JSON.stringify(product));
  fs.writeFileSync(path.join(app, 'out', 'main.js'), main);
  return { home, env, app };
}

test('The compatibility catalog pins the existing audited bundle, official source and actual native schema', () => {
  const catalog = loadCatalog({ repoRoot: root });
  assert.equal(catalog.format, 1);
  assert.equal(catalog.builds.length, 2);
  const build = catalog.builds[0];
  assert.equal(build.ideVersion, '2.5.5');
  assert.equal(build.mainSha256, NATIVE_MAIN_SHA256);
  assert.equal(build.platform, 'win32');
  assert.equal(build.adapterId, 'uss-int32-agent-tab-v1');
  assert.match(build.source.installerUrl, /^https:\/\/dl\.google\.com\/edgedl\//);
  assert.equal(build.schema.sha256, 'b70f135c55d53617098087edd2da6ae2cbf306b923c8a699b0ee36b4a76c5149');
});

test('A detached worker can load its copied catalog without a surviving source checkout', t => {
  const f = fixture(t), worker = path.join(f.home, 'worker');
  fs.mkdirSync(worker);
  fs.copyFileSync(path.join(root, 'lib/native-compatibility.js'), path.join(worker, 'native-compatibility.js'));
  fs.copyFileSync(path.join(root, 'config/native-compatibility.json'), path.join(worker, 'native-compatibility.json'));
  const copied = require(path.join(worker, 'native-compatibility.js'));
  assert.deepEqual(copied.loadCatalog(), loadCatalog());
  assert.equal(copied.inspectNativeCompatibility(f.env).reasonCode, 'BUNDLE_HASH_MISMATCH');
});

test('Missing installations and explicitly unsupported platforms are read-only structured failures', t => {
  const missing = inspectNativeCompatibility({});
  assert.equal(missing.supported, false); assert.equal(missing.reasonCode, 'INSTALLATION_NOT_FOUND');
  const f = fixture(t), before = fs.readFileSync(path.join(f.app, 'out/main.js'));
  for (const [env, options] of [[{ ...f.env, isWindows: false }, {}], [{ ...f.env, isWindows: false }, { platform: 'win32' }], [f.env, { platform: 'linux' }], [f.env, { architecture: 'ia32' }]]) {
    const result = inspectNativeCompatibility(env, options);
    assert.equal(result.supported, false); assert.equal(result.reasonCode, 'UNSUPPORTED_PLATFORM');
  }
  assert.deepEqual(fs.readFileSync(path.join(f.app, 'out/main.js')), before);
});

test('Malformed metadata is reported without throwing or leaking its contents', t => {
  const f = fixture(t);
  for (const value of ['{PRIVATE-BROKEN-JSON', '[]', 'null', '{"ideVersion":"PRIVATE-INVALID"}', '{"ideVersion":"2.5.5","nameShort":"Another IDE"}']) {
    fs.writeFileSync(path.join(f.app, 'product.json'), value);
    const result = inspectNativeCompatibility(f.env);
    assert.equal(result.supported, false); assert.equal(result.reasonCode, 'INVALID_PRODUCT_METADATA');
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    assert.equal(typeof validateNative(f.env), 'string');
  }
});

test('A version number, fabricated marker or modified main.js never suffices for compatibility', t => {
  const f = fixture(t, { ideVersion: '2.5.5' }, '// WORKSTATION_ANTIGRAVITY_2_5_5');
  const result = inspectNativeCompatibility(f.env);
  assert.equal(result.supported, false); assert.equal(result.reasonCode, 'BUNDLE_HASH_MISMATCH');
  assert.equal(result.installedVersion, null);
  assert.equal(result.reportedProductVersion, '2.5.5');
  assert.equal(result.mainSha256, crypto.createHash('sha256').update('// WORKSTATION_ANTIGRAVITY_2_5_5').digest('hex'));
  assert.match(validateNative(f.env), /Unaudited/);
  fs.writeFileSync(path.join(f.app, 'product.json'), '{"ideVersion":"2.5.6"}');
  const next = inspectNativeCompatibility(f.env);
  assert.equal(next.reasonCode, 'UNSUPPORTED_VERSION'); assert.equal(next.adapterId, null);
});

test('Invalid catalogs, unknown adapters, duplicate identities and unaudited schemas are refused', t => {
  const catalog = loadCatalog(), mutate = action => { const copy = structuredClone(catalog); action(copy); return copy; };
  for (const invalid of [null, [], {}, { format: 1, builds: [] },
    mutate(value => value.builds.push(value.builds[0])),
    mutate(value => { value.builds[0].adapterId = 'guess-new-schema'; }),
    mutate(value => { value.builds[0].adapterId = 'toString'; value.builds[0].schema = {}; }),
    mutate(value => { value.builds[0].schema.sha256 = '0'.repeat(64); }),
    mutate(value => { value.builds[0].mainSha256 = 'pretend'; }),
    mutate(value => { value.builds[0].mainSha256 = [NATIVE_MAIN_SHA256]; }),
    mutate(value => { value.builds[0].source.installerUrl = 'http://dl.google.com/edgedl/file.exe'; }),
    mutate(value => { value.builds[0].source.installerUrl = 'https://unverified.example/file.exe'; }),
    mutate(value => { value.builds[0].evidence = '../../private.txt'; }),
    mutate(value => { value.builds[0].evidence = 'docs/../private.md'; }),
  ]) assert.throws(() => validateCatalog(invalid), /Invalid|Duplicate/);
  const f = fixture(t), catalogFile = path.join(f.home, 'native-compatibility.json');
  fs.writeFileSync(catalogFile, '{BROKEN-PRIVATE-CATALOG');
  const result = inspectNativeCompatibility(f.env, { catalogPath: catalogFile });
  assert.equal(result.reasonCode, 'INVALID_CATALOG'); assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(inspectNativeCompatibility(f.env, { repoRoot: f.home }).reasonCode, 'INVALID_CATALOG');
});

test('The actual audited official bundle matches the catalog and embedded schema', { skip: !process.env.WORKSTATION_ANTIGRAVITY_MAIN }, t => {
  const main = fs.readFileSync(process.env.WORKSTATION_ANTIGRAVITY_MAIN), f = fixture(t, { ideVersion: '2.5.5', nameShort: 'Antigravity IDE' }, main);
  const result = inspectNativeCompatibility(f.env);
  assert.equal(result.supported, true); assert.equal(result.reason, null); assert.equal(result.reasonCode, 'SUPPORTED');
  assert.equal(result.mainSha256, NATIVE_MAIN_SHA256); assert.equal(result.adapterId, 'uss-int32-agent-tab-v1');
  assert.equal(validateNative(f.env), null);
  assert.equal(inspectNativeCompatibility(f.env, { architecture: 'arm64' }).supported, true, 'The extracted official ARM64 bundle has the same audited native bytes');
  fs.appendFileSync(path.join(f.app, 'out/main.js'), '\n// modification');
  assert.equal(inspectNativeCompatibility(f.env).reasonCode, 'BUNDLE_HASH_MISMATCH');
});

test('A stale product version cannot attest the About version even with audited native bytes', { skip: !process.env.WORKSTATION_ANTIGRAVITY_MAIN }, t => {
  const main = fs.readFileSync(process.env.WORKSTATION_ANTIGRAVITY_MAIN);
  const f = fixture(t, { ideVersion: '2.5.5', commit: '9e3a5da5d6731effd57d47d88bbe5df14ac6ccdd' }, main);
  const productFile = path.join(f.app, 'product.json'), before = fs.readFileSync(productFile);
  fs.writeFileSync(path.join(f.app, 'package.json'), JSON.stringify({ version: '1.107.0' }));
  const result = inspectNativeCompatibility(f.env);
  assert.equal(result.supported, true);
  assert.equal(result.supportedScope, 'native-settings-adapter');
  assert.equal(result.reportedProductVersion, '2.5.5');
  assert.equal(result.installedVersion, null);
  assert.equal(result.applicationVersionVerified, false);
  assert.equal(result.versionSource, 'resources/app/product.json:ideVersion');
  assert.deepEqual(fs.readFileSync(productFile), before);
  assert.deepEqual(fs.readFileSync(path.join(f.app, 'out/main.js')), main);
  fs.appendFileSync(path.join(f.app, 'out/main.js'), '\nchanged');
  assert.equal(inspectNativeCompatibility(f.env).reasonCode, 'BUNDLE_HASH_MISMATCH');
});

test('IDE architecture comes from the executable PE header, including an emulated x64 Node on ARM64 Windows', t => {
  const f = fixture(t), executable = path.join(f.env.ideRoot, 'Antigravity IDE.exe');
  const bytes = Buffer.alloc(134); bytes.writeUInt16LE(0x5a4d); bytes.writeUInt32LE(128, 60); bytes.writeUInt32LE(0x4550, 128);
  for (const [machine, expected] of [[0x8664, 'x64'], [0xaa64, 'arm64'], [0x14c, 'unsupported']]) {
    bytes.writeUInt16LE(machine, 132); fs.writeFileSync(executable, bytes);
    assert.equal(installationArchitecture(f.env.ideRoot, expected === 'arm64' ? 'x64' : 'arm64'), expected);
  }
  fs.writeFileSync(executable, 'malformed'); assert.equal(installationArchitecture(f.env.ideRoot), 'unknown');
});
