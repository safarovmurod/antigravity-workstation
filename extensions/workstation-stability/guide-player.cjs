'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const guides = Object.freeze([
  { id: 'calm-typescript', label: 'Calm TypeScript — 3.3.3', kind: 'recording', source: 'docs/feature-guides/calm-typescript.mp4', sha256: '0efcbe69a67715a8ca9b94b4f8a76e2c6360217c4d9af67740d641ce305f417e' },
  { id: 'stability', label: 'Workstation Stability — historical recording 1.3.12', kind: 'recording', source: 'docs/feature-guides/stability.mp4', sha256: '946d7e766f15d6ea237afc90d2b5ecf0021d643f19bd65a6cb7c4ad3e69393c6' },
  ...require('./instructional-guides.json'),
]);

function playerHtml(source, cspSource, title, kind = 'recording') {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const description = kind === 'instructional' ? 'Instructional animation: a diagram, not an IDE recording.' : 'Actual IDE recording; the Stability clip is historical.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${escape(cspSource)}; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>body{font-family:var(--vscode-font-family, sans-serif);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:20px}video{display:block;width:100%;max-height:80vh}p{line-height:1.5}</style></head><body><h1>${escape(title)}</h1><p>${description} Use Play, pause, seek or fullscreen.</p><video controls preload="metadata" playsinline aria-label="${escape(title)}"><source src="${escape(source)}" type="video/mp4">This host cannot play H.264 MP4. Download the video from extension Details and open it in your system video player.</video><p>If this host reports an unsupported codec, use the MP4 download in Details. This is a separate extension player, not inline Details playback.</p></body></html>`;
}

function registerGuidePlayer(vscode, context) {
  context.subscriptions.push(vscode.commands.registerCommand('workstationStability.openGuide', async id => {
    let guide;
    if (id !== undefined) {
      guide = guides.find(item => item.id === id);
      if (!guide) throw new Error('Unknown guide ID');
    } else {
      guide = await vscode.window.showQuickPick(guides, { title: 'Workstation: IDE guides', placeHolder: 'Recordings and instructional animations are labelled separately' });
      if (!guide) return;
    }
    const file = path.join(context.extensionPath, 'guide-' + guide.id + '.mp4');
    const bytes = fs.readFileSync(file);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== guide.sha256) throw new Error('Guide checksum mismatch; reinstall the current Workstation package');
    const uri = vscode.Uri.file(file);
    const panel = vscode.window.createWebviewPanel('workstationGuide', guide.label, vscode.ViewColumn.One, {
      enableScripts: false, localResourceRoots: [vscode.Uri.file(context.extensionPath)], retainContextWhenHidden: false,
    });
    panel.webview.html = playerHtml(panel.webview.asWebviewUri(uri).toString(), panel.webview.cspSource, guide.label, guide.kind);
    context.subscriptions.push(panel);
    return guide.id;
  }));
}

module.exports = { guides, playerHtml, registerGuidePlayer };
