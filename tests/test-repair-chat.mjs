import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const repair = require('../extensions/workstation-stability/repair-chat.cjs');
const repo = path.resolve(import.meta.dirname, '..');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-chat-repair-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'setup', 'repair-chat');
  const report = { schema: 1, stage: 'install', exitCode: 1, sourceCommit: 'a'.repeat(40),
    setupVersion: require('../package.json').version, failure: 'Setup incomplete: Font: network timeout; Extension failed: fixture.extension' };
  const queue = extra => repair.queueRepair(directory, { ...report, ...extra }, repo);
  const request = () => repair.read(repair.files(directory).request);
  const status = () => repair.read(repair.files(directory).status);
  const calls = [];
  const appRoot = path.join(root, 'IDE'); fs.mkdirSync(appRoot);
  fs.writeFileSync(path.join(appRoot, 'product.json'), JSON.stringify({ ideVersion: '2.5.5' }));
  const vscode = { env: { appRoot }, commands: { async getCommands() { return [repair.COMMAND]; }, async executeCommand(...args) { calls.push(args); } } };
  return { root, directory, report, queue, request, status, calls, vscode };
}
test('A failed full setup creates one bounded redacted task using the current native chat without model selection', async t => {
  const f = fixture(t);
  f.queue({ failure: 'Setup incomplete: TOKEN="private secret value"; https://user:password@example.test/file?signature=privatequery; Bearer privatebearer' });
  const request = f.request();
  assert.doesNotMatch(request.prompt, /private secret value|privatequery|privatebearer|user:password/);
  assert.doesNotMatch(request.prompt, /[\u0400-\u04ff]/u, 'Generated repair instructions must be in English');
  for (let step = 1; step <= 7; step++) assert.match(request.prompt, new RegExp('(?:^|\\n)' + step + '\\. '));
  for (const file of ['config/font.json', 'scripts/install-font.ps1', 'config/extensions.json',
    'lib/profile-settings.js', 'lib/owned-files.js', 'resources/mcp-runtime/package-lock.json',
    'skills/agent-browser/metadata.json', 'lib/agent-automation.js']) {
    assert.ok(request.prompt.includes(file), 'The repair task must locate the source for ' + file);
    assert.ok(fs.existsSync(path.join(repo, file)), 'The supplied repair source must exist: ' + file);
  }
  assert.match(request.prompt, /optional extension intentionally skipped/);
  assert.match(request.prompt, /getEnvironmentPaths/);
  const pathCommand = request.prompt.split('\n').find(line => line.startsWith('& node -e '));
  const pathScript = pathCommand.slice("& node -e '".length, -1).replaceAll("''", "'");
  assert.doesNotMatch(pathScript, /"/, 'Embedded double quotes are lost by Windows PowerShell 5.1 native argument passing');
  const pathCheck = spawnSync(process.execPath, ['-e', pathScript], { cwd: repo, encoding: 'utf8', timeout: 15000 });
  assert.equal(pathCheck.status, 0, pathCheck.stderr);
  const setupPaths = JSON.parse(pathCheck.stdout);
  assert.ok(Object.hasOwn(setupPaths, 'settingsJson'));
  assert.ok(Object.hasOwn(setupPaths, 'extensionsDir'));
  assert.ok(Object.keys(setupPaths).every(key => /(?:Dir|Root|Path|Json)$/.test(key)), 'Only setup paths may be printed');
  assert.match(request.prompt, /--verify/); assert.ok(request.prompt.includes(request.id));
  const result = await repair.dispatchRepair(f.vscode, f.directory);
  assert.equal(result.state, 'dispatched'); assert.equal(result.repairVerified, false);
  assert.deepEqual(f.calls, [[repair.COMMAND, request.prompt]]);
  assert.doesNotMatch(JSON.stringify(f.calls), /startNewConversation|setModel|selectModel|Gemini High/);
  assert.equal(f.status().repairVerified, false);
});
test('Long escaped diagnostics still queue a bounded English repair plan and retain the local report location', t => {
  const f = fixture(t), failureReport = path.join(f.root, 'setup-failure.json'), outputLog = path.join(f.root, 'setup-install.log');
  f.queue({ failure: 'Setup incomplete: Extension failed: fixture.extension ' + '\u0000"\\'.repeat(5500), failureReport, outputLog });
  const request = f.request();
  assert.ok(request.prompt.length <= 24576);
  assert.match(request.prompt, /"summaryTruncated": true/);
  assert.match(request.prompt, /Extension failed: fixture.extension/);
  assert.ok(request.prompt.includes(JSON.stringify(failureReport)));
  assert.ok(request.prompt.includes(JSON.stringify(outputLog)));
  assert.match(request.prompt, /7\. Report each failed item/);
});
test('Repeated identical failures, concurrent IDE windows and restart do not send duplicate tasks', async t => {
  const f = fixture(t); f.queue(); const before = f.request();
  assert.equal(f.queue().reused, true); assert.equal(f.request().id, before.id);
  let release; f.vscode.commands.executeCommand = (...args) => { f.calls.push(args); return new Promise(resolve => { release = resolve; }); };
  const first = repair.dispatchRepair(f.vscode, f.directory);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await repair.dispatchRepair(f.vscode, f.directory)).state, 'another-window-is-dispatching');
  release(); await first;
  await repair.dispatchRepair(f.vscode, f.directory);
  assert.equal(f.queue().reused, true);
  await repair.dispatchRepair(f.vscode, f.directory);
  assert.equal(f.calls.length, 1);
});
test('Installer lock delays handoff until all writes complete, and missing chat waits without generic-chat fallback', async t => {
  const f = fixture(t); f.queue();
  const lock = path.join(f.root, 'setup', 'install.lock'); fs.writeFileSync(lock, 'running');
  assert.equal((await repair.dispatchRepair(f.vscode, f.directory)).state, 'waiting-for-installer');
  assert.equal(f.calls.length, 0); fs.unlinkSync(lock);
  f.vscode.commands.getCommands = async () => ['workbench.action.chat.open'];
  assert.equal((await repair.dispatchRepair(f.vscode, f.directory)).state, 'waiting-for-chat');
  assert.equal(f.calls.length, 0);
  const statusFile = repair.files(f.directory).status, before = fs.readFileSync(statusFile);
  const oldTime = new Date('2020-01-01T00:00:00Z'); fs.utimesSync(statusFile, oldTime, oldTime);
  await repair.dispatchRepair(f.vscode, f.directory);
  assert.equal(fs.statSync(statusFile).mtimeMs, oldTime.getTime(), 'Waiting must not rewrite status and grow repeated Output notices every five seconds');
  assert.deepEqual(fs.readFileSync(statusFile), before);
  f.vscode.commands.getCommands = async () => [repair.COMMAND];
  assert.equal((await repair.dispatchRepair(f.vscode, f.directory)).state, 'dispatched');
});
test('A dispatch timeout/crash remains uncertain and is never silently resent', async t => {
  const f = fixture(t); f.queue();
  f.vscode.commands.executeCommand = (...args) => { f.calls.push(args); return new Promise(() => {}); };
  assert.equal((await repair.dispatchRepair(f.vscode, f.directory, { timeoutMs: 15 })).state, 'uncertain');
  await repair.dispatchRepair(f.vscode, f.directory); assert.equal(f.calls.length, 1);
  const state = f.status(); fs.writeFileSync(repair.files(f.directory).status, JSON.stringify({ ...state, state: 'dispatching' }));
  assert.equal((await repair.dispatchRepair(f.vscode, f.directory)).state, 'uncertain');
  assert.equal(f.calls.length, 1);
});
test('Doctor is required to verify the exact original task; sending, a stale task and a failed Doctor cannot claim repair', async t => {
  const f = fixture(t); f.queue(); const id = f.request().id;
  await repair.dispatchRepair(f.vscode, f.directory); assert.equal(f.status().repairVerified, false);
  let checks = 0;
  const fail = () => { checks++; return { status: 1 }; };
  assert.throws(() => repair.verifyRepair(f.directory, repo, 'wrong-id', fail), /superseded/);
  assert.throws(() => repair.verifyRepair(f.directory, f.root, id, fail), /original repair source/);
  assert.equal(checks, 0);
  assert.equal(repair.verifyRepair(f.directory, repo, id, fail).state, 'verification-failed');
  assert.equal(f.status().repairVerified, false);
  await repair.dispatchRepair(f.vscode, f.directory); assert.equal(f.calls.length, 1);
  assert.equal(repair.verifyRepair(f.directory, repo, id, () => ({ status: 0 })).repairVerified, true);
  assert.equal(f.queue().reused, false, 'A genuine new failure after verification needs a new task');
});
test('Explicit retry permits another dispatch, while critical/preflight and successful reports do not queue', async t => {
  const f = fixture(t);
  assert.equal(f.queue({ failure: 'Installation failed: Backup failed; no changes made' }).queued, false);
  assert.equal(f.queue({ failure: 'Setup incomplete: Font failed\nInstallation failed: rollback failed; original backup retained' }).queued, false,
    'A fatal rollback after the core summary must not become an unattended repair task');
  assert.equal(f.request(), null);
  assert.throws(() => f.queue({ exitCode: 0 }), /Invalid failed/);
  f.queue(); await repair.dispatchRepair(f.vscode, f.directory);
  repair.retryRepair(f.directory); await repair.dispatchRepair(f.vscode, f.directory);
  assert.equal(f.calls.length, 2);
});
test('A successful later full setup retires an obsolete task before another chat dispatch', async t => {
  const f = fixture(t); f.queue();
  assert.equal(repair.retireAfterDoctor(f.directory).state, 'superseded');
  await repair.dispatchRepair(f.vscode, f.directory);
  assert.equal(f.calls.length, 0);
  assert.equal(f.status().repairVerified, false, 'Retiring old work does not falsely verify its historical failure');
  assert.equal(f.queue().reused, false, 'A new genuine failure after a successful bootstrap must create a new task');
});
test('A later unsupported IDE cannot consume the old internal chat command even if its ID still exists', async t => {
  const f = fixture(t); f.queue();
  fs.writeFileSync(path.join(f.vscode.env.appRoot, 'product.json'), JSON.stringify({ ideVersion: '9.9.9' }));
  assert.equal((await repair.dispatchRepair(f.vscode, f.directory)).state, 'waiting-for-chat');
  assert.equal(f.calls.length, 0); assert.equal(f.status().repairVerified, false);
});
test('The real queue CLI collects failed Doctor checks and confines log reads to its diagnostic directory', t => {
  const f = fixture(t), diagnostics = path.join(f.root, 'diagnostics'), config = path.join(f.root, 'config');
  fs.mkdirSync(diagnostics);
  const preload = path.join(f.root, 'isolated-discovery.cjs');
  fs.writeFileSync(preload, 'require(' + JSON.stringify(path.join(repo, 'lib/paths.js')) + ').getEnvironmentPaths=()=>({geminiConfigDir:' + JSON.stringify(config) + '});');
  const log = path.join(diagnostics, 'setup-doctor.log'), report = path.join(diagnostics, 'setup-failure.json');
  fs.writeFileSync(log, '  [✗] First missing setting\n  [✓] Healthy check\n  [✗] Last missing extension TOKEN="private-value"\nDoctor Summary\n');
  const value = { ...f.report, stage: 'doctor', outputLog: log, failure: 'Summary with no failed-check details' };
  fs.writeFileSync(report, JSON.stringify(value));
  const run = () => spawnSync(process.execPath, ['--require', preload, path.join(repo, 'scripts/queue-repair-chat.cjs'), '--queue', report], { encoding: 'utf8' });
  const result = run(); assert.equal(result.status, 0, result.stderr);
  const request = repair.read(path.join(config, 'workstation-setup/repair-chat/request.json'));
  assert.match(request.prompt, /First missing setting/); assert.match(request.prompt, /Last missing extension/);
  assert.ok(request.prompt.includes(JSON.stringify(report)), 'The current failure report location must reach the chat');
  assert.ok(request.prompt.includes(JSON.stringify(log)), 'The local output log location must reach the chat');
  assert.doesNotMatch(request.prompt, /Healthy check|private-value/);
  fs.writeFileSync(report, JSON.stringify({ ...value, outputLog: path.join(f.root, 'private-file') }));
  assert.equal(run().status, 1, 'The report must not make the producer read an unrelated file');
});
test('Linked queue data and oversized/malformed requests cannot send agent instructions', async t => {
  const f = fixture(t); f.queue();
  const request = f.request(); fs.writeFileSync(repair.files(f.directory).request, JSON.stringify({ ...request, prompt: 'x'.repeat(70000) }));
  await assert.rejects(repair.dispatchRepair(f.vscode, f.directory), /Invalid repair queue file/);
  assert.equal(f.calls.length, 0);
  const target = path.join(f.root, 'linked-queue'); fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'request.json'), JSON.stringify(request));
  const link = path.join(f.root, 'queue-junction');
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(repair.dispatchRepair(f.vscode, link), /Linked repair/);
  assert.equal(f.calls.length, 0);
});
