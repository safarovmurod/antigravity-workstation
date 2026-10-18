'use strict';

// Runs only inside the isolated development host started by controller.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await pause(200); }
  throw new Error('Timed out: ' + description);
}
function write(file, value) {
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}

async function checkSettings(context, phase) {
  const root = process.env.MANSUR_NATIVE_SMOKE_REPO;
  const profile = require(path.join(root, 'extensions/mansur-antigravity-stability/profile.cjs'));
  const planFile = process.env.MANSUR_NATIVE_SMOKE_PLAN;
  const plan = JSON.parse(fs.readFileSync(planFile));
  const applied = await profile.applyEditorProfile(vscode, context, { file: planFile });
  assert.deepEqual(applied.failed, [], 'Production helper applies registered settings through the actual IDE API');
  // No language pack is downloaded in this smoke; restart-required for Russian is expected.
  const settings = vscode.workspace.getConfiguration();
  assert.equal(settings.get('editor.inlineSuggest.enabled'), false);
  for (const key of ['typescript.suggest.autoImports', 'javascript.suggest.autoImports',
    'editor.suggest.showVariables', 'editor.suggest.showFiles', 'editor.suggest.showFolders',
    'editor.suggest.showMethods', 'editor.suggest.showProperties']) {
    assert.equal(settings.get(key), true, key + ' remains enabled');
  }
  const folder = vscode.workspace.workspaceFolders[0].uri;
  const languages = [...new Set([...await vscode.languages.getLanguages(), 'javascript', 'javascriptreact',
    'typescript', 'typescriptreact', 'python'])].sort();
  const checkLanguages = () => {
    for (const languageId of languages) {
      assert.equal(vscode.workspace.getConfiguration('editor', { uri: folder, languageId }).get('inlineSuggest.enabled'),
        false, 'inline suggestions disabled for ' + languageId);
    }
  };
  let conflictReport;
  if (phase === 'verify') {
    assert.equal(typeof profile.inspectProjectConflicts, 'function', 'Production conflict inspector is available');
    conflictReport = await profile.inspectProjectConflicts(vscode, plan.settings);
    const conflict = conflictReport.conflicts.find(item => item.key === 'editor.inlineSuggest.enabled'
      && item.languageId === 'python' && item.active === true);
    assert.ok(conflict, 'A real Python workspace override is detected');
    assert.equal(conflict.actual, true);
    assert.ok(String(conflict.source).replace(/\\/g, '/').endsWith('/.vscode/settings.json'),
      'Conflict identifies the actual workspace settings file: ' + JSON.stringify({ conflict, readErrors: conflictReport.readErrors }));
    assert.equal(vscode.workspace.getConfiguration('editor', { uri: folder, languageId: 'python' }).get('inlineSuggest.enabled'), true);
    // This is a disposable fixture owned by this test, never a user's project.
    await vscode.workspace.getConfiguration('editor', { uri: folder, languageId: 'python' })
      .update('inlineSuggest.enabled', undefined, vscode.ConfigurationTarget.Workspace, true);
    await until(() => vscode.workspace.getConfiguration('editor', { uri: folder, languageId: 'python' }).get('inlineSuggest.enabled') === false,
      'removing the test workspace override restores the managed value');
    const after = await profile.inspectProjectConflicts(vscode, plan.settings);
    assert.ok(!after.conflicts.some(item => item.key === 'editor.inlineSuggest.enabled' && item.active),
      'No active inline-suggestion conflict remains after fixture repair');
  }
  checkLanguages();
  const ts = vscode.extensions.getExtension('vscode.typescript-language-features');
  assert.ok(ts, 'Built-in TypeScript extension is present');
  await ts.activate();
  const uri = vscode.Uri.joinPath(folder, 'completion.ts');
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
  const label = item => typeof item.label === 'string' ? item.label : item.label.label;
  await until(async () => {
    const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, new vscode.Position(1, 4));
    return result?.items.some(item => label(item) === 'localVariable');
  }, 'real TypeScript variable completion remains available');
  await until(async () => {
    const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, new vscode.Position(2, 7));
    return result?.items.some(item => label(item) === 'SmokeComponent');
  }, 'real TypeScript cross-file symbol auto-import completion remains available');
  const react = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'native-react.tsx'));
  await vscode.window.showTextDocument(react);
  for (const [line, character, expected] of [[1, 8, 'log'], [2, 33, 'onClick']]) {
    await until(async () => {
      const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', react.uri, new vscode.Position(line, character));
      return result?.items.some(item => label(item) === expected);
    }, 'actual native completion ' + expected);
  }
  const mancho = vscode.extensions.getExtension('mancho.ts-mancho');
  assert.ok(mancho); await mancho.activate();
  const lens = vscode.extensions.getExtension('usernamehw.errorlens');
  assert.ok(lens); await lens.activate();
  await until(() => vscode.workspace.getConfiguration().get('errorLens.followCursor') === 'allLines', 'Mancho displays every diagnostic line');
  for (const name of ['errorLens.errorForeground', 'errorLens.warningForeground', 'errorLens.infoForeground', 'errorLens.hintForeground']) {
    assert.equal(vscode.workspace.getConfiguration().get('workbench.colorCustomizations')[name].slice(-2), '0D');
  }
  await until(() => vscode.languages.getDiagnostics(react.uri).some(item => item.severity === vscode.DiagnosticSeverity.Error), 'real syntax diagnostics stay enabled');
  return { passed: true, phase, editorVersion: vscode.version, checkedLanguages: languages,
    editorProfile: { failed: applied.failed, unavailable: applied.unavailable, status: applied.status },
    checks: ['real IDE extension host', 'effective global inlineSuggest disabled', 'effective language inlineSuggest disabled',
      'native TypeScript variable completion', 'native TypeScript symbol auto-import completion',
      'native console.log and React onClick completion', 'Mancho and Error Lens show errors on all lines at 95% transparency',
      ...(conflictReport ? ['real workspace override detected with source path', 'fixture override removal restores effective setting'] : [])],
    ...(conflictReport ? { conflictReport } : {}) };
}

function activate(context) {
  const phase = process.env.MANSUR_NATIVE_SMOKE_PHASE;
  const directory = process.env.MANSUR_NATIVE_SMOKE_SIGNALS;
  if (!['initial', 'verify'].includes(phase) || !directory || !process.env.MANSUR_NATIVE_SMOKE_REPO) {
    throw new Error('This test extension must be launched by the isolated Windows smoke controller');
  }
  void (async () => {
    try { write(path.join(directory, phase + '-ready.json'), await checkSettings(context, phase)); }
    catch (error) { write(path.join(directory, phase + '-ready.json'), { passed: false, phase, error: error.stack }); }
    await until(() => fs.existsSync(path.join(directory, phase + '-quit')), 'controller asks this isolated IDE to quit', 240000);
    // Normal application shutdown flushes SQLite/WAL; the test never edits a live database.
    await vscode.commands.executeCommand('workbench.action.quit');
  })().catch(error => {
    write(path.join(directory, phase + '-fatal.json'), { passed: false, error: error.stack });
    void vscode.commands.executeCommand('workbench.action.quit');
  });
}

module.exports = { activate };
