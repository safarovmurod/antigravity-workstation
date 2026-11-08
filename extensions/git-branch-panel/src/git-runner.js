'use strict';

// Runs the real git executable in the background, the same program Git Bash
// uses, so output, errors and Git Credential Manager sign-in match the terminal.
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const LOCAL_TIMEOUT_MS = 30000;
const NETWORK_TIMEOUT_MS = 120000;
const NETWORK_COMMANDS = new Set(['push', 'fetch', 'pull', 'ls-remote']);

let gitPath = 'git';
let log = () => {};

function findGitExecutable(configured) {
  const candidates = [
    ...(Array.isArray(configured) ? configured : [configured]),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
  ];
  return candidates.find(candidate => typeof candidate === 'string' && candidate && fs.existsSync(candidate)) || 'git';
}

function configureGit(options) {
  if (options.executable) gitPath = options.executable;
  if (options.log) log = options.log;
}

class GitError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'GitError';
    this.args = details.args;
    this.stderr = details.stderr;
    this.timedOut = details.timedOut;
    this.notFound = details.notFound;
  }
}

function timeoutFor(args) {
  return NETWORK_COMMANDS.has(args[0]) ? NETWORK_TIMEOUT_MS : LOCAL_TIMEOUT_MS;
}

// Progress lines end in carriage returns and colour codes; keep the text a
// terminal would finally show.
function cleanOutput(text) {
  return String(text || '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .split('\n')
    .map(line => line.split('\r').filter(Boolean).pop() || '')
    .join('\n')
    .trim();
}

function toGitError(args, error, stdout, stderr, timeout) {
  const output = cleanOutput(stderr) || cleanOutput(stdout);
  const timedOut = Boolean(error.killed) && error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
  const notFound = error.code === 'ENOENT';
  let message = output || error.message;
  if (timedOut) message = `git ${args[0]}: no answer within ${Math.round(timeout / 1000)} s`;
  if (notFound) message = `git was not found (${gitPath})`;
  return new GitError(message, { args, stderr: output, timedOut, notFound });
}

// options.raw keeps stdout untouched (needed for -z output); options.env adds
// environment variables for this one command.
function runGit(args, cwd, options = {}) {
  const timeout = options.timeout || timeoutFor(args);
  // Without a terminal, a username prompt would wait until the timeout.
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', ...options.env };
  return new Promise((resolve, reject) => {
    childProcess.execFile(gitPath, args, { cwd, env, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(options.raw ? stdout : String(stdout).trim());
          return;
        }
        const gitError = toGitError(args, error, stdout, stderr, timeout);
        log(`git ${args.join(' ')} => ${gitError.message}`);
        reject(gitError);
      });
  });
}

module.exports = { runGit, configureGit, findGitExecutable, cleanOutput, GitError, LOCAL_TIMEOUT_MS, NETWORK_TIMEOUT_MS };
