'use strict';
const STYLE_RULE = 'Aster Atelier · editor style';
const SHARED = ['workbench.colorTheme','editor.fontFamily','editor.fontSize','editor.fontWeight','asterAppearance.fontStyle'];
function styleSettings(current, italic) {
  const text = structuredClone(current.text || {}), semantic = structuredClone(current.semantic || {});
  text.textMateRules = [...(text.textMateRules || []).filter(rule=>rule.name !== STYLE_RULE),
    {name:STYLE_RULE,scope:['source','text','comment','string','keyword','storage','constant','entity','support','variable','punctuation','meta'],settings:{fontStyle:italic?'italic':''}}];
  semantic.rules = {...semantic.rules,'*':{...(typeof semantic.rules?.['*']==='object'?semantic.rules['*']:{}),italic}};
  return {text,semantic};
}
async function updateGlobal(vscode, changes) {
  const config = vscode.workspace.getConfiguration(undefined,null);
  const applied = [];
  try {
    for (const [key,value] of Object.entries(changes)) {
      const before = structuredClone(vscode.workspace.getConfiguration(undefined,null).inspect(key)?.globalValue);
      if (JSON.stringify(before)===JSON.stringify(value)) continue;
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
  throw new Error('Unsupported setting value');
}
module.exports = {STYLE_RULE,SHARED,styleSettings,updateGlobal,validate};
