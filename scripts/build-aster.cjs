'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../extensions/aster-appearance');
const palettes = require('../extensions/aster-appearance/palettes.cjs');
const registry = require('./aster-color-registry.json');
const blend = (a,b,t) => '#' + [1,3,5].map(i => Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
const luminance = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
const contrast = (a,b) => { const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p); return (x+.05)/(y+.05); };
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
const known = new Set(registry.registry);

// OKLCH keeps every syntax colour at the same perceived brightness and
// colourfulness, so code is clearly coloured without neon glare.
const linear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
const gamma = x => x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055;
function oklch(L,C,H) {
  for (let c = C; c >= 0; c -= .002) {
    const a = c*Math.cos(H*Math.PI/180), b = c*Math.sin(H*Math.PI/180);
    const [l,m,s] = [[.3963377774,.2158037573],[-.1055613458,-.0638541728],[-.0894841775,-1.291485548]].map(([x,y]) => (L+x*a+y*b)**3);
    const rgb = [[4.0767416621,-3.3077115913,.2309699292],[-1.2684380046,2.6097574011,-.3413193965],[-.0041960863,-.7034186147,1.707614701]].map(([x,y,z]) => x*l+y*m+z*s);
    if (rgb.every(v => v >= -1e-4 && v <= 1.0001)) return '#' + rgb.map(v => Math.round(gamma(Math.min(1,Math.max(0,v)))*255).toString(16).padStart(2,'0')).join('');
  }
}
// One role, one hue in every palette, so all themes read the same way: keywords violet,
// functions blue, strings green, numbers orange, types gold, tags coral, attributes teal,
// comments slate blue, parameters rose; variables keep a light blue tint instead of grey.
const ROLE_HUES = {keyword:305,func:250,string:140,number:55,type:90,tag:22,property:195,comment:270,parameter:350,variable:235};
function syntaxColors(bg, fg, accent, muted, dark) {
  const ink = (h, C, L) => { for (;; L += dark ? .01 : -.01) { const c = oklch(L,C,h); if (contrast(c,bg) >= 4.6) return c; } };
  const readable = color => { for (let t = 0; t <= 1; t += .05) { const c = blend(color,fg,t); if (contrast(c,bg) >= 4.6) return c; } return fg; };
  // [chroma, lightness] per role; cyan reads brighter at the same chroma, so teal gets a little less.
  const tone = dark ? {property:[.11,.8],comment:[.08,.68],parameter:[.07,.84],variable:[.035,.9],other:[.13,.8]}
    : {property:[.14,.47],comment:[.09,.52],parameter:[.08,.4],variable:[.05,.3],other:[.17,.47]};
  const s = Object.fromEntries(Object.entries(ROLE_HUES).map(([role,h]) => [role, ink(h, ...(tone[role] || tone.other))]));
  return { ...s, operator: readable(blend(fg,muted,.45)) };
}

