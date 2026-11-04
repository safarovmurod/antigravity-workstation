import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { runInstaller } = require('../lib/installer');
const { getEnvironmentPaths } = require('../lib/paths');
const repoRoot = path.resolve(import.meta.dirname, '..');

for (const [name, damage] of [
  ['empty agent', source => fs.writeFileSync(path.join(source, 'agents/gsd-planner.md'), '')],
  ['whitespace guide', source => fs.writeFileSync(path.join(source, 'resources/guides/design.md'), ' \r\n\t')],
  ['missing agents directory', source => fs.rmSync(path.join(source, 'agents'), { recursive: true })],
  ['missing skill entrypoint', source => fs.unlinkSync(path.join(source, 'skills/agent-browser/SKILL.md'))],
  ['modified runtime', source => fs.appendFileSync(path.join(source, 'resources/gsd-core/bin/gsd-tools.cjs'), '\n// damaged\n')],
  ['empty global instructions', source => fs.writeFileSync(path.join(source, 'rules/GEMINI.template.md'), '')],
]) {
  test('Damaged update preserves existing profile and backup tree: ' + name, t => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-integrity-'));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const source = path.join(base, 'source');
    const customRoots = { userProfile: path.join(base, 'profile'), gitBashPath: process.execPath };
    const env = getEnvironmentPaths(customRoots);
    const options = { repoRoot, customRoots, skipExtensions: true, skipFont: true,
      skipAgentBrowser: true, skipPermissions: true, log() {} };
    assert.equal(runInstaller(options).success, true);
    const snapshot = directory => {
      const result = {};
      function visit(folder) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
          const file = path.join(folder, entry.name);
          if (entry.isDirectory()) visit(file);
          else result[path.relative(directory, file)] = fs.readFileSync(file).toString('base64');
        }
      }
      visit(directory);
      return result;
    };
    const before = snapshot(customRoots.userProfile);
    for (const item of ['config', 'rules', 'resources', 'skills', 'scripts', 'agents', 'package.json']) {
      fs.cpSync(path.join(repoRoot, item), path.join(source, item), { recursive: true,
        filter: file => !file.split(path.sep).includes('node_modules') });
    }
    damage(source);
    assert.throws(() => runInstaller({ ...options, repoRoot: source }), /source is incomplete or damaged/);
    assert.deepEqual(snapshot(customRoots.userProfile), before, 'No profile, payload or backup changes permitted');
    assert.ok(fs.statSync(path.join(env.geminiConfigDir, 'agents/gsd-planner.md')).size > 0);
  });
}

test('Damaged Git Panel media aborts an update before changing personal settings or backups', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-panel-integrity-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const source = path.join(base, 'source');
  const customRoots = { userProfile: path.join(base, 'profile'), gitBashPath: process.execPath };
  const env = getEnvironmentPaths(customRoots);
  const options = { repoRoot, customRoots, skipExtensions: true, skipFont: true, skipAgentBrowser: true, skipPermissions: true, log() {} };
  assert.equal(runInstaller(options).success, true);
  const settings = JSON.parse(fs.readFileSync(env.settingsJson, 'utf8'));
  settings['personal.example'] = { nested: 'preserve' };
  fs.writeFileSync(env.settingsJson, JSON.stringify(settings));
  const snapshot = directory => {
    const result = {};
    function visit(folder) {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) visit(file);
        else result[path.relative(directory, file)] = fs.readFileSync(file).toString('base64');
      }
    }
    visit(directory);
    return result;
  };
  const before = snapshot(customRoots.userProfile);
  for (const item of ['config', 'rules', 'resources', 'skills', 'scripts', 'agents', 'extensions', 'package.json', 'LICENSE']) {
    fs.cpSync(path.join(repoRoot, item), path.join(source, item), { recursive: true,
      filter: file => !file.split(path.sep).includes('node_modules') });
  }
  fs.appendFileSync(path.join(source, 'extensions/git-branch-panel/media/current-branch.gif'), 'damaged');
  assert.throws(() => runInstaller({ ...options, repoRoot: source, skipExtensions: false }), /Git Branch Panel source checksum mismatch/);
  assert.deepEqual(snapshot(customRoots.userProfile), before, 'Rejected update must not alter settings, owned data, or backups');
});
