'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isRussian } = require('./text');

const RUSSIAN = {
  commit: 'Commit', refresh: 'Обновить из GitHub', files: 'Файлы', noFiles: 'Нет изменений', message: 'Сообщение commit',
  push: 'Push', toPush: 'Ждут отправки', notOnGitHub: 'Ветки ещё нет в GitHub', noRemote: 'Проект не подключён к GitHub (нет origin).',
  behind: 'В GitHub новые commits этой ветки', syncBranch: 'Получить и объединить',
  switchBranch: 'Переключить ветку', newBranch: 'Новая ветка', branchName: 'Имя', fromBranch: 'Из ветки', create: 'Создать',
  receive: 'Получить изменения', receiveFrom: 'Из ветки', receiveButton: 'Получить',
  conflicts: 'Конфликты', ours: 'Моё', theirs: 'Из GitHub', oursAll: 'Всё моё', theirsAll: 'Всё из GitHub', apply: 'Применить', abortMerge: 'Отменить merge',
  abortRebase: 'Отменить rebase',
  deleteBranch: 'Удалить ветку', deleteButton: 'Удалить', noBranches: 'Нет веток для удаления', active: 'активная',
  fixAuthor: 'Исправить автора и отправить', signIn: 'Войти в GitHub',
  author: 'Автор commits', authorOwner: 'владелец репозитория', authorAccount: 'аккаунт редактора', authorGit: 'из git config', authorNone: 'не задан: подключи репозиторий GitHub',
};

const ENGLISH = {
  commit: 'Commit', refresh: 'Update from GitHub', files: 'Files', noFiles: 'No changes', message: 'Commit message',
  push: 'Push', toPush: 'Waiting to push', notOnGitHub: 'The branch is not on GitHub yet', noRemote: 'The project is not connected to GitHub (no origin).',
  behind: 'GitHub has newer commits on this branch', syncBranch: 'Get and merge',
  switchBranch: 'Switch branch', newBranch: 'New branch', branchName: 'Name', fromBranch: 'From branch', create: 'Create',
  receive: 'Get changes', receiveFrom: 'From branch', receiveButton: 'Get',
  conflicts: 'Conflicts', ours: 'Mine', theirs: 'From GitHub', oursAll: 'All mine', theirsAll: 'All from GitHub', apply: 'Apply', abortMerge: 'Cancel merge',
  abortRebase: 'Cancel rebase',
  deleteBranch: 'Delete branch', deleteButton: 'Delete', noBranches: 'No branches to delete', active: 'active',
  fixAuthor: 'Fix author and push', signIn: 'Sign in to GitHub',
  author: 'Commit author', authorOwner: 'repository owner', authorAccount: 'editor account', authorGit: 'from git config', authorNone: 'not set: connect a GitHub repository',
};

function readAsset(name) {
  return fs.readFileSync(path.join(__dirname, 'webview', name), 'utf8');
}

function block(id, title, open, content, extraHeader = '') {
  return `
<div class="block" id="block-${id}">
  <div class="block-header" data-block="${id}">
    <div class="header-left"><span class="chevron">${open ? '▼' : '▶'}</span><span>${title}</span></div>${extraHeader}
  </div>
  <div class="block-content" id="content-${id}"${open ? '' : ' hidden'}>${content}
  </div>
</div>`;
}

function renderBody(ui) {
  const commit = `
    <label class="check-row select-all"><input type="checkbox" id="selectAll"><span id="filesTitle">${ui.files}</span></label>
    <div class="file-list" id="changedFiles"></div>
    <textarea id="commitMessage" rows="2" placeholder="${ui.message}"></textarea>
    <button class="btn btn-primary" id="commitButton" disabled>${ui.commit}</button>`;
  const push = `
    <div class="target-summary" id="pushSummary">—</div>
    <button class="btn btn-primary" id="pushButton" disabled>${ui.push}</button>
    <div id="behindRow" hidden>
      <div class="behind-text" id="behindText"></div>
      <button class="btn btn-secondary" data-command="syncBranch">${ui.syncBranch}</button>
    </div>`;
  const switchBranch = `
    <select id="branchSelect"></select>`;
  const newBranch = `
    <div class="field-label">${ui.branchName}</div><input type="text" id="newBranchName" placeholder="day-2">
    <div class="field-label">${ui.fromBranch}</div><select id="newBranchBase"></select>
    <button class="btn btn-secondary" id="newBranchButton">${ui.create}</button>`;
  const receive = `
    <div class="field-label">${ui.receiveFrom}</div><select id="pullSource"></select>
    <button class="btn btn-primary" id="pullButton">${ui.receiveButton}</button>
    <div id="conflictPanel" hidden>
      <div class="field-label">${ui.conflicts}</div>
      <div id="conflictList"></div>
      <div class="btn-row"><button class="btn btn-secondary" data-choose="ours">${ui.oursAll}</button><button class="btn btn-secondary" data-choose="theirs">${ui.theirsAll}</button></div>
      <button class="btn btn-primary" id="resolveButton">${ui.apply}</button>
      <button class="btn btn-secondary" data-command="abortOperation">${ui.abortMerge}</button>
    </div>`;
  const remove = `
    <div class="branch-checklist" id="deleteChecklist"></div>
    <button class="btn btn-danger" id="deleteButton" disabled>${ui.deleteButton}</button>`;
  return `
<div class="status-bar" id="notice" hidden>
  <div id="noticeText"></div>
  <pre id="noticeDetails" hidden></pre>
  <button class="btn btn-secondary" id="noticeAction" hidden></button>
</div>
<div class="status-bar status-warn" id="repoProblem" hidden>
  <div id="repoProblemText"></div>
  <button class="btn btn-secondary" id="abortRebaseButton" data-command="abortOperation" hidden>${ui.abortRebase}</button>
</div>
<div class="author-line" id="authorLine" hidden></div>
<div id="blocks">${block('commit', ui.commit, true, commit, `<button class="refresh-btn" data-command="fetch" title="${ui.refresh}">↻</button>`)}${block('push', ui.push, true, push)}${block('switch', ui.switchBranch, false, switchBranch)}${block('new', ui.newBranch, false, newBranch)}${block('receive', ui.receive, false, receive)}${block('delete', ui.deleteBranch, false, remove)}
</div>`;
}

function renderHtml() {
  const ui = isRussian() ? RUSSIAN : ENGLISH;
  const nonce = crypto.randomBytes(16).toString('hex');
  return `<!DOCTYPE html>
<html lang="${isRussian() ? 'ru' : 'en'}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
${readAsset('view.css')}</style>
</head>
<body>${renderBody(ui)}
<script nonce="${nonce}">const UI = ${JSON.stringify(ui)};</script>
<script nonce="${nonce}">
${readAsset('view.js')}</script>
</body>
</html>`;
}

module.exports = { renderHtml, RUSSIAN, ENGLISH };
