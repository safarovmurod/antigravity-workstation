'use strict';
const fs = require('node:fs'), path = require('node:path');
const { stripJsonComments } = require('../lib/jsonc');
const root = path.resolve(__dirname, '..');
function scan(text) {
  JSON.parse(stripJsonComments(text));
  let position = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const duplicates = [], empty = [];
  const lines = [0];
  for (let index = 0; index < text.length; index++) if (text[index] === '\n') lines.push(index + 1);
  function lineAt(index) {
    let low = 0, high = lines.length;
    while (low < high) { const middle = (low + high) >>> 1; if (lines[middle] <= index) low = middle + 1; else high = middle; }
    return low;
  }
  function space() {
    while (position < text.length) {
      if (/\s/.test(text[position])) { position++; continue; }
      if (text.slice(position, position + 2) === '//') { position += 2; while (position < text.length && text[position] !== '\n') position++; continue; }
      if (text.slice(position, position + 2) === '/*') { const end = text.indexOf('*/', position + 2); if (end < 0) throw new Error('Unterminated JSON comment'); position = end + 2; continue; }
      break;
    }
  }
  function string() {
    const start = position++;
    while (position < text.length) {
      if (text[position] === '\\') { position += 2; continue; }
      if (text[position++] === '"') return JSON.parse(text.slice(start, position));
    }
    throw new Error('Unterminated JSON string');
  }
  function value(location) {
    space();
    if (text[position] === '"') { string(); return; }
    if (text[position] === '{') {
      position++; space(); const seen = new Map(); let count = 0;
      while (text[position] !== '}') {
        const start = position, key = string(); space();
        if (text[position++] !== ':') throw new Error('Expected property colon');
        const child = location + '[' + JSON.stringify(key) + ']';
        if (seen.has(key)) duplicates.push({ path: child, firstLine: seen.get(key), line: lineAt(start) });
        else seen.set(key, lineAt(start));
        count++; value(child); space();
        if (text[position] !== ',') break;
        position++; space();
      }
      if (text[position++] !== '}') throw new Error('Expected closing object');
      if (!count) empty.push({ path: location, type: 'object' });
      return;
    }
    if (text[position] === '[') {
      position++; space(); let count = 0;
      while (text[position] !== ']') {
        value(location + '[' + count++ + ']'); space();
        if (text[position] !== ',') break;
        position++; space();
      }
      if (text[position++] !== ']') throw new Error('Expected closing array');
      if (!count) empty.push({ path: location, type: 'array' });
      return;
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(position));
    if (!match) throw new Error('Expected JSON value');
    position += match[0].length;
  }
  value('$'); space();
  if (position !== text.length) throw new Error('Unexpected content after JSON value');
  return { duplicates, empty };
}
function files(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = directory + '/' + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Linked audit input: ' + relative);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : files(relative);
    return /\.jsonc?$/.test(entry.name) ? [relative] : [];
  }).sort();
}
function audit() {
  const entries = [];
  for (const file of ['config', 'extensions'].flatMap(files)) {
    try { entries.push({ file, ...scan(fs.readFileSync(path.join(root, file), 'utf8')) }); }
    catch (error) { entries.push({ file, error: error.message, duplicates: [], empty: [] }); }
  }
  return { scope: 'Source config and local extension JSON/JSONC only; not private user settings or proof of runtime support.',
    files: entries.length, invalid: entries.filter(entry => entry.error), duplicates: entries.flatMap(entry => entry.duplicates.map(item => ({ file: entry.file, ...item }))),
    empty: entries.flatMap(entry => entry.empty.map(item => ({ file: entry.file, ...item }))) };
}
function inventoryValues(file, rootValue) {
  const entries = [];
  function visit(value, pointer) {
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const children = value && typeof value === 'object' ? Object.entries(value) : [];
    entries.push({ file, pointer, type, ...(type === 'array' || type === 'object' ? { entries: children.length } : {}),
      runtimeValidation: 'NOT ASSESSED BY INVENTORY' });
    for (const [key, child] of children) visit(child, pointer + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'));
  }
  visit(rootValue, '');
  return entries;
}
function inventory() {
  const summary = audit();
  if (summary.invalid.length || summary.duplicates.length) throw new Error('Cannot inventory invalid or duplicate-key configuration');
  const entries = [];
  const sourceFiles = ['config', 'extensions'].flatMap(files);
  for (const file of sourceFiles) entries.push(...inventoryValues(file, JSON.parse(stripJsonComments(fs.readFileSync(path.join(root, file), 'utf8')))));
  return { scope: 'Source JSON/JSONC values; paths and types are static inventory, not proof of host support or runtime behavior. Personal profiles and non-JSON configuration are excluded.',
    files: sourceFiles.length, values: entries.length, entries };
}
if (require.main === module) {
  if (process.argv.includes('--inventory')) {
    const { entries, ...summary } = inventory();
    console.log(JSON.stringify(summary, null, 2).slice(0, -2) + ',\n  "entries": [\n' + entries.map(entry => '    ' + JSON.stringify(entry)).join(',\n') + '\n  ]\n}');
  }
  else {
    const report = audit(); console.log(JSON.stringify(report, null, 2));
    if (report.invalid.length || report.duplicates.length) process.exitCode = 1;
  }
}
module.exports = { scan, audit, inventoryValues, inventory };
