import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { planPayload, applyPayload, statePath, digest } = require('../lib/owned-files');
const { getEnvironmentPaths } = require('../lib/paths');
const { createBackup, restoreBackup } = require('../lib/backup');
const { mergeSettings, mergeKeybindings } = require('../lib/profile-settings');
function put(file, value) { fs.mkdirSync(path.dirname(file), { recursive:true }); fs.writeFileSync(file, value); }
test('Old ownership migrates rules and guide roots without leaving active duplicate instructions; backup restores the old profile', t => {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'workstation-migration-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const env=getEnvironmentPaths({ userProfile:path.join(base,'User'), gitBashPath:'fixture-bash' });
  const source=path.join(base,'source');
  for(const name of ['rules','skills','scripts','resources/guides']) fs.mkdirSync(path.join(source,name),{recursive:true});
  put(path.join(source,'rules/workstation-unified.template.md'),'new rule');
  put(path.join(source,'resources/guides/full-stack.md'),'new guide');
  const oldRule=path.join(env.geminiRulesDir,'mansur-unified.md');
  const oldGuide=path.join(env.geminiConfigDir,'mansur-unified/guides/full-stack.md');
  const oldRegistry=path.join(env.geminiConfigDir,'mansur-setup/.installation.json');
  put(oldRule,'old rule');put(oldGuide,'old guide');
  const original=JSON.stringify({schema:1,contract:'mansur-setup-payload-v1',files:[
    {key:'rules/mansur-unified.md',hash:digest(Buffer.from('old rule'))},
    {key:'guides/full-stack.md',hash:digest(Buffer.from('old guide'))},
  ]});
  put(oldRegistry,original);
  const backup=createBackup(env);
  const plan=planPayload(env,source,'Developer');
  assert.deepEqual(new Set(plan.removals.map(row=>row.target)),new Set([oldRule,oldGuide,oldRegistry]));
  applyPayload(env,plan);
  assert.equal(fs.existsSync(oldRule),false);assert.equal(fs.existsSync(oldGuide),false);assert.equal(fs.existsSync(oldRegistry),false);
  assert.equal(fs.readFileSync(path.join(env.geminiRulesDir,'workstation-unified.md'),'utf8'),'new rule');
  assert.equal(fs.readFileSync(path.join(env.geminiConfigDir,'workstation-unified/guides/full-stack.md'),'utf8'),'new guide');
  assert.equal(JSON.parse(fs.readFileSync(statePath(env))).contract,'workstation-setup-payload-v1');
  assert.equal(planPayload(env,source,'Developer').writes.length,0);
  restoreBackup(backup.backupDir,env);
  assert.equal(fs.readFileSync(oldRegistry,'utf8'),original);
  assert.equal(fs.readFileSync(oldRule,'utf8'),'old rule');assert.equal(fs.readFileSync(oldGuide,'utf8'),'old guide');
  assert.equal(fs.existsSync(statePath(env)),false);
});
test('Only retired editor namespaces and command names are migrated; personal settings and shortcuts survive',()=>{
  const settings=mergeSettings({'tsMancho.quietMode':false,'personal.setting':42},{'calmTypeScript.quietMode':true});
  assert.equal(Object.hasOwn(settings,'tsMancho.quietMode'),false);
  assert.equal(settings['calmTypeScript.quietMode'],true);assert.equal(settings['personal.setting'],42);
  assert.deepEqual(mergeKeybindings([{key:'alt+r',command:'tsMancho.resetManagedSettings'},{key:'alt+p',command:'personal.command'}],[]),
    [{key:'alt+r',command:'calmTypeScript.resetManagedSettings'},{key:'alt+p',command:'personal.command'}]);
});
test('Restoring an existing 2.2.4 backup restores old guide paths and metadata without a newer helper reapplying its profile',t=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'workstation-old-backup-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const env=getEnvironmentPaths({userProfile:path.join(base,'User'),gitBashPath:'fixture-bash'});
  const backup=path.join(env.backupsDir,'setup-backup-old');
  const oldState=JSON.stringify({schema:1,contract:'mansur-setup-payload-v1',files:[]});
  const oldProfile=JSON.stringify({schema:1,setupVersion:'2.2.4',settings:{'editor.fontSize':15}});
  const files={'setup-installation.json':oldState,'editor-profile.json':oldProfile,'mansur-unified/guides/full-stack.md':'original guide'};
  for(const[name,text]of Object.entries(files))put(path.join(backup,name),text);
  put(path.join(backup,'backup-manifest.json'),JSON.stringify({schemaVersion:2,absent:[],files:Object.fromEntries(Object.entries(files).map(([key,text])=>[key,digest(Buffer.from(text))]))}));
  put(statePath(env),JSON.stringify({schema:1,contract:'workstation-setup-payload-v1',files:[]}));
  put(path.join(env.geminiConfigDir,'workstation-setup/editor-profile.json'),'{}');
  restoreBackup(backup,env);
  assert.equal(fs.readFileSync(path.join(env.geminiConfigDir,'mansur-unified/guides/full-stack.md'),'utf8'),'original guide');
  assert.equal(fs.readFileSync(path.join(env.geminiConfigDir,'mansur-setup/editor-profile.json'),'utf8'),oldProfile);
  assert.equal(fs.readFileSync(path.join(env.geminiConfigDir,'mansur-setup/.installation.json'),'utf8'),oldState);
  assert.equal(fs.existsSync(statePath(env)),false);
  assert.equal(fs.existsSync(path.join(env.geminiConfigDir,'workstation-setup/editor-profile.json')),false);
});
