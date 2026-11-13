import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const build = require('../scripts/build-aster.cjs'), palettes = require('../extensions/aster-appearance/palettes.cjs');
const themes = require('../extensions/aster-appearance/themes.cjs'), { contrast, toOklch } = require('../extensions/aster-appearance/color.cjs');
const background = theme => theme.colors['editor.background'];
const hueGap = (a, b) => Math.abs(((toOklch(a)[2] - toOklch(b)[2] + 540) % 360) - 180);

test('every theme file is the generator output of its palette', () => {
  assert.equal(themes.THEMES.length, palettes.length);
  for (const palette of palettes) assert.deepEqual(themes.find(palette[0]), build.theme(palette), palette[0]);
});

test('every theme colours the same complete set of roles, TextMate scopes and semantic tokens', () => {
  const [first] = themes.THEMES, scopes = theme => JSON.stringify(theme.tokenColors.map(rule => rule.scope));
  for (const theme of themes.THEMES) {
    assert.deepEqual(Object.keys(theme.roles), build.ROLES, theme.name + ' roles');
    assert.equal(scopes(theme), scopes(first), theme.name + ' TextMate scopes');
    assert.deepEqual(Object.keys(theme.semanticTokenColors), Object.keys(build.SEMANTIC_ROLES), theme.name + ' semantic tokens');
    assert.equal(theme.semanticHighlighting, true, theme.name);
    for (const [role, list] of Object.entries(build.ROLE_SCOPES)) for (const scope of list)
      assert.ok(theme.tokenColors.some(rule => rule.scope.includes(scope) && rule.settings.foreground === theme.roles[role]), `${theme.name}: ${scope} is ${role}`);
    for (const [selector, role] of Object.entries(build.SEMANTIC_ROLES))
      assert.equal(theme.semanticTokenColors[selector], role === 'text' ? theme.colors['editor.foreground'] : theme.roles[role], `${theme.name}: ${selector}`);
  }
});

