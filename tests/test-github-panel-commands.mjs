import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { createRequire } from 'node:module';

// Every panel command is checked against a fake git: the test answers each
// git call and records the exact arguments the panel used.
const require = createRequire(import.meta.url);
const panelRoot = path.resolve(import.meta.dirname, '../extensions/git-branch-panel');
const { GithubPanelProvider, ACTIONS } = require(path.join(panelRoot, 'src/panel-provider.js'));
const { renderHtml } = require(path.join(panelRoot, 'src/webview-html.js'));
const { configureGit } = require(path.join(panelRoot, 'src/git-runner.js'));
const identity = require(path.join(panelRoot, 'src/identity.js'));

const ACCOUNT = { id: '583231', label: 'octocat' };
const NOREPLY = '583231+octocat@users.noreply.github.com';
const GH007 = 'remote: error: GH007: Your push would publish a private email address.\nTo https://github.com/octo/demo.git\n ! [remote rejected] feature -> feature (push declined due to email privacy restrictions)\nerror: failed to push some refs to \'https://github.com/octo/demo.git\'';

function memento() {
  const values = new Map();
  return { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, update: async (key, value) => { values.set(key, value); } };
}

function fakeRepository(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-fake-git-'));
  fs.mkdirSync(path.join(root, '.git'));
  if (options.merging) fs.writeFileSync(path.join(root, '.git/MERGE_HEAD'), 'fixture');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    branch: 'feature',
    remote: 'https://github.com/octocat/demo.git',
    local: ['main', 'feature'],
    remoteBranches: ['main', 'feature'],
    status: ' M app.ts\0?? notes.md\0',
    upstream: 'origin/feature',
    aheadBehind: '1\t0',
    localConfig: {},
    replies: {},
    ...options,
  };
}

const ok = stdout => ({ stdout });
const failed = stderr => ({ code: 1, stderr });

function answer(repo, args) {
  const command = args.join(' ');
  for (const [prefix, reply] of Object.entries(repo.replies)) {
    if (command.startsWith(prefix)) return typeof reply === 'function' ? reply(args) : reply;
  }
  if (command === 'rev-parse --show-toplevel --absolute-git-dir') return ok(`${repo.root}\n${path.join(repo.root, '.git')}\n`);
  if (command === 'branch --show-current') return ok(repo.branch + '\n');
  if (command === 'config --get remote.origin.url') return repo.remote ? ok(repo.remote + '\n') : failed('');
  if (args[0] === 'for-each-ref') return ok([...repo.local.map(name => 'refs/heads/' + name), ...repo.remoteBranches.map(name => 'refs/remotes/origin/' + name)].join('\n'));
  if (args[0] === 'symbolic-ref') return failed('');
  if (args.includes('status')) return ok(repo.status);
  if (command.startsWith('rev-list --left-right --count')) return ok(repo.aheadBehind);
  if (command.startsWith('rev-list --count')) return ok('1');
  if (command === 'rev-parse --abbrev-ref --symbolic-full-name @{u}') return repo.upstream ? ok(repo.upstream) : failed('fatal: no upstream configured for branch');
  if (command.startsWith('config --local --get ')) {
    const value = repo.localConfig[args[3]];
    return value ? ok(value + '\n') : failed('');
  }
  if (command.startsWith('config --local user.')) {
    repo.localConfig[args[2]] = args[3];
    return ok('');
  }
  if (command.startsWith('diff --name-only --diff-filter=U')) return ok(repo.conflicts || '');
  return ok('');
}

function withFakeGit(t, repo) {
  const calls = [];
  configureGit({ executable: 'git' });
  // A second fake in the same test replaces the first one.
  mock.restoreAll();
  mock.method(childProcess, 'execFile', (file, args, options, callback) => {
    calls.push({ file, args, options });
    const reply = answer(repo, args);
    const error = reply.code ? Object.assign(new Error('Command failed: git ' + args.join(' ')), { code: reply.code }) : null;
    setImmediate(() => callback(error, reply.stdout || '', reply.stderr || ''));
  });
  t.after(() => mock.restoreAll());
  return calls;
}

