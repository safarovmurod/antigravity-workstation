import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const { runInstaller } = require('../lib/installer.js');
const { getEnvironmentPaths } = require('../lib/paths.js');
const { collectPayload } = require('../lib/owned-files.js');
const { installBundledCalmTypeScript } = require('../lib/extensions.js');
const { buildCalmTypeScript } = require('../scripts/package-calm-typescript.cjs');

function fixture(t, gitBashPath) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-profile-conflicts-'));
  t.after(() => {
    const resolved = path.resolve(base);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith('workstation-profile-conflicts-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const customRoots = { userProfile: path.join(base, 'User Profile With Spaces'), ...(gitBashPath ? { gitBashPath } : {}) };
  return { customRoots, env: getEnvironmentPaths(customRoots) };
}

function installProfile(customRoots) {
  const result = runInstaller({ customRoots, repoRoot, skipExtensions: true, skipAgentBrowser: true, skipFont: true, skipPermissions: true, log() {} });
  assert.equal(result.success, true, result.failures.join('; '));
}

test('Installed GSD workflow agent references and permissions resolve to the deployed catalog', t => {
  const { customRoots, env } = fixture(t);
  installProfile(customRoots);
  let resolvedReferences = 0;
  for (const item of collectPayload(repoRoot, 'Шеф').filter(item => item.key.startsWith('gsd-core/') && item.key.endsWith('.md'))) {
    const installed = path.join(env.geminiDir, 'antigravity', item.key);
    const text = fs.readFileSync(installed, 'utf8');
    assert.doesNotMatch(text, /~\/\.gemini\/antigravity\/agents\//, item.key);
    for (const reference of text.matchAll(/~\/\.gemini\/config\/agents\/gsd-[\w-]+\.md\b/g)) {
      const target = path.join(env.userProfile, reference[0].slice(2));
      assert.ok(fs.existsSync(target), item.key + ' references missing ' + reference[0]);
      resolvedReferences++;
    }
  }
  assert.ok(resolvedReferences >= 10, 'The affected workflows must actually be checked');
  const permissions = JSON.parse(fs.readFileSync(path.join(env.geminiDir, 'antigravity/settings.json'), 'utf8')).permissions.allow;
  assert.ok(permissions.includes('read_file(~/.gemini/config/agents/gsd-*)'));
  assert.ok(permissions.includes('read_file(~/.gemini/config/skills/gsd-*)'));
  const runtime = spawnSync(process.execPath, [path.join(env.geminiDir, 'antigravity/gsd-core/bin/gsd-tools.cjs'), 'runtime-identity', '--raw'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(runtime.status, 0, runtime.stderr);
  assert.equal(JSON.parse(runtime.stdout).packageName, '@opengsd/gsd-core');
});

test('Rendered hooks execute from a profile with spaces and use its resolved shell and state directory', t => {
  const gitBashPath = process.platform === 'win32' ? getEnvironmentPaths().gitBashPath : '/bin/bash';
  assert.ok(gitBashPath && fs.existsSync(gitBashPath), 'A shell is required to exercise the shell hook');
  const { customRoots, env } = fixture(t, gitBashPath);
  installProfile(customRoots);
  const hooksRoot = path.join(env.geminiDir, 'antigravity/hooks');
  // Session startup is stubbed only in this disposable profile to avoid an update
  // download and to verify the launch contract independently of session contents.
  fs.writeFileSync(path.join(hooksRoot, 'gsd-check-update.js'), "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('{}'));\n");
  fs.writeFileSync(path.join(hooksRoot, 'gsd-session-state.sh'), "IFS= read -r payload || true\nprintf '%s' '{}'\n");
  const hooks = JSON.parse(fs.readFileSync(path.join(env.geminiConfigDir, 'hooks.json'), 'utf8'))['gsd-antigravity'];
  const input = JSON.stringify({ conversationId: 'profile-space-test', workspacePaths: [repoRoot], toolCall: { name: 'view_file', args: { AbsolutePath: path.join(repoRoot, 'README.md') } } });
  for (const event of ['PreToolUse', 'PostToolUse', 'PreInvocation']) {
    const command = event === 'PreInvocation' ? hooks[event][0].command : hooks[event][0].hooks[0].command;
    assert.ok(command.startsWith('"' + env.nodeExe.replace(/\\/g, '/') + '" '));
    assert.ok(command.endsWith('"' + env.gitBashPath.replace(/\\/g, '/') + '"'));
    const result = spawnSync(command, { shell: process.platform === 'win32' ? true : '/bin/bash', input, encoding: 'utf8', timeout: 15000, windowsHide: true, cwd: repoRoot });
    assert.equal(result.status, 0, event + ': ' + (result.error?.message || result.stderr));
    assert.equal(result.stderr, '', event + ': hooks must execute, not silently fall back on an error');
    const output = JSON.parse(result.stdout);
    if (event === 'PreToolUse') assert.equal(output.decision, 'ask');
  }
  const state = JSON.parse(fs.readFileSync(path.join(env.geminiDir, 'antigravity-ide/hook-state/profile-space-test.json'), 'utf8'));
  assert.equal(state.started, true);
});

function loadCalmTypeScript(t) {
  const { env } = fixture(t);
  const result = installBundledCalmTypeScript(null, env.extensionsDir, path.join(repoRoot, 'extensions/calm-typescript'), { isolated: true, log() {} });
  assert.equal(result.success, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extensions/calm-typescript/manifest.json'), 'utf8'));
  return require(path.join(env.extensionsDir, `workstation.calm-typescript-${manifest.version}-universal/dist/extension.cjs`)).createExtension;
}

function mockEditor(settings, state = new Map()) {
  const disposable = () => ({ dispose() {} });
  const config = {
    inspect: key => ({ globalValue: settings[key] }),
    async update(key, value) {
      if (value === undefined) delete settings[key];
      else settings[key] = value;
    },
  };
  const vscode = {
    extensions: { getExtension: () => ({}) },
    ConfigurationTarget: { Global: 1 },
    DecorationRangeBehavior: { ClosedClosed: 1 },
    StatusBarAlignment: { Right: 1 },
    window: {
      createTextEditorDecorationType: disposable,
      createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
      onDidChangeActiveTextEditor: disposable,
    },
    workspace: {
      getConfiguration: section => section === 'calmTypeScript'
        ? { get: (key, fallback) => Object.hasOwn(settings, 'calmTypeScript.' + key) ? settings['calmTypeScript.' + key] : fallback }
        : config,
      onDidChangeTextDocument: disposable,
      onDidCloseTextDocument: disposable,
      onDidChangeConfiguration: disposable,
    },
    commands: { registerCommand: disposable },
  };
  return { vscode, context: { subscriptions: [], globalState: {
    get: key => state.get(key),
    async update(key, value) {
      if (value === undefined) state.delete(key);
      else state.set(key, value);
    },
  } } };
}

test('Bundled Calm TypeScript reproduces its reviewed source and pinned checksums', () => {
  const built = buildCalmTypeScript(repoRoot);
  assert.deepEqual(fs.readFileSync(built.file), built.bytes);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repoRoot, 'extensions/calm-typescript/manifest.json'), 'utf8')), built.pin);
});

test('Calm quiet mode keeps squiggles and unused hints visible without disabling validation', async t => {
  const createExtension = loadCalmTypeScript(t);
  const settings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/settings.json'), 'utf8'));
  assert.equal(settings['calmTypeScript.quietMode'], true);
  assert.equal(settings['calmTypeScript.smoothTyping'], true);
  const before = structuredClone(settings);
  const { vscode, context } = mockEditor(settings);
  await createExtension(vscode, context).ready();
  assert.equal(settings['typescript.validate.enable'], true);
  assert.equal(settings['javascript.validate.enable'], true);
  assert.equal(settings['errorLens.enabled'], true);
  assert.equal(settings['editor.cursorWidth'], before['editor.cursorWidth']);
  assert.equal(settings['problems.visibility'], undefined, 'Squiggles stay visible');
  for (const language of ['javascript', 'javascriptreact', 'typescript', 'typescriptreact']) {
    assert.equal(settings[`[${language}]`]['editor.showUnused'], undefined, 'Unused hints stay visible');
    assert.equal(settings[`[${language}]`]['editor.defaultFormatter'], before[`[${language}]`]['editor.defaultFormatter']);
  }
  assert.equal(settings['errorLens.excludeLanguages'], undefined, 'Error Lens languages stay enabled');
  assert.equal(settings['workbench.colorCustomizations']['editorError.foreground'], '#f8717133');
  assert.equal(settings['workbench.colorCustomizations']['editorWarning.foreground'], '#fbbf2433');
  // The extension itself applies the calm colors when they are missing.
  delete settings['workbench.colorCustomizations']['editorError.foreground'];
  delete settings['workbench.colorCustomizations']['editorWarning.foreground'];
  await createExtension(vscode, context).ready();
  assert.equal(settings['workbench.colorCustomizations']['editorError.foreground'], '#f8717133');
  assert.equal(settings['workbench.colorCustomizations']['editorWarning.foreground'], '#fbbf2433');
});

test('Updating from 3.1.x restores validation and visibility while keeping unrelated exclusions', async t => {
  const createExtension = loadCalmTypeScript(t);
  const settings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/settings.json'), 'utf8'));
  settings['errorLens.excludeLanguages'] = ['python'];
  settings['problems.visibility'] = false;
  settings['[typescriptreact]'] = { ...settings['[typescriptreact]'], 'editor.showUnused': false };
  // State written by 3.1.x: language validation was turned off and diagnostics
  // hidden, with the original user's values saved under the v31 ownership keys.
  const state = new Map([
    ['calmTypeScript.v31.managed.quietFlags', {
      'typescript.validate.enable': { hasValue: true, value: true },
      'javascript.validate.enable': { hasValue: true, value: true },
      'typescript.suggestionActions.enabled': { hasValue: false },
      'javascript.suggestionActions.enabled': { hasValue: false },
    }],
    ['calmTypeScript.v31.managed.quietPresentation', { 'problems.visibility': { hasValue: false, value: undefined } }],
    ['calmTypeScript.v31.managed.quietLanguages', {
      '[javascript]': { hasValue: false, value: {} },
      '[javascriptreact]': { hasValue: false, value: {} },
      '[typescript]': { hasValue: false, value: {} },
      '[typescriptreact]': { hasValue: true, value: { 'editor.defaultFormatter': 'esbenp.prettier-vscode' } },
    }],
    ['calmTypeScript.v31.managed.quietErrorLens', { hasValue: false, value: [] }],
  ]);
  for (const name of Object.keys(state.get('calmTypeScript.v31.managed.quietFlags'))) settings[name] = false;
  const { vscode, context } = mockEditor(settings, state);
  await createExtension(vscode, context).ready();
  assert.equal(settings['typescript.validate.enable'], true);
  assert.equal(settings['javascript.validate.enable'], true);
  assert.equal(settings['problems.visibility'], undefined, 'Squiggles become visible again');
  assert.equal(settings['[typescriptreact]']['editor.showUnused'], undefined, 'Unused hints become visible again');
  assert.equal(settings['[typescriptreact]']['editor.defaultFormatter'], 'esbenp.prettier-vscode');
  assert.deepEqual(settings['errorLens.excludeLanguages'], ['python'], 'Unrelated exclusions survive');
  assert.equal(settings['workbench.colorCustomizations']['editorError.foreground'], '#f8717133');
  assert.equal(state.has('calmTypeScript.v31.managed.quietFlags'), false);
  assert.equal(state.has('calmTypeScript.v31.managed.quietLanguages'), false);
});

test('Disabling calm quiet mode removes only its own color keys', async t => {
  const createExtension = loadCalmTypeScript(t);
  const settings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/settings.json'), 'utf8'));
  delete settings['workbench.colorCustomizations']['editorError.foreground'];
  delete settings['workbench.colorCustomizations']['editorWarning.foreground'];
  settings['errorLens.excludeLanguages'] = ['python'];
  const expected = structuredClone(settings);
  expected['calmTypeScript.quietMode'] = false;
  const { vscode, context } = mockEditor(settings);
  await createExtension(vscode, context).ready();
  assert.equal(settings['workbench.colorCustomizations']['editorError.foreground'], '#f8717133');
  settings['calmTypeScript.quietMode'] = false;
  await createExtension(vscode, context).ready();
  assert.deepEqual(settings, expected);
});
