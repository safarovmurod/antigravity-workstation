import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { collectPayload } = require('../lib/owned-files');
const { homeTemplate } = require('../lib/profile-settings');
const { runInstaller } = require('../lib/installer');
const { getEnvironmentPaths } = require('../lib/paths');
const { createBackup, restoreBackup } = require('../lib/backup');
const { runDoctor } = require('../lib/doctor');

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-audit-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'User with spaces');
  const gitBashPath = path.join(base, 'Git/bin/bash.exe');
  fs.mkdirSync(path.dirname(gitBashPath), { recursive: true }); fs.writeFileSync(gitBashPath, 'fixture');
  const customRoots = { userProfile: home, gitBashPath };
  const env = getEnvironmentPaths(customRoots);
  return { base, home, env, customRoots, install: () => runInstaller({ customRoots, skipExtensions: true, skipAgentBrowser: true, skipPermissions: true, log() {} }) };
}

test('MCP dependencies installed in the source checkout never enter the managed payload', t => {
  const f = fixture(t);
  const source = path.join(f.base, 'source');
  for (const dir of ['rules', 'skills', 'scripts', 'resources/mcp-runtime/node_modules/.bin']) fs.mkdirSync(path.join(source, dir), { recursive: true });
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, 'resources/mcp-runtime', name), path.join(source, 'resources/mcp-runtime', name));
  fs.writeFileSync(path.join(source, 'resources/mcp-runtime/node_modules/.bin/foreign'), 'dependency');
  const payload = collectPayload(source, 'test');
  assert.deepEqual(payload.map(item => item.key).sort(), ['mcp-runtime/package-lock.json', 'mcp-runtime/package.json']);
});

test('npm packaging excludes installed MCP dependencies while retaining their pinned manifests', t => {
  const f = fixture(t), source = path.join(f.base, 'npm-package');
  fs.mkdirSync(path.join(source, 'resources/mcp-runtime/node_modules/private-fixture'), { recursive: true });
  fs.writeFileSync(path.join(source, 'package.json'), fs.readFileSync(path.join(root, 'package.json')));
  for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, 'resources/mcp-runtime', file), path.join(source, 'resources/mcp-runtime', file));
  fs.writeFileSync(path.join(source, 'resources/mcp-runtime/node_modules/private-fixture/index.js'), 'must not be packed');
  const npmCli = [process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    '/usr/share/nodejs/npm/bin/npm-cli.js'].find(file => file && fs.existsSync(file));
  assert.ok(npmCli, 'The required npm CLI must be available');
  const output = execFileSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json', '--cache', path.join(f.base, 'npm-cache')],
    { cwd: source, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
  const files = JSON.parse(output)[0].files.map(file => file.path);
  assert.ok(!files.some(file => file.includes('node_modules/')), 'Nested dependency tree must not be included');
  for (const file of ['package.json', 'package-lock.json']) assert.ok(files.includes('resources/mcp-runtime/' + file));
});

test('Template substitution preserves literal dollar patterns and JSON escapes', () => {
  const env = { userProfile: 'C:/Users/A$&B', nodeExe: 'D:/Node $&/node.exe', gitBashPath: 'D:/Git $&/bash.exe' };
  const result = JSON.parse(homeTemplate(env, 'config/mcp/active.template.json'));
  assert.equal(result.mcpServers.gsd.command, env.nodeExe);
  assert.equal(result.mcpServers.gsd.args[0], env.userProfile + '/.gemini/config/mcp-runtime/node_modules/@opengsd/gsd-core/bin/gsd-mcp-server.js');
  const quoted = JSON.parse(homeTemplate({ ...env, userProfile: '/tmp/User "quoted"' }, 'config/mcp/active.template.json'));
  assert.ok(quoted.mcpServers.gsd.args[0].startsWith('/tmp/User "quoted"/'));
});

test('Restoring a fresh-profile backup removes configuration files that were absent before install', t => {
  const f = fixture(t), installed = f.install();
  assert.equal(installed.success, true);
  const files = [f.env.settingsJson, f.env.keybindingsJson, f.env.argvJson, path.join(f.env.geminiDir, 'GEMINI.md'),
    f.env.nativeHooksJson, path.join(f.env.geminiConfigDir, 'mcp_config.json')];
  for (const file of files) assert.equal(fs.existsSync(file), true, file);
  restoreBackup(installed.backupInfo.backupDir, f.env, { dryRun: true });
  for (const file of files) assert.equal(fs.existsSync(file), true, 'preview preserves ' + file);
  restoreBackup(installed.backupInfo.backupDir, f.env);
  for (const file of files) assert.equal(fs.existsSync(file), false, 'restore original absence: ' + file);
});