function openPanel(repo, options = {}) {
  const messages = [], prompts = [];
  const vscode = {
    env: { language: options.language || 'ru' },
    authentication: { async getSession() { return options.account === null ? undefined : { account: options.account || ACCOUNT }; } },
    window: { async showWarningMessage(text, _options, button) { prompts.push(text); return options.decline ? undefined : button; } },
    workspace: { workspaceFolders: [{ uri: { fsPath: repo.root } }], textDocuments: [] },
  };
  const provider = new GithubPanelProvider(vscode, { globalState: options.memory || memento() });
  const lookups = [];
  // Never the real network: the public GitHub profile lookup is faked.
  provider.identities.lookupUser = async owner => { lookups.push(owner); return options.owner ? options.owner(owner) : null; };
  provider.resolveWebviewView({ webview: { postMessage: message => messages.push(message), onDidReceiveMessage: () => ({ dispose() {} }) } });
  return { provider, messages, prompts, lookups, send: message => provider.handleMessage(message) };
}

const gitCommands = calls => calls.map(call => call.args.join(' '));
const errors = messages => messages.filter(message => message.type === 'notice' && message.level === 'error');

test('Commit writes the GitHub noreply identity into the repository config and commits only the ticked files', async t => {
  const repo = fakeRepository(t), calls = withFakeGit(t, repo), panel = openPanel(repo);
  await panel.send({ command: 'commit', message: 'Add form', files: ['app.ts'] });
  const commands = gitCommands(calls);
  assert.ok(commands.includes('config --local user.name octocat'));
  assert.ok(commands.includes('config --local user.email ' + NOREPLY));
  assert.ok(commands.includes('add -A -- app.ts'));
  assert.ok(commands.includes('commit --only -m Add form -- app.ts'));
  assert.ok(commands.indexOf('config --local user.email ' + NOREPLY) < commands.indexOf('commit --only -m Add form -- app.ts'), 'identity is set before the commit');
  assert.equal(commands.some(command => /--global/.test(command)), false, 'the global git config is never touched');
  assert.equal(commands.some(command => command.startsWith('push')), false, 'Commit does not push');
  assert.ok(panel.messages.some(message => message.level === 'ok' && message.clear === 'commitMessage'));
});

test('A repository that already has the GitHub identity is not rewritten before a commit', async t => {
  const repo = fakeRepository(t, { localConfig: { 'user.name': 'octocat', 'user.email': NOREPLY } });
  const calls = withFakeGit(t, repo), panel = openPanel(repo);
  await panel.send({ command: 'commit', message: 'Again', files: ['notes.md'] });
  assert.equal(gitCommands(calls).some(command => command.startsWith('config --local user.')), false);
  assert.ok(gitCommands(calls).includes('commit --only -m Again -- notes.md'));
});

test('With no GitHub account, no owner profile and no git identity nothing is committed or pushed and one sign-in message is shown', async t => {
  const repo = fakeRepository(t), calls = withFakeGit(t, repo);
  const panel = openPanel(repo, { account: null, owner: () => ({ login: 'octo', id: 1, type: 'Organization' }) });
  await panel.send({ command: 'commit', message: 'Add form', files: ['app.ts'] });
  await panel.send({ command: 'push' });
  const commands = gitCommands(calls);
  assert.equal(commands.some(command => /^(add|commit|push|config --local user\.)/.test(command)), false);
  assert.deepEqual(errors(panel.messages).map(message => [message.text, message.action]), [['Нужно войти в GitHub.', 'signIn'], ['Нужно войти в GitHub.', 'signIn']]);
});

