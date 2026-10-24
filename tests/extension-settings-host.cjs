'use strict';

// Executes real providers/commands in an isolated editor; no account or SQL connection is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function writeFixture(workspace) {
  const files = {
    'path-module.ts': 'export const auditValue = 42\n',
    'module-import.ts': 'import React from ""\n',
    'path-import.ts': 'import { auditValue } from "./path-m"\n',
    'path-import.tsx': 'import { auditValue } from "./path-m"\n',
    'rename.html': '<div class="card">\n   hello\n</div>\n',
    'rename.tsx': 'export const card = <div>hello</div>\n',
    'wrap.html': 'Hello',
    'console-audit.ts': 'export const auditValue = 42\n',
    'comments-audit.ts': '// TODO: Verify the workstation.\nexport const value = 1\n',
    'lint-audit.ts': 'debugger;\nexport const value = 1\n',
    'css-audit.css': '.broken { color: ; }\n',
    'tailwind.config.js': 'module.exports = { content: { relative: true, files: ["./*.tsx", "./*.jsx"] }, theme: {}, plugins: [] }\n',
    'tailwind.css': '@config "./tailwind.config.js";\n@tailwind utilities;\n',
    'tailwind-completion.tsx': 'export const card = <div className="fl" />\n',
    'image-audit.ts': 'export const image = "./audit-image.png"\n',
    'cost-audit.tsx': 'import React from "react"\nexport const card = React.createElement("div")\n',
    '.env.audit': 'AUDIT_NAME=workstation\n',
    '.oxlintrc.json': JSON.stringify({ rules: { 'no-debugger': 'error' } }),
  };
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(workspace, name), text);
  fs.copyFileSync(path.resolve(__dirname, '../extensions/calm-typescript/icon.png'), path.join(workspace, 'audit-image.png'));
}

