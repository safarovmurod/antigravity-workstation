'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const MIB = 1024 * 1024;

function typeScriptMemoryLimit(totalBytes = os.totalmem()) {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return 1024;
  return Math.max(256, Math.min(4096, Math.floor(totalBytes / (4 * 256 * MIB)) * 256));
}

function inspectResources(envPaths, runtime = {}) {
  const totalBytes = (runtime.totalmem || os.totalmem)();
  const freeBytes = (runtime.freemem || os.freemem)();
  const exists = runtime.existsSync || fs.existsSync;
  const statfs = runtime.statfsSync || fs.statfsSync;
  const warnings = [], storage = [];
  if (Number.isFinite(freeBytes) && freeBytes < 512 * MIB) {
    warnings.push('Less than 512 MiB RAM is currently available; close unused applications before installation.');
  }
  const locations = [
    ['Temporary downloads', (runtime.tmpdir || os.tmpdir)()],
    ['Editor profile', envPaths.userSettingsDir],
    ['Extensions', envPaths.extensionsDir],
    ['Backups', envPaths.backupsDir],
  ];
  const inspected = new Set();
  for (const [label, destination] of locations) {
    if (!destination) continue;
    let directory = path.resolve(destination);
    while (!exists(directory) && path.dirname(directory) !== directory) directory = path.dirname(directory);
    if (inspected.has(directory)) continue;
    inspected.add(directory);
    try {
      const info = statfs(directory, { bigint: true });
      const available = BigInt(info.bavail) * BigInt(info.bsize);
      if (available <= 0n) throw new Error('No available disk space for ' + label + ': ' + destination);
      storage.push({ label, destination, availableMiB: Number(available / BigInt(MIB)) });
      if (available < 1024n * BigInt(MIB)) warnings.push('Low available disk space for ' + label + ': ' + destination + '; extension downloads, unpacking and backups may need more.');
    } catch (error) {
      if (error.message.startsWith('No available disk space')) throw error;
      warnings.push('Available disk space could not be determined for ' + label + ': ' + destination);
    }
  }
  return { totalMemoryMiB: Number.isFinite(totalBytes) ? Math.round(totalBytes / MIB) : null,
    availableMemoryMiB: Number.isFinite(freeBytes) ? Math.round(freeBytes / MIB) : null,
    typeScriptMemoryMiB: typeScriptMemoryLimit(totalBytes), storage, warnings };
}

function preflightResources(envPaths, options = {}) {
  const report = inspectResources(envPaths, options.runtime);
  const log = options.log || console.log;
  log(`  RAM: ${report.totalMemoryMiB ?? 'unknown'} MiB total; ${report.availableMemoryMiB ?? 'unknown'} MiB available. TypeScript heap limit: ${report.typeScriptMemoryMiB} MiB.`);
  for (const volume of report.storage) log(`  ${volume.label}: ${volume.availableMiB} MiB disk space available.`);
  for (const warning of report.warnings) log('  [WARNING] ' + warning);
  return report;
}

module.exports = { typeScriptMemoryLimit, inspectResources, preflightResources };
