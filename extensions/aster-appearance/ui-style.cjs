'use strict';
const fs = require('node:fs');
const path = require('node:path');
// The IDE draws its own interface in Segoe UI and offers no setting for it.
// Aster writes workstation-ui.css beside workbench.html; the workstation's
// workbench addon reads that file every two seconds and applies it, so the
// whole interface follows the editor font while the checkbox is on, and the
// IDE's own font returns as soon as it is off.
const FILE = 'workstation-ui.css';
const HEADER = '/* Aster Atelier writes the workbench style here. */\n';
const directory = appRoot => path.join(appRoot, 'out', 'vs', 'code', 'electron-browser', 'workbench');
// Only plain family lists are written: names, spaces, quotes, commas, dashes.
const safeFamily = family => typeof family === 'string' && family.trim() && /^[\w\s,'"-]+$/.test(family) ? family.trim() : null;

function css({ uiFont, family }) {
  const safe = uiFont ? safeFamily(family) : null;
  if (!safe) return HEADER;
  // The root carries the IDE's own font; every element that sets its own UI
  // font follows it. Icon fonts, the editor and the terminal keep theirs.
  return HEADER + [
    `.monaco-workbench, .monaco-workbench.windows, .monaco-workbench.mac, .monaco-workbench.linux { font-family: ${safe} !important; }`,
    '.monaco-workbench *:not(.codicon):not([class*="codicon"]):not([class*="icon"]):not([class*="symbol"]):not(.monaco-editor *):not(.xterm *) { font-family: inherit !important; }',
  ].join('\n') + '\n';
}

function write(appRoot, settings) {
  const folder = directory(appRoot);
  if (!fs.existsSync(path.join(folder, 'workbench.html'))) return { skipped: 'workbench.html was not found in ' + folder };
  const file = path.join(folder, FILE), text = css(settings);
  try { if (fs.readFileSync(file, 'utf8') === text) return { unchanged: true, file }; } catch {}
  const temporary = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
  return { written: true, file };
}

module.exports = { FILE, HEADER, css, write, directory, safeFamily };
