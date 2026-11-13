'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../extensions/aster-appearance');
const palettes = require('../extensions/aster-appearance/palettes.cjs');
const registry = require('./aster-color-registry.json');
const {blend,contrast,readable,commentColor,toOklch,fromOklch,luminance} = require('../extensions/aster-appearance/color.cjs');
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
const known = new Set(registry.registry);

// Every palette colours the same code roles. A theme file is generated from its
// role colours through the one scope map below, so all themes cover exactly the
// same TextMate scopes and semantic tokens and none falls back to the base theme.
const ROLES = ['keyword','storage','functionDeclaration','functionCall','method','variableDeclaration','variable','parameter',
  'property','type','component','attribute','library','string','template','constant','regex','operator','punctuation',
  'comment','docComment','invalid'];
// Roles a reader tells apart at a glance; the generator keeps them visibly apart.
const KEY_ROLES = ['keyword','string','functionCall','type','comment','variable'];
const MIN_DISTANCE = 0.07;
const NAME_DISTANCE = 0.04;

// Scopes checked against the TypeScript/TSX grammar of VS Code 1.107. More
// specific selectors win over shorter ones, and later groups win ties.
const ROLE_SCOPES = {
  comment: ['comment','punctuation.definition.comment'],
  keyword: ['keyword','keyword.control','keyword.other','variable.language','meta.preprocessor',
    'keyword.operator.new','keyword.operator.expression','keyword.operator.instanceof','keyword.operator.typeof','keyword.operator.wordlike'],
  storage: ['storage','storage.type','storage.modifier'],
  operator: ['keyword.operator','keyword.operator.assignment','keyword.operator.comparison','keyword.operator.relational',
    'keyword.operator.arithmetic','keyword.operator.logical','keyword.operator.ternary','keyword.operator.spread','storage.type.function.arrow'],
  punctuation: ['punctuation','meta.brace','punctuation.separator','punctuation.terminator','punctuation.accessor',
    'punctuation.definition.block','punctuation.definition.parameters','punctuation.definition.tag','punctuation.section.embedded'],
  string: ['string','string.quoted','punctuation.definition.string','markup.inline.raw','string.quoted.double.json'],
  template: ['string.template','punctuation.definition.string.template','punctuation.definition.template-expression'],
  regex: ['string.regexp','string.regexp keyword.other','keyword.operator.quantifier.regexp','constant.other.character-class.regexp',
    'constant.character.escape','constant.other.placeholder'],
  constant: ['constant','constant.numeric','constant.language','constant.language.boolean','constant.language.null',
    'constant.language.undefined','constant.character','support.constant','variable.other.enummember','keyword.other.unit','constant.other.color'],
  variable: ['variable','variable.other','variable.other.readwrite','variable.other.constant','variable.other.object'],
  variableDeclaration: ['meta.definition.variable variable.other.constant','meta.definition.variable variable.other.readwrite'],
  parameter: ['variable.parameter','meta.parameter variable'],
  property: ['variable.other.property','variable.other.object.property','variable.object.property','meta.object-literal.key',
    'support.variable.property','meta.property-name','support.type.property-name','support.type.property-name.json',
    'support.type.property-name.css','meta.structure.dictionary.key.python'],
  functionCall: ['entity.name.function','support.function','variable.function','meta.function-call entity.name.function','meta.function-call.generic'],
  method: ['entity.name.method','entity.name.function.member','meta.method-call entity.name.function',
    'meta.definition.method entity.name.function','meta.method.declaration entity.name.function'],
  functionDeclaration: ['meta.definition.function entity.name.function','meta.definition.variable entity.name.function',
    'meta.function.python entity.name.function'],
  type: ['entity.name.type','entity.name.class','entity.name.interface','entity.name.namespace','entity.name.type.alias',
    'entity.name.type.class','entity.other.inherited-class','support.type','support.type.primitive','support.class'],
  library: ['variable.other.readwrite.alias','support.variable','support.class.builtin','entity.name.type.module'],
  component: ['entity.name.tag','meta.tag.sgml','entity.name.tag.css','support.class.component','entity.name.tag support.class.component'],
  attribute: ['entity.other.attribute-name','entity.other.attribute-name.jsx','entity.other.attribute-name.tsx',
    'entity.other.attribute-name.html','meta.decorator','entity.name.function.decorator','punctuation.decorator'],
  docComment: ['comment.block.documentation','comment.block.documentation punctuation.definition.comment',
    'storage.type.class.jsdoc','punctuation.definition.block.tag.jsdoc','variable.other.jsdoc','entity.name.type.instance.jsdoc'],
  invalid: ['invalid','invalid.illegal','invalid.deprecated','markup.deleted'],
};
// Markup, diff and embedded-code scopes the Visual Studio base themes colour.
const MARKUP_SCOPES = [
  [['markup.heading','markup.bold','header','strong','meta.diff.header'],'functionDeclaration'],
  [['markup.inserted'],'string'], [['markup.changed'],'constant'],
  [['markup.underline.link','markup.quote','punctuation.definition.list','punctuation.definition.quote'],'keyword'],
  [['meta.template.expression','meta.embedded','meta.jsx.children'],'text'],
];

