import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{installAsterFixture}=require('./aster-cli-install.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aster-verified-cli-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const extensionsDir=path.join(root,'Extensions with spaces'),location='workstation.aster-appearance-1.0.0',folder=path.join(extensionsDir,location);
  fs.mkdirSync(folder,{recursive:true});const expectedPackage={publisher:'workstation',name:'aster-appearance',version:'1.0.0'},artifact=path.join(root,'verified.vsix');
  fs.writeFileSync(artifact,'verified fixture archive');const files={'package.json':JSON.stringify(expectedPackage),'extension.cjs':'module.exports={};','LICENSE.txt':'fixture license'};
  const pin={id:'workstation.aster-appearance',version:'1.0.0',vsixSha256:hash(fs.readFileSync(artifact)),files:Object.fromEntries(Object.entries(files).map(([file,bytes])=>[file,hash(bytes)]))};
  const write=()=>{for(const [file,bytes]of Object.entries(files))fs.writeFileSync(path.join(folder,file),bytes);fs.writeFileSync(path.join(folder,'package.json'),JSON.stringify({...expectedPackage,__metadata:{isApplicationScoped:true}}));fs.writeFileSync(path.join(extensionsDir,'extensions.json'),JSON.stringify([{identifier:{id:pin.id},version:pin.version,relativeLocation:location}]));};
  return{options:{executable:'owned-cli',cliArgs:['official-cli.js'],userDataDir:path.join(root,'Profile with spaces'),extensionsDir,artifact,pin,expectedPackage,env:{},log(){},wait(){}},write,folder,extensionsDir};
}
test('Aster native fixture retries a vendor crash and unverified bytes; only zero-exit fully verified install succeeds',t=>{
  const f=fixture(t);let calls=0;const waits=[];
  const result=installAsterFixture({...f.options,wait:ms=>waits.push(ms),run(executable,args,options){calls++;assert.equal(executable,'owned-cli');assert.equal(options.env.ELECTRON_RUN_AS_NODE,'1');assert.ok(args.includes('--user-data-dir='+f.options.userDataDir));assert.ok(args.includes('--extensions-dir='+f.options.extensionsDir));assert.ok(args.includes(f.options.artifact));f.write();if(calls===1)return{status:134,stdout:'success',stderr:'FATAL ERROR: Empty MaybeLocal'};if(calls===2)fs.writeFileSync(path.join(f.folder,'extension.cjs'),'corrupt');return{status:0};}});
  assert.deepEqual(result,{success:true,attempts:3});assert.equal(calls,3);assert.deepEqual(waits,[500,1000]);
});
test('Aster native fixture never accepts a persistent crash, missing registration or corrupt payload',t=>{
  for(const kind of ['crash','missing','corrupt']){const f=fixture(t);let calls=0;assert.throws(()=>installAsterFixture({...f.options,run(){calls++;if(kind!=='missing')f.write();if(kind==='corrupt')fs.writeFileSync(path.join(f.folder,'LICENSE.txt'),'wrong');return{status:kind==='crash'?134:0};}}),/after 3 installation attempts/);assert.equal(calls,3);}
});
test('Aster native fixture rejects a tampered VSIX before launching the CLI and never trusts an escaping registration',t=>{
  const f=fixture(t);fs.writeFileSync(f.options.artifact,'tampered');assert.throws(()=>installAsterFixture({...f.options,run(){assert.fail('Unverified VSIX executed');}}),/exact verified/);
  fs.writeFileSync(f.options.artifact,'verified fixture archive');f.write();fs.writeFileSync(path.join(f.extensionsDir,'extensions.json'),JSON.stringify([{identifier:{id:f.options.pin.id},version:'1.0.0',relativeLocation:'../foreign'}]));let calls=0;assert.throws(()=>installAsterFixture({...f.options,run(){calls++;return{status:0};}}),/after 3 installation attempts/);assert.equal(calls,3);
});
