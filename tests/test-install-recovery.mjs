import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { installExtension, installGalleryExtensions, archiveStaleExtensionDirs } = require('../lib/extensions');
const { ensureAgentBrowser } = require('../lib/installer');
const { findBrowserRuntime } = require('../lib/browser-runtime');
const { readVsixManifest, downloadExtension } = require('../scripts/install-gallery-extension.cjs');
const archive = fs.readFileSync(new URL('../extensions/ts-mancho/ts-mancho-3.2.1.vsix', import.meta.url));
const catalog = require('../config/extensions.json');

test('Default gallery installation excludes removed extensions and Jelly Cursor while installing the remaining gallery items', () => {
  const calls = [], logs = [];
  const result = installGalleryExtensions('fixture-cli', catalog, {
    listInstalled(_cli, options) { assert.equal(options.strict, true); return []; },
    install(_cli, id, options) { calls.push({ id, version: options.version }); return { success: true }; },
    log(line) { logs.push(line); },
  });
  assert.deepEqual(result, { failures: [], skipped: ['iranon.jelly-cursor'] });
  assert.equal(calls.length, 18);
  for (const id of ['meta.pyrefly', 'ms-python.python', 'ms-python.debugpy', 'ms-python.vscode-python-envs', 'shopify.ruby-lsp',
    'github.vscode-github-actions', 'golang.go', 'vscjava.vscode-gradle',
    'akintomiwa-fisayo.icon-classes', 'fogio.jetbrains-product-icon-theme',
    'ms-azuretools.vscode-containers', 'llvm-vs-code-extensions.vscode-clangd', 'ms-azuretools.vscode-docker']) {
    assert.ok(!calls.some(call => call.id === id), id + ' must not be requested');
  }
  assert.deepEqual(calls, catalog.filter(ext => ext.source === 'gallery' && !ext.optional)
    .map(({ id, version }) => ({ id, version })));
  assert.ok(logs.some(line => /Optional extension skipped: iranon.jelly-cursor/.test(line)));
  assert.ok(!logs.some(line => /jelly-cursor.*already installed/.test(line)));
});

test('Repeat gallery installation preserves pinned extensions and refreshes latest-tracked ones', () => {
  const installed = catalog.filter(ext => ext.source === 'gallery').map(({ id, version }) => ({ id, version }));
  const calls = [];
  const result = installGalleryExtensions('fixture-cli', catalog, {
    listInstalled() { return installed; },
    install(_cli, id, options) { calls.push({ id, version: options.version, trackLatest: options.trackLatest === true }); return { success: true }; },
    log() {},
  });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(calls.map(call => call.id).sort(),
    ['oxc.oxc-vscode', 'streetsidesoftware.code-spell-checker'].sort(),
    'Only latest-tracked extensions are refreshed');
  assert.ok(calls.every(call => call.trackLatest && call.version === undefined), 'Latest refresh must not pin a version');
});

test('Skipping optional decorations does not suppress required extension failures or version repairs', () => {
  const calls = [];
  const required = catalog.find(ext => ext.source === 'gallery' && !ext.optional);
  const result = installGalleryExtensions('fixture-cli', [required, catalog.find(ext => ext.optional)], {
    listInstalled() { return [{ id: required.id, version: '0.0.0' }]; },
    install(_cli, id, options) { calls.push([id, options.version]); return { success: false }; },
    log() {},
  });
  assert.deepEqual(calls, [[required.id, required.version]]);
  assert.deepEqual(result.failures, ['Extension failed: ' + required.id]);
});

