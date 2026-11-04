'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {isDeepStrictEqual}=require('node:util');
const {guard}=require('./owned-files');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
// Installs a SHA-pinned local VSIX (manifest.json pin of the package and every file)
// and verifies the IDE registration and installed bytes afterwards.
function installLocalVsix(cli,extensionsDir,source,expectedId,options={}) {
  const pin=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'))),pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json')));
  const label=pkg.displayName||expectedId;
  if(pin.id!==expectedId||pkg.publisher+'.'+pkg.name!==pin.id||pkg.version!==pin.version||!/^\d+\.\d+\.\d+$/.test(pin.version))throw new Error('Unexpected '+label+' extension identity');
  const artifact=path.join(source,`${pkg.name}-${pin.version}.vsix`);
  if(hash(artifact)!==pin.vsixSha256)throw new Error(label+' VSIX checksum mismatch');
  for(const [file,digest] of Object.entries(pin.files)) {
    const own=guard(source,file),target=file==='LICENSE.txt'&&!fs.existsSync(own)?path.resolve(source,'../../LICENSE'):own;
    if(!fs.existsSync(target)||hash(target)!==digest)throw new Error(label+' source differs from the packaged VSIX: '+file+'; rebuild before install');
  }
  function verifyFolder(folder,installed=false) {
    return Object.entries(pin.files).every(([file,digest])=>{
      const target=guard(folder,file);
      if(!fs.existsSync(target)||!fs.statSync(target).isFile())return false;
      if(file==='package.json'&&installed) {
        let actual;
        try{actual=JSON.parse(fs.readFileSync(target,'utf8'));}catch(error){if(error instanceof SyntaxError)return false;throw error;}
        if(!actual||typeof actual!=='object'||Array.isArray(actual))return false;
        delete actual.__metadata;
        return isDeepStrictEqual(actual,pkg);
      }
      return fs.existsSync(target)&&fs.statSync(target).isFile()&&hash(target)===digest;
    });
  }
  const index=guard(extensionsDir,'extensions.json');
  function verify() {
    if(!fs.existsSync(index))return false;
    const list=JSON.parse(fs.readFileSync(index));
    if(!Array.isArray(list)||list.some(item=>!item||typeof item!=='object'||Array.isArray(item)))throw new Error('Invalid '+label+' extension index; existing inventory preserved');
    return list.some(item=>{
      const location=item.relativeLocation||path.basename(item.location?.path||'');
      if(item.identifier?.id?.toLowerCase()!==pin.id||item.version!==pin.version||!location.startsWith(pin.id+'-')||/[/\\]/.test(location))return false;
      return verifyFolder(guard(extensionsDir,location),true);
    });
  }
  // Older folders the IDE marked obsolete are archived to backups, like the other bundled packages.
  const archiveOld=()=>require('./extensions').archiveStaleExtensionDirs(extensionsDir,pin.id,options.log,pin.version);
  const verified=verify();
  if(options.dryRun)return{success:true,dryRun:true};
  if(verified)return{success:true,unchanged:true,archived:archiveOld()};
  fs.mkdirSync(extensionsDir,{recursive:true});
  if(!options.isolated) {
    if(!cli||!fs.existsSync(cli))return{success:false,reason:'Antigravity CLI unavailable'};
    require('./verified-extension-install').installVerifiedExtension(cli,artifact,verify,options);
    return{success:true,method:'verified-vsix',archived:archiveOld()};
  }
  const stage=fs.mkdtempSync(path.join(extensionsDir,'.'+pkg.name+'-stage-'));
  let previous, writtenIndex;
  const location=pin.id+'-'+pin.version+'-universal',target=guard(extensionsDir,location),original=fs.existsSync(index)?fs.readFileSync(index):null;
  try {
    const tool=path.join(process.env.SystemRoot||'C:\\Windows','System32/tar.exe');
    const archive = fs.openSync(artifact, 'r');
    let unpack;
    try {
      unpack = spawnSync(tool, ['-xf', '-'], {
        cwd: stage, stdio: [archive, 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true,
      });
    } finally { fs.closeSync(archive); }
    if(unpack.error||unpack.status!==0)throw new Error(label+' VSIX extraction failed: '+(unpack.error?.message||unpack.stderr));
    if(!verifyFolder(path.join(stage,'extension')))throw new Error(label+' extracted contents mismatch');
    const entries=original?JSON.parse(original):[];
    if(!Array.isArray(entries))throw new Error('Invalid extension index');
    if(fs.existsSync(target)){previous=path.join(extensionsDir,'.'+pkg.name+'-previous-'+crypto.randomUUID());fs.renameSync(target,previous);}
    try {
      fs.renameSync(path.join(stage,'extension'),target);
      if(original===null?fs.existsSync(index):!fs.readFileSync(index).equals(original))throw new Error('Extension index changed concurrently');
      const next=entries.filter(item=>item.identifier?.id?.toLowerCase()!==pin.id);
      const registered=entries.find(item=>item.identifier?.id?.toLowerCase()===pin.id);
      next.push({identifier:{...registered?.identifier,id:pin.id},version:pin.version,relativeLocation:location,
        ...(registered?.metadata!==undefined?{metadata:registered.metadata}:{})});
      const temporary=path.join(stage,'index.json');writtenIndex=Buffer.from(JSON.stringify(next,null,2));fs.writeFileSync(temporary,writtenIndex);fs.renameSync(temporary,index);
      if(!verify())throw new Error(label+' extension verification failed');
      return{success:true,method:'isolated-vsix',backup:previous};
    }catch(error){
      if(fs.existsSync(target))fs.renameSync(target,path.join(stage,'failed'));
      if(previous)fs.renameSync(previous,target);
      if(writtenIndex && fs.existsSync(index) && fs.readFileSync(index).equals(writtenIndex)) {
        if(original!==null)fs.writeFileSync(index,original);else fs.unlinkSync(index);
      }
      throw error;
    }
  }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
const installAppearance=(cli,extensionsDir,source,options={})=>installLocalVsix(cli,extensionsDir,source,'workstation.aster-appearance',options);
module.exports={installAppearance,installLocalVsix};
