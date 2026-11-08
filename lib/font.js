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
  const errorReportPath = path.join(os.tmpdir(), `workstation-font-error-${randomUUID()}.json`);
  let staged;
  try {
    if (path.join(repoRoot, 'scripts/install-font.ps1').length >= 200) {
      const files = ['scripts/install-font.ps1', 'config/font.json'];
      if (fs.existsSync(path.join(repoRoot, 'resources/jetbrains-mono/ttf'))) files.push('resources/jetbrains-mono/ttf');
      staged = require('./script-staging').stageScriptFiles(repoRoot, files, 'workstation-font-');
    }
    const executionRoot = staged?.root || repoRoot;
    const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(executionRoot, 'scripts', 'install-font.ps1'), '-ManifestPath', path.join(executionRoot, 'config/font.json'),
      '-ErrorReportPath', errorReportPath],
    { stdio: 'inherit', windowsHide: true,
      env: { ...process.env, PSModulePath: path.win32.join(process.env.SystemRoot || 'C:\\Windows',
        'System32', 'WindowsPowerShell', 'v1.0', 'Modules') } });
    if (result.error || result.status !== 0) {
      let detail = '';
      try {
        const report = JSON.parse(fs.readFileSync(errorReportPath, 'utf8').replace(/^\uFEFF/, ''));
        if (typeof report.stage === 'string' && typeof report.message === 'string') {
          detail = `: ${report.stage}: ${report.message}`;
        }
      } catch (_) {   }
      throw new Error('JetBrains Mono installation/verification failed'
        + (result.error ? ': ' + result.error.message : ` (exit ${result.status})`) + detail);
    }
  } finally {
    fs.rmSync(errorReportPath, { force: true });
    staged?.dispose();
  }
  return { installed: true, version: manifest.version };
}

// The other Aster Atelier families ship inside the extension. Setup registers
// the missing ones for the current Windows user from those pinned files, so a
// family picked in the studio works without a download.
function ensureAsterFonts(options = {}) {
  const { dryRun = false, log = console.log, platform = process.platform,
    repoRoot = path.resolve(__dirname, '..'), run = spawnSync } = options;
  if (platform !== 'win32') return { installed: [], skipped: true, reason: 'Automatic font installation requires Windows' };
  const root = path.join(repoRoot, 'extensions', 'aster-appearance');
  const fonts = JSON.parse(fs.readFileSync(path.join(root, 'fonts.json'), 'utf8'));
  const powershell = args => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args],
    { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  const listed = powershell(['-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; '
    + '(New-Object System.Drawing.Text.InstalledFontCollection).Families.Name | ConvertTo-Json -Compress']);
  if (listed.error || listed.status !== 0) throw new Error('Could not list installed fonts: ' + (listed.error?.message || listed.stderr));
  const names = new Set([].concat(JSON.parse(String(listed.stdout).replace(/^﻿/, '') || '[]')).map(name => String(name).toLowerCase()));
  const missing = fonts.filter(font => !names.has(font.family.toLowerCase()));
  if (dryRun) {
    log(`  [DRY-RUN] Would register ${missing.length} bundled Aster font families for the current Windows user.`);
    return { installed: [], dryRun: true, missing: missing.map(font => font.family) };
  }
  const { stageBundled } = require(path.join(root, 'font-service.cjs'));
  for (const font of missing) {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-font-'));
    try {
      stageBundled(root, font, stage);
      const result = powershell(['-File', path.join(root, 'install-font.ps1'), '-Stage', stage]);
      if (result.error || result.status !== 0) throw new Error(font.family + ' registration failed: ' + (result.error?.message || result.stderr || 'exit ' + result.status));
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
    log(`  Aster font registered: ${font.family}`);
  }
  log(`  Aster fonts: ${fonts.length - missing.length} already present, ${missing.length} registered from the bundle.`);
  return { installed: missing.map(font => font.family) };
}

module.exports = { ensureJetBrainsMono, ensureAsterFonts };
