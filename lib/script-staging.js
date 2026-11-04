'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function stageScriptFiles(repoRoot, files, prefix = 'workstation-script-') {
  if (!/^workstation-[a-z-]+-$/.test(prefix)) throw new Error('Invalid script staging prefix');
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, prefix));
  function dispose() {
    if (path.dirname(path.resolve(root)) !== parent || !path.basename(root).startsWith(prefix)) throw new Error('Unsafe script staging cleanup');
    fs.rmSync(root, { recursive: true, force: true });
  }
  try {
    for (const relative of files) {
      if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => !part || part === '.' || part === '..')) throw new Error('Invalid staged script path');
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(path.join(repoRoot, relative), target, { recursive: true, errorOnExist: true, force: false });
    }
    return { root, dispose };
  } catch (error) { dispose(); throw error; }
}
module.exports = { stageScriptFiles };