// Semantic token selectors, checked against the tokens the TypeScript server
// emits: hooks and functions are `function`, `.map` is `method.defaultLibrary`,
// `console` is `variable.defaultLibrary`, a new name carries `declaration`.
const SEMANTIC_ROLES = {
  namespace:'type', type:'type', class:'type', interface:'type', enum:'type', struct:'type', typeParameter:'type',
  'class.defaultLibrary':'library', 'variable.defaultLibrary':'library', 'function.defaultLibrary':'library',
  function:'functionCall', 'function.declaration':'functionDeclaration',
  method:'method', 'method.declaration':'method', 'method.defaultLibrary':'method',
  variable:'variable', 'variable.readonly':'variable', 'variable.declaration':'variableDeclaration', 'variable.declaration.readonly':'variableDeclaration',
  parameter:'parameter', property:'property', enumMember:'constant', decorator:'attribute', keyword:'keyword', comment:'comment',
  string:'string', number:'constant', regexp:'regex', operator:'operator',
  newOperator:'keyword', stringLiteral:'string', numberLiteral:'constant', customLiteral:'text',
};

// Dark palettes keep their hues but lose the neon edge; light ones may be deeper.
const MAX_CHROMA = { dark: 0.16, light: 0.19 };
const lab = color => { const [L, C, H] = toOklch(color); return [L, C * Math.cos(H * Math.PI / 180), C * Math.sin(H * Math.PI / 180)]; };
const distance = (a, b) => Math.hypot(...lab(a).map((value, index) => value - lab(b)[index]));
const towardText = bg => luminance(bg) < 0.18 ? 1 : -1;

// The same hue, moved in lightness (towards the text side), colourfulness and
// hue, then kept readable on the background.
function shade(color, bg, { lightness = 0, chroma = 1, hue = 0, min = 4.6, cap = 1 } = {}) {
  const [L, C, H] = toOklch(color);
  return readable(fromOklch(L + lightness * towardText(bg), Math.min(cap, C * chroma), H + hue), bg, min);
}

// No name stays in the plain text colour. Where the theme a palette follows
// leaves variables, properties or parameters plain or nearly grey, they take
// the colour VS Code recommends for names: light blue on a dark background
// (Dark+ #9cdcfe) and dark blue on a light one (Light+ #001080), moved just far
// enough in hue to stay apart from the palette's own colours.
function nameColors(syntax, fg, bg, text) {
  const plain = color => [fg, text].some(value => color.toLowerCase() === value.toLowerCase()) || toOklch(color)[1] < 0.035;
  const dark = luminance(bg) < 0.18;
  const shown = ['keyword','func','type','string','number'].map(role => syntax[role]).concat(fg);
  const apart = color => Math.min(...shown.map(other => distance(color, other)));
  const recommended = () => {
    const options = (dark ? [230, 205, 255, 185, 280] : [258, 235, 280, 210, 300]).map(hue => readable(fromOklch(dark ? 0.86 : 0.42, dark ? 0.085 : 0.12, hue), bg));
    return options.find(color => apart(color) >= 0.06) || options.sort((a, b) => apart(b) - apart(a))[0];
  };
  const result = { ...syntax };
  if (plain(result.variable)) result.variable = recommended();
  if (plain(result.property)) result.property = shade(result.variable, bg, { hue: -35 });
  if (plain(result.parameter)) result.parameter = shade(result.variable, bg, { lightness: 0.07, chroma: 0.85 });
  if (plain(result.operator)) result.operator = readable(blend(fg, result.keyword, 0.5), bg);
  return result;
}