test('Without a session the repository owner\'s public GitHub profile gives the noreply identity, remembered per repository', async t => {
  const repo = fakeRepository(t), calls = withFakeGit(t, repo), memory = memento();
  const panel = openPanel(repo, { account: null, memory, owner: owner => ({ login: owner, id: 9001, type: 'User' }) });
  await panel.send({ command: 'commit', message: 'Owner', files: ['app.ts'] });
  assert.deepEqual(panel.lookups, ['octocat']);
  const commands = gitCommands(calls);
  assert.ok(commands.includes('config --local user.name octocat'));
  assert.ok(commands.includes('config --local user.email 9001+octocat@users.noreply.github.com'));
  assert.ok(commands.includes('commit --only -m Owner -- app.ts'));
  assert.deepEqual(memory.get('workstationGithubPanel.repositoryIdentities', {})[repo.root], { login: 'octocat', id: '9001', owner: 'octocat' });
  const later = openPanel(repo, { account: ACCOUNT, memory });
  await later.send({ command: 'commit', message: 'Session', files: ['app.ts'] });
  assert.ok(gitCommands(calls).includes('config --local user.email ' + NOREPLY), 'the owner signed in to the editor gives the account id');
  assert.deepEqual(later.lookups, []);
});

test('An organisation owner or an offline lookup falls back to the existing git identity without writing config', async t => {
  for (const owner of [() => ({ login: 'octo', id: 1, type: 'Organization' }), () => null]) {
    const repo = fakeRepository(t, { replies: { 'config --get user.': ok('Existing Person\n') } });
    const calls = withFakeGit(t, repo), panel = openPanel(repo, { account: null, owner });
    await panel.send({ command: 'commit', message: 'Plain', files: ['app.ts'] });
    await panel.send({ command: 'push' });
    const commands = gitCommands(calls);
    assert.deepEqual(errors(panel.messages), []);
    assert.equal(commands.some(command => command.startsWith('config --local user.')), false);
    assert.ok(commands.includes('commit --only -m Plain -- app.ts'));
    assert.ok(commands.includes('push origin feature'));
  }
});

test('Signing in from the panel uses the editor GitHub session and then allows the commit', async t => {
  const repo = fakeRepository(t), calls = withFakeGit(t, repo);
  const requests = [];
  const vscode = {
    env: { language: 'ru' },
    authentication: { async getSession(id, scopes, options) { requests.push([id, options]); return options.createIfNone ? { account: ACCOUNT } : undefined; } },
    window: { async showWarningMessage(_text, _options, button) { return button; } },
    workspace: { workspaceFolders: [{ uri: { fsPath: repo.root } }] },
  };
  const messages = [], provider = new GithubPanelProvider(vscode, { globalState: memento() });
  provider.identities.lookupUser = async () => null;
  provider.resolveWebviewView({ webview: { postMessage: message => messages.push(message), onDidReceiveMessage: () => ({ dispose() {} }) } });
  await provider.handleMessage({ command: 'signIn' });
  assert.ok(requests.some(([id, options]) => id === 'github' && options.createIfNone === true));
  await provider.handleMessage({ command: 'commit', message: 'Signed', files: ['app.ts'] });
  assert.ok(gitCommands(calls).includes('config --local user.email ' + NOREPLY));
});

test('Push runs only git push for the current branch and sets the upstream on the first push', async t => {
  const repo = fakeRepository(t, { upstream: '', remoteBranches: ['main'] }), calls = withFakeGit(t, repo), panel = openPanel(repo);
  await panel.send({ command: 'push' });
  assert.ok(gitCommands(calls).includes('push -u origin feature'));
  assert.equal(gitCommands(calls).some(command => /^(add|commit)\b/.test(command)), false, 'Push does not commit');
  const tracked = fakeRepository(t), trackedCalls = withFakeGit(t, tracked);
  await openPanel(tracked).send({ command: 'push' });
  assert.ok(gitCommands(trackedCalls).includes('push origin feature'));
});

test('Git runs hidden, with a timeout and without waiting for a terminal password prompt', async t => {
  const repo = fakeRepository(t), calls = withFakeGit(t, repo);
  await openPanel(repo).send({ command: 'push' });
  const push = calls.find(call => call.args[0] === 'push');
  assert.equal(push.options.windowsHide, true);
  assert.equal(push.options.env.GIT_TERMINAL_PROMPT, '0');
  assert.ok(push.options.timeout >= 60000);
  assert.ok(calls.find(call => call.args[0] === 'branch').options.timeout <= 30000);
});

