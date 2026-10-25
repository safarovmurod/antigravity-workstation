import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { engineCompatible, selectCompatibleVersion, latestCompatibleVersion } = require('../scripts/install-gallery-extension.cjs');
const { installExtension, installGalleryExtensions, inspectReusableGalleryExtension } = require('../lib/extensions');

test('Marketplace engine ranges reject future engines and honor the IDE version, major boundary and build date', () => {
  for (const [engine, version, expected] of [
    ['^1.100.0', '1.107.0', true], ['^1.108.0', '1.107.0', false], ['^1.100.0', '2.0.0', false],
    ['>=1.100.0', '2.0.0', true], ['1.107.x', '1.107.3', true], ['1.107.0', '1.107.3', false],
    ['1.x.x', '1.107.0', true], ['*', '1.107.0', true], ['^0.10.0', '1.107.0', true],
    ['^1.1.0 || ^2.0.0', '1.107.0', false], [undefined, '1.107.0', false],
  ]) assert.equal(engineCompatible(engine, version), expected, engine);
  assert.equal(engineCompatible('^1.107.0-20261019', '1.107.0', '2026-10-18T00:00:00Z'), false);
  assert.equal(engineCompatible('^1.107.0-20261017', '1.107.0', '2026-10-18T00:00:00Z'), true);
  assert.equal(engineCompatible('^1.107.0-20261017', '1.107.0'), false);
  assert.equal(engineCompatible('^1.107.0-20261017', '1.107.0', 'invalid-date'), false);
});

function reusableFixture(t, suffix = '') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-reuse-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const extensionsDir = path.join(base, 'User with spaces', '.antigravity-ide', 'extensions');
  const id = 'test.vendor', version = '2.0.0', location = id + '-' + version + suffix;
  const packageDir = path.join(extensionsDir, location);
  fs.mkdirSync(path.join(packageDir, 'out'), { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'out/extension.js'), 'exports.activate = () => {};\n');
  const manifest = { publisher: 'test', name: 'vendor', version, engines: { vscode: '^1.100.0' }, main: './out/extension' };
  const index = [{ identifier: { id }, version, relativeLocation: location, metadata: { source: 'gallery' } }];
  const target = { version: '1.107.0', platform: 'win32-x64', date: '2026-08-13T08:37:22.547Z' };
  const inventory = [{ id, version }];
  const save = () => {
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(extensionsDir, 'extensions.json'), JSON.stringify(index));
  };
  save();
  return { base, id, version, location, packageDir, extensionsDir, manifest, index, target, inventory, save,
    inspect() { return inspectReusableGalleryExtension(id, version, extensionsDir, target, inventory); } };
}

test('Pinned setup reuses a complete compatible registered gallery without downloading or reinstalling it', t => {
  const f = reusableFixture(t), logs = [];
  const result = installGalleryExtensions('fixture-cli', [{ id: f.id, source: 'gallery', version: f.version }], {
    extensionsDir: f.extensionsDir, target: f.target, listInstalled: () => f.inventory,
    install() { assert.fail('Already installed compatible extensions must not contact a gallery or install again'); },
    log(line) { logs.push(line); },
  });
  assert.deepEqual(result.failures, []);
  assert.ok(logs.some(line => /keeping it without a Marketplace download/.test(line)));
  assert.ok(fs.existsSync(path.join(f.packageDir, 'out/extension.js')));
});

test('Latest policy refreshes a reusable gallery without requiring an explicit refresh flag', t => {
  const f = reusableFixture(t); let installs = 0;
  const result = installGalleryExtensions('fixture-cli', [{ id: f.id, source: 'gallery', trackLatest: true }], {
    extensionsDir: f.extensionsDir, target: f.target, listInstalled: () => f.inventory, log() {},
    install(_cli, id, options) { installs++; assert.equal(id, f.id); assert.equal(options.trackLatest, true); return { success: true, version: f.version }; },
  });
  assert.deepEqual(result.failures, []); assert.equal(installs, 1);
});