test('Backup rejects a linked skill inventory before copying private data', t => {
  const f = fixture(t), personal = path.join(f.base, 'personal');
  const outside = path.join(personal, 'skill-inventory.json');
  fs.mkdirSync(personal); fs.writeFileSync(outside, '{"private":true}');
  fs.mkdirSync(path.dirname(f.env.geminiConfigDir), { recursive: true });
  if (process.platform === 'win32') {
    // Real NTFS junctions exercise the same reparse-point guard without admin
    // privileges or a machine-wide Developer Mode change.
    fs.symlinkSync(personal, f.env.geminiConfigDir, 'junction');
    assert.equal(fs.lstatSync(f.env.geminiConfigDir).isSymbolicLink(), true);
    t.diagnostic('Actual Windows directory junction; no file-symlink privilege required');
  } else {
    fs.mkdirSync(f.env.geminiConfigDir);
    fs.symlinkSync(outside, path.join(f.env.geminiConfigDir, 'skill-inventory.json'));
  }
  assert.throws(() => createBackup(f.env), /Linked setup path/);
  assert.equal(fs.readFileSync(outside, 'utf8'), '{"private":true}');
  assert.equal(fs.existsSync(f.env.backupsDir), false, 'Rejected linked input must not create a backup');
});

test('Restore rejects dangling destination links before writing any file', t => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.env.settingsJson), { recursive: true }); fs.writeFileSync(f.env.settingsJson, '{}');
  const backup = createBackup(f.env);
  fs.unlinkSync(f.env.settingsJson);
  const missing = path.join(f.base, 'missing-personal-directory');
  const outside = path.join(missing, 'settings.json');
  if (process.platform === 'win32') {
    fs.rmdirSync(path.dirname(f.env.settingsJson));
    fs.mkdirSync(missing);
    fs.symlinkSync(missing, path.dirname(f.env.settingsJson), 'junction');
    fs.rmdirSync(missing);
    assert.equal(fs.lstatSync(path.dirname(f.env.settingsJson)).isSymbolicLink(), true);
    assert.equal(fs.existsSync(path.dirname(f.env.settingsJson)), false, 'The actual junction target is absent');
    t.diagnostic('Actual dangling Windows directory junction; target remains absent');
  } else fs.symlinkSync(outside, f.env.settingsJson);
  assert.throws(() => restoreBackup(backup.backupDir, f.env), /Linked setup path/);
  assert.equal(fs.existsSync(outside), false);
  assert.equal(fs.existsSync(missing), false, 'Restore must not recreate a linked private target');
});

function fakeInventory(f, entries) {
  const file = path.join(f.base, 'inventory.cjs');
  fs.writeFileSync(file, '#!' + process.execPath + '\nconsole.log(' + JSON.stringify(entries.map(e => e.id + '@' + (e.version || '9.0.0')).join('\n')) + ');\n');
  if (process.platform === 'win32') {
    const cmd = path.join(f.base, 'inventory.cmd'); fs.writeFileSync(cmd, '@"' + process.execPath + '" "' + file + '" %*\r\n'); return cmd;
  }
  fs.chmodSync(file, 0o755); return file;
}

test('Doctor fails missing required extensions and damaged installed agents/hooks', t => {
  const f = fixture(t);
  const catalog = require('../config/extensions.json');
  const healthyCli = fakeInventory(f, catalog);
  f.customRoots.cliPath = healthyCli;
  f.install();
  const healthy = runDoctor({ customRoots: { ...f.customRoots, cliPath: healthyCli }, log() {} });
  assert.deepEqual(healthy.failures, [], 'An unchanged isolated installation must pass all applicable checks');
  assert.ok(healthy.checks.some(c => c.category === 'Payload' && c.status === 'pass'));
  const cliPath = fakeInventory(f, catalog.filter(e => e.id !== 'esbenp.prettier-vscode'));
  fs.unlinkSync(path.join(f.env.geminiConfigDir, 'agents/gsd-planner.md'));
  fs.writeFileSync(path.join(f.env.geminiDir, 'antigravity/hooks/gsd-antigravity-adapter.cjs'), 'broken');
  fs.writeFileSync(f.env.keybindingsJson, '[]');
  fs.writeFileSync(path.join(f.env.geminiConfigDir, 'mcp_config.json'), '{"mcpServers":{}}');
  const result = runDoctor({ customRoots: { ...f.customRoots, cliPath }, log() {} });
  assert.ok(result.failures.some(c => c.category === 'Extensions' && c.name === 'esbenp.prettier-vscode (latest)'));
  assert.ok(result.failures.some(c => c.category === 'Payload'), 'Missing agent and altered hook must fail Doctor');
  assert.ok(result.failures.some(c => c.name === 'Managed keybindings'));
  assert.ok(result.failures.some(c => c.category === 'MCP' && c.name.includes('gsd launcher')));
});