// Every surface the IDE draws is assigned from the palette, so no panel,
// widget or corner keeps the base theme's grey. Keys are checked against the
// IDE colour registry, and every key the built-in Default themes set is replaced.
function theme(p) {
  const [name,type,bg,surface,fg,accent,keyword,string,number,muted] = p;
  const dark = type === 'dark';
  const syntax = syntaxColors(bg,fg,accent,muted,dark);
  const on = color => [bg,surface,fg,'#ffffff','#000000'].sort((a,b)=>contrast(color,b)-contrast(color,a))[0];
  const border = blend(surface,fg,dark?.13:.15), strong = blend(bg,fg,dark?.3:.34);
  const raised = dark ? blend(bg,fg,.05) : blend(bg,'#ffffff',.6), input = dark ? blend(bg,fg,.075) : blend(bg,'#ffffff',.8);
  const hover = fg+(dark?'14':'10'), selection = accent+(dark?'38':'2b'), quiet = accent+(dark?'20':'18');
  const error = dark?'#f19b9b':'#a32538', warning = dark?'#e6ca82':'#795811', success = string, info = accent;
  const shadow = dark?'#00000066':'#00000024';
  const colors = {};
  const set = (keys,value) => keys.trim().split(/\s+/).forEach(k => colors[k] = value);
  set('foreground icon.foreground editor.foreground editorWidget.foreground',fg);
  set('descriptionForeground',muted); set('disabledForeground',muted+'aa'); set('errorForeground',error);
  set('focusBorder',accent+'aa'); set('selection.background',accent+'55'); set('widget.border',border+'cc'); set('widget.shadow scrollbar.shadow',shadow);
  set('sash.hoverBorder',accent);
  set('textLink.foreground textLink.activeForeground editorLink.activeForeground notificationLink.foreground',accent);
  set('textPreformat.foreground',number); set('textPreformat.background textBlockQuote.background textCodeBlock.background',raised);
  set('textBlockQuote.border',accent+'66'); set('textSeparator.foreground',border);
  // Window chrome
  set(`titleBar.activeBackground titleBar.inactiveBackground activityBar.background sideBar.background sideBarSectionHeader.background
    statusBar.background statusBar.noFolderBackground panel.background panelSectionHeader.background editorGroupHeader.tabsBackground
    tab.inactiveBackground tab.unfocusedInactiveBackground terminal.background terminalStickyScroll.background`,surface);
  set(`titleBar.activeForeground activityBar.foreground activityBarTop.foreground sideBar.foreground sideBarTitle.foreground
    sideBarSectionHeader.foreground statusBar.foreground statusBar.noFolderForeground panelTitle.activeForeground panelSectionHeader.foreground terminal.foreground`,fg);
  set(`titleBar.inactiveForeground activityBar.inactiveForeground activityBarTop.inactiveForeground panelTitle.inactiveForeground
    tab.inactiveForeground tab.unfocusedInactiveForeground breadcrumb.foreground`,muted);
  set(`titleBar.border activityBar.border sideBar.border sideBarSectionHeader.border statusBar.border panel.border panelInput.border
    panelSectionHeader.border panelSection.border editorGroup.border editorGroupHeader.tabsBorder tab.border tab.lastPinnedBorder terminal.border
    notifications.border notificationCenter.border notificationToast.border menu.border editorWidget.border editorSuggestWidget.border
    editorHoverWidget.border debugToolBar.border pickerGroup.border keybindingLabel.border settings.headerBorder settings.sashBorder
    tree.tableColumnsBorder notebook.cellBorderColor notebook.cellToolbarSeparator editorStickyScroll.border diffEditor.border
    terminalOverviewRuler.border welcomePage.tileBorder chat.requestBorder chat.requestCodeBorder chat.checkpointSeparator
    inlineChat.border inlineChatInput.border menu.separatorBackground`,border);
  set(`activityBar.activeBorder activityBarTop.activeBorder panelTitle.activeBorder tab.activeBorderTop tab.selectedBorderTop
    terminal.tab.activeBorder statusBar.focusBorder statusBarItem.focusBorder progressBar.background editorCursor.foreground
    terminalCursor.foreground inputOption.activeBorder peekView.border tab.dragAndDropBorder tab.activeModifiedBorder panel.dropBorder
    listFilterWidget.outline checkbox.selectBorder radio.activeBorder diffEditor.move.border`,accent);
  set('commandCenter.background',fg+'0d'); set('commandCenter.foreground commandCenter.activeForeground',fg); set('commandCenter.inactiveForeground',muted);
  set('commandCenter.border',border); set('commandCenter.activeBorder',strong); set('commandCenter.activeBackground menubar.selectionBackground',hover); set('menubar.selectionForeground',fg);
  set(`activityBarBadge.background badge.background button.background extensionButton.background extensionButton.prominentBackground
    statusBarItem.remoteBackground statusBar.debuggingBackground extensionBadge.remoteBackground`,accent);
  set(`activityBarBadge.foreground badge.foreground button.foreground extensionButton.foreground extensionButton.prominentForeground
    statusBarItem.remoteForeground statusBar.debuggingForeground extensionBadge.remoteForeground`,on(accent));
  set('button.hoverBackground extensionButton.hoverBackground extensionButton.prominentHoverBackground statusBarItem.remoteHoverBackground',blend(accent,dark?fg:'#000000',.14));
  set('button.border',accent); set('button.separator extensionButton.separator',on(accent)+'66');
  set('button.secondaryBackground',blend(bg,fg,.12)); set('button.secondaryHoverBackground',blend(bg,fg,.18)); set('button.secondaryForeground',fg);
  set(`statusBarItem.hoverBackground statusBarItem.compactHoverBackground toolbar.hoverBackground list.hoverBackground tab.hoverBackground
    tab.unfocusedHoverBackground editorStickyScrollHover.background terminalStickyScrollHover.background inputOption.hoverBackground radio.inactiveHoverBackground`,hover);
  set('statusBarItem.hoverForeground statusBarItem.prominentForeground list.hoverForeground tab.hoverForeground',fg);
  set('statusBarItem.activeBackground toolbar.activeBackground',fg+'24'); set('statusBarItem.prominentBackground',fg+'1f'); set('statusBarItem.prominentHoverBackground',fg+'2a');
  set('statusBarItem.errorBackground',error); set('statusBarItem.errorForeground',on(error)); set('statusBarItem.warningBackground',warning); set('statusBarItem.warningForeground',on(warning));
  set('statusBar.debuggingBorder',border); set('actionBar.toggledBackground',accent+'33');
  // Editor area
  set(`editor.background editorGutter.background editorGroup.emptyBackground editorGroupHeader.noTabsBackground tab.activeBackground
    tab.unfocusedActiveBackground tab.selectedBackground tab.activeBorder tab.unfocusedActiveBorder breadcrumb.background minimap.background
    editorStickyScroll.background notebook.editorBackground welcomePage.background editorCursor.background`,bg);
  set('tab.activeForeground tab.selectedForeground breadcrumb.focusForeground breadcrumb.activeSelectionForeground editorLineNumber.activeForeground',fg);
  set('tab.unfocusedActiveForeground',blend(fg,bg,.25)); set('tab.unfocusedActiveBorderTop',border); set('tab.inactiveModifiedBorder',muted);
  set('editorLineNumber.foreground',blend(muted,bg,.2)); set('editorLineNumber.dimmedForeground',blend(muted,bg,.5));
  set('editor.selectionBackground terminal.selectionBackground',accent+(dark?'40':'33'));
  set('editor.inactiveSelectionBackground terminal.inactiveSelectionBackground',quiet);
  set('editor.selectionHighlightBackground editor.wordHighlightTextBackground editor.symbolHighlightBackground editor.hoverHighlightBackground terminal.hoverHighlightBackground',accent+'1f');
  set('editor.wordHighlightBackground',accent+'26'); set('editor.wordHighlightStrongBackground',accent+'33');
  set('editor.findMatchBackground terminal.findMatchBackground',warning+'55');
  set('editor.findMatchHighlightBackground terminal.findMatchHighlightBackground searchEditor.findMatchBackground list.filterMatchBackground',warning+'2e');
  set('editor.findMatchBorder',warning+'aa'); set('editor.findRangeHighlightBackground editor.rangeHighlightBackground',accent+'14');
  set('editorWhitespace.foreground',blend(bg,fg,.2)); set('editorIndentGuide.background1 editorRuler.foreground',blend(bg,fg,.09)); set('editorIndentGuide.activeBackground1',blend(bg,fg,.26));
  set('editorCodeLens.foreground editorInlayHint.foreground',muted); set('editorInlayHint.background',fg+'0d'); set('editorGhostText.foreground',muted+'b3');
  set('editorBracketMatch.background',accent+'22'); set('editorBracketMatch.border',accent+'88');
  [syntax.type,syntax.keyword,syntax.func,syntax.property,syntax.string,syntax.number].forEach((c,i)=>colors['editorBracketHighlight.foreground'+(i+1)]=c);
  set('editorBracketHighlight.unexpectedBracket.foreground',error);
  set('editorGutter.addedBackground minimapGutter.addedBackground chat.linesAddedForeground',success);
  set('editorGutter.deletedBackground minimapGutter.deletedBackground chat.linesRemovedForeground',error);
  set('editorGutter.modifiedBackground minimapGutter.modifiedBackground',accent);
  set(`editorError.foreground problemsErrorIcon.foreground notificationsErrorIcon.foreground list.errorForeground list.invalidItemForeground
    editorMarkerNavigationError.background debugConsole.errorForeground debugTokenExpression.error`,error);
  set(`editorWarning.foreground problemsWarningIcon.foreground notificationsWarningIcon.foreground list.warningForeground
    editorMarkerNavigationWarning.background debugConsole.warningForeground editorLightBulb.foreground chat.editedFileForeground`,warning);
  set(`editorInfo.foreground problemsInfoIcon.foreground notificationsInfoIcon.foreground editorMarkerNavigationInfo.background
    debugConsole.infoForeground editorLightBulbAutoFix.foreground`,info);
  set('editorHint.foreground',muted);
  set('editorOverviewRuler.border',bg); set('editorOverviewRuler.errorForeground',error); set('editorOverviewRuler.warningForeground',warning); set('editorOverviewRuler.infoForeground',info);
  set('editorOverviewRuler.findMatchForeground terminalOverviewRuler.findMatchForeground',warning+'aa'); set('editorOverviewRuler.modifiedForeground',accent+'99');
  set('editorOverviewRuler.addedForeground',success+'99'); set('editorOverviewRuler.deletedForeground',error+'99'); set('editorOverviewRuler.selectionHighlightForeground',accent+'66');
  set('editorOverviewRuler.bracketMatchForeground terminalOverviewRuler.cursorForeground',accent+'99');
  set('minimapSlider.background scrollbarSlider.background',muted+'33'); set('minimapSlider.hoverBackground scrollbarSlider.hoverBackground',muted+'55');
  set('minimapSlider.activeBackground scrollbarSlider.activeBackground',muted+'77');
  set('minimap.selectionHighlight',accent+'66'); set('minimap.findMatchHighlight',warning+'88'); set('minimap.errorHighlight',error+'aa'); set('minimap.warningHighlight',warning+'aa');
  // Floating widgets, menus, pickers and notifications share one raised surface.
  set(`editorWidget.background editorSuggestWidget.background editorHoverWidget.background menu.background quickInput.background
    notifications.background notificationCenterHeader.background peekViewResult.background peekViewTitle.background debugToolBar.background
    breadcrumbPicker.background dropdown.listBackground listFilterWidget.background editorMarkerNavigation.background debugExceptionWidget.background
    inlineChat.background welcomePage.tileBackground walkThrough.embeddedEditorBackground notebook.cellEditorBackground chat.avatarBackground`,raised);
  set(`editorSuggestWidget.foreground editorHoverWidget.foreground menu.foreground menu.selectionForeground quickInput.foreground
    quickInputList.focusForeground quickInputList.focusIconForeground notifications.foreground notificationCenterHeader.foreground
    peekViewTitleLabel.foreground peekViewResult.fileForeground peekViewResult.selectionForeground editorSuggestWidget.selectedForeground
    editorSuggestWidget.selectedIconForeground chat.avatarForeground inlineChat.foreground keybindingLabel.foreground`,fg);
  set(`editorSuggestWidget.highlightForeground editorSuggestWidget.focusHighlightForeground editorHoverWidget.highlightForeground
    list.highlightForeground list.focusHighlightForeground pickerGroup.foreground`,accent);
  set(`editorSuggestWidget.selectedBackground menu.selectionBackground quickInputList.focusBackground list.activeSelectionBackground
    list.focusBackground peekViewResult.selectionBackground`,selection);
  set('list.activeSelectionForeground list.activeSelectionIconForeground list.focusForeground list.inactiveSelectionForeground',fg);
  set('list.inactiveSelectionBackground',quiet); set('list.focusOutline list.focusAndSelectionOutline',accent+'99'); set('list.inactiveFocusOutline',border);
  set('list.dropBackground editorGroup.dropBackground sideBar.dropBackground terminal.dropBackground',accent+'22'); set('list.dropBetweenBackground',accent);
  set('list.deemphasizedForeground peekViewTitleDescription.foreground peekViewResult.lineForeground',muted);
  set('listFilterWidget.noMatchesOutline',error); set('listFilterWidget.shadow editorStickyScroll.shadow inlineChat.shadow',shadow);
  set('tree.indentGuidesStroke',blend(bg,fg,.2)); set('tree.inactiveIndentGuidesStroke',blend(bg,fg,.1)); set('tree.tableOddRowsBackground',fg+'06');
  set('quickInputTitle.background editorHoverWidget.statusBarBackground',blend(raised,fg,.04)); set('editorWidget.resizeBorder',accent);
  set('peekViewEditor.background peekViewEditorGutter.background',blend(bg,accent,.035)); set('peekViewEditor.matchHighlightBackground peekViewResult.matchHighlightBackground',warning+'40');
  set('keybindingLabel.background',fg+'14'); set('keybindingLabel.bottomBorder',strong);
  set('banner.background',blend(surface,accent,.22)); set('banner.foreground',fg); set('banner.iconForeground',accent);
  // Inputs and form controls
  set(`input.background dropdown.background checkbox.background settings.dropdownBackground settings.textInputBackground
    settings.numberInputBackground settings.checkboxBackground inlineChatInput.background`,input);
  set(`input.foreground dropdown.foreground checkbox.foreground settings.dropdownForeground settings.textInputForeground settings.numberInputForeground
    settings.checkboxForeground settings.headerForeground settings.settingsHeaderHoverForeground inputOption.activeForeground radio.activeForeground
    inputValidation.errorForeground inputValidation.warningForeground inputValidation.infoForeground`,fg);
  set(`input.border dropdown.border checkbox.border settings.dropdownBorder settings.textInputBorder settings.numberInputBorder
    settings.checkboxBorder searchEditor.textInputBorder radio.inactiveBorder`,strong);
  set('input.placeholderForeground inlineChatInput.placeholderForeground',muted); set('inlineChatInput.focusBorder',accent);
  set('inputOption.activeBackground radio.activeBackground',accent+'33'); set('checkbox.selectBackground',raised);
  set('inputValidation.errorBackground inputValidation.warningBackground inputValidation.infoBackground',raised);
  set('inputValidation.errorBorder',error); set('inputValidation.warningBorder',warning); set('inputValidation.infoBorder',info);
  set('settings.modifiedItemIndicator',accent); set('settings.focusedRowBackground',fg+'0a'); set('settings.rowHoverBackground',fg+'07'); set('settings.focusedRowBorder',accent+'66');
  // Diff, merge, debugging, testing and source control
  set('diffEditor.insertedTextBackground diffEditorGutter.insertedLineBackground inlineChatDiff.inserted',success+'26');
  set('diffEditor.removedTextBackground diffEditorGutter.removedLineBackground inlineChatDiff.removed',error+'26');
  set('diffEditor.insertedLineBackground',success+'14'); set('diffEditor.removedLineBackground',error+'14'); set('diffEditor.diagonalFill',border);
  set('diffEditor.unchangedRegionBackground',surface); set('diffEditorOverview.insertedForeground',success+'99'); set('diffEditorOverview.removedForeground',error+'99');
  set('merge.currentHeaderBackground',success+'4d'); set('merge.currentContentBackground',success+'1f'); set('merge.incomingHeaderBackground',accent+'4d');
  set('merge.incomingContentBackground',accent+'1f'); set('merge.commonHeaderBackground',muted+'4d'); set('merge.commonContentBackground',muted+'1f');
  set('editor.stackFrameHighlightBackground',warning+'26'); set('editor.focusedStackFrameHighlightBackground',success+'26');
  set('debugIcon.breakpointForeground debugIcon.stopForeground debugIcon.disconnectForeground debugView.exceptionLabelBackground',error);
  set('debugIcon.breakpointDisabledForeground debugIcon.breakpointUnverifiedForeground',muted); set('debugIcon.breakpointCurrentStackframeForeground',warning);
  set('debugIcon.breakpointStackframeForeground debugIcon.startForeground debugIcon.restartForeground',success);
  set(`debugIcon.pauseForeground debugIcon.stepOverForeground debugIcon.stepIntoForeground debugIcon.stepOutForeground debugIcon.continueForeground
    debugIcon.stepBackForeground debugConsoleInputIcon.foreground`,accent);
  set('debugView.exceptionLabelForeground',on(error)); set('debugView.stateLabelBackground',fg+'1f'); set('debugView.stateLabelForeground debugConsole.sourceForeground debugTokenExpression.value',fg);
  set('debugTokenExpression.name',syntax.property); set('debugTokenExpression.string',syntax.string); set('debugTokenExpression.boolean debugTokenExpression.number',syntax.number);
  set('debugExceptionWidget.border',error);
  set('testing.iconFailed testing.iconErrored testing.peekBorder',error); set('testing.iconPassed testing.runAction',success); set('testing.iconQueued',warning);
  set('testing.iconUnset testing.iconSkipped',muted); set('testing.peekHeaderBackground',error+'1a');
  set('gitDecoration.addedResourceForeground gitDecoration.untrackedResourceForeground',success); set('gitDecoration.modifiedResourceForeground gitDecoration.stageModifiedResourceForeground',warning);
  set('gitDecoration.deletedResourceForeground gitDecoration.stageDeletedResourceForeground',error); set('gitDecoration.renamedResourceForeground',info);
  set('gitDecoration.ignoredResourceForeground',muted); set('gitDecoration.conflictingResourceForeground',keyword); set('gitDecoration.submoduleResourceForeground',number);
  set('terminalCommandDecoration.defaultBackground',muted); set('terminalCommandDecoration.successBackground',success); set('terminalCommandDecoration.errorBackground',error);
  // Antigravity chat, notebooks, welcome and the remaining surfaces
  set('chat.requestBackground',fg+'0a'); set('chat.requestBubbleBackground',fg+'0d'); set('chat.requestBubbleHoverBackground',fg+'14');
  set('chat.slashCommandBackground',accent+'26'); set('chat.slashCommandForeground agentSessionReadIndicator.foreground',accent);
  set('notebook.focusedCellBorder',accent+'99'); set('notebook.focusedEditorBorder',accent+'66'); set('notebook.selectedCellBackground',fg+'0a');
  set('welcomePage.tileHoverBackground',blend(raised,fg,.05)); set('welcomePage.progress.background',fg+'1a'); set('welcomePage.progress.foreground',accent);
  set('walkthrough.stepTitle.foreground',fg); set('ports.iconRunningProcessForeground',success); set('search.resultsInfoForeground',muted);
  set('extensionIcon.starForeground',warning); set('extensionIcon.verifiedForeground',accent); set('extensionIcon.preReleaseForeground extensionIcon.sponsorForeground',keyword);
  set('charts.foreground',fg); set('charts.lines',muted); set('charts.red',error); set('charts.blue',accent); set('charts.yellow',warning);
  set('charts.orange',number); set('charts.green',success); set('charts.purple',keyword);
  const {func,type:kind,tag,property,comment,operator,parameter,variable} = syntax;
  const symbols = {array:syntax.number,boolean:syntax.number,class:kind,color:fg,constant:syntax.number,constructor:func,enumerator:kind,enumeratorMember:syntax.number,event:warning,
    field:property,file:fg,folder:fg,function:func,interface:kind,key:property,keyword:syntax.keyword,method:func,module:syntax.keyword,namespace:kind,null:syntax.number,number:syntax.number,object:kind,
    operator:muted,package:syntax.keyword,property,reference:fg,snippet:muted,string:syntax.string,struct:kind,text:fg,typeParameter:kind,unit:syntax.number,variable};
  for (const [kind,color] of Object.entries(symbols)) colors['symbolIcon.'+kind+'Foreground'] = color;
  // Error Lens stays nearly invisible in every palette, like the managed settings.
  for (const [sev,color] of Object.entries({error,warning,info,hint:muted})) {
    for (const suffix of ['Background','BackgroundLight','MessageBackground','RangeBackground']) colors['errorLens.'+sev+suffix] = '#00000000';
    colors['errorLens.'+sev+'Foreground'] = color; colors['errorLens.'+sev+'ForegroundLight'] = color+'26';
  }
  const ansi = [surface,tag,syntax.string,kind,func,syntax.keyword,property,fg];
  ['Black','Red','Green','Yellow','Blue','Magenta','Cyan','White'].forEach((n,i) => { colors['terminal.ansi'+n]=ansi[i]; colors['terminal.ansiBright'+n]=blend(ansi[i],fg,.18); });
  for (const key of Object.keys(colors)) if (!known.has(key) && !key.startsWith('errorLens.')) delete colors[key];
  // Each scope the Visual Studio base theme colours gets a syntax role, so
  // none of the base theme's own syntax colours shows through.
  const {keyword:keywordInk,string:stringInk,number:numberInk} = syntax;
  const base = scope => /^comment/.test(scope) ? comment
    : /^(invalid|markup\.deleted)/.test(scope) ? error : /^markup\.changed/.test(scope) ? warning : /^markup\.inserted/.test(scope) ? stringInk
    : /^(markup\.(heading|bold)|header|strong|meta\.diff\.header|punctuation\.definition\.(list|quote))/.test(scope) ? func
    : /keyword\.operator\.(plus|minus)\.exponent|^keyword\.other\.unit|^constant|^support\.constant|enummember|string\.regexp|preprocessor\.numeric/.test(scope) ? numberInk
    : /^keyword\.operator\.(new|expression|cast|sizeof|alignof|typeid|alignas|instanceof|wordlike|noexcept|logical\.python)/.test(scope) ? keywordInk
    : /^(keyword\.operator|punctuation\.definition\.tag)/.test(scope) ? operator
    : /^(entity\.name\.(tag|selector))/.test(scope) ? tag
    : /^(keyword|storage|variable\.language|meta\.preprocessor$|punctuation\.(definition\.template-expression|section\.embedded))/.test(scope) ? keywordInk
    : /^(entity\.other\.attribute-name|source\.css(\.less)? entity|support\.type\.(vendored\.)?property-name)/.test(scope) ? property
    : /^(support\.function|entity\.name\.function)/.test(scope) ? func
    : /^(support\.(type|class)|entity\.name\.(type|class))/.test(scope) ? kind
    : /^(string|markup\.inline\.raw|meta\.preprocessor\.string)/.test(scope) ? stringInk : fg;
  // Later rules win ties, so the specific JSX, JSON and CSS rules come last.
  const rules = [
    ...registry.baseTokenScopes.map(scope => [[scope],base(scope)]),
    [['comment','punctuation.definition.comment'],comment],
    [['keyword','storage','storage.type','storage.modifier','keyword.control','variable.language'],keywordInk],
    [['keyword.operator','punctuation','meta.brace','punctuation.definition.tag'],operator],
    [['keyword.operator.new','keyword.operator.expression','keyword.operator.instanceof','keyword.operator.typeof'],keywordInk],
    [['string','string.quoted','string.template','markup.inline.raw','markup.quote','punctuation.definition.string'],stringInk],
    [['punctuation.definition.template-expression','punctuation.section.embedded'],keywordInk],
    [['constant.character.escape','string.regexp','constant.other.placeholder'],numberInk],
    [['constant.numeric','constant.language','constant.character','variable.other.enummember','support.constant'],numberInk],
    [['variable','variable.other','variable.other.constant','variable.other.readwrite'],variable],
    [['meta.object-literal.key','variable.other.property','variable.other.object.property','support.variable.property','meta.property-name'],property],
    [['variable.parameter','meta.parameter'],parameter],
    [['entity.name.function','support.function','entity.name.method'],func],
    [['entity.name.type','entity.name.class','entity.name.interface','entity.name.namespace','support.type','support.class','entity.other.inherited-class','support.variable'],kind],
    [['entity.name.tag','meta.tag.sgml','entity.name.tag.css'],tag],
    [['support.class.component','entity.name.tag.tsx support.class.component','entity.name.tag.jsx support.class.component'],kind],
    [['entity.other.attribute-name','support.type.property-name','support.type.property-name.css'],property],
    [['support.constant.property-value.css','constant.other.color'],numberInk],
    [['string.quoted.double.json'],stringInk],
    [['support.type.property-name.json'],property],
    [['meta.decorator','entity.name.function.decorator','punctuation.decorator'],numberInk],
    [['markup.heading','markup.bold','markup.underline.link'],func],
    [['invalid','invalid.illegal'],error],
  ];
  return { name,type,colors,tokenColors:rules.map(([scope,foreground])=>({scope,settings:{foreground}})),
    semanticTokenColors:{namespace:kind,type:kind,class:kind,interface:kind,enum:kind,typeParameter:kind,decorator:numberInk,function:func,method:func,
      variable,'variable.defaultLibrary':kind,parameter,property,enumMember:numberInk,'variable.readonly':variable,keyword:keywordInk,comment,string:stringInk,
      number:numberInk,regexp:numberInk,operator,newOperator:keywordInk,stringLiteral:stringInk,customLiteral:fg,numberLiteral:numberInk} };
}
function build() {
  const directory = path.join(root,'themes');
  fs.rmSync(directory,{recursive:true,force:true}); fs.mkdirSync(directory);
  for (const p of palettes) fs.writeFileSync(path.join(directory,slug(p[0])+'.json'),JSON.stringify(theme(p),null,1)+'\n');
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  delete manifest.contributes.themes;
  manifest.categories = ['Other'];
  manifest.description = `${palettes.length} considered editor palettes and ten bundled programming fonts. A focused appearance studio for Antigravity.`;
  manifest.contributes.configuration.properties['asterAppearance.theme'] = {type:'string',default:'',scope:'application',
    description:'Aster palette applied over the matching Visual Studio theme. Change it in Aster Atelier: Темы и шрифты.'};
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(manifest,null,2)+'\n');
}
if (require.main === module) build();
module.exports = {build,theme,blend,contrast,slug,syntaxColors};
