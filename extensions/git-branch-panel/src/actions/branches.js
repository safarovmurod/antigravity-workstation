'use strict';

const { runGit } = require('../git-runner');
const { listBranches } = require('../git-state');
const { PanelError } = require('../git-errors');
const { tr } = require('../text');
const { loadReadyState, checkBranchName } = require('./common');

async function currentBranch(cwd) {
  return runGit(['branch', '--show-current'], cwd).catch(() => '');
}

// Fetching is useful but never required: branches are created, switched and
// deleted offline and in repositories without origin too.
async function tryFetch(cwd, remote) {
  if (!remote) return false;
  return runGit(['fetch', 'origin', '--prune'], cwd).then(() => true, () => false);
}

function requireSavedEditors(panel, cwd) {
  if (panel.hasUnsavedEditors(cwd)) throw new PanelError(tr('Есть несохранённые файлы. Сохрани их (Ctrl+S).', 'Some files are unsaved. Save them (Ctrl+S).'));
}

// Changes that block a branch switch wait in a named stash and come back
// when the user returns to that branch.
const keptChangesName = branch => 'workstation-autostash:' + branch;
const blocksSwitch = message => /overwritten by checkout|local changes|untracked working tree files would be|Please commit your changes or stash them/i.test(message || '');

async function keepChanges(cwd, branch) {
  await runGit(['stash', 'push', '--include-untracked', '-m', keptChangesName(branch)], cwd);
}

async function restoreKeptChanges(cwd, branch) {
  const list = await runGit(['stash', 'list', '--format=%gd%x09%gs'], cwd).catch(() => '');
  const entry = list.split(/\r?\n/).map(line => line.split('\t')).find(([, subject]) => subject && subject.endsWith(': ' + keptChangesName(branch)));
  if (!entry) return 'none';
  return runGit(['stash', 'pop', entry[0]], cwd).then(() => 'restored', () => 'conflict');
}

// The new branch starts from the chosen base and takes the current
// uncommitted changes along.
async function createFromOtherBase(cwd, name, baseRef, hasChanges) {
  if (!hasChanges) {
    await runGit(['switch', '--no-track', '-c', name, baseRef], cwd);
    return;
  }
  await runGit(['stash', 'push', '--include-untracked', '-m', 'workstation-new-branch-' + name], cwd);
  try {
    await runGit(['switch', '--no-track', '-c', name, baseRef], cwd);
  } catch (error) {
    await runGit(['stash', 'pop', '--index'], cwd).catch(() => {});
    throw error;
  }
  try {
    await runGit(['stash', 'pop', '--index'], cwd);
  } catch {
    throw new PanelError(tr(`Ветка "${name}" создана, но изменения конфликтуют с её файлами. Они сохранены в git stash.`,
      `Branch "${name}" was created, but the changes conflict with its files. They are kept in git stash.`));
  }
}

async function newBranch(panel, request) {
  const cwd = panel.workspaceRoot();
  const name = await checkBranchName(cwd, request.name);
  const state = await loadReadyState(cwd);
  requireSavedEditors(panel, cwd);
  panel.progress(tr(`Создание ветки "${name}"…`, `Creating branch "${name}"…`));
  await tryFetch(cwd, state.remote);
  const { branches } = await listBranches(cwd, state.branch);
  if (branches.some(branch => branch.name === name)) throw new PanelError(tr(`Ветка "${name}" уже есть.`, `Branch "${name}" already exists.`));
  const baseName = typeof request.baseBranch === 'string' && request.baseBranch.trim() ? request.baseBranch.trim() : state.branch;
  const base = branches.find(branch => branch.name === baseName);
  if (!base) throw new PanelError(tr(`Ветка "${baseName}" не найдена.`, `Branch "${baseName}" was not found.`));
  if (baseName === state.branch) await runGit(['switch', '-c', name], cwd);
  else await createFromOtherBase(cwd, name, base.isLocal ? baseName : 'origin/' + baseName, state.changedFiles.length > 0);
  if (await currentBranch(cwd) !== name) throw new PanelError(tr('Ветка не создалась.', 'The branch was not created.'));
  panel.notice('ok', tr(`Ветка "${name}" создана из "${baseName}".`, `Branch "${name}" was created from "${baseName}".`), { clear: 'newBranchName' });
}

async function switchWithKeptChanges(cwd, from, run) {
  try {
    await run();
    return false;
  } catch (error) {
    if (!blocksSwitch(error.message)) throw error;
  }
  await keepChanges(cwd, from);
  try {
    await run();
  } catch (error) {
    await restoreKeptChanges(cwd, from);
    throw error;
  }
  return true;
}

