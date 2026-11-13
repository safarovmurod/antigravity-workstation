'use strict';
const api=acquireVsCodeApi();
const $=id=>document.getElementById(id);
// The page is built once from the `init` message. Later `state` messages only
// patch it, so the scroll position, the focused card and pending edits stay.
let view=null, applied=null, fontBusy=false, tuneBusy=false, previewId=0;
const cards=[], labels=new Map(), loadedPreviews=new Map();
let currentGroup, currentCard;
const saved=api.getState()||{};
const remember=patch=>{Object.assign(saved,patch);api.setState(saved);};
const signed=value=>(value>0?'+':'')+value+'%';

// ---- Theme gallery: every theme is a card in its own colours. A click (or
// Enter on the focused card) applies the theme at once.
const SWATCH=['background','foreground','keyword','function','string','type','comment'];
function token(className,text){const span=document.createElement('span');span.className=className;span.textContent=text;return span;}
function line(...parts){const span=document.createElement('span');span.className='line';span.append(...parts);return span;}
function paint(button,option){
  button.dataset.value=option.value;labels.get(button).textContent=option.label;
  for(const key of SWATCH)if(option.swatch?.[key])button.style.setProperty('--'+key,option.swatch[key]);
}
function card(option){
  const button=document.createElement('button');
  button.type='button';button.className='card';button.tabIndex=-1;button.setAttribute('aria-pressed','false');
  const sample=document.createElement('span');sample.className='sample';sample.setAttribute('aria-hidden','true');
  sample.append(line(token('k','const'),' ',token('f','greet'),' = ',token('t','User')),line(token('s','"hi"'),' ',token('c','// ok')));
  const name=document.createElement('span'),label=token('label','');name.className='name';name.append(label,token('badge','сейчас'));
  button.append(sample,name);labels.set(button,label);paint(button,option);
  button.addEventListener('click',()=>chooseTheme(button.dataset.value));
  button.addEventListener('keydown',move);
  cards.push(button);
  return button;
}
// Arrow keys only move the focus; nothing is applied until Enter or a click.
function move(event){
  const shown=cards.filter(visible),index=shown.indexOf(event.currentTarget);
  const next={ArrowRight:index+1,ArrowDown:index+1,ArrowLeft:index-1,ArrowUp:index-1,Home:0,End:shown.length-1}[event.key];
  if(next===undefined||index<0)return;
  event.preventDefault();
  const target=shown[(next+shown.length)%shown.length];
  for(const item of cards)item.tabIndex=item===target?0:-1;
  target.focus();remember({focus:target.dataset.value});
}
function group(title,note,options){
  const block=document.createElement('div');block.className='group';
  const heading=document.createElement('h3');heading.append(token('title',title),token('note',note));
  const grid=document.createElement('div');grid.className='grid';grid.append(...options.map(card));
  block.append(heading,grid);return block;
}
function buildGallery(themes,sections){
  const section=option=>option.section||sections[0].name;
  // The first group holds a theme chosen outside the studio; it is hidden otherwise.
  currentGroup=group('Сейчас','Тема, выбранная не в Aster Atelier',[{label:'',value:''}]);
  currentGroup.hidden=true;currentCard=cards[0];
  const blocks=sections.map(({name,note})=>[name,note,themes.filter(option=>section(option)===name)]).filter(([,,list])=>list.length);
  $('gallery').replaceChildren(currentGroup,...blocks.map(([name,note,list])=>group(name,note||'',list)));
}
const visible=item=>item!==currentCard||!currentGroup.hidden;
function markThemes(){
  const outside=applied.current;
  currentGroup.hidden=!outside;
  if(outside)paint(currentCard,outside);
  const shown=cards.filter(visible);
  const focusable=shown.find(item=>item.dataset.value===saved.focus)||shown.find(item=>item.dataset.value===applied.theme)||shown[0];
  for(const item of cards){
    const on=visible(item)&&item.dataset.value===applied.theme,pending=!on&&item.dataset.value===saved.pendingTheme;
    item.className='card'+(on?' applied':'')+(pending?' pending':'');
    item.setAttribute('aria-pressed',String(on));
    item.tabIndex=item===focusable?0:-1;
  }
}
function chooseTheme(value){
  if(!value||value===applied?.theme)return;
  remember({pendingTheme:value,focus:value});markThemes();
  say('Применяю тему…');
  api.postMessage({type:'apply-theme',value});
}