test('Optional decoration policy does not hide an unavailable extension inventory', () => {
  assert.throws(() => installGalleryExtensions('fixture-cli', catalog, {
    listInstalled() { throw new Error('Inventory unavailable'); },
    install() { assert.fail('No installs without verified inventory'); }, log() {},
  }), /Inventory unavailable/);
});

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-recovery-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'User With Spaces');
  const envPaths = { userProfile: home, localAppData: path.join(home, 'AppData/Local'),
    programFiles: path.join(base, 'Programs With Spaces'), backupsDir: path.join(home, '.gemini/backups') };
  return { base, envPaths, env: {}, platform: 'win32', log() {} };
}
function put(file, bytes = '') { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
function browserStub(calls, onCommand = () => {}) {
  return (command, options) => {
    calls.push(command);
    onCommand(command, options);
    if (command === 'agent-browser --version') return 'agent-browser 0.38.1\n';
    if (command.endsWith(' open about:blank')) return JSON.stringify({ success: true, data: { url: 'about:blank' } });
    if (command.endsWith(' close')) return JSON.stringify({ success: true });
    if (command === 'agent-browser install') return '';
    throw new Error('Unexpected command: ' + command);
  };
}

for (const [vendor, executable] of [['Google/Chrome', 'chrome.exe'], ['Microsoft/Edge', 'msedge.exe']]) {
  test('Existing ' + vendor + ' avoids the Chrome download, launches a private test page and preserves user defaults', t => {
    const f = fixture(t), calls = [];
    const browser = path.join(f.envPaths.programFiles, vendor, 'Application', executable);
    put(browser, 'fake executable; process launch mocked');
    const config = path.join(f.envPaths.userProfile, '.agent-browser/config.json');
    const original = '{"proxyBypass":"localhost","customOption":"KEEP"}\n';
    put(config, original);
    Object.assign(f.env, { AGENT_BROWSER_CDP: 'http://existing-browser.invalid:9222',
      AGENT_BROWSER_PROFILE: path.join(f.envPaths.userProfile, 'Personal browser'),
      HTTPS_PROXY: 'http://existing-proxy.invalid:8080' });
    let probeDir;
    const run = browserStub(calls, (command, options) => {
      if (command.endsWith(' open about:blank')) {
        probeDir = options.cwd;
        const isolated = JSON.parse(fs.readFileSync(path.join(probeDir, 'config.json')));
        assert.equal(isolated.executablePath, browser);
        assert.equal(isolated.profile, path.join(probeDir, 'profile'));
        assert.notEqual(isolated.profile, f.envPaths.userProfile);
        assert.match(command, /--session mansur-setup-/);
        assert.ok(command.includes(`--profile "${isolated.profile}"`));
        assert.ok(command.includes('--auto-connect false'));
        assert.equal(options.env.AGENT_BROWSER_CDP, undefined);
        assert.equal(options.env.HTTPS_PROXY, f.env.HTTPS_PROXY);
      }
    });
    assert.equal(ensureAgentBrowser({ ...f, run }).verified, true);
    assert.ok(!calls.includes('agent-browser install'));
    assert.equal(fs.existsSync(probeDir), false);
    assert.equal(f.env.AGENT_BROWSER_CDP, 'http://existing-browser.invalid:9222');
    assert.deepEqual(JSON.parse(fs.readFileSync(config)), { proxyBypass: 'localhost', customOption: 'KEEP', executablePath: browser });
    const backups = fs.readdirSync(f.envPaths.backupsDir);
    assert.equal(backups.length, 1);
    assert.equal(fs.readFileSync(path.join(f.envPaths.backupsDir, backups[0], 'config.json'), 'utf8'), original);
    const mtime = fs.statSync(config).mtimeMs;
    ensureAgentBrowser({ ...f, run });
    assert.equal(fs.statSync(config).mtimeMs, mtime);
    assert.deepEqual(fs.readdirSync(f.envPaths.backupsDir), backups);
  });
}

test('Browser download only runs without a runtime and success requires an executable plus a real launch response', t => {
  const f = fixture(t), calls = [];
  const binary = path.join(f.envPaths.userProfile, '.agent-browser/browsers/chrome-155/chrome-win64/chrome.exe');
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  assert.equal(findBrowserRuntime(f), null, 'An incomplete cache directory must not count as a browser');
  const run = browserStub(calls, command => { if (command === 'agent-browser install') put(binary, 'mock runtime'); });
  assert.equal(ensureAgentBrowser({ ...f, run }).verified, true);
  assert.equal(calls.filter(command => command === 'agent-browser install').length, 1);
  assert.equal(fs.existsSync(path.join(f.envPaths.userProfile, '.agent-browser/config.json')), false, 'The upstream cache needs no new defaults');
});

test('Browser preview never launches processes or changes files', t => {
  const f = fixture(t);
  assert.deepEqual(ensureAgentBrowser({ ...f, dryRun: true, run() { throw new Error('Unexpected process'); } }), { dryRun: true });
  assert.equal(fs.existsSync(f.envPaths.userProfile), false);
});

test('A configured missing browser is preserved and is not replaced with a download', t => {
  const f = fixture(t), calls = [];
  const config = path.join(f.envPaths.userProfile, '.agent-browser/config.json');
  const bytes = JSON.stringify({ executablePath: path.join(f.base, 'missing.exe'), customOption: 'KEEP' });
  put(config, bytes);
  assert.throws(() => ensureAgentBrowser({ ...f, run: browserStub(calls) }), /Configured browser executable not found/);
  assert.equal(fs.readFileSync(config, 'utf8'), bytes);
  assert.ok(!calls.includes('agent-browser install'));
});

test('Failed browser launch fails setup, closes only its own session, and never writes browser defaults', t => {
  const f = fixture(t), calls = [];
  put(path.join(f.envPaths.programFiles, 'Microsoft/Edge/Application/msedge.exe'), 'mock binary');
  const run = browserStub(calls, command => { if (command.endsWith(' open about:blank')) throw new Error('mock browser failed to launch'); });
  assert.throws(() => ensureAgentBrowser({ ...f, run }), /failed to launch/);
  assert.ok(calls.at(-1).endsWith(' close'));
  const session = calls.find(command => command.endsWith(' open about:blank')).match(/--session (\S+)/)[1];
  assert.ok(calls.at(-1).includes('--session ' + session));
  assert.equal(fs.existsSync(path.join(f.envPaths.userProfile, '.agent-browser/config.json')), false);
});

test('A successful download command without an executable cannot pass verification', t => {
  const f = fixture(t);
  assert.throws(() => ensureAgentBrowser({ ...f, run: browserStub([]) }), /without a usable executable/);
});

test('Official VSIX downloads validate manifest identity, version, CRC and HTTPS redirects before saving', async t => {
  const f = fixture(t), file = path.join(f.base, 'download.vsix');
  assert.equal(readVsixManifest(archive, 'mancho.ts-mancho', '3.2.1').version, '3.2.1');
  let requests = 0;
  const result = await downloadExtension('mancho.ts-mancho', '3.2.1', file, async (url, options) => {
    assert.equal(url.protocol, 'https:'); assert.equal(options.redirect, 'manual');
    return ++requests === 1 ? new Response(null, { status: 302, headers: { location: 'https://mancho.gallery.vsassets.io/package.vsix' } }) : new Response(archive);
  });
  assert.equal(result.version, '3.2.1'); assert.equal(requests, 2);
  assert.deepEqual(fs.readFileSync(file), archive);
  assert.throws(() => readVsixManifest(archive, 'other.extension', '3.2.1'), /identity or version mismatch/);
  assert.throws(() => readVsixManifest(archive, 'mancho.ts-mancho', '3.1.1'), /identity or version mismatch/);
  const corrupt = Buffer.from(archive), name = corrupt.indexOf(Buffer.from('extension/package.json'), corrupt.readUInt32LE(corrupt.length - 6));
  assert.ok(name > 46); corrupt[name - 46 + 16] ^= 1;
  assert.throws(() => readVsixManifest(corrupt, 'mancho.ts-mancho'), /checksum mismatch/);
});

test('HTTP errors, HTML, truncated ZIPs and untrusted redirects cannot create an installable VSIX', async t => {
  const f = fixture(t);
  const file = path.join(f.base, 'bad.vsix');
  for (const [response, message] of [
    [new Response('missing', { status: 404 }), /HTTP 404/],
    [new Response('<html>error</html>'), /Invalid or truncated/],
    [new Response(archive.subarray(0, 100)), /Invalid or truncated/],
    [new Response(null, { status: 302, headers: { location: 'http://marketplace.visualstudio.com/insecure' } }), /Unsupported Marketplace redirect/],
    [new Response(null, { status: 302, headers: { location: 'https://untrusted.invalid/package' } }), /Unsupported Marketplace redirect/]
  ]) {
    await assert.rejects(downloadExtension('mancho.ts-mancho', '3.2.1', file, async () => response), message);
    assert.equal(fs.existsSync(file), false);
  }
});

test('Gallery failure uses a validated official VSIX and requires actual CLI registration', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  let registered = false, artifact, downloadOptions;
  const result = installExtension(cli, 'mancho.ts-mancho', { version: '3.2.1', marketplaceFallback: true, log() {},
    listInstalled: () => registered ? [{ id: 'mancho.ts-mancho', version: '3.2.1' }] : [],
    run(file, args, options) {
      if (file === process.execPath) { artifact = args.at(-1); downloadOptions = options; put(artifact, archive); return { status: 0 }; }
      if (args[1] === artifact) { registered = true; return { status: 0 }; }
      return { status: 1 };
    } });
  assert.equal(result.success, true); assert.equal(result.method, 'marketplace-vsix');
  assert.equal(downloadOptions.env.NODE_USE_ENV_PROXY, '1');
  assert.equal(downloadOptions.env.HTTPS_PROXY, process.env.HTTPS_PROXY);
  assert.equal(fs.existsSync(artifact), false, 'Only the installer-owned temporary download is cleaned');
});