async function verifyExtensionSettings(vscode, folder, until, renderer, importCostLogs = []) {
  const settings = require('../config/settings.json');
  const required = require('../config/extensions.json').filter(item => !item.optional);
  const unavailable = new Set(['ms-mssql.mssql', 'workstation.stability-helper']);
  const checks = [], extensions = {}, schemas = {};
  let importCostResult;
  const record = message => { checks.push(message); console.log('[extension-settings] ' + message); };
  for (const item of required) {
    if (unavailable.has(item.id)) continue;
    const extension = vscode.extensions.getExtension(item.id);
    assert.ok(extension, item.id + ' is installed');
    extensions[item.id] = extension.packageJSON.version;
    for (const section of [extension.packageJSON.contributes?.configuration].flat().filter(Boolean)) {
      Object.assign(schemas, section.properties);
    }
    if (extension.packageJSON.main || extension.packageJSON.browser) {
      const api = await extension.activate();
      if (item.id === 'wix.vscode-import-cost' && !renderer) api.logger.onLog(message => {
        importCostLogs.push(message); if (importCostLogs.length > 500) importCostLogs.shift();
      });
    }
  }
  function valid(value, schema, key) {
    if (!schema) return;
    const types = [schema.type].flat().filter(Boolean);
    if (types.length) assert.ok(types.some(type => type === 'null' ? value === null
      : type === 'array' ? Array.isArray(value) : type === 'integer' ? Number.isInteger(value)
      : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
      : typeof value === type), key + ' has a supported type');
    if (schema.enum && value !== null) assert.ok(schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value)), key + ' has a supported enum value');
    if (Array.isArray(value) && schema.items) value.forEach(item => valid(item, schema.items, key + '[]'));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [name, item] of Object.entries(value)) valid(item, schema.properties?.[name], key + '.' + name);
    }
  }
  const validated = Object.keys(settings).filter(key => schemas[key]);
  for (const key of validated) valid(settings[key], schemas[key], key);
  record('managed extension settings match the installed versions and schemas');
  async function editFile(name, original) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, name));
    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('hideSuggestWidget');
    if (original !== undefined) await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), original));
    return { document, editor };
  }
  const label = item => typeof item.label === 'string' ? item.label : item.label.label;
  const module = await editFile('module-import.ts', 'import React from ""\n');
  module.editor.selection = new vscode.Selection(0, 19, 0, 19);
  await vscode.commands.executeCommand('default:type', { text: 'rea' });
  await until(async () => {
    const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', module.document.uri, module.editor.selection.active);
    return list?.items.some(item => label(item) === 'react');
  }, 'npm Intellisense suggests the installed React dependency inside import');
  if (renderer) {
    await until(async () => await renderer.evaluate(`Array.from(document.querySelectorAll('.suggest-widget.visible .label-name')).some(node => node.textContent === 'react')`),
      'import string suggestions open automatically without Ctrl+Space');
    record('automatic import-string suggestion widget opens without Ctrl+Space');
  }
  await vscode.commands.executeCommand('hideSuggestWidget');
  record('npm Intellisense suggests installed packages inside import strings');

  for (const pathFile of ['path-import.ts', 'path-import.tsx']) {
    const relative = await editFile(pathFile, 'import { auditValue } from "./path-m"\n');
    const position = relative.document.positionAt(relative.document.getText().lastIndexOf('"'));
    relative.editor.selection = new vscode.Selection(position, position);
    let pathItems;
    let pathLabels;
    await until(async () => {
      const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', relative.document.uri, position);
      pathLabels = list?.items.map(item => ({ label: label(item), insert: item.insertText?.value || item.insertText }));
      pathItems = list?.items.filter(item => label(item).startsWith('path-module'));
      return pathItems?.length > 0;
    }, 'Path Intellisense suggests the relative TypeScript module').catch(error => { throw new Error(error.message + ': ' + JSON.stringify({ text: relative.document.getText(), position, pathLabels })); });
    assert.equal(pathItems.length, 1, 'Only one relative path provider owns this completion');
    assert.doesNotMatch(String(pathItems[0].insertText?.value || pathItems[0].insertText || label(pathItems[0])), /\.tsx?$/,
      'Path completion must not introduce TS5097 with a .ts import');
  }
  record('relative TS and TSX path completion is unique and omits the source extension');

  for (const [name, original] of [['rename.html', '<div class="card">\n   hello\n</div>\n'],
    ['rename.tsx', 'export const card = <div>hello</div>\n']]) {
    const { document, editor } = await editFile(name, original);
    await new Promise(resolve => setTimeout(resolve, 500));
    const start = original.indexOf('<div') + 1;
    editor.selection = new vscode.Selection(document.positionAt(start), document.positionAt(start + 3));
    await new Promise(resolve => setTimeout(resolve, 300));
    await vscode.commands.executeCommand('type', { text: 'section' });
    await until(() => /<section\b/.test(document.getText()) && /<\/section>/.test(document.getText()), 'paired tag rename in ' + name).catch(error => { throw new Error(error.message + ': ' + document.getText()); });
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal((document.getText().match(/<section\b/g) || []).length, 1);
    assert.equal((document.getText().match(/<\/section>/g) || []).length, 1);
    assert.doesNotMatch(document.getText(), /<\/?(?:div|section[a-z]+)\b/, 'No duplicate rename or damaged closing tag');
  }
  record('HTML and TSX paired tags rename once without competing edits');

  const wrap = await editFile('wrap.html', 'Hello');
  wrap.editor.selection = new vscode.Selection(0, 0, 0, 5);
  // The vendor command waits for a selection event after producing the edit;
  // observe the completed edit just as a user does, without blocking on that event.
  let wrappingError;
  void vscode.commands.executeCommand('extension.htmlTagWrap').catch(error => { wrappingError = error; });
  await until(() => {
    if (wrappingError) throw wrappingError;
    return /<p>\s*Hello\s*<\/p>/.test(wrap.document.getText());
  }, 'htmltagwrap wraps the actual selection');
  await vscode.commands.executeCommand('leaveSnippet');
  record('htmltagwrap wraps the actual selection with matching tags');

  const logging = await editFile('console-audit.ts', 'export const auditValue = 42\n');
  logging.editor.selection = new vscode.Selection(0, 13, 0, 23);
  await vscode.commands.executeCommand('turboConsoleLog.insertConsoleLog');
  await until(() => /console\.log\(/.test(logging.document.getText()), 'Turbo Console Log inserts the selected variable');
  assert.match(logging.document.getText(), /auditValue/);
  record('Turbo Console Log inserts a real log for the selected variable');

  const lint = await editFile('lint-audit.ts');
  await until(() => vscode.languages.getDiagnostics(lint.document.uri).some(item => /oxc|oxlint/i.test(item.source || '') && /debugger/i.test(item.message)),
    'Oxc reports the actual project no-debugger rule');
  assert.equal(vscode.workspace.getConfiguration().get('oxc.enable.oxfmt'), false);
  record('Oxc lints the installed project while Prettier remains the sole managed formatter');

  const tailwind = await editFile('tailwind-completion.tsx');
  const twPosition = tailwind.document.positionAt(tailwind.document.getText().lastIndexOf('"'));
  await until(async () => {
    const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', tailwind.document.uri, twPosition);
    return list?.items.some(item => label(item) === 'flex');
  }, 'Tailwind resolves the installed project and offers flex');
  const invalidTw = await editFile('tailwind.css');
  const cssEnd = invalidTw.document.positionAt(invalidTw.document.getText().length);
  invalidTw.editor.selection = new vscode.Selection(cssEnd, cssEnd);
  await vscode.commands.executeCommand('type', { text: '@tailwind definitely-invalid;\n' });
  await until(() => vscode.languages.getDiagnostics(invalidTw.document.uri).some(item => /tailwind/i.test(item.source || '') && item.code === 'invalidTailwindDirective' && item.severity === vscode.DiagnosticSeverity.Error),
    'Tailwind reports an invalid @tailwind directive').catch(error => { throw new Error(error.message + ': ' + JSON.stringify({ language: invalidTw.document.languageId, text: invalidTw.document.getText(), validate: vscode.workspace.getConfiguration('tailwindCSS', invalidTw.document.uri).get('validate'), diagnostics: vscode.languages.getDiagnostics(invalidTw.document.uri) })); });
  record('Tailwind offers real class completions and reports invalid directives');
  const css = await editFile('css-audit.css');
  await until(() => vscode.languages.getDiagnostics(css.document.uri).some(item => /^css$/i.test(item.source || '') && item.severity === vscode.DiagnosticSeverity.Error),
    'CSS validation reports the missing property value');
  record('CSS validation stays enabled without treating Tailwind directives as unknown rules');


  const dotenv = await editFile('.env.audit');
  assert.equal(dotenv.document.languageId, 'dotenv');
  record('DotENV language association applies to .env variant files');
  const icons = vscode.extensions.getExtension('pkief.material-icon-theme');
  const theme = icons.packageJSON.contributes.iconThemes.find(item => item.id === 'material-icon-theme');
  const definition = JSON.parse(fs.readFileSync(path.join(icons.extensionPath, theme.path)));
  assert.equal(vscode.workspace.getConfiguration().get('workbench.iconTheme'), theme.id);
  assert.ok(Object.values(definition.iconDefinitions).some(item => item.iconPath && fs.existsSync(path.resolve(icons.extensionPath, path.dirname(theme.path), item.iconPath))));
  record('Material Icon Theme is selected and its registered icon assets exist');

  const image = await editFile('image-audit.ts');
  await until(async () => {
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', image.document.uri, new vscode.Position(0, 30));
    return hovers?.some(hover => hover.contents.some(content => /audit-image|data:image/.test(typeof content === 'string' ? content : content.value || '')));
  }, 'Image preview resolves the actual local PNG on hover');
  record('Image preview returns an actual local-image hover');

  if (renderer) {
    await editFile('comments-audit.ts');
    await until(async () => await renderer.evaluate(`Array.from(document.querySelectorAll('.monaco-editor .view-line span')).some(node => /TODO/.test(node.textContent) && getComputedStyle(node).color === 'rgb(255, 140, 0)')`),
      'Better Comments renders the configured TODO color');
    record('Better Comments renders the configured TODO decoration');
    const tag = await editFile('rename.html');
    tag.editor.selection = new vscode.Selection(0, 2, 0, 2);
    await until(async () => await renderer.evaluate(`Array.from(document.querySelectorAll('.monaco-editor .view-line span')).some(node => /\\/\\.card/.test(getComputedStyle(node, '::after').content))`),
      'HTML End Tag Labels renders the configured class label');
    record('HTML End Tag Labels renders a real closing-tag label');
    await until(async () => await renderer.evaluate(`Array.from(document.querySelectorAll('.monaco-editor span, .monaco-editor div')).some(node => {
      const style = getComputedStyle(node); return style.borderBottomColor === 'rgba(125, 211, 252, 0.4)' && style.borderBottomStyle !== 'none'
        || style.textDecorationColor === 'rgba(125, 211, 252, 0.4)' && style.textDecorationLine.includes('underline'); })`),
      'Highlight Matching Tag renders the configured underline');
    record('Highlight Matching Tag renders a real tag underline');
    await editFile('cost-audit.tsx');
    await until(async () => await renderer.evaluate(`Array.from(document.querySelectorAll('.monaco-editor .view-line span')).some(node => /[\\d.]+\\s*(?:[KMk]B?|B)/.test(getComputedStyle(node, '::after').content))`),
      'Import Cost calculates and renders the installed React package size').catch(async error => {
        const decorations = await renderer.evaluate(`Array.from(document.querySelectorAll('.monaco-editor .view-line span')).map(node => getComputedStyle(node, '::after').content).filter(value => value !== 'none')`);
        throw new Error(error.message + ': ' + JSON.stringify({ decorations, logs: importCostLogs.filter(message => /error|Error|Calculated:|cost-audit/.test(message)).slice(-30) }));
      });
    const calculated = importCostLogs.filter(message => message.startsWith('Calculated: '))
      .map(message => JSON.parse(message.slice('Calculated: '.length)))
      .find(item => item.fileName.endsWith('cost-audit.tsx') && item.name === 'react' && item.size > 0 && item.gzip > 0);
    assert.ok(calculated, 'The actual size provider must return nonzero bundle and gzip sizes for this file');
    importCostResult = { name: calculated.name, version: calculated.version, size: calculated.size, gzip: calculated.gzip };
    record('Import Cost calculates and renders a real installed package size');
  }
  record(await require('./editor-tooling-host.cjs').verifyGitPanel(vscode, folder, until));
  return { passed: true, checks, extensions, validatedSettings: validated.length,
    ...(importCostResult ? { importCost: importCostResult } : {}),
    untested: ['SQL Server live connection/query requires a user-provided server; its settings are checked separately',
      'Jelly Cursor is optional and has no compatible stable release for this audited IDE engine'] };
}

module.exports = { writeFixture, verifyExtensionSettings };
