'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

function ensureJetBrainsMono(options = {}) {
  const { dryRun = false, log = console.log, platform = process.platform,
    repoRoot = path.resolve(__dirname, '..'), run = spawnSync } = options;
  if (platform !== 'win32') return { installed: false, skipped: true, reason: 'Automatic font installation requires Windows' };
  const manifestPath = path.join(repoRoot, 'config', 'font.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.family !== 'JetBrains Mono' || !/^\d+\.\d+$/.test(manifest.version)
    || manifest.url !== `https://github.com/JetBrains/JetBrainsMono/releases/download/v${manifest.version}/JetBrainsMono-${manifest.version}.zip`
    || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Array.isArray(manifest.files) || manifest.files.length !== 16
    || new Set(manifest.files.map(file => file.name)).size !== 16
    || manifest.files.some(file => !/^JetBrainsMono-[A-Za-z]+\.ttf$/.test(file.name) || !/^[a-f0-9]{64}$/.test(file.sha256))) {
    throw new Error('Invalid pinned font manifest');
  }
  if (dryRun) {
    log(`  [DRY-RUN] Would verify bundled JetBrains Mono ${manifest.version} (official download fallback for older packages), install 16 verified TTFs for the current Windows user and register the font.`);
    return { installed: false, dryRun: true, version: manifest.version };
  }
  log(`  JetBrains Mono ${manifest.version}: checking installed and bundled files; download fallback only if the bundle is absent.`);
  const errorReportPath = path.join(os.tmpdir(), `mansur-font-error-${randomUUID()}.json`);
  try {
    const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(repoRoot, 'scripts', 'install-font.ps1'), '-ManifestPath', manifestPath,
      '-ErrorReportPath', errorReportPath],
    { stdio: 'inherit', windowsHide: true,
      // PowerShell 7 can pass a PSModulePath that hides Windows PowerShell 5.1 cmdlets.
      env: { ...process.env, PSModulePath: path.win32.join(process.env.SystemRoot || 'C:\\Windows',
        'System32', 'WindowsPowerShell', 'v1.0', 'Modules') } });
    if (result.error || result.status !== 0) {
      let detail = '';
      try {
        const report = JSON.parse(fs.readFileSync(errorReportPath, 'utf8').replace(/^\uFEFF/, ''));
        if (typeof report.stage === 'string' && typeof report.message === 'string') {
          detail = `: ${report.stage}: ${report.message}`;
        }
      } catch (_) { /* A launch failure may not create a report. */ }
      throw new Error('JetBrains Mono installation/verification failed'
        + (result.error ? ': ' + result.error.message : ` (exit ${result.status})`) + detail);
    }
  } finally {
    fs.rmSync(errorReportPath, { force: true });
  }
  return { installed: true, version: manifest.version };
}

module.exports = { ensureJetBrainsMono };
