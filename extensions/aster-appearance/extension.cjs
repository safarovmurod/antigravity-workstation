'use strict';
const vscode = require('vscode');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const fonts = require('./fonts.json');
const manifest = require('./package.json');
const service = require('./font-service.cjs');
const {SHARED,updateGlobal,validate} = require('./appearance.cjs');
let panel, panelRefresh, refreshTimer, queue = Promise.resolve();
function enqueue(action) { const result = queue.then(action); queue=result.catch(()=>{});return result; }
const themeOptions = () => [
  {label:'Antigravity Light',value:'Antigravity Light',builtin:true},
  {label:'Antigravity Dark',value:'Antigravity Dark',builtin:true},
  ...manifest.contributes.themes.map(t=>({label:t.label,value:t.label,builtin:false}))
];
const themeValues = () => themeOptions().map(t=>t.value);
// Font style is preview-only. No changes to user syntax/semantic rules.
async function applyStyle() { return; }
function html(webview,root) {
  const nonce=crypto.randomBytes(24).toString('hex');
  const uri=name=>webview.asWebviewUri(vscode.Uri.file(path.join(root,name))).toString();
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${uri('panel.css')}"><title>Aster Atelier</title></head><body><main><header><img src="${uri('icon.png')}" width="48" height="48" alt=""><div><h1>Aster Atelier</h1><p>YOUR EDITOR, CONSIDERED.</p></div></header><section><label for="theme">SELECT THEME — 20</label><select id="theme"></select><div class="controls"><button id="applyTheme" type="button" disabled>Применить тему</button><button id="cancelTheme" type="button" disabled>Отмена</button></div><label for="font">SELECT FONT — 10</label><select id="font"></select><p id="availability" role="status"></p><button id="install" hidden>Download, install & apply</button><div class="controls"><label>Font size<input id="size" type="number" min="8" max="40" step="1"></label><label>Font weight <output id="weightValue"></output><input id="weight" type="range" min="100" max="900" step="100"></label><label>Font style<select id="style"><option value="normal">Normal · upright</option><option value="italic">Italic</option></select></label></div></section><section><label>FONT PREVIEW</label><pre id="preview" tabindex="0">import { useState } from 'react';

type Workspace = { name: string; ready: boolean };

export function Studio({ name }: Workspace) {
  const [count, setCount] = useState(42);
  return &lt;button onClick={() =&gt; setCount(count + 1)}&gt;
    {name}: {count} — 0O 1lI =&gt; !==
  &lt;/button&gt;;
}</pre><p id="message" role="status" aria-live="polite"></p></section><footer>Saved to user settings · project overrides are respected</footer></main><script nonce="${nonce}" src="${uri('panel.js')}"></script></body></html>`;
}
async function open(context) {
  if (panel) {panel.reveal();await panelRefresh?.();return;}
  const root=context.extensionPath;
  const previousDocument=vscode.window.activeTextEditor?.document;
  panel=vscode.window.createWebviewPanel('asterAtelier','Aster Atelier',vscode.ViewColumn.One,{enableScripts:true,localResourceRoots:[vscode.Uri.file(root)]});
  const current=panel;
  const probes=new Map();
  function probe(font) {
    const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{probes.delete(id);reject(new Error('Renderer font check timed out; font was not applied'));},15000);
      probes.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);}});
      current.webview.postMessage({type:'probe',id,family:font.family,localNames:font.localNames});
    });
  }
  async function refresh() {
    let availability={},detectionError;
    try { availability=await service.installed(fonts); } catch(error) {detectionError=error.message;}
    const config=vscode.workspace.getConfiguration(undefined,null);
    await current.webview.postMessage({type:'state',themes:themeOptions(),fonts:fonts.map(font=>({...font,files:undefined,preview:font.files.filter(f=>f.file.endsWith('.ttf')).map(f=>({uri:current.webview.asWebviewUri(vscode.Uri.file(path.join(root,f.file))).toString(),italic:f.italic,weight:f.weight}))})),availability,detectionError,
      theme:config.get('workbench.colorTheme'),family:config.get('editor.fontFamily'),size:config.get('editor.fontSize'),weight:config.get('editor.fontWeight'),style:config.get('asterAppearance.fontStyle'),profileScope:context.globalState.get('applicationScopeVerification')});
  }
  panelRefresh=refresh;
  current.webview.onDidReceiveMessage(message=>{
    if(message?.type==='probe-result' && typeof message.id==='string') { const request=probes.get(message.id);if(request){probes.delete(message.id);request.resolve(message.loaded===true);}return; }
    enqueue(async()=>{
      if(message?.type==='ready') {await refresh();return;}
      if(!['change','install','apply-theme'].includes(message?.type)) throw new Error('Unsupported panel action');
      if(message.type==='apply-theme' && message.key!=='theme') throw new Error('Invalid theme apply request');
      if(message.key==='theme' && message.type!=='apply-theme') throw new Error('Theme requires explicit confirmation');
      let changes=validate(message,themeValues(),fonts);
      if(message.key==='font') {
        const font=changes;
        if(message.type==='install') {
          const confirmation=await vscode.window.showInformationMessage(`Download ${font.family} from the official Google Fonts repository and install it for this OS user? License: SIL Open Font License 1.1.`,{modal:true},'Install font');
          if(confirmation!=='Install font') {await current.webview.postMessage({type:'result',message:'Installation cancelled. Editor unchanged.'});return;}
          await current.webview.postMessage({type:'result',message:'Downloading verified font files and registering them for this OS user…'});
          await fs.promises.mkdir(context.globalStorageUri.fsPath,{recursive:true});
          await service.install(root,font,context.globalStorageUri.fsPath);
        }
        if(!(await service.installed([font]))[font.id]) throw new Error('Font is not installed. Download and install it first; editor unchanged.');
        if(!await probe(font)) throw new Error('Font exists in the OS but is not available in this renderer. Reload the IDE and retry; editor unchanged.');
        const currentWeight=vscode.workspace.getConfiguration().get('editor.fontWeight');
        const weight=currentWeight==='bold'?700:Number(currentWeight)||400;
        changes={'editor.fontFamily':`'${font.family}', monospace`,'editor.fontWeight':String(Math.min(font.maxWeight,Math.max(font.minWeight,Math.round((weight-font.minWeight)/font.weightStep)*font.weightStep+font.minWeight)))};
      } else if(message.type==='install') throw new Error('Only font installation is supported');
      // Shared profile settings are personal preferences; selecting a font must not
      // mutate the apply-to-all-profiles array or another profile's unrelated data.
      await updateGlobal(vscode,changes);
      const documents=vscode.window.visibleTextEditors.map(editor=>editor.document);
      if(!documents.length&&previousDocument&&!previousDocument.isClosed)documents.push(previousDocument);
      const scopes=documents.length?documents.map(document=>({uri:document.uri,languageId:document.languageId})):[null];
      const overrides=Object.keys(changes).filter(key=>typeof changes[key]!=='object'&&scopes.some(scope=>JSON.stringify(vscode.workspace.getConfiguration(undefined,scope).get(key))!==JSON.stringify(changes[key])));
      await refresh();
      await current.webview.postMessage({type:'result',message:overrides.length?'Saved globally; a project/language/profile override prevents application: '+overrides.join(', '):documents.length?'Saved globally. Effective editor settings match the selection.':'Saved globally. No code editor is open to verify its effective font settings.'});
    }).catch(error=>current.webview.postMessage({type:'result',error:error.message}));
  },undefined,context.subscriptions);
  current.onDidDispose(()=>{panel=undefined;panelRefresh=undefined;for(const request of probes.values())request.resolve(false);probes.clear();},undefined,context.subscriptions);
  current.webview.html=html(current.webview,root);
}
function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('asterAppearance.open',()=>open(context)));
  // The legacy shortcut opens the studio; it must never commit a theme from
  // navigation alone. Only the webview's explicit Apply button writes a theme.
  context.subscriptions.push(vscode.commands.registerCommand('asterAppearance.selectTheme',()=>open(context)));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event=>{
    if(event.affectsConfiguration('asterAppearance.fontStyle')) enqueue(applyStyle).catch(error=>vscode.window.showErrorMessage('Aster Atelier: '+error.message));
    if(SHARED.some(key=>event.affectsConfiguration(key))){
      clearTimeout(refreshTimer);
      refreshTimer=setTimeout(()=>enqueue(()=>panelRefresh?.()).catch(error=>console.error('Aster Atelier refresh: '+error.message)),150);
    }
  }));
  context.subscriptions.push({dispose(){clearTimeout(refreshTimer);}});
  return enqueue(async()=>{
    const scope=await require('./profiles.cjs').ensureAllProfiles(vscode,context);
    await context.globalState.update('applicationScopeVerification',scope);
    if(scope.status!=='application-scoped')console.warn('Aster Atelier: '+scope.reason);
    await applyStyle();
  }).catch(error=>vscode.window.showErrorMessage('Aster Atelier: '+error.message));
}
module.exports={activate};
