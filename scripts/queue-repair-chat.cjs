'use strict';
const fs = require('node:fs');
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
    const report = repair.read(args[1], 256 * 1024);
    if (report?.stage === 'doctor') {
      // Include failed checks from our own bounded/redacted log, rather than
      // only the final summary lines. Never follow a report to another file.
      const log = path.join(path.dirname(path.resolve(args[1])), 'setup-doctor.log');
      if (typeof report.outputLog !== 'string' || path.resolve(report.outputLog) !== log) throw new Error('Unexpected Doctor diagnostic path');
      const stat = fs.lstatSync(log);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 + 256) throw new Error('Invalid Doctor diagnostic log');
      const failed = fs.readFileSync(log, 'utf8').split(/\r?\n/).filter(line => /^\s*\[[\u2717\u00d7]\]/u.test(line));
      if (failed.length) report.failure = failed.join('\n');
    }
    result = repair.queueRepair(directory, report, repoRoot);
  } else throw new Error('Use --queue <absolute setup-failure.json> or --verify <request-id>');
  console.log(JSON.stringify(result));
  process.exit(result.queued || result.repairVerified || ['idle', 'superseded'].includes(result.state) ? 0 : 1);
} catch (error) { console.error(repair.redact(error.message, 2048)); process.exit(1); }
