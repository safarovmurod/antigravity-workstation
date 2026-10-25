'use strict';
const {isDeepStrictEqual:equal}=require('node:util');
const legacy=require('../config/legacy-appearance.json');
function migrateAppearance(current,previousProfile) {
  const settings=structuredClone(current),removed=[];
  if(previousProfile?.schema!==1 || typeof previousProfile.requestId!=='string' || !/^3\.0\.(?:24|25)$/.test(previousProfile.setupVersion||''))return{settings,removed};
  function clean(actual,owned,proof,prefix){
    if(!actual || typeof actual!=='object' || Array.isArray(actual))return actual;
    const next={...actual};
    for(const [key,value] of Object.entries(owned)) {
      if(!Object.hasOwn(next,key)||!Object.hasOwn(proof||{},key))continue;
      const name=prefix+'.'+key;
      if(value && typeof value==='object' && !Array.isArray(value)) {
        const inner=clean(next[key],value,proof[key],name);
        if(inner && !Object.keys(inner).length){delete next[key];}else next[key]=inner;
      } else if(equal(next[key],value)&&equal(proof[key],value)) {delete next[key];removed.push(name);}
    }
    return next;
  }
  for(const key of ['workbench.colorCustomizations','editor.tokenColorCustomizations']) {
    if(settings[key])settings[key]=clean(settings[key],legacy[key],previousProfile.settings?.[key],key);
  }
  return{settings,removed};
}
module.exports={migrateAppearance};