test('Unknown, incompatible, obsolete and damaged installed packages are repaired through the normal installer', t => {
  for (const [label, change] of [
    ['future engine', f => { f.manifest.engines.vscode = '^1.120.0'; }],
    ['missing engine', f => { delete f.manifest.engines; }],
    ['unknown date', f => { f.manifest.engines.vscode = '^1.107.0-20260812'; delete f.target.date; }],
    ['wrong publisher', f => { f.manifest.publisher = 'other'; }],
    ['wrong version', f => { f.manifest.version = '9.0.0'; }],
    ['wrong index platform', f => { f.index[0].metadata.targetPlatform = 'win32-arm64'; }],
    ['wrong package platform', f => { f.manifest.__metadata = { targetPlatform: 'win32-arm64' }; }],
    ['missing source', f => { delete f.index[0].metadata.source; }],
    ['unknown source', f => { f.index[0].metadata.source = 'unknown'; }],
    ['missing entrypoint', f => { fs.unlinkSync(path.join(f.packageDir, 'out/extension.js')); }],
    ['empty entrypoint', f => { fs.writeFileSync(path.join(f.packageDir, 'out/extension.js'), ''); }],
    ['unsafe entrypoint', f => { f.manifest.main = '../outside.js'; }],
    ['unsafe registration', f => { f.index[0].relativeLocation = '../outside'; }],
    ['missing registration', f => { f.index.splice(0); }],
    ['obsolete package', f => { fs.writeFileSync(path.join(f.extensionsDir, '.obsolete'), JSON.stringify({ [f.location]: true })); }],
    ['missing dependency', f => { f.manifest.extensionDependencies = ['other.dependency']; }],
  ]) {
    const f = reusableFixture(t); change(f); f.save(); let repairs = 0;
    assert.equal(f.inspect(), null, label);
    const result = installGalleryExtensions('fixture-cli', [{ id: f.id, source: 'gallery', trackLatest: true }], {
      extensionsDir: f.extensionsDir, target: f.target, listInstalled: () => f.inventory, log() {},
      install() { repairs++; return { success: false, error: 'fixture network unavailable' }; },
    });
    assert.equal(repairs, 1, label + ': a damaged package must not be skipped');
    assert.deepEqual(result.failures, ['Extension failed: ' + f.id + ': fixture network unavailable'], label);
  }
});

test('A CLI listing alone cannot authorize offline reuse and an absent CLI listing cannot trust disk metadata', t => {
  const f = reusableFixture(t);
  assert.equal(inspectReusableGalleryExtension(f.id, f.version, undefined, f.target, f.inventory), null);
  assert.equal(inspectReusableGalleryExtension(f.id, f.version, f.extensionsDir, undefined, f.inventory), null);
  assert.equal(inspectReusableGalleryExtension(f.id, f.version, f.extensionsDir, f.target, []), null);
  fs.writeFileSync(path.join(f.extensionsDir, 'extensions.json'), '{invalid');
  assert.equal(f.inspect(), null);
});

test('Offline reuse supports universal packages, static theme payloads and verified built-in dependencies', t => {
  for (const suffix of ['', '-universal']) {
    const f = reusableFixture(t, suffix);
    f.index[0].metadata.source = 'vsix';
    f.manifest.__metadata = { targetPlatform: 'undefined' };
    f.manifest.extensionDependencies = ['vscode.git'];
    f.target.builtinExtensions = ['vscode.git'];
    delete f.manifest.main;
    f.manifest.contributes = { iconThemes: [{ id: 'test', path: './icons.json' }] };
    fs.writeFileSync(path.join(f.packageDir, 'icons.json'), '{"iconDefinitions":{}}'); f.save();
    assert.deepEqual(f.inspect(), { version: f.version, relativeLocation: f.location });
    fs.unlinkSync(path.join(f.packageDir, 'icons.json'));
    assert.equal(f.inspect(), null, 'Missing contributed payload requires repair');
  }
});

