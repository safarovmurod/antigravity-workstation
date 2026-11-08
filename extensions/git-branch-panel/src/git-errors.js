'use strict';

const { tr } = require('./text');

// An error meant for the user: a short text, optional git output and an
// optional follow-up button (action) the webview shows next to it.
class PanelError extends Error {
  constructor(text, options = {}) {
    super(text);
    this.name = 'PanelError';
    this.details = options.details || '';
    this.action = options.action || null;
  }
}

const RULES = [
  {
    test: /GH007|push declined due to email privacy/i,
    text: () => tr('GitHub отклонил push: в commits указана твоя личная почта.', 'GitHub rejected the push: the commits contain your private email.'),
    action: 'fixAuthor',
  },
  {
    test: /non-fast-forward|\(fetch first\)|remote contains work that you do not/i,
    text: () => tr('В GitHub есть новые commits этой ветки.', 'GitHub has newer commits on this branch.'),
    action: 'syncBranch',
  },
  {
    test: /Authentication failed|could not read Username|terminal prompts disabled|Permission denied \(publickey\)|returned error: 403/i,
    text: () => tr('GitHub не принял вход. Войди через Git Credential Manager и повтори.', 'GitHub did not accept the sign-in. Sign in with Git Credential Manager and retry.'),
  },
  {
    test: /would be overwritten|Please commit your changes or stash them/i,
    text: () => tr('Мешают изменения без commit. Сначала сделай Commit.', 'Uncommitted changes are in the way. Commit them first.'),
  },
  {
    test: /Could not resolve host|Connection (timed out|refused)|Failed to connect/i,
    text: () => tr('Нет связи с GitHub.', 'GitHub cannot be reached.'),
  },
];

function explainError(error) {
  if (error instanceof PanelError) return { text: error.message, details: error.details, action: error.action };
  const output = String(error?.stderr || error?.message || error || '').trim();
  if (error?.timedOut) {
    return { text: tr('Git не ответил вовремя. Проверь интернет и повтори.', 'Git did not answer in time. Check the connection and retry.'), details: output, action: null };
  }
  if (error?.notFound) {
    return { text: tr('Git не найден. Установи Git for Windows.', 'Git was not found. Install Git for Windows.'), details: output, action: null };
  }
  const rule = RULES.find(item => item.test.test(output));
  if (rule) return { text: rule.text(), details: output, action: rule.action || null };
  return { text: output || tr('Git завершился с ошибкой.', 'Git failed.'), details: '', action: null };
}

module.exports = { PanelError, explainError };
