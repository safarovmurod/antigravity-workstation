'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const repository = path.resolve(__dirname, '..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const protectedComment = /@(?:license|preserve|ts-|jsx)|copyright|licen[cs]e|sourceMappingURL|sourceURL|eslint|istanbul|\bc8\b|jshint|jscs|webpack|__PURE__|__NO_SIDE_EFFECTS__|vite-ignore|prettier-ignore|^\s*[!#]|@?satisfies|@?type\b|@?typedef|@?param|@?returns?/i;
function files(directory) {
  return fs.readdirSync(path.join(repository, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = directory + '/' + entry.name;
    if (entry.name === 'node_modules') return [];
    if (entry.isSymbolicLink()) throw new Error('Linked source is not eligible: ' + relative);
    return entry.isDirectory() ? files(relative) : /\.(?:cjs|mjs|js)$/.test(entry.name) ? [relative] : [];
  });
}
function normalized(ast) { return JSON.stringify(ast, (key, value) => ['start', 'end', 'loc', 'range'].includes(key) ? undefined
  : typeof value === 'bigint' ? { bigintValue: value.toString() } : value); }
function isProtectedComment(original, comment) {
  return original.slice(comment.start, comment.end).startsWith('#!') || protectedComment.test(comment.value);
}
function plan(parser) {
  const rows = [];
  for (const file of ['bin', 'lib', 'scripts', 'extensions', 'tests'].flatMap(files).sort()) {
    const original = fs.readFileSync(path.join(repository, file), 'utf8');
    const comments = [], options = { ecmaVersion: 'latest', sourceType: file.endsWith('.mjs') ? 'module' : 'script', allowHashBang: true };
    const before = parser.parse(original, { ...options, onComment: comments });
    const preserved = comments.filter(comment => isProtectedComment(original, comment));
    const removed = comments.filter(comment => !preserved.includes(comment));
    if (!removed.length) continue;
    let next = original;
    for (const comment of [...removed].reverse()) {
      const breaks = original.slice(comment.start, comment.end).replace(/[^\r\n]/g, '');
      const replacement = breaks || ' ';
      next = next.slice(0, comment.start) + replacement + next.slice(comment.end);
    }
    const changedLines = new Set();
    for (const comment of removed) {
      const first = original.slice(0, comment.start).split('\n').length - 1;
      const count = original.slice(comment.start, comment.end).split('\n').length;
      for (let index = first; index < first + count; index++) changedLines.add(index);
    }
    next = next.split('\n').map((line, index) => changedLines.has(index) ? line.replace(/[ \t]+(?=\r?$)/, '') : line)
      .filter((line, index) => !changedLines.has(index) || line.trim()).join('\n');
    assert.equal(normalized(parser.parse(next, options)), normalized(before), 'AST changed: ' + file);
    rows.push({ file, original, next, mode: fs.statSync(path.join(repository, file)).mode & 0o777, removed: removed.length,
      preserved: preserved.map(comment => ({ line: original.slice(0, comment.start).split('\n').length,
        reason: 'License, hashbang, tooling/compiler annotation or runtime-sensitive directive', text: comment.value.slice(0, 200) })) });
  }
  return rows;
}
function main(args) {
  const parserDirectory = args[args.indexOf('--parser') + 1];
  if (!args.includes('--parser') || !parserDirectory || !path.isAbsolute(parserDirectory)) throw new Error('Supply an explicit verified Acorn 8.15.0 package directory with --parser');
  const manifest = JSON.parse(fs.readFileSync(path.join(parserDirectory, 'package.json')));
  if (manifest.name !== 'acorn' || manifest.version !== '8.15.0') throw new Error('Expected verified Acorn 8.15.0');
  const rows = plan(require(parserDirectory));
  if (!args.includes('--apply')) return console.log(JSON.stringify(rows.map(({ original, next, ...row }) => row), null, 2));
  const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-owned-comments-'));
  for (const row of rows) {
    const destination = path.join(backup, row.file); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, row.original);
  }
  const changed = [];
  try {
    for (const row of rows) {
      const file = path.join(repository, row.file);
      if (fs.readFileSync(file, 'utf8') !== row.original) throw new Error('Concurrent source edit: ' + row.file);
      const temporary = file + '.' + crypto.randomUUID() + '.tmp';
      fs.writeFileSync(temporary, row.next, { mode: row.mode }); fs.renameSync(temporary, file); changed.push(row);
    }
  } catch (error) {
    for (const row of changed.reverse()) fs.writeFileSync(path.join(repository, row.file), row.original);
    throw error;
  }
  const report = { parser: 'Acorn 8.15.0', backup, astEquivalent: true,
    scope: 'Owned JavaScript/CommonJS/ES modules in bin/lib/scripts/extensions/tests. Vendored resources, PowerShell and runtime strings excluded; no claim that the entire project has zero comments.',
    files: rows.map(row => ({ file: row.file, beforeSha256: sha(row.original), afterSha256: sha(row.next),
      removed: row.removed, preserved: row.preserved })) };
  fs.writeFileSync(path.join(repository, 'docs/OWNED-COMMENT-CLEANUP.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ files: rows.length, removed: rows.reduce((sum, row) => sum + row.removed, 0), backup, astEquivalent: true }));
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { plan, protectedComment, isProtectedComment };
