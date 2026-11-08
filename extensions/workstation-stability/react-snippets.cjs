'use strict';
const fs = require('node:fs');
const path = require('node:path');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let pending;
let needsReload = false;

async function refresh(vscode) {
  const extension = vscode.extensions.getExtension?.('dsznajder.es7-react-js-snippets');
  if (!extension || extension.packageJSON.version !== '4.4.3') return { status: 'not-needed' };
  let config = vscode.workspace.getConfiguration('reactSnippets.settings', null);
  if (config.get('importReactOnTop') !== false) return { status: 'override-preserved' };
  const file = path.join(extension.extensionPath, 'lib/snippets/generated.json');
  function ready() {
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 4 * 1024 * 1024) throw new Error('Unsafe React snippet cache');
    const snippets = Object.values(JSON.parse(fs.readFileSync(file, 'utf8')));
    return ['rfc', 'rafce'].every(prefix => snippets.some(item => item.prefix === prefix && Array.isArray(item.body)
      && !/import\s+(?:\*\s+as\s+)?React\b[^\n]*from\s*["']react["']/.test(item.body.join('\n'))));
  }
  if (ready()) return { status: 'current', reloadWindowMayBeRequired: needsReload };
  await extension.activate();
  config = vscode.workspace.getConfiguration('reactSnippets.settings', null);
  if (config.get('importReactOnTop') !== false) return { status: 'override-preserved' };
  const key = ['languageScopes', 'prettierEnabled', 'typescript'].find(key => {
    const item = config.inspect(key);
    return item && item.defaultValue !== undefined && (item.globalValue === undefined || same(item.globalValue, item.defaultValue));
  });
  if (!key) return { status: 'reload-required', reason: 'Legacy React snippets have a stale cache; no neutral default-setting refresh is available' };
  const before = config.inspect(key).globalValue;
  const temporary = before === undefined ? config.inspect(key).defaultValue : undefined;
  if (!same(vscode.workspace.getConfiguration('reactSnippets.settings', null).inspect(key)?.globalValue, before)) return { status: 'reload-required', reason: 'React snippet configuration changed concurrently; personal value preserved' };
  try {
    await config.update(key, temporary, vscode.ConfigurationTarget.Global);
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      try { if (ready()) { needsReload = true; return { status: 'refreshed', reloadWindowMayBeRequired: true }; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return { status: 'reload-required', reason: 'Official React snippet regeneration did not finish; reload the window and recheck' };
  } finally {
    if (same(vscode.workspace.getConfiguration('reactSnippets.settings', null).inspect(key)?.globalValue, temporary)) await config.update(key, before, vscode.ConfigurationTarget.Global);
  }
}

function refreshReactSnippets(vscode) {
  if (!pending) pending = refresh(vscode).finally(() => { pending = undefined; });
  return pending;
}
module.exports = { refreshReactSnippets, getReactSnippetsReloadState: () => needsReload ? { status: 'refreshed', reloadWindowMayBeRequired: true } : undefined };
