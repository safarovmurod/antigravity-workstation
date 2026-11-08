'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// The workstation's own addon for the IDE window. workbench.html loads
// workstation-ui.js, which hides the two boxed lines the IDE draws across the
// editor ("Ctrl+L for Agent" on every empty line and "Explain and Fix Problem"
// on a line with an error; both shortcuts keep working) and applies
// workstation-ui.css live: Aster Atelier writes that file, and a change shows
// within a second, with no reload. The IDE's own code has no setting for either.
// Setup adds the addon while the IDE is closed, so it works from the first
// start; Workstation Stability puts it back after an IDE update.
const START = '<!-- workstation-ui:start -->';
const END = '<!-- workstation-ui:end -->';
const SCRIPT = 'workstation-ui.js';
const STYLE = 'workstation-ui.css';
const STYLE_HEADER = '/* Aster Atelier writes the workbench style here. */\n';
const BLOCK = START + '<script src="./' + SCRIPT + '"></script>' + END;
// Workstation Stability 1.3.26 and older appended the same addon to Jelly
// Cursor's script; it is removed there so the window runs it once.
const LEGACY_START = '/* workstation-ui:start */';
const LEGACY_END = '/* workstation-ui:end */';
const REFRESH_MS = 1000;

function script() {
  return ['/* Workstation interface addon: hidden hint lines and the live Aster Atelier style. */', '(() => {',
    "\tif (document.getElementById('workstation-ui-fixed')) return;",
    "\tconst fixed = document.createElement('style');",
    "\tfixed.id = 'workstation-ui-fixed';",
    '\tfixed.textContent = \'.monaco-editor [widgetid="antigravity.inlayHint"], .monaco-editor [widgetid="antigravity.markerHoverInlayHint"] { display: none !important; }\';',
    '\tdocument.head.appendChild(fixed);',
    "\tconst live = document.createElement('style');",
    "\tlive.id = 'workstation-ui-live';",
    '\tdocument.head.appendChild(live);',
    '\tlet last = null;',
    '\tasync function refresh() {',
    '\t\ttry {',
    "\t\t\tconst response = await fetch('" + STYLE + "?t=' + Date.now(), { cache: 'no-store' });",
    "\t\t\tconst text = response.ok ? await response.text() : '';",
    '\t\t\tif (text !== last) { last = text; live.textContent = text; }',
    '\t\t} catch {}',
    '\t}',
    '\trefresh();',
    "\tsetInterval(() => { if (document.visibilityState === 'visible') refresh(); }, " + REFRESH_MS + ');',
    '})();', ''].join('\n');
}

