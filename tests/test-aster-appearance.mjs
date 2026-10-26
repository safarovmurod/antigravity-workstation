import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'extensions/aster-appearance');
const {styleSettings,updateGlobal,validate,STYLE_RULE}=require('../extensions/aster-appearance/appearance.cjs');
const {mergeSettings}=require('../lib/profile-settings');
const pkg=require('../extensions/aster-appearance/package.json'),fonts=require('../extensions/aster-appearance/fonts.json');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function luminance(hex){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
test('exactly twenty original full palettes, required literal names, readable foreground and syntax',()=>{
  assert.equal(pkg.contributes.themes.length,20);
  assert.deepEqual(pkg.contributes.themes.slice(0,16).map(t=>t.label),['oceanic pro','nord polar','one dark','git hab light','nord light','material ligth','horizon light','grafite pro','slate nigth','show gray','titanium','ligth','black','crimson pro','ocean wawe','neon cyan']);
  const backgrounds=new Set();
  for(const item of pkg.contributes.themes){
    const t=JSON.parse(fs.readFileSync(path.join(source,item.path)));
    assert.ok(Object.keys(t.colors).length>=90);assert.ok(t.tokenColors.length>=14);assert.ok(Object.keys(t.semanticTokenColors).length>=15);
    const bg=luminance(t.colors['editor.background']);backgrounds.add(t.colors['editor.background']);
    assert.equal(bg>.5,t.type==='light');
    for(const fg of [t.colors['editor.foreground'],...t.tokenColors.map(r=>r.settings.foreground)]){
      const l=luminance(fg),contrast=(Math.max(bg,l)+.05)/(Math.min(bg,l)+.05);
      assert.ok(contrast>=4.5,`${t.name}: ${fg} contrast ${contrast}`);
    }
  }
  assert.equal(backgrounds.size,20);
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
  const themes=pkg.contributes.themes.map(theme=>theme.label);
  for(const theme of themes)assert.deepEqual(validate({key:'theme',value:theme},themes,fonts),{'workbench.colorTheme':theme});
  for(const font of fonts)assert.equal(validate({key:'font',value:font.id},themes,fonts),font);
  for(const value of [8,19,40])assert.deepEqual(validate({key:'size',value},themes,fonts),{'editor.fontSize':value});
  for(let value=100;value<=900;value+=100)assert.deepEqual(validate({key:'weight',value},themes,fonts),{'editor.fontWeight':String(value)});
  for(const value of ['normal','italic'])assert.deepEqual(validate({key:'style',value},themes,fonts),{'asterAppearance.fontStyle':value});
  for(const change of [null,[],{key:'unknown',value:1},{key:'font',value:'missing'},{key:'theme',value:'missing'},
    ...[7,41,8.5,'19',null,NaN].map(value=>({key:'size',value})),...[0,50,1000,150,'700',NaN].map(value=>({key:'weight',value})),{key:'style',value:'oblique'}])assert.throws(()=>validate(change,themes,fonts));
});
test('style overlay retains personal colors, theme rules and semantic selectors; repeats are idempotent',()=>{
  const current={text:{'[Light+]':{comments:'#112233'},textMateRules:[{name:'mine',scope:'comment',settings:{foreground:'#123456'}}]},semantic:{rules:{'*':{foreground:'#abcdef'},'variable.readonly':{bold:true}}}};
  const result=styleSettings(current,true);assert.equal(current.text.textMateRules.length,1);assert.deepEqual(result.text['[Light+]'],current.text['[Light+]']);assert.equal(result.text.textMateRules[0].name,'mine');
  assert.equal(result.semantic.rules['*'].foreground,'#abcdef');assert.equal(result.semantic.rules['*'].italic,true);assert.equal(result.semantic.rules['variable.readonly'].bold,true);
  assert.deepEqual(styleSettings(result,true),result);assert.equal(styleSettings(result,false).text.textMateRules.find(r=>r.name===STYLE_RULE).settings.fontStyle,'');
});
test('global multi-setting failure rolls back prior writes, preserving unrelated concurrent settings',async()=>{
  const values={a:1,b:2,personal:42};
  const vscode={ConfigurationTarget:{Global:1},workspace:{getConfiguration:()=>({inspect:key=>({globalValue:values[key]}),update:async(key,value)=>{if(key==='b')throw new Error('disk unavailable');values[key]=value;}})}};
  await assert.rejects(updateGlobal(vscode,{a:10,b:20}),/previous settings restored/);assert.deepEqual(values,{a:1,b:2,personal:42});
});
test('italic preserves shorthand semantic wildcard colors and normal restores only owned style',()=>{
  const input={text:{textMateRules:[]},semantic:{enabled:true,rules:{'*':'#abcdef','class':'#112233'}}};
  const italic=styleSettings(input,true);
  assert.deepEqual(italic.semantic.rules['*'],{foreground:'#abcdef',italic:true});
  assert.equal(italic.semantic.rules.class,'#112233');
  assert.equal(input.semantic.rules['*'],'#abcdef');
  assert.deepEqual(styleSettings(italic,false).semantic.rules['*'],{foreground:'#abcdef',italic:false});
});
test('actual panel source shows bold as 700 and clears stale preview for an external system font',async()=>{
  const nodes=new Map(),handlers={};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',style:{},textContent:'',hidden:false,addEventListener(){},replaceChildren(...items){this.options=items;},prepend(item){this.options.unshift(item);}});return nodes.get(id);};
  const context=vm.createContext({acquireVsCodeApi:()=>({postMessage(){}}),document:{getElementById:node,fonts:{add(){}}},window:{addEventListener:(type,handler)=>handlers[type]=handler},Option:function(text,value){this.text=text;this.value=value;},FontFace:function(){this.load=async()=>this;}});
  vm.runInContext(fs.readFileSync(path.join(source,'panel.js'),'utf8'),context);
  const state={type:'state',themes:['oceanic pro'],theme:'oceanic pro',fonts:[{id:'jetbrainsmono',family:'JetBrains Mono',minWeight:100,maxWeight:800,weightStep:100,preview:[]}],availability:{},family:'JetBrains Mono',size:19,weight:'bold',style:'normal',profileScope:{status:'application-scoped'}};
  await handlers.message({data:state});
  assert.equal(node('weight').value,700);assert.equal(node('preview').style.fontWeight,700);
  assert.match(node('preview').style.fontFamily,/AsterPreview/);
  await handlers.message({data:{...state,family:'JetBrains Mono NL, monospace'}});
  assert.equal(node('font').value,'','A different font variant must not be mistaken for the bundled family');
  assert.equal(node('preview').style.fontFamily,'JetBrains Mono NL, monospace');
  await handlers.message({data:{...state,family:'Personal Mono, monospace',weight:'normal'}});
  assert.equal(node('preview').style.fontFamily,'Personal Mono, monospace');
  assert.equal(node('weight').value,400);assert.equal(node('install').hidden,true);
  assert.match(node('availability').textContent,/Current system font/);
});
test('setup preserves selected theme and all editor font preferences',()=>{
  const current={'workbench.colorTheme':'Light+','editor.fontFamily':'Fira Code','editor.fontSize':19,'editor.fontWeight':'600','asterAppearance.fontStyle':'italic'};
  const result=mergeSettings(current,{'workbench.colorTheme':'oceanic pro','editor.fontFamily':'JetBrains Mono','editor.fontSize':15,'editor.fontWeight':'400'});
  assert.deepEqual(result,current);
});
test('font download network failure and checksum rejection clean staging and never install an unverified font',async()=>{
  const service=require('../extensions/aster-appearance/font-service.cjs'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aster-download-failure-')),previousFetch=globalThis.fetch;
  try{
    globalThis.fetch=async()=>{throw new Error('fixture network offline');};
    await assert.rejects(service.install(source,fonts[0],temp),/Official font download failed.*network offline/);
    assert.deepEqual(fs.readdirSync(temp),[]);
    globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>Buffer.from('corrupt font')});
    await assert.rejects(service.install(source,fonts[0],temp),/checksum mismatch/);
    assert.deepEqual(fs.readdirSync(temp),[]);
    globalThis.fetch=async()=>({ok:false,status:503});
    await assert.rejects(service.install(source,fonts[0],temp),/HTTP 503/);
    assert.deepEqual(fs.readdirSync(temp),[]);
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
    assert.throws(()=>installAppearance(null,dir,source,{isolated:true,dryRun:true}),/Invalid appearance extension index/);
    assert.throws(()=>installAppearance(null,dir,source,{isolated:true}),/Invalid appearance extension index/);
    assert.equal(fs.readFileSync(index,'utf8'),value);assert.deepEqual(fs.readdirSync(dir),['extensions.json']);
  }
  const personal=path.join(temp,'personal.json');fs.writeFileSync(personal,'[]');fs.unlinkSync(index);
  if(process.platform==='win32'){
    fs.renameSync(dir,path.join(temp,'original-extensions'));
    const outside=path.join(temp,'personal-extensions');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'extensions.json'),'[]');
    fs.symlinkSync(outside,dir,'junction');
  }else fs.symlinkSync(personal,index);
  assert.throws(()=>installAppearance(null,dir,source,{isolated:true}),/Linked setup path/);
  assert.equal(fs.readFileSync(personal,'utf8'),'[]');assert.equal(fs.lstatSync(process.platform==='win32'?dir:index).isSymbolicLink(),true);
});
