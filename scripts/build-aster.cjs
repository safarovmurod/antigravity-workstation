'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../extensions/aster-appearance');
const palettes = require('../extensions/aster-appearance/palettes.cjs');
const blend = (a,b,t) => '#' + [1,3,5].map(i => Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
function theme(p) {
  const [name,type,bg,surface,fg,accent,keyword,string,number,muted] = p;
  const dark = type === 'dark';
  const border = blend(bg,fg,.16), hover = blend(bg,fg,.08), active = blend(bg,accent,.18);
  const error = dark ? '#f19b9b' : '#a32538', warning = dark ? '#e6ca82' : '#795811', info = accent;
  const colors = {};
  const set = (keys,value) => keys.split(' ').forEach(k => colors[k] = value);
  set('foreground editor.foreground terminal.foreground input.foreground dropdown.foreground quickInput.foreground sideBar.foreground activityBar.foreground statusBar.foreground titleBar.activeForeground panelTitle.activeForeground tab.activeForeground list.activeSelectionForeground list.focusForeground settings.headerForeground',fg);
  set('editor.background terminal.background tab.activeBackground editorGroupHeader.tabsBackground',bg);
  set('sideBar.background activityBar.background statusBar.background titleBar.activeBackground panel.background quickInput.background dropdown.background',surface);
  set('input.background settings.textInputBackground settings.numberInputBackground',hover);
  set('focusBorder editorCursor.foreground activityBar.activeBorder tab.activeBorderTop panelTitle.activeBorder progressBar.background editorBracketHighlight.foreground1',accent);
  set('widget.border input.border dropdown.border panel.border sideBar.border editorGroup.border statusBar.border tab.border editorWidget.border',border);
  set('descriptionForeground disabledForeground editorLineNumber.foreground editorCodeLens.foreground tab.inactiveForeground titleBar.inactiveForeground',muted);
  set('editorLineNumber.activeForeground',fg);
  set('list.hoverBackground toolbar.hoverBackground tab.hoverBackground editor.lineHighlightBackground',hover);
  set('list.activeSelectionBackground list.focusBackground list.inactiveSelectionBackground quickInputList.focusBackground',active);
  set('editor.selectionBackground terminal.selectionBackground',accent+'44');
  set('editor.inactiveSelectionBackground editor.selectionHighlightBackground',accent+'22');
  set('editor.wordHighlightBackground editor.wordHighlightStrongBackground',accent+'28');
  set('editorBracketMatch.background',accent+'22'); set('editorBracketMatch.border',accent+'88');
  set('editorIndentGuide.background1 editorRuler.foreground',border);
  set('editorIndentGuide.activeBackground1',muted);
  set('editorError.foreground problemsErrorIcon.foreground list.errorForeground gitDecoration.deletedResourceForeground',error);
  set('editorWarning.foreground problemsWarningIcon.foreground gitDecoration.modifiedResourceForeground',warning);
  set('editorInfo.foreground problemsInfoIcon.foreground gitDecoration.untrackedResourceForeground',info);
  set('gitDecoration.ignoredResourceForeground',muted);
  set('diffEditor.insertedTextBackground',string+'22'); set('diffEditor.removedTextBackground',error+'22');
  set('button.background badge.background activityBarBadge.background',accent);
  set('button.foreground badge.foreground activityBarBadge.foreground',surface);
  set('button.hoverBackground',blend(accent,fg,.15));
  set('button.secondaryBackground',border);set('button.secondaryForeground',fg);
  set('scrollbarSlider.background',muted+'44'); set('scrollbarSlider.hoverBackground',muted+'66');
  const ansi = [surface,error,string,warning,accent,keyword,info,fg];
  ['Black','Red','Green','Yellow','Blue','Magenta','Cyan','White'].forEach((n,i) => { colors['terminal.ansi'+n]=ansi[i]; colors['terminal.ansiBright'+n]=blend(ansi[i],fg,.18); });
  [accent,keyword,string,number,info,error].forEach((c,i)=>colors['editorBracketHighlight.foreground'+(i+1)]=c);
  const rules = [
    [['comment','punctuation.definition.comment'],muted],
    [['keyword','storage','storage.type','keyword.control.import','keyword.control.export'],keyword],
    [['string','string.quoted','string.template','markup.inline.raw'],string],
    [['constant.numeric','constant.language','constant.character'],number],
    [['entity.name.function','support.function','meta.function-call'],accent],
    [['entity.name.type','entity.name.class','entity.name.interface','support.type','support.class'],number],
    [['variable','variable.other','meta.object-literal.key','support.variable'],fg],
    [['variable.parameter','entity.other.attribute-name'],accent],
    [['entity.name.tag','punctuation.definition.tag'],keyword],
    [['support.type.property-name.css','meta.property-name.css'],accent],
    [['string.quoted.double.json','support.type.property-name.json'],string],
    [['punctuation','meta.brace','keyword.operator'],muted],
    [['invalid','invalid.illegal'],error],
    [['markup.heading','markup.bold'],accent],
  ];
  return { name,type,semanticHighlighting:true,colors,tokenColors:rules.map(([scope,foreground])=>({scope,settings:{foreground}})),
    semanticTokenColors:{namespace:number,type:number,class:number,interface:number,enum:number,typeParameter:number,function:accent,method:accent,variable:fg,parameter:accent,property:fg,enumMember:number,keyword,comment:muted,string,number,operator:muted} };
}
function build() {
  fs.mkdirSync(path.join(root,'themes'),{recursive:true});
  const contributions = palettes.map((p,i) => {
    const file = `themes/${String(i+1).padStart(2,'0')}-color-theme.json`;
    fs.writeFileSync(path.join(root,file),JSON.stringify(theme(p),null,2)+'\n');
    return {label:p[0],uiTheme:p[1] === 'light' ? 'vs' : 'vs-dark',path:'./'+file};
  });
  const manifest = {name:'aster-appearance',displayName:'Aster Atelier',publisher:'workstation',version:'1.0.3',
    description:'Twenty original editor palettes and ten programming fonts. A focused appearance studio for Antigravity.',license:'MIT',engines:{vscode:'^1.107.0'},categories:['Themes'],
    icon:'icon.png',main:'./extension.cjs',extensionKind:['ui'],activationEvents:['onStartupFinished'],
    repository:{type:'git',url:'https://github.com/safarovmurod/antigravity-workstation.git',directory:'extensions/aster-appearance'},
    contributes:{themes:contributions,commands:[{command:'asterAppearance.open',title:'Aster Atelier: Appearance Studio — темы и шрифты'},{command:'asterAppearance.selectTheme',title:'Aster Atelier: Выбрать тему без предпросмотра'}],
      menus:{'extension/context':[{command:'asterAppearance.open',when:'extension == workstation.aster-appearance',group:'navigation'},{command:'asterAppearance.selectTheme',when:'extension == workstation.aster-appearance',group:'navigation'}]},
      configuration:{title:'Aster Atelier',properties:{'asterAppearance.fontStyle':{type:'string',enum:['normal','italic'],default:'normal',scope:'application',description:'Editor token style. Uses supported TextMate and semantic styling; does not patch the IDE.'}}}}};
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(manifest,null,2)+'\n');
}
if (require.main === module) build();
module.exports = {build,theme,blend};