test('Invalid source configuration stops before overwriting existing profile files', t => {
  const f = fixture(t), source = path.join(f.base, 'source');
  fs.cpSync(path.join(root, 'config'), path.join(source, 'config'), { recursive: true });
  fs.cpSync(path.join(root, 'rules'), path.join(source, 'rules'), { recursive: true });
  fs.mkdirSync(path.join(source, 'skills'));
  fs.mkdirSync(path.join(source, 'scripts'));
  fs.writeFileSync(path.join(source, 'config/hooks.json'), '{broken');
  fs.mkdirSync(path.dirname(f.env.settingsJson), { recursive: true }); fs.writeFileSync(f.env.settingsJson, '{"personal":true}');
  assert.throws(() => runInstaller({ customRoots: f.customRoots, repoRoot: source, skipExtensions: true,
    skipAgentBrowser: true, skipPermissions: true, log() {} }), SyntaxError);
  assert.equal(fs.readFileSync(f.env.settingsJson, 'utf8'), '{"personal":true}');
  assert.equal(fs.existsSync(f.env.argvJson), false);
});

test('Backup restores nested personal rules and rejects untrusted absent-file targets', t => {
  const f = fixture(t), rule = path.join(f.env.geminiRulesDir, 'personal/team.md');
  fs.mkdirSync(path.dirname(rule), { recursive: true }); fs.writeFileSync(rule, 'original');
  const backup = createBackup(f.env);
  fs.writeFileSync(rule, 'edited');
  restoreBackup(backup.backupDir, f.env);
  assert.equal(fs.readFileSync(rule, 'utf8'), 'original');
  const manifestFile = path.join(backup.backupDir, 'backup-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.absent.push('../personal.txt'); fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  fs.writeFileSync(rule, 'preserve');
  assert.throws(() => restoreBackup(backup.backupDir, f.env), /Invalid absent-file/);
  assert.equal(fs.readFileSync(rule, 'utf8'), 'preserve');
});

test('A successful empty extension inventory is valid for a new IDE profile', t => {
  const f = fixture(t), cli = fakeInventory(f, []);
  assert.deepEqual(require('../lib/extensions').getInstalledExtensions(cli, { strict: true }), []);
});

test('Gallery dry-run works without probing or launching an installed IDE', () => {
  const result = require('../lib/extensions').installGalleryExtensions(null,
    [{ id: 'esbenp.prettier-vscode', version: '11.0.0', source: 'gallery' }],
    { dryRun: true, log() {}, listInstalled() { throw new Error('Dry-run must not probe the IDE'); } });
  assert.deepEqual(result.failures, []);
});

test('Bundled React guide links resolve and excluded GSD documentation points to its pinned upstream', () => {
  const guide = path.join(root, 'skills/vercel-react-best-practices/AGENTS.md');
  const links = [...fs.readFileSync(guide, 'utf8').matchAll(/\]\((\.\/[^)]+)\)/g)];
  assert.equal(links.length, 3);
  for (const link of links) assert.ok(fs.existsSync(path.resolve(path.dirname(guide), link[1])), link[1]);
  for (const relative of ['agent-skills-bootstrap', 'loop-hook-dispatch', 'mvp-concepts', 'planning-config', 'reviewer-instances']) {
    const text = fs.readFileSync(path.join(root, 'resources/gsd-core/references', relative + '.md'), 'utf8');
    assert.match(text, /https:\/\/github\.com\/open-gsd\/gsd-core\/blob\/v1\.15\.0\//);
    assert.doesNotMatch(text, /\]\(\.\.\/(?:\.\.\/)?(?:docs\/|CONTEXT\.md)/);
  }
});

