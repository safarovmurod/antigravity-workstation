'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { getEnvironmentPaths } = require('../../lib/paths');
const { inspectResources } = require('../../lib/system-resources');

function verifyInstallationPaths(expected, report) {
  const probes = [];
  let detected;
  try {
    detected = getEnvironmentPaths({}, {
      execFileSync(command, args, options) {
        const label = command === 'powershell.exe'
          ? (args.at(-1).includes('Get-Process') ? 'running-editor' : 'registered-editor')
          : (args.includes('git.exe') ? 'git-path' : 'editor-path');
        try {
          const output = execFileSync(command, args, options);
          probes.push({ probe: label, succeeded: true, output: String(output).trim().slice(0, 12000) });
          return output;
        } catch (error) {
          probes.push({ probe: label, succeeded: false, code: error.code, signal: error.signal,
            status: error.status, message: error.message.slice(0, 2000) });
          throw error;
        }
      },
    });
    assert.ok(detected.ideRoot, 'Production discovery returned no registered Antigravity installation');
    assert.equal(path.resolve(detected.ideRoot).toLowerCase(), path.resolve(expected).toLowerCase(),
      'Registered installation must be found without a default folder or PATH');
    assert.ok(fs.existsSync(detected.cliPath), 'Detected CLI must exist');
    assert.equal(detected.settingsJson, path.join(process.env.APPDATA, 'Antigravity IDE', 'User/settings.json'));
    assert.equal(detected.extensionsDir, path.join(process.env.USERPROFILE, '.antigravity-ide/extensions'));
    const resources = inspectResources(detected);
    fs.writeFileSync(report, JSON.stringify({ passed: true, architecture: process.arch, ideRoot: detected.ideRoot,
      cliPath: detected.cliPath, settingsJson: detected.settingsJson, extensionsDir: detected.extensionsDir,
      actualDrive: path.parse(detected.ideRoot).root, nestedUnicodeFolder: true, resources, probes }, null, 2));
  } catch (error) {
    fs.writeFileSync(report, JSON.stringify({ passed: false, architecture: process.arch,
      expectedIdeRoot: expected, detected, error: error.message, stack: error.stack, probes }, null, 2));
    throw error;
  }
}

if (require.main === module) {
  try { verifyInstallationPaths(process.argv[2], process.argv[3]); }
  catch (error) { console.error(error.stack); process.exitCode = 1; }
}

module.exports = { verifyInstallationPaths };