// Punctuation stays close to the text colour but is never a dull grey.
function tinted(color, bg) {
  const [, C] = toOklch(color);
  return shade(color, bg, { chroma: Math.max(1, 0.04 / Math.max(C, 0.001)) });
}

// A role that would read like one of `others` is moved apart: first in
// lightness, then in hue, keeping its contrast.
function moveApart(roles, bg, role, others, min) {
  const clear = color => others.every(other => distance(color, roles[other]) >= min);
  if (clear(roles[role])) return;
  const tries = [];
  for (let step = 1; step <= 12; step++) tries.push({ lightness: step * 0.01 }, { lightness: -step * 0.01 });
  for (let step = 1; step <= 10; step++) tries.push({ hue: step * 5 }, { hue: -step * 5 });
  const contrastFloor = role === 'comment' ? 5 : 4.6;
  roles[role] = tries.map(change => shade(roles[role], bg, { ...change, min: contrastFloor })).find(clear) || roles[role];
}

// Key roles keep a visible distance; earlier roles keep their colour.
function separate(roles, bg) {
  KEY_ROLES.slice(1).forEach((role, index) => moveApart(roles, bg, role, KEY_ROLES.slice(0, index + 1), MIN_DISTANCE));
  return roles;
}

// Source colours of the theme a palette follows, calmed and made readable.
// Comments keep their hue but carry real colour and at least 5:1 contrast.
function roleColors(p) {
  const [, type, bg, surface, text, , , source] = p;
  const missing = ['keyword','func','type','variable','property','string','number','tag','attribute','parameter','comment','operator','regex']
    .filter(role => !/^#[0-9a-f]{6}$/i.test(source?.[role] || ''));
  if (missing.length) throw new Error('Palette is missing code colours: ' + missing.join(', '));
  const fg = readable(text, [bg, surface], 7), cap = MAX_CHROMA[type];
  const ink = (color, options = {}) => shade(color.toLowerCase(), bg, { cap, ...options });
  const base = nameColors(Object.fromEntries(Object.entries(source).map(([role, color]) => [role, ink(color)])), fg, bg, text);
  const [, commentChroma] = toOklch(source.comment);
  const key = separate({ keyword: base.keyword, string: base.string, functionCall: base.func, type: base.type,
    comment: ink(source.comment, { chroma: Math.max(1, 0.05 / Math.max(commentChroma, 0.001)), min: 5 }), variable: base.variable }, bg);
  const roles = {
    ...key,
    storage: shade(key.keyword, bg, { lightness: -0.04, chroma: 0.8 }),
    functionDeclaration: shade(key.functionCall, bg, { lightness: 0.05, cap }),
    method: shade(key.functionCall, bg, { hue: 22, cap }),
    variableDeclaration: shade(key.variable, bg, { lightness: 0.05, cap }),
    parameter: base.parameter, property: base.property, component: base.tag, attribute: base.attribute,
    library: shade(key.type, bg, { hue: -25, cap }),
    template: shade(key.string, bg, { hue: -18, cap }),
    constant: base.number, regex: base.regex, operator: base.operator,
    punctuation: tinted(blend(fg, base.operator, 0.35), bg),
    docComment: shade(key.comment, bg, { lightness: 0.05, chroma: 1.5, cap, min: 5 }),
    invalid: type === 'dark' ? '#f19b9b' : '#a32538',
  };
  // Names a theme draws alike (One Dark's red variables, properties and parameters) get their own tone.
  moveApart(roles, bg, 'property', ['variable'], NAME_DISTANCE);
  moveApart(roles, bg, 'parameter', ['variable', 'property', 'constant'], NAME_DISTANCE);
  return { fg, roles };
}

// Each base-theme scope gets the role whose meaning it carries.
function baseRole(scope) {
  if (/^comment/.test(scope)) return 'comment';
  if (/^(invalid|markup\.deleted)/.test(scope)) return 'invalid';
  if (/^markup\.changed/.test(scope)) return 'constant';
  if (/^markup\.inserted/.test(scope)) return 'string';
  if (/^(markup\.(heading|bold)|header|strong|meta\.diff\.header|punctuation\.definition\.(list|quote))/.test(scope)) return 'functionDeclaration';
  if (/string\.regexp|constant\.character\.escape|constant\.regexp/.test(scope)) return 'regex';
  if (/keyword\.operator\.(plus|minus)\.exponent|^keyword\.other\.unit|^constant|^support\.constant|enummember|preprocessor\.numeric/.test(scope)) return 'constant';
  if (/^keyword\.operator\.(new|expression|cast|sizeof|alignof|typeid|alignas|instanceof|wordlike|noexcept|logical\.python)/.test(scope)) return 'keyword';
  if (/^keyword\.operator/.test(scope)) return 'operator';
  if (/^punctuation\.definition\.template-expression/.test(scope)) return 'template';
  if (/^punctuation/.test(scope)) return 'punctuation';
  if (/^(entity\.name\.(tag|selector))/.test(scope)) return 'component';
  if (/^(storage\.modifier|storage\.type|storage)$|^storage\.modifier\./.test(scope)) return 'storage';
  if (/^(keyword|variable\.language|meta\.preprocessor$)/.test(scope)) return 'keyword';
  if (/^entity\.other\.attribute-name/.test(scope)) return 'attribute';
  if (/^(source\.css(\.less)? entity|support\.type\.(vendored\.)?property-name|meta\.structure\.dictionary\.key)/.test(scope)) return 'property';
  if (/^(support\.function|entity\.name\.function)/.test(scope)) return 'functionCall';
  if (/^(support\.(type|class)|entity\.name\.(type|class))/.test(scope)) return 'type';
  if (/^variable/.test(scope) || /^source\.css variable/.test(scope)) return 'variable';
  if (/^(string|markup\.inline\.raw|meta\.preprocessor\.string)/.test(scope)) return 'string';
  return 'text';
}

// Later rules win ties, so the shared role map follows the base-theme scopes.
function tokenRules(roles, fg) {
  const color = role => role === 'text' ? fg : roles[role];
  const rules = [
    ...registry.baseTokenScopes.map(scope => [[scope], baseRole(scope)]),
    ...MARKUP_SCOPES,
    ...Object.entries(ROLE_SCOPES).map(([role, scopes]) => [scopes, role]),
  ];
  return rules.map(([scope, role]) => ({ scope, settings: { foreground: color(role) } }));
}
const semanticRules = (roles, fg) => Object.fromEntries(Object.entries(SEMANTIC_ROLES).map(([selector, role]) => [selector, role === 'text' ? fg : roles[role]]));

// Terminal colours follow the palette: each ANSI colour takes the role colour
// nearest its hue, or a readable tone of that hue when the palette has none.
const ANSI_HUES = { Red: 25, Green: 145, Yellow: 95, Blue: 255, Magenta: 330, Cyan: 200 };
function ansiColors(roles, fg, surface, dark) {
  const candidates = Object.values(roles).filter(color => toOklch(color)[1] >= 0.06);
  const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const pick = hue => {
    const best = candidates.map(color => [color, hueGap(toOklch(color)[2], hue)]).sort((a, b) => a[1] - b[1])[0];
    return readable(best && best[1] <= 35 ? best[0] : fromOklch(dark ? 0.78 : 0.5, 0.12, hue), surface, 4.5);
  };
  const colors = { Black: dark ? blend(surface, fg, 0.3) : fg, White: dark ? fg : blend(surface, fg, 0.3) };
  for (const [name, hue] of Object.entries(ANSI_HUES)) colors[name] = pick(hue);
  const result = {};
  for (const [name, color] of Object.entries(colors)) {
    result['terminal.ansi' + name] = color;
    result['terminal.ansiBright' + name] = ['Black', 'White'].includes(name) ? blend(color, fg, 0.18) : readable(blend(color, fg, 0.18), surface, 4.5);
  }
  return result;
}

// Every surface the IDE draws is assigned from the palette, so no panel,
// widget or corner keeps the base theme's grey. Keys are checked against the
// IDE colour registry, and every key the built-in Default themes set is replaced.
function workbenchColors(p, fg, roles) {
  const [,type,bg,surface,,accent,mutedSource] = p;
  const dark = type === 'dark';
  const muted = readable(mutedSource,[bg,surface]), link = readable(accent,[bg,surface]);
  const {keyword,string,constant:number} = roles;
  const on = color => [bg,surface,fg,'#ffffff','#000000'].sort((a,b)=>contrast(color,b)-contrast(color,a))[0];
  const border = blend(surface,fg,dark?.13:.15), strong = blend(bg,fg,dark?.3:.34);
  const raised = dark ? blend(bg,fg,.05) : blend(bg,'#ffffff',.6), input = dark ? blend(bg,fg,.075) : blend(bg,'#ffffff',.8);
  const hover = fg+(dark?'14':'10'), selection = accent+(dark?'38':'2b'), quiet = accent+(dark?'20':'18');
  const error = roles.invalid, warning = dark?'#e6ca82':'#795811', success = string, info = accent;
  const shadow = dark?'#00000066':'#00000024';
  const colors = {};
  const set = (keys,value) => keys.trim().split(/\s+/).forEach(k => colors[k] = value);
  set('foreground icon.foreground editor.foreground editorWidget.foreground',fg);
  set('descriptionForeground',muted); set('disabledForeground',muted+'aa'); set('errorForeground',error);
  set('focusBorder',accent+'aa'); set('selection.background',accent+'55'); set('widget.border',border+'cc'); set('widget.shadow scrollbar.shadow',shadow);
  set('sash.hoverBorder',accent);
  set('textLink.foreground textLink.activeForeground editorLink.activeForeground notificationLink.foreground',link);
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
  // Three calm bracket colours in turn instead of a rainbow.
  [roles.type,roles.keyword,roles.functionCall].forEach((c,i)=>{colors['editorBracketHighlight.foreground'+(i+1)]=c;colors['editorBracketHighlight.foreground'+(i+4)]=c;});
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
    list.highlightForeground list.focusHighlightForeground pickerGroup.foreground`,link);
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
  set('debugTokenExpression.name',roles.property); set('debugTokenExpression.string',string); set('debugTokenExpression.boolean debugTokenExpression.number',number);
  set('debugExceptionWidget.border',error);
  set('testing.iconFailed testing.iconErrored testing.peekBorder',error); set('testing.iconPassed testing.runAction',success); set('testing.iconQueued',warning);
  set('testing.iconUnset testing.iconSkipped',muted); set('testing.peekHeaderBackground',error+'1a');
  set('gitDecoration.addedResourceForeground gitDecoration.untrackedResourceForeground',success); set('gitDecoration.modifiedResourceForeground gitDecoration.stageModifiedResourceForeground',warning);
  set('gitDecoration.deletedResourceForeground gitDecoration.stageDeletedResourceForeground',error); set('gitDecoration.renamedResourceForeground',info);
  set('gitDecoration.ignoredResourceForeground',muted); set('gitDecoration.conflictingResourceForeground',keyword); set('gitDecoration.submoduleResourceForeground',number);
  set('terminalCommandDecoration.defaultBackground',muted); set('terminalCommandDecoration.successBackground',success); set('terminalCommandDecoration.errorBackground',error);
  // Antigravity chat, notebooks, welcome and the remaining surfaces
  set('chat.requestBackground',fg+'0a'); set('chat.requestBubbleBackground',fg+'0d'); set('chat.requestBubbleHoverBackground',fg+'14');
  set('chat.slashCommandBackground',accent+'26'); set('chat.slashCommandForeground agentSessionReadIndicator.foreground',link);
  set('notebook.focusedCellBorder',accent+'99'); set('notebook.focusedEditorBorder',accent+'66'); set('notebook.selectedCellBackground',fg+'0a');
  set('welcomePage.tileHoverBackground',blend(raised,fg,.05)); set('welcomePage.progress.background',fg+'1a'); set('welcomePage.progress.foreground',accent);
  set('walkthrough.stepTitle.foreground',fg); set('ports.iconRunningProcessForeground',success); set('search.resultsInfoForeground',muted);
  set('extensionIcon.starForeground',warning); set('extensionIcon.verifiedForeground',accent); set('extensionIcon.preReleaseForeground extensionIcon.sponsorForeground',keyword);
  set('charts.foreground',fg); set('charts.lines',muted); set('charts.red',error); set('charts.blue',accent); set('charts.yellow',warning);
  set('charts.orange',number); set('charts.green',success); set('charts.purple',keyword);
  const {type:kind,functionCall:func,property,variable} = roles;
  const symbols = {array:number,boolean:number,class:kind,color:fg,constant:number,constructor:func,enumerator:kind,enumeratorMember:number,event:warning,
    field:property,file:fg,folder:fg,function:func,interface:kind,key:property,keyword,method:roles.method,module:keyword,namespace:kind,null:number,number,object:kind,
    operator:muted,package:keyword,property,reference:fg,snippet:muted,string,struct:kind,text:fg,typeParameter:kind,unit:number,variable};
  for (const [name,color] of Object.entries(symbols)) colors['symbolIcon.'+name+'Foreground'] = color;
  // Error Lens stays nearly invisible in every palette, like the managed settings.
  for (const [sev,color] of Object.entries({error,warning,info,hint:muted})) {
    for (const suffix of ['Background','BackgroundLight','MessageBackground','RangeBackground']) colors['errorLens.'+sev+suffix] = '#00000000';
    colors['errorLens.'+sev+'Foreground'] = color; colors['errorLens.'+sev+'ForegroundLight'] = color+'26';
  }
  Object.assign(colors, ansiColors(roles, fg, surface, dark));
  for (const key of Object.keys(colors)) if (!known.has(key) && !key.startsWith('errorLens.')) delete colors[key];
  return colors;
}

// The studio groups dark themes by the character of the theme they follow:
// the three most colourful code roles of the original average above this
// OKLCH chroma. Calm originals reach 0.155 at most, vivid ones start at 0.177.
const VIVID_CHROMA = 0.166;
function vivid(p) {
  const [, type, bg, , , , , source] = p;
  const chroma = ['keyword','func','type','string','variable','number','comment','operator']
    .map(role => toOklch(readable(source[role], bg))[1]).sort((a, b) => b - a).slice(0, 3);
  return type === 'dark' && chroma.reduce((sum, value) => sum + value, 0) / 3 > VIVID_CHROMA;
}

function theme(p) {
  const [name,type] = p;
  const {fg,roles:colors} = roleColors(p);
  // Comment changes do not recolour the workbench or the terminal ANSI palette.
  const workbench = workbenchColors(p, fg, colors);
  colors.comment = commentColor(colors.comment, p[2], candidate => KEY_ROLES.filter(role => role !== 'comment')
    .every(role => distance(candidate, colors[role]) >= MIN_DISTANCE));
  colors.docComment = commentColor(colors.docComment, p[2]);
  const roles = Object.fromEntries(ROLES.map(role => [role, colors[role]]));
  return { name, type, vivid: vivid(p), roles, colors: workbench, tokenColors: tokenRules(roles, fg),
    semanticHighlighting: true, semanticTokenColors: semanticRules(roles, fg) };
}

function build() {
  const directory = path.join(root,'themes');
  fs.rmSync(directory,{recursive:true,force:true}); fs.mkdirSync(directory);
  for (const p of palettes) fs.writeFileSync(path.join(directory,slug(p[0])+'.json'),JSON.stringify(theme(p),null,1)+'\n');
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  delete manifest.contributes.themes;
  manifest.categories = ['Other'];
  manifest.description = `${palettes.length} editor palettes after the most used themes and ${require(path.join(root,'fonts.json')).length} bundled programming fonts with coding ligatures. A focused appearance studio for Antigravity.`;
  manifest.contributes.configuration.properties['asterAppearance.theme'] = {type:'string',default:'',scope:'application',
    description:'Aster palette applied over the matching Visual Studio theme. Change it in Aster Atelier: Темы и шрифты.'};
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(manifest,null,2)+'\n');
}
if (require.main === module) build();
module.exports = {build,theme,slug,roleColors,distance,vivid,VIVID_CHROMA,ROLES,KEY_ROLES,MIN_DISTANCE,NAME_DISTANCE,ROLE_SCOPES,SEMANTIC_ROLES};
