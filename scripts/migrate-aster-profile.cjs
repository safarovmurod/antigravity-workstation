'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),{migrateAppearance}=require('../lib/appearance-migration'),legacy=require('../config/legacy-appearance.json');
function migrate(){
  const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const write=(file,value)=>fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2)+'\n');
  const settings=read('config/settings.json');
  const cleaned=migrateAppearance(settings,{schema:1,requestId:'owned-source-profile',setupVersion:'3.0.25',settings:legacy});
  cleaned.settings['workbench.colorTheme']='oceanic pro';write('config/settings.json',cleaned.settings);
  write('config/extensions.json',read('config/extensions.json').filter(item=>item.id!=='zhuangtongfa.Material-theme'));
  const profiles=read('config/extension-profiles.json');
  profiles.lite.include=profiles.lite.include.filter(id=>id!=='zhuangtongfa.Material-theme');
  profiles.lite.description=profiles.lite.description.replace('One Dark Pro','Aster Atelier');write('config/extension-profiles.json',profiles);
  console.log('Source-only legacy defaults retired: '+cleaned.removed.join(', '));
}
if(require.main===module)migrate();
module.exports={migrate};
