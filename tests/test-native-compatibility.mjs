import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { inspectNativeCompatibility, validateNative, validateCatalog, loadCatalog, NATIVE_MAIN_SHA256, SUPPORTED_IDE_VERSION, SUPPORTED_IDE_VERSIONS, installationArchitecture } = require('../lib/native-compatibility');
const root = path.resolve(import.meta.dirname, '..');

function fixture(t, product = { ideVersion: '2.6.0' }, main = 'not the official Antigravity bundle') {
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
  assert.equal(catalog.builds.length, 4);
  const build = catalog.builds.find(b => b.ideVersion === '2.6.0');
  assert.equal(build.ideVersion, '2.6.0');
  assert.equal(build.mainSha256, NATIVE_MAIN_SHA256);
  assert.equal(build.platform, 'win32');
  assert.equal(build.adapterId, 'uss-int32-agent-tab-v1');
  assert.match(build.source.installerUrl, /^https:\/\/dl\.google\.com\/edgedl\//);
  assert.equal(build.schema.sha256, 'b70f135c55d53617098087edd2da6ae2cbf306b923c8a699b0ee36b4a76c5149');

  const build260 = catalog.builds.find(b => b.ideVersion === '2.6.0' && b.architecture === 'x64');
  assert.ok(build260);
  assert.equal(build260.mainSha256, '2a0e8928e47f354324a1622ae114a77839bbc2c1e22c77ca2917df5a6c19e5c5');
  assert.equal(build260.adapterId, 'uss-int32-agent-tab-v1');
  assert.equal(build260.schema.sha256, 'b70f135c55d53617098087edd2da6ae2cbf306b923c8a699b0ee36b4a76c5149');
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
  for (const value of ['{PRIVATE-BROKEN-JSON', '[]', 'null', '{"ideVersion":"PRIVATE-INVALID"}', '{"ideVersion":"2.6.0","nameShort":"Another IDE"}']) {
    fs.writeFileSync(path.join(f.app, 'product.json'), value);
    const result = inspectNativeCompatibility(f.env);
    assert.equal(result.supported, false); assert.equal(result.reasonCode, 'INVALID_PRODUCT_METADATA');
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    assert.equal(typeof validateNative(f.env), 'string');
  }
});

test('A version number, fabricated marker or modified main.js never suffices for compatibility', t => {
  const f = fixture(t, { ideVersion: '2.6.0' }, '// WORKSTATION_ANTIGRAVITY_2_6_0');
  const result = inspectNativeCompatibility(f.env);
  assert.equal(result.supported, false); assert.equal(result.reasonCode, 'BUNDLE_HASH_MISMATCH');
  assert.equal(result.installedVersion, null);
  assert.equal(result.reportedProductVersion, '2.6.0');
  assert.equal(result.mainSha256, crypto.createHash('sha256').update('// WORKSTATION_ANTIGRAVITY_2_6_0').digest('hex'));
  assert.match(validateNative(f.env), /Unaudited/);
  fs.writeFileSync(path.join(f.app, 'product.json'), '{"ideVersion":"2.6.1"}');
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
    mutate(value => { value.builds[0].mainSha256 = null; }),
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
  const main = fs.readFileSync(process.env.WORKSTATION_ANTIGRAVITY_MAIN);
  const hash = crypto.createHash('sha256').update(main).digest('hex');
  const catalog = loadCatalog({ repoRoot: root });
  const build = catalog.builds.find(b => b.mainSha256 === hash);
  assert.ok(build, 'Supplied bundle must match an audited catalog entry');
  const f = fixture(t, { ideVersion: build.ideVersion, nameShort: 'Antigravity IDE' }, main);
  const result = inspectNativeCompatibility(f.env);
  assert.equal(result.supported, true); assert.equal(result.reason, null); assert.equal(result.reasonCode, 'SUPPORTED');
  assert.equal(result.mainSha256, build.mainSha256); assert.equal(result.adapterId, 'uss-int32-agent-tab-v1');
  assert.equal(validateNative(f.env), null);
  assert.equal(inspectNativeCompatibility(f.env, { architecture: 'arm64' }).supported, true, 'The extracted official ARM64 bundle has the same audited native bytes');
  fs.appendFileSync(path.join(f.app, 'out/main.js'), '\n// modification');
  assert.equal(inspectNativeCompatibility(f.env).reasonCode, 'BUNDLE_HASH_MISMATCH');
});