test('A failed push shows the exact reason git printed, never a generic text', async t => {
  const stderr = "fatal: unable to access 'https://github.com/octo/demo.git/': The requested URL returned error: 500";
  const repo = fakeRepository(t, { replies: { 'push ': failed(stderr) } }), panel = openPanel(repo);
  withFakeGit(t, repo);
  await panel.send({ command: 'push' });
  const [error] = errors(panel.messages);
  assert.equal(error.text, stderr);
  assert.doesNotMatch(JSON.stringify(panel.messages), /Failed to execute git/);
});

test('GH007 is explained in Russian with one button that fixes the author', async t => {
  const repo = fakeRepository(t, { replies: { 'push ': failed(GH007) } }), panel = openPanel(repo);
  withFakeGit(t, repo);
  await panel.send({ command: 'push' });
  const [error] = errors(panel.messages);
  assert.equal(error.text, 'GitHub отклонил push: в commits указана твоя личная почта.');
  assert.equal(error.action, 'fixAuthor');
  assert.match(error.details, /GH007/);
});

test('Fix author rewrites only the commits GitHub does not have, after confirmation, and pushes again', async t => {
  const repo = fakeRepository(t, { replies: {
    'rev-list HEAD --not --remotes=origin': ok('c2\nc1\n'),
    'merge-base HEAD refs/remotes/origin/feature': ok('base0\n'),
    'rev-list base0..HEAD': ok('c2\nc1\n'),
    'rev-list --merges': ok(''),
  } });
  const calls = withFakeGit(t, repo), panel = openPanel(repo);
  await panel.send({ command: 'fixAuthor' });
  const commands = gitCommands(calls);
  assert.match(panel.prompts[0], /2 commit/);
  assert.ok(commands.includes('fetch origin --prune'));
  assert.ok(commands.includes('rebase --autostash base0 --exec git commit --amend --reset-author --no-edit --no-verify --allow-empty'));
  assert.ok(commands.indexOf('config --local user.email ' + NOREPLY) < commands.findIndex(command => command.startsWith('rebase')));
  assert.ok(commands.indexOf('push origin feature') > commands.findIndex(command => command.startsWith('rebase')));
});

test('Fix author refuses when a commit in the range is already on GitHub and changes nothing when cancelled', async t => {
  const replies = {
    'rev-list HEAD --not --remotes=origin': ok('c2\n'),
    'merge-base HEAD refs/remotes/origin/feature': ok('base0\n'),
    'rev-list base0..HEAD': ok('c2\nc1\n'),
    'rev-list --merges': ok(''),
  };
  const repo = fakeRepository(t, { replies }), calls = withFakeGit(t, repo), panel = openPanel(repo);
  await panel.send({ command: 'fixAuthor' });
  assert.match(errors(panel.messages)[0].text, /нельзя исправить автоматически/);
  assert.equal(gitCommands(calls).some(command => /^(rebase|push)/.test(command)), false);
  const same = fakeRepository(t, { replies: { ...replies, 'rev-list HEAD --not --remotes=origin': ok('c2\nc1\n') } });
  const cancelledCalls = withFakeGit(t, same);
  await openPanel(same, { decline: true }).send({ command: 'fixAuthor' });
  assert.equal(gitCommands(cancelledCalls).some(command => /^(rebase|push)/.test(command)), false);
});

test('A failed author rewrite is aborted so the branch stays as it was', async t => {
  const repo = fakeRepository(t, { replies: {
    'rev-list HEAD --not --remotes=origin': ok('c1\n'),
    'merge-base HEAD': ok('base0\n'),
    'rev-list base0..HEAD': ok('c1\n'),
    'rev-list --merges': ok(''),
    'rebase --autostash': failed('error: could not apply c1'),
  } });
  const calls = withFakeGit(t, repo), panel = openPanel(repo);
  await panel.send({ command: 'fixAuthor' });
  assert.ok(gitCommands(calls).includes('rebase --abort'));
  assert.equal(gitCommands(calls).some(command => command.startsWith('push')), false);
  assert.match(errors(panel.messages)[0].details, /could not apply/);
});

