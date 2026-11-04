'use strict';
const api=acquireVsCodeApi();
const $=id=>document.getElementById(id);
let state, previewId=0, busy=false;
// Every control only changes the pending selection and the preview; the IDE
// changes when Apply is clicked, and Cancel returns to the applied values.
let applied={theme:null,font:'',size:15,weight:400,style:'normal'};
const loadedPreviews=new Map();
const fontValues=()=>({font:$('font').value,size:Number($('size').value),weight:Number($('weight').value),style:$('style').value});
function sync(){
  const theme=$('theme').value!==applied.theme, values=fontValues();
  const font=['font','size','weight','style'].some(key=>values[key]!==applied[key]);
  $('applyTheme').disabled=busy||!theme; $('cancelTheme').disabled=busy||!theme;
  $('applyFont').disabled=busy||!font||!Number.isInteger(values.size)||values.size<8||values.size>40; $('cancelFont').disabled=busy||!font;
  if(document.body)document.body.dataset.busy=busy?'1':'';
}
async function localFont(family,names=[]) {
  const face=new FontFace('AsterLocalProbe',[family,...names].map(name=>`local(${JSON.stringify(name)})`).join(','));
  try {await face.load();return true;}catch{return false;}
}
function setWeightRange(font) {
  $('weight').min=font?font.minWeight:100;$('weight').max=font?font.maxWeight:900;$('weight').step=font?font.weightStep:100;
}
async function preview() {
  if(!state)return;
  const id=++previewId,font=state.fonts.find(f=>f.id===$('font').value);
  $('weightValue').textContent=$('weight').value;
  Object.assign($('preview').style,{fontSize:$('size').value+'px',fontWeight:$('weight').value,fontStyle:$('style').value});
  sync();
  if(!font){
    $('preview').style.fontFamily=state.family||'monospace';
    $('availability').textContent='Текущий шрифт редактора. Выберите семейство из списка, чтобы сменить его.';
    return;
  }
  const installed=state.availability[font.id]===true;
  $('availability').textContent=state.detectionError?'Не удалось проверить шрифты системы: '+state.detectionError
    :installed?'Установлен в системе.':'Входит в расширение и будет установлен при нажатии «Применить шрифт».';
  let family=font.family;
  if(!(installed&&await localFont(font.family,font.localNames))) {
    family='AsterPreview-'+font.id;
    if(!loadedPreviews.has(font.id))loadedPreviews.set(font.id,Promise.all(font.preview.map(async file=>{
      const face=new FontFace(family,`url(${JSON.stringify(file.uri)})`,{style:file.italic?'italic':'normal',weight:file.weight[0]===file.weight[1]?String(file.weight[0]):file.weight.join(' ')});
      await face.load();document.fonts.add(face);
    })));
    try{await loadedPreviews.get(font.id);}catch(error){loadedPreviews.delete(font.id);if(id===previewId)$('availability').textContent='Предпросмотр не загрузился: '+error.message;return;}
  }
  if(id===previewId)$('preview').style.fontFamily=JSON.stringify(family)+', monospace';
}
function restoreFont(){
  $('font').value=applied.font;setWeightRange(state.fonts.find(f=>f.id===applied.font));
  $('size').value=applied.size;$('weight').value=applied.weight;$('style').value=applied.style;
}
window.addEventListener('message',async({data})=>{
  if(data.type==='probe') {api.postMessage({type:'probe-result',id:data.id,loaded:await localFont(data.family,data.localNames)});return;}
  if(data.type==='result') {
    busy=false;$('message').textContent=data.error||data.message;$('message').className=data.error?'error':'';
    if(data.error){$('theme').value=applied.theme;restoreFont();}
    await preview();return;
  }
  if(data.type!=='state')return;
  state=data;
  const groups=[['Antigravity',o=>o.builtin],['Aster · тёмные',o=>!o.builtin&&o.kind==='dark'],['Aster · светлые',o=>!o.builtin&&o.kind==='light']];
  const select=$('theme'),pendingTheme=select.value&&select.value!==applied.theme?select.value:null;
  select.replaceChildren(...groups.map(([label,test])=>{const g=document.createElement('optgroup');g.label=label;g.append(...data.themes.filter(test).map(o=>new Option(o.label,o.value)));return g;}).filter(g=>g.children.length));
  if(!data.themes.some(o=>o.value===data.theme))select.prepend(new Option('Текущая: '+data.theme,data.theme));
  const fontPending=state&&['font','size','weight','style'].some(key=>fontValues()[key]!==applied[key])&&applied.theme!==null;
  const pendingFont=fontPending?fontValues():null;
  const primary=(data.family||'').split(',')[0].trim().replace(/^(['"])(.*)\1$/,'$2').toLowerCase();
  const match=data.fonts.find(font=>font.family.toLowerCase()===primary);
  $('font').replaceChildren(...(match?[]:[new Option('Текущий шрифт редактора','')]),...data.fonts.map(font=>new Option(font.family,font.id)));
  applied={theme:data.theme,font:match?match.id:'',size:data.size,weight:data.weight==='bold'?700:parseInt(data.weight,10)||400,style:data.style==='italic'?'italic':'normal'};
  select.value=pendingTheme&&[...select.options].some(o=>o.value===pendingTheme)?pendingTheme:applied.theme;
  restoreFont();
  if(pendingFont&&[...$('font').options].some(o=>o.value===pendingFont.font)){
    $('font').value=pendingFont.font;setWeightRange(data.fonts.find(f=>f.id===pendingFont.font));
    $('size').value=pendingFont.size;$('weight').value=pendingFont.weight;$('style').value=pendingFont.style;
  }
  if(data.profileScope&&data.profileScope.status!=='application-scoped'&&!$('message').textContent)$('message').textContent=data.profileScope.reason||'';
  await preview();
});
$('theme').addEventListener('change',sync);
$('applyTheme').addEventListener('click',()=>{if(busy)return;busy=true;sync();$('message').textContent='Применяю тему…';api.postMessage({type:'apply-theme',value:$('theme').value});});
$('cancelTheme').addEventListener('click',()=>{$('theme').value=applied.theme;sync();});
$('font').addEventListener('change',()=>{setWeightRange(state.fonts.find(f=>f.id===$('font').value));preview();});
for(const key of ['size','weight','style'])$(key).addEventListener('input',preview);
$('applyFont').addEventListener('click',()=>{if(busy)return;busy=true;sync();$('message').textContent='Применяю шрифт…';api.postMessage({type:'apply-font',...fontValues()});});
$('cancelFont').addEventListener('click',()=>{restoreFont();preview();});
api.postMessage({type:'ready'});
