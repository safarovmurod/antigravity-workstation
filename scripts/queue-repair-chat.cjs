'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const repair = require('../extensions/workstation-stability/repair-chat.cjs');
const { getEnvironmentPaths } = require('../lib/paths');
const repoRoot = path.resolve(__dirname, '..');
try {
  const directory = path.join(getEnvironmentPaths().geminiConfigDir, 'workstation-setup/repair-chat');
  const args = process.argv.slice(2);
  let result;
  if (args.length === 1 && args[0] === '--doctor-passed') {
    result = repair.retireAfterDoctor(directory);
  } else if (args.length === 2 && args[0] === '--verify') {
    result = repair.verifyRepair(directory, repoRoot, args[1], () => spawnSync(process.execPath,
      [path.join(repoRoot, 'bin/workstation-setup.js'), 'doctor'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 512 * 1024 }));
  } else if (args.length === 2 && args[0] === '--queue' && path.isAbsolute(args[1])) {
    result = repair.queueRepair(directory, repair.read(args[1], 256 * 1024), repoRoot);
  } else throw new Error('Use --queue <absolute setup-failure.json> or --verify <request-id>');
  console.log(JSON.stringify(result));
  process.exit(result.queued || result.repairVerified || ['idle', 'superseded'].includes(result.state) ? 0 : 1);
} catch (error) { console.error(repair.redact(error.message, 2048)); process.exit(1); }
