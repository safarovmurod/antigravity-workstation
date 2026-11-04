'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const run = (file,args) => new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout:60000,maxBuffer:2*1024*1024},(error,stdout,stderr)=>error?reject(new Error(fontError(stderr||error.message))):resolve(stdout)));
function fontError(message) {
  if (/UnauthorizedAccess|PSSecurityException|Execution_Policies|cannot be loaded because running scripts is disabled/i.test(message))
    return 'Windows blocked the font registration script through its execution policy. Update Aster Atelier to a version that runs it with -ExecutionPolicy Bypass.';
  return message;
}
const hash = bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function installed(fonts) {
  let names;
  if (process.platform==='win32') {
    names = await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; $f=New-Object System.Drawing.Text.InstalledFontCollection; $f.Families.Name | ConvertTo-Json -Compress"]);
    names = JSON.parse(names.replace(/^\uFEFF/,''));
  } else if (process.platform==='linux') names = (await run('fc-list',['--format','%{family}\n'])).split(/[\n,]/);
  else if (process.platform==='darwin') {
    const report=JSON.parse(await run('/usr/sbin/system_profiler',['SPFontsDataType','-json']));
    names=(report.SPFontsDataType||[]).flatMap(group=>[group.family,group._name,group.full_name,group.typefaces].flatMap(value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(item=>[item.family,item.full_name,item._name]):[])).filter(Boolean);
  }
  else throw new Error('Font detection is unavailable on this operating system');
  return Object.fromEntries(fonts.map(font=>[font.id,Array.isArray(names)&&names.some(name=>name.trim().toLowerCase()===font.family.toLowerCase())]));
}
// Fonts ship inside the extension; installation copies the pinned bundled
// files for the current OS user, so nothing is downloaded.
function stageBundled(root,font,stage) {
  const staged=[];
  for (const item of font.files.filter(item=>item.file.endsWith('.ttf'))) {
    const bytes=fs.readFileSync(path.join(root,item.file));
    if (hash(bytes)!==item.sha256) throw new Error('Bundled font checksum mismatch: '+item.file);
    const file=path.join(stage,'Aster-'+font.id+'-'+item.sha256.slice(0,12)+'.ttf');
    fs.writeFileSync(file,bytes,{flag:'wx'}); staged.push(file);
  }
  return staged;
}
async function install(root,font,storage) {
  const stage = await fs.promises.mkdtemp(path.join(storage,'aster-font-'));
  try {
    const staged = stageBundled(root,font,stage);
    if (process.platform==='win32') await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'install-font.ps1'),'-Stage',stage]);
    else if (process.platform==='linux' || process.platform==='darwin') {
      const target=process.platform==='linux'?path.join(os.homedir(),'.local/share/fonts'):path.join(os.homedir(),'Library/Fonts');
      await fs.promises.mkdir(target,{recursive:true});
      const created=[];
      try {
        for (const file of staged) {
          const destination=path.join(target,path.basename(file));
          if (fs.existsSync(destination)) { if(hash(fs.readFileSync(file))!==hash(fs.readFileSync(destination))) throw new Error('Existing font differs; preserving '+destination); }
          else { await fs.promises.copyFile(file,destination,fs.constants.COPYFILE_EXCL);created.push(destination); }
        }
        if(process.platform==='linux') await run('fc-cache',['-f',target]);
      } catch(error) { for(const file of created) await fs.promises.unlink(file); throw error; }
    } else throw new Error('Font installation unsupported on this operating system');
    if (!(await installed([font]))[font.id]) throw new Error('The OS does not report '+font.family+' after installation.');
    return true;
  } finally { await fs.promises.rm(stage,{recursive:true,force:true}); }
}
// Installs every bundled family the OS does not have yet; returns their ids.
async function ensureBundled(root,fonts,storage) {
  const availability=await installed(fonts), added=[];
  await fs.promises.mkdir(storage,{recursive:true});
  for (const font of fonts.filter(font=>!availability[font.id])) { await install(root,font,storage); added.push(font.id); }
  return added;
}
module.exports={installed,install,ensureBundled,stageBundled};
