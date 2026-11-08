'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertHosted, ownedDirectory } = require('./windows-native-smoke/full-catalog.cjs');
function main() {
  assertHosted();
  assert.ok(process.env.RUNNER_TEMP, 'RUNNER_TEMP required');
  const directory = ownedDirectory(path.join(process.env.RUNNER_TEMP, 'workstation-browser-mcp-' + Date.now()), process.env.RUNNER_TEMP);
  const home = path.join(directory, 'User with spaces');
  const prefix = path.join(directory, 'npm-prefix');
  const artifacts = path.join(directory, 'evidence');
  fs.mkdirSync(artifacts, { recursive: true });
  const env = { ...process.env, USERPROFILE: home, HOME: home,
    APPDATA: path.join(home, 'AppData/Roaming'), LOCALAPPDATA: path.join(home, 'AppData/Local'),
    npm_config_prefix: prefix, NPM_CONFIG_PREFIX: prefix, PATH: prefix + path.delimiter + process.env.PATH };
  for (const key of Object.keys(env)) if (key.startsWith('AGENT_BROWSER_')) delete env[key];
  const envPaths = { userProfile: home, localAppData: env.LOCALAPPDATA, backupsDir: path.join(home, 'backups') };
  let report;
  try {
    const { ensureAgentBrowser } = require('../lib/installer');
    const version = require('../skills/agent-browser/metadata.json').version;
    const verified = ensureAgentBrowser({ env, envPaths, version });
    assert.equal(verified.verified, true);
    const repeat = ensureAgentBrowser({ env, envPaths, version });
    assert.equal(repeat.verified, true);
    assert.equal(repeat.executable, verified.executable);
    const result = spawnSync(process.execPath, ['--test', path.join(__dirname, 'test-mcp-runtime.mjs')], {
      encoding: 'utf8', timeout: 180000, windowsHide: true,
      env: { ...env, WORKSTATION_TEST_CHROME: verified.executable },
    });
    fs.writeFileSync(path.join(artifacts, 'mcp-tools.log'), (result.stdout || '') + (result.stderr || ''));
    assert.ifError(result.error);
    assert.equal(result.status, 0, 'Real MCP tool calls failed: ' + result.stdout + result.stderr);
    report = { passed: true, architecture: process.arch, browser: verified,
      repeatVerified: true, mcp: 'Three real stdio servers and tool calls, including an isolated Chromium page and DOM read', personalProfileChanged: false };
  } catch (error) {
    report = { passed: false, architecture: process.arch, error: error.stack };
    throw error;
  } finally {
    fs.writeFileSync(path.join(artifacts, 'result.json'), JSON.stringify(report, null, 2));
    console.log('Evidence: ' + artifacts);
  }
}
if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(error.stack);
    console.log('::error title=Windows browser and MCP::' + String(error.stack).slice(-12000).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A'));
    process.exitCode = 1;
  }
}
module.exports = { main };