test('Compatible gallery version is accepted only with an explicit per-extension opt-in', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  for (const allowCompatibleVersion of [false, true]) {
    let registered = false;
    const result = installExtension(cli, 'mancho.ts-mancho', { version: '3.0.0', allowCompatibleVersion, log() {},
      run(_file, args) { if (args[1] === 'mancho.ts-mancho') { registered = true; return { status: 0 }; } return { status: 1 }; },
      listInstalled: () => registered ? [{ id: 'mancho.ts-mancho', version: '3.2.1' }] : [] });
    assert.equal(result.success, allowCompatibleVersion);
    if (allowCompatibleVersion) { assert.equal(result.version, '3.2.1'); assert.equal(result.exact, false); }
  }
});

test('Wrong downloaded identity and unregistered VSIX installation both remain failures', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  for (const id of ['other.extension', 'mancho.ts-mancho']) {
    let artifactInstalls = 0, artifact;
    const result = installExtension(cli, id, { version: '3.2.1', marketplaceFallback: true, log() {}, listInstalled: () => [],
      run(file, args) {
        if (file === process.execPath) { artifact = args.at(-1); put(artifact, archive); return { status: 0 }; }
        if (args[1] === artifact) { artifactInstalls++; return { status: 0 }; }
        return { status: 1 };
      } });
    assert.equal(result.success, false);
    assert.equal(artifactInstalls, id === 'mancho.ts-mancho' ? 1 : 0);
    assert.equal(fs.existsSync(artifact), false);
  }
});

