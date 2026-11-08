'use strict';

const fs = require('fs');
const path = require('path');
const { runGit } = require('./git-runner');
const { tr } = require('./text');

const SECRET_PATTERNS = [
  /^\.env$/i, /^\.env\..+$/i,
  /\.pem$/i, /\.key$/i,
  /^id_rsa$/i, /^id_ed25519$/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
];
const SECRET_ALLOWED = [/^\.env\.example$/i];

function checkSecretFiles(files) {
  return files.filter(file => {
    const name = path.basename(file);
    return !SECRET_ALLOWED.some(pattern => pattern.test(name)) && SECRET_PATTERNS.some(pattern => pattern.test(name));
  });
}

// `git status --porcelain -z`: "XY path\0", renames add "\0original path".
function parsePorcelainZ(output) {
  if (!output) return [];
  const entries = output.split('\0').filter(Boolean);
  const files = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry.length <= 3) continue;
    const status = entry.slice(0, 2);
    const file = entry.slice(3);
    const originalFile = /[RC]/.test(status) ? entries[++index] : null;
    const paths = originalFile ? [file, originalFile] : [file];
    files.push({ file, ...(originalFile ? { originalFile } : {}), status, secret: checkSecretFiles(paths).length > 0 });
  }
  return files;
}

function parseGitHubRemote(remote) {
  if (typeof remote !== 'string') return null;
  const match = remote.trim().match(/^(?:https:\/\/(?:[^@/\s]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return match ? { owner: match[1], repository: match[2] } : null;
}

// Commits get the GitHub identity when the project belongs to GitHub or has
// no remote yet; a project on another server keeps its own git config.
function usesGitHubIdentity(remote) {
  return !remote || parseGitHubRemote(remote) !== null;
}

async function readOriginUrl(cwd) {
  // The configured URL, not `remote get-url`, which expands url.insteadOf.
  return runGit(['config', '--get', 'remote.origin.url'], cwd).catch(() => null);
}

async function readRefs(cwd) {
  const output = await runGit(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes/origin'], cwd).catch(() => '');
  const local = new Set();
  const remote = new Set();
  for (const ref of output.split(/\r?\n/).filter(Boolean)) {
    if (ref.startsWith('refs/heads/')) local.add(ref.slice('refs/heads/'.length));
    else if (ref !== 'refs/remotes/origin/HEAD') remote.add(ref.slice('refs/remotes/origin/'.length));
  }
  const originHead = await runGit(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd).catch(() => '');
  return { local, remote, originHead: originHead.replace(/^origin\//, '') };
}

function pickDefaultBranch(refs, currentBranch) {
  if (refs.originHead) return refs.originHead;
  for (const name of ['main', 'master']) {
    if (refs.remote.has(name) || refs.local.has(name)) return name;
  }
  return [...refs.local][0] || currentBranch || 'main';
}

function describeBranches(refs, defaultBranch, currentBranch) {
  const names = [...new Set([...refs.local, ...refs.remote])].sort((a, b) => {
    if (a === defaultBranch) return -1;
    if (b === defaultBranch) return 1;
    return a.localeCompare(b);
  });
  return names.map(name => ({
    name,
    isLocal: refs.local.has(name),
    isRemote: refs.remote.has(name),
    isCurrent: name === currentBranch,
    isDefault: name === defaultBranch || name === 'main' || name === 'master',
  }));
}

async function listBranches(cwd, currentBranch) {
  const refs = await readRefs(cwd);
  const defaultBranch = pickDefaultBranch(refs, currentBranch);
  return { refs, defaultBranch, branches: describeBranches(refs, defaultBranch, currentBranch) };
}

async function getChangedFiles(cwd) {
  // Without optional locks a live refresh never holds index.lock while a
  // commit or switch is running.
  return parsePorcelainZ(await runGit(['--no-optional-locks', 'status', '--porcelain', '-z', '--untracked-files=all'], cwd, { raw: true }));
}

async function getConflictFiles(cwd) {
  const output = await runGit(['diff', '--name-only', '--diff-filter=U', '-z'], cwd, { raw: true });
  return output.split('\0').filter(Boolean);
}

function readOperation(gitDir) {
  return {
    mergeInProgress: fs.existsSync(path.join(gitDir, 'MERGE_HEAD')),
    rebaseInProgress: fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply')),
  };
}

async function countNumber(args, cwd) {
  const value = Number(await runGit(args, cwd).catch(() => '0'));
  return Number.isSafeInteger(value) ? value : 0;
}

// ahead: commits on this computer that GitHub does not have yet;
// behind: commits in origin/<branch> that this branch does not have yet.
async function countAheadBehind(cwd, branch, refs, remote) {
  if (!refs.local.has(branch) || !remote) return { ahead: 0, behind: 0 };
  if (!refs.remote.has(branch)) {
    return { ahead: await countNumber(['rev-list', '--count', 'HEAD', '--not', '--remotes=origin'], cwd), behind: 0 };
  }
  const output = await runGit(['rev-list', '--left-right', '--count', `HEAD...refs/remotes/origin/${branch}`], cwd).catch(() => '0 0');
  const [ahead, behind] = output.split(/\s+/).map(Number);
  return { ahead: ahead || 0, behind: behind || 0 };
}

function emptyState(cwd) {
  return {
    cwd, root: null, gitDir: null, isRepo: false, branch: null, remote: null, isGitHub: false,
    defaultBranch: 'main', branches: [], changedFiles: [], conflicts: [],
    mergeInProgress: false, rebaseInProgress: false,
    hasCommits: false, remoteBranchExists: false, ahead: 0, behind: 0, error: null,
  };
}

async function collectState(cwd) {
  const state = emptyState(cwd);
  if (!cwd) {
    state.error = tr('Открой папку проекта.', 'Open a project folder.');
    return state;
  }
  let location;
  try {
    location = await runGit(['rev-parse', '--show-toplevel', '--absolute-git-dir'], cwd);
  } catch {
    state.error = tr('Эта папка не подключена к Git.', 'This folder is not a Git repository.');
    return state;
  }
  [state.root, state.gitDir] = location.split(/\r?\n/);
  state.isRepo = true;
  Object.assign(state, readOperation(state.gitDir));
  state.branch = await runGit(['branch', '--show-current'], cwd).catch(() => '');
  if (!state.branch) {
    state.error = state.rebaseInProgress
      ? tr('Идёт rebase.', 'A rebase is in progress.')
      : tr('Сейчас не выбрана ни одна ветка (detached HEAD).', 'No branch is checked out (detached HEAD).');
    return state;
  }
  state.remote = await readOriginUrl(cwd);
  state.isGitHub = parseGitHubRemote(state.remote) !== null;
  const { refs, defaultBranch, branches } = await listBranches(cwd, state.branch);
  state.defaultBranch = defaultBranch;
  state.branches = branches;
  state.hasCommits = refs.local.has(state.branch);
  state.remoteBranchExists = refs.remote.has(state.branch);
  state.changedFiles = await getChangedFiles(cwd);
  if (state.mergeInProgress) state.conflicts = await getConflictFiles(cwd).catch(() => []);
  Object.assign(state, await countAheadBehind(cwd, state.branch, refs, state.remote));
  return state;
}

module.exports = {
  checkSecretFiles,
  parsePorcelainZ,
  parseGitHubRemote,
  usesGitHubIdentity,
  readOriginUrl,
  listBranches,
  getChangedFiles,
  getConflictFiles,
  collectState,
};
