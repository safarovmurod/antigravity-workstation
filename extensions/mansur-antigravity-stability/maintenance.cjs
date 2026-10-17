'use strict';

// Only exact, audited vendor releases are patched. New releases require review.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');

const TARGETS = [
  {
    id: 'anteprimorac.html-end-tag-labels',
    version: '1.0.0',
    file: 'out/closing-labels-decorations.js',
    originalHash: '4f535d1eb0155885b9d8d342068835a18d87763dbbcb7b56875f19cda0fc3331',
    patchedHash: '5ae6874171381ea28c606587801f380a03cbf3eb9377e82337de18bc40abe652',
  },
  {
    id: 'formulahendry.auto-rename-tag',
    version: '0.1.10',
    file: 'packages/extension/dist/extensionMain.js',
    originalHash: '0c39a8e3b86d8ddff90a27b32b8380b3fdd2ec5edc16543a178e058893710ec2',
    patchedHash: '08a79ad47b6c42a92970be3c05927a0bd10ff6ad42b15a0f9379fe41d5fc0a7e',
  },
];

function digest(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function replaceOnce(source, before, after) {
  if (source.split(before).length - 1 !== 1) throw new Error('patch_anchor_mismatch');
  return source.replace(before, after);
}

function patchSource(target, source) {
  if (target.id === 'anteprimorac.html-end-tag-labels') {
    source = replaceOnce(source, '        const ast = babelParser.parse(input.getText(), {',
      '        let ast;\n        try {\n            ast = babelParser.parse(input.getText(), {');
    source = replaceOnce(source, '            plugins,\n        });',
      '            plugins,\n            });\n        }\n        catch (error) {\n            if (error instanceof SyntaxError) {\n                return [];\n            }\n            throw error;\n        }');
    source = replaceOnce(source, '    update() {\n        if (!this.activeEditor) {',
      '    update() {\n        if (!this.activeEditor || this.activeEditor.document.isClosed) {');
    source = replaceOnce(source, '    dispose() {\n        this.activeEditor = undefined;',
      '    dispose() {\n        if (this.updateTimeout) {\n            clearTimeout(this.updateTimeout);\n            this.updateTimeout = undefined;\n        }\n        this.activeEditor = undefined;');
  } else if (target.id === 'formulahendry.auto-rename-tag') {
    source = replaceOnce(source, 'const s=e.document.getText(),m=[];let v=0;',
      'const s=e.document.getText(),m=[];if(e.contentChanges.some(t=>t.range.start.line<0||t.range.start.line>=e.document.lineCount)){d={};c=s;return}let v=0;');
  } else {
    throw new Error('unsupported_target');
  }
  return Buffer.from(source, 'utf8');
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function readJson(file) {
  if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error('metadata_size_limit');
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function entryFor(index, id) {
  const entries = index.filter((entry) => entry.identifier && String(entry.identifier.id).toLowerCase() === id);
  if (entries.length === 0) return { absent: true };
  if (entries.length !== 1) return { problem: 'ambiguous_installed_entries' };
  const entry = entries[0];
  const location = entry.relativeLocation;
  if (typeof location !== 'string' || !location || location === '.' || location === '..' || /[/\\]/.test(location) || path.isAbsolute(location)) {
    return { problem: 'unsafe_relative_location' };
  }
  if (!location.toLowerCase().startsWith(id + '-')) return { problem: 'extension_folder_mismatch' };
  return { entry, location };
}

function safeFailure(target, reason, error) {
  return { id: target.id, status: 'needs_review', reason, errorCode: error && (error.code || error.name) };
}

function inspectTarget(target, index, options, root) {
  const selected = entryFor(index, target.id);
  if (selected.absent) return { id: target.id, status: 'not_installed' };
  if (selected.problem) return safeFailure(target, selected.problem);
  const directory = path.join(root, selected.location);
  let temporary;
  try {
    if (fs.lstatSync(directory).isSymbolicLink()) return safeFailure(target, 'extension_directory_is_link');
    const realDirectory = fs.realpathSync(directory);
    if (!isInside(root, realDirectory)) return safeFailure(target, 'extension_directory_outside_root');
    const manifest = readJson(path.join(realDirectory, 'package.json'));
    const manifestId = (String(manifest.publisher) + '.' + String(manifest.name)).toLowerCase();
    if (manifestId !== target.id) return safeFailure(target, 'manifest_id_mismatch');
    if (manifest.version !== target.version || selected.entry.version !== target.version) {
      return { id: target.id, status: 'needs_review', reason: 'unknown_version', version: manifest.version };
    }
    const file = path.join(realDirectory, target.file);
    if (fs.lstatSync(file).isSymbolicLink() || !isInside(realDirectory, fs.realpathSync(file))) {
      return safeFailure(target, 'source_path_is_link_or_outside_extension');
    }
    if (fs.statSync(file).size > 2 * 1024 * 1024) return safeFailure(target, 'source_size_requires_review');
    const original = fs.readFileSync(file);
    const hash = digest(original);
    if (hash === target.patchedHash) return { id: target.id, version: target.version, status: 'protected', hash };
    if (hash !== target.originalHash) return { id: target.id, version: target.version, status: 'needs_review', reason: 'unknown_source_hash', hash };
    if (!options.repair) return { id: target.id, version: target.version, status: 'repair_available', hash };
    const patched = patchSource(target, original.toString('utf8'));
    if (digest(patched) !== target.patchedHash) return safeFailure(target, 'candidate_hash_mismatch');
    // Parse only: vendor source is never executed by this helper.
    new vm.Script(patched.toString('utf8'), { filename: file });
    fs.mkdirSync(options.backupDir, { recursive: true });
    const backup = path.join(options.backupDir, target.id + '-' + target.version + '-' + target.originalHash.slice(0, 12) + '.js');
    if (fs.existsSync(backup)) {
      if (fs.lstatSync(backup).isSymbolicLink() || digest(fs.readFileSync(backup)) !== target.originalHash) {
        return safeFailure(target, 'backup_conflict');
      }
    } else {
      fs.writeFileSync(backup, original, { flag: 'wx', mode: 0o600 });
    }
    temporary = path.join(realDirectory, target.file + '.mansur-maintenance-' + process.pid + '-' + crypto.randomBytes(6).toString('hex') + '.tmp');
    const temporaryHandle = fs.openSync(temporary, 'wx', fs.statSync(file).mode);
    try {
      fs.writeFileSync(temporaryHandle, patched);
      fs.fsyncSync(temporaryHandle);
    } finally {
      fs.closeSync(temporaryHandle);
    }
    // Testing seam simulates an updater before the final precondition check.
    if (options.beforeReplace) options.beforeReplace({ target, file });
    const currentIndex = readJson(path.join(root, 'extensions.json'));
    const currentEntry = entryFor(currentIndex, target.id);
    const currentManifest = readJson(path.join(realDirectory, 'package.json'));
    if (currentEntry.problem || currentEntry.absent || currentEntry.location !== selected.location ||
      currentEntry.entry.version !== target.version || currentManifest.version !== target.version ||
      digest(fs.readFileSync(file)) !== target.originalHash) {
      return safeFailure(target, 'changed_during_scan');
    }
    fs.renameSync(temporary, file);
    temporary = undefined;
    if (digest(fs.readFileSync(file)) !== target.patchedHash) return safeFailure(target, 'post_write_hash_mismatch');
    return { id: target.id, version: target.version, status: 'repaired', hash: target.patchedHash, backup, reloadRecommended: true };
  } catch (error) {
    return safeFailure(target, 'inspection_or_write_failed', error);
  } finally {
    if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function runMaintenance(input = {}) {
  const options = {
    extensionsDir: input.extensionsDir || path.join(os.homedir(), '.antigravity-ide', 'extensions'),
    backupDir: input.backupDir || path.join(os.homedir(), '.gemini', 'backups', 'antigravity-extension-maintenance'),
    repair: input.repair === true,
    beforeReplace: input.beforeReplace,
  };
  let targets;
  if (!fs.existsSync(options.extensionsDir)) {
    targets = TARGETS.map((target) => ({ id: target.id, status: 'not_installed' }));
  } else {
    try {
      const root = fs.realpathSync(options.extensionsDir);
      const index = readJson(path.join(root, 'extensions.json'));
      if (!Array.isArray(index)) throw new Error('invalid_extensions_index');
      targets = TARGETS.map((target) => inspectTarget(target, index, options, root));
    } catch (error) {
      targets = TARGETS.map((target) => safeFailure(target, 'extensions_index_unavailable_or_invalid', error));
    }
  }
  const changed = targets.some((target) => target.status === 'repaired');
  const reviewRequired = targets.some((target) => target.status === 'needs_review');
  return { mode: options.repair ? 'repair' : 'status', changed, reviewRequired, reloadRecommended: changed, targets };
}

module.exports = { TARGETS, digest, patchSource, runMaintenance };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node maintenance.cjs [--repair] [--extensions-dir PATH] [--backup-dir PATH]');
    console.log('Default is read-only status. Only exact known versions/hashes are repaired. New vendor releases require review.');
  } else {
    const options = { repair: args.includes('--repair') };
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--repair') continue;
      const key = args[index] === '--extensions-dir' ? 'extensionsDir' : args[index] === '--backup-dir' ? 'backupDir' : undefined;
      if (!key || !args[index + 1] || args[index + 1].startsWith('--')) {
        console.error('Invalid arguments; use --help.');
        process.exitCode = 1;
        break;
      }
      options[key] = args[++index];
    }
    if (!process.exitCode) {
      const result = runMaintenance(options);
      console.log(JSON.stringify(result, null, 2));
      if (result.reviewRequired) process.exitCode = 2;
    }
  }
}
