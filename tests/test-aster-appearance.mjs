import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'extensions/aster-appearance');
const {styleSettings,updateGlobal,validate,STYLE_RULE,FONT_FAMILY_KEYS}=require('../extensions/aster-appearance/appearance.cjs');
const {mergeSettings}=require('../lib/profile-settings');
const pkg=require('../extensions/aster-appearance/package.json'),fonts=require('../extensions/aster-appearance/fonts.json');
const themes=require('../extensions/aster-appearance/themes.cjs'),palettes=require('../extensions/aster-appearance/palettes.cjs'),registry=require('../scripts/aster-color-registry.json');

test('Capture publication refuses non-hosted invocation and incomplete or non-native evidence', t => {
  const { verify, publish } = require('./publish-aster-capture.cjs');
  assert.throws(() => publish({}), /Explicit hosted capture publication/);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-capture-validator-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const synthetic = { host: { name: 'Antigravity IDE', platform: 'win32' }, installed: { id: 'workstation.aster-appearance', version: 'fixture-only' },
    themes: Array.from({ length: palettes.length }, (_, index) => ({ name: String(index), actual: '#000000', expected: '#000000', appliedThroughAster: true })),
    panel: { fonts: 10, fontPreviews: Array.from({ length: 10 }, () => ({ actualEditorFonts: [{ glyphCount: 1 }] })), selectorChangesActualSettings: true,
      captureStates: [{ kind: 'light', theme: 'GitHub Light', previewVisible: true }, { kind: 'dark', theme: 'Oceanic Pro', previewVisible: true }] },
    applicationScoped: true, reopenedWithPriorSettings: true, extensionDetails: { nameDescriptionIconVerified: true } };
  const phases = ['fresh', 'restart-new-project', 'named-profile'];
  for (const phase of phases) fs.writeFileSync(path.join(fixture, 'result-' + phase + '.json'), JSON.stringify(synthetic));
  const pngHeaderFixture = Buffer.alloc(31000);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(pngHeaderFixture); pngHeaderFixture.write('IHDR', 12);
  pngHeaderFixture.writeUInt32BE(1440, 16); pngHeaderFixture.writeUInt32BE(1000, 20);
  for (const name of ['light', 'dark']) fs.writeFileSync(path.join(fixture, 'aster-' + name + '.png'), pngHeaderFixture);
  assert.equal(verify(fixture).phases.length, 3, 'Synthetic validation fixture is not live capture evidence');
  for (const change of [value => value.host.name = 'VS Code', value => value.panel.fontPreviews[0].actualEditorFonts = [],
    value => value.reopenedWithPriorSettings = false, value => value.themes[0].actual = '#ffffff',
    value => value.themes[0].name = value.themes[1].name]) {
    const invalid = structuredClone(synthetic); change(invalid);
    fs.writeFileSync(path.join(fixture, 'result-restart-new-project.json'), JSON.stringify(invalid));
    assert.throws(() => verify(fixture), /Incomplete actual native capture evidence/);
  }
  fs.writeFileSync(path.join(fixture, 'result-restart-new-project.json'), JSON.stringify(synthetic));
  pngHeaderFixture.writeUInt32BE(100, 16);
  fs.writeFileSync(path.join(fixture, 'aster-light.png'), pngHeaderFixture);
  assert.throws(() => verify(fixture), /Unreadable native viewport/);
});

