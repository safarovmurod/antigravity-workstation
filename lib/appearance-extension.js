'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {guard}=require('./owned-files');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function installAppearance(cli,extensionsDir,source,options={}) {
  const pin=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'))),pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json')));
  if(pin.id!=='workstation.aster-appearance'||pkg.publisher+'.'+pkg.name!==pin.id||pkg.version!==pin.version||!/^\d+\.\d+\.\d+$/.test(pin.version))throw new Error('Unexpected appearance extension identity');
  const artifact=path.join(source,`aster-appearance-${pin.version}.vsix`);
  if(hash(artifact)!==pin.vsixSha256)throw new Error('Appearance VSIX checksum mismatch');
  function verifyFolder(folder) {
    return Object.entries(pin.files).every(([file,digest])=>{
      const target=guard(folder,file);
      return fs.existsSync(target)&&fs.statSync(target).isFile()&&hash(target)===digest;
    });
  }
  const index=path.join(extensionsDir,'extensions.json');
  function verify() {
    if(!fs.existsSync(index))return false;
    const list=JSON.parse(fs.readFileSync(index));
    return list.some(item=>{
      const location=item.relativeLocation||path.basename(item.location?.path||'');
      if(item.identifier?.id?.toLowerCase()!==pin.id||item.version!==pin.version||!location.startsWith(pin.id+'-')||/[/\\]/.test(location))return false;
      return verifyFolder(guard(extensionsDir,location));
    });
  }
  if(options.dryRun)return{success:true,dryRun:true};
  if(verify())return{success:true,unchanged:true};
  fs.mkdirSync(extensionsDir,{recursive:true});
  if(!options.isolated) {
    if(!cli||!fs.existsSync(cli))return{success:false,reason:'Antigravity CLI unavailable'};
    require('./verified-extension-install').installVerifiedExtension(cli,artifact,verify,options);
    return{success:true,method:'verified-vsix'};
  }
  const stage=fs.mkdtempSync(path.join(extensionsDir,'.aster-stage-'));
  let previous, writtenIndex;
  const location=pin.id+'-'+pin.version+'-universal',target=guard(extensionsDir,location),original=fs.existsSync(index)?fs.readFileSync(index):null;
  try {
    const tool=process.platform==='win32'?path.join(process.env.SystemRoot||'C:\\Windows','System32/tar.exe'):'unzip';
    const unpack=spawnSync(tool,process.platform==='win32'?['-xf',artifact,'-C',stage]:['-q',artifact,'-d',stage],{encoding:'utf8',windowsHide:true});
    if(unpack.error||unpack.status!==0)throw new Error('Appearance VSIX extraction failed: '+(unpack.error?.message||unpack.stderr));
    if(!verifyFolder(path.join(stage,'extension')))throw new Error('Appearance extracted contents mismatch');
    const entries=original?JSON.parse(original):[];
    if(!Array.isArray(entries))throw new Error('Invalid extension index');
    if(fs.existsSync(target)){previous=path.join(extensionsDir,'.aster-previous-'+crypto.randomUUID());fs.renameSync(target,previous);}
    try {
      fs.renameSync(path.join(stage,'extension'),target);
      if(original===null?fs.existsSync(index):!fs.readFileSync(index).equals(original))throw new Error('Extension index changed concurrently');
      const next=entries.filter(item=>item.identifier?.id?.toLowerCase()!==pin.id);
      next.push({identifier:{id:pin.id},version:pin.version,relativeLocation:location});
      const temporary=path.join(stage,'index.json');writtenIndex=Buffer.from(JSON.stringify(next,null,2));fs.writeFileSync(temporary,writtenIndex);fs.renameSync(temporary,index);
      if(!verify())throw new Error('Appearance extension verification failed');
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
module.exports={installAppearance};