// ---- Brightness and contrast: they retune the Aster palette that is on, and
// only the Apply button writes them.
const asterTheme=()=>view.themes.some(option=>option.group==='aster'&&option.value===applied.theme);
const tuneValues=()=>({brightness:Number($('brightness').value),contrast:Number($('contrast').value)});
const tunePending=()=>['brightness','contrast'].some(key=>tuneValues()[key]!==applied[key]);
function renderTune(){
  const tunable=asterTheme();
  $('brightness').disabled=$('contrast').disabled=tuneBusy||!tunable;
  $('brightnessValue').textContent=signed(tuneValues().brightness);$('contrastValue').textContent=signed(tuneValues().contrast);
  $('applyTune').disabled=tuneBusy||!tunable||!tunePending();$('cancelTune').disabled=tuneBusy||!tunePending();
  $('tuneHint').textContent=!tunable?'Яркость и контраст меняют только темы Aster.':tunePending()?'Не применено: нажмите «Применить яркость и контраст».':'';
}
function restoreTune(){$('brightness').value=applied.brightness;$('contrast').value=applied.contrast;}

// ---- Fonts: family, size, weight and style are previewed here and applied
// together with «Применить шрифт».
const fontValues=()=>({font:$('font').value,size:Number($('size').value),weight:Number($('weight').value),style:$('style').value,uiFont:$('uiFont').checked});
const fontPending=()=>['font','size','weight','style','uiFont'].some(key=>fontValues()[key]!==applied[key]);
function renderFont(){
  const values=fontValues();
  $('applyFont').disabled=fontBusy||!fontPending()||!Number.isInteger(values.size)||values.size<8||values.size>40;
  $('cancelFont').disabled=fontBusy||!fontPending();
}
function setWeightRange(font){
  $('weight').min=font?font.minWeight:100;$('weight').max=font?font.maxWeight:900;$('weight').step=font?font.weightStep:100;
  for(const option of $('style').options){
    const style=view.styles.find(item=>item.value===option.value);
    option.disabled=Boolean(font&&style?.weight&&(style.weight<font.minWeight||style.weight>font.maxWeight||(style.weight-font.minWeight)%font.weightStep!==0));
  }
}
function restoreFont(){
  $('font').value=applied.font;setWeightRange(view.fonts.find(f=>f.id===applied.font));
  $('size').value=applied.size;$('weight').value=applied.weight;$('style').value=applied.style;$('uiFont').checked=applied.uiFont;
}
async function localFont(family,names=[]){
  const face=new FontFace('AsterLocalProbe',[family,...names].map(name=>`local(${JSON.stringify(name)})`).join(','));
  try{await face.load();return true;}catch{return false;}
}
// The bundled files load into the preview, so it shows the font and its
// ligatures before the font is installed.
async function previewFamily(font,id){
  if(applied.availability[font.id]===true&&await localFont(font.family,font.localNames))return font.family;
  const family='AsterPreview-'+font.id;
  if(!loadedPreviews.has(font.id))loadedPreviews.set(font.id,Promise.all(font.preview.map(async file=>{
    const face=new FontFace(family,`url(${JSON.stringify(file.uri)})`,{style:file.italic?'italic':'normal',weight:file.weight[0]===file.weight[1]?String(file.weight[0]):file.weight.join(' ')});
    await face.load();document.fonts.add(face);
  })));
  try{await loadedPreviews.get(font.id);return family;}
  catch(error){loadedPreviews.delete(font.id);if(id===previewId)$('availability').textContent='Предпросмотр не загрузился: '+error.message;return null;}
}
async function preview(){
  const id=++previewId,font=view.fonts.find(f=>f.id===$('font').value);
  $('weightValue').textContent=$('weight').value;
  Object.assign($('preview').style,{fontSize:$('size').value+'px',fontWeight:$('weight').value,fontStyle:view.styles.find(style=>style.value===$('style').value)?.italic?'italic':'normal',fontFeatureSettings:font?.fontFeatures||'"liga" 1, "calt" 1'});
  $('preview').dataset.style=view.styles.find(style=>style.value===$('style').value)?.role||'';
  renderFont();
  if(!font){
    $('preview').style.fontFamily=applied.family||'monospace';
    $('availability').textContent='Текущий шрифт редактора. Выберите семейство из списка, чтобы сменить его.';
    return;
  }
  $('availability').textContent=applied.detectionError?'Не удалось проверить шрифты системы: '+applied.detectionError
    :applied.availability[font.id]===true?'Установлен в системе. Лигатуры (=> !== <=) включаются вместе со шрифтом.':'Входит в расширение и будет установлен при нажатии «Применить шрифт».';
  const family=await previewFamily(font,id);
  if(family&&id===previewId)$('preview').style.fontFamily=JSON.stringify(family)+', monospace';
}

