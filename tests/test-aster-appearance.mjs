import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
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
test('setup preserves selected theme and all editor font preferences',()=>{
  const current={'workbench.colorTheme':'Light+','editor.fontFamily':'Fira Code','editor.fontSize':19,'editor.fontWeight':'600','asterAppearance.fontStyle':'italic'};
  const result=mergeSettings(current,{'workbench.colorTheme':'oceanic pro','editor.fontFamily':'JetBrains Mono','editor.fontSize':15,'editor.fontWeight':'400'});
  assert.deepEqual(result,current);
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
    const target=path.join(dir,own.relativeLocation,'panel.js');fs.writeFileSync(target,'corrupt');
    assert.equal(installAppearance(null,dir,source,{isolated:true}).success,true);
    assert.deepEqual(fs.readFileSync(target),fs.readFileSync(path.join(source,'panel.js')));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'extensions.json')))[0],foreign);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
