'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Jelly Cursor draws through a script it injects into workbench.html. The IDE
// drops that patch on every update, so it is re-applied with Jelly Cursor's own
// command whenever the markers or the script are missing.
const MARKER = '<!-- jelly-cursor:start -->';
const JELLY_ID = 'iranon.jelly-cursor';

// The IDE compares workbench.html with its product.json checksum; the shared
// rule in workbench-ui.cjs records the patched file's checksum, the user's choice.
const workbenchUi = require('./workbench-ui.cjs');
const syncIntegrity = html => workbenchUi.syncChecksum(html);

function patchInstalled(html) {
  try { return fs.readFileSync(html, 'utf8').includes(MARKER) && fs.existsSync(path.join(path.dirname(html), 'jelly-cursor.js')); }
  catch { return false; }
}

// Jelly Cursor writes its settings into the injected script, so a patch made
// with other settings is reinstalled; the last applied settings are recorded.
const BAKED = 'jellyCursor.appliedSettings';
const RUNTIME_ONLY = ['note', 'workbenchHtmlPath', 'reminders', 'statusBar'];
function fingerprint(vscode, extension) {
  const config = vscode.workspace.getConfiguration('jellyCursor');
  return JSON.stringify(Object.keys(extension.packageJSON?.contributes?.configuration?.properties || {})
    .map(key => key.replace(/^jellyCursor\./, '')).filter(key => !RUNTIME_ONLY.includes(key)).sort().map(key => [key, config.get(key)]));
}
// Two quick rewrites can share a timestamp, so the content counts as well.
const modified = file => { try { return fs.statSync(file).mtimeMs + ':' + crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return null; } };