// ---- State from the extension
function normalise(data){
  const primary=(data.family||'').split(',')[0].trim().replace(/^(['"])(.*)\1$/,'$2').toLowerCase();
  const match=view.fonts.find(font=>font.family.toLowerCase()===primary);
  const weight=data.weight==='bold'?700:parseInt(data.weight,10)||400,style=view.styles.find(item=>item.value===data.style);
  return {theme:data.theme,current:data.current||null,family:data.family,font:match?match.id:'',size:data.size,
    weight,style:style&&(!style.weight||style.weight===weight)?style.value:style?.italic?'italic':'normal',
    brightness:data.brightness,contrast:data.contrast,uiFont:data.uiFont===true,availability:data.availability||{},detectionError:data.detectionError};
}
// A control still showing the old applied value follows the new one; an edit
// the user has not applied yet stays.
function applyState(data){
  const before=applied,tuneEdited=before&&tunePending(),fontEdited=before&&fontPending();
  applied=normalise(data);
  const hasCurrent=[...$('font').options].some(o=>o.value==='');
  if(hasCurrent!==!applied.font||!$('font').options.length)
    $('font').replaceChildren(...(applied.font?[]:[new Option('Текущий шрифт редактора','')]),...view.fonts.map(font=>new Option(font.family,font.id)));
  if(saved.pendingTheme===applied.theme)remember({pendingTheme:null});
  if(!tuneEdited)restoreTune();
  if(!fontEdited||![...$('font').options].some(o=>o.value===fontValues().font))restoreFont();
  markThemes();renderTune();
  if(data.profileScope&&data.profileScope.status!=='application-scoped'&&!$('message').textContent)say(data.profileScope.reason||'');
  return preview();
}
function say(text,error){
  $('message').textContent=text;$('message').className=error?'error':'';
  // Marks the page busy while a change is being written (the live IDE test waits on it).
  if(document.body)document.body.dataset.busy=fontBusy||tuneBusy||saved.pendingTheme?'1':'';
}
function result(data){
  if(data.action==='apply-theme')remember({pendingTheme:null});
  if(data.action==='apply-tune')tuneBusy=false;
  if(data.action==='apply-font')fontBusy=false;
  if(data.error){if(data.action==='apply-tune')restoreTune();if(data.action==='apply-font')restoreFont();}
  say(data.error||data.message,Boolean(data.error));
  markThemes();renderTune();return preview();
}
window.addEventListener('message',async({data})=>{
  if(data.type==='probe'){api.postMessage({type:'probe-result',id:data.id,loaded:await localFont(data.family,data.localNames)});return;}
  if(data.type==='init'){
    view=data;buildGallery(data.themes,data.sections);await applyState(data.state);
    window.scrollTo(0,saved.scrollY||0);return;
  }
  if(!view)return;
  if(data.type==='state')await applyState(data);
  else if(data.type==='result'&&data.action)await result(data);
  else if(data.type==='result')say(data.error||data.message,Boolean(data.error));
});
let scrollTimer;
window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>remember({scrollY:window.scrollY}),100);});
for(const key of ['brightness','contrast'])$(key).addEventListener('input',renderTune);
$('applyTune').addEventListener('click',()=>{if(tuneBusy||!tunePending())return;tuneBusy=true;renderTune();say('Применяю яркость и контраст…');api.postMessage({type:'apply-tune',...tuneValues()});});
$('cancelTune').addEventListener('click',()=>{restoreTune();renderTune();});
$('uiFont').addEventListener('change',renderFont);
$('font').addEventListener('change',()=>{
  const font=view.fonts.find(f=>f.id===$('font').value);setWeightRange(font);
  const style=view.styles.find(item=>item.value===$('style').value);
  if([...$('style').options].find(option=>option.value===style?.value)?.disabled)$('style').value=style.italic?'italic':'normal';
  if(font)$('weight').value=Math.min(font.maxWeight,Math.max(font.minWeight,Number($('weight').value)));
  preview();
});
$('style').addEventListener('input',()=>{const style=view.styles.find(item=>item.value===$('style').value);if(style?.weight)$('weight').value=style.weight;preview();});
$('weight').addEventListener('input',()=>{const style=view.styles.find(item=>item.value===$('style').value);if(style?.weight)$('style').value=style.italic?'italic':'normal';preview();});
$('size').addEventListener('input',preview);
$('applyFont').addEventListener('click',()=>{if(fontBusy)return;fontBusy=true;renderFont();say('Применяю шрифт…');api.postMessage({type:'apply-font',...fontValues()});});
$('cancelFont').addEventListener('click',()=>{restoreFont();preview();});
api.postMessage({type:'ready'});