test('A push rejected because GitHub is ahead offers Get and merge, which fetches and merges the same branch', async t => {
  const rejected = ' ! [rejected]        feature -> feature (fetch first)\nerror: failed to push some refs';
  const repo = fakeRepository(t, { status: '', replies: { 'push ': failed(rejected) } });
  const calls = withFakeGit(t, repo), panel = openPanel(repo);
  await panel.send({ command: 'push' });
  assert.equal(errors(panel.messages)[0].action, 'syncBranch');
  await panel.send({ command: 'syncBranch' });
  const commands = gitCommands(calls);
  assert.ok(commands.includes('fetch origin --prune'));
  assert.ok(commands.includes('merge --no-edit origin/feature'));
});

test('Get changes fetches and merges the chosen GitHub branch after confirmation', async t => {
  const repo = fakeRepository(t, { status: '' }), calls = withFakeGit(t, repo), panel = openPanel(repo);
  await panel.send({ command: 'pullBranch', sourceBranch: 'main' });
  assert.match(panel.prompts[0], /"main"/);
  assert.ok(gitCommands(calls).includes('merge --no-edit origin/main'));
});

test('Uncommitted changes stop Get changes before git merges anything', async t => {
  const repo = fakeRepository(t), calls = withFakeGit(t, repo), panel = openPanel(repo);
  await panel.send({ command: 'syncBranch' });
  assert.equal(errors(panel.messages)[0].text, 'Сначала сделай Commit своих изменений.');
  assert.equal(gitCommands(calls).some(command => command.startsWith('merge')), false);
});

test('Conflicts are resolved per file and the merge is committed; Cancel runs merge --abort', async t => {
  const repo = fakeRepository(t, { merging: true, conflicts: 'app.ts\0' }), calls = withFakeGit(t, repo), panel = openPanel(repo);
  repo.replies['diff --name-only --diff-filter=U'] = () => { const reply = ok(repo.conflicts); repo.conflicts = ''; return reply; };
  await panel.send({ command: 'resolveConflicts', resolutions: { 'app.ts': 'theirs' } });
  const commands = gitCommands(calls);
  assert.ok(commands.includes('checkout --theirs -- app.ts'));
  assert.ok(commands.includes('add -- app.ts'));
  assert.ok(commands.includes('commit --no-edit'));
  await panel.send({ command: 'abortOperation' });
  assert.ok(gitCommands(calls).includes('merge --abort'));
});

test('Branch commands run switch -c, switch and a leased delete', async t => {
  const repo = fakeRepository(t, { status: '', replies: {
    'rev-parse --verify --quiet refs/heads/old': ok('a'.repeat(40)),
    'ls-remote --heads origin refs/heads/old': ok('b'.repeat(40) + '\trefs/heads/old'),
  } });
  repo.local.push('old');
  repo.remoteBranches.push('old');
  const calls = withFakeGit(t, repo), panel = openPanel(repo);
  repo.replies['branch --show-current'] = () => ok(repo.branch);
  repo.replies['switch -c'] = args => { repo.branch = args[2]; return ok(''); };
  await panel.send({ command: 'newBranch', name: 'day-2' });
  assert.ok(gitCommands(calls).includes('switch -c day-2'));
  repo.replies['switch main'] = () => { repo.branch = 'main'; return ok(''); };
  await panel.send({ command: 'switchBranch', name: 'main' });
  assert.ok(gitCommands(calls).includes('switch main'));
  await panel.send({ command: 'deleteBranches', branches: ['old'] });
  const commands = gitCommands(calls);
  assert.ok(commands.includes('branch -D -- old'));
  assert.ok(commands.includes(`push --force-with-lease=refs/heads/old:${'b'.repeat(40)} origin --delete -- old`));
});

test('The refresh button fetches from GitHub', async t => {
  const repo = fakeRepository(t), calls = withFakeGit(t, repo);
  await openPanel(repo).send({ command: 'fetch' });
  assert.ok(gitCommands(calls).includes('fetch origin --prune'));
});