// The IDE blinks the caret by animating the opacity of the whole
// .cursors-layer, while Jelly Cursor reads the opacity of the .cursor inside
// it, which stays 1, so the drawn caret never blinked. A short addon after
// Jelly's own script mirrors the focused layer's opacity onto the drawn caret
// and keeps the configured minimum, so the caret fades softly but never
// vanishes. The IDE also stops its smooth blink after 20 cycles (about ten
// idle seconds); the addon lets it continue while the caret rests, and typing
// still pauses it as usual. Jelly rewrites the whole script on reinstall, so
// the addon is appended again each time.
const BLINK_START = '/* workstation-blink:start */';
function blinkAddon(minAlpha) {
  const minimum = Number.isFinite(minAlpha) ? Math.min(1, Math.max(0, minAlpha)) : 0;
  return [BLINK_START, '(() => {',
    '\tconst minimum = ' + minimum + ';',
    '\tconst style = document.createElement(\'style\');',
    '\tstyle.textContent = \'.monaco-editor .cursors-layer.cursor-smooth, .monaco-editor .cursors-layer.cursor-phase { animation-iteration-count: infinite !important; }\';',
    '\tdocument.head.appendChild(style);',
    '\tfunction tick() {',
    '\t\tconst overlay = document.querySelector(\'.jelly-cursor-layer\');',
    '\t\tconst layer = document.querySelector(\'.monaco-editor.focused .cursors-layer\');',
    '\t\tconst opacity = layer ? Number.parseFloat(getComputedStyle(layer).opacity || \'1\') : 1;',
    '\t\tif (overlay) overlay.style.opacity = String(Math.max(minimum, Number.isFinite(opacity) ? opacity : 1));',
    '\t\trequestAnimationFrame(tick);',
    '\t}',
    '\trequestAnimationFrame(tick);',
    '})();', '/* workstation-blink:end */', ''].join('\n');
}
// The interface addon (hidden hint lines, live Aster style) now loads from its
// own script, see workbench-ui.cjs. Stability 1.3.26 and older appended it to
// Jelly's script; that copy is cut off here with everything after the first
// marker, so a reinstall or a new minimum never duplicates the blink addon.
function ensureBlink(script, minAlpha) {
  const text = fs.readFileSync(script, 'utf8');
  const starts = [text.indexOf(BLINK_START), text.indexOf(workbenchUi.LEGACY_START)].filter(index => index >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  const next = (start < 0 ? text : text.slice(0, start)).replace(/\n*$/, '\n') + blinkAddon(minAlpha);
  if (next === text) return false;
  fs.writeFileSync(script, next);
  return true;
}

async function ensureJellyPatch(vscode, output, state) {
  const extension = vscode.extensions.getExtension(JELLY_ID);
  if (!extension) return { skipped: 'Jelly Cursor is not installed' };
  const html = vscode.workspace.getConfiguration('jellyCursor').get('workbenchHtmlPath');
  if (typeof html !== 'string' || !path.isAbsolute(html) || path.basename(html) !== 'workbench.html' || !fs.existsSync(html)) {
    return { skipped: 'jellyCursor.workbenchHtmlPath does not point to the IDE workbench.html' };
  }
  const settings = state && fingerprint(vscode, extension);
  const script = path.join(path.dirname(html), 'jelly-cursor.js');
  const minAlpha = vscode.workspace.getConfiguration('jellyCursor').get('minAlpha');
  if (patchInstalled(html) && (!state || state.get(BAKED) === settings)) {
    return { patched: true, unchanged: true, integrity: syncIntegrity(html), blink: ensureBlink(script, minAlpha) };
  }
  const before = modified(script);
  await extension.activate();
  // The command resolves only after its "restart" message is dismissed, so the
  // rewritten script itself is awaited before the checksum is recorded.
  vscode.commands.executeCommand('jellyCursor.installDomPatch').then(undefined, error => output.appendLine('Jelly Cursor: ' + error.message));
  const done = () => patchInstalled(html) && modified(script) !== before;
  for (let attempt = 0; attempt < 40 && !done(); attempt++) await new Promise(resolve => setTimeout(resolve, 250));
  const patched = done(), integrity = patched && syncIntegrity(html), blink = patched && ensureBlink(script, minAlpha);
  if (patched && state) await state.update(BAKED, settings);
  output.appendLine('Jelly Cursor DOM patch: ' + (patched ? 'installed; effects appear after the next full IDE restart' : 'could not be installed; run "Jelly Cursor: Install DOM Patch"'));
  return { patched, integrity, blink };
}

// The IDE hashes its files once per session, shortly after startup finishes
// (the same moment onStartupFinished extensions activate). Patching during that
// check reports a "corrupt installation" for the session, so the patch waits
// until the check has read the original file.
const INTEGRITY_CHECK_DELAY = 60000;

// Setup adds the interface addon while the IDE is closed; after an IDE update
// replaced workbench.html it is added again here and loads after one restart.
function ensureInterfaceAddon(vscode, output) {
  const html = workbenchUi.workbenchHtml(vscode.env?.appRoot);
  if (!html) return { skipped: 'workbench.html was not found in the IDE folder' };
  try {
    const result = workbenchUi.ensure(html);
    if (result.changed?.includes('html')) output.appendLine('Workstation interface addon: installed; the interface font and hidden hint lines load after the next full IDE restart');
    return result;
  } catch (error) {
    output.appendLine('Workstation interface addon could not be installed: ' + error.message);
    return { error: error.message };
  }
}

function scheduleJellyPatch(vscode, context, output, delay = INTEGRITY_CHECK_DELAY) {
  const timer = setTimeout(() => {
    ensureInterfaceAddon(vscode, output);
    ensureJellyPatch(vscode, output, context.globalState)
      .catch(error => output.appendLine('Jelly Cursor DOM patch failed: ' + error.message));
  }, delay);
  context.subscriptions.push({ dispose: () => clearTimeout(timer) });
}

module.exports = { ensureJellyPatch, ensureInterfaceAddon, scheduleJellyPatch, patchInstalled, syncIntegrity, ensureBlink };