test('Windows CMD extension installation quotes the actual CLI path and retains registration verification', t => {
  const f = fixture(t), cli = path.join(f.base, 'Editor With Spaces', 'editor.cmd'); put(cli);
  let command;
  const result = installExtension(cli, 'test.demo', { version: '1.0.0', platform: 'win32', log() {},
    exec(value) { command = value; }, listInstalled: () => [{ id: 'test.demo', version: '1.0.0' }] });
  assert.equal(command, `"${cli}" --install-extension "test.demo@1.0.0" --force`);
  assert.equal(result.success, true);
});

test('Latest-tracked extensions resolve the Marketplace latest and install only a newer version (update policy)', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  let registered = '3.1.2', installCalls = 0, downloadArgs = null, artifactPath = '';
  const result = installExtension(cli, 'mancho.ts-mancho', { trackLatest: true, log() {},
    listInstalled: () => [{ id: 'mancho.ts-mancho', version: registered }],
    run(file, args, options) {
      if (file === process.execPath) {
        downloadArgs = args;
        assert.equal(args[2], 'latest');
        artifactPath = args.at(-1);
        put(artifactPath, archive);
        return { status: 0 };
      }
      if (args.includes(artifactPath)) { registered = '3.2.1'; installCalls++; return { status: 0 }; }
      return { status: 1 };
    } });
  assert.equal(result.success, true);
  assert.equal(result.version, '3.2.1');
  assert.equal(result.skipped, undefined);
  assert.equal(installCalls, 1, 'The newer artifact is installed exactly once');
  assert.equal(downloadArgs.at(-2), 'latest');
});

test('Latest-tracked extensions skip the install when the registered version is already the latest', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  let installCalls = 0;
  const result = installExtension(cli, 'mancho.ts-mancho', { trackLatest: true, log() {},
    listInstalled: () => [{ id: 'mancho.ts-mancho', version: '3.2.1' }],
    run(file, args) {
      if (file === process.execPath) { put(args.at(-1), archive); return { status: 0 }; }
      installCalls++;
      return { status: 0 };
    } });
  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
  assert.equal(result.version, '3.2.1');
  assert.equal(installCalls, 0, 'The gallery install is skipped when the latest is already registered');
});

