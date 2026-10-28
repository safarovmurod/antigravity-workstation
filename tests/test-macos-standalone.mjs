import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findIde, profilePaths, macSettings, macKeybindings, verifyFonts, install } from '../macos/setup.mjs';

test('Mac installer locates its app and uses macOS profile directories', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-mac-'));
  try {
    const app = path.join(home, 'Applications', 'Antigravity.app');
    const appRoot = path.join(app, 'Contents', 'Resources', 'app');
    fs.mkdirSync(path.join(appRoot, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(appRoot, 'bin', 'antigravity'), '');
    fs.writeFileSync(path.join(appRoot, 'product.json'), JSON.stringify({ nameShort: 'Antigravity', dataFolderName: '.antigravity' }));
    const ide = findIde(home);
    const paths = profilePaths(home, ide);
    assert.equal(ide.app, app);
    assert.equal(paths.settings, path.join(home, 'Library', 'Application Support', 'Antigravity', 'User', 'settings.json'));
    assert.equal(paths.extensions, path.join(home, '.antigravity', 'extensions'));
    const settings = macSettings(ide, { 'workbench.colorTheme': 'My Theme', 'chat.tools.terminal.autoApprove': { rm: false } });
    assert.equal(settings['terminal.integrated.defaultProfile.osx'], 'zsh');
    assert.equal(settings['terminal.integrated.defaultProfile.windows'], undefined);
    assert.equal(settings['workbench.colorTheme'], 'My Theme');
    assert.deepEqual(macSettings(ide, { 'workbench.colorCustomizations': { 'editor.background': '#123456', '[User]': { 'tab.activeBackground': '#123456' } } })['workbench.colorCustomizations']['[User]'], { 'tab.activeBackground': '#123456' });
    assert.equal(settings['chat.tools.terminal.autoApprove'].rm, false);
    assert.deepEqual(settings['chat.tools.terminal.autoApprove'], { rm: false });
    const fresh = macSettings(ide);
    for (const key of ['editor.inlineSuggest.enabled', 'chat.tools.terminal.autoApprove', 'security.workspace.trust.untrustedFiles']) assert.equal(Object.hasOwn(fresh, key), false);
    assert.equal(Object.hasOwn(fresh['[typescript]'], 'editor.inlineSuggest.enabled'), false);
    const keys = macKeybindings([{ key: 'f4', command: 'personal' }]);
    assert.ok(keys.some(item => item.key === 'cmd+shift+f'));
    assert.ok(keys.some(item => item.key === 'f4' && item.command === 'personal'));
    assert.deepEqual(macKeybindings([{ key: 'cmd+shift+f', command: 'personal-format', when: 'editorTextFocus && !editorReadonly' }]).find(item => item.key === 'cmd+shift+f').command, 'personal-format');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('Mac font preflight verifies bundled files and refuses conflicting personal font', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-mac-font-'));
  try {
    const { fonts, manifest } = verifyFonts(home);
    fs.mkdirSync(fonts, { recursive: true });
    fs.writeFileSync(path.join(fonts, manifest.files[0].name), 'personal');
    assert.throws(() => verifyFonts(home), /Personal font differs/);
    assert.equal(fs.readFileSync(path.join(fonts, manifest.files[0].name), 'utf8'), 'personal');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('Mac installer POSIX fixture writes a temporary profile and retains personal extensions', { skip: process.platform === 'win32' }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-mac-install-'));
  const oldPath = process.env.PATH;
  try {
    const tools = path.join(home, 'fake-tools');
    fs.mkdirSync(tools);
    const npm = path.join(tools, 'npm');
    fs.writeFileSync(npm, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(npm, 0o755);
    process.env.PATH = tools + path.delimiter + oldPath;
    const app = path.join(home, 'Applications', 'Antigravity.app');
    const appRoot = path.join(app, 'Contents', 'Resources', 'app');
    const cli = path.join(appRoot, 'bin', 'antigravity');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    const catalog = JSON.parse(fs.readFileSync(new URL('../config/extensions.json', import.meta.url)));
    const custom = ['git-branch-panel', 'workstation-stability', 'calm-typescript', 'aster-appearance']
      .map(name => JSON.parse(fs.readFileSync(new URL('../extensions/' + name + '/package.json', import.meta.url))))
      .map(item => item.publisher + '.' + item.name);
    const ids = [...catalog.filter(item => item.source === 'gallery' && !item.optional).map(item => item.id), ...custom];
    fs.writeFileSync(cli, '#!/bin/sh\nif [ "$1" = "--list-extensions" ]; then printf "%s\\n" ' + ids.map(id => "'" + id + "'").join(' ') + '; fi\n');
    fs.chmodSync(cli, 0o755);
    fs.writeFileSync(path.join(appRoot, 'product.json'), JSON.stringify({ nameShort: 'Antigravity', dataFolderName: '.antigravity' }));
    const ide = { app, appRoot, cli, identity: { nameShort: 'Antigravity', dataFolderName: '.antigravity' } };
    const paths = profilePaths(home, ide);
    fs.mkdirSync(paths.extensions, { recursive: true });
    fs.writeFileSync(path.join(paths.extensions, 'personal-extension.txt'), 'before');
    const hooksFile = path.join(home, '.gemini', 'antigravity', 'hooks.json');
    fs.mkdirSync(path.dirname(hooksFile), { recursive: true });
    const personalHooks = { 'gsd-antigravity': { enabled: false }, personal: { enabled: false, Stop: [{ hooks: [{ command: 'personal-hook' }] }] } };
    fs.writeFileSync(hooksFile, JSON.stringify(personalHooks));
    const result = install({ home, ide, testPlatform: true });
    assert.ok(fs.existsSync(paths.settings));
    assert.equal(fs.readFileSync(path.join(paths.extensions, 'personal-extension.txt'), 'utf8'), 'before');
    assert.equal(fs.readFileSync(path.join(home, '.gemini', 'config', 'workstation-setup', 'macos-owned.json'), 'utf8').includes('files'), true);
    assert.ok(fs.existsSync(path.join(home, 'Library', 'Fonts')));
    for (let repeat = 0; repeat < 2; repeat++) {
      const hooks = JSON.parse(fs.readFileSync(hooksFile));
      assert.equal(hooks['gsd-antigravity'].enabled, false);
      assert.deepEqual(hooks.personal, personalHooks.personal);
      assert.ok(hooks['gsd-antigravity'].PreToolUse[0].hooks.length > 0);
      if (repeat === 0) install({ home, ide, testPlatform: true });
    }
  } finally {
    process.env.PATH = oldPath;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

// The setup must never remove unrelated extensions or replace personal rules.
test('Mac repeats preserve personal configuration and extension payloads without taking ownership', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-mac-preserve-'));
  try {
    const ide = { appRoot: '/tmp/antigravity-fixture', identity: { nameShort: 'Antigravity', dataFolderName: '.antigravity' } };
    const before = { 'editor.fontFamily': 'Personal Mono', 'editor.guides.indentation': false,
      'workbench.colorCustomizations': { 'editor.background': '#123456' },
      'workbench.settings.applyToAllProfiles': ['personal.setting'] };
    const merged = macSettings(ide, before);
    for (const [key,value] of Object.entries(before)) {
      if (key === 'workbench.colorCustomizations') assert.deepEqual(merged[key]['editor.background'], value['editor.background']);
      else assert.deepEqual(merged[key], value);
    }
    assert.deepEqual(macSettings(ide, merged), merged);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