test('GSD installation manifest hashes match every declared file in the runtime and discovery roots', () => {
  const manifest = require('../resources/antigravity-runtime/gsd-file-manifest.json');
  assert.equal(manifest.runtime, 'antigravity');
  assert.equal(manifest.scope, 'global');
  for (const [key, expected] of Object.entries(manifest.files)) {
    // Global agents/skills have the upstream .gemini/config home override;
    // their logical manifest keys are not relative to .gemini/antigravity.
    const source = /^(agents|skills)\//.test(key) ? key
      : /^(gsd-core|hooks)\//.test(key) ? 'resources/' + key : 'resources/antigravity-runtime/' + key;
    const bytes = fs.readFileSync(path.join(root, source));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected, source);
  }
});

function panelFixture(t) {
  const f = fixture(t), repo = path.join(f.base, 'git repository');
  fs.mkdirSync(repo);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main'); git('config', 'user.name', 'Audit'); git('config', 'user.email', 'audit@example.invalid');
  fs.writeFileSync(path.join(repo, '.env'), 'fixture=original'); git('add', '.'); git('commit', '-m', 'fixture');
  git('remote', 'add', 'origin', path.join(f.base, 'unused-remote.git'));
  const module = { exports: {} };
  const panelRequire = createRequire(path.join(root, 'extensions/git-branch-panel/extension.js'));
  const vscode = { workspace: { workspaceFolders: [{ uri: { fsPath: repo } }] }, window: {
    createOutputChannel: () => ({ appendLine() {} }), showWarningMessage: async (_message, _options, first) => first,
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'extensions/git-branch-panel/extension.js'), 'utf8'), {
    module, exports: module.exports, require: name => name === 'vscode' ? vscode : panelRequire(name),
    setTimeout, clearTimeout, console, process,
  });
  return { ...f, repo, git, panel: module.exports, provider: new module.exports.GithubPanelProvider() };
}

test('GitHub panel preserves porcelain status bytes and rejects secrets before staging', async t => {
  const f = panelFixture(t);
  fs.writeFileSync(path.join(f.repo, '.env'), 'fixture=changed');
  const raw = await f.panel.gitExec(['status', '--porcelain', '-z'], f.repo);
  assert.equal(raw, ' M .env\0');
  await assert.rejects(f.provider._handlePush('must not commit'), /Secret file detected/);
  assert.equal(f.git('diff', '--cached', '--name-only'), '', 'Secret must not enter the index');
});

test('GitHub panel validates all deletion names and blocks deletion during merge', async t => {
  const f = panelFixture(t);
  f.git('branch', 'feature');
  await assert.rejects(f.provider._handleDeleteBranches(['--all']), /Invalid branch name/);
  fs.writeFileSync(path.join(f.repo, '.git/MERGE_HEAD'), f.git('rev-parse', 'HEAD'));
  await assert.rejects(f.provider._handleDeleteBranches(['feature']), /merge\/rebase/);
  assert.ok(f.git('branch', '--list', 'feature').includes('feature'));
});

test('GitHub panel verifies local/remote deletion and reports a rejected remote deletion', async t => {
  const f = panelFixture(t), remote = path.join(f.base, 'unused-remote.git');
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], { stdio: 'ignore' });
  f.git('push', '-u', 'origin', 'main');
  f.git('branch', 'feature'); f.git('push', 'origin', 'feature');
  const messages = []; f.provider._postMessage = message => messages.push(message);
  await f.provider._handleDeleteBranches(['feature']);
  assert.ok(messages.some(message => message.type === 'deleteOk'));
  assert.equal(f.git('branch', '--list', 'feature').trim(), '');
  assert.equal(f.git('ls-remote', '--heads', 'origin', 'refs/heads/feature').trim(), '');
  f.git('branch', 'blocked'); f.git('push', 'origin', 'blocked');
  const hook = path.join(remote, 'hooks/pre-receive');
  fs.writeFileSync(hook, '#!/bin/sh\necho "unable to delete: audit rejection" >&2\nexit 1\n'); fs.chmodSync(hook, 0o755);
  messages.length = 0;
  await f.provider._handleDeleteBranches(['blocked']);
  assert.ok(messages.some(message => message.type === 'deletePartial' && message.message.includes('audit rejection')));
  assert.ok(!messages.some(message => message.type === 'deleteOk'));
  assert.ok(f.git('ls-remote', '--heads', 'origin', 'refs/heads/blocked').includes('refs/heads/blocked'));
});
