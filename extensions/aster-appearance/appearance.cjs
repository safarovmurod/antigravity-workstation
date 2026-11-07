'use strict';
const STYLE_RULE = 'Aster Atelier · editor style';
const SHARED = ['workbench.colorTheme','asterAppearance.theme','editor.fontFamily','editor.fontSize','editor.fontWeight','asterAppearance.fontStyle',
  'asterAppearance.brightness','asterAppearance.contrast','asterAppearance.windowOpacity','asterAppearance.uiFont'];
// Every font surface the host registers, so a selected font reaches the whole
// IDE. The installer also treats these as personal choices. The legacy
// notebook.outputFontFamily string exists in host code but is not registered.
const FONT_FAMILY_KEYS = ['editor.fontFamily','terminal.integrated.fontFamily','debug.console.fontFamily',
  'chat.editor.fontFamily','chat.fontFamily','editor.inlayHints.fontFamily','editor.inlineSuggest.fontFamily',
  'notebook.output.fontFamily','notebook.markup.fontFamily','scm.inputFontFamily'];
// Italic is applied as one owned TextMate rule plus the semantic wildcard's
// italic flag; normal removes exactly those, leaving every other rule alone.
function styleSettings(current, italic) {
  const text = structuredClone(current.text || {}), semantic = structuredClone(current.semantic || {});
  text.textMateRules = (text.textMateRules || []).filter(rule=>rule.name !== STYLE_RULE);
  if (italic) text.textMateRules.push({name:STYLE_RULE,scope:['source','text','comment','string','keyword','storage','constant','entity','support','variable','punctuation','meta'],settings:{fontStyle:'italic'}});
  if (!text.textMateRules.length) delete text.textMateRules;
  const rules = {...semantic.rules}, wildcard = rules['*'];
  const style = typeof wildcard==='string' ? {foreground:wildcard} : {...wildcard};
  if (italic) style.italic = true; else delete style.italic;
  if (Object.keys(style).length) rules['*'] = typeof wildcard==='string' && Object.keys(style).length===1 ? wildcard : style; else delete rules['*'];
  if (Object.keys(rules).length) semantic.rules = rules; else delete semantic.rules;
  return {text,semantic};
}
async function updateGlobal(vscode, changes) {
  const config = vscode.workspace.getConfiguration(undefined,null);
  const snapshots=new Map(Object.entries(changes).filter(([,value])=>typeof value==='object').map(([key])=>
    [key,structuredClone(vscode.workspace.getConfiguration(undefined,null).inspect(key)?.globalValue)]));
  const applied = [];
  try {
    for (const [key,value] of Object.entries(changes)) {
      const before = structuredClone(vscode.workspace.getConfiguration(undefined,null).inspect(key)?.globalValue);
      if (JSON.stringify(before)===JSON.stringify(value)) continue;
      if(snapshots.has(key)&&JSON.stringify(before)!==JSON.stringify(snapshots.get(key)))throw new Error('Setting changed while applying appearance: '+key);
      await config.update(key,value,vscode.ConfigurationTarget.Global);
      applied.push({key,before,value});
    }
  } catch (error) {
    const failures = [];
    for (const item of applied.reverse()) {
      if (JSON.stringify(vscode.workspace.getConfiguration(undefined,null).inspect(item.key)?.globalValue)!==JSON.stringify(item.value)) { failures.push(item.key+' changed concurrently'); continue; }
      try { await config.update(item.key,item.before,vscode.ConfigurationTarget.Global); } catch (rollback) { failures.push(rollback.message); }
    }
    throw new Error(error.message+(failures.length?'; rollback incomplete: '+failures.join('; '):'; previous settings restored'));
  }
}
function validate(change, themes, fonts) {
  if (!change || typeof change!=='object') throw new Error('Invalid setting');
  if (change.key==='theme' && themes.includes(change.value)) return {'workbench.colorTheme':change.value};
  if (change.key==='size' && Number.isInteger(change.value) && change.value>=8 && change.value<=40) return {'editor.fontSize':change.value};
  if (change.key==='weight' && Number.isInteger(change.value) && change.value>=100 && change.value<=900 && change.value%100===0) return {'editor.fontWeight':String(change.value)};
  if (change.key==='style' && ['normal','italic'].includes(change.value)) return {'asterAppearance.fontStyle':change.value};
  if (change.key==='font' && fonts.some(font=>font.id===change.value)) return fonts.find(font=>font.id===change.value);
  if (change.key==='brightness' && Number.isInteger(change.value) && change.value>=-30 && change.value<=30) return {'asterAppearance.brightness':change.value};
  if (change.key==='contrast' && Number.isInteger(change.value) && change.value>=-20 && change.value<=30) return {'asterAppearance.contrast':change.value};
  if (change.key==='opacity' && Number.isInteger(change.value) && change.value>=50 && change.value<=100) return {'asterAppearance.windowOpacity':change.value};
  if (change.key==='uiFont' && typeof change.value==='boolean') return {'asterAppearance.uiFont':change.value};
  throw new Error('Unsupported setting value');
}
module.exports = {STYLE_RULE,SHARED,FONT_FAMILY_KEYS,styleSettings,updateGlobal,validate};