// Switching never asks to push first.
async function switchBranch(panel, request) {
  const cwd = panel.workspaceRoot();
  const name = await checkBranchName(cwd, request.name);
  const state = await loadReadyState(cwd);
  if (name === state.branch) return;
  requireSavedEditors(panel, cwd);
  const target = state.branches.find(branch => branch.name === name);
  if (!target) throw new PanelError(tr(`Ветка "${name}" не найдена.`, `Branch "${name}" was not found.`));
  const run = () => target.isLocal
    ? runGit(['switch', name], cwd)
    : runGit(['switch', '--track', '-c', name, `origin/${name}`], cwd);
  panel.progress(tr(`Переключение на "${name}"…`, `Switching to "${name}"…`));
  const kept = await switchWithKeptChanges(cwd, state.branch, run);
  if (await currentBranch(cwd) !== name) throw new PanelError(tr('Ветка не переключилась.', 'The branch was not switched.'));
  const restored = await restoreKeptChanges(cwd, name);
  let text = tr(`Ветка "${name}".`, `Switched to "${name}".`);
  if (kept) text += tr(` Изменения ветки "${state.branch}" отложены до возвращения на неё.`, ` Changes of "${state.branch}" are kept until you return to it.`);
  if (restored === 'restored') text += tr(' Отложенные изменения этой ветки возвращены.', ' The kept changes of this branch are back.');
  if (restored === 'conflict') text += tr(' Отложенные изменения не применились: они в git stash.', ' The kept changes could not be applied: they are in git stash.');
  panel.notice('ok', text);
}

async function validateDeleteNames(cwd, names) {
  if (!Array.isArray(names) || names.length === 0) throw new PanelError(tr('Отметь ветки для удаления.', 'Tick the branches to delete.'));
  const valid = [];
  for (const name of names) {
    if (typeof name !== 'string' || !name || name.startsWith('-')) throw new PanelError(tr('Недопустимое имя ветки.', 'Invalid branch name.'));
    valid.push(await checkBranchName(cwd, name));
  }
  return [...new Set(valid)];
}

async function resolveSha(cwd, ref) {
  return runGit(['rev-parse', '--verify', '--quiet', ref], cwd).catch(() => null);
}

async function remoteSha(cwd, branch) {
  const line = await runGit(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], cwd).catch(() => '');
  const sha = line.trim().split(/\s+/)[0];
  return /^[a-f0-9]{40,64}$/i.test(sha || '') ? sha : null;
}