test('Old version directories of a managed extension are archived, never duplicated or destroyed', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-stale-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'User With Spaces');
  const extensionsDir = path.join(home, '.antigravity-ide', 'extensions');
  for (const [dir, file, body] of [
    ['test.vendor-1.0.0', 'old.js', 'old package'],
    ['test.vendor-2.0.0', 'new.js', 'current package'],
  ]) {
    fs.mkdirSync(path.join(extensionsDir, dir), { recursive: true });
    fs.writeFileSync(path.join(extensionsDir, dir, file), body);
    put(path.join(extensionsDir, dir, 'package.json'), JSON.stringify({ publisher: 'test', name: 'vendor', version: dir === 'test.vendor-1.0.0' ? '1.0.0' : '2.0.0' }));
  }
  fs.writeFileSync(path.join(extensionsDir, 'extensions.json'),
    JSON.stringify([{ identifier: { id: 'test.vendor' }, version: '2.0.0', relativeLocation: 'test.vendor-2.0.0' }]));
  const logs = [];
  const archived = archiveStaleExtensionDirs(extensionsDir, 'test.vendor', line => logs.push(line));
  assert.equal(archived.length, 1);
  assert.equal(fs.existsSync(path.join(extensionsDir, 'test.vendor-1.0.0')), false, 'The old directory leaves the extensions folder');
  assert.ok(fs.existsSync(archived[0]), 'The old directory is preserved in the private backup area');
  assert.equal(fs.readFileSync(path.join(archived[0], 'old.js'), 'utf8'), 'old package');
  assert.equal(fs.existsSync(path.join(extensionsDir, 'test.vendor-2.0.0', 'new.js')), true, 'The current version stays in place');
  assert.match(logs[0], /Archived old test\.vendor/);
  assert.deepEqual(archiveStaleExtensionDirs(extensionsDir, 'unknown.publisher', () => {}), []);
});

test('Latest update never downgrades a newer release, prerelease or build metadata version', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  for (const version of ['3.10.0', '4.0.0-beta.1', '3.2.1+local']) {
    let installs = 0, artifact;
    const result = installExtension(cli, 'mancho.ts-mancho', { trackLatest: true, log() {},
      listInstalled: () => [{ id: 'mancho.ts-mancho', version }],
      run(file, args) {
        if (file === process.execPath) { artifact = args.at(-1); put(artifact, archive); return { status: 0 }; }
        installs++; return { status: 0 };
      } });
    assert.equal(result.success, true); assert.equal(result.skipped, true);
    assert.equal(result.version, version); assert.equal(installs, 0); assert.equal(fs.existsSync(artifact), false);
  }
});

test('A stable latest release replaces its older prerelease and verifies Windows CMD registration', t => {
  const f = fixture(t), cli = path.join(f.base, 'Editor With Spaces', 'editor.cmd'); put(cli);
  let current = '3.2.1-beta.9', command, artifact;
  const result = installExtension(cli, 'mancho.ts-mancho', { trackLatest: true, platform: 'win32', log() {},
    listInstalled: () => [{ id: 'mancho.ts-mancho', version: current }],
    run(file, args) { assert.equal(file, process.execPath); artifact = args.at(-1); put(artifact, archive); return { status: 0 }; },
    exec(value, options) { command = value; assert.equal(options.timeout, 180000); current = '3.2.1'; } });
  assert.equal(result.success, true);
  assert.equal(command, `"${cli}" --install-extension "${artifact}" --force`);
  assert.equal(fs.existsSync(artifact), false);
});

test('Latest download, identity, inventory, compatibility and registration failures cannot report success', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  for (const failure of ['download', 'identity', 'inventory', 'incompatible', 'unregistered']) {
    let artifact, installs = 0;
    const result = installExtension(cli, failure === 'identity' ? 'other.extension' : 'mancho.ts-mancho', {
      trackLatest: true, log() {}, listInstalled() {
        if (failure === 'inventory') throw new Error('inventory unavailable');
        return [{ id: 'mancho.ts-mancho', version: '3.1.2' }];
      }, run(file, args) {
        if (file === process.execPath) {
          artifact = args.at(-1);
          if (failure === 'download') return { status: 1, stderr: 'offline' };
          put(artifact, archive); return { status: 0 };
        }
        installs++; return { status: failure === 'incompatible' ? 1 : 0 };
      } });
    assert.equal(result.success, false, failure);
    assert.equal(installs, ['incompatible', 'unregistered'].includes(failure) ? 1 : 0);
    assert.equal(fs.existsSync(artifact), false);
  }
});