test('Appearance panel takes a fresh configuration snapshot after asynchronous OS font detection', async () => {
  let selected = 'Antigravity Dark', receive, release, entered;
  const detectionStarted = new Promise(resolve => entered = resolve), posted = [];
  const commands = new Map(), detection = new Promise(resolve => release = resolve);
  const webview = { asWebviewUri: uri => uri, postMessage: async value => { posted.push(value); return true; }, onDidReceiveMessage: callback => receive = callback };
  const vscode = { Uri: { file: file => ({ fsPath: file, toString: () => file }) }, ViewColumn: { One: 1 },
    commands: { registerCommand: (name, callback) => { commands.set(name, callback); return { dispose() {} }; } },
    window: { createWebviewPanel: () => ({ webview, onDidDispose() {} }), showErrorMessage: message => assert.fail(message) },
    workspace: { onDidChangeConfiguration: () => ({ dispose() {} }), getConfiguration: () => {
      const snapshot = selected;
      return { inspect: () => ({ globalValue: undefined }), get: key => key === 'workbench.colorTheme' ? snapshot : undefined };
    } } };
  const module = { exports: {} }, nativeRequire = createRequire(path.join(source, 'extension.cjs'));
  const loader = name => name === 'vscode' ? vscode : name === './font-service.cjs' ? { installed: async () => { entered(); return detection; }, ensureBundled: async () => [] }
    : name === './profiles.cjs' ? { ensureAllProfiles: async () => ({ status: 'application-scoped' }) } : nativeRequire(name);
  vm.runInNewContext(fs.readFileSync(path.join(source, 'extension.cjs'), 'utf8'), { module, exports: module.exports, require: loader, setTimeout, clearTimeout, console });
  const context = { extensionPath: source, subscriptions: [], globalStorageUri: { fsPath: os.tmpdir() }, globalState: { get: () => ({ status: 'application-scoped' }), update: async () => {} } };
  await module.exports.activate(context);
  await commands.get('asterAppearance.open')();
  receive({ type: 'ready' });
  await detectionStarted;
  selected = 'Antigravity Light'; release({});
  for (let attempt = 0; attempt < 10 && !posted.some(value => value.type === 'state'); attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(posted.find(value => value.type === 'state')?.theme, 'Antigravity Light');
});
test('selectTheme opens the click-only picker: navigation writes nothing, only an explicit accept commits', async () => {
  const commands = new Map(), values = { 'workbench.colorTheme': 'Light+', 'editor.fontSize': 21 };
  let writes = 0, accepts, shown = 0, webviewOpens = 0, picker;
  const webview = { asWebviewUri: uri => uri, postMessage: async () => true, onDidReceiveMessage: () => {} };
  const vscode = { ConfigurationTarget: { Global: 1 },
    Uri: { file: file => ({ fsPath: file, toString: () => file }) }, ViewColumn: { One: 1 },
    commands: { registerCommand: (name, callback) => { commands.set(name, callback); return { dispose() {} }; } },
    window: { createQuickPick: () => picker = { items: [], selectedItems: [], activeItems: [], placeholder: '',
        onDidAccept: callback => accepts = callback, onDidChangeActive: () => {}, show: () => shown++, hide() {} },
      createWebviewPanel: () => { webviewOpens++; return { webview, onDidDispose() {}, reveal() {} }; },
      showErrorMessage: message => assert.fail(message) },
    workspace: { onDidChangeConfiguration: () => ({ dispose() {} }), getConfiguration: () => ({
      get: (key, fallback) => values[key] ?? fallback, inspect: key => ({ globalValue: values[key] }),
      update: async (key, value) => { writes++; values[key] = value; }
    }) } };
  const module = { exports: {} }, nativeRequire = createRequire(path.join(source, 'extension.cjs'));
  const loader = name => name === 'vscode' ? vscode : name === './profiles.cjs' ? { ensureAllProfiles: async () => ({ status: 'application-scoped' }) }
    : name === './font-service.cjs' ? { installed: async () => ({}), ensureBundled: async () => [] } : nativeRequire(name);
  vm.runInNewContext(fs.readFileSync(path.join(source, 'extension.cjs'), 'utf8'), { module, exports: module.exports, require: loader, setTimeout, clearTimeout, console });
  const context = { extensionPath: source, subscriptions: [], globalStorageUri: { fsPath: os.tmpdir() }, globalState: { update: async () => {} } };
  await module.exports.activate(context);
  assert.equal(writes, 0, 'a native theme is left alone at startup');
  await commands.get('asterAppearance.selectTheme')();
  assert.equal(shown, 1);
  assert.equal(webviewOpens, 0, 'the shortcut opens the quick pick, not the studio');
  const rows = picker.items.filter(item => item.option);
  assert.equal(rows.length, themes.THEMES.length, 'every Aster palette is offered');
  picker.activeItems = [rows[2]];
  assert.equal(values['workbench.colorTheme'], 'Light+', 'highlighting another row must not change the theme');
  assert.equal(writes, 0);
  const target = rows.find(item => item.label === 'Pure Black');
  assert.ok(target, 'the picker lists Aster palettes by name');
  picker.selectedItems = [target];
  await accepts();
  for (let attempt = 0; attempt < 20 && !values['asterAppearance.theme']; attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(values['asterAppearance.theme'], 'Pure Black', 'only the explicit accept commits the picked theme');
  assert.equal(values['workbench.colorTheme'], 'Visual Studio Dark');
  assert.equal(values['workbench.colorCustomizations']['[Visual Studio Dark]']['editor.background'], themes.find('Pure Black').colors['editor.background']);
});
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function luminance(hex){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
test('seventeen distinct palettes colour every IDE surface with readable code and transparent Error Lens',()=>{
  const managed=JSON.parse(fs.readFileSync(path.join(source,'../../config/settings.json')));
  assert.equal(managed['editor.renderLineHighlight'],'none');
  const customization=managed['workbench.colorCustomizations'];
  for(const sev of ['error','warning','info','hint']){
    assert.equal(customization['errorLens.'+sev+'BackgroundLight'],'#00000000',sev+' Light line background must stay transparent');
    assert.equal(customization['errorLens.'+sev+'MessageBackground'],'#00000000',sev+' message background must stay transparent');
    assert.equal(customization['errorLens.'+sev+'RangeBackground'],'#00000000',sev+' range background must stay transparent');
    assert.match(customization['errorLens.'+sev+'ForegroundLight'],/^#[0-9a-f]{6}26$/i,sev+' Light message text stays 85-90% transparent');
  }
  for(const key of FONT_FAMILY_KEYS){
    assert.ok(managed['workbench.settings.applyToAllProfiles'].includes(key),key+' must be shared across every profile');
    assert.match(managed[key],/^'JetBrains Mono'/,key+' must be set on a fresh install, not only after the studio is used');
  }
  assert.equal(managed['asterAppearance.theme'],'Oceanic Pro');
  assert.equal(managed['workbench.colorTheme'],themes.BASE.dark);
  assert.equal(pkg.contributes.themes,undefined,'Contributed themes would bring back the IDE picker that previews while hovering');
  assert.equal(themes.THEMES.length,17);assert.equal(palettes.length,17);
  assert.equal(new Set(themes.THEMES.map(t=>t.name.toLowerCase())).size,17);
  for(const name of Object.values(palettes.legacy))assert.ok(themes.find(name),'legacy label maps to an existing palette: '+name);
  const known=new Set(registry.registry),backgrounds=new Set();
  for(const t of themes.THEMES){
    assert.match(t.name,/^[A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*$/,'professional title-case name: '+t.name);
    for(const key of registry.modern)assert.ok(Object.hasOwn(t.colors,key),`${t.name}: base theme colour ${key} is replaced`);
    for(const key of Object.keys(t.colors))assert.ok(known.has(key)||key.startsWith('errorLens.'),`${t.name}: ${key} is a registered colour`);
    for(const scope of registry.baseTokenScopes)assert.ok(t.tokenColors.some(rule=>rule.scope.includes(scope)),`${t.name}: base syntax scope ${scope} is recoloured`);
    const bg=luminance(t.colors['editor.background']);backgrounds.add(t.colors['editor.background']);
    assert.equal(bg>.5,t.type==='light');
    assert.equal(Object.hasOwn(t.colors,'editor.lineHighlightBackground'),false);
    assert.equal(Object.hasOwn(t.colors,'editor.lineHighlightBorder'),false);
    const button=luminance(t.colors['button.secondaryBackground']),buttonText=luminance(t.colors['button.secondaryForeground']);
    assert.ok((Math.max(button,buttonText)+.05)/(Math.min(button,buttonText)+.05)>=4.5,`${t.name}: secondary button contrast`);
    for(const sev of ['error','warning','info','hint']){
      for(const suffix of ['Background','BackgroundLight','MessageBackground','RangeBackground'])assert.equal(t.colors['errorLens.'+sev+suffix],'#00000000',`${t.name}: ${sev}${suffix} stays transparent`);
      assert.equal(t.colors['errorLens.'+sev+'ForegroundLight'],t.colors['errorLens.'+sev+'Foreground']+'26',t.name+': '+sev+' Light message text stays 85-90% transparent');
    }
    const title=luminance(t.colors['titleBar.activeBackground']),titleForeground=luminance(t.colors['titleBar.inactiveForeground']);
    assert.ok((Math.max(title,titleForeground)+.05)/(Math.min(title,titleForeground)+.05)>=4.5,`${t.name}: inactive title controls contrast`);
    for(const fg of [t.colors['editor.foreground'],...t.tokenColors.map(r=>r.settings.foreground),...Object.values(t.semanticTokenColors)]){
      const l=luminance(fg),contrast=(Math.max(bg,l)+.05)/(Math.min(bg,l)+.05);
      assert.ok(contrast>=4.5,`${t.name}: ${fg} contrast ${contrast}`);
    }
  }
  assert.equal(backgrounds.size,17);
  for(let i=0;i<palettes.length;i++)for(let j=0;j<i;j++)if(palettes[i][1]===palettes[j][1]) {
    const distance=Math.hypot(...[1,3,5].map(index=>parseInt(palettes[i][2].slice(index,index+2),16)-parseInt(palettes[j][2].slice(index,index+2),16)));
    assert.ok(distance>=15,`${palettes[i][0]} and ${palettes[j][0]}: near-identical background colors`);
  }
});
test('a palette is applied as theme-scoped colours: personal colours stay, the previous Aster block is replaced, migrations work',()=>{
  const github=themes.find('GitHub Light'),oceanic=themes.find('oceanic pro');
  assert.equal(oceanic.name,'Oceanic Pro');assert.equal(themes.find('neon cyan').name,'Oceanic Pro');assert.equal(themes.find('ligth').name,'Cream Light');
  const values={'workbench.colorCustomizations':{'editorError.foreground':'#f8717126','[Personal Theme]':{'editor.background':'#abcdef'}},
    'editor.tokenColorCustomizations':{textMateRules:[{name:'mine',scope:'comment',settings:{foreground:'#123456'}}]}};
  const apply=changes=>Object.assign(values,structuredClone(changes)),read=key=>values[key];
  apply(themes.themeChanges(read,github));
  const light=values['workbench.colorCustomizations']['[Visual Studio Light]'];
  assert.equal(light['editor.background'],github.colors['editor.background']);
  assert.equal(Object.hasOwn(light,'editorError.foreground'),false,'a colour the user sets for every theme keeps winning');
  assert.deepEqual(values['workbench.colorCustomizations']['[Personal Theme]'],{'editor.background':'#abcdef'});
  assert.deepEqual(values['editor.tokenColorCustomizations'].textMateRules[0].name,'mine');
  assert.equal(values['workbench.colorTheme'],'Visual Studio Light');assert.equal(values['asterAppearance.theme'],'GitHub Light');
  apply(themes.themeChanges(read,oceanic));
  assert.equal(values['workbench.colorCustomizations']['[Visual Studio Light]'],undefined,'the unused Aster block is removed');
  assert.ok(values['editor.semanticTokenColorCustomizations']['[Visual Studio Dark]'].enabled);
  values['workbench.colorCustomizations']['[Visual Studio Light]']={'editor.background':'#fafafa'};
  apply(themes.themeChanges(read,themes.find('One Dark')));
  assert.deepEqual(values['workbench.colorCustomizations']['[Visual Studio Light]'],{'editor.background':'#fafafa'},'a block the user wrote is kept');
  assert.equal(themes.pending(key=>({'workbench.colorTheme':'git hab light'})[key]).name,'GitHub Light','an old contributed label migrates');
  assert.equal(themes.pending(key=>({'workbench.colorTheme':'Nord Light'})[key],name=>name==='Nord Light'),undefined,'a real theme of the same name wins');
  assert.equal(themes.pending(key=>({'workbench.colorTheme':'Antigravity Dark','asterAppearance.theme':'One Dark'})[key]),undefined,'a native theme stays');
  assert.equal(themes.pending(key=>({'workbench.colorTheme':'Visual Studio Dark','asterAppearance.theme':'One Dark'})[key]).name,'One Dark');
  assert.equal(themes.pending(key=>({'asterAppearance.theme':'One Dark'})[key]).name,'One Dark','a profile without its own theme gets the shared palette');
});
test('ten real licensed font families: payload hashes and sfnt headers',()=>{
  assert.equal(fonts.length,10);assert.equal(new Set(fonts.map(f=>f.family)).size,10);
  for(const font of fonts){
    assert.ok(font.files.some(f=>f.file.endsWith('/OFL.txt')));
    for(const item of font.files){const bytes=fs.readFileSync(path.join(source,item.file));assert.equal(digest(bytes),item.sha256);if(item.file.endsWith('.ttf'))assert.ok(['00010000','4f54544f'].includes(bytes.subarray(0,4).toString('hex')));}
  }
});
test('font/style/settings validators reject unsupported parameters',()=>{
  assert.throws(()=>validate({key:'size',value:NaN},[],fonts));assert.throws(()=>validate({key:'style',value:'fake'},[],fonts));
  assert.deepEqual(validate({key:'size',value:18},[],fonts),{'editor.fontSize':18});
});
test('every supported theme/font and setting boundary validates, while invalid panel requests are refused',()=>{
  const names=themes.THEMES.map(theme=>theme.name);
  for(const theme of names)assert.deepEqual(validate({key:'theme',value:theme},names,fonts),{'workbench.colorTheme':theme});
  for(const font of fonts)assert.equal(validate({key:'font',value:font.id},names,fonts),font);
  for(const value of [8,19,40])assert.deepEqual(validate({key:'size',value},names,fonts),{'editor.fontSize':value});
  for(let value=100;value<=900;value+=100)assert.deepEqual(validate({key:'weight',value},names,fonts),{'editor.fontWeight':String(value)});
  for(const value of ['normal','italic'])assert.deepEqual(validate({key:'style',value},names,fonts),{'asterAppearance.fontStyle':value});
  for(const change of [null,[],{key:'unknown',value:1},{key:'font',value:'missing'},{key:'theme',value:'missing'},
    ...[7,41,8.5,'19',null,NaN].map(value=>({key:'size',value})),...[0,50,1000,150,'700',NaN].map(value=>({key:'weight',value})),{key:'style',value:'oblique'}])assert.throws(()=>validate(change,names,fonts));
});
test('italic adds one owned rule and normal removes only it, retaining personal colours and selectors',()=>{
  const current={text:{'[Light+]':{comments:'#112233'},textMateRules:[{name:'mine',scope:'comment',settings:{foreground:'#123456'}}]},semantic:{rules:{'*':{foreground:'#abcdef'},'variable.readonly':{bold:true}}}};
  const result=styleSettings(current,true);assert.equal(current.text.textMateRules.length,1);assert.deepEqual(result.text['[Light+]'],current.text['[Light+]']);assert.equal(result.text.textMateRules[0].name,'mine');
  assert.equal(result.text.textMateRules.find(r=>r.name===STYLE_RULE).settings.fontStyle,'italic');
  assert.equal(result.semantic.rules['*'].foreground,'#abcdef');assert.equal(result.semantic.rules['*'].italic,true);assert.equal(result.semantic.rules['variable.readonly'].bold,true);
  assert.deepEqual(styleSettings(result,true),result);
  const normal=styleSettings(result,false);
  assert.equal(normal.text.textMateRules.some(r=>r.name===STYLE_RULE),false,'normal removes the owned rule instead of forcing upright text');
  assert.deepEqual(normal,{text:current.text,semantic:{rules:{'*':{foreground:'#abcdef'},'variable.readonly':{bold:true}}}});
  assert.deepEqual(styleSettings({},false),{text:{},semantic:{}});
});
test('global multi-setting failure rolls back prior writes, preserving unrelated concurrent settings',async()=>{
  const values={a:1,b:2,personal:42};
  const vscode={ConfigurationTarget:{Global:1},workspace:{getConfiguration:()=>({inspect:key=>({globalValue:values[key]}),update:async(key,value)=>{if(key==='b')throw new Error('disk unavailable');values[key]=value;}})}};
  await assert.rejects(updateGlobal(vscode,{a:10,b:20}),/previous settings restored/);assert.deepEqual(values,{a:1,b:2,personal:42});
});
test('multi-setting appearance updates never erase object fields edited while an earlier write awaits',async()=>{
  const values={a:1,b:{personal:'before'}};
  const vscode={ConfigurationTarget:{Global:1},workspace:{getConfiguration:()=>({inspect:key=>({globalValue:values[key]}),update:async(key,value)=>{
    values[key]=structuredClone(value);if(key==='a'&&value===10)values.b={personal:'concurrent edit',foreign:true};
  }})}};
  let failure;try{await updateGlobal(vscode,{a:10,b:{personal:'before',italic:true}});}catch(error){failure=error;}
  assert.deepEqual(values.b,{personal:'concurrent edit',foreign:true});
  assert.equal(values.a,1);assert.match(failure?.message||'',/changed.*applying|applying.*changed/);
});
test('explicit scalar choices can follow the host changing their scope during profile-sharing setup',async()=>{
  const values={sharing:[],size:17};
  const vscode={ConfigurationTarget:{Global:1},workspace:{getConfiguration:()=>({inspect:key=>({globalValue:values[key]}),update:async(key,value)=>{values[key]=structuredClone(value);if(key==='sharing')values.size=19;}})}};
  await updateGlobal(vscode,{sharing:['editor.fontSize'],size:25});
  assert.deepEqual(values,{sharing:['editor.fontSize'],size:25});
});
test('a concurrent identical object update remains idempotent and needs no second write',async()=>{
  const desired={personal:'keep',italic:true},values={a:1,b:{personal:'keep'}},writes=[];
  const vscode={ConfigurationTarget:{Global:1},workspace:{getConfiguration:()=>({inspect:key=>({globalValue:values[key]}),update:async(key,value)=>{writes.push(key);values[key]=structuredClone(value);if(key==='a')values.b=structuredClone(desired);}})}};
  await updateGlobal(vscode,{a:10,b:desired});assert.deepEqual(values,{a:10,b:desired});assert.deepEqual(writes,['a']);
});
test('italic preserves shorthand semantic wildcard colors and normal restores only owned style',()=>{
  const input={text:{textMateRules:[]},semantic:{enabled:true,rules:{'*':'#abcdef','class':'#112233'}}};
  const italic=styleSettings(input,true);
  assert.deepEqual(italic.semantic.rules['*'],{foreground:'#abcdef',italic:true});
  assert.equal(italic.semantic.rules.class,'#112233');
  assert.equal(input.semantic.rules['*'],'#abcdef');
  assert.deepEqual(styleSettings(italic,false).semantic.rules['*'],{foreground:'#abcdef'});
});
test('actual panel source shows bold as 700 and clears stale preview for an external system font',async()=>{
  const nodes=new Map(),handlers={};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',style:{},textContent:'',hidden:false,addEventListener(){},replaceChildren(...items){this.options=items.flatMap(item=>item.children||[item]);},prepend(item){this.options.unshift(item);}});return nodes.get(id);};
  const createElement=()=>({label:'',children:[],append(...items){this.children.push(...items);}});
  const context=vm.createContext({acquireVsCodeApi:()=>({postMessage(){}}),document:{getElementById:node,createElement,fonts:{add(){}}},window:{addEventListener:(type,handler)=>handlers[type]=handler},Option:function(text,value){this.text=text;this.value=value;},FontFace:function(){this.load=async()=>this;}});
  vm.runInContext(fs.readFileSync(path.join(source,'panel.js'),'utf8'),context);
  const state={type:'state',themes:[{label:'Oceanic Pro',value:'Oceanic Pro',kind:'dark',builtin:false}],theme:'Oceanic Pro',fonts:[{id:'jetbrainsmono',family:'JetBrains Mono',minWeight:100,maxWeight:800,weightStep:100,preview:[]}],availability:{},family:'JetBrains Mono',size:19,weight:'bold',style:'normal',profileScope:{status:'application-scoped'}};
  await handlers.message({data:state});
  assert.equal(node('weight').value,700);assert.equal(node('preview').style.fontWeight,700);
  assert.match(node('preview').style.fontFamily,/AsterPreview/);
  await handlers.message({data:{...state,family:'JetBrains Mono NL, monospace'}});
  assert.equal(node('font').value,'','A different font variant must not be mistaken for the bundled family');
  assert.equal(node('preview').style.fontFamily,'JetBrains Mono NL, monospace');
  await handlers.message({data:{...state,family:'Personal Mono, monospace',weight:'normal'}});
  assert.equal(node('preview').style.fontFamily,'Personal Mono, monospace');
  assert.equal(node('weight').value,400);
  assert.match(node('availability').textContent,/Текущий шрифт редактора/);
});
test('panel refresh keeps a pending font choice until Apply or Cancel, and follows applied values otherwise',async()=>{
  const nodes=new Map(),handlers={};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',style:{},textContent:'',hidden:false,addEventListener(){},replaceChildren(...items){this.options=items.flatMap(item=>item.children||[item]);},prepend(item){this.options.unshift(item);}});return nodes.get(id);};
  const createElement=()=>({label:'',children:[],append(...items){this.children.push(...items);}});
  const posted=[];
  const context=vm.createContext({acquireVsCodeApi:()=>({postMessage(value){posted.push(value);}}),document:{getElementById:node,createElement,fonts:{add(){}}},window:{addEventListener:(type,handler)=>handlers[type]=handler},Option:function(text,value){this.text=text;this.value=value;},FontFace:function(){this.load=async()=>this;}});
  vm.runInContext(fs.readFileSync(path.join(source,'panel.js'),'utf8'),context);
  const state={type:'state',themes:[{label:'Oceanic Pro',value:'Oceanic Pro',kind:'dark',builtin:false}],theme:'Oceanic Pro',fonts:[{id:'firacode',family:'Fira Code',minWeight:300,maxWeight:700,weightStep:100,preview:[]}],availability:{},family:'Fira Code',size:21,weight:'600',style:'normal',profileScope:{status:'application-scoped'}};
  await handlers.message({data:state});
  assert.equal(node('size').value,21);assert.equal(node('applyFont').disabled,true,'nothing pending, nothing to apply');
  await handlers.message({data:{...state,size:16}});
  assert.equal(node('size').value,16,'without a pending edit the panel follows the applied value');
  node('size').value=30;
  await handlers.message({data:{...state,size:18,weight:'400'}});
  assert.equal(node('size').value,30,'a pending edit survives a refresh');
  assert.equal(node('applyFont').disabled,false);
  assert.equal(posted.filter(message=>message.type==='apply-font').length,0,'editing alone never applies anything');
});
test('font registration runs with -ExecutionPolicy Bypass so a default Windows policy cannot block it',()=>{
  const service=fs.readFileSync(path.join(source,'font-service.cjs'),'utf8');
  assert.match(service,/'-ExecutionPolicy','Bypass','-File'/,'the install-font.ps1 invocation must bypass the execution policy');
});
test('setup preserves selected theme and all editor font preferences',()=>{
  const current={'workbench.colorTheme':'Light+','editor.fontFamily':'Fira Code','editor.fontSize':19,'editor.fontWeight':'600','asterAppearance.fontStyle':'italic'};
  const result=mergeSettings(current,{'workbench.colorTheme':'oceanic pro','editor.fontFamily':'JetBrains Mono','editor.fontSize':15,'editor.fontWeight':'400'});
  assert.deepEqual(result,current);
});
test('fonts install from the verified bundle only: no download, corrupt files refused, staging cleaned',async()=>{
  const service=require('../extensions/aster-appearance/font-service.cjs'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aster-bundle-')),previousFetch=globalThis.fetch;
  try{
    globalThis.fetch=async()=>assert.fail('fonts must never be downloaded');
    const copy=path.join(temp,'root'),storage=path.join(temp,'storage');fs.mkdirSync(storage);
    const font=fonts.find(item=>item.id==='firacode'),file=font.files.find(item=>item.file.endsWith('.ttf'));
    fs.mkdirSync(path.dirname(path.join(copy,file.file)),{recursive:true});fs.writeFileSync(path.join(copy,file.file),'corrupt font');
    await assert.rejects(service.install(copy,font,storage),/Bundled font checksum mismatch/);
    assert.deepEqual(fs.readdirSync(storage),[]);
    const stage=path.join(temp,'stage');fs.mkdirSync(stage);
    const staged=service.stageBundled(source,font,stage);
    assert.equal(staged.length,font.files.filter(item=>item.file.endsWith('.ttf')).length);
    for(const item of staged)assert.match(path.basename(item),/^Aster-firacode-[0-9a-f]{12}\.ttf$/);
  }finally{globalThis.fetch=previousFetch;fs.rmSync(temp,{recursive:true,force:true});}
});
test('rollback refuses to overwrite a concurrent user change and reports incomplete recovery',async()=>{
  const values={a:1,b:2};
  const vscode={ConfigurationTarget:{Global:1},workspace:{getConfiguration:()=>({inspect:key=>({globalValue:values[key]}),update:async(key,value)=>{if(key==='b'){values.a=99;throw new Error('fixture disk failure');}values[key]=value;}})}};
  await assert.rejects(updateGlobal(vscode,{a:10,b:20}),/rollback incomplete: a changed concurrently/);
  assert.deepEqual(values,{a:99,b:2});
});
test('all-profiles host action is idempotent and cannot be duplicated by concurrent hosts',async()=>{
  const {ensureAllProfiles}=require('../extensions/aster-appearance/profiles.cjs');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aster-global-')),extensionPath=path.join(temp,'workstation.aster-appearance-1.0.0'),index=path.join(temp,'extensions.json');
  fs.mkdirSync(extensionPath);const entry={identifier:{id:'workstation.aster-appearance'},metadata:{isApplicationScoped:false}};
  fs.writeFileSync(index,JSON.stringify([entry]));let calls=0,release;
  const held=new Promise(resolve=>release=resolve),context={extensionPath,extensionUri:{scheme:'file',path:extensionPath}};
  const vscode={version:'1.107.0',commands:{getCommands:async()=>['workbench.extensions.action.toggleApplyToAllProfiles'],executeCommand:async(command,id,argument)=>{
    assert.equal(command,'workbench.extensions.action.toggleApplyToAllProfiles');assert.equal(id,'workstation.aster-appearance');assert.deepEqual(argument,{location:context.extensionUri});calls++;await held;entry.metadata.isApplicationScoped=true;fs.writeFileSync(index,JSON.stringify([entry]));
  }}};
  try{
    const first=ensureAllProfiles(vscode,context);await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal((await ensureAllProfiles(vscode,context)).status,'busy');release();assert.equal((await first).status,'application-scoped');
    assert.equal((await ensureAllProfiles(vscode,context)).status,'application-scoped');assert.equal(calls,1);
  }finally{release();fs.rmSync(temp,{recursive:true,force:true});}
});
test('legacy cleanup requires actual prior ownership proof and retains changed/foreign colors and arrays',()=>{
  const {migrateAppearance}=require('../lib/appearance-migration'),legacy=require('../config/legacy-appearance.json');
  const current={'workbench.colorCustomizations':{...structuredClone(legacy['workbench.colorCustomizations']),'[Light+]':{'editor.background':'#fff'},'personal.customColor':'#123456'},'editor.tokenColorCustomizations':structuredClone(legacy['editor.tokenColorCustomizations'])};
  current['workbench.colorCustomizations']['[One Dark Pro]']['sideBar.background']='#112233';
  assert.deepEqual(migrateAppearance(current).settings,current);
  const profile={schema:1,setupVersion:'3.0.25',requestId:'previous-install',settings:legacy};
  const result=migrateAppearance(current,profile);
  assert.ok(result.removed.includes('workbench.colorCustomizations.editorCursor.foreground'));
  assert.deepEqual(result.settings['workbench.colorCustomizations']['[One Dark Pro]'],{'sideBar.background':'#112233'});
  assert.deepEqual(result.settings['workbench.colorCustomizations']['[Light+]'],{'editor.background':'#fff'});
  assert.equal(result.settings['workbench.colorCustomizations']['personal.customColor'],'#123456');
  assert.deepEqual(result.settings['editor.tokenColorCustomizations'],{});
  assert.deepEqual(migrateAppearance(result.settings,profile),{settings:result.settings,removed:[]});
  assert.ok(current['workbench.colorCustomizations']['editorCursor.foreground'],'input is untouched');
});
test('built VSIX is deterministic and all installed files verified; fresh/repeat/corruption repair retain foreign extensions',()=>{
  const {build}=require('../scripts/package-aster.cjs'),{installAppearance}=require('../lib/appearance-extension');
  const built=build();assert.deepEqual(built.bytes,fs.readFileSync(built.file));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aster-install-'));
  try{
    const foreign={identifier:{id:'personal.extension'},version:'1.0.0',relativeLocation:'personal.extension-1.0.0'};
    fs.writeFileSync(path.join(dir,'extensions.json'),JSON.stringify([foreign]));
    const first=installAppearance(null,dir,source,{isolated:true});assert.equal(first.success,true);
    assert.equal(installAppearance(null,dir,source,{isolated:true}).unchanged,true);
    const list=JSON.parse(fs.readFileSync(path.join(dir,'extensions.json'))),own=list.find(e=>e.identifier.id==='workstation.aster-appearance');
    const packageFile=path.join(dir,own.relativeLocation,'package.json'),installedPackage=JSON.parse(fs.readFileSync(packageFile));
    installedPackage.__metadata={installedTimestamp:123,targetPlatform:'undefined'};
    fs.writeFileSync(packageFile,JSON.stringify(installedPackage));
    assert.equal(installAppearance(null,dir,source,{isolated:true}).unchanged,true,'Official CLI metadata does not count as corrupted extension source');
    own.identifier.uuid='fixture-local-id';own.metadata={isApplicationScoped:true,personalFlag:{keep:true}};
    fs.writeFileSync(path.join(dir,'extensions.json'),JSON.stringify(list));
    for(const content of ['{invalid','null','[]']){
      fs.writeFileSync(packageFile,content);
      const repaired=installAppearance(null,dir,source,{isolated:true});
      assert.equal(repaired.success,true,'Malformed installed manifest must be repairable');
      assert.equal(fs.readFileSync(path.join(repaired.backup,'package.json'),'utf8'),content,'Original corrupt manifest is retained for recovery');
      assert.deepEqual(JSON.parse(fs.readFileSync(packageFile)),pkg);
      const registration=JSON.parse(fs.readFileSync(path.join(dir,'extensions.json'))).find(item=>item.identifier.id===own.identifier.id);
      assert.deepEqual(registration.metadata,own.metadata,'Repair must retain existing all-profiles registration and unknown metadata');
      assert.deepEqual(registration.identifier,own.identifier);
    }
    const target=path.join(dir,own.relativeLocation,'panel.js');fs.writeFileSync(target,'corrupt');
    assert.equal(installAppearance(null,dir,source,{isolated:true}).success,true);
    assert.deepEqual(fs.readFileSync(target),fs.readFileSync(path.join(source,'panel.js')));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'extensions.json')))[0],foreign);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Malformed or linked appearance inventory refuses without changing any foreign bytes',t=>{
  const {installAppearance}=require('../lib/appearance-extension'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aster-index-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const dir=path.join(temp,'extensions');fs.mkdirSync(dir);const index=path.join(dir,'extensions.json');
  for(const value of ['null','{}','[null]','[7]']){
    fs.writeFileSync(index,value);
    assert.throws(()=>installAppearance(null,dir,source,{isolated:true,dryRun:true}),/Invalid Aster Atelier extension index/);
    assert.throws(()=>installAppearance(null,dir,source,{isolated:true}),/Invalid Aster Atelier extension index/);
    assert.equal(fs.readFileSync(index,'utf8'),value);assert.deepEqual(fs.readdirSync(dir),['extensions.json']);
  }
  const personal=path.join(temp,'personal.json');fs.writeFileSync(personal,'[]');fs.unlinkSync(index);
  if(process.platform==='win32'){
    fs.renameSync(dir,path.join(temp,'original-extensions'));
    const outside=path.join(temp,'personal-extensions');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'extensions.json'),'[]');
    try {
      fs.symlinkSync(outside,dir,'junction');
    } catch (e) {
      if (e.code === 'EPERM') { t.skip('Windows environment restricted junction creation'); return; }
      throw e;
    }
  }else fs.symlinkSync(personal,index);
  assert.throws(()=>installAppearance(null,dir,source,{isolated:true}),/Linked setup path/);
  assert.equal(fs.readFileSync(personal,'utf8'),'[]');assert.equal(fs.lstatSync(process.platform==='win32'?dir:index).isSymbolicLink(),true);
});

test('real Antigravity native theme options are offered beside Aster palettes, never as duplicates', () => {
  assert.equal(pkg.contributes.themes, undefined);
  assert.ok(!themes.THEMES.some(theme => /^Antigravity /.test(theme.name)));
  const module = { exports: {} }, nativeRequire = createRequire(path.join(source, 'extension.cjs'));
  vm.runInNewContext(fs.readFileSync(path.join(source, 'extension.cjs'), 'utf8'), {
    module, exports: module.exports, require: name => name === 'vscode' ? {} : nativeRequire(name)
  });
  const options = ids => module.exports.nativeThemeOptions([{ packageJSON: { contributes: {
    themes: ids.map(id => ({ id, label: 'Localized label' }))
  } } }]);
  for (const ids of [['Antigravity Light', 'Antigravity Dark'], ['Default Light Modern', 'Default Dark Modern']]) {
    assert.deepEqual(Array.from(options(ids), item => item.value), ids,
      'The panel must write registered theme IDs, including the official 2.6.0 defaults');
    assert.deepEqual(Array.from(options(ids), item => item.label), ['Antigravity Light', 'Antigravity Dark']);
  }
  assert.equal(options([]).length, 0, 'Unknown theme IDs must never be offered as working native themes');
  assert.equal(options(['Default Light Modern', 'Antigravity Light'])[0].value, 'Antigravity Light');
  assert.ok(!Object.values(themes.BASE).some(base => ['Default Light Modern', 'Default Dark Modern', 'Antigravity Light', 'Antigravity Dark'].includes(base)),
    'Aster colours never ride on the theme Antigravity itself offers as Light/Dark');
});
test('theme and font apply paths never rewrite profile sharing and only commit on Apply', () => {
  const src = fs.readFileSync(path.join(root,'extensions/aster-appearance/extension.cjs'),'utf8'),panel=fs.readFileSync(path.join(source,'panel.js'),'utf8');
  assert.ok(!src.includes("'workbench.settings.applyToAllProfiles':"));
  assert.match(src,/message\?\.type==='apply-theme'/);assert.match(src,/message\?\.type==='apply-font'/);
  assert.equal((panel.match(/api\.postMessage\(\{type:'apply-(?:theme|font)'/g)||[]).length,2,'only the two Apply buttons send changes');
});
test('fifty theme and font switches do not alter personal settings or color rules', async () => {
  const personal = {
    'editor.fontFamily': 'My Mono',
    'editor.fontSize': 19,
    'editor.tokenColorCustomizations': { textMateRules: [{ name: 'Personal', scope: 'variable', settings: { foreground: '#123456' } }] },
    'editor.semanticTokenColorCustomizations': { rules: { 'variable.readonly': { bold: true } } },
    'workbench.settings.applyToAllProfiles': ['personal.setting'],
    'workbench.colorCustomizations': { '[Personal Theme]': { 'editor.background': '#abcdef' } }
  };
  const values = structuredClone(personal), original = structuredClone(personal);
  values['workbench.colorTheme'] = 'Antigravity Dark';
  const vscode = { ConfigurationTarget: { Global: 1 }, workspace: { getConfiguration: () => ({
    inspect: key => ({ globalValue: values[key] }), update: async (key, value) => { values[key] = structuredClone(value); }
  }) } };
  for (let i = 0; i < 50; i++) {
    await updateGlobal(vscode, validate({ key: 'theme', value: i % 2 ? 'Antigravity Dark' : 'Antigravity Light' }, ['Antigravity Light','Antigravity Dark'], fonts));
    const font = fonts[i % fonts.length];
    await updateGlobal(vscode, { 'editor.fontFamily': `'${font.family}', monospace` });
    for (const key of Object.keys(original).filter(key => key !== 'editor.fontFamily')) assert.deepEqual(values[key], original[key]);
  }
  assert.equal(values['workbench.colorTheme'], 'Antigravity Dark');
});

test('studio shows Theme and Font sections, each with its own Apply and Cancel buttons', () => {
  const text = fs.readFileSync(path.join(source, 'extension.cjs'), 'utf8');
  assert.match(text, /<h2>Тема<\/h2>/);
  assert.match(text, /<h2>Шрифт<\/h2>/);
  for (const id of ['applyTheme','cancelTheme','applyFont','cancelFont']) assert.match(text, new RegExp('id="'+id+'"'));
  assert.match(text, /Применить шрифт/);
});
test('repeat install archives older Aster folders instead of leaving them in the profile',()=>{
  const {installAppearance}=require('../lib/appearance-extension');
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'aster-stale-')),dir=path.join(home,'.antigravity-ide','extensions');
  try{
    fs.mkdirSync(dir,{recursive:true});
    assert.equal(installAppearance(null,dir,source,{isolated:true,log(){}}).success,true);
    const old=path.join(dir,'workstation.aster-appearance-1.0.5');
    fs.mkdirSync(old);fs.writeFileSync(path.join(old,'package.json'),JSON.stringify({publisher:'workstation',name:'aster-appearance',version:'1.0.5'}));
    const result=installAppearance(null,dir,source,{isolated:true,log(){}});
    assert.equal(result.unchanged,true);
    assert.equal(result.archived.length,1);
    assert.equal(fs.existsSync(old),false,'old copy leaves the extensions folder');
    assert.ok(fs.readdirSync(path.join(home,'.gemini','backups')).some(name=>name.startsWith('extension-stale-')),'old copy is kept in backups');
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});
test('setup registers only the missing Aster families from the bundle, never the ones Windows already has',()=>{
  const {ensureAsterFonts}=require('../lib/font'),calls=[],staged=[];
  const run=(file,args)=>{
    calls.push(args);
    if(args.includes('-Command'))return {status:0,stdout:JSON.stringify(['JetBrains Mono','Fira Code','Segoe UI'])};
    const stage=args[args.indexOf('-Stage')+1];staged.push(fs.readdirSync(stage));return {status:0,stdout:''};
  };
  const result=ensureAsterFonts({platform:'win32',run,log(){}});
  assert.deepEqual(result.installed,fonts.filter(font=>!['JetBrains Mono','Fira Code'].includes(font.family)).map(font=>font.family));
  assert.equal(staged.length,8);
  for(const files of staged)assert.ok(files.length>0&&files.every(name=>/^Aster-[a-z]+-[0-9a-f]{12}\.ttf$/.test(name)));
  assert.ok(calls.filter(args=>args.includes('-File')).every(args=>args.includes('Bypass')&&args[args.indexOf('-File')+1].endsWith('install-font.ps1')));
  assert.deepEqual(ensureAsterFonts({platform:'linux'}).skipped,true);
  assert.throws(()=>ensureAsterFonts({platform:'win32',run:()=>({status:1,stderr:'denied'}),log(){}}),/Could not list installed fonts/);
});