test('Opening a GitHub repository writes its identity once; another server keeps its own git config', async t => {
  const repo = fakeRepository(t), calls = withFakeGit(t, repo), panel = openPanel(repo);
  await panel.send({ command: 'ready' });
  await panel.send({ command: 'refresh' });
  assert.equal(gitCommands(calls).filter(command => command === 'config --local user.email ' + NOREPLY).length, 1);
  assert.equal(panel.messages.filter(message => message.type === 'state').length, 2);
  const gitlab = fakeRepository(t, { remote: 'https://gitlab.com/octo/demo.git' }), gitlabCalls = withFakeGit(t, gitlab), other = openPanel(gitlab);
  await other.send({ command: 'ready' });
  await other.send({ command: 'commit', message: 'Mine', files: ['app.ts'] });
  assert.equal(gitCommands(gitlabCalls).some(command => command.startsWith('config --local user.')), false);
  assert.ok(gitCommands(gitlabCalls).includes('commit --only -m Mine -- app.ts'));
});

test('Each repository remembers its own author with the owner it belongs to, also while the editor is signed out', async () => {
  const memory = memento(), accounts = [{ id: '1', label: 'first' }, { id: '2', label: 'second' }, null];
  let current = 0;
  const identities = new identity.RepositoryIdentities({ async getSession() { return accounts[current] ? { account: accounts[current] } : undefined; } }, memory, async () => null);
  const one = 'https://github.com/first/one.git', two = 'https://github.com/second/two.git';
  assert.equal((await identities.forRepository('C:/one', one)).email, '1+first@users.noreply.github.com');
  current = 1; identities.forgetSession();
  assert.equal((await identities.forRepository('C:/two', two)).email, '2+second@users.noreply.github.com');
  current = 2; identities.forgetSession();
  assert.equal((await identities.forRepository('C:/one', one)).login, 'first');
  assert.equal((await identities.forRepository('C:/two', two)).login, 'second');
  assert.equal(await identities.forRepository('C:/never-opened', 'https://github.com/unknown/x.git'), null);
  // The origin moved to another owner: the previous person is not carried over.
  assert.equal(await identities.forRepository('C:/one', 'https://github.com/second/one.git'), null);
  assert.equal(await identities.forRepository('C:/one', null), null, 'a project without origin has no GitHub author');
  assert.equal(await identities.forRepository('C:/one', 'https://gitlab.com/first/one.git'), null);
  assert.equal(identity.identityFromSession({ account: { id: 'not-a-number', label: 'octocat' } }), null);
});

test('The repository owner is the author even when another account is signed in to the editor', async t => {
  const repo = fakeRepository(t), calls = withFakeGit(t, repo);
  const panel = openPanel(repo, { account: { id: '77', label: 'someone-else' }, owner: owner => ({ login: owner, id: 583231, type: 'User' }) });
  await panel.send({ command: 'commit', message: 'Mine', files: ['app.ts'] });
  const commands = gitCommands(calls);
  assert.deepEqual(panel.lookups, ['octocat']);
  assert.ok(commands.includes('config --local user.name octocat'));
  assert.ok(commands.includes('config --local user.email ' + NOREPLY));
  assert.equal(commands.some(command => /someone-else/.test(command)), false, 'the editor account never becomes the author of the owner\'s repository');
  assert.deepEqual(panel.messages.filter(message => message.type === 'author').at(-1).author, { name: 'octocat', source: 'owner' });
  await panel.send({ command: 'refresh' });
  assert.deepEqual(panel.lookups, ['octocat'], 'the owner is looked up once');
});

