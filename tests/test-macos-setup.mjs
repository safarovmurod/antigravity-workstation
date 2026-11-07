import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const { run } = require('../scripts/macos-setup.cjs');

function put(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function fixture(t, version = '2.6.0') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-macos-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const app = path.join(home, 'Applications', 'Antigravity.app');
  put(path.join(app, 'Contents', 'Resources', 'app', 'product.json'),
    JSON.stringify({ ideVersion: version, nameShort: 'Antigravity', dataFolderName: '.antigravity', applicationName: 'antigravity' }));
  put(path.join(app, 'Contents', 'Resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'), '<html></html>');
  const user = path.join(home, 'Library', 'Application Support', 'Antigravity', 'User');
  put(path.join(user, 'settings.json'), '{\n  // personal\n  "workbench.colorTheme": "Monokai",\n  "my.personal": 7,\n  "files.autoSave": "off",\n  "editor.fontLigatures": false\n}');
  put(path.join(user, 'keybindings.json'), '[{"key":"ctrl+k","command":"my.command"}]');
  put(path.join(user, 'snippets', 'mine.code-snippets'), '{}');
  put(path.join(home, '.antigravity', 'argv.json'), '{"locale":"en"}');
  put(path.join(home, '.gemini', 'config', 'skills', 'my-skill', 'SKILL.md'), 'personal skill');
  put(path.join(home, '.gemini', 'config', 'mcp_config.json'), JSON.stringify({ mcpServers: {
    mine: { command: 'mine', env: { TOKEN: 'keep' } },
    gsd: { command: 'node', args: [home + '/.gemini/config/mcp-runtime/node_modules/@opengsd/gsd-core/bin/mcp.js'] },
  } }));
  put(path.join(home, '.gemini', 'antigravity', 'conversations', 'chat.pb'), 'chat');
  put(path.join(home, '.gemini', 'antigravity', 'brain', 'memory.md'), 'memory');
  put(path.join(home, '.gemini', 'antigravity', 'mcp_config.json'), '{"mcpServers":{}}');
  put(path.join(home, '.gemini', 'antigravity', 'settings.json'), '{"permissions":{"allow":["command(ls)"]}}');
  // applicationName is "antigravity" in this bundle, so its native hooks live in ~/.gemini/antigravity/hooks.json.
  put(path.join(home, '.gemini', 'antigravity', 'hooks.json'), '{"gsd-antigravity":{"enabled":true},"mine":{"enabled":false}}');
  put(path.join(home, 'projects', 'shop', '.vscode', 'settings.json'), '{"project":true}');
  return { home, app, user };
}
const options = (home, app, mode) => ({ home, app, mode, node: '/opt/homebrew/bin/node', totalMemoryBytes: 16 * 1024 ** 3, log() {} });

test('macOS mode 2 writes the Windows profile by the same merge rules and keeps personal values', t => {
  const { home, app, user } = fixture(t);
  const result = run(options(home, app, '2'));
  const settings = read(path.join(user, 'settings.json'));
  const managed = read(path.join(repoRoot, 'config', 'settings.json'));
  assert.equal(settings['workbench.colorTheme'], 'Monokai', 'a personal theme stays');
  assert.equal(settings['my.personal'], 7, 'unrelated personal keys stay');
  assert.equal(settings['files.autoSave'], 'afterDelay', 'README modes always manage Auto Save');
  assert.equal(settings['files.autoSaveDelay'], 1000);
  assert.equal(settings['editor.inlineSuggest.enabled'], false, 'AI ghost text is off');
  assert.equal(settings['editor.fontLigatures'], managed['editor.fontLigatures'], 'a value earlier setups wrote moves to the current profile');
  assert.equal(settings['typescript.tsserver.maxTsServerMemory'], 4096);
  assert.equal(settings['jellyCursor.workbenchHtmlPath'], path.join(app, 'Contents', 'Resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'));
  for (const key of ['terminal.integrated.profiles.windows', 'terminal.integrated.defaultProfile.windows', 'chat.tools.terminal.autoApprove', 'security.workspace.trust.untrustedFiles']) {
    assert.equal(Object.hasOwn(settings, key), false, key + ' is not written on macOS');
  }
  for (const language of ['[javascript]', '[typescriptreact]']) assert.equal(settings[language]['editor.autoClosingBrackets'], 'always');
  const bindings = read(path.join(user, 'keybindings.json'));
  assert.ok(bindings.some(binding => binding.command === 'my.command'), 'personal shortcuts stay');
  assert.ok(read(path.join(repoRoot, 'config', 'keybindings.json')).every(binding => bindings.some(item => JSON.stringify(item) === JSON.stringify(binding))));
  assert.equal(read(path.join(home, '.antigravity', 'argv.json')).locale, 'en', 'personal argv values stay');
  assert.equal(fs.readFileSync(path.join(home, '.gemini', 'GEMINI.md'), 'utf8'), fs.readFileSync(path.join(repoRoot, 'rules', 'GEMINI.template.md'), 'utf8'));
  for (const skill of read(path.join(repoRoot, 'config', 'skill-inventory.json')).skills) {
    assert.ok(fs.existsSync(path.join(home, '.gemini', 'config', 'skills', skill, 'SKILL.md')), skill);
  }
  assert.ok(fs.existsSync(path.join(home, '.gemini', 'config', 'skills', 'my-skill', 'SKILL.md')), 'a personal skill stays');
  assert.ok(fs.existsSync(path.join(home, '.gemini', 'config', 'agents', 'workstation-verifier.md')));
  assert.ok(fs.existsSync(path.join(home, '.gemini', 'config', 'rules', 'workstation-unified-design.md')));
  assert.ok(fs.existsSync(path.join(home, '.gemini', 'config', 'workstation-unified', 'guides', 'design.md')));
  assert.ok(fs.existsSync(path.join(home, '.gemini', 'config', 'mcp-runtime', 'package-lock.json')));
  assert.equal(fs.existsSync(path.join(home, '.gemini', 'scripts', 'macos-setup.cjs')), false, 'the macOS script is not part of the payload');
  const mcp = read(path.join(home, '.gemini', 'config', 'mcp_config.json'));
  assert.deepEqual(Object.keys(mcp.mcpServers).sort(), ['chrome-devtools-mcp', 'mine', 'sequential-thinking']);
  assert.equal(mcp.mcpServers.mine.env.TOKEN, 'keep');
  assert.equal(mcp.mcpServers['sequential-thinking'].command, '/opt/homebrew/bin/node');
  assert.equal(mcp.mcpServers['sequential-thinking'].args[0], home.replace(/\\/g, '/') + '/.gemini/config/mcp-runtime/node_modules/@modelcontextprotocol/server-sequential-thinking/dist/index.js');
  assert.ok(read(path.join(home, '.gemini', 'antigravity', 'mcp_config.json')).mcpServers['sequential-thinking']);
  const hooks = read(path.join(home, '.gemini', 'antigravity', 'hooks.json'));
  assert.equal(Object.hasOwn(hooks, 'gsd-antigravity'), false, 'the retired GSD hook plugin goes');
  assert.deepEqual(hooks.mine, { enabled: false }, 'personal hook plugins stay');
  assert.deepEqual(read(path.join(home, '.gemini', 'antigravity', 'settings.json')).permissions.allow, ['command(ls)'], 'README modes add no permissions');
  const profile = read(path.join(home, '.gemini', 'config', 'workstation-setup', 'editor-profile.json'));
  assert.equal(profile.schema, 1);
  assert.match(profile.requestId, /^[a-f0-9-]{36}$/);
  assert.equal(profile.locale, 'en');
  assert.equal(profile.settings['files.autoSave'], 'afterDelay');
  assert.ok(result.backup && fs.existsSync(path.join(result.backup, 'Library', 'Application Support', 'Antigravity', 'User', 'settings.json')), 'changed files are copied first');
  assert.equal(result.resetBackup, null);
  assert.equal(result.cli, path.join(app, 'Contents', 'Resources', 'app', 'bin', 'antigravity'));
  assert.ok(fs.existsSync(path.join(user, 'snippets', 'mine.code-snippets')), 'mode 2 leaves snippets');
  assert.equal(fs.readFileSync(path.join(home, 'projects', 'shop', '.vscode', 'settings.json'), 'utf8'), '{"project":true}');
  const again = run(options(home, app, '2'));
  assert.deepEqual(again.written.filter(file => !file.endsWith('editor-profile.json')), [], 'a repeat changes nothing but the profile request');
  assert.equal(again.payload.changed, 0);
});

