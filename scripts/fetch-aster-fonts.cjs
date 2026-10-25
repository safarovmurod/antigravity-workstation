'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const revision = 'e7db6ca603fd4862010383ff17ffd6cc4ffac1c0';
const families = [
  ['jetbrainsmono','JetBrains Mono',100,800],['firacode','Fira Code',300,700],
  ['sourcecodepro','Source Code Pro',200,900],['ibmplexmono','IBM Plex Mono',100,700],
  ['robotomono','Roboto Mono',100,700],['spacemono','Space Mono',400,700],
  ['inconsolata','Inconsolata',200,900],['victormono','Victor Mono',100,700],
  ['intelonemono','Intel One Mono',300,700],['cascadiacode','Cascadia Code',200,700],
];
const root = path.resolve(__dirname,'../extensions/aster-appearance');
function download(url) {
  return execFileSync('curl',['--fail','--location','--silent','--show-error','--retry','2','--max-time','60',url],{maxBuffer:20*1024*1024});
}
function main() {
  const fonts = [];
  for (const [id,family,min,max] of families) {
    const dir = path.join(root,'fonts',id); fs.mkdirSync(dir,{recursive:true});
    const list = JSON.parse(execFileSync('gh',['api',`repos/google/fonts/contents/ofl/${id}?ref=${revision}`],{maxBuffer:2000000}));
    const all = list.filter(item=>item.name.endsWith('.ttf'));
    const variable = all.filter(item=>item.name.includes('['));
    const chosen = variable.length ? variable : all;
    if (!chosen.length || !list.some(item=>item.name==='OFL.txt')) throw new Error('Missing licensed assets: '+id);
    const files = [...chosen,list.find(item=>item.name==='OFL.txt'),list.find(item=>item.name==='METADATA.pb')].filter(Boolean).map(item=>{
      const url = `https://raw.githubusercontent.com/google/fonts/${revision}/ofl/${id}/${encodeURIComponent(item.name)}`;
      const local = path.join(dir,item.name);
      const bytes = fs.existsSync(local) ? fs.readFileSync(local) : download(url);
      if (item.name.endsWith('.ttf') && !['00010000','4f54544f'].includes(bytes.subarray(0,4).toString('hex'))) throw new Error('Not a font: '+url);
      fs.writeFileSync(path.join(dir,item.name),bytes);
      const metadata=item.name.endsWith('.ttf')?JSON.parse(execFileSync('python',[path.join(__dirname,'inspect-aster-font.py'),local])):{};
      return {file:`fonts/${id}/${item.name}`,url,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,...metadata};
    });
    const fontFiles=files.filter(file=>file.weight);
    if(!fontFiles.every(file=>file.families.some(name=>name===family)))throw new Error('Family metadata mismatch: '+family);
    fonts.push({id,family,localNames:[...new Set(fontFiles.flatMap(file=>file.localNames))],minWeight:min,maxWeight:max,weightStep:id==='spacemono'?300:100,license:'OFL-1.1',revision,source:`https://github.com/google/fonts/tree/${revision}/ofl/${id}`,files});
    console.log(family+': '+chosen.length+' font files');
  }
  fs.writeFileSync(path.join(root,'fonts.json'),JSON.stringify(fonts,null,2)+'\n');
}
if (require.main === module) main();