// appRoot is <IDE>/resources/app (vscode.env.appRoot).
function workbenchHtml(appRoot) {
  if (typeof appRoot !== 'string' || !appRoot) return null;
  for (const renderer of ['electron-browser', 'electron-sandbox']) {
    const file = path.join(appRoot, 'out', 'vs', 'code', renderer, 'workbench', 'workbench.html');
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function writeAtomic(file, text) {
  const temporary = path.join(path.dirname(file), '.' + path.basename(file) + '.' + process.pid + '-' + Date.now() + '.tmp');
  try { fs.writeFileSync(temporary, text); fs.renameSync(temporary, file); }
  catch (error) { try { fs.rmSync(temporary, { force: true }); } catch {} throw error; }
}
const read = file => { try { return fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('base64').replace(/=+$/, '');

// The IDE compares workbench.html with its product.json checksum and otherwise
// reports a "corrupt installation". The user chose to record the patched
// file's checksum: only a file the workstation or Jelly Cursor manages (our
// block, or the .jelly-cursor-backup Jelly keeps beside it) is refreshed, and
// only that single checksum entry is rewritten.
function product(html) {
  const out = path.resolve(html, '../../../../..');
  if (path.basename(out) !== 'out') return null;
  return { file: path.join(path.dirname(out), 'product.json'), key: path.relative(out, html).split(path.sep).join('/') };
}
function syncChecksum(html) {
  const text = read(html);
  if (text === null || (!text.includes(START) && !fs.existsSync(html + '.jelly-cursor-backup'))) return false;
  const target = product(html), json = target && read(target.file);
  if (!json) return false;
  const recorded = JSON.parse(json).checksums?.[target.key];
  if (typeof recorded !== 'string') return false;
  const actual = digest(fs.readFileSync(html));
  if (recorded === actual || json.split('"' + recorded + '"').length !== 2) return false;
  writeAtomic(target.file, json.replace('"' + recorded + '"', '"' + actual + '"'));
  return true;
}

// The block goes right before </html>, after the IDE's own scripts, and
// replaces an earlier copy of itself; other blocks (Jelly Cursor) stay.
function withBlock(text) {
  const start = text.indexOf(START), end = text.indexOf(END);
  if (start >= 0 && end > start) return text.slice(0, start) + BLOCK + text.slice(end + END.length);
  const close = text.lastIndexOf('</html>');
  if (close < 0) throw new Error('workbench.html has no closing </html> tag; the interface addon was not added');
  return text.slice(0, close) + BLOCK + '\n' + text.slice(close);
}
function withoutLegacy(text) {
  const start = text.indexOf(LEGACY_START);
  if (start < 0) return text;
  const end = text.indexOf(LEGACY_END, start);
  const after = end < 0 ? text.length : end + LEGACY_END.length;
  return text.slice(0, start) + text.slice(after).replace(/^\n/, '');
}

// Adds or refreshes the addon. Every file it changes is restored when a later
// step fails, so the IDE never keeps a half-written workbench.
function ensure(html) {
  if (typeof html !== 'string' || path.basename(html) !== 'workbench.html' || !fs.existsSync(html)) {
    return { skipped: 'workbench.html was not found' };
  }
  const folder = path.dirname(html);
  const files = { html, script: path.join(folder, SCRIPT), style: path.join(folder, STYLE), jelly: path.join(folder, 'jelly-cursor.js') };
  const target = product(html);
  const before = { html: read(html), script: read(files.script), style: read(files.style), jelly: read(files.jelly),
    product: target ? read(target.file) : null };
  const plan = {
    script: script(),
    // Aster Atelier owns the style once it exists; it is created empty only.
    style: before.style === null ? STYLE_HEADER : before.style,
    jelly: before.jelly === null ? null : withoutLegacy(before.jelly),
    html: withBlock(before.html),
  };
  const changed = [];
  try {
    for (const name of ['script', 'style', 'jelly', 'html']) {
      if (plan[name] === null || plan[name] === before[name]) continue;
      writeAtomic(files[name], plan[name]);
      changed.push(name);
    }
    const checksum = syncChecksum(html);
    return { installed: true, changed, checksum };
  } catch (error) {
    for (const name of changed.reverse()) {
      try { if (before[name] === null) fs.rmSync(files[name], { force: true }); else writeAtomic(files[name], before[name]); } catch {}
    }
    try { if (target && before.product !== null && read(target.file) !== before.product) writeAtomic(target.file, before.product); } catch {}
    throw error;
  }
}

// Read-only state for Doctor and Aster Atelier.
function status(html) {
  const text = typeof html === 'string' ? read(html) : null;
  if (text === null) return { found: false, installed: false, checksum: 'unknown' };
  const folder = path.dirname(html);
  const installed = text.includes(START) && fs.existsSync(path.join(folder, SCRIPT));
  let checksum = 'unknown';
  try {
    const target = product(html), json = target && read(target.file);
    const recorded = json ? JSON.parse(json).checksums?.[target.key] : undefined;
    checksum = typeof recorded !== 'string' ? 'unrecorded' : recorded === digest(fs.readFileSync(html)) ? 'match' : 'mismatch';
  } catch {}
  return { found: true, installed, checksum };
}

module.exports = { START, END, SCRIPT, STYLE, STYLE_HEADER, BLOCK, LEGACY_START, LEGACY_END, REFRESH_MS,
  script, workbenchHtml, syncChecksum, withBlock, withoutLegacy, ensure, status };
