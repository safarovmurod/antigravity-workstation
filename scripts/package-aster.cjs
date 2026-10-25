'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../extensions/aster-appearance');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function crc32(bytes) {let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function zip(entries) {
  const local=[],central=[];let offset=0;
  for(const [name,bytes] of entries) {
    const filename=Buffer.from(name),compressed=zlib.deflateRawSync(bytes,{level:9}),crc=crc32(bytes),header=Buffer.alloc(30),directory=Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);
    header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(filename.length,26);
    directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(8,10);directory.writeUInt16LE(33,14);
    directory.writeUInt32LE(crc,16);directory.writeUInt32LE(compressed.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
    local.push(header,filename,compressed);central.push(directory,filename);offset+=header.length+filename.length+compressed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
function build() {
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  const files=['package.json','extension.cjs','appearance.cjs','font-service.cjs','fonts.json','install-font.ps1','panel.css','panel.js','icon.png','icon.svg','README.md',...fs.readdirSync(path.join(root,'themes')).map(f=>'themes/'+f),...JSON.parse(fs.readFileSync(path.join(root,'fonts.json'))).flatMap(font=>font.files.map(f=>f.file))];
  if(fs.existsSync(path.join(root,'media')))files.push(...fs.readdirSync(path.join(root,'media')).filter(file=>/^(?:appearance-(?:light|dark)\.png|source-evidence\.json)$/.test(file)).map(file=>'media/'+file));
  const contentTypes='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+[['json','application/json'],['png','image/png'],['svg','image/svg+xml'],['cjs','application/javascript'],['js','application/javascript'],['css','text/css'],['md','text/markdown'],['txt','text/plain'],['ttf','font/ttf'],['ps1','text/plain'],['pb','text/plain'],['vsixmanifest','text/xml']].map(([ext,type])=>`<Default Extension="${ext}" ContentType="${type}"/>`).join('')+'</Types>';
  const xml=`<?xml version="1.0"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}"/><DisplayName>Aster Atelier</DisplayName><Description xml:space="preserve">Twenty editor palettes and ten programming fonts.</Description><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${pkg.engines.vscode}"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png" Addressable="true"/></Assets></PackageManifest>`;
  const entries=[['[Content_Types].xml',Buffer.from(contentTypes)],['extension.vsixmanifest',Buffer.from(xml)],...files.map(file=>['extension/'+file,fs.readFileSync(path.join(root,file))]),['extension/LICENSE.txt',fs.readFileSync(path.resolve(root,'../../LICENSE'))]];
  const bytes=zip(entries),file=path.join(root,`aster-appearance-${pkg.version}.vsix`);
  const pin={id:pkg.publisher+'.'+pkg.name,version:pkg.version,vsixSha256:digest(bytes),files:Object.fromEntries(entries.filter(([file])=>file.startsWith('extension/')).map(([file,bytes])=>[file.slice(10),digest(bytes)]))};
  return{file,bytes,pin};
}
if(require.main===module){const result=build();fs.writeFileSync(result.file,result.bytes);fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(result.pin,null,2)+'\n');console.log(result.file);}
module.exports={build,zip};
