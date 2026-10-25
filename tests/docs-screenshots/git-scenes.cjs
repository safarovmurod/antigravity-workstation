'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { assertFixture } = require('./panel-recording.cjs');

async function run(vscode, capture, until) {
  const folder = process.env.WORKSTATION_DOCS_GIT;
  assertFixture(folder);
  const extension = vscode.extensions.getExtension('workstation.git-branch-panel');
  assert.ok(extension, 'Actual installed Git Branch Panel must be present');
  await extension.activate();
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
  await vscode.commands.executeCommand('workstationGithubPanel.focus');
  for (let step = 0; step < 3; step++) await vscode.commands.executeCommand('workbench.action.increaseViewWidth');
  const branchUri = vscode.Uri.file(path.join(folder, 'branch.txt'));
  let document = await vscode.workspace.openTextDocument(branchUri);
  let editor = await vscode.window.showTextDocument(document);
  await capture('20-current-start', 'editor', { startClip: 'current-branch', caption: 'Explorer → GitHub. Сейчас main; commit относится к этой local ветке, push — в origin/main. Тестовый origin локальный и disposable.' });
  await capture('21-current-view', 'editor', { panelAction: 'view-current', caption: 'Открываем и закрываем блок текущей ветки. Это просмотр, не переключение и не изменение файлов.' });
  await capture('22-current-end', 'editor', { stopClip: true, caption: 'main остался активным; файл и Git tree не изменились. Для настоящего push в main будет отдельное подтверждение.' });

  await capture('23-new-start', 'editor', { startClip: 'new-branch', caption: 'Новая ветка: сначала выбираем base main, затем имя demo-new.' });
  await capture('24-new-create', 'editor', { panelAction: 'create', caption: 'Создать и push: реальная кнопка создаёт local branch и сразу отправляет её в disposable origin.' });
  const terminal = vscode.window.createTerminal({ name: 'Guide refs', cwd: folder, shellPath: 'powershell.exe', shellArgs: ['-NoProfile'] });
  terminal.show(); terminal.sendText('git branch --all', true);
  await capture('25-new-end', 'editor', { stopClip: true, caption: 'Результат настоящего git branch --all: * demo-new и remotes/origin/demo-new. Новый branch уже активен.' });
  await vscode.commands.executeCommand('workbench.action.closePanel');
  editor = await vscode.window.showTextDocument(document);

  const replace = async text => {
    assert.equal(document.uri.fsPath.toLowerCase(), branchUri.fsPath.toLowerCase());
    await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text));
  };
  await capture('26-switch-start', 'editor', { startClip: 'switch-branch', caption: 'Переключить ветку меняет выбранный branch и его файлы. Сначала проверим защиту работы.' });
  await replace('unsaved current work\n'); assert.equal(document.isDirty, true);
  await capture('27-switch-unsaved', 'editor', { panelAction: 'switch-unsaved', caption: 'Есть несохранённый редактор: попытка demo-other блокируется, текст не теряется.' });
  assert.equal(document.isDirty, true); assert.match(document.getText(), /unsaved current work/);
  await replace('saved local change\n'); await document.save();
  await vscode.commands.executeCommand('workstationGithubPanel.refresh');
  await capture('28-switch-uncommitted', 'editor', { panelAction: 'switch-uncommitted', caption: 'Файл сохранён, но не commit: Git не даст затереть конфликтующее изменение другой веткой.' });
  assert.equal(document.getText(), 'saved local change\n');
  await replace('main branch content\n'); await document.save();
  await vscode.commands.executeCommand('workstationGithubPanel.refresh');
  await capture('29-switch-clean', 'editor', { panelAction: 'switch-clean', caption: 'Убираем только тестовую правку и выбираем demo-other в том же списке.' });
  await until(() => document.getText() === 'other branch content\n', 'actual editor reloads the other branch file');
  await capture('30-switch-end', 'editor', { stopClip: true, caption: 'Теперь demo-other активен, branch.txt показывает его содержимое. Несохранённую работу не выбрасывали.' });

  await capture('31-receive-prepare', 'editor', { panelAction: 'prepare-conflict', caption: 'Подготавливаем только disposable fixture: отдельные local и incoming commits.' });
  const sharedUri = vscode.Uri.file(path.join(folder, 'shared.txt'));
  const shared = await vscode.workspace.openTextDocument(sharedUri);
  let sharedEditor = await vscode.window.showTextDocument(shared);
  await vscode.commands.executeCommand('workstationGithubPanel.refresh');
  await capture('32-receive-start', 'editor', { startClip: 'get-changes', caption: 'Получить изменения: source incoming → current demo-other. Кнопка делает fetch, затем merge локально.' });
  await capture('33-receive-click', 'editor', { panelAction: 'receive', caption: 'Нажимаем fetch/merge. В origin есть новый commit; две стороны меняли shared.txt.' });
  await until(() => /<<<<<<<|>>>>>>>/.test(shared.getText()), 'real merge markers appear in the file');
  await capture('34-receive-conflict', 'editor', { caption: 'Настоящий conflict: файл содержит обе версии. Выбираем целиком свою текущую версию для этого файла.' });
  await capture('35-receive-resolve', 'editor', { panelAction: 'resolve', caption: 'Сохраняем выбор в настоящем conflict panel. Merge создаёт local commit, не отправляет его сам.' });
  await until(() => shared.getText() === 'local current shared content\n', 'actual ours resolution is visible');
  await capture('36-receive-end', 'editor', { stopClip: true, caption: 'Конфликт разрешён, merge сохранён в demo-other. origin/demo-other пока прежний: для отправки нужен отдельный push.' });

  sharedEditor = await vscode.window.showTextDocument(shared);
  await sharedEditor.edit(edit => edit.insert(shared.positionAt(shared.getText().length), 'unsaved fixture text\n'));
  assert.equal(shared.isDirty, true);
  await capture('37-delete-start', 'editor', { startClip: 'delete-branch', caption: 'Удаление: сначала смотрим scope local / origin / оба и предупреждение про unmerged/unpublished commits.' });
  await capture('38-delete-unmerged', 'editor', { panelAction: 'delete-unmerged', caption: 'Обычное удаление demo-other блокируется: unmerged commits. Ни local, ни origin не удалены.' });
  await capture('39-delete-unsaved', 'editor', { panelAction: 'delete-unsaved', caption: 'Даже Force local не удаляет активную ветку при несохранённом редакторе. Работа остаётся.' });
  assert.equal(shared.isDirty, true); assert.match(shared.getText(), /unsaved fixture text/);
  await sharedEditor.edit(edit => edit.replace(new vscode.Range(shared.positionAt(0), shared.positionAt(shared.getText().length)), 'local current shared content\n'));
  await shared.save();
  await vscode.commands.executeCommand('workstationGithubPanel.refresh');
  await capture('40-delete-merged', 'editor', { panelAction: 'delete-merged', caption: 'Удаляем только безопасную demo-new: явно local + origin; второй dialog показывает свежий origin SHA.' });
  await capture('41-delete-end', 'editor', { stopClip: true, caption: 'Проверено real Git: demo-new исчезла local и в origin. demo-other, его commits, файлы и protected main сохранены.' });

  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await capture('42-pr-prepare', 'editor', { panelAction: 'prepare-pr', caption: 'Для PR используем readonly GitHub origin этого проекта: никакой чужой branch не создаём и не удаляем.' });
  await vscode.commands.executeCommand('workstationGithubPanel.refresh');
  const readme = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(folder, 'README.md')));
  await vscode.window.showTextDocument(readme);
  await capture('43-pr-start', 'editor', { startClip: 'pull-request', caption: 'Pull Request — Пешниҳоди якҷоя кардани кодҳои ин ветка бо веткаи дигар. Head — текущая ветка, base — main.' });
  await capture('44-pr-open', 'editor', { panelAction: 'open-pr', caption: 'Настоящая кнопка сначала проверяет head/base в origin и опубликованный head, затем открывает официальный compare.' });
  await capture('45-pr-github', 'editor', { panelAction: 'show-pr-page', caption: 'Это настоящая GitHub compare-страница с head/base и diff. Открыть compare/PR ≠ merge; main не меняется.' });
  await capture('46-pr-end', 'editor', { stopClip: true, caption: 'Без входа GitHub может попросить Log in для Create pull request. В этом тесте PR не создавался и merge не выполнялся.' });
  terminal.dispose();
}
module.exports = { run };
