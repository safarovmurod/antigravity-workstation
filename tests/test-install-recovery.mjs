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
const archive = fs.readFileSync(new URL('../extensions/calm-typescript/calm-typescript-3.3.0.vsix', import.meta.url));
const catalog = require('../config/extensions.json');

test('Default gallery installation excludes removed extensions and Jelly Cursor while installing the remaining gallery items', () => {
  const calls = [], logs = [];
  const result = installGalleryExtensions('fixture-cli', catalog, {
    listInstalled(_cli, options) { assert.equal(options.strict, true); return []; },
    install(_cli, id, options) { calls.push({ id, version: options.version }); return { success: true }; },
    log(line) { logs.push(line); },
  });
  assert.deepEqual(result, { failures: [], skipped: ['iranon.jelly-cursor'] });
  assert.equal(calls.length, 21);
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

test('Repeat gallery installation refreshes every required latest-tracked extension', () => {
  const installed = catalog.filter(ext => ext.source === 'gallery').map(({ id, version }) => ({ id, version }));
  const calls = [];
  const result = installGalleryExtensions('fixture-cli', catalog, {
    listInstalled() { return installed; },
    install(_cli, id, options) { calls.push({ id, version: options.version, trackLatest: options.trackLatest === true }); return { success: true }; },
    log() {},
  });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(calls.map(call => call.id).sort(),
    catalog.filter(ext => ext.source === 'gallery' && !ext.optional).map(ext => ext.id).sort(),
    'Every required gallery extension is checked for the latest compatible version');
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
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-recovery-'));
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
        assert.match(command, /--session workstation-setup-/);
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
  assert.equal(readVsixManifest(archive, 'workstation.calm-typescript', '3.3.0').version, '3.3.0');
  let requests = 0;
  const result = await downloadExtension('workstation.calm-typescript', '3.3.0', file, async (url, options) => {
    assert.equal(url.protocol, 'https:'); assert.equal(options.redirect, 'manual');
    return ++requests === 1 ? new Response(null, { status: 302, headers: { location: 'https://workstation.gallery.vsassets.io/package.vsix' } }) : new Response(archive);
  });
  assert.equal(result.version, '3.3.0'); assert.equal(requests, 2);
  assert.deepEqual(fs.readFileSync(file), archive);
  assert.throws(() => readVsixManifest(archive, 'other.extension', '3.3.0'), /identity or version mismatch/);
  assert.throws(() => readVsixManifest(archive, 'workstation.calm-typescript', '3.1.1'), /identity or version mismatch/);
  const corrupt = Buffer.from(archive), name = corrupt.indexOf(Buffer.from('extension/package.json'), corrupt.readUInt32LE(corrupt.length - 6));
  assert.ok(name > 46); corrupt[name - 46 + 16] ^= 1;
  assert.throws(() => readVsixManifest(corrupt, 'workstation.calm-typescript'), /checksum mismatch/);
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
    await assert.rejects(downloadExtension('workstation.calm-typescript', '3.3.0', file, async () => response), message);
    assert.equal(fs.existsSync(file), false);
  }
});

test('Interrupted streamed VSIX downloads remove only their own partial file and preserve an existing package', async t => {
  const f = fixture(t), file = path.join(f.base, 'interrupted.vsix');
  async function* interrupted() { yield archive.subarray(0, 100); throw new Error('connection interrupted'); }
  await assert.rejects(downloadExtension('workstation.calm-typescript', '3.3.0', file,
    async () => ({ ok: true, status: 200, body: interrupted() })), /connection interrupted/);
  assert.equal(fs.existsSync(file), false);
  fs.writeFileSync(file, 'existing package');
  await assert.rejects(downloadExtension('workstation.calm-typescript', '3.3.0', file, async () => new Response(archive)), /EEXIST/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'existing package');
});

test('A 96 MiB streamed VSIX is verified under a 32 MiB JS heap without buffering the complete archive', t => {
  const f = fixture(t);
  const result = require('node:child_process').spawnSync(process.execPath,
    ['--max-old-space-size=32', path.join(import.meta.dirname, 'large-vsix-memory.cjs'), f.base],
    { encoding: 'utf8', windowsHide: true, timeout: 90000 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, true);
  assert.ok(report.bytes > 96 * 1024 * 1024);
  assert.ok(report.peakRssGrowthBytes < 128 * 1024 * 1024, JSON.stringify(report));
});

test('Gallery failure uses a validated official VSIX and requires actual CLI registration', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  let registered = false, artifact, downloadOptions;
  const result = installExtension(cli, 'workstation.calm-typescript', { version: '3.3.0', marketplaceFallback: true, log() {},
    listInstalled: () => registered ? [{ id: 'workstation.calm-typescript', version: '3.3.0' }] : [],
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
    const result = installExtension(cli, 'workstation.calm-typescript', { version: '3.0.0', allowCompatibleVersion, log() {},
      run(_file, args) { if (args[1] === 'workstation.calm-typescript') { registered = true; return { status: 0 }; } return { status: 1 }; },
      listInstalled: () => registered ? [{ id: 'workstation.calm-typescript', version: '3.3.0' }] : [] });
    assert.equal(result.success, allowCompatibleVersion);
    if (allowCompatibleVersion) { assert.equal(result.version, '3.3.0'); assert.equal(result.exact, false); }
  }
});

test('Wrong downloaded identity and unregistered VSIX installation both remain failures', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  for (const id of ['other.extension', 'workstation.calm-typescript']) {
    let artifactInstalls = 0, artifact;
    const result = installExtension(cli, id, { version: '3.3.0', marketplaceFallback: true, log() {}, listInstalled: () => [],
      run(file, args) {
        if (file === process.execPath) { artifact = args.at(-1); put(artifact, archive); return { status: 0 }; }
        if (args[1] === artifact) { artifactInstalls++; return { status: 0 }; }
        return { status: 1 };
      } });
    assert.equal(result.success, false);
    assert.equal(artifactInstalls, id === 'workstation.calm-typescript' ? 1 : 0);
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
  const result = installExtension(cli, 'workstation.calm-typescript', { trackLatest: true, log() {},
    listInstalled: () => [{ id: 'workstation.calm-typescript', version: registered }],
    run(file, args, options) {
      if (file === process.execPath) {
        downloadArgs = args;
        assert.equal(args[2], 'latest');
        artifactPath = args.at(-1);
        put(artifactPath, archive);
        return { status: 0 };
      }
      if (args.includes(artifactPath)) { registered = '3.3.0'; installCalls++; return { status: 0 }; }
      return { status: 1 };
    } });
  assert.equal(result.success, true);
  assert.equal(result.version, '3.3.0');
  assert.equal(result.skipped, undefined);
  assert.equal(installCalls, 1, 'The newer artifact is installed exactly once');
  assert.equal(downloadArgs.at(-2), 'latest');
});

test('Latest-tracked extensions skip the install when the registered version is already the latest', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  let installCalls = 0;
  const result = installExtension(cli, 'workstation.calm-typescript', { trackLatest: true, log() {},
    listInstalled: () => [{ id: 'workstation.calm-typescript', version: '3.3.0' }],
    run(file, args) {
      if (file === process.execPath) { put(args.at(-1), archive); return { status: 0 }; }
      installCalls++;
      return { status: 0 };
    } });
  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
  assert.equal(result.version, '3.3.0');
  assert.equal(installCalls, 0, 'The gallery install is skipped when the latest is already registered');
});

test('Old version directories of a managed extension are archived, never duplicated or destroyed', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-stale-'));
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
  for (const version of ['3.10.0', '4.0.0-beta.1', '3.3.0+local']) {
    let installs = 0, artifact;
    const result = installExtension(cli, 'workstation.calm-typescript', { trackLatest: true, log() {},
      listInstalled: () => [{ id: 'workstation.calm-typescript', version }],
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
  let current = '3.3.0-beta.9', command, artifact;
  const result = installExtension(cli, 'workstation.calm-typescript', { trackLatest: true, platform: 'win32', log() {},
    listInstalled: () => [{ id: 'workstation.calm-typescript', version: current }],
    run(file, args) { assert.equal(file, process.execPath); artifact = args.at(-1); put(artifact, archive); return { status: 0 }; },
    exec(value, options) { command = value; assert.equal(options.timeout, 180000); current = '3.3.0'; } });
  assert.equal(result.success, true);
  assert.equal(command, `"${cli}" --install-extension "${artifact}" --force`);
  assert.equal(fs.existsSync(artifact), false);
});

test('Latest download, identity, inventory, compatibility and registration failures cannot report success', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  for (const failure of ['download', 'identity', 'inventory', 'incompatible', 'unregistered']) {
    let artifact, installs = 0;
    const result = installExtension(cli, failure === 'identity' ? 'other.extension' : 'workstation.calm-typescript', {
      trackLatest: true, log() {}, listInstalled() {
        if (failure === 'inventory') throw new Error('inventory unavailable');
        return [{ id: 'workstation.calm-typescript', version: '3.1.2' }];
      }, run(file, args) {
        if (file === process.execPath) {
          artifact = args.at(-1);
          if (failure === 'download') return { status: 1, stderr: 'offline' };
          put(artifact, archive); return { status: 0 };
        }
        installs++; return { status: failure === 'incompatible' ? 1 : 0 };
      } });
    assert.equal(result.success, false, failure);
    assert.equal(installs, ['incompatible', 'unregistered'].includes(failure) ? 3 : 0);
    assert.equal(fs.existsSync(artifact), false);
  }
});

test('A transient latest-package CLI crash retries the verified artifact once and requires successful registration', t => {
  const f = fixture(t);
  for (const platform of ['linux', 'win32']) {
    const cli = path.join(f.base, platform, platform === 'win32' ? 'editor.cmd' : 'editor');
    put(cli);
    let downloads = 0, installs = 0, registered = false, artifact;
    const attempt = () => {
      installs++;
      if (installs === 1) throw new Error('Transient Electron fatal process error');
      registered = true;
    };
    const result = installExtension(cli, 'workstation.calm-typescript', { trackLatest: true, platform, log() {},
      listInstalled: () => registered ? [{ id: 'workstation.calm-typescript', version: '3.3.0' }] : [],
      run(file, args) {
        if (file === process.execPath) {
          downloads++; artifact = args.at(-1); put(artifact, archive); return { status: 0 };
        }
        attempt(); return { status: 0 };
      },
      exec() { attempt(); },
    });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(downloads, 1, 'CLI retries reuse one validated download');
    assert.equal(installs, 2, 'The crashed CLI is retried, then stops after verified success');
    assert.equal(fs.existsSync(artifact), false, 'The temporary package is still cleaned up');
  }
});

test('Three failed CLI attempts stay a failure even when the expected version appears registered after a crash', t => {
  const f = fixture(t), cli = path.join(f.base, 'editor'); put(cli);
  let downloads = 0, installs = 0;
  const result = installExtension(cli, 'workstation.calm-typescript', { trackLatest: true, log() {},
    listInstalled: () => installs ? [{ id: 'workstation.calm-typescript', version: '3.3.0' }] : [],
    run(file, args) {
      if (file === process.execPath) { downloads++; put(args.at(-1), archive); return { status: 0 }; }
      installs++; return { status: 134 };
    },
  });
  assert.equal(result.success, false);
  assert.match(result.error, /did not register after 3 installation attempts/);
  assert.equal(downloads, 1);
  assert.equal(installs, 3);
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
  const result = installExtension(cli, 'workstation.calm-typescript', { trackLatest: true, log() {},
    listInstalled: () => registered ? [{ id: 'workstation.calm-typescript', version: '3.3.0' }] : [],
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

test('Gallery cleanup keeps the IDE architecture when the setup Node architecture differs', t => {
  const f = fixture(t), root = path.join(f.base, 'home', '.antigravity-ide', 'extensions');
  const entries = ['win32-x64', 'win32-arm64'].map(targetPlatform => ({
    identifier: { id: 'test.vendor' }, version: '2.0.0',
    relativeLocation: 'test.vendor-2.0.0-' + targetPlatform, metadata: { targetPlatform },
  }));
  for (const entry of entries) put(path.join(root, entry.relativeLocation, 'package.json'), JSON.stringify({ publisher: 'test', name: 'vendor', version: entry.version }));
  const index = path.join(root, 'extensions.json');
  put(index, JSON.stringify(entries));
  const result = installGalleryExtensions('fixture-cli', [{ id: 'test.vendor', source: 'gallery', trackLatest: true }], {
    extensionsDir: root, target: { platform: 'win32-arm64', version: '1.107.0' },
    listInstalled: () => [{ id: 'test.vendor', version: '2.0.0' }],
    install: () => ({ success: true, version: '2.0.0' }), log() {},
  });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(index)), [entries[1]]);
  assert.equal(fs.existsSync(path.join(root, entries[0].relativeLocation)), false);
  assert.equal(fs.existsSync(path.join(root, entries[1].relativeLocation, 'package.json')), true);
});

test('An incompatible or invalid explicit IDE architecture cannot alter extension registration', t => {
  const f = fixture(t), root = path.join(f.base, 'home', '.antigravity-ide', 'extensions');
  const entry = { identifier: { id: 'test.vendor' }, version: '2.0.0', relativeLocation: 'test.vendor-2.0.0-win32-x64', metadata: { targetPlatform: 'win32-x64' } };
  put(path.join(root, entry.relativeLocation, 'package.json'), JSON.stringify({ publisher: 'test', name: 'vendor', version: entry.version }));
  const index = path.join(root, 'extensions.json'), original = JSON.stringify([entry, entry]);
  put(index, original);
  for (const platform of ['win32-arm64', '../invalid']) {
    assert.throws(() => archiveStaleExtensionDirs(root, 'test.vendor', () => {}, '2.0.0', platform));
    assert.equal(fs.readFileSync(index, 'utf8'), original);
    assert.equal(fs.existsSync(path.join(root, entry.relativeLocation, 'package.json')), true);
  }
});
