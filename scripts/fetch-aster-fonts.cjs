'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const revision = 'e7db6ca603fd4862010383ff17ffd6cc4ffac1c0';
// id, family, lightest and boldest weight, weight step
const families = [
  ['jetbrainsmono','JetBrains Mono',100,800],['firacode','Fira Code',300,700],
  ['sourcecodepro','Source Code Pro',200,900],['ibmplexmono','IBM Plex Mono',100,700],
  ['robotomono','Roboto Mono',100,700],['spacemono','Space Mono',400,700,300],
  ['inconsolata','Inconsolata',200,900],['victormono','Victor Mono',100,700],
  ['intelonemono','Intel One Mono',300,700],['cascadiacode','Cascadia Code',200,700],
  ['geistmono','Geist Mono',100,900],['redhatmono','Red Hat Mono',300,700],
  ['martianmono','Martian Mono',100,800],['dmmono','DM Mono',300,500],
  ['anonymouspro','Anonymous Pro',400,700,300],
];
const root = path.resolve(__dirname,'../extensions/aster-appearance');
function download(url) {
  return execFileSync('curl',['--fail','--location','--silent','--show-error','--retry','2','--max-time','60',url],{maxBuffer:20*1024*1024});
}
// The file list comes from the family's METADATA.pb at the pinned commit, so no
// GitHub API token is needed. Files already pinned in fonts.json must keep
// their recorded SHA-256; a raw URL with a commit hash cannot change.
function main() {
  const python = process.env.ASTER_PYTHON || 'python';
  const previous = JSON.parse(fs.readFileSync(path.join(root,'fonts.json'),'utf8'));
  const pinned = new Map(previous.flatMap(font=>font.files.map(file=>[file.file,file.sha256])));
  const fonts = [];
  for (const [id,family,min,max,step=100] of families) {
    const dir = path.join(root,'fonts',id); fs.mkdirSync(dir,{recursive:true});
    const base = `https://raw.githubusercontent.com/google/fonts/${revision}/ofl/${id}/`;
    const metadata = download(base+'METADATA.pb').toString('utf8');
    // A family already in the bundle keeps exactly its pinned files (variable
    // fonts where they exist); a new family takes the files METADATA.pb lists.
    const kept = previous.find(font=>font.id===id)?.files.map(file=>path.basename(file.file)).filter(name=>name.endsWith('.ttf'));
    const names = kept?.length ? kept : [...new Set([...metadata.matchAll(/filename:\s*"([^"]+\.ttf)"/g)].map(match=>match[1]))];
    if (!names.length || !/license:\s*"OFL"/.test(metadata)) throw new Error('Missing licensed assets: '+id);
    const files = [...names,'OFL.txt','METADATA.pb'].map(name=>{
      const url = base+encodeURIComponent(name), relative = `fonts/${id}/${name}`, local = path.join(dir,name);
      const bytes = fs.existsSync(local) ? fs.readFileSync(local) : download(url);
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      if (pinned.has(relative) && pinned.get(relative)!==sha256) throw new Error('Pinned font file changed: '+relative);
      if (name.endsWith('.ttf') && !['00010000','4f54544f'].includes(bytes.subarray(0,4).toString('hex'))) throw new Error('Not a font: '+url);
      fs.writeFileSync(local,bytes);
      const details=name.endsWith('.ttf')?JSON.parse(execFileSync(python,[path.join(__dirname,'inspect-aster-font.py'),local])):{};
      return {file:relative,url,sha256,bytes:bytes.length,...details};
    });
    const fontFiles=files.filter(file=>file.weight);
    if(!fontFiles.every(file=>file.families.some(name=>name===family)))throw new Error('Family metadata mismatch: '+family);
    fonts.push({id,family,localNames:[...new Set(fontFiles.flatMap(file=>file.localNames))],minWeight:min,maxWeight:max,weightStep:step,license:'OFL-1.1',revision,source:`https://github.com/google/fonts/tree/${revision}/ofl/${id}`,files});
    console.log(family+': '+names.length+' font files');
  }
  fs.writeFileSync(path.join(root,'fonts.json'),JSON.stringify(fonts,null,2)+'\n');
}
if (require.main === module) main();
