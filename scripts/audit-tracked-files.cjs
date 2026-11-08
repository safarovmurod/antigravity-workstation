'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const listing=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'});
if(listing.status!==0)throw new Error(listing.stderr);
const files=[],issues=[];
for(const file of listing.stdout.split('\0').filter(Boolean)){
  const target=path.join(root,file),stat=fs.lstatSync(target);
  if(!stat.isFile()){files.push({file,kind:stat.isSymbolicLink()?'symlink':'other'});continue;}
  const bytes=fs.readFileSync(target),entry={file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),checks:[]};
  if(!bytes.length)issues.push({file,issue:'empty-file-needs-review'});
  if(/\.(json|jsonc)$/.test(file)){
    try{require('../lib/jsonc').parseJsonc(bytes.toString('utf8'));entry.checks.push('json-parse');}catch(error){issues.push({file,issue:'json-parse',message:error.message});}
  }
  if(/\.(js|cjs|mjs)$/.test(file)){
    const result=spawnSync(process.execPath,['--check',target],{cwd:root,encoding:'utf8',timeout:20000});
    if(result.status!==0)issues.push({file,issue:'javascript-syntax',message:result.error?.message||result.stderr});else entry.checks.push('javascript-syntax');
  }
  files.push(entry);
}
process.stdout.write(JSON.stringify({scope:'Every tracked file is inventoried and hashed; applicable JSON and JavaScript syntax is checked. This is not a claim of semantic review or live behavior verification of every file.',files:files.length,checks:files.reduce((n,item)=>n+(item.checks?.length||0),0),issues,inventory:files},null,2)+'\n');
if(issues.length)process.exitCode=1;
