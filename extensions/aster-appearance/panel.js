'use strict';
const api=acquireVsCodeApi();
const $=id=>document.getElementById(id);
let state, previewId=0, fontSelection=0;
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
  if(!font)return;
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
  if(data.type==='result') {$('message').textContent=data.error||data.message;$('message').className=data.error?'error':'';$('install').disabled=false;return;}
  if(data.type!=='state')return;
  const previousFont=$('font').value,sameAppliedFamily=state?.family===data.family;
  state=data;
  if(data.profileScope?.status!=='application-scoped'){$('message').textContent=data.profileScope?.reason||'Cross-profile extension availability has not been verified.';}
  $('theme').replaceChildren(...data.themes.map(name=>new Option(name,name)));
  if(!data.themes.includes(data.theme))$('theme').prepend(new Option('Current: '+data.theme,data.theme));
  $('theme').value=data.theme;
  $('font').replaceChildren(...data.fonts.map(font=>new Option(font.family,font.id)));
  const selected=data.fonts.find(font=>(data.family||'').includes(font.family));
  if(sameAppliedFamily&&data.fonts.some(font=>font.id===previousFont))$('font').value=previousFont;
  else if(selected)$('font').value=selected.id;
  else {$('font').prepend(new Option('Current system font (not changed)',''));$('font').value='';}
  $('size').value=data.size;$('weight').value=parseInt(data.weight,10)||400;$('style').value=data.style;
  await preview();
});
$('theme').addEventListener('change',()=>send('theme',$('theme').value));
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