test('Stale cleanup requires valid current registration and preserves extensions with similar prefixes', t => {
  const f = fixture(t), root = path.join(f.base, 'home', '.antigravity-ide', 'extensions');
  for (const [location, name, version] of [['test.vendor-1.0.0', 'vendor', '1.0.0'], ['test.vendor-2.0.0', 'vendor', '2.0.0'], ['test.vendor-other-1.0.0', 'vendor-other', '1.0.0']]) {
    put(path.join(root, location, 'package.json'), JSON.stringify({ publisher: 'test', name, version }));
  }
  const index = path.join(root, 'extensions.json');
  for (const entry of [null, { identifier: { id: 'other.extension' }, relativeLocation: 'other.extension-1.0.0' }]) {
    put(index, JSON.stringify(entry ? [entry] : []));
    assert.deepEqual(archiveStaleExtensionDirs(root, 'test.vendor', () => {}), []);
    assert.ok(fs.existsSync(path.join(root, 'test.vendor-1.0.0')));
  }
  for (const location of ['../escape', 'test.vendor-9.0.0', 'test.vendor-1.0.0']) {
    put(index, JSON.stringify([{ identifier: { id: 'test.vendor' }, version: '2.0.0', relativeLocation: location }]));
    assert.throws(() => archiveStaleExtensionDirs(root, 'test.vendor', () => {}));
    assert.ok(fs.existsSync(path.join(root, 'test.vendor-1.0.0')));
  }
  put(index, JSON.stringify([{ identifier: { id: 'test.vendor' }, version: '2.0.0', relativeLocation: 'test.vendor-2.0.0' }]));
  assert.equal(archiveStaleExtensionDirs(root, 'TEST.VENDOR', () => {}).length, 1);
  assert.ok(fs.existsSync(path.join(root, 'test.vendor-other-1.0.0')));
  assert.ok(fs.existsSync(path.join(root, 'test.vendor-2.0.0')));
});

test('One failed extension does not suppress remaining updates or archive its old copies', t => {
  const f = fixture(t), root = path.join(f.base, 'extensions'), calls = [];
  put(path.join(root, 'test.first-1.0.0', 'package.json'), JSON.stringify({ publisher: 'test', name: 'first', version: '1.0.0' }));
  const result = installGalleryExtensions('fixture-cli', [
    { id: 'test.first', source: 'gallery', trackLatest: true },
    { id: 'test.second', source: 'gallery', trackLatest: true },
  ], { extensionsDir: root, listInstalled: () => [], log() {}, install(_cli, id) {
    calls.push(id); if (id === 'test.first') throw new Error('offline'); return { success: true };
  } });
  assert.equal(result.failures.length, 1); assert.deepEqual(calls, ['test.first', 'test.second']);
  assert.ok(fs.existsSync(path.join(root, 'test.first-1.0.0')));
});

test('Verified current versions retire duplicate registrations and old packages without touching other extensions', t => {
  const f = fixture(t), root = path.join(f.base, 'home', '.antigravity-ide', 'extensions');
  const current = { identifier: { id: 'test.vendor' }, version: '2.0.0', relativeLocation: 'test.vendor-2.0.0' };
  const old = { identifier: { id: 'test.vendor' }, version: '1.0.0', relativeLocation: 'test.vendor-1.0.0' };
  const other = { identifier: { id: 'other.extension' }, version: '1.0.0', relativeLocation: 'other.extension-1.0.0' };
  for (const item of [current, old]) put(path.join(root, item.relativeLocation, 'package.json'), JSON.stringify({ publisher: 'test', name: 'vendor', version: item.version }));
  const index = path.join(root, 'extensions.json');
  const original = JSON.stringify([old, current, current, other]); put(index, original);
  const archived = archiveStaleExtensionDirs(root, 'test.vendor', () => {}, '2.0.0');
  assert.equal(archived.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(index)), [other, current]);
  assert.equal(fs.readFileSync(path.join(path.dirname(archived[0]), 'extensions-index.json'), 'utf8'), original);
  assert.ok(fs.existsSync(path.join(root, current.relativeLocation, 'package.json')));
  assert.deepEqual(archiveStaleExtensionDirs(root, 'test.vendor', () => {}, '2.0.0'), []);
});

test('A transient latest download retries its partial file before installing the verified package', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  let downloads = 0, registered = false, artifact;
  const result = installExtension(cli, 'mancho.ts-mancho', { trackLatest: true, log() {},
    listInstalled: () => registered ? [{ id: 'mancho.ts-mancho', version: '3.2.1' }] : [],
    run(file, args) {
      if (file === process.execPath) {
        artifact = args.at(-1); downloads++;
        assert.equal(fs.existsSync(artifact), false, 'A failed partial download must not be reused');
        put(artifact, downloads === 1 ? 'partial' : archive);
        return { status: downloads === 1 ? 1 : 0, stderr: 'transient timeout' };
      }
      registered = true; return { status: 0 };
    } });
  assert.equal(result.success, true); assert.equal(downloads, 2);
  assert.equal(fs.existsSync(artifact), false);
});
