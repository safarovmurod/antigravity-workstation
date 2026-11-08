'use strict';

const vscode = acquireVsCodeApi();
const REFRESH_INTERVAL_MS = 5000;
let state = null;
let busy = false;
let renderedFilesKey = '';

function byId(id) {
  return document.getElementById(id);
}

function span(className, text) {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

function hint(text) {
  const element = document.createElement('div');
  element.className = 'hint-text';
  element.textContent = text;
  return element;
}

function runAction(command, data) {
  if (busy) return;
  busy = true;
  renderControls();
  vscode.postMessage(Object.assign({ command }, data || {}));
}

function toggleBlock(id) {
  const content = byId('content-' + id);
  setBlockOpen(id, content.hidden);
}

function setBlockOpen(id, open) {
  byId('content-' + id).hidden = !open;
  byId('block-' + id).querySelector('.chevron').textContent = open ? '▼' : '▶';
}

// Files

function fileInputs() {
  return Array.from(byId('changedFiles').querySelectorAll('input'));
}

function selectableFiles() {
  return fileInputs().filter(input => input.dataset.secret !== 'true');
}

function checkedFiles() {
  return selectableFiles().filter(input => input.checked).map(input => input.dataset.file);
}

function fileRow(item, previous) {
  const row = document.createElement('label');
  row.className = 'check-row' + (item.secret ? ' secret-file' : '');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !item.secret && (previous.has(item.file) ? previous.get(item.file) : true);
  input.dataset.file = item.file;
  input.dataset.secret = String(item.secret);
  input.addEventListener('change', renderControls);
  const name = (item.originalFile ? item.originalFile + ' → ' : '') + item.file + (item.secret ? ' 🔒' : '');
  row.append(input, span('file-status', item.status), span('file-name', name));
  return row;
}

// Rebuilt only when the list changed, so ticks survive live refreshes.
function updateChangedFiles(files) {
  const key = JSON.stringify(files);
  if (key === renderedFilesKey) return;
  renderedFilesKey = key;
  const list = byId('changedFiles');
  const previous = new Map(fileInputs().map(input => [input.dataset.file, input.checked]));
  list.innerHTML = '';
  if (!files.length) list.appendChild(hint(UI.noFiles));
  for (const item of files) list.appendChild(fileRow(item, previous));
}

function updateSelectAll() {
  const all = selectableFiles();
  const checked = all.filter(input => input.checked).length;
  byId('selectAll').checked = all.length > 0 && checked === all.length;
  byId('selectAll').indeterminate = checked > 0 && checked < all.length;
  byId('filesTitle').textContent = UI.files + (all.length ? ' (' + checked + '/' + all.length + ')' : '');
}

function selectAllFiles(checked) {
  selectableFiles().forEach(input => { input.checked = checked; });
  renderControls();
}

// Push

function canPush(current) {
  const hasSomethingToPush = current.ahead > 0 || !current.remoteBranchExists;
  // With newer commits in GitHub a push is rejected; "Get and merge" comes first.
  return Boolean(current.remote) && current.hasCommits && hasSomethingToPush && current.behind === 0 && !current.mergeInProgress;
}

function updatePush(current) {
  let summary = UI.noRemote;
  if (current.remote) {
    summary = current.branch + ' → origin/' + current.branch;
    if (current.ahead > 0) summary += ' · ' + UI.toPush + ': ' + current.ahead;
    else if (!current.remoteBranchExists) summary += ' · ' + UI.notOnGitHub;
  }
  byId('pushSummary').textContent = summary;
  byId('pushButton').textContent = current.ahead > 0 ? UI.push + ' (' + current.ahead + ')' : UI.push;
  byId('behindRow').hidden = !(current.remote && current.behind > 0);
  byId('behindText').textContent = UI.behind + ': ' + current.behind;
}

// Branches

function fillBranchSelect(id, branches, fallback, keepPrevious) {
  const select = byId(id);
  const previous = select.value;
  const selected = keepPrevious && branches.some(branch => branch.name === previous) ? previous : fallback;
  select.innerHTML = '';
  for (const branch of branches) {
    const option = document.createElement('option');
    option.value = branch.name;
    option.textContent = branch.name + (branch.isCurrent ? ' (' + UI.active + ')' : '');
    option.selected = branch.name === selected;
    select.appendChild(option);
  }
}

function updateBranchLists(current) {
  const remote = current.branches.filter(branch => branch.isRemote);
  const pullFallback = remote.some(branch => branch.name === current.branch) ? current.branch : current.defaultBranch;
  fillBranchSelect('branchSelect', current.branches, current.branch, false);
  fillBranchSelect('newBranchBase', current.branches, current.branch, true);
  fillBranchSelect('pullSource', remote, pullFallback, true);
}

function deleteSelection() {
  return Array.from(byId('deleteChecklist').querySelectorAll('input')).filter(input => input.checked).map(input => input.dataset.branch);
}

function updateDeleteList(branches, current) {
  const list = byId('deleteChecklist');
  const previous = new Set(deleteSelection());
  list.innerHTML = '';
  const deletable = branches.filter(branch => !branch.isDefault);
  if (!deletable.length) list.appendChild(hint(UI.noBranches));
  for (const branch of deletable) {
    const row = document.createElement('label');
    row.className = 'branch-item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.branch = branch.name;
    input.checked = previous.has(branch.name);
    input.addEventListener('change', renderControls);
    row.append(input, span('', branch.name === current ? branch.name + ' (' + UI.active + ')' : branch.name));
    list.appendChild(row);
  }
}

// Conflicts

function renderConflicts(files) {
  const list = byId('conflictList');
  const previous = new Map(Array.from(list.querySelectorAll('select'), select => [select.dataset.conflict, select.value]));
  list.innerHTML = '';
  for (const file of files) {
    const row = document.createElement('div');
    row.className = 'check-row';
    const select = document.createElement('select');
    select.dataset.conflict = file;
    for (const [value, label] of [['ours', UI.ours], ['theirs', UI.theirs]]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    if (previous.has(file)) select.value = previous.get(file);
    row.append(span('file-name', file), select);
    list.appendChild(row);
  }
}

function updateConflicts(current) {
  byId('conflictPanel').hidden = !current.mergeInProgress;
  byId('pullButton').hidden = current.mergeInProgress;
  if (!current.mergeInProgress) return;
  setBlockOpen('receive', true);
  renderConflicts(current.conflicts);
}

function conflictChoices() {
  const choices = {};
  byId('conflictList').querySelectorAll('select').forEach(select => { choices[select.dataset.conflict] = select.value; });
  return choices;
}

function chooseForAll(side) {
  byId('conflictList').querySelectorAll('select').forEach(select => { select.value = side; });
  runAction('resolveConflicts', { resolutions: conflictChoices() });
}

// State and controls

function updateRepoProblem(current) {
  byId('repoProblem').hidden = !current.error;
  byId('repoProblemText').textContent = current.error || '';
  byId('abortRebaseButton').hidden = !current.rebaseInProgress;
}

function applyState(next) {
  state = next;
  busy = Boolean(next.busy);
  updateRepoProblem(next);
  byId('blocks').hidden = Boolean(next.error);
  if (!next.error) {
    updateChangedFiles(next.changedFiles);
    updatePush(next);
    updateBranchLists(next);
    updateConflicts(next);
    updateDeleteList(next.branches, next.branch);
  }
  renderControls();
}

function renderControls() {
  document.querySelectorAll('button, input, select, textarea').forEach(element => { element.disabled = busy; });
  if (busy || !state || state.error) return;
  fileInputs().forEach(input => { input.disabled = input.dataset.secret === 'true'; });
  updateSelectAll();
  byId('selectAll').disabled = selectableFiles().length === 0;
  byId('commitButton').disabled = checkedFiles().length === 0 || !byId('commitMessage').value.trim();
  byId('pushButton').disabled = !canPush(state);
  byId('pullButton').disabled = !byId('pullSource').value;
  byId('newBranchButton').disabled = !byId('newBranchName').value.trim();
  byId('deleteButton').disabled = deleteSelection().length === 0;
  byId('deleteButton').textContent = UI.deleteButton + (deleteSelection().length ? ' (' + deleteSelection().length + ')' : '');
}

function showNotice(message) {
  const notice = byId('notice');
  notice.hidden = message.level === 'clear';
  if (notice.hidden) return;
  notice.className = 'status-bar status-' + message.level;
  byId('noticeText').textContent = message.text;
  byId('noticeDetails').hidden = !message.details;
  byId('noticeDetails').textContent = message.details || '';
  const action = byId('noticeAction');
  action.hidden = !message.action;
  action.textContent = message.action ? UI[message.action] : '';
  action.dataset.command = message.action || '';
  if (message.clear) byId(message.clear).value = '';
}

// Events

function onClick(event) {
  const commandButton = event.target.closest('[data-command]');
  if (commandButton) {
    event.stopPropagation();
    if (commandButton.dataset.command) runAction(commandButton.dataset.command);
    return;
  }
  const choose = event.target.closest('[data-choose]');
  if (choose) {
    chooseForAll(choose.dataset.choose);
    return;
  }
  const header = event.target.closest('.block-header');
  if (header) toggleBlock(header.dataset.block);
}

function commit() {
  runAction('commit', { message: byId('commitMessage').value, files: checkedFiles() });
}

function createBranch() {
  if (!byId('newBranchName').value.trim()) return;
  runAction('newBranch', { name: byId('newBranchName').value.trim(), baseBranch: byId('newBranchBase').value });
}

function wireControls() {
  document.addEventListener('click', onClick);
  byId('selectAll').addEventListener('change', event => selectAllFiles(event.target.checked));
  byId('commitMessage').addEventListener('input', renderControls);
  byId('commitMessage').addEventListener('keydown', event => { if (event.ctrlKey && event.key === 'Enter' && !byId('commitButton').disabled) commit(); });
  byId('commitButton').addEventListener('click', commit);
  byId('pushButton').addEventListener('click', () => runAction('push'));
  byId('branchSelect').addEventListener('change', event => {
    if (state && event.target.value !== state.branch) runAction('switchBranch', { name: event.target.value });
  });
  byId('newBranchName').addEventListener('input', renderControls);
  byId('newBranchName').addEventListener('keydown', event => { if (event.key === 'Enter') createBranch(); });
  byId('newBranchButton').addEventListener('click', createBranch);
  byId('pullButton').addEventListener('click', () => runAction('pullBranch', { sourceBranch: byId('pullSource').value }));
  byId('resolveButton').addEventListener('click', () => runAction('resolveConflicts', { resolutions: conflictChoices() }));
  byId('deleteButton').addEventListener('click', () => runAction('deleteBranches', { branches: deleteSelection() }));
}

window.addEventListener('message', event => {
  const message = event.data;
  if (message && message.type === 'state') applyState(message.state);
  if (message && message.type === 'notice') showNotice(message);
});

wireControls();
vscode.postMessage({ command: 'ready' });
setInterval(() => {
  if (!busy && document.visibilityState === 'visible') vscode.postMessage({ command: 'refresh' });
}, REFRESH_INTERVAL_MS);
