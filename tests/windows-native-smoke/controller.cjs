'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const repo = path.resolve(__dirname, '../..');
const { getEnvironmentPaths } = require(path.join(repo, 'lib/paths'));
const { runInstaller, preflightNativeSetup } = require(path.join(repo, 'lib/installer'));
const { getSetupStatus } = require(path.join(repo, 'lib/setup-status'));
const native = require(path.join(repo, 'lib/agent-automation'));
const approvals = require(path.join(repo, 'lib/approval-policies'));
const { TOPIC_KEY, readMcpPolicy, isIdeRunning } = require(path.join(repo, 'lib/mcp-permissions'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
async function downloadGalleryWithRetry(id, file, target, options = {}) {
  const download = options.download || require(path.join(repo, 'scripts/install-gallery-extension.cjs')).downloadExtension;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await download(id, 'latest', file, fetch, target); }
    catch (error) {
      const temporary = /(?:Marketplace.*HTTP (?:408|429|5\d\d)\b|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN)/i.test(error.message)
        || ['TimeoutError', 'AbortError'].includes(error.name);
      if (!temporary || attempt === 3) throw error;
      (options.log || console.warn)('Gallery attempt ' + attempt + '/3 failed for ' + id + ': ' + error.message);
      await (options.wait || delay)(attempt * 1000);
    }
  }
}
function installArtifactWithRetry(executable, cliArgs, artifact, expected, options = {}) {
  const execute = options.execute || execFileSync;
  const wait = options.wait || (ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms));
  const settings = { windowsHide: true, timeout: 120000, encoding: 'utf8', stdio: 'pipe',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } };
  const wanted = (expected.id + '@' + expected.version).toLowerCase();
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execute(executable, [...cliArgs, '--install-extension', artifact, '--force'], settings);
      const inventory = execute(executable, [...cliArgs, '--list-extensions', '--show-versions'], settings);
      assert.ok(String(inventory).split(/\r?\n/).some(line => line.trim().toLowerCase() === wanted),
        'Expected extension version is absent from the actual IDE CLI inventory: ' + wanted);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        (options.log || console.warn)('IDE CLI attempt ' + attempt + '/3 failed for ' + wanted + ': ' + error.message);
        wait(attempt * 500);
      }
    }
  }
  throw new Error('IDE CLI did not install ' + wanted + ' after 3 verified attempts: ' + lastError.message, { cause: lastError });
}
async function until(check, message, timeout = 90000) {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    if (Date.now() >= deadline) break;
    await delay(Math.min(200, Math.max(0, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw new Error('Timed out: ' + message);
}
function topics(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return Object.fromEntries([TOPIC_KEY, native.TAB_TOPIC_KEY, ...approvals.EXTRA_TOPIC_KEYS].map(key => [key, db.prepare('SELECT value FROM ItemTable WHERE key=?').get(key)?.value ?? null])); }
  finally { db.close(); }
}
function assertStored(actual) {
  assert.deepEqual(native.readTabPolicies(actual[native.TAB_TOPIC_KEY] || ''), native.TAB_POLICIES);
  const policies = native.readPolicies(actual[TOPIC_KEY] || '');
  for (const [key, value] of Object.entries(native.POLICIES)) assert.equal(policies[key], value, key);
  assert.deepEqual(readMcpPolicy(actual[TOPIC_KEY] || ''), { allowed: true, conflicts: 0 });
  assert.deepEqual(require(path.join(repo, 'lib/mcp-permissions')).readApprovalGrants(actual[TOPIC_KEY] || ''), { allowed: true, conflicts: 0 });
  for (const [key, policy] of Object.entries(approvals.definitions)) assert.deepEqual(approvals.read(actual[key] || '', key), policy);
  return { tab: native.readTabPolicies(actual[native.TAB_TOPIC_KEY]),
    agent: Object.fromEntries(Object.keys(native.POLICIES).map(key => [key, policies[key]])),
    approvalPolicies: Object.fromEntries(Object.keys(approvals.definitions).map(key => [key, approvals.read(actual[key] || '', key)])), mcpAllowed: true };
}
function ownedPolicies(actual) {
  const policies = native.readPolicies(actual[TOPIC_KEY] || '');
  return { agent: Object.fromEntries(Object.keys(native.POLICIES).map(key => [key, policies[key]])),
    tab: native.readTabPolicies(actual[native.TAB_TOPIC_KEY] || ''), mcp: readMcpPolicy(actual[TOPIC_KEY] || '') };
}
function assertHarness(result, phase) {
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(result.phase, phase);
  assert.ok(result.checks.includes('Git Branch Panel activates and fetch/push reuse the actual built-in Git API'));
  assert.ok(result.checks.includes('native TypeScript variable completion'));
  assert.ok(result.checks.includes('native TypeScript symbol auto-import completion'));
  assert.ok(result.checks.includes('installed npm library symbol shows its source and accepting it inserts the matching import'));
  assert.ok(result.checks.includes('Prettier formats nested code with three spaces and Auto Save writes the actual file'));
  assert.ok(result.checks.includes('React rfc/rafce accepted from the real suggestion menu; native Emmet expands div in HTML and TSX'));
  assert.ok(result.checks.includes('TypeScript reports error 2322 with visible validation decorations and 80% transparent colors'));
  assert.ok(result.checkedLanguages.includes('typescript'));
  assert.ok(result.checkedLanguages.includes('python'));
  assert.equal(result.extensionSettings?.passed, true, 'Real extension provider/command checks must pass');
  assert.ok(result.extensionSettings.checks.includes('relative TS and TSX path completion is unique and omits the source extension'));
  assert.equal(result.typeScriptMemoryMiB, 512, 'Actual IDE must retain the small-RAM TypeScript heap limit');
}
function workerReachedWaiting(status) {
  if (['failed', 'cancelled', 'applied'].includes(status.state)) {
    throw new Error('Worker must wait while actual IDE is open: ' + JSON.stringify(status));
  }
  return status.state === 'waiting';
}
function redactLog(text) {
  return text.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:code|access_token|id_token|refresh_token|token|key|state|nonce|session|signature)=)[^&\s"'<>]+/gi, '$1[REDACTED]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[REDACTED]');
}
function collectLogTails(directory, label, depth = 0) {
  const files = [];
  if (depth > 4 || !fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectLogTails(file, path.join(label, entry.name), depth + 1));
    else if (entry.isFile() && entry.name.endsWith('.log')) files.push({ file, label: path.join(label, entry.name), modified: fs.statSync(file).mtimeMs });
  }
  return files;
}
function runtimeDiagnostics(env, artifactDirectory, children, stage, error) {
  const candidates = [...collectLogTails(path.join(path.dirname(env.userSettingsDir), 'logs'), 'IDE-profile/logs'),
    ...collectLogTails(artifactDirectory, 'smoke-artifacts')].sort((a, b) => b.modified - a.modified).slice(0, 8);
  return { passed: false, stage, error: redactLog(error.stack || String(error)),
    nodeVersion: process.versions.node, product: json(path.join(env.ideRoot, 'resources/app/product.json')).ideVersion,
    launches: children.map(child => ({ phase: child.smokePhase, pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode })),
    logs: candidates.map(item => ({ source: item.label, tail: redactLog(fs.readFileSync(item.file, 'utf8').slice(-4000)) })) };
}

