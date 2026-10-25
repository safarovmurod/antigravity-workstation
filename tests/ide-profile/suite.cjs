'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await pause(200); }
  throw new Error('Timed out: ' + label);
}
async function run() {
  const report = { passed: false, phase: process.env.WORKSTATION_IDE_PHASE, editorVersion: vscode.version,
    language: vscode.env.language, scope: process.env.WORKSTATION_IDE_SCOPE || 'all', checks: [], extensions: [] };
  const check = (label, action) => { action(); report.checks.push(label); };
  try {
    const catalog = require('../../config/extensions.json').filter(item => !item.optional);
    for (const item of catalog) {
      fs.writeFileSync(process.env.WORKSTATION_IDE_RESULT + '.progress', item.id);
      const extension = vscode.extensions.getExtension(item.id);
      assert.ok(extension, 'IDE discovers ' + item.id);
      if (item.version) assert.equal(extension.packageJSON.version, item.version, item.id + ' loads the current catalog version');
      report.extensions.push({ id: item.id, version: extension.packageJSON.version });
      if ((extension.packageJSON.main || extension.packageJSON.browser)
        && (report.scope !== 'editor' || ['workstation.calm-typescript', 'workstation.stability-helper',
          'esbenp.prettier-vscode', 'oxc.oxc-vscode', 'usernamehw.errorlens'].includes(item.id))) await extension.activate();
    }
    report.checks.push(report.scope === 'editor' ? 'all required extensions discovered; relevant editor extensions activated without rejection'
      : 'all required extensions discovered; executable extensions activated without rejection');
    fs.writeFileSync(process.env.WORKSTATION_IDE_RESULT + '.progress', 'profile and editor features');
    await until(() => vscode.workspace.getConfiguration().get('editor.inlineSuggest.enabled') === false,
      'installed Stability Helper automatically corrects the fixture setting', 30000);
    report.profile = await vscode.commands.executeCommand('workstationStability.inspectConflicts');
    assert.equal(report.profile.status, 'checked', JSON.stringify(report.profile));
    report.checks.push('installed Stability Helper automatically applies and verifies the complete editor profile');
    const config = vscode.workspace.getConfiguration();
    check('effective IDE settings, formatter, icons and Russian locale', () => {
      assert.equal(config.get('editor.inlineSuggest.enabled'), false);
      assert.equal(config.get('editor.defaultFormatter'), 'esbenp.prettier-vscode');
      assert.equal(config.get('workbench.iconTheme'), 'material-icon-theme');
      assert.equal(config.get('typescript.validate.enable'), true);
      assert.equal(config.get('typescript.suggest.autoImports'), true);
      assert.equal(config.get('editor.cursorSmoothCaretAnimation'), 'on');
      assert.match(vscode.env.language, /^ru(?:-|$)/);
    });
    const folder = vscode.workspace.workspaceFolders[0].uri;
    report.checks.push(await require('../editor-tooling-host.cjs').verifyGitPanel(vscode, folder, until));
    const uri = vscode.Uri.joinPath(folder, 'completion.ts');
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await vscode.extensions.getExtension('vscode.typescript-language-features').activate();
    const label = item => (typeof item.label === 'string' ? item.label : item.label.label).replace(/\?$/, '');
    for (const [line, character, expected] of [[1, 4, 'localVariable'], [2, 7, 'SmokeComponent']]) {
      await until(async () => {
        const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, new vscode.Position(line, character));
        return result?.items.some(item => label(item) === expected);
      }, 'native completion ' + expected);
    }
    report.checks.push('native TypeScript variables and cross-file auto-imports');
    report.checks.push(await require('../editor-tooling-host.cjs').verifyLibraryImport(vscode, folder, until));
    report.checks.push(await require('../editor-tooling-host.cjs').verifyFormatAndSave(vscode, folder, until));
    const react = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'native-react.tsx'));
    await vscode.window.showTextDocument(react);
    for (const [line, character, expected, category] of [[1, 8, 'log', 'Methods'], [2, 33, 'onClick', 'Properties']]) {
      assert.equal(vscode.workspace.getConfiguration().get('editor.suggest.show' + category), true);
      await until(async () => {
        const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', react.uri, new vscode.Position(line, character));
        return result?.items.some(item => label(item) === expected);
      }, 'native React/JavaScript completion ' + expected);
    }
    report.checks.push('console.log methods and React onClick property suggestions are available with their UI categories enabled');
    const colors = vscode.workspace.getConfiguration().get('workbench.colorCustomizations');
    assert.equal(colors['errorLens.errorForeground'], '#f8717133');
    assert.equal(colors['errorLens.warningForeground'], '#fbbf2433');
    assert.equal(vscode.workspace.getConfiguration().get('errorLens.followCursor'), 'allLines');
    report.checks.push('Error Lens is enabled on all affected lines with 80% transparent error and warning text');
    const invalid = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'validation.ts'));
    await vscode.window.showTextDocument(invalid);
    await until(() => vscode.languages.getDiagnostics(invalid.uri).some(item => item.code === 2322), 'native TypeScript type error');
    report.checks.push('native TypeScript validation remains active');
    const lint = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'lint.ts'));
    await vscode.window.showTextDocument(lint);
    await until(() => vscode.languages.getDiagnostics(lint.uri).some(item => /oxc|oxlint/i.test(item.source || '')
      && /debugger/i.test(item.message)), 'latest Oxc reports a real Oxlint error from the project dependency');
    report.checks.push('latest Oxc starts the project Oxlint server and produces actual lint diagnostics');
    const format = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'format.ts'));
    await vscode.window.showTextDocument(format);
    await vscode.commands.executeCommand('editor.action.formatDocument');
    assert.equal(format.getText(), 'const answer = { value: 42 }\n');
    report.checks.push('Prettier formats a real editor document');
    const editor = await vscode.window.showTextDocument(format);
    const original = format.getText();
    await editor.edit(builder => builder.insert(new vscode.Position(0, 0), '// Saved by isolated IDE test.\n'));
    await until(() => !format.isDirty && fs.readFileSync(format.uri.fsPath, 'utf8') === format.getText(), 'Calm TypeScript pause-based save');
    report.checks.push('Calm TypeScript saves an actual edit after typing pauses');
    await editor.edit(builder => builder.replace(new vscode.Range(new vscode.Position(0, 0), format.lineAt(format.lineCount - 1).range.end), original));
    await format.save();
    await vscode.window.showTextDocument(document);
    report.passed = true;
  } catch (error) { report.error = error.stack; }
  fs.writeFileSync(process.env.WORKSTATION_IDE_RESULT, JSON.stringify(report, null, 2));
  if (process.env.WORKSTATION_IDE_HOLD === '1') await pause(25000);
  assert.equal(report.passed, true, report.error);
}
function activate() {
  if (!process.env.WORKSTATION_IDE_RESULT) throw new Error('Launch only with the isolated IDE controller');
  void run().catch(error => console.error(error.stack)).finally(() => vscode.commands.executeCommand('workbench.action.quit'));
}
module.exports = { run, activate };
