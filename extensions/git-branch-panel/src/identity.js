'use strict';

// Commits in a GitHub repository are authored as the owner of that repository
// (the account in the origin address), with GitHub's private noreply address,
// so a push never publishes a personal email (GitHub error GH007) and another
// account signed in to the editor never becomes the author. The identity goes
// into the repository's own config; the global git config is never changed,
// and a project without a GitHub origin is never written to.
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

const sameLogin = (left, right) => String(left || '').toLowerCase() === String(right || '').toLowerCase();

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

// The author name plain `git commit` would use, or '' when none is set.
async function readGitUserName(cwd) {
  return runGit(['config', '--get', 'user.name'], cwd).catch(() => '');
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

// Finds the author for a repository root and remembers it together with the
// owner it belongs to, so a project keeps its own author offline and an
// origin that moved to another owner never keeps the previous person.
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

  remembered(root, owner) {
    const saved = this.memory?.get(MEMORY_KEY, {}) || {};
    const entry = saved[root];
    if (!entry || !sameLogin(entry.owner, owner)) return null;
    return identityFromSession({ account: { label: entry.login, id: entry.id } });
  }

  async remember(root, owner, identity) {
    const saved = { ...(this.memory?.get(MEMORY_KEY, {}) || {}) };
    const entry = saved[root];
    if (entry?.login === identity.login && entry?.id === identity.id && entry?.owner === owner) return;
    saved[root] = { login: identity.login, id: identity.id, owner };
    await this.memory?.update(MEMORY_KEY, saved);
  }

  // The owner's public profile: { identity, answered }. identity is set only
  // for a person; an organisation has no noreply address of its own.
  async ownerProfile(owner) {
    // GitHub's answer is kept; an unanswered lookup is retried a little later.
    const cached = this.ownerLookups.get(owner);
    if (cached && (cached.answered || Date.now() - cached.at < LOOKUP_RETRY_MS)) return cached;
    const user = await this.lookupUser(owner).catch(() => null);
    const identity = user?.type === 'User' ? identityFromSession({ account: { label: user.login, id: String(user.id) } }) : null;
    const profile = { identity, answered: Boolean(user), at: Date.now() };
    this.ownerLookups.set(owner, profile);
    return profile;
  }

  // The author for a repository on github.com, or null when git's own
  // identity stays in use. source: 'owner' is the repository owner, 'account'
  // is the editor account (the owner is an organisation).
  async forRepository(root, remote) {
    const owner = parseGitHubRemote(remote)?.owner;
    if (!owner) return null;
    const found = await this.findAuthor(root, owner);
    if (!found) return null;
    await this.remember(root, owner, found.identity);
    return { ...found.identity, source: found.source };
  }

  async findAuthor(root, owner) {
    const account = await this.currentAccount();
    if (account && sameLogin(account.login, owner)) return { identity: account, source: 'owner' };
    const saved = this.remembered(root, owner);
    if (saved && sameLogin(saved.login, owner)) return { identity: saved, source: 'owner' };
    const profile = await this.ownerProfile(owner);
    if (profile.identity) return { identity: profile.identity, source: 'owner' };
    // An organisation cannot author commits: the editor account is the person.
    const person = profile.answered ? account || saved : saved;
    return person ? { identity: person, source: 'account' } : null;
  }
}

module.exports = {
  noreplyEmail,
  identityFromSession,
  findSignedInIdentity,
  readLocalIdentity,
  writeLocalIdentity,
  hasGitIdentity,
  readGitUserName,
  fetchPublicUser,
  RepositoryIdentities,
  SIGN_IN_SCOPES,
};