test('Reuse and duplicate cleanup select the IDE architecture even when only package metadata records it', t => {
  const f = reusableFixture(t, '-win32-x64');
  f.manifest.__metadata = { targetPlatform: 'win32-x64' }; f.save();
  const armLocation = f.id + '-' + f.version + '-win32-arm64';
  const armDir = path.join(f.extensionsDir, armLocation);
  fs.cpSync(f.packageDir, armDir, { recursive: true });
  fs.writeFileSync(path.join(armDir, 'package.json'), JSON.stringify({ ...f.manifest, __metadata: { targetPlatform: 'win32-arm64' } }));
  const armEntry = { identifier: { id: f.id }, version: f.version, relativeLocation: armLocation, metadata: { source: 'gallery' } };
  f.index.push(armEntry); f.save(); f.target.platform = 'win32-arm64';
  const result = installGalleryExtensions('fixture-cli', [{ id: f.id, source: 'gallery', version: f.version }], {
    extensionsDir: f.extensionsDir, target: f.target, listInstalled: () => f.inventory, log() {},
    install() { assert.fail('A compatible ARM64 package is already registered'); },
  });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.extensionsDir, 'extensions.json'))), [armEntry]);
  assert.equal(fs.existsSync(f.packageDir), false);
  assert.ok(fs.existsSync(path.join(armDir, 'out/extension.js')));
  assert.ok(fs.readdirSync(path.join(f.base, 'User with spaces', '.gemini/backups')).length);
});

test('Repeat setup reuses a later valid duplicate, archives known broken copies and preserves unproven contents', t => {
  for (const failure of ['missing manifest', 'malformed manifest', 'unsafe contributed asset']) {
    const f = reusableFixture(t);
    const goodLocation = f.id + '-' + f.version + '-universal';
    const goodDir = path.join(f.extensionsDir, goodLocation);
    fs.cpSync(f.packageDir, goodDir, { recursive: true });
    const goodEntry = { identifier: { id: f.id }, version: f.version, relativeLocation: goodLocation, metadata: { source: 'gallery' } };
    f.index.push(goodEntry);
    const unproven = [
      [f.id + '-9.0.0', null],
      [f.id + '-8.0.0-win32-x64', '{invalid'],
      [f.id + '-' + f.version + '-mystery', '{invalid'],
      [f.id + '-7.0.0', JSON.stringify({ publisher: 'other', name: 'extension', version: '7.0.0' })],
    ];
    for (const [location, bytes] of unproven) {
      fs.mkdirSync(path.join(f.extensionsDir, location));
      fs.writeFileSync(path.join(f.extensionsDir, location, 'keep.txt'), 'unproven content');
      if (bytes !== null) fs.writeFileSync(path.join(f.extensionsDir, location, 'package.json'), bytes);
    }
    // Neither an arbitrary suffix nor a valid but different publisher is
    // permission to archive contents, even if an old index lists that folder.
    f.index.push({ identifier: { id: f.id }, version: f.version, relativeLocation: unproven[2][0] });
    f.index.push({ identifier: { id: f.id }, version: '7.0.0', relativeLocation: unproven[3][0] });
    if (failure === 'unsafe contributed asset') f.manifest.contributes = { snippets: [{ language: 'typescript', path: '../outside.json' }] };
    f.save();
    const damagedManifest = path.join(f.packageDir, 'package.json');
    if (failure === 'missing manifest') fs.unlinkSync(damagedManifest);
    if (failure === 'malformed manifest') fs.writeFileSync(damagedManifest, '{invalid');
    const before = fs.existsSync(damagedManifest) ? fs.readFileSync(damagedManifest) : null;
    const originalIndex = fs.readFileSync(path.join(f.extensionsDir, 'extensions.json'));
    assert.deepEqual(f.inspect(), { version: f.version, relativeLocation: goodLocation }, failure);
    assert.ok(fs.existsSync(path.join(goodDir, 'out/extension.js')), failure);
    assert.deepEqual(fs.existsSync(damagedManifest) ? fs.readFileSync(damagedManifest) : null, before,
      'Inspecting another candidate must not alter the damaged package');
    let downloadOrInstallAttempts = 0;
    const logs = [];
    const result = installGalleryExtensions('fixture-cli', [{ id: f.id, source: 'gallery', version: f.version }], {
      extensionsDir: f.extensionsDir, target: f.target, listInstalled: () => f.inventory,
      install() { downloadOrInstallAttempts++; throw new Error('Unexpected network/install attempt'); }, log(line) { logs.push(line); },
    });
    assert.deepEqual(result.failures, [], failure);
    assert.equal(downloadOrInstallAttempts, 0, failure);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.extensionsDir, 'extensions.json'))), [goodEntry]);
    assert.ok(fs.existsSync(path.join(goodDir, 'out/extension.js')));
    assert.equal(fs.existsSync(f.packageDir), false, 'The original index proves the broken canonical duplicate is managed');
    const backupsDir = path.join(f.base, 'User with spaces', '.gemini/backups');
    const backups = fs.readdirSync(backupsDir).filter(name => name.startsWith('extension-stale-'));
    assert.equal(backups.length, 1);
    const backup = path.join(backupsDir, backups[0]);
    assert.deepEqual(fs.readFileSync(path.join(backup, 'extensions-index.json')), originalIndex);
    assert.ok(fs.existsSync(path.join(backup, f.location, 'out/extension.js')));
    assert.deepEqual(fs.existsSync(path.join(backup, f.location, 'package.json'))
      ? fs.readFileSync(path.join(backup, f.location, 'package.json')) : null, before);
    for (const [location, bytes] of unproven) {
      assert.equal(fs.readFileSync(path.join(f.extensionsDir, location, 'keep.txt'), 'utf8'), 'unproven content');
      assert.equal(fs.existsSync(path.join(f.extensionsDir, location, 'package.json'))
        ? fs.readFileSync(path.join(f.extensionsDir, location, 'package.json'), 'utf8') : null, bytes);
      assert.ok(logs.some(line => line.includes('Warning: preserved') && line.includes(location)));
    }
  }
});

