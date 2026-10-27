import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findIde, profilePaths, macSettings, macKeybindings, verifyFonts } from '../macos/setup.mjs';

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
    assert.equal(settings['chat.tools.terminal.autoApprove'].rm, false);
    const keys = macKeybindings([{ key: 'f4', command: 'personal' }]);
    assert.ok(keys.some(item => item.key === 'cmd+shift+f'));
    assert.ok(keys.some(item => item.key === 'f4' && item.command === 'personal'));
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
