import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { engineCompatible, selectCompatibleVersion, latestCompatibleVersion } = require('../scripts/install-gallery-extension.cjs');
const { installExtension } = require('../lib/extensions');

test('Marketplace engine ranges reject future engines and honor the IDE version, major boundary and build date', () => {
  for (const [engine, version, expected] of [
    ['^1.100.0', '1.107.0', true], ['^1.108.0', '1.107.0', false], ['^1.100.0', '2.0.0', false],
    ['>=1.100.0', '2.0.0', true], ['1.107.x', '1.107.3', true], ['1.107.0', '1.107.3', false],
    ['1.x.x', '1.107.0', true], ['*', '1.107.0', true], ['^0.10.0', '1.107.0', true],
    ['^1.1.0 || ^2.0.0', '1.107.0', false], [undefined, '1.107.0', false],
  ]) assert.equal(engineCompatible(engine, version), expected, engine);
  assert.equal(engineCompatible('^1.107.0-20261019', '1.107.0', '2026-10-18T00:00:00Z'), false);
  assert.equal(engineCompatible('^1.107.0-20261017', '1.107.0', '2026-10-18T00:00:00Z'), true);
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
  const artifact = fs.readFileSync(new URL('../extensions/calm-typescript/calm-typescript-3.3.1.vsix', import.meta.url));
  for (const [engine, platform, keep] of [['^1.100.0', 'win32-x64', true], ['^1.120.0', 'win32-x64', false], ['^1.100.0', 'win32-arm64', false]]) {
    fs.writeFileSync(path.join(extensionsDir, location, 'package.json'), JSON.stringify({ publisher: 'workstation', name: 'calm-typescript', version: '8.0.0', engines: { vscode: engine } }));
    fs.writeFileSync(path.join(extensionsDir, 'extensions.json'), JSON.stringify([{ identifier: { id: 'workstation.calm-typescript' }, version: '8.0.0', relativeLocation: location, metadata: { targetPlatform: platform } }]));
    let current = '8.0.0', installs = 0;
    const result = installExtension(cli, 'workstation.calm-typescript', { trackLatest: true, target, extensionsDir, platform: 'linux', log() {},
      listInstalled: () => [{ id: 'workstation.calm-typescript', version: current }],
      run(file, args) {
        if (file === process.execPath) { fs.writeFileSync(args[3], artifact); return { status: 0 }; }
        installs++; current = '3.3.1'; return { status: 0 };
      } });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.skipped === true, keep, engine + '/' + platform);
    assert.equal(installs, keep ? 0 : 1);
  }
});
