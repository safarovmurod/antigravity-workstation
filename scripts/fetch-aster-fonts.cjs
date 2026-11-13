'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const revision = 'e7db6ca603fd4862010383ff17ffd6cc4ffac1c0';
const monaspaceRevision = 'f31794b6e9e65698a062262e2f826f679dcb7070';
const monaspaceFeatures = "'calt', 'liga', 'ss01', 'ss02', 'ss03', 'ss04', 'ss05', 'ss06', 'ss07', 'ss08', 'ss09', 'ss10'";
// id, actual family, lightest and boldest weight, weight step. Every font's
// coding ligatures are shaped with its editor features before it is accepted.
const families = [
  ['jetbrainsmono','JetBrains Mono',100,800],['firacode','Fira Code',300,700],
  ['cascadiacode','Cascadia Code',200,700],['victormono','Victor Mono',100,700],
  ['lilex','Lilex',100,700],
  ['kodemono','Kode Mono',400,700],
  ['fragmentmono','Fragment Mono',400,400],
  ['monaspaceargon','Monaspace Argon Var',200,800],
  ['monaspacexenon','Monaspace Xenon Var',200,800],
  ['monaspaceradon','Monaspace Radon Var',200,800],
  ['monaspacekrypton','Monaspace Krypton Var',200,800],
];
const root = path.resolve(__dirname,'../extensions/aster-appearance');
// Ligatures every bundled family must draw (Victor Mono and Kode Mono have no
// || ligature; Fragment Mono, a Helvetica-like grotesque, joins || but not &&).
const LIGATURES = ['===','!==','=>','<=','>=','->','!=','&&'];
const required = id => id === 'fragmentmono' ? LIGATURES.filter(text => text !== '&&') : LIGATURES;
function download(url) {
  return execFileSync('curl',['--fail','--location','--silent','--show-error','--retry','2','--max-time','60',url],{maxBuffer:20*1024*1024});
}
// Assets come from immutable upstream commits. Existing files must retain the
// SHA-256 recorded in fonts.json, including the original five families.
function main() {
  const python = process.env.ASTER_PYTHON || 'python';
  const previous = JSON.parse(fs.readFileSync(path.join(root,'fonts.json'),'utf8'));
  const pinned = new Map(previous.flatMap(font=>font.files.map(file=>[file.file,file.sha256])));
  const fonts = [];
  for (const [id,family,min,max,step=100] of families) {
    const dir = path.join(root,'fonts',id); fs.mkdirSync(dir,{recursive:true});
    const monaspace = id.startsWith('monaspace'), ref = monaspace ? monaspaceRevision : revision;
    const upstream = monaspace ? `githubnext/monaspace/${ref}/fonts/Variable%20Fonts/${encodeURIComponent(family.replace(/ Var$/, ''))}/` : `google/fonts/${ref}/ofl/${id}/`;
    const base = 'https://raw.githubusercontent.com/'+upstream;
    const metadata = monaspace ? '' : download(base+'METADATA.pb').toString('utf8');
    const fontFeatures = monaspace ? monaspaceFeatures : undefined;
    // A family already in the bundle keeps exactly its pinned files (variable
    // fonts where they exist); a new family takes the files METADATA.pb lists.
    const kept = previous.find(font=>font.id===id)?.files.map(file=>path.basename(file.file)).filter(name=>name.endsWith('.ttf'));
    const names = kept?.length ? kept : monaspace ? [family+'.ttf'] : [...new Set([...metadata.matchAll(/filename:\s*"([^"]+\.ttf)"/g)].map(match=>match[1]))];
    if (!names.length || !monaspace && !/license:\s*"OFL"/.test(metadata)) throw new Error('Missing licensed assets: '+id);
    const files = [...names,'OFL.txt',...(monaspace?[]:['METADATA.pb'])].map(name=>{
      const url = monaspace && name==='OFL.txt' ? `https://raw.githubusercontent.com/githubnext/monaspace/${ref}/LICENSE` : base+encodeURIComponent(name);
      const relative = `fonts/${id}/${name}`, local = path.join(dir,name);
      const bytes = fs.existsSync(local) ? fs.readFileSync(local) : download(url);
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      if (pinned.has(relative) && pinned.get(relative)!==sha256) throw new Error('Pinned font file changed: '+relative);
      if (name.endsWith('.ttf') && !['00010000','4f54544f'].includes(bytes.subarray(0,4).toString('hex'))) throw new Error('Not a font: '+url);
      if (name==='OFL.txt' && !bytes.toString('utf8').includes('SIL OPEN FONT LICENSE')) throw new Error('Missing font license: '+id);
      fs.writeFileSync(local,bytes);
      const details=name.endsWith('.ttf')?JSON.parse(execFileSync(python,[path.join(__dirname,'inspect-aster-font.py'),local,...(fontFeatures?[fontFeatures]:[])])):{};
      return {file:relative,url,sha256,bytes:bytes.length,...details};
    });
    const fontFiles=files.filter(file=>file.weight);
    if(!fontFiles.every(file=>file.families.some(name=>name===family)))throw new Error('Family metadata mismatch: '+family);
    if(!fontFiles.every(file=>required(id).every(text=>file.ligatures.includes(text))))throw new Error('Missing coding ligatures: '+family);
    fonts.push({id,family,localNames:[...new Set(fontFiles.flatMap(file=>file.localNames))],minWeight:min,maxWeight:max,weightStep:step,license:'OFL-1.1',revision:ref,
      source:monaspace ? `https://github.com/githubnext/monaspace/tree/${ref}/fonts/Variable%20Fonts/${encodeURIComponent(family.replace(/ Var$/, ''))}` : `https://github.com/google/fonts/tree/${ref}/ofl/${id}`,
      ...(fontFeatures?{fontFeatures}:{}),files});
    console.log(family+': '+names.length+' font files');
  }
  fs.writeFileSync(path.join(root,'fonts.json'),JSON.stringify(fonts,null,2)+'\n');
}
if (require.main === module) main();