async function main(ideRoot, executable, directory, artifactDirectory) {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('Actual IDE smoke is restricted to an isolated GitHub-hosted Windows runner');
  }
  if (isIdeRunning()) throw new Error('An Antigravity process already exists; this test will not interact with it');
  const customRoots = { userProfile: path.join(directory, 'isolated home'), cliPath: executable, ideRoot,
    totalMemoryBytes: 2 * 1024 ** 3 };
  const env = getEnvironmentPaths(customRoots);
  assert.equal(path.resolve(env.ideRoot).toLowerCase(), path.resolve(ideRoot).toLowerCase());
  assert.equal(native.validateNative(env), null, 'Installed official main.js must match the audited native build');
  assert.throws(() => preflightNativeSetup(env, { autoApprove: true }), /initialize the native profile/,
    'Actual supported IDE with no initialized profile rejects native setup before writes');
  assert.equal(fs.existsSync(env.userSettingsDir), false, 'Missing-profile preflight does not initialize or change the profile');
  const installed = runInstaller({ customRoots, skipExtensions: true, skipAgentBrowser: true, skipPermissions: true, skipFont: true });
  assert.equal(installed.success, true, JSON.stringify(installed.failures));
  const product = JSON.parse(fs.readFileSync(path.join(ideRoot, 'resources/app/product.json'), 'utf8'));
  assert.equal(env.nativeHooksJson, path.join(customRoots.userProfile, '.gemini', product.applicationName, 'hooks.json'));
  require(path.join(repo, 'lib/native-hooks')).validateNativeHooks(JSON.parse(fs.readFileSync(env.nativeHooksJson, 'utf8')));
  assert.equal(fs.existsSync(path.join(env.geminiConfigDir, 'hooks.json')), false, 'Fresh install writes the actual native location only');
  fs.mkdirSync(env.extensionsDir, { recursive: true });
  const signals = path.join(directory, 'signals'), workspace = path.join(directory, 'workspace');
  fs.mkdirSync(signals, { recursive: true }); fs.mkdirSync(workspace, { recursive: true });
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(repo, 'tests/ide-profile/fixture', name), path.join(workspace, name));
  execFileSync(process.execPath, [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    'ci', '--prefix', workspace, '--ignore-scripts', '--no-audit', '--no-fund'], { windowsHide: true, timeout: 120000, stdio: 'pipe' });
  fs.writeFileSync(path.join(workspace, 'completion.ts'), 'const localVariable = 123;\nloca\nSmokeCo\n');
  fs.writeFileSync(path.join(workspace, 'native-react.tsx'), 'import type * as React from "react";\nconsole.\nexport const button = <button onc />;\n');
  fs.writeFileSync(path.join(workspace, 'component.ts'), 'export const SmokeComponent = 123;\n');
  fs.writeFileSync(path.join(workspace, 'sample.py'), 'sample = 123\n');
  write(path.join(workspace, 'tsconfig.json'), { compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' }, include: ['*.ts', '*.tsx'] });
  require('../editor-tooling-host.cjs').writeFixture(workspace);
  require('../extension-settings-host.cjs').writeFixture(workspace);
  const galleryTarget = require(path.join(repo, 'lib/extensions')).galleryTarget({ ideRoot });
  const galleryArtifacts = [];
  const galleries = require(path.join(repo, 'config/extensions.json')).filter(item =>
    item.source === 'gallery' && !item.optional);
  for (let offset = 0; offset < galleries.length; offset += 4) {
    const downloaded = await Promise.all(galleries.slice(offset, offset + 4).map(async ({ id }) => {
      const file = path.join(directory, id.toLowerCase() + '.vsix');
      const result = await downloadGalleryWithRetry(id, file, galleryTarget);
      return { file, id: result.id, version: result.version };
    }));
    galleryArtifacts.push(...downloaded);
  }
  const workstation = json(path.join(repo, 'extensions/calm-typescript/manifest.json'));
  const appearance = json(path.join(repo, 'extensions/aster-appearance/manifest.json'));
  const artifacts = [...galleryArtifacts, { file: path.join(repo, 'extensions/calm-typescript/calm-typescript-' + workstation.version + '.vsix'),
    id: workstation.id, version: workstation.version },
    { file: path.join(repo, 'extensions/aster-appearance/aster-appearance-' + appearance.version + '.vsix'), id: appearance.id, version: appearance.version }];
  for (const artifact of artifacts) {
    installArtifactWithRetry(executable, [path.join(ideRoot, 'resources/app/out/cli.js'), '--user-data-dir', path.dirname(env.userSettingsDir),
      '--extensions-dir', env.extensionsDir], artifact.file, artifact);
  }
  require('../editor-tooling-host.cjs').stageGitPanel(repo, env.extensionsDir);
  const maintenance = require(path.join(repo, 'extensions/workstation-stability/maintenance.cjs')).runMaintenance({
    extensionsDir: env.extensionsDir, backupDir: path.join(directory, 'maintenance-backups'), repair: true,
  });
  assert.equal(maintenance.reviewRequired, false, JSON.stringify(maintenance));
  write(path.join(artifactDirectory, 'extension-maintenance.json'), maintenance);
  const profile = path.join(env.geminiConfigDir, 'workstation-setup/editor-profile.json');
  assert.ok(fs.existsSync(profile), 'Production installer produces the editor API plan');
  const db = path.join(env.userSettingsDir, 'globalStorage/state.vscdb');
  const children = [], results = {};
  let stage = 'open initial actual IDE';
  function open(phase) {
    const output = fs.openSync(path.join(artifactDirectory, phase + '-ide.log'), 'a');
    const child = spawn(executable, ['--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
      '--user-data-dir', path.dirname(env.userSettingsDir), '--extensions-dir', env.extensionsDir,
      '--extensionDevelopmentPath=' + __dirname, '--new-window', workspace], {
      windowsHide: true, stdio: ['ignore', output, output],
      env: { ...process.env, WORKSTATION_NATIVE_SMOKE_REPO: repo, WORKSTATION_NATIVE_SMOKE_PLAN: profile,
        WORKSTATION_NATIVE_SMOKE_PHASE: phase, WORKSTATION_NATIVE_SMOKE_SIGNALS: signals },
    });
    fs.closeSync(output); child.smokePhase = phase; children.push(child);
    child.on('error', error => write(path.join(signals, phase + '-launch-error.json'), { error: error.message }));
  }
  async function ready(phase) {
    await until(() => {
      for (const suffix of ['launch-error', 'fatal']) {
        const file = path.join(signals, phase + '-' + suffix + '.json');
        if (fs.existsSync(file)) throw new Error('Actual ' + phase + ' IDE ' + suffix + ': ' + JSON.stringify(json(file)));
      }
      const child = children.find(child => child.smokePhase === phase);
      if (child?.exitCode !== null && !isIdeRunning()) throw new Error('Actual ' + phase + ' IDE exited before the test extension became ready: ' + child?.exitCode);
      return fs.existsSync(path.join(signals, phase + '-ready.json'));
    }, 'actual ' + phase + ' IDE extension host', 180000);
    results[phase] = json(path.join(signals, phase + '-ready.json'));
    assertHarness(results[phase], phase);
    assert.equal(isIdeRunning(), true, 'tasklist detects the actual Antigravity process');
  }
  async function close(phase) {
    fs.writeFileSync(path.join(signals, phase + '-quit'), 'quit normally');
    await until(() => !isIdeRunning(), 'all actual IDE processes close normally', 45000);
    await until(() => !fs.existsSync(db + '-wal') && !fs.existsSync(db + '-shm'), 'IDE flushes its native profile WAL/SHM', 15000);
  }
  try {
    open('initial'); await ready('initial');
    stage = 'clean bootstrap pauses before download while the actual IDE runs';
    const cleanProbeRoot = path.join(directory, 'clean-bootstrap-must-not-download');
    const cleanProbe = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(repo, 'scripts/bootstrap.ps1'), '-CleanExtensions', '-DownloadRoot', cleanProbeRoot],
    { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    const cleanProbeOutput = (cleanProbe.stdout || '') + (cleanProbe.stderr || '');
    fs.writeFileSync(path.join(artifactDirectory, 'clean-bootstrap-open-ide.log'), cleanProbeOutput);
    assert.ifError(cleanProbe.error);
    assert.equal(cleanProbe.status, 3, cleanProbeOutput);
    assert.match(cleanProbeOutput, /Clean setup is paused/);
    assert.doesNotMatch(cleanProbeOutput, /Checking Node|Checking Git|Download 1\/|Installation failed|Workstation Setup stage/);
    assert.equal(fs.existsSync(cleanProbeRoot), false, 'Actual open-IDE bootstrap must not create/download a source cache');
    stage = 'read-only preflight and queue while actual IDE runs';
    await until(() => fs.existsSync(db), 'actual IDE initializes state.vscdb');
    assert.equal(preflightNativeSetup(env, { autoApprove: true }).supported, true,
      'Production read-only preflight accepts the database initialized by the real IDE');
    const before = ownedPolicies(topics(db)), queued = native.queueAutomation(env);
    assert.equal(queued.queued, true, JSON.stringify(queued));
    const workerStatus = () => {
      const status = json(queued.statusFile);
      write(path.join(artifactDirectory, 'worker-status.json'), status);
      return status;
    };
    await until(() => fs.existsSync(queued.statusFile) && workerReachedWaiting(workerStatus()), 'actual detached worker reports waiting');
    await delay(2500);
    assert.equal(isIdeRunning(), true);
    assert.equal(workerStatus().state, 'waiting', 'worker cannot apply while real IDE remains open');
    assert.equal(getSetupStatus(env).state, 'waiting', 'Production status identifies the real active worker');
    assert.deepEqual(ownedPolicies(topics(db)), before,
      'queued worker leaves managed native values unchanged while actual IDE is open; unrelated IDE startup state may change');
    stage = 'normal initial IDE shutdown and worker apply';
    await close('initial');
    await until(() => {
      const status = workerStatus();
      if (status.state === 'failed') throw new Error('Native worker failed: ' + status.reason);
      return status.state === 'applied';
    }, 'actual worker applies after the real normal IDE shutdown', 30000);
    const firstStored = assertStored(topics(db));
    assert.equal(getSetupStatus(env).state, 'applied', 'Production status verifies stored preferences after real worker completion');
    write(path.join(workspace, '.vscode/settings.json'), { '[python]': { 'editor.inlineSuggest.enabled': true } });
    stage = 'reopen actual IDE and verify effective settings';
    open('verify'); await ready('verify'); await close('verify');
    const persisted = assertStored(topics(db));
    const result = { passed: true, setupVersion: require(path.join(repo, 'package.json')).version,
      testedAt: new Date().toISOString(), platform: process.platform, nativeVersion: '2.5.5',
      nativeMainSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ideRoot, 'resources/app/out/main.js'))).digest('hex'),
      checks: ['production isolated installer', 'native hooks at the official product applicationName path',
        'actual open IDE pauses clean bootstrap before prerequisites or source download with exit 3', 'actual missing native profile rejected before writes',
        'production read-only preflight accepts actual IDE-created profile', 'actual official Windows IDE opens and initializes SQLite',
        'real worker waits while actual IDE process runs', 'managed native values unchanged until normal IDE shutdown',
        'real worker applies after normal IDE shutdown', 'actual IDE reopens successfully', 'native policies persist after reopen',
        'production status verifies actual waiting/applied transitions', 'actual IDE effective global and language editor settings',
        'actual TypeScript IntelliSense', 'actual workspace conflict source'],
      storedNativeBeforeReopen: firstStored, storedNativeAfterReopen: persisted, editor: results,
      resourcePolicy: { simulatedPhysicalRamMiB: 2048, actualIdeTypeScriptHeapMiB: 512, hostRamConstrained: false },
      limitations: ['No authenticated Google account or live model request is used.',
        'Native Tab and chat permission values are verified in actual IDE storage and via the separately tested official codec; model-generated UI and authenticated chat execution are not claimed.',
        'Gallery extensions, system font, browser and MCP network provisioning are covered by other checks.'] };
    write(path.join(artifactDirectory, 'result.json'), result);
    console.log('PASS: actual Windows Antigravity install → open → queue → normal close → apply → reopen.');
  } catch (error) {
    try { write(path.join(artifactDirectory, 'runtime-failure.json'), runtimeDiagnostics(env, artifactDirectory, children, stage, error)); }
    catch (diagnosticError) { write(path.join(artifactDirectory, 'runtime-failure.json'), { passed: false, stage, error: redactLog(error.stack || String(error)), diagnosticError: diagnosticError.message }); }
    throw error;
  } finally {
    for (const phase of ['initial', 'verify']) fs.writeFileSync(path.join(signals, phase + '-quit'), 'quit requested by cleanup');
    if (isIdeRunning()) {
      try { await until(() => !isIdeRunning(), 'normal isolated IDE cleanup', 10000); }
      catch {
        for (const child of children) if (child.pid && child.exitCode === null) {
          try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
        }
      }
    }
    for (const file of fs.readdirSync(signals).filter(file => file.endsWith('.json'))) fs.copyFileSync(path.join(signals, file), path.join(artifactDirectory, file));
  }
}
if (require.main === module) main(...process.argv.slice(2)).catch(error => {
  const artifacts = process.argv[5];
  if (artifacts) write(path.join(artifacts, 'failure.json'), { passed: false, error: error.stack });
  console.error(error.stack); process.exitCode = 1;
});
module.exports = { assertStored, ownedPolicies, assertHarness, workerReachedWaiting, redactLog, until, installArtifactWithRetry, downloadGalleryWithRetry };
