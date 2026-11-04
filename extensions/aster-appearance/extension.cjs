'use strict';
const vscode = require('vscode');
const crypto = require('node:crypto');
const path = require('node:path');
const fonts = require('./fonts.json');
const service = require('./font-service.cjs');
const themes = require('./themes.cjs');
const {SHARED,FONT_FAMILY_KEYS,styleSettings,updateGlobal,validate} = require('./appearance.cjs');
let panel, panelRefresh, refreshTimer, queue = Promise.resolve();
function enqueue(action) { const result = queue.then(action); queue=result.catch(()=>{});return result; }
const read = key => vscode.workspace.getConfiguration(undefined,null).get(key);
const globalValue = key => vscode.workspace.getConfiguration(undefined,null).inspect(key)?.globalValue;
const contributedThemes = (extensions = vscode.extensions?.all || []) => extensions.flatMap(extension => extension.packageJSON?.contributes?.themes || []);
function nativeThemeOptions(extensions) {
  const contributed = contributedThemes(extensions);
  return ['Light', 'Dark'].flatMap(mode => {
    const ids = [`Antigravity ${mode}`, `Antigravity Default ${mode}`, `Default ${mode} Modern`, `Default ${mode}+`];
    const selected = ids.map(id => contributed.find(theme => (theme.id || theme.label) === id)).find(Boolean);
    return selected ? [{ label: `Antigravity ${mode}`, value: selected.id || selected.label, kind: mode.toLowerCase(), builtin: true }] : [];
  });
}
const themeOptions = () => [...nativeThemeOptions(), ...themes.THEMES.map(theme => ({ label: theme.name, value: theme.name, kind: theme.type, builtin: false }))];
const themeValues = () => themeOptions().map(option => option.value);
// The studio shows the Aster palette while its Visual Studio base is active.
function currentTheme() {
  const selected = read('workbench.colorTheme'), aster = themes.find(read('asterAppearance.theme'));
  return aster && selected === themes.BASE[aster.type] ? aster.name : selected;
}
function themeChanges(value) {
  validate({ key: 'theme', value }, themeValues(), fonts);
  const aster = themes.find(value);
  return aster ? themes.themeChanges(read, aster) : { 'workbench.colorTheme': value, 'asterAppearance.theme': '' };
}
function fontChanges(font, weight) {
  const family = `'${font.family}', monospace`;
  const supported = Math.min(font.maxWeight, Math.max(font.minWeight, Math.round((weight - font.minWeight) / font.weightStep) * font.weightStep + font.minWeight));
  return {...Object.fromEntries(FONT_FAMILY_KEYS.map(key => [key, family])), 'editor.fontWeight': String(supported), 'terminal.integrated.fontWeight': supported};
}
function styleChanges(italic) {
  const style = styleSettings({ text: globalValue('editor.tokenColorCustomizations'), semantic: globalValue('editor.semanticTokenColorCustomizations') }, italic);
  return { 'editor.tokenColorCustomizations': style.text, 'editor.semanticTokenColorCustomizations': style.semantic };
}
// Starts a restored palette, or migrates a label from the contributed-theme era.
async function syncTheme() {
  const names = new Set(contributedThemes().flatMap(theme => [theme.id, theme.label]));
  // A profile that never chose a theme only reports the IDE default; the
  // shared palette then applies there too.
  const explicit = key => key === 'workbench.colorTheme' ? globalValue(key) : read(key);
  const theme = themes.pending(explicit, name => names.has(name));
  if (!theme) return;
  // The recorded name is never written back: a newer choice made while this
  // sync runs must not be replaced by the one that started it.
  const changes = themes.themeChanges(read, theme);
  if (read('asterAppearance.theme') === theme.name) delete changes['asterAppearance.theme'];
  await updateGlobal(vscode, changes);
}
// Navigation never applies anything; only a click or Enter writes the theme.
function pickTheme() {
  const picker = vscode.window.createQuickPick(), options = themeOptions(), current = currentTheme();
  const group = (label, list) => list.length ? [{ label, kind: vscode.QuickPickItemKind?.Separator ?? -1 }, ...list] : [];
  const item = option => ({ label: option.label, description: option.value === current ? 'текущая' : '', option });
  picker.items = [...group('Antigravity', options.filter(o => o.builtin).map(item)),
    ...group('Aster · тёмные', options.filter(o => !o.builtin && o.kind === 'dark').map(item)),
    ...group('Aster · светлые', options.filter(o => !o.builtin && o.kind === 'light').map(item))];
  picker.placeholder = 'Тема меняется только по клику или Enter';
  picker.onDidAccept(() => {
    const picked = picker.selectedItems[0]?.option;
    picker.hide();
    if (picked) void enqueue(() => updateGlobal(vscode, themeChanges(picked.value))).catch(error => vscode.window.showErrorMessage('Aster Atelier: ' + error.message));
  });
  picker.show();
}
function html(webview,root) {
  const nonce=crypto.randomBytes(24).toString('hex');
  const uri=name=>webview.asWebviewUri(vscode.Uri.file(path.join(root,name))).toString();
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${uri('panel.css')}"><title>Aster Atelier</title></head><body><main>
<header><img src="${uri('icon.png')}" width="44" height="44" alt=""><div><h1>Aster Atelier</h1><p>Темы и шрифты для Antigravity</p></div></header>
<section><h2>Тема</h2><select id="theme" aria-label="Тема"></select><div class="actions"><button id="applyTheme" type="button" disabled>Применить тему</button><button id="cancelTheme" class="secondary" type="button" disabled>Отмена</button></div></section>
<section><h2>Шрифт</h2><select id="font" aria-label="Шрифт"></select><p id="availability" class="hint" role="status"></p>
<div class="controls"><label>Размер<input id="size" type="number" min="8" max="40" step="1"></label><label>Толщина <output id="weightValue"></output><input id="weight" type="range" min="100" max="900" step="100"></label><label>Начертание<select id="style"><option value="normal">Обычный</option><option value="italic">Курсив</option></select></label></div>
<pre id="preview" tabindex="0">import { useState } from 'react';

export function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(42);
  return &lt;button onClick={() =&gt; setCount(count + 1)}&gt;
    {label}: {count} — 0O 1lI =&gt; !==
  &lt;/button&gt;;
}</pre>
<div class="actions"><button id="applyFont" type="button" disabled>Применить шрифт</button><button id="cancelFont" class="secondary" type="button" disabled>Отмена</button></div></section>
<p id="message" role="status" aria-live="polite"></p><footer>Изменения сохраняются в настройках пользователя только по кнопке «Применить».</footer></main><script nonce="${nonce}" src="${uri('panel.js')}"></script></body></html>`;
}
async function open(context) {
  if (panel) {panel.reveal();await panelRefresh?.();return;}
  const root=context.extensionPath;
  panel=vscode.window.createWebviewPanel('asterAtelier','Aster Atelier',vscode.ViewColumn.One,{enableScripts:true,localResourceRoots:[vscode.Uri.file(root)]});
  const current=panel;
  const probes=new Map();
  function probe(font) {
    const id=crypto.randomUUID();
    return new Promise(resolve=>{
      const timer=setTimeout(()=>{probes.delete(id);resolve(false);},15000);
      probes.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);}});
      current.webview.postMessage({type:'probe',id,family:font.family,localNames:font.localNames});
    });
  }
  async function refresh() {
    let availability={},detectionError;
    try { availability=await service.installed(fonts); } catch(error) {detectionError=error.message;}
    await current.webview.postMessage({type:'state',themes:themeOptions(),theme:currentTheme(),
      fonts:fonts.map(font=>({...font,files:undefined,preview:font.files.filter(f=>f.file.endsWith('.ttf')).map(f=>({uri:current.webview.asWebviewUri(vscode.Uri.file(path.join(root,f.file))).toString(),italic:f.italic,weight:f.weight}))})),
      availability,detectionError,family:read('editor.fontFamily'),size:read('editor.fontSize'),weight:read('editor.fontWeight'),style:read('asterAppearance.fontStyle'),
      profileScope:context.globalState.get('applicationScopeVerification')});
  }
  async function applyFont(message) {
    const changes={...validate({key:'size',value:message.size},[],fonts),...validate({key:'style',value:message.style},[],fonts)};
    validate({key:'weight',value:message.weight},[],fonts);
    let note='Шрифт применён.';
    if(message.font) {
      const font=validate({key:'font',value:message.font},[],fonts);
      if(!(await service.installed([font]))[font.id]) {
        await current.webview.postMessage({type:'result',message:'Устанавливаю '+font.family+' из расширения…'});
        await service.install(root,font,context.globalStorageUri.fsPath);
      }
      if(!await probe(font)) note='Сохранено. '+font.family+' установлен, но редактор увидит его после полного перезапуска IDE.';
      Object.assign(changes,fontChanges(font,message.weight));
    } else Object.assign(changes,{'editor.fontWeight':String(message.weight),'terminal.integrated.fontWeight':message.weight});
    Object.assign(changes,styleChanges(message.style==='italic'));
    await updateGlobal(vscode,changes);
    return note;
  }
  panelRefresh=refresh;
  current.webview.onDidReceiveMessage(message=>{
    if(message?.type==='probe-result' && typeof message.id==='string') { const request=probes.get(message.id);if(request){probes.delete(message.id);request.resolve(message.loaded===true);}return; }
    enqueue(async()=>{
      if(message?.type==='ready') {await refresh();return;}
      let note;
      if(message?.type==='apply-theme') {await updateGlobal(vscode,themeChanges(message.value));note='Тема применена.';}
      else if(message?.type==='apply-font') note=await applyFont(message);
      else throw new Error('Unsupported panel action');
      // A workspace or language value still wins over the saved global one.
      const scopes=vscode.window.visibleTextEditors.map(editor=>({uri:editor.document.uri,languageId:editor.document.languageId}));
      const keys=['editor.fontSize','editor.fontWeight','editor.fontFamily'].filter(key=>scopes.some(scope=>JSON.stringify(vscode.workspace.getConfiguration(undefined,scope).get(key))!==JSON.stringify(read(key))));
      if(keys.length)note+=' Настройка проекта или языка перекрывает: '+keys.join(', ')+'.';
      await refresh();
      await current.webview.postMessage({type:'result',message:note});
    }).catch(error=>current.webview.postMessage({type:'result',error:error.message}));
  },undefined,context.subscriptions);
  current.onDidDispose(()=>{panel=undefined;panelRefresh=undefined;for(const request of probes.values())request.resolve(false);probes.clear();},undefined,context.subscriptions);
  current.webview.html=html(current.webview,root);
}
function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('asterAppearance.open',()=>open(context)));
  context.subscriptions.push(vscode.commands.registerCommand('asterAppearance.selectTheme',()=>pickTheme()));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event=>{
    if(event.affectsConfiguration('asterAppearance.theme')) enqueue(syncTheme).catch(error=>vscode.window.showErrorMessage('Aster Atelier: '+error.message));
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
    await syncTheme();
    // Every bundled family is installed for this OS user, so any choice in the
    // studio works after the next IDE start without a download.
    const added=await service.ensureBundled(context.extensionPath,fonts,context.globalStorageUri.fsPath).catch(error=>{console.warn('Aster Atelier fonts: '+error.message);return [];});
    if(added.length) void vscode.window.showInformationMessage(`Aster Atelier установил шрифты (${added.length}). Они появятся в редакторе после полного перезапуска IDE.`);
  }).catch(error=>vscode.window.showErrorMessage('Aster Atelier: '+error.message));
}
module.exports={activate,nativeThemeOptions,FONT_FAMILY_KEYS};