async function countMissingFrom(cwd, base, sha) {
  if (!base || !sha) return 0;
  const value = Number(await runGit(['rev-list', '--count', `${base}..${sha}`], cwd).catch(() => '0'));
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

async function planDeletion(cwd, names, state, online) {
  const base = await resolveSha(cwd, `refs/remotes/origin/${state.defaultBranch}`) || await resolveSha(cwd, `refs/heads/${state.defaultBranch}`);
  const plan = [];
  for (const branch of names) {
    const local = await resolveSha(cwd, `refs/heads/${branch}`);
    const remote = state.remote && online ? await remoteSha(cwd, branch) : null;
    if (!local && !remote) throw new PanelError(tr(`Ветка "${branch}" не найдена.`, `Branch "${branch}" was not found.`));
    plan.push({ branch, local, remote, localOnly: await countMissingFrom(cwd, base, local), remoteOnly: await countMissingFrom(cwd, base, remote) });
  }
  return plan;
}

function describeDeletion(plan, state, online) {
  const where = item => {
    if (item.local && item.remote) return tr('на компьютере и в GitHub', 'on this computer and in GitHub');
    return item.local ? tr('только на компьютере', 'on this computer only') : tr('только в GitHub', 'in GitHub only');
  };
  const lines = plan.map(item => {
    const unmerged = Math.max(item.localOnly, item.remoteOnly);
    const backup = unmerged ? tr(`; ${unmerged} commit(ов) нет в ${state.defaultBranch} — они сохранятся в резервной копии`, `; ${unmerged} commit(s) not in ${state.defaultBranch} — kept in a backup`) : '';
    return `${item.branch} — ${where(item)}${backup}`;
  });
  if (state.remote && !online) lines.push(tr('GitHub недоступен: удаление только на компьютере.', 'GitHub is unreachable: deleting on this computer only.'));
  return tr('Удалить ветки?\n', 'Delete branches?\n') + lines.join('\n');
}

async function findSafeSwitchTarget(cwd, branchesToDelete) {
  const output = await runGit(['branch', '--format=%(refname:short)'], cwd).catch(() => '');
  const local = output.split(/\r?\n/).map(name => name.trim()).filter(Boolean).filter(name => !branchesToDelete.includes(name));
  return ['main', 'master'].find(name => local.includes(name)) || local[0] || null;
}

// Returns the branch whose changes were kept in git stash, if any.
async function leaveBranch(cwd, branch, names) {
  const target = await findSafeSwitchTarget(cwd, names);
  if (!target) throw new PanelError(tr('Нет другой ветки, на которую можно переключиться. Ничего не удалено.', 'There is no other branch to switch to. Nothing was deleted.'));
  const kept = await switchWithKeptChanges(cwd, branch, () => runGit(['switch', target], cwd));
  if (await currentBranch(cwd) !== target) throw new PanelError(tr(`Переключение на "${target}" не подтвердилось. Ничего не удалено.`, `Switch to "${target}" was not confirmed. Nothing was deleted.`));
  return kept ? branch : '';
}

async function backupUnmerged(cwd, item, stamp, backups) {
  for (const [sha, unmerged] of [[item.local, item.localOnly], [item.remote, item.remoteOnly]]) {
    if (!sha || !unmerged || backups.some(backup => backup.sha === sha)) continue;
    await runGit(['cat-file', '-e', sha + '^{commit}'], cwd);
    const first = `refs/workstation-backup/${item.branch}-${stamp}`;
    const ref = backups.some(backup => backup.ref === first) ? first + '-github' : first;
    await runGit(['update-ref', ref, sha], cwd);
    backups.push({ ref, sha });
  }
}

// The GitHub delete is leased to the commit shown in the confirmation, so a
// newer push by someone else is never removed.
async function deleteOne(cwd, item, stamp, backups) {
  try {
    await backupUnmerged(cwd, item, stamp, backups);
  } catch {
    return tr('резервная копия не создана', 'backup failed');
  }
  if (item.local) {
    try { await runGit(['branch', '-D', '--', item.branch], cwd); } catch (error) { return 'local: ' + error.message; }
  }
  if (!item.remote) return '';
  try {
    await runGit(['push', `--force-with-lease=refs/heads/${item.branch}:${item.remote}`, 'origin', '--delete', '--', item.branch], cwd);
  } catch (error) {
    if (!/remote ref does not exist/.test(error.message)) return 'GitHub: ' + error.message;
  }
  await runGit(['branch', '-dr', `origin/${item.branch}`], cwd).catch(() => {});
  return '';
}

function deletionReport(deleted, failed, backups, keptBranch) {
  let notes = '';
  if (backups.length) notes += tr(' Резервная копия: ', ' Backup: ') + backups.map(backup => backup.ref).join(', ') + '.';
  if (keptBranch) notes += tr(` Изменения ветки "${keptBranch}" сохранены в git stash.`, ` Changes of "${keptBranch}" are kept in git stash.`);
  const done = tr('Удалено: ', 'Deleted: ') + (deleted.join(', ') || tr('нет', 'none'));
  if (!failed.length) return { level: 'ok', text: done + '.' + notes };
  return { level: 'warn', text: done + tr('. Не удалось: ', '. Failed: ') + failed.map(item => `${item.name} (${item.error})`).join('; ') + notes };
}

// One confirmation deletes a branch on this computer and in GitHub. Commits
// the default branch does not have are kept in refs/workstation-backup/ first.
async function deleteBranches(panel, request) {
  const cwd = panel.workspaceRoot();
  const names = await validateDeleteNames(cwd, request.branches);
  const state = await loadReadyState(cwd);
  const forbidden = new Set(['main', 'master', state.defaultBranch]);
  const mainBranch = names.find(name => forbidden.has(name));
  if (mainBranch) throw new PanelError(tr(`Ветку "${mainBranch}" удалять нельзя: это основная ветка.`, `"${mainBranch}" is the main branch and cannot be deleted.`));
  const deletingCurrent = names.includes(state.branch);
  if (deletingCurrent) requireSavedEditors(panel, cwd);
  panel.progress(tr('Подготовка удаления…', 'Preparing deletion…'));
  const online = await tryFetch(cwd, state.remote);
  const plan = await planDeletion(cwd, names, state, online);
  if (!await panel.confirm(describeDeletion(plan, state, online), tr('Удалить', 'Delete'))) return;
  const keptBranch = deletingCurrent ? await leaveBranch(cwd, state.branch, names) : '';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
  const backups = [], deleted = [], failed = [];
  for (const item of plan) {
    const error = await deleteOne(cwd, item, stamp, backups);
    if (error) failed.push({ name: item.branch, error }); else deleted.push(item.branch);
  }
  await tryFetch(cwd, state.remote);
  const report = deletionReport(deleted, failed, backups, keptBranch);
  panel.notice(report.level, report.text);
}

module.exports = { newBranch, switchBranch, deleteBranches, findSafeSwitchTarget };