test('macOS mode 1 moves everything Antigravity keeps into one backup and installs the profile from nothing', t => {
  const { home, app, user } = fixture(t);
  const result = run(options(home, app, '1'));
  assert.ok(result.resetBackup.startsWith(path.join(home, '.gemini', 'backups', 'full-reset-')));
  const settings = read(path.join(user, 'settings.json'));
  assert.equal(Object.hasOwn(settings, 'my.personal'), false, 'personal settings go to the backup');
  assert.equal(settings['workbench.colorTheme'], read(path.join(repoRoot, 'config', 'settings.json'))['workbench.colorTheme']);
  assert.equal(read(path.join(user, 'keybindings.json')).some(binding => binding.command === 'my.command'), false);
  assert.equal(read(path.join(home, '.antigravity', 'argv.json')).locale, 'ru');
  assert.equal(fs.existsSync(path.join(user, 'snippets')), false, 'snippets go to the backup');
  assert.equal(fs.existsSync(path.join(home, '.gemini', 'config', 'skills', 'my-skill')), false, 'personal skills go to the backup');
  assert.equal(fs.existsSync(path.join(home, '.gemini', 'antigravity', 'conversations')), false, 'chats go to the backup');
  assert.deepEqual(Object.keys(read(path.join(home, '.gemini', 'config', 'mcp_config.json')).mcpServers).sort(), ['chrome-devtools-mcp', 'sequential-thinking']);
  assert.equal(fs.readFileSync(path.join(result.resetBackup, 'gemini', 'config', 'skills', 'my-skill', 'SKILL.md'), 'utf8'), 'personal skill');
  assert.equal(fs.readFileSync(path.join(result.resetBackup, 'gemini', 'antigravity', 'conversations', 'chat.pb'), 'utf8'), 'chat');
  assert.ok(fs.existsSync(path.join(result.resetBackup, 'appdata', 'Antigravity', 'User', 'snippets', 'mine.code-snippets')));
  assert.equal(read(path.join(result.resetBackup, 'manifest.json')).state, 'complete');
  assert.equal(fs.readFileSync(path.join(home, 'projects', 'shop', '.vscode', 'settings.json'), 'utf8'), '{"project":true}', 'project folders stay');
});

test('macOS setup refuses another IDE version unless the user allowed it, before any change', t => {
  const { home, app, user } = fixture(t, '2.7.0');
  const before = fs.readFileSync(path.join(user, 'settings.json'), 'utf8');
  assert.throws(() => run(options(home, app, '1')), /Antigravity 2\.6\.0 is required; this app is 2\.7\.0\. Nothing was changed/);
  assert.equal(fs.readFileSync(path.join(user, 'settings.json'), 'utf8'), before);
  assert.ok(fs.existsSync(path.join(home, '.gemini', 'antigravity', 'conversations', 'chat.pb')));
  assert.equal(run({ ...options(home, app, '2'), allowOtherVersion: true }).ideVersion, '2.7.0');
});
