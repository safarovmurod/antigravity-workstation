'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {isDeepStrictEqual}=require('node:util');
const {guard}=require('../lib/owned-files');
const {runVerifiedInstall}=require('../lib/verified-extension-install');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function installAsterFixture({executable,cliArgs=[],userDataDir,extensionsDir,artifact,pin,env,expectedPackage,run=spawnSync,...retry}) {
  assert.equal(pin.id,'workstation.aster-appearance');
  assert.equal(digest(artifact),pin.vsixSha256,'The exact verified fixture VSIX must be installed');
  assert.equal(expectedPackage.publisher+'.'+expectedPackage.name,pin.id);
  assert.equal(expectedPackage.version,pin.version);
  const verify=()=>{
    const index=guard(extensionsDir,'extensions.json');
    if(!fs.existsSync(index))return false;
    const entries=JSON.parse(fs.readFileSync(index,'utf8'));if(!Array.isArray(entries))return false;
    return entries.some(entry=>{
      const location=entry?.relativeLocation||path.basename(entry?.location?.path||'');
      if(entry?.identifier?.id?.toLowerCase()!==pin.id||entry.version!==pin.version||!location.startsWith(pin.id+'-')||/[/\\]/.test(location))return false;
      const folder=guard(extensionsDir,location);
      return Object.entries(pin.files).every(([file,hash])=>{
        const target=guard(folder,file);if(!fs.existsSync(target)||!fs.statSync(target).isFile())return false;
        if(file==='package.json'){
          const actual=JSON.parse(fs.readFileSync(target,'utf8'));if(!actual||typeof actual!=='object'||Array.isArray(actual))return false;
          delete actual.__metadata;return isDeepStrictEqual(actual,expectedPackage);
        }
        return digest(target)===hash;
      });
    });
  };
  return runVerifiedInstall(()=>{
    const result=run(executable,[...cliArgs,'--no-sandbox','--user-data-dir='+userDataDir,'--extensions-dir='+extensionsDir,'--install-extension',artifact,'--force'],
      {env:{...env,...(cliArgs.length?{ELECTRON_RUN_AS_NODE:'1'}:{})},encoding:'utf8',timeout:60000,windowsHide:true});
    if(result.status!==0)retry.log?.(String(result.stdout||'')+String(result.stderr||''));
    return result;
  },verify,retry);
}
module.exports={installAsterFixture};