test('In an organisation repository the editor account is the author; offline with another account nothing is written', async t => {
  const org = fakeRepository(t, { remote: 'https://github.com/acme-team/site.git' }), orgCalls = withFakeGit(t, org);
  const member = openPanel(org, { owner: owner => ({ login: owner, id: 5, type: 'Organization' }) });
  await member.send({ command: 'commit', message: 'Team', files: ['app.ts'] });
  assert.ok(gitCommands(orgCalls).includes('config --local user.email ' + NOREPLY));
  assert.deepEqual(member.messages.filter(message => message.type === 'author').at(-1).author, { name: 'octocat', source: 'account' });
  const repo = fakeRepository(t, { replies: { 'config --get user.': ok('Existing Person\n') } }), calls = withFakeGit(t, repo);
  const offline = openPanel(repo, { account: { id: '77', label: 'someone-else' }, owner: () => null });
  await offline.send({ command: 'commit', message: 'Offline', files: ['app.ts'] });
  assert.equal(gitCommands(calls).some(command => command.startsWith('config --local user.')), false);
  assert.ok(gitCommands(calls).includes('commit --only -m Offline -- app.ts'));
  assert.deepEqual(offline.messages.filter(message => message.type === 'author').at(-1).author, { name: 'Existing Person', source: 'git' });
});

test('A project that is not connected to GitHub is never written to and commits with git\'s own identity', async t => {
  const repo = fakeRepository(t, { remote: null, remoteBranches: [], upstream: '', replies: { 'config --get user.': ok('Local Person\n') } });
  const calls = withFakeGit(t, repo), panel = openPanel(repo);
  await panel.send({ command: 'ready' });
  await panel.send({ command: 'commit', message: 'Local', files: ['app.ts'] });
  const commands = gitCommands(calls);
  assert.equal(commands.some(command => /^config --local user\./.test(command)), false, 'no identity is written without a GitHub origin');
  assert.ok(commands.includes('commit --only -m Local -- app.ts'));
  assert.deepEqual(panel.lookups, []);
  assert.deepEqual(panel.messages.filter(message => message.type === 'author').at(-1).author, { name: 'Local Person', source: 'git' });
  await panel.send({ command: 'push' });
  assert.match(errors(panel.messages).at(-1).text, /не подключён к GitHub/);
  const empty = fakeRepository(t, { remote: null, remoteBranches: [], upstream: '', replies: { 'config --get user.': failed('') } });
  const emptyCalls = withFakeGit(t, empty), unnamed = openPanel(empty);
  await unnamed.send({ command: 'commit', message: 'Nobody', files: ['app.ts'] });
  assert.equal(gitCommands(emptyCalls).some(command => /^(add|commit|config --local user\.)/.test(command)), false);
  assert.match(errors(unnamed.messages).at(-1).text, /не подключён к GitHub.*user\.name/);
  assert.equal(errors(unnamed.messages).at(-1).action, null, 'signing in cannot name a project that has no repository');
  assert.deepEqual(unnamed.messages.filter(message => message.type === 'author').at(-1).author, { name: '', source: 'none' });
});

test('A command the panel ignores still answers with state, so the buttons never stay locked', async t => {
  const repo = fakeRepository(t); withFakeGit(t, repo);
  const panel = openPanel(repo);
  await panel.send({ command: 'no-such-command' });
  assert.equal(panel.messages.filter(message => message.type === 'state').length, 1);
});

test('No Pull Request or Prettier path exists and Commit and Push are separate buttons', () => {
  assert.deepEqual(Object.keys(ACTIONS).sort(), ['abortOperation', 'commit', 'deleteBranches', 'fetch', 'fixAuthor', 'newBranch', 'pullBranch', 'push', 'resolveConflicts', 'signIn', 'switchBranch', 'syncBranch']);
  const html = renderHtml();
  assert.match(html, /id="commitButton"[^>]*>Commit</);
  assert.match(html, /id="pushButton"[^>]*>Push</);
  const files = ['extension.js', ...require(path.join(panelRoot, 'package.json')).files.filter(file => /\.(js|css)$/.test(file))];
  for (const file of files) {
    const source = fs.readFileSync(path.join(panelRoot, file), 'utf8');
    assert.doesNotMatch(source, /pull request|pullRequest|openExternal|\/compare\/|prettier|formatBeforeCommit|executeFormatDocumentProvider/i, file);
    assert.doesNotMatch(source, /getAPI\(|vscode\.git|\.gif|\.mp4/, file);
  }
  for (const text of ['GitHub подключён', 'нет изменений', 'Автор:']) assert.equal(html.includes(text), false, text);
});
