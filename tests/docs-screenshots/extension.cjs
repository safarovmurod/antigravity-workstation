'use strict';

// Documentation fixture. Runs only in the disposable GitHub-hosted IDE.
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await pause(200); }
  throw new Error('Documentation capture timed out: ' + label);
}
function write(file, value) {
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

async function capture(name, target = 'editor') {
  const signals = process.env.WORKSTATION_DOCS_SIGNALS;
  await pause(1400);
  write(path.join(signals, name + '.ready.json'), { name, target, editorVersion: vscode.version });
  await until(() => fs.existsSync(path.join(signals, name + '.done')), name);
}

async function main() {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('Documentation screenshots are restricted to a disposable GitHub-hosted Windows runner');
  }
  const phase = process.env.WORKSTATION_DOCS_PHASE;
  const settings = vscode.workspace.getConfiguration();
  const target = vscode.ConfigurationTarget.Global;
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes('workbench.action.openAntigravitySettingsWithId')) throw new Error('Official Antigravity Settings command is missing');

  if (phase === 'before') {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const diagnostic = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'example.ts');
    const document = await vscode.workspace.openTextDocument(diagnostic);
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(4, 0, 4, 0);
    for (const command of ['workbench.action.closeSidebar', 'workbench.action.closeAuxiliaryBar', 'notifications.hideToasts']) {
      if (commands.includes(command)) await vscode.commands.executeCommand(command);
    }
    await vscode.extensions.getExtension('vscode.typescript-language-features').activate();
    await vscode.extensions.getExtension('usernamehw.errorlens').activate();
    await vscode.extensions.getExtension('workstation.calm-typescript').activate();
    await settings.update('calmTypeScript.quietMode', false, target);
    await until(() => vscode.languages.getDiagnostics(diagnostic).some(d => d.severity === vscode.DiagnosticSeverity.Error), 'real TypeScript errors');
    await capture('01-diagnostics-before');
    await settings.update('calmTypeScript.quietMode', true, target);
    await until(() => (vscode.workspace.getConfiguration().get('workbench.colorCustomizations') || {})['errorLens.errorForeground']?.endsWith('33'), 'actual Calm TypeScript presentation');
    await capture('02-diagnostics-after');
    await vscode.commands.executeCommand('workbench.action.quickOpen', '>Open Antigravity Settings');
    await capture('03-open-ai-settings');
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
    await vscode.commands.executeCommand('workbench.action.openAntigravitySettingsWithId', 'tabEnabled', 'Tab');
    await capture('04-ai-before', 'settings');
    // The controller clicks these two real UI switches before acknowledging shot 04.
    // Official extension-test mode has in-memory storage, so documentation does
    // not attempt to apply an offline production SQLite transaction to this fixture.
    await capture('05-ai-after', 'settings');
    await vscode.workspace.getConfiguration().update('editor.inlineSuggest.enabled', false, target);
    await vscode.commands.executeCommand('workbench.action.openSettings', '@id:editor.inlineSuggest.enabled');
    await capture('06-inline-after');
  } else throw new Error('Unknown documentation capture phase');

  write(path.join(process.env.WORKSTATION_DOCS_SIGNALS, phase + '.complete.json'), { passed: true, phase });
  await vscode.commands.executeCommand('workbench.action.quit');
}

exports.activate = function () {};
exports.run = async function () {
  try { await main(); }
  catch (error) {
    write(path.join(process.env.WORKSTATION_DOCS_SIGNALS, 'failure.json'), { error: error.stack });
    throw error;
  }
};