test('A stale product version cannot attest the About version even with audited native bytes', { skip: !process.env.WORKSTATION_ANTIGRAVITY_MAIN }, t => {
  const main = fs.readFileSync(process.env.WORKSTATION_ANTIGRAVITY_MAIN);
  const hash = crypto.createHash('sha256').update(main).digest('hex');
  const catalog = loadCatalog({ repoRoot: root });
  const build = catalog.builds.find(b => b.mainSha256 === hash);
  assert.ok(build);
  const f = fixture(t, { ideVersion: build.ideVersion, commit: '9e3a5da5d6731effd57d47d88bbe5df14ac6ccdd' }, main);
  const productFile = path.join(f.app, 'product.json'), before = fs.readFileSync(productFile);
  fs.writeFileSync(path.join(f.app, 'package.json'), JSON.stringify({ version: '1.107.0' }));
  const result = inspectNativeCompatibility(f.env);
  assert.equal(result.supported, true);
  assert.equal(result.supportedScope, 'native-settings-adapter');
  assert.equal(result.reportedProductVersion, build.ideVersion);
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

test('Audited 2.6.0 bundle validates correctly against the compatibility catalog and schema', () => {
  const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : null);
  const localIde = localAppData ? path.join(localAppData, 'Programs', 'Antigravity IDE') : null;
  if (!localIde || !fs.existsSync(localIde)) return;
  const result = inspectNativeCompatibility({ ideRoot: localIde });
  assert.equal(result.supported, true);
  assert.equal(result.reasonCode, 'SUPPORTED');
  assert.equal(result.reportedProductVersion, '2.6.0');
  assert.equal(result.mainSha256, '2a0e8928e47f354324a1622ae114a77839bbc2c1e22c77ca2917df5a6c19e5c5');
  assert.equal(result.adapterId, 'uss-int32-agent-tab-v1');
});

test('Only Antigravity IDE 2.7.0 and 2.6.0 are supported; every other version stops with an install hint', t => {
  const catalog = loadCatalog({ repoRoot: root });
  assert.deepEqual(SUPPORTED_IDE_VERSIONS, ['2.7.0', '2.6.0']);
  assert.equal(SUPPORTED_IDE_VERSION, '2.7.0');
  assert.deepEqual([...new Set(catalog.builds.map(build => build.ideVersion))].sort(), ['2.6.0', '2.7.0']);
  for (const version of SUPPORTED_IDE_VERSIONS) {
    for (const architecture of ['x64', 'arm64']) {
      const build = catalog.builds.find(b => b.ideVersion === version && b.architecture === architecture);
      assert.ok(build, 'Audited ' + version + ' ' + architecture + ' build');
      assert.equal(build.adapterId, 'uss-int32-agent-tab-v1');
      assert.ok(build.source.installerUrl.includes('/stable/' + version + '-'));
    }
    // A known version with unaudited bytes is a hash mismatch, not an unsupported version.
    assert.equal(inspectNativeCompatibility(fixture(t, { ideVersion: version }).env, { architecture: 'x64' }).reasonCode, 'BUNDLE_HASH_MISMATCH');
  }
  for (const version of ['2.5.5', '2.5.2', '2.1.1', '2.6.6', '2.8.0']) {
    const result = inspectNativeCompatibility(fixture(t, { ideVersion: version }).env, { architecture: 'x64' });
    assert.equal(result.reasonCode, 'UNSUPPORTED_VERSION');
    assert.match(result.reason, /install Antigravity IDE 2\.7\.0 or 2\.6\.0/);
  }
  assert.throws(() => validateCatalog({ format: 1, builds: [{ ...catalog.builds[0], ideVersion: '2.8.0' }] }), /Invalid native compatibility catalog entry/);
});

test('The embedded schema check ignores minified helper names but rejects a changed or missing descriptor', () => {
  const name = Buffer.from('exa/unified_state_sync_pb/unified_state_sync.proto');
  const descriptor = body => Buffer.concat([Buffer.from([0x0a, name.length]), name, Buffer.from(body)]).toString('base64');
  const good = descriptor('audited'), sha = crypto.createHash('sha256').update(Buffer.from(good, 'base64')).digest('hex');
  const importer = Buffer.concat([Buffer.from([0x0a, 5]), Buffer.from('a.pro'), Buffer.from([0x1a, name.length]), name]).toString('base64');
  const { embeddedSchemaMatches } = require('../lib/native-compatibility');
  const build = { schema: { name: name.toString(), sha256: sha } };
  const matches = text => embeddedSchemaMatches(Buffer.from(text), build);
  for (const helper of ['Uo', 'Ra', 'va', 'Xy$']) assert.equal(matches('a=' + helper + '("' + good + '");'), true, helper);
  assert.equal(matches('a=Ra("' + good + '"),b=va("' + good + '");'), true, 'Identical copies of the audited schema are accepted');
  assert.equal(matches('a=Ra("' + good + '"),b=va("' + importer + '");'), true, 'A file that only imports the schema is ignored');
  assert.equal(matches('a=Ra("' + good + '"),b=va("' + descriptor('changed') + '");'), false, 'A second, different schema is rejected');
  assert.equal(matches('a=Ra("' + descriptor('changed') + '");'), false);
  assert.equal(matches('a=Ra("' + importer + '");'), false, 'A bundle without the schema is rejected');
});