test('every code colour reads at 4.5:1 or more, comments at 5:1, and none is a dull grey', () => {
  for (const theme of themes.THEMES) {
    const bg = background(theme);
    for (const [role, color] of Object.entries(theme.roles)) {
      assert.match(color, /^#[0-9a-f]{6}$/, `${theme.name}: ${role} is opaque`);
      assert.ok(contrast(color, bg) >= 4.5, `${theme.name}: ${role} ${color} contrast ${contrast(color, bg).toFixed(2)}`);
      assert.ok(toOklch(color)[1] >= 0.035, `${theme.name}: ${role} ${color} carries colour`);
      if (theme.type === 'dark') assert.ok(toOklch(color)[1] <= 0.165, `${theme.name}: ${role} ${color} is not neon`);
    }
    for (const role of ['comment', 'docComment']) {
      assert.ok(contrast(theme.roles[role], bg) >= 5, `${theme.name}: ${role} is clearly readable`);
      assert.ok(toOklch(theme.roles[role])[1] >= 0.08, `${theme.name}: ${role} has visible colour`);
    }
    for (const color of [...theme.tokenColors.map(rule => rule.settings.foreground), ...Object.values(theme.semanticTokenColors)])
      assert.ok(contrast(color, bg) >= 4.5, `${theme.name}: ${color}`);
  }
});

test('function, variable, keyword, string, comment and type are visibly apart; names keep their own tone', () => {
  for (const theme of themes.THEMES) {
    const { roles } = theme;
    for (let i = 0; i < build.KEY_ROLES.length; i++) for (let j = 0; j < i; j++) {
      const a = build.KEY_ROLES[i], b = build.KEY_ROLES[j];
      assert.ok(build.distance(roles[a], roles[b]) >= build.MIN_DISTANCE, `${theme.name}: ${a} and ${b} look alike`);
    }
    for (const [a, b] of [['property', 'variable'], ['parameter', 'variable'], ['parameter', 'property'], ['functionCall', 'functionDeclaration'], ['variable', 'variableDeclaration']])
      assert.ok(build.distance(roles[a], roles[b]) >= build.NAME_DISTANCE - 0.005, `${theme.name}: ${a} and ${b}`);
    // A declaration and its later use share one hue.
    assert.ok(hueGap(roles.functionDeclaration, roles.functionCall) < 4, theme.name + ': function declaration and call');
    assert.ok(hueGap(roles.variableDeclaration, roles.variable) < 4, theme.name + ': variable declaration and use');
  }
});

test('brightness and contrast keep every retuned code colour readable', () => {
  for (const theme of themes.THEMES) for (const level of [{ brightness: -30, contrast: -20 }, { brightness: 30, contrast: 30 }, { brightness: 30, contrast: -20 }]) {
    const block = themes.blocks(theme, {}, level);
    for (const color of [...block.tokens.textMateRules.map(rule => rule.settings.foreground), ...Object.values(block.semantic.rules)])
      assert.ok(contrast(color, background(theme)) >= 4.5, `${theme.name} ${JSON.stringify(level)}: ${color}`);
    assert.equal(block.semantic.enabled, true);
  }
});

test('comments and doc comments retain visible colour and 5:1 contrast at the tuning extremes', () => {
  for (const theme of themes.THEMES) for (const brightness of [-30, 0, 30]) for (const contrastLevel of [-20, 0, 30]) {
    const block = themes.blocks(theme, {}, { brightness, contrast: contrastLevel });
    const comments = theme.tokenColors.map((rule, index) => ['comment', 'docComment'].some(role => rule.settings.foreground === theme.roles[role])
      ? block.tokens.textMateRules[index].settings.foreground : null).filter(Boolean);
    comments.push(block.semantic.rules.comment);
    for (const colour of comments) {
      assert.ok(contrast(colour, background(theme)) >= 5, `${theme.name}: tuned comment contrast`);
      assert.ok(toOklch(colour)[1] >= 0.08, `${theme.name}: tuned comment remains coloured`);
    }
  }
});

test('native theme comments and JSDoc are coloured in the editor and its card without tinting other code', t => {
  const swatches = require('../extensions/aster-appearance/swatches.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-comment-card-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const kind of ['dark', 'light']) {
    const bg = kind === 'dark' ? '#1e1e1e' : '#ffffff', grey = kind === 'dark' ? '#999999' : '#555555';
    const theme = { colors: { 'editor.background': bg }, tokenColors: [
      { scope: 'comment', settings: { foreground: grey, fontStyle: 'italic' } },
      { scope: ['comment.block.documentation', 'string'], settings: { foreground: grey } },
      { scope: 'entity.name.function', settings: { foreground: kind === 'dark' ? '#dcdcaa' : '#795e26' } },
    ] };
    const rules = swatches.readableRules(theme, kind);
    const comments = rules.filter(rule => [].concat(rule.scope).some(scope => /comment|jsdoc/.test(scope)));
    assert.ok(comments.some(rule => [].concat(rule.scope).includes('variable.other.jsdoc')), 'JSDoc names get the comment colour');
    for (const rule of comments) {
      assert.equal(rule.name, swatches.READABLE_RULE);
      assert.ok(contrast(rule.settings.foreground, bg) >= 5);
      assert.ok(toOklch(rule.settings.foreground)[1] >= 0.08);
      assert.deepEqual(Object.keys(rule.settings), ['foreground'], 'font styling is not changed');
    }
    assert.ok(!rules.some(rule => [].concat(rule.scope).includes('string')), 'readable strings keep their original colour, even in mixed scopes');
    assert.ok(!rules.some(rule => [].concat(rule.scope).includes('entity.name.function')), 'readable functions keep their original colour');
    fs.writeFileSync(path.join(directory, kind + '.json'), JSON.stringify(theme));
    const option = { value: kind, kind }, extensions = [{ extensionPath: directory,
      packageJSON: { contributes: { themes: [{ id: kind, path: kind + '.json' }] } } }];
    const card = swatches.builtinSwatch(option, extensions);
    assert.equal(card.comment, comments.at(-1).settings.foreground, 'studio and editor show the same comment colour');
  }
  assert.deepEqual(swatches.readableRules(null, 'dark'), []);
});

test('workbench, terminal, selection, find, bracket and Git colours are defined in every theme', () => {
  const keys = ['editor.selectionBackground', 'editor.findMatchBackground', 'editor.findMatchHighlightBackground', 'editorError.foreground', 'editorWarning.foreground',
    'gitDecoration.addedResourceForeground', 'gitDecoration.modifiedResourceForeground', 'gitDecoration.deletedResourceForeground', 'sideBar.background', 'tab.activeBackground',
    ...[1, 2, 3, 4, 5, 6].map(index => 'editorBracketHighlight.foreground' + index)];
  const ansi = ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'];
  for (const theme of themes.THEMES) {
    for (const key of [...keys, ...ansi.flatMap(name => ['terminal.ansi' + name, 'terminal.ansiBright' + name])]) assert.ok(theme.colors[key], `${theme.name}: ${key}`);
    for (const name of ansi.slice(1, 7)) for (const key of ['terminal.ansi' + name, 'terminal.ansiBright' + name])
      assert.ok(contrast(theme.colors[key], theme.colors['terminal.background']) >= 4.5, `${theme.name}: ${key} is readable in the terminal`);
    // Selection is a translucent tint, so the text under it stays visible.
    assert.match(theme.colors['editor.selectionBackground'], /^#[0-9a-f]{6}(?:[0-3][0-9a-f]|40)$/, theme.name + ': selection keeps text visible');
    assert.ok(hueGap(theme.colors['terminal.ansiRed'], '#d03030') < 40 && hueGap(theme.colors['terminal.ansiGreen'], '#30a040') < 40, theme.name + ': ANSI red and green');
  }
});
