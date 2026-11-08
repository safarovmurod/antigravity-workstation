'use strict';

const { runGit } = require('../git-runner');
const { collectState } = require('../git-state');
const { PanelError } = require('../git-errors');
const { tr } = require('../text');

// State for an action that changes the repository: a branch is checked out
// and no merge or rebase is waiting to be finished.
async function loadReadyState(cwd) {
  const state = await collectState(cwd);
  if (state.error) throw new PanelError(state.error);
  if (state.mergeInProgress) throw new PanelError(tr('Сначала разреши конфликты или отмени merge.', 'Resolve the conflicts or cancel the merge first.'));
  if (state.rebaseInProgress) throw new PanelError(tr('Сначала отмени rebase.', 'Cancel the rebase first.'));
  return state;
}

function requireOrigin(state) {
  if (!state.remote) throw new PanelError(tr('Проект не подключён к GitHub (нет origin).', 'The project is not connected to GitHub (no origin).'));
}

function requireNoChanges(state) {
  if (state.changedFiles.length) throw new PanelError(tr('Сначала сделай Commit своих изменений.', 'Commit your changes first.'));
}

async function checkBranchName(cwd, name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().startsWith('-')) {
    throw new PanelError(tr('Укажи имя ветки.', 'Enter a branch name.'));
  }
  const trimmed = name.trim();
  try {
    await runGit(['check-ref-format', '--branch', trimmed], cwd);
  } catch {
    throw new PanelError(tr(`Недопустимое имя ветки: "${trimmed}"`, `Invalid branch name: "${trimmed}"`));
  }
  return trimmed;
}

module.exports = { loadReadyState, requireOrigin, requireNoChanges, checkBranchName };
