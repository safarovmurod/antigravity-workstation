'use strict';
const api=acquireVsCodeApi();
const $=id=>document.getElementById(id);
let state, previewId=0, fontSelection=0;
let currentTheme=null, pendingTheme=null, isApplying=false;
let appliedThemeRequest=null;
function syncThemeButtons(){
 const changed=pendingTheme!==null&&pendingTheme!==currentTheme;
 $('applyTheme').disabled=isApplying||!changed;
 $('cancelTheme').disabled=isApplying||!changed;
 $('theme').disabled=isApplying;
}
const loadedPreviews=new Map();
async function localFont(family,names=[]) {
  const face=new FontFace('AsterLocalProbe',[family,...names].map(name=>`local(${JSON.stringify(name)})`).join(','));
  try {await face.load();return true;}catch{return false;}
}
async function preview() {
  if(!state)return;
  $('preview').style.fontSize=$('size').value+'px';
  $('preview').style.fontWeight=$('weight').value;
  $('preview').style.fontStyle=$('style').value;
  $('weightValue').textContent=$('weight').value;
  const id=++previewId,font=state.fonts.find(f=>f.id===$('font').value);
  if(!font){
    $('preview').style.fontFamily=state.family||'monospace';
    $('install').hidden=true;
    $('availability').textContent='Current system font · choose a listed family for a verified font preview.';
    $('weight').min=100;$('weight').max=900;$('weight').step=100;
    return;
  }
  const installed=state.availability[font.id]===true;
  $('weight').min=font.minWeight;$('weight').max=font.maxWeight;$('weight').step=font.weightStep;
  $('install').hidden=installed;
  $('availability').textContent=state.detectionError?'OS font detection failed: '+state.detectionError:installed?'Installed · using the system font':'Not installed · preview only. Install to use in the editor.';
  const loaded=installed && await localFont(font.family,font.localNames);
  let family=font.family;
  if(!loaded) {
    family='AsterPreview-'+font.id;
    if(!loadedPreviews.has(font.id))loadedPreviews.set(font.id,Promise.all(font.preview.map(async file=>{
      const face=new FontFace(family,`url(${JSON.stringify(file.uri)})`,{style:file.italic?'italic':'normal',weight:file.weight[0]===file.weight[1]?String(file.weight[0]):file.weight.join(' ')});
      await face.load();document.fonts.add(face);
    })));
    try{await loadedPreviews.get(font.id);}catch(error){loadedPreviews.delete(font.id);if(id===previewId)$('availability').textContent='Preview font failed to load: '+error.message;return;}
    if(installed)$('availability').textContent='OS font found, but this renderer needs a reload. Bundled preview only; application will be refused.';
  }
  if(id!==previewId)return;
  $('preview').style.fontFamily=JSON.stringify(family)+', monospace';
  $('preview').style.fontSize=$('size').value+'px';
  $('preview').style.fontWeight=$('weight').value;
  $('preview').style.fontStyle=$('style').value;
  $('weightValue').textContent=$('weight').value;
}
function send(key,value,type='change') {api.postMessage({type,key,value});}
window.addEventListener('message',async({data})=>{
  if(data.type==='probe') {api.postMessage({type:'probe-result',id:data.id,loaded:await localFont(data.family,data.localNames)});return;}
  if(data.type==='result') {
    if(isApplying && appliedThemeRequest!==null){
      if(!data.error){currentTheme=appliedThemeRequest;pendingTheme=appliedThemeRequest;}
      else pendingTheme=currentTheme;
      $('theme').value=pendingTheme;
    }
    appliedThemeRequest=null;isApplying=false;
    $('message').textContent=data.error||data.message;$('message').className=data.error?'error':'';$('install').disabled=false;syncThemeButtons();return;
  }
  if(data.type!=='state')return;
  const previousFont=$('font').value,sameAppliedFamily=state?.family===data.family;
  state=data;
  if(data.profileScope?.status!=='application-scoped'){$('message').textContent=data.profileScope?.reason||'Cross-profile extension availability has not been verified.';}
  const themes=data.themes.map(item=>typeof item==='string'?{label:item,value:item}:item);
  $('theme').replaceChildren(...themes.map(item=>new Option(item.label,item.value)));
  if(!themes.some(item=>item.value===data.theme))$('theme').prepend(new Option('Current: '+data.theme,data.theme));
  currentTheme=data.theme;
  if(pendingTheme===null||isApplying||!themes.some(item=>item.value===pendingTheme))pendingTheme=data.theme;
  if(![...$('theme').options].some(option=>option.value===pendingTheme))pendingTheme=data.theme;
  $('theme').value=pendingTheme;
  syncThemeButtons();
  $('font').replaceChildren(...data.fonts.map(font=>new Option(font.family,font.id)));
  const primaryFamily=(data.family||'').split(',')[0].trim().replace(/^(['"])(.*)\1$/,'$2');
  const selected=data.fonts.find(font=>primaryFamily.toLowerCase()===font.family.toLowerCase());
  if(sameAppliedFamily&&data.fonts.some(font=>font.id===previousFont))$('font').value=previousFont;
  else if(selected)$('font').value=selected.id;
  else {$('font').prepend(new Option('Current system font (not changed)',''));$('font').value='';}
  // A control the user is actively editing must keep its pending value; the
  // refresh only fills controls that are not focused right now.
  const busy=id=>document.activeElement===$(id);
  if(!busy('size'))$('size').value=data.size;
  if(!busy('weight'))$('weight').value=data.weight==='bold'?700:parseInt(data.weight,10)||400;
  if(!busy('style'))$('style').value=data.style;
  await preview();
});
$('theme').addEventListener('change',()=>{if(isApplying)return;pendingTheme=$('theme').value;syncThemeButtons();});
$('applyTheme').addEventListener('click',()=>{if(isApplying||pendingTheme===null||pendingTheme===currentTheme)return;isApplying=true;appliedThemeRequest=pendingTheme;syncThemeButtons();send('theme',pendingTheme,'apply-theme');});
$('cancelTheme').addEventListener('click',()=>{if(isApplying)return;pendingTheme=currentTheme;$('theme').value=currentTheme;syncThemeButtons();});
$('font').addEventListener('change',async()=>{
  const selection=++fontSelection;
  const font=state.fonts.find(f=>f.id===$('font').value);
  if(!font)return;
  $('weight').min=font.minWeight;$('weight').max=font.maxWeight;$('weight').step=font.weightStep;
  await preview();if(selection===fontSelection&&$('font').value===font.id&&state.availability[font.id])send('font',font.id);
});
$('install').addEventListener('click',()=>{$('install').disabled=true;$('message').textContent='Waiting for installation approval…';send('font',$('font').value,'install');});
for(const key of ['size','weight','style']) {
  $(key).addEventListener('input',preview);
  $(key).addEventListener('change',()=>send(key,key==='style'?$(key).value:Number($(key).value)));
}
api.postMessage({type:'ready'});
