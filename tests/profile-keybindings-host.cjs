'use strict';
// Real keyboard dispatch in a fresh named profile. Extension contributions must
// work even though the installer only wrote the default profile's user bindings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { rendererConnection, waitFor } = require('./calm-typescript-editor.cjs');
async function run() {
  const vscode = require('vscode');
  const helper = vscode.extensions.getExtension('workstation.stability-helper');
  assert.ok(helper, 'The packaged helper contributes shortcuts in this named profile');
  const originalDefault = fs.readFileSync(process.env.WORKSTATION_DEFAULT_KEYBINDINGS_FILE);
  await vscode.commands.executeCommand('workbench.action.openGlobalKeybindingsFile');
  const bindings = vscode.window.activeTextEditor.document;
  assert.match(bindings.uri.path, /\/profiles\/[^/]+\/keybindings\.json$/);
  const { parseJsonc } = require('../lib/jsonc');
  assert.deepEqual(parseJsonc(bindings.getText(), []), [], 'The named profile has no copied managed user shortcuts');
  const custom = { key: 'f9', command: 'workstationLaptop.personal' };
  await vscode.workspace.fs.writeFile(bindings.uri, Buffer.from(JSON.stringify([custom])));
  const document = await vscode.workspace.openTextDocument({ language: 'plaintext', content: 'unformatted' });
  const editor = await vscode.window.showTextDocument(document);
  let formatCalls = 0, personalCalls = 0;
  const formatter = vscode.languages.registerDocumentFormattingEditProvider('plaintext', {
    provideDocumentFormattingEdits(doc) { formatCalls++; return [vscode.TextEdit.replace(
      new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), 'formatted\n')]; },
  });
  const completion = vscode.languages.registerCompletionItemProvider('plaintext', {
    provideCompletionItems() { return [new vscode.CompletionItem('LaptopShortcutProbe', vscode.CompletionItemKind.Variable)]; },
  });
  const command = vscode.commands.registerCommand('workstationLaptop.personal', () => { personalCalls++; });
  const keyboard = await rendererConnection();
  const checks = [];
  try {
    await vscode.workspace.getConfiguration('editor').update('quickSuggestions', false, vscode.ConfigurationTarget.Global);
    for (const [name, modifiers] of [['Ctrl+Shift+F', 10], ['Ctrl+Alt+F', 3]]) {
      await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), 'unformatted'));
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      const before = formatCalls;
      await keyboard.pressKey('F', 'KeyF', 70, modifiers);
      await waitFor(() => formatCalls === before + 1 && document.getText() === 'formatted\n', name + ' invokes document formatting in the named profile');
      checks.push(name + ' formats through the real keyboard binding');
    }
    for (const [name, modifiers] of [['Ctrl+Space', 2], ['Alt+Space', 1]]) {
      await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), 'Lap'));
      editor.selection = new vscode.Selection(0, 3, 0, 3);
      await vscode.commands.executeCommand('hideSuggestWidget');
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      await keyboard.pressKey(' ', 'Space', 32, modifiers);
      await waitFor(async () => await keyboard.evaluate(`Array.from(document.querySelectorAll('.suggest-widget.visible .label-name')).some(node => node.textContent === 'LaptopShortcutProbe')`), name + ' opens the actual completion menu');
      checks.push(name + ' opens the actual suggestion widget');
    }
    await vscode.commands.executeCommand('hideSuggestWidget');
    const override = { key: 'ctrl+shift+f', command: custom.command, when: 'editorTextFocus && !editorReadonly' };
    await vscode.workspace.fs.writeFile(bindings.uri, Buffer.from(JSON.stringify([custom, override])));
    // The editor watches its profile resource asynchronously.
    await new Promise(resolve => setTimeout(resolve, 1200));
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    const before = formatCalls;
    await keyboard.pressKey('F', 'KeyF', 70, 10);
    await waitFor(() => personalCalls === 1, 'a personal user shortcut retains priority over the extension default');
    assert.equal(formatCalls, before);
    assert.deepEqual(parseJsonc(Buffer.from(await vscode.workspace.fs.readFile(bindings.uri)).toString()), [custom, override]);
    assert.deepEqual(fs.readFileSync(process.env.WORKSTATION_DEFAULT_KEYBINDINGS_FILE), originalDefault);
    checks.push('Personal shortcuts retain priority and both profile files remain untouched by the helper');
    fs.writeFileSync(process.env.WORKSTATION_EDITOR_RESULT, JSON.stringify({ passed: true, editorVersion: vscode.version,
      helperVersion: helper.packageJSON.version, namedProfile: true, userShortcutsInitiallyEmpty: true, checks }, null, 2));
  } finally { keyboard.close(); formatter.dispose(); completion.dispose(); command.dispose(); }
}
module.exports = { run };
