import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const source=fs.readFileSync(new URL('../extensions/git-branch-panel/extension.js',import.meta.url),'utf8');
function fixture() {
  const calls=[];
  const repo={fetch:async options=>{calls.push(['fetch',options]);},push:async(...args)=>{calls.push(['push',...args]);}};
  const extension={isActive:false,activate:async()=>{calls.push(['activate']);extension.isActive=true;},exports:{getAPI(version){
    assert.equal(version,1);return{git:{path:'D:/Git Portable/cmd/git.exe'},getRepository:uri=>{assert.equal(uri.fsPath,'D:/My Project');return repo;}};
  }}};
  const module={exports:{}};
  const vscode={workspace:{getConfiguration:()=>({get:()=>undefined})},extensions:{getExtension:id=>id==='vscode.git'?extension:undefined},Uri:{file:fsPath=>({fsPath})}};
  const fakeRequire=name=>name==='vscode'?vscode:name==='child_process'?{execFile(file,args,options,callback){
    calls.push(['execFile',file,args]);callback(null,'main\n','');
  }}:require(name);
  vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{process,Buffer,setTimeout,clearTimeout})
    (fakeRequire,module,module.exports);
  return{api:module.exports,calls,repo};
}
test('Panel reuses native Git authentication for push/fetch and the configured portable Git path; no account token is copied',async()=>{
  const f=fixture();
  await f.api.gitExec(['push','-u','origin','feature:feature'],'D:/My Project');
  await f.api.gitExec(['fetch','origin','--prune'],'D:/My Project');
  await f.api.gitExec(['push','origin','--delete','--','feature'],'D:/My Project');
  await f.api.gitExec(['branch','--show-current'],'D:/My Project');
  assert.equal(f.calls.filter(row=>row[0]==='activate').length,1);
  assert.deepEqual(f.calls.filter(row=>row[0]==='push'),[['push','origin','feature:feature',true],['push','origin',':feature',false]]);
  assert.equal(f.calls.find(row=>row[0]==='fetch')[1].remote,'origin');
  assert.equal(f.calls.find(row=>row[0]==='fetch')[1].prune,true);
  assert.deepEqual(f.calls.find(row=>row[0]==='execFile').slice(1),['D:/Git Portable/cmd/git.exe',['branch','--show-current']]);
});
test('Native Git authentication errors remain visible and never silently retry through a different account',async()=>{
  const f=fixture();f.repo.push=async()=>{throw new Error('GitHub authorization required');};
  await assert.rejects(()=>f.api.gitExec(['push','origin','feature:feature'],'D:/My Project'),/authorization required/);
  assert.equal(f.calls.some(row=>row[0]==='execFile'),false);
});
