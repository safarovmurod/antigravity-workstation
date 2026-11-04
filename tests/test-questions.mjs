import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { askQuestions } = createRequire(import.meta.url)('../extensions/workstation-stability/questions.cjs');
const questions = [{ title: 'Стек?', options: ['Текущий', 'Middle', 'Architect'] }];
function fixture({ cancelPick = false, cancelConfirm = false } = {}) {
  const copied = [];
  return { copied, vscode: { env: { clipboard: { async writeText(value) { copied.push(value); } } }, window: {
    async showQuickPick(items, options) { assert.equal(options.canPickMany, true); return cancelPick ? undefined : [items[0], items[3]]; },
    async showInputBox() { return 'Мой вариант'; },
    async showInformationMessage(_text, options, action) { assert.equal(options.modal, true); return cancelConfirm ? undefined : action; },
  } } };
}
test('Questions retain selected and custom answers and copy only after confirmation', async () => {
  const f = fixture();
  const result = await askQuestions(f.vscode, questions);
  assert.equal(result.cancelled, false);
  assert.deepEqual(result.answers, [{ question: 'Стек?', selected: ['Текущий'], custom: 'Мой вариант' }]);
  assert.deepEqual(f.copied, [result.text]);
  assert.equal(result.delivery, 'clipboard');
});
test('Cancelling either selection or confirmation never delivers partial answers', async () => {
  for (const options of [{ cancelPick: true }, { cancelConfirm: true }]) {
    const f = fixture(options);
    assert.deepEqual(await askQuestions(f.vscode, questions), { cancelled: true, answers: [] });
    assert.deepEqual(f.copied, []);
  }
});
test('Invalid questions fail before any UI opens', async () => {
  for (const invalid of [[], null, [{ title: 'X', options: ['A', 'A', 'B'] }], [{ title: 'X', options: ['A'] }]]) {
    await assert.rejects(askQuestions({}, invalid));
  }
});