function release(version, engine, targetPlatform, preRelease = false) {
  return { version, targetPlatform, properties: [
    { key: 'Microsoft.VisualStudio.Code.Engine', value: engine },
    { key: 'Microsoft.VisualStudio.Code.PreRelease', value: String(preRelease) },
  ] };
}
test('Latest means the newest stable compatible release for this IDE architecture, never an old catalog pin', () => {
  const extension = { versions: [
    release('12.0.0', '^1.108.0'), release('11.0.0', '^1.100.0', 'win32-x64', true),
    release('10.0.0', '^1.100.0', 'win32-x64'), release('10.0.0', '^1.100.0', 'win32-arm64'),
    release('10.0.0', '^1.100.0'), release('9.0.0', '^1.80.0'),
  ] };
  for (const platform of ['win32-x64', 'win32-arm64']) {
    const selected = selectCompatibleVersion(extension, { version: '1.107.0', platform });
    assert.equal(selected.version, '10.0.0'); assert.equal(selected.targetPlatform, platform);
  }
  assert.throws(() => selectCompatibleVersion({ versions: [release('20.0.0', '^1.120.0')] }, { version: '1.107.0', platform: 'win32-x64' }), /No stable Marketplace release/);
});

test('Official Gallery queries ask for complete version metadata and verify the publisher/name identity', async () => {
  const fetch = async (url, options) => {
    assert.equal(url.href, 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery');
    const body = JSON.parse(options.body);
    assert.equal(body.flags, 147); assert.deepEqual(body.filters[0].criteria, [{ filterType: 7, value: 'official.extension' }]);
    return Response.json({ results: [{ extensions: [{ publisher: { publisherName: 'official' }, extensionName: 'extension', versions: [release('2.0.0', '^1.100.0')] }] }] });
  };
  assert.equal((await latestCompatibleVersion('official.extension', { version: '1.107.0', platform: 'win32-x64' }, fetch)).version, '2.0.0');
  await assert.rejects(latestCompatibleVersion('other.extension', { version: '1.107.0', platform: 'win32-x64' }, async () => Response.json({ results: [{ extensions: [] }] })), /identity mismatch/);
});

test('Production trackLatest repeats check metadata without downloading a healthy current VSIX and fail on metadata errors', t => {
  const f = reusableFixture(t);
  const cli = path.join(f.base, 'editor'); fs.writeFileSync(cli, 'fixture');
  let queries = 0;
  for (let pass = 0; pass < 3; pass++) {
    const result = installExtension(cli, f.id, { trackLatest: true, target: f.target, extensionsDir: f.extensionsDir,
      listInstalled: () => f.inventory, log() {}, run(_file, args) {
        assert.equal(args[1], '--metadata', 'No download or install is permitted for the healthy current package');
        queries++;
        return { status: 0, stdout: JSON.stringify({ version: f.version }) };
      } });
    assert.equal(result.success, true);
    assert.equal(result.metadataChecked, true);
    assert.equal(result.skipped, true);
  }
  assert.equal(queries, 3);
  const failure = installExtension(cli, f.id, { trackLatest: true, target: f.target, extensionsDir: f.extensionsDir,
    listInstalled: () => f.inventory, log() {}, run() { return { status: 1, stderr: 'network unavailable' }; } });
  assert.equal(failure.success, false);
  assert.match(failure.error, /metadata.*network unavailable/i);
});

test('A newer installed package is reused only when its engine and native architecture are compatible', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-gallery-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(base)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(base).startsWith('workstation-gallery-test-'));
    fs.rmSync(base, { recursive: true, force: true });
  });
  const cli = path.join(base, 'editor'); fs.writeFileSync(cli, 'fixture');
  const extensionsDir = path.join(base, 'extensions'), location = 'workstation.calm-typescript-8.0.0';
  fs.mkdirSync(path.join(extensionsDir, location), { recursive: true });
  const target = { version: '1.107.0', platform: 'win32-x64' };
  fs.writeFileSync(path.join(extensionsDir, location, 'extension.js'), 'exports.activate=()=>{};');
  const artifact = fs.readFileSync(new URL('../extensions/calm-typescript/calm-typescript-3.3.2.vsix', import.meta.url));
  for (const [engine, platform, keep] of [['^1.100.0', 'win32-x64', true], ['^1.120.0', 'win32-x64', false], ['^1.100.0', 'win32-arm64', false]]) {
    fs.writeFileSync(path.join(extensionsDir, location, 'package.json'), JSON.stringify({ publisher: 'workstation', name: 'calm-typescript', version: '8.0.0', main: './extension.js', engines: { vscode: engine } }));
    fs.writeFileSync(path.join(extensionsDir, 'extensions.json'), JSON.stringify([{ identifier: { id: 'workstation.calm-typescript' }, version: '8.0.0', relativeLocation: location, metadata: { targetPlatform: platform, source: 'gallery' } }]));
    let current = '8.0.0', installs = 0;
    const result = installExtension(cli, 'workstation.calm-typescript', { trackLatest: true, target, extensionsDir, platform: 'linux', log() {},
      listInstalled: () => [{ id: 'workstation.calm-typescript', version: current }],
      run(file, args) {
        if (args[1] === '--metadata') return { status: 0, stdout: JSON.stringify({ version: '3.3.2' }) };
        if (file === process.execPath) { fs.writeFileSync(args[3], artifact); return { status: 0 }; }
        installs++; current = '3.3.2'; return { status: 0 };
      } });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.skipped === true, keep, engine + '/' + platform);
    assert.equal(installs, keep ? 0 : 1);
  }
});
