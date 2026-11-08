'use strict';

const { runGit } = require('../git-runner');
const { collectState, getConflictFiles } = require('../git-state');
const { PanelError } = require('../git-errors');
const { tr } = require('../text');
const { loadReadyState, requireOrigin, requireNoChanges, checkBranchName } = require('./common');

async function fetchOrigin(panel, cwd) {
  panel.progress(tr('Получение данных из GitHub…', 'Fetching from GitHub…'));
  await runGit(['fetch', 'origin', '--prune'], cwd);
}

async function requireRemoteBranch(cwd, branch) {
  try {
    await runGit(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], cwd);
  } catch {
    throw new PanelError(tr(`Ветки "${branch}" нет в GitHub.`, `GitHub has no branch "${branch}".`));
  }
}

// Returns false when git stopped on conflicts; they then show in the panel.
async function mergeFromOrigin(panel, cwd, source) {
  panel.progress(tr(`Объединение с origin/${source}…`, `Merging origin/${source}…`));
  try {
    await runGit(['merge', '--no-edit', `origin/${source}`], cwd);
    return true;
  } catch (error) {
    const conflicts = await getConflictFiles(cwd).catch(() => []);
    if (!conflicts.length) throw error;
    panel.notice('warn', tr(`Конфликт в файлах: ${conflicts.length}. Выбери версию каждого файла ниже.`,
      `Conflicts in ${conflicts.length} file(s). Choose a version for each file below.`));
    return false;
  }
}

// "GitHub has newer commits": fetch and merge the same branch from origin.
async function syncBranch(panel) {
  const cwd = panel.workspaceRoot();
  const state = await loadReadyState(cwd);
  requireOrigin(state);
  requireNoChanges(state);
  await panel.requireIdentity(cwd, state);
  await fetchOrigin(panel, cwd);
  await requireRemoteBranch(cwd, state.branch);
  if (await mergeFromOrigin(panel, cwd, state.branch)) {
    panel.notice('ok', tr('Изменения из GitHub получены.', 'Changes from GitHub received.'));
  }
}

async function pullBranch(panel, request) {
  const cwd = panel.workspaceRoot();
  const state = await loadReadyState(cwd);
  requireOrigin(state);
  requireNoChanges(state);
  const source = await checkBranchName(cwd, request.sourceBranch);
  if (source !== state.branch) {
    const question = tr(`Получить изменения из "${source}" и объединить с "${state.branch}"?`, `Merge the changes from "${source}" into "${state.branch}"?`);
    if (!await panel.confirm(question, tr('Получить', 'Get changes'))) return;
  }
  await panel.requireIdentity(cwd, state);
  await fetchOrigin(panel, cwd);
  await requireRemoteBranch(cwd, source);
  if (await mergeFromOrigin(panel, cwd, source)) {
    panel.notice('ok', tr(`Изменения из "${source}" добавлены в "${state.branch}".`, `Changes from "${source}" were added to "${state.branch}".`));
  }
}

async function useVersion(cwd, file, side) {
  const stage = side === 'ours' ? 2 : 3;
  const exists = await runGit(['cat-file', '-e', `:${stage}:${file}`], cwd).then(() => true, () => false);
  if (!exists) {
    await runGit(['rm', '-f', '--', file], cwd);
    return;
  }
  await runGit(['checkout', side === 'ours' ? '--ours' : '--theirs', '--', file], cwd);
  await runGit(['add', '--', file], cwd);
}

async function resolveConflicts(panel, request) {
  const cwd = panel.workspaceRoot();
  const state = await collectState(cwd);
  if (!state.mergeInProgress) throw new PanelError(tr('Сейчас нет merge.', 'No merge is in progress.'));
  const choices = request.resolutions && typeof request.resolutions === 'object' ? request.resolutions : {};
  if (state.conflicts.some(file => !['ours', 'theirs'].includes(choices[file]))) {
    throw new PanelError(tr('Выбери версию для каждого файла.', 'Choose a version for every file.'));
  }
  await panel.requireIdentity(cwd, state);
  for (const file of state.conflicts) await useVersion(cwd, file, choices[file]);
  const remaining = await getConflictFiles(cwd);
  if (remaining.length) throw new PanelError(tr('Остались конфликты: ', 'Conflicts remain: ') + remaining.join(', '));
  await runGit(['commit', '--no-edit'], cwd);
  panel.notice('ok', tr('Конфликты разрешены.', 'Conflicts resolved.'));
}

async function abortOperation(panel) {
  const cwd = panel.workspaceRoot();
  const state = await collectState(cwd);
  if (state.rebaseInProgress) await runGit(['rebase', '--abort'], cwd);
  else if (state.mergeInProgress) await runGit(['merge', '--abort'], cwd);
  else return;
  panel.notice('ok', tr('Отменено: файлы вернулись к прежнему виду.', 'Cancelled: the files are back as they were.'));
}

module.exports = { syncBranch, pullBranch, resolveConflicts, abortOperation };
