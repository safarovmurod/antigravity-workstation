'use strict';

const { execSync, spawnSync } = require('node:child_process');

function runVerifiedInstall(action, verify, options = {}) {
  const { log = console.log,
    wait = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } = options;
  let reason;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = action();
      if (result?.error || result?.status !== 0) throw new Error(result?.error?.message || 'CLI exited with code ' + result?.status);
      if (!verify()) throw new Error('Installed registration/source verification failed');
      return { success: true, attempts: attempt };
    } catch (error) {
      reason = error.message;
      if (attempt < 3) {
        log(`  Local extension attempt ${attempt}/3 failed: ${reason}; retrying the verified VSIX...`);
        wait(attempt * 500);
      }
    }
  }
  throw new Error('Local extension did not verify after 3 installation attempts: ' + reason);
}

function installVerifiedExtension(cliPath, artifact, verify, options = {}) {
  const { platform = process.platform, run = spawnSync, exec = execSync, timeout = 180000 } = options;
  const windowsCommand = platform === 'win32' && /\.cmd$/i.test(cliPath);
  if (windowsCommand && /["%\r\n]/.test(cliPath + artifact)) throw new Error('Unsupported CLI/package path characters');
  return runVerifiedInstall(() => windowsCommand
    ? (exec(`"${cliPath}" --install-extension "${artifact}" --force`, { stdio: 'inherit', windowsHide: true, timeout }), { status: 0 })
    : run(cliPath, ['--install-extension', artifact, '--force'], { stdio: 'inherit', windowsHide: true, timeout }), verify, options);
}

module.exports = { installVerifiedExtension, runVerifiedInstall };
