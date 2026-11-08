import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fullReset, resetTargets } = require('../lib/full-reset.js');

function put(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-full-reset-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const appData = path.join(home, 'AppData', 'Roaming');
  const ideRoot = path.join(home, 'Programs', 'Antigravity IDE');
  const env = { userProfile: home, appData, ideRoot, geminiDir: path.join(home, '.gemini'), backupsDir: path.join(home, '.gemini', 'backups') };
  const files = {
    [path.join(appData, 'Antigravity IDE', 'User', 'settings.json')]: '{"personal":true}',
    [path.join(appData, 'Antigravity IDE', 'User', 'keybindings.json')]: '[]',
    [path.join(appData, 'Antigravity IDE', 'User', 'snippets', 'mine.code-snippets')]: '{}',
    [path.join(appData, 'Antigravity IDE', 'User', 'profiles', 'Work', 'settings.json')]: '{}',
    [path.join(appData, 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb')]: 'sign-in and agent preferences',
    [path.join(appData, 'Antigravity IDE', 'User', 'workspaceStorage', 'a', 'state.vscdb')]: 'workspace',
    [path.join(appData, 'Antigravity', 'User', 'settings.json')]: '{"older":true}',
    [path.join(home, '.antigravity-ide', 'extensions', 'foreign.ext-1.0.0', 'package.json')]: '{}',
    [path.join(home, '.antigravity-ide', 'argv.json')]: '{"locale":"en"}',
    [path.join(home, '.antigravity', 'jelly-cursor', 'state.json')]: '{}',
    [path.join(home, '.antigravity-tools', 'tool.txt')]: 'tool',
    [path.join(ideRoot, 'data', 'user-data', 'User', 'settings.json')]: '{"portable":true}',
    [path.join(home, '.gemini', 'GEMINI.md')]: 'old rules',
    [path.join(home, '.gemini', 'config', 'skills', 'my-skill', 'SKILL.md')]: 'personal skill',
    [path.join(home, '.gemini', 'config', 'agents', 'my-agent.md')]: 'personal agent',
    [path.join(home, '.gemini', 'config', 'mcp_config.json')]: '{"mcpServers":{"mine":{"env":{"TOKEN":"x"}}}}',
    [path.join(home, '.gemini', 'antigravity', 'conversations', 'chat.pb')]: 'chat',
    [path.join(home, '.gemini', 'antigravity', 'brain', 'memory.md')]: 'memory',
    [path.join(home, '.gemini', 'antigravity-ide', 'hooks.json')]: '{"mine":{}}',
    [path.join(home, '.gemini', 'oauth_creds.json')]: 'sign-in',
    [path.join(home, '.gemini', 'backups', 'setup-backup-old', 'manifest.json')]: 'earlier backup',
  };
  for (const [file, text] of Object.entries(files)) put(file, text);
  const untouched = {
    [path.join(ideRoot, 'Antigravity IDE.exe')]: 'binary',
    [path.join(ideRoot, 'resources', 'app', 'product.json')]: '{}',
    [path.join(home, 'projects', 'shop', '.vscode', 'settings.json')]: '{"project":true}',
    [path.join(home, '.gitconfig')]: '[user]',
    [path.join(appData, 'Code', 'User', 'settings.json')]: '{"vscode":true}',
  };
  for (const [file, text] of Object.entries(untouched)) put(file, text);
  return { home, env, files, untouched };
}

test('Command 1 moves every Antigravity setting, sign-in, chat, rule, skill, agent, MCP server and hook into one backup', t => {
  const { home, env, files, untouched } = fixture(t);
  const result = fullReset(env, { now: new Date('2026-11-07T10:20:30Z'), repoRoot: path.join(home, 'Downloads', 'antigravity-workstation') });
  assert.equal(result.backup, path.join(env.backupsDir, 'full-reset-20261107T102030'));
  for (const [file, text] of Object.entries(files)) {
    if (file.includes(path.join('.gemini', 'backups'))) {
      assert.equal(fs.readFileSync(file, 'utf8'), text, 'earlier backups stay where they are');
      continue;
    }
    assert.equal(fs.existsSync(file), false, 'nothing stays in place: ' + file);
  }
  const backup = result.backup;
  const moved = {
    [path.join(backup, 'appdata', 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb')]: 'sign-in and agent preferences',
    [path.join(backup, 'appdata', 'Antigravity IDE', 'User', 'snippets', 'mine.code-snippets')]: '{}',
    [path.join(backup, 'appdata', 'Antigravity', 'User', 'settings.json')]: '{"older":true}',
    [path.join(backup, 'home', '.antigravity-ide', 'extensions', 'foreign.ext-1.0.0', 'package.json')]: '{}',
    [path.join(backup, 'home', '.antigravity-tools', 'tool.txt')]: 'tool',
    [path.join(backup, 'portable', 'data', 'user-data', 'User', 'settings.json')]: '{"portable":true}',
    [path.join(backup, 'gemini', 'config', 'skills', 'my-skill', 'SKILL.md')]: 'personal skill',
    [path.join(backup, 'gemini', 'antigravity', 'conversations', 'chat.pb')]: 'chat',
    [path.join(backup, 'gemini', 'oauth_creds.json')]: 'sign-in',
  };
  for (const [file, text] of Object.entries(moved)) assert.equal(fs.readFileSync(file, 'utf8'), text, 'kept in the backup: ' + file);
  for (const [file, text] of Object.entries(untouched)) assert.equal(fs.readFileSync(file, 'utf8'), text, 'outside Antigravity stays: ' + file);
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
  assert.equal(manifest.state, 'complete');
  assert.equal(manifest.items.length, result.items.length);
  assert.deepEqual(fs.readdirSync(env.geminiDir), ['backups'], 'only the backups folder is left in .gemini');
});

test('A full reset preview changes nothing and a repeat on a new profile moves only what exists', t => {
  const { env, files } = fixture(t);
  const preview = fullReset(env, { dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.ok(preview.items.length >= 10);
  for (const [file, text] of Object.entries(files)) assert.equal(fs.readFileSync(file, 'utf8'), text);
  fullReset(env, { now: new Date('2026-11-07T10:00:00Z') });
  put(path.join(env.appData, 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb'), 'new profile');
  const again = fullReset(env, { now: new Date('2026-11-07T11:00:00Z') });
  assert.deepEqual(again.items.map(item => path.basename(item.from)), ['Antigravity IDE']);
  assert.deepEqual(resetTargets(env), []);
});

test('A folder in use stops the reset and puts every moved folder back', t => {
  const { env, files } = fixture(t);
  let calls = 0;
  const move = (from, to) => {
    if (++calls === 4) throw Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' });
    fs.renameSync(from, to);
  };
  assert.throws(() => fullReset(env, { move, now: new Date('2026-11-07T12:00:00Z') }),
    /A program still uses it[\s\S]*Nothing was removed: every moved folder is back in place/);
  for (const [file, text] of Object.entries(files)) assert.equal(fs.readFileSync(file, 'utf8'), text, 'restored: ' + file);
  const manifest = JSON.parse(fs.readFileSync(path.join(env.backupsDir, 'full-reset-20261107T120000', 'manifest.json'), 'utf8'));
  assert.equal(manifest.state, 'rolled-back');
});

test('A full reset refuses to move the IDE or this setup itself', t => {
  const { env, home, files } = fixture(t);
  assert.throws(() => fullReset({ ...env, ideRoot: path.join(home, '.antigravity-ide', 'Antigravity IDE') }), /Antigravity IDE is inside .*Nothing was changed/);
  put(path.join(home, '.gemini', 'workstation', 'package.json'), '{}');
  assert.throws(() => fullReset(env, { repoRoot: path.join(home, '.gemini', 'workstation') }), /this setup is inside .*Nothing was changed/);
  for (const [file, text] of Object.entries(files)) assert.equal(fs.readFileSync(file, 'utf8'), text);
});
