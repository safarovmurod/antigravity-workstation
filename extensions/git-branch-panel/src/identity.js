'use strict';

// Commits are authored as the GitHub account signed in to the editor, with
// GitHub's private noreply address, so a push never publishes a personal
// email (GitHub error GH007). The identity goes into each repository's own
// config; the global git config is never changed.
const https = require('https');
const { runGit } = require('./git-runner');
const { parseGitHubRemote } = require('./git-state');

const SIGN_IN_SCOPES = ['read:user', 'user:email'];
// A silent lookup only finds a session created with exactly these scopes,
// so the sets used by the editor's own GitHub features are tried as well.
const KNOWN_SCOPE_SETS = [
  SIGN_IN_SCOPES,
  ['repo', 'workflow', 'user:email', 'read:user'],
  ['user:email'],
  ['read:user'],
];
const MEMORY_KEY = 'workstationGithubPanel.repositoryIdentities';
const LOOKUP_TIMEOUT_MS = 8000;
const LOOKUP_RETRY_MS = 5 * 60 * 1000;

function noreplyEmail(id, login) {
  return `${id}+${login}@users.noreply.github.com`;
}

// The editor's GitHub session reports the login as the account label and the
// numeric user id as the account id.
function identityFromSession(session) {
  const login = String(session?.account?.label || '');
  const id = String(session?.account?.id || '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(login) || !/^\d+$/.test(id)) return null;
  return { login, id, name: login, email: noreplyEmail(id, login) };
}

async function findSignedInIdentity(authentication) {
  if (!authentication?.getSession) return null;
  for (const scopes of KNOWN_SCOPE_SETS) {
    try {
      const identity = identityFromSession(await authentication.getSession('github', scopes, { silent: true }));
      if (identity) return identity;
    } catch {
      return null;
    }
  }
  return null;
}

// Public GitHub profile of the repository owner, without a token. Resolves to
// null when GitHub cannot be reached or does not answer in time.
function fetchPublicUser(owner) {
  return new Promise(resolve => {
    const request = https.get(`https://api.github.com/users/${encodeURIComponent(owner)}`,
      { headers: { 'User-Agent': 'git-branch-panel', Accept: 'application/vnd.github+json' }, timeout: LOOKUP_TIMEOUT_MS },
      response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => {
          try { resolve(response.statusCode === 200 ? JSON.parse(body) : null); } catch { resolve(null); }
        });
      });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

// The identity plain `git commit` would use: local config first, then global.
async function hasGitIdentity(cwd) {
  const read = key => runGit(['config', '--get', key], cwd).catch(() => '');
  return Boolean(await read('user.name')) && Boolean(await read('user.email'));
}

async function readLocalIdentity(cwd) {
  const read = key => runGit(['config', '--local', '--get', key], cwd).catch(() => '');
  return { name: await read('user.name'), email: await read('user.email') };
}

// Returns true when the repository config had to be changed.
async function writeLocalIdentity(cwd, identity) {
  const current = await readLocalIdentity(cwd);
  if (current.name === identity.name && current.email === identity.email) return false;
  await runGit(['config', '--local', 'user.name', identity.name], cwd);
  await runGit(['config', '--local', 'user.email', identity.email], cwd);
  return true;
}

// Keeps the GitHub identity used for every repository root, so a project
// keeps its own author even while the editor is signed out.
class RepositoryIdentities {
  constructor(authentication, memory, lookupUser = fetchPublicUser) {
    this.authentication = authentication;
    this.memory = memory;
    this.lookupUser = lookupUser;
    this.signedIn = undefined;
    this.ownerLookups = new Map();
  }

  forgetSession() {
    this.signedIn = undefined;
    this.ownerLookups.clear();
  }

  async currentAccount() {
    if (this.signedIn === undefined) this.signedIn = await findSignedInIdentity(this.authentication);
    return this.signedIn;
  }

  async signIn() {
    if (!this.authentication?.getSession) return null;
    const session = await this.authentication.getSession('github', SIGN_IN_SCOPES, { createIfNone: true });
    this.signedIn = identityFromSession(session);
    return this.signedIn;
  }

  remembered(root) {
    const saved = this.memory?.get(MEMORY_KEY, {}) || {};
    const entry = saved[root];
    return entry ? identityFromSession({ account: { label: entry.login, id: entry.id } }) : null;
  }

  async remember(root, identity) {
    const saved = { ...(this.memory?.get(MEMORY_KEY, {}) || {}) };
    if (saved[root]?.login === identity.login && saved[root]?.id === identity.id) return;
    saved[root] = { login: identity.login, id: identity.id };
    await this.memory?.update(MEMORY_KEY, saved);
  }

  // Used only without a session or a remembered identity: the owner of the
  // github.com origin, when that owner is a person (not an organisation).
  async ownerIdentity(remote) {
    const owner = parseGitHubRemote(remote)?.owner;
    if (!owner) return null;
    // GitHub's answer is kept; an unanswered lookup is retried a little later.
    const cached = this.ownerLookups.get(owner);
    if (cached && (cached.answered || Date.now() - cached.at < LOOKUP_RETRY_MS)) return cached.identity;
    const user = await this.lookupUser(owner).catch(() => null);
    const identity = user?.type === 'User' ? identityFromSession({ account: { label: user.login, id: String(user.id) } }) : null;
    this.ownerLookups.set(owner, { identity, answered: Boolean(user), at: Date.now() });
    return identity;
  }

  // The editor session wins and replaces anything remembered earlier.
  async forRepository(root, remote) {
    const account = await this.currentAccount();
    const identity = account || this.remembered(root) || await this.ownerIdentity(remote);
    if (identity) await this.remember(root, identity);
    return identity;
  }
}

module.exports = {
  noreplyEmail,
  identityFromSession,
  findSignedInIdentity,
  readLocalIdentity,
  writeLocalIdentity,
  hasGitIdentity,
  fetchPublicUser,
  RepositoryIdentities,
  SIGN_IN_SCOPES,
};
