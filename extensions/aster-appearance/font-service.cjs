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
// Every family name the font files carry (name IDs 1 and 16), so a system that
// lists the legacy family name still counts as having the font.
const familyNames = font => [...new Set([font.family,...font.files.flatMap(file=>file.families||[])].map(name=>name.toLowerCase()))];
async function installed(fonts) {
  let names;
  if (process.platform==='win32') {
    names = await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; $f=New-Object System.Drawing.Text.InstalledFontCollection; $f.Families.Name | ConvertTo-Json -Compress"]);
    names = [].concat(JSON.parse(names.replace(/^﻿/,'')));
  } else if (process.platform==='linux') names = (await run('fc-list',['--format','%{family}\n'])).split(/[\n,]/);
  else if (process.platform==='darwin') {
    const report=JSON.parse(await run('/usr/sbin/system_profiler',['SPFontsDataType','-json']));
    names=(report.SPFontsDataType||[]).flatMap(group=>[group.family,group._name,group.full_name,group.typefaces].flatMap(value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(item=>[item.family,item.full_name,item._name]):[])).filter(Boolean);
  }
  else throw new Error('Font detection is unavailable on this operating system');
  const found = new Set(names.map(name=>String(name).trim().toLowerCase()));
  return Object.fromEntries(fonts.map(font=>[font.id,familyNames(font).some(name=>found.has(name))]));
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
async function copyForUser(staged) {
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
}
// Registers one family for the current OS user. The registration script's exit
// code is the proof; `visible` says whether font detection already lists it.
async function install(root,font,storage) {
  await fs.promises.mkdir(storage,{recursive:true});
  const stage = await fs.promises.mkdtemp(path.join(storage,'aster-font-'));
  try {
    const staged = stageBundled(root,font,stage);
    if (process.platform==='win32') await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'install-font.ps1'),'-Stage',stage]);
    else if (process.platform==='linux' || process.platform==='darwin') await copyForUser(staged);
    else throw new Error('Font installation unsupported on this operating system');
    await record(storage,[font]);
    const visible = await installed([font]).then(result=>result[font.id],()=>false);
    return {installed:true,visible};
  } finally { await fs.promises.rm(stage,{recursive:true,force:true}); }
}

// What was installed is remembered per font version (the hashes of its files),
// so a restart or another window never installs or announces it again.
const RECORD='installed-fonts.json', LOCK='installing-fonts.lock', STALE_LOCK_MS=10*60*1000;
const version = font => hash(font.files.filter(item=>item.file.endsWith('.ttf')).map(item=>item.sha256).join('\n'));
function readRecord(storage) {
  try { const value=JSON.parse(fs.readFileSync(path.join(storage,RECORD),'utf8')); return value&&typeof value==='object'&&!Array.isArray(value)?value:{}; }
  catch { return {}; }
}
async function record(storage,fonts) {
  const next={...readRecord(storage),...Object.fromEntries(fonts.map(font=>[font.id,version(font)]))};
  const temporary=path.join(storage,RECORD+'.'+process.pid+'.tmp');
  await fs.promises.writeFile(temporary,JSON.stringify(next,null,2));
  await fs.promises.rename(temporary,path.join(storage,RECORD));
}
const recorded = (storage,fonts) => { const done=readRecord(storage); return fonts.filter(font=>done[font.id]===version(font)).map(font=>font.id); };

// Only one window installs at a time; a lock left by a crashed window expires.
function acquireLock(storage) {
  const file=path.join(storage,LOCK);
  for (let attempt=0; attempt<2; attempt++) {
    try { fs.closeSync(fs.openSync(file,'wx')); return ()=>fs.rmSync(file,{force:true}); }
    catch (error) {
      if (error.code!=='EEXIST') throw error;
      if (Date.now()-fs.statSync(file).mtimeMs<STALE_LOCK_MS) return null;
      fs.rmSync(file,{force:true});
    }
  }
  return null;
}

// Installs every bundled family that is neither recorded nor listed by the OS.
// Returns the ids installed now; failures are reported and retried next start.
async function ensureBundled(root,fonts,storage) {
  await fs.promises.mkdir(storage,{recursive:true});
  const release=acquireLock(storage);
  if (!release) return {added:[],failed:[],busy:true};
  try {
    const done=new Set(recorded(storage,fonts)), pending=fonts.filter(font=>!done.has(font.id));
    if (!pending.length) return {added:[],failed:[]};
    const present=await installed(pending).catch(()=>({}));
    await record(storage,pending.filter(font=>present[font.id]));
    const added=[], failed=[];
    for (const font of pending.filter(font=>!present[font.id])) {
      try { await install(root,font,storage); added.push(font.id); }
      catch (error) { failed.push(font.id+': '+error.message); }
    }
    return {added,failed};
  } finally { release(); }
}
module.exports={installed,install,ensureBundled,stageBundled,recorded,version,RECORD};
