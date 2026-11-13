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
const {contrast}=require('../extensions/aster-appearance/color.cjs');

test('Capture publication refuses non-hosted invocation and incomplete or non-native evidence', t => {
  const { verify, publish } = require('./publish-aster-capture.cjs');
  assert.throws(() => publish({}), /Explicit hosted capture publication/);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-capture-validator-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const synthetic = { host: { name: 'Antigravity IDE', platform: 'win32' }, installed: { id: 'workstation.aster-appearance', version: 'fixture-only' },
    themes: Array.from({ length: palettes.length }, (_, index) => ({ name: String(index), actual: '#000000', expected: '#000000', appliedThroughAster: true })),
    panel: { fonts: 10, fontPreviews: Array.from({ length: 10 }, () => ({ actualEditorFonts: [{ glyphCount: 1 }] })), selectorChangesActualSettings: true,
      captureStates: [{ kind: 'light', theme: 'GitHub Light', previewVisible: true }, { kind: 'dark', theme: 'One Dark Pro', previewVisible: true }] },
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
  const webview = { asWebviewUri: uri => uri, postMessage: async value => { posted.push(value); return true; }, onDidReceiveMessage: callback => { receive = callback; return { dispose() {} }; } };
  const vscode = { ConfigurationTarget: { Global: 1 }, Uri: { file: file => ({ fsPath: file, toString: () => file }) }, ViewColumn: { One: 1 },
    commands: { registerCommand: (name, callback) => { commands.set(name, callback); return { dispose() {} }; } },
    window: { createWebviewPanel: () => ({ webview, onDidDispose: () => ({ dispose() {} }) }), showErrorMessage: message => assert.fail(message) },
    workspace: { onDidChangeConfiguration: () => ({ dispose() {} }), getConfiguration: () => {
      const snapshot = selected;
      return { inspect: () => ({ globalValue: undefined }), get: key => key === 'workbench.colorTheme' ? snapshot : undefined, update: async () => {} };
    } } };
  const module = { exports: {} }, nativeRequire = createRequire(path.join(source, 'extension.cjs'));
  const loader = name => name === 'vscode' ? vscode : name === './font-service.cjs' ? { installed: async () => { entered(); return detection; }, recorded: () => [], ensureBundled: async () => ({ added: [], failed: [] }) }
    : name === './profiles.cjs' ? { ensureAllProfiles: async () => ({ status: 'application-scoped' }) } : nativeRequire(name);
  vm.runInNewContext(fs.readFileSync(path.join(source, 'extension.cjs'), 'utf8'), { module, exports: module.exports, require: loader, setTimeout, clearTimeout, console });
  const context = { extensionPath: source, subscriptions: [], globalStorageUri: { fsPath: os.tmpdir() }, globalState: { get: () => ({ status: 'application-scoped' }), update: async () => {} } };
  await module.exports.activate(context);
  await commands.get('asterAppearance.open')();
  receive({ type: 'ready' });
  await detectionStarted;
  selected = 'Antigravity Light'; release({});
  for (let attempt = 0; attempt < 10 && !posted.some(value => value.type === 'init'); attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(posted.find(value => value.type === 'init')?.state.theme, 'Antigravity Light');
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
    : name === './font-service.cjs' ? { installed: async () => ({}), recorded: () => [], ensureBundled: async () => ({ added: [], failed: [] }) } : nativeRequire(name);
  vm.runInNewContext(fs.readFileSync(path.join(source, 'extension.cjs'), 'utf8'), { module, exports: module.exports, require: loader, setTimeout, clearTimeout, console });
  const context = { extensionPath: source, subscriptions: [], globalStorageUri: { fsPath: os.tmpdir() }, globalState: { update: async () => {} } };
  await module.exports.activate(context);
  // Startup keeps the native theme and only adds the owned upright-style rule, once.
  assert.equal(values['workbench.colorTheme'], 'Light+', 'a native theme is left alone at startup');
  assert.equal(writes, 1, 'the only startup write is the chosen font style for every theme');
  assert.deepEqual(values['editor.tokenColorCustomizations'].textMateRules.map(rule => rule.settings.fontStyle), ['']);
  await module.exports.activate(context);
  assert.equal(writes, 1, 'a second start writes nothing');
  writes = 0;
  await commands.get('asterAppearance.selectTheme')();
  assert.equal(shown, 1);
  assert.equal(webviewOpens, 0, 'the shortcut opens the quick pick, not the studio');
  const rows = picker.items.filter(item => item.option);
  assert.equal(rows.length, themes.THEMES.length, 'every Aster palette is offered');
  picker.activeItems = [rows[2]];
  assert.equal(values['workbench.colorTheme'], 'Light+', 'highlighting another row must not change the theme');
  assert.equal(writes, 0);
  const target = rows.find(item => item.label === 'GitHub Dark');
  assert.ok(target, 'the picker lists Aster palettes by name');
  picker.selectedItems = [target];
  await accepts();
  for (let attempt = 0; attempt < 20 && !values['asterAppearance.theme']; attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(values['asterAppearance.theme'], 'GitHub Dark', 'only the explicit accept commits the picked theme');
  assert.equal(values['workbench.colorTheme'], 'Visual Studio Dark');
  assert.equal(values['workbench.colorCustomizations']['[Visual Studio Dark]']['editor.background'], themes.find('GitHub Dark').colors['editor.background']);
});
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function luminance(hex){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
test('twenty-two distinct palettes colour every IDE surface with readable code and transparent Error Lens',()=>{
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
  assert.equal(managed['asterAppearance.theme'],'One Dark Pro');
  assert.equal(managed['workbench.colorTheme'],themes.BASE.dark);
  assert.equal(pkg.contributes.themes,undefined,'Contributed themes would bring back the IDE picker that previews while hovering');
  assert.equal(themes.THEMES.length,22);assert.equal(palettes.length,22);
  assert.equal(new Set(themes.THEMES.map(t=>t.name.toLowerCase())).size,22);
  // Near-duplicates removed in 1.3.0 open the palette they repeated.
  assert.deepEqual(['Monokai','Material Palenight','Shades of Purple'].map(name=>themes.find(name).name),['Dracula','Tokyo Night','Cobalt2']);
  for(const name of Object.values(palettes.legacy))assert.ok(themes.find(name),'legacy label maps to an existing palette: '+name);
  const known=new Set(registry.registry),backgrounds=new Set();
  for(const t of themes.THEMES){
    assert.match(t.name,/^[A-Z][A-Za-z0-9]*(?: (?:of|[A-Z0-9][A-Za-z0-9]*))*$/,'professional title-case name: '+t.name);
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
  assert.equal(backgrounds.size,22);
  // No palette repeats another: across background, text and twelve code roles of
  // the themes they follow, every two palettes of a kind differ by 0.09 in OKLab on average.
  const {toOklch}=require('../extensions/aster-appearance/color.cjs');
  const lab=hex=>{const [L,C,H]=toOklch(hex.slice(0,7));return [L,C*Math.cos(H*Math.PI/180),C*Math.sin(H*Math.PI/180)];};
  const roles=['keyword','func','type','variable','property','string','number','tag','attribute','parameter','comment','operator'];
  const colours=p=>[p[2],p[4],...roles.map(role=>p[7][role])];
  for(let i=0;i<palettes.length;i++)for(let j=0;j<i;j++){
    if(palettes[i][1]!==palettes[j][1])continue;
    const a=colours(palettes[i]),b=colours(palettes[j]);
    const average=a.reduce((sum,colour,index)=>sum+Math.hypot(...lab(colour).map((value,k)=>value-lab(b[index])[k])),0)/a.length;
    assert.ok(average>=0.09,`${palettes[i][0]} and ${palettes[j][0]} repeat each other (${average.toFixed(3)})`);
  }
  // Every code role has its own colour: a function never looks like an import or a string.
  for(const t of themes.THEMES){
    const roles=['keyword','function','string','number','type','comment'].map(role=>t.semanticTokenColors[role]);
    assert.equal(new Set(roles).size,roles.length,t.name+': keyword, function, string, number, type and comment are distinct');
  }
});
test('a palette is applied as theme-scoped colours: personal colours stay, the previous Aster block is replaced, migrations work',()=>{
  const github=themes.find('GitHub Light'),oceanic=themes.find('oceanic pro');
  assert.equal(oceanic.name,'Night Owl','an earlier palette opens its closest new palette');assert.equal(themes.find('neon cyan').name,'Night Owl');assert.equal(themes.find('ligth').name,'Solarized Light');
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
  values['workbench.colorCustomizations']['[Visual Studio Light]']={'editor.background':'#f9f9f7'};
  apply(themes.themeChanges(read,themes.find('One Dark Pro')));
  assert.deepEqual(values['workbench.colorCustomizations']['[Visual Studio Light]'],{'editor.background':'#f9f9f7'},'a block the user wrote is kept');
  assert.equal(themes.pending(key=>({'workbench.colorTheme':'git hab light'})[key]).name,'GitHub Light','an old contributed label migrates');
  assert.equal(themes.pending(key=>({'workbench.colorTheme':'Tokyo Night'})[key],name=>name==='Tokyo Night'),undefined,'the IDE\'s own Tokyo Night theme wins over the palette name');
  assert.equal(themes.pending(key=>({'workbench.colorTheme':'Antigravity Dark','asterAppearance.theme':'One Dark'})[key]),undefined,'a native theme stays');
  assert.equal(themes.pending(key=>({'workbench.colorTheme':'Visual Studio Dark','asterAppearance.theme':'One Dark'})[key]).name,'One Dark Pro');
  assert.equal(themes.pending(key=>({'asterAppearance.theme':'One Dark'})[key]).name,'One Dark Pro','a profile without its own theme gets the shared palette');
  // Brightness and contrast retune only code colours, stay readable, and the
  // retuned block is still recognised as Aster's when the other kind is chosen.
  const tuned=themes.themeChanges(read,themes.find('Dracula'),{brightness:30,contrast:30});
  assert.equal(tuned['asterAppearance.brightness'],30);assert.equal(tuned['asterAppearance.contrast'],30);
  const dracula=themes.find('Dracula'),rules=tuned['editor.tokenColorCustomizations']['[Visual Studio Dark]'].textMateRules;
  assert.deepEqual(tuned['workbench.colorCustomizations']['[Visual Studio Dark]']['editor.background'],dracula.colors['editor.background']);
  assert.ok(rules.some((rule,index)=>rule.settings.foreground!==dracula.tokenColors[index].settings.foreground),'code colours change');
  for(const rule of rules)assert.ok(contrast(rule.settings.foreground,dracula.colors['editor.background'])>=4.5,'tuned code stays readable');
  for(const level of [{brightness:-30,contrast:-20},{brightness:30,contrast:30}]){
    const block=themes.themeChanges(read,dracula,level);
    for(const kind of ['tokens','semantic'])assert.ok(themes.owned(kind,block[themes.KEYS[kind]]['[Visual Studio Dark]']),kind+' block stays owned');
  }
  assert.deepEqual(themes.tuning({brightness:99,contrast:-99}),{brightness:30,contrast:-20});
});
test('eleven real licensed font families with coding ligatures: payload hashes and sfnt headers',()=>{
  assert.deepEqual(fonts.slice(0,5).map(f=>f.family),['JetBrains Mono','Fira Code','Cascadia Code','Victor Mono','Lilex'],'the original five families keep their order');
  assert.equal(fonts.length,11);assert.equal(new Set(fonts.map(font=>font.family)).size,11);
  assert.ok(fonts.some(font=>font.family==='Fragment Mono'),'Fragment Mono is bundled');
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
test('italic adds one owned rule and normal swaps it for an upright one, retaining personal colours and selectors',()=>{
  const current={text:{'[Light+]':{comments:'#112233'},textMateRules:[{name:'mine',scope:'comment',settings:{foreground:'#123456'}}]},semantic:{rules:{'*':{foreground:'#abcdef'},'variable.readonly':{bold:true}}}};
  const result=styleSettings(current,true);assert.equal(current.text.textMateRules.length,1);assert.deepEqual(result.text['[Light+]'],current.text['[Light+]']);assert.equal(result.text.textMateRules[0].name,'mine');
  assert.equal(result.text.textMateRules.find(r=>r.name===STYLE_RULE).settings.fontStyle,'italic');
  assert.equal(result.semantic.rules['*'].foreground,'#abcdef');assert.equal(result.semantic.rules['*'].italic,true);assert.equal(result.semantic.rules['variable.readonly'].bold,true);
  assert.deepEqual(styleSettings(result,true),result);
  const normal=styleSettings(result,false);
  // Normal is upright in every theme (Quiet Light's bold functions, Solarized's bold const included),
  // and the owned rule comes first so the user's own font styles still win.
  assert.deepEqual(normal.text.textMateRules.map(r=>r.name),[STYLE_RULE,'mine']);
  assert.equal(normal.text.textMateRules[0].settings.fontStyle,'');
  for(const scope of ['entity.name.function','entity.name.type','storage','comment'])assert.ok(normal.text.textMateRules[0].scope.includes(scope),scope+' is upright');
  assert.deepEqual(normal.text['[Light+]'],current.text['[Light+]']);
  assert.deepEqual(normal.semantic,{rules:{'*':{foreground:'#abcdef'},'variable.readonly':{bold:true}}});
  assert.deepEqual(styleSettings(normal,false),normal,'normal is idempotent');
  assert.deepEqual(styleSettings({},false).text.textMateRules.map(r=>r.settings.fontStyle),['']);
  assert.deepEqual(styleSettings(styleSettings({},false),true).text.textMateRules.map(r=>r.settings.fontStyle),['italic'],'switching back to italic leaves one rule');
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
  const built=build();assert.equal(digest(built.bytes),digest(fs.readFileSync(built.file)),'the committed VSIX is the build output');
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
  assert.equal(staged.length,fonts.length-2);
  for(const files of staged)assert.ok(files.length>0&&files.every(name=>/^Aster-[a-z]+-[0-9a-f]{12}\.ttf$/.test(name)));
  assert.ok(calls.filter(args=>args.includes('-File')).every(args=>args.includes('Bypass')&&args[args.indexOf('-File')+1].endsWith('install-font.ps1')));
  assert.deepEqual(ensureAsterFonts({platform:'linux'}).skipped,true);
  assert.throws(()=>ensureAsterFonts({platform:'win32',run:()=>({status:1,stderr:'denied'}),log(){}}),/Could not list installed fonts/);
});
test('the interface font checkbox writes the workbench style only for a plain font list and removes it when off',()=>{
  const ui=require('../extensions/aster-appearance/ui-style.cjs');
  assert.equal(ui.css({uiFont:false,family:"'JetBrains Mono', monospace"}),ui.HEADER);
  const on=ui.css({uiFont:true,family:"'JetBrains Mono', monospace"});
  assert.match(on,/\.monaco-workbench[^{]*\{ font-family: 'JetBrains Mono', monospace !important; \}/);
  assert.match(on,/:not\(\.codicon\)/,'icon fonts keep their glyphs');assert.match(on,/:not\(\.monaco-editor \*\)/,'the editor keeps its own font settings');
  for(const family of ["x; } body { display:none","a{}",'url(evil)',''])assert.equal(ui.css({uiFont:true,family}),ui.HEADER,'unsafe family is never written: '+family);
  const appRoot=fs.mkdtempSync(path.join(os.tmpdir(),'aster-ui-'));
  try{
    assert.match(ui.write(appRoot,{uiFont:true,family:'Geist Mono'}).skipped,/workbench\.html/,'nothing is written outside a real IDE install');
    fs.mkdirSync(ui.directory(appRoot),{recursive:true});fs.writeFileSync(path.join(ui.directory(appRoot),'workbench.html'),'<html>');
    assert.equal(ui.write(appRoot,{uiFont:true,family:'Geist Mono'}).written,true);
    assert.equal(ui.write(appRoot,{uiFont:true,family:'Geist Mono'}).unchanged,true);
    assert.equal(ui.write(appRoot,{uiFont:false,family:'Geist Mono'}).written,true);
    assert.equal(fs.readFileSync(path.join(ui.directory(appRoot),ui.FILE),'utf8'),ui.HEADER);
    // The note says "within a second" only when the window really loads the addon.
    assert.equal(ui.addonReady(appRoot),false,'a workbench without the addon needs a restart');
    const stability=require('../extensions/workstation-stability/workbench-ui.cjs');
    fs.writeFileSync(path.join(ui.directory(appRoot),'workbench.html'),'<html>\n</html>\n');
    stability.ensure(path.join(ui.directory(appRoot),'workbench.html'));
    assert.equal(ui.addonReady(appRoot),true,'the addon setup adds is seen');
    assert.equal(fs.readFileSync(path.join(ui.directory(appRoot),ui.FILE),'utf8'),ui.HEADER,'the addon never overwrites the style Aster wrote');
    assert.equal(ui.FILE,stability.STYLE);assert.equal(ui.HEADER,stability.STYLE_HEADER);
  }finally{fs.rmSync(appRoot,{recursive:true,force:true});}
});
test('four standard VS Code themes are offered in their own group in the studio and the quick picker', async () => {
  const contributed = ['Default Light Modern', 'Default Dark Modern', 'Default Dark+', 'Default Light+', 'Solarized Dark', 'Quiet Light', 'Visual Studio Dark', 'Visual Studio Light', 'Monokai'];
  const commands = new Map(); let picker;
  const vscode = { ConfigurationTarget: { Global: 1 }, extensions: { all: [{ packageJSON: { contributes: { themes: contributed.map(id => ({ id, label: 'Localized' })) } } }] },
    commands: { registerCommand: (name, callback) => { commands.set(name, callback); return { dispose() {} }; } },
    window: { createQuickPick: () => picker = { items: [], selectedItems: [], onDidAccept() {}, show() {}, hide() {} }, showErrorMessage: message => assert.fail(message) },
    workspace: { onDidChangeConfiguration: () => ({ dispose() {} }), getConfiguration: () => ({ get: () => undefined, inspect: () => ({}), update: async () => {} }) } };
  const module = { exports: {} }, nativeRequire = createRequire(path.join(source, 'extension.cjs'));
  vm.runInNewContext(fs.readFileSync(path.join(source, 'extension.cjs'), 'utf8'), { module, exports: module.exports, console, setTimeout, clearTimeout,
    require: name => name === 'vscode' ? vscode : name === './profiles.cjs' ? { ensureAllProfiles: async () => ({ status: 'application-scoped' }) }
      : name === './font-service.cjs' ? { installed: async () => ({}), recorded: () => [], ensureBundled: async () => ({ added: [], failed: [] }) } : nativeRequire(name) });
  const options = module.exports.vscodeThemeOptions(vscode.extensions.all);
  assert.deepEqual(Array.from(options, option => option.label), ['Dark+', 'Light+', 'Solarized Dark', 'Quiet Light']);
  assert.deepEqual(Array.from(options, option => option.value), ['Default Dark+', 'Default Light+', 'Solarized Dark', 'Quiet Light'], 'registered theme ids are written');
  assert.ok(options.every(option => option.group === 'vscode'));
  assert.ok(!options.some(option => /^Visual Studio /.test(option.value)), 'the Aster base themes are never offered on their own');
  assert.equal(module.exports.vscodeThemeOptions(vscode.extensions.all, ['Default Dark+']).length, 3, 'a theme already shown as Antigravity is not repeated');
  assert.equal(module.exports.vscodeThemeOptions([]).length, 0, 'a theme the IDE does not ship is never offered');
  await module.exports.activate({ extensionPath: source, subscriptions: [], globalStorageUri: { fsPath: os.tmpdir() }, globalState: { get() {}, update: async () => {} } });
  await commands.get('asterAppearance.selectTheme')();
  // Separators carry a kind; theme rows carry the option they apply.
  const section = name => { const start = picker.items.findIndex(item => item.kind !== undefined && item.label === name); const rest = picker.items.slice(start + 1);
    const end = rest.findIndex(item => item.kind !== undefined); return Array.from(end < 0 ? rest : rest.slice(0, end), item => item.label); };
  assert.deepEqual(section('Antigravity'), ['Antigravity Light', 'Antigravity Dark']);
  assert.deepEqual(section('VS Code'), ['Dark+', 'Light+', 'Solarized Dark', 'Quiet Light']);
  const swatches = require('../extensions/aster-appearance/swatches.cjs');
  assert.deepEqual(picker.items.filter(item => item.kind !== undefined).map(item => item.label), swatches.SECTIONS.map(item => item.name),
    'the quick picker shows the five studio groups in the same order');
  assert.deepEqual(section('Тёмные · спокойные'), ['One Dark Pro', 'Tokyo Night', 'Catppuccin Mocha', 'Night Owl', 'GitHub Dark', 'Ayu Mirage', 'Panda',
    'Nord', 'Everforest Dark', 'Rose Pine Moon', 'Kanagawa Wave', 'Vitesse Dark'], 'the five themes added in 1.6.0 are calm, like One Dark Pro');
  assert.deepEqual(section('Тёмные · яркие'), ['Dracula', 'Gruvbox Dark', 'Cobalt2', 'SynthWave 84']);
  assert.deepEqual(section('Светлые'), ['GitHub Light', 'One Light', 'Catppuccin Latte', 'Solarized Light', 'Ayu Light', 'Light Owl']);
});

test('every theme card carries its real colours: Aster palettes and the IDE theme files, with includes and comments', t => {
  const swatches = require('../extensions/aster-appearance/swatches.cjs'), themes = require('../extensions/aster-appearance/themes.cjs');
  for (const theme of themes.THEMES) {
    const swatch = swatches.asterSwatch(theme);
    assert.deepEqual(Object.keys(swatch), swatches.KEYS);
    for (const [key, value] of Object.entries(swatch)) assert.match(value, /^#[0-9a-f]{6}$/, theme.name + ' ' + key);
    assert.equal(swatch.background, theme.colors['editor.background'].slice(0, 7).toLowerCase());
    assert.equal(swatch.keyword, theme.roles.keyword);
    assert.equal(swatch.function, theme.roles.functionCall);
  }
  // The calm and vivid dark groups follow the character of the original themes.
  const build = require('../scripts/build-aster.cjs');
  for (const palette of palettes) assert.equal(themes.find(palette[0]).vivid, build.vivid(palette), palette[0] + ' group');
  assert.deepEqual(themes.THEMES.filter(theme => swatches.vivid(theme)).map(theme => theme.name), ['Dracula', 'Gruvbox Dark', 'Cobalt2', 'SynthWave 84']);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-swatch-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.mkdirSync(path.join(folder, 'themes'));
  fs.writeFileSync(path.join(folder, 'themes', 'base.json'), '{\n  // base theme\n  "colors": { "editor.background": "#101010", "editor.foreground": "#EEE", },\n  "tokenColors": [ { "scope": "comment", "settings": { "foreground": "#808080" } }, { "scope": ["keyword", "storage.type"], "settings": { "foreground": "#569CD6" } } ],\n}\n');
  fs.writeFileSync(path.join(folder, 'themes', 'plus.json'), '/* the theme the IDE lists */ { "include": "./base.json", "colors": { "editor.background": "#1e1e1e" },\n "tokenColors": [ { "scope": "entity.name.function, support.function", "settings": { "foreground": "#dcdcaa" } }, { "scope": "string", "settings": { "foreground": "url(evil)" } } ] }');
  const extensions = [{ extensionPath: folder, packageJSON: { contributes: { themes: [{ id: 'Plus', label: 'Plus', path: './themes/plus.json' }, { id: 'Broken', path: './themes/missing.json' }] } } }];
  assert.deepEqual(swatches.builtinSwatch({ value: 'Plus', kind: 'dark' }, extensions),
    { background: '#1e1e1e', foreground: '#eeeeee', keyword: '#569cd6', function: '#dcdcaa', string: '#eeeeee', type: '#eeeeee', comment: require('../extensions/aster-appearance/color.cjs').commentColor('#808080','#1e1e1e') },
    'the own file wins over its include; anything that is not a colour falls back to the text colour; #808080 (4.2:1) is lifted');
  assert.deepEqual(swatches.builtinSwatch({ value: 'Broken', kind: 'light' }, extensions).background, '#ffffff', 'a theme file that cannot be read gets a neutral card');
  // A card shows code colours as the editor draws them: below 4.6:1 they are lifted like the readable rules.
  fs.writeFileSync(path.join(folder, 'themes', 'dim.json'), '{ "colors": { "editor.background": "#002b36", "editor.foreground": "#839496" }, "tokenColors": [ { "scope": "comment", "settings": { "foreground": "#586e75" } } ] }');
  extensions[0].packageJSON.contributes.themes.push({ id: 'Dim', path: './themes/dim.json' });
  const dim = swatches.builtinSwatch({ value: 'Dim', kind: 'dark' }, extensions);
  assert.ok(require('../extensions/aster-appearance/color.cjs').contrast(dim.comment, '#002b36') >= 4.6, 'the card comment is the lifted one');
  assert.equal(dim.comment, swatches.readableRules(swatches.builtinTheme({ value: 'Dim' }, extensions), 'dark')[0].settings.foreground);
  assert.deepEqual(swatches.builtinSwatch({ value: 'Unknown', kind: 'dark' }, []).background, '#1f1f1f');
});

test('no code name stays in the plain text colour in any palette, and plain text reads at 7:1', () => {
  const themes = require('../extensions/aster-appearance/themes.cjs'), { toOklch, contrast } = require('../extensions/aster-appearance/color.cjs');
  for (const theme of themes.THEMES) {
    const fg = theme.colors['editor.foreground'], bg = theme.colors['editor.background'];
    assert.ok(contrast(fg, bg) >= 7, theme.name + ': plain text contrast ' + contrast(fg, bg).toFixed(2));
    for (const role of ['variable', 'variable.readonly', 'property', 'parameter', 'operator', 'function', 'type', 'keyword', 'string', 'number']) {
      const colour = theme.semanticTokenColors[role];
      assert.notEqual(colour.toLowerCase(), fg.toLowerCase(), theme.name + ': ' + role + ' is not plain text');
      assert.ok(toOklch(colour)[1] >= 0.035, theme.name + ': ' + role + ' ' + colour + ' carries a colour, not grey');
    }
    // TextMate rules for the same names follow the semantic colours.
    const rule = scope => theme.tokenColors.slice().reverse().find(item => [].concat(item.scope).includes(scope)).settings.foreground;
    assert.equal(rule('variable.other.readwrite'), theme.semanticTokenColors.variable, theme.name + ': let/var names');
    assert.equal(rule('variable.parameter'), theme.semanticTokenColors.parameter, theme.name + ': parameters');
  }
  // Where a palette left names plain, every palette uses the same recommended blue (Dark+ / Light+ style).
  const dark = themes.THEMES.filter(theme => theme.type === 'dark').map(theme => theme.semanticTokenColors.variable);
  assert.ok(dark.filter(colour => colour === '#96dcfe').length >= 5, 'dark palettes share the recommended light blue for names');
});

test('the IDE\'s own themes retain code colours while comments gain colour and readable contrast', t => {
  const swatches = require('../extensions/aster-appearance/swatches.cjs'), { contrast, toOklch } = require('../extensions/aster-appearance/color.cjs');
  // Solarized Dark's own values: background #002b36, comments #586e75 (2.8:1), functions #268bd2 (4.1:1), strings #2aa198 (fine).
  const theme = { colors: { 'editor.background': '#002B36' }, tokenColors: [
    { settings: { foreground: '#839496' } },
    { scope: 'comment', settings: { foreground: '#586E75', fontStyle: 'italic' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#268BD2' } },
    { scope: 'string', settings: { foreground: '#2AA198' } },
    { scope: 'storage', settings: { fontStyle: 'bold' } },
  ] };
  const rules = swatches.readableRules(theme, 'dark');
  assert.deepEqual(rules.slice(0,2).map(rule => rule.scope), ['comment', ['entity.name.function', 'support.function']], 'other code changes only for low contrast');
  assert.ok(rules.at(-1).scope.includes('comment.block.documentation'),'documentation comments receive the coloured comment rule');
  assert.ok(contrast(rules.at(-1).settings.foreground, '#002b36')>=5);assert.ok(toOklch(rules.at(-1).settings.foreground)[1]>=.08);
  for (const rule of rules) {
    assert.equal(rule.name, swatches.READABLE_RULE);
    assert.deepEqual(Object.keys(rule.settings), ['foreground'], 'the theme\'s own font style is left to the style rule');
    assert.ok(contrast(rule.settings.foreground, '#002b36') >= 4.6);
  }
  const hue = colour => toOklch(colour)[2];
  assert.ok(Math.abs(hue(rules[1].settings.foreground) - hue('#268bd2')) < 3, 'the lifted colour keeps the theme\'s hue');
  assert.deepEqual(swatches.readableRules(null, 'dark'), []);
});

test('role styles own only their rules: operators stay upright, bold declarations are removed only when Aster set them', () => {
  const { FONT_STYLES, NAME_SEMANTIC } = require('../extensions/aster-appearance/appearance.cjs');
  const roles = FONT_STYLES.filter(style => style.role).map(style => style.value);
  assert.deepEqual(roles, ['comments', 'keywords', 'accent', 'bold-keywords', 'bold-names']);
  const personal = { text: { textMateRules: [{ name: 'mine', scope: 'string', settings: { fontStyle: 'underline' } }] },
    semantic: { rules: { '*': '#abcdef', 'function.declaration': '#123456' } } };
  const owned = result => result.text.textMateRules.filter(rule => rule.name === STYLE_RULE);
  const styleOf = (result, scope) => owned(result).filter(rule => [].concat(rule.scope).includes(scope)).map(rule => rule.settings.fontStyle).at(-1);
  for (const style of roles) {
    const result = styleSettings(personal, style, 'normal');
    assert.deepEqual(result.text.textMateRules.filter(rule => rule.name === 'mine'), personal.text.textMateRules, style + ' keeps personal rules');
    assert.deepEqual(styleSettings(result, style, style), result, style + ' is idempotent');
    assert.equal(owned(result)[0].settings.fontStyle, '', style + ' starts upright, over the theme');
  }
  assert.equal(styleOf(styleSettings({}, 'comments'), 'comment'), 'italic');
  assert.equal(styleOf(styleSettings({}, 'comments'), 'storage.type'), '');
  for (const [style, look] of [['keywords', 'italic'], ['accent', 'italic'], ['bold-keywords', 'bold']]) {
    const result = styleSettings({}, style);
    for (const scope of ['keyword.control', 'storage.type', 'storage.modifier', 'keyword.operator.new']) assert.equal(styleOf(result, scope), look, style + ' ' + scope);
    for (const scope of ['storage.type.function.arrow', 'keyword.operator', 'keyword.operator.comparison', 'keyword.operator.logical'])
      assert.equal(styleOf(result, scope), '', style + ' leaves ' + scope + ' (=> === &&) upright');
  }
  const bold = styleSettings(personal, 'bold-names', 'normal');
  assert.equal(styleOf(bold, 'entity.name.type.class'), 'bold');
  assert.deepEqual(bold.semantic.rules['function.declaration'], { foreground: '#123456', bold: true });
  for (const selector of NAME_SEMANTIC.slice(1)) assert.deepEqual(bold.semantic.rules[selector], { bold: true });
  assert.deepEqual(styleSettings(bold, 'keywords', 'bold-names').semantic.rules, personal.semantic.rules, 'leaving bold-names removes exactly its flags');
  const mine = { semantic: { rules: { 'class.declaration': { bold: true } } } };
  assert.deepEqual(styleSettings(mine, 'normal', 'normal').semantic.rules, mine.semantic.rules, 'a bold flag Aster did not set stays');
  assert.deepEqual(styleSettings({}, true), styleSettings({}, 'italic'), 'the boolean form still means italic');
  assert.throws(() => styleSettings({}, 'oblique'));
});
