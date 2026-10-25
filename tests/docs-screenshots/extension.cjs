'use strict';

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

async function capture(name, target = 'editor', extra = {}) {
  const signals = process.env.WORKSTATION_DOCS_SIGNALS;
  await pause(1400);
  write(path.join(signals, name + '.ready.json'), { name, target, editorVersion: vscode.version,
    installed: Object.fromEntries(['workstation.calm-typescript', 'workstation.stability-helper', 'usernamehw.errorlens']
      .map(id => [id, vscode.extensions.getExtension(id)?.packageJSON.version || null])), ...extra });
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
    await capture('05-ai-after', 'settings');
    await vscode.workspace.getConfiguration().update('editor.inlineSuggest.enabled', false, target);
    await vscode.commands.executeCommand('workbench.action.openSettings', '@id:editor.inlineSuggest.enabled');
    await capture('06-inline-after');
    await settings.update('calmTypeScript.quietMode', false, target);
    await vscode.window.showTextDocument(document);
    await capture('07-calm-start', 'editor', { startClip: 'calm-typescript', caption: 'До: настоящие ошибки TypeScript видны. Проверка типов не выключается.' });
    await vscode.commands.executeCommand('workbench.action.openSettings', '@id:calmTypeScript.quietMode');
    await capture('08-calm-settings', 'editor', { clickSetting: 'calmTypeScript.quietMode', caption: 'Settings → Calm TypeScript → Quiet Mode: включаем галочку.' });
    await until(() => (vscode.workspace.getConfiguration().get('workbench.colorCustomizations') || {})['errorLens.errorForeground']?.endsWith('33'), 'Quiet Mode changed actual colors after the real checkbox click');
    await vscode.window.showTextDocument(document);
    await capture('09-calm-after', 'editor', { caption: 'После: текст ошибок спокойнее; реальные TypeScript diagnostics остаются.' });
    const completion = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'completion.ts'));
    const completionEditor = await vscode.window.showTextDocument(completion);
    completionEditor.selection = new vscode.Selection(0, completion.lineAt(0).text.length, 0, completion.lineAt(0).text.length);
    await until(async () => {
      const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', completion.uri, completionEditor.selection.active);
      return list?.items.some(item => (typeof item.label === 'string' ? item.label : item.label.label) === 'WorkstationHelper');
    }, 'actual TypeScript auto-import completion');
    await vscode.commands.executeCommand('editor.action.triggerSuggest');
    await capture('10-calm-completion', 'editor', { pressEnter: true, caption: 'Обычный autocomplete и auto-import работают. Enter принимает WorkstationHelper.' });
    await until(() => /import.*WorkstationHelper/.test(completion.getText()), 'accepting the real suggestion inserted its import');
    await capture('11-calm-import', 'editor', { caption: 'Результат: импорт добавлен настоящим TypeScript completion provider.' });
    await vscode.commands.executeCommand('workbench.action.quickOpen', '>Calm TypeScript: Reset Managed Editor Settings');
    await capture('12-calm-reset', 'editor', { pressEnter: true, caption: 'Reset возвращает запомненные исходные editor values, не удаляет ошибки из кода.' });
    await until(() => !(vscode.workspace.getConfiguration().get('workbench.colorCustomizations') || {})['errorLens.errorForeground']?.endsWith('33'), 'Reset restored original presentation');
    await vscode.window.showTextDocument(document);
    await capture('13-calm-end', 'editor', { stopClip: true, caption: 'После Reset исходные значения вернулись. Пока опция включена, следующий sync может применить её снова.' });
    const helper = vscode.extensions.getExtension('workstation.stability-helper');
    if (!helper) throw new Error('Installed Workstation Stability is missing');
    await helper.activate();
    await vscode.commands.executeCommand('workbench.action.openSettings', '@id:editor.fontSize');
    await capture('14-stability-start', 'editor', { startClip: 'stability', caption: 'Stability применяет User profile. Workspace override может иметь больший приоритет.' });
    await vscode.commands.executeCommand('workbench.action.quickOpen', '>Workstation: Inspect Project Setting Conflicts (Read Only)');
    await capture('15-stability-inspect', 'editor', { pressEnter: true, caption: 'Запускаем настоящую read-only проверку конфликтов.' });
    await capture('16-stability-report', 'editor', { caption: 'Output показывает конфликт: точный scope и файл .vscode/settings.json. Код проекта не исправляется автоматически.' });
    const conflict = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.vscode/settings.json'));
    await vscode.window.showTextDocument(conflict);
    await capture('17-stability-file', 'editor', { caption: 'Вот настоящий файл: editor.fontSize=21 в проекте перекрывает User profile=20.' });
    await vscode.commands.executeCommand('workbench.action.quickOpen', '>Workstation: Check Antigravity Stability');
    await capture('18-stability-status', 'editor', { pressEnter: true, caption: 'Check Antigravity Stability проверяет поддерживаемые установленные компоненты.' });
    await capture('19-stability-end', 'editor', { stopClip: true, caption: 'Результат настоящей команды в Output. Конфликт остаётся под контролем пользователя.' });
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
