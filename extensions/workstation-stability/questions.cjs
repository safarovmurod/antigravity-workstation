'use strict';

async function askQuestions(vscode, questions) {
  if (!Array.isArray(questions) || !questions.length || questions.length > 10) throw new Error('Expected 1–10 questions');
  for (const question of questions) {
    if (!question || typeof question.title !== 'string' || !question.title.trim() || question.title.length > 500
      || !Array.isArray(question.options) || question.options.length !== 3
      || question.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 500)
      || new Set(question.options).size !== 3) throw new Error('Each question needs a title and three distinct options');
  }
  const answers = [];
  for (const [index, question] of questions.entries()) {
    const items = question.options.map((label, value) => ({ label, value }));
    items.push({ label: '✎ Свой вариант / Варианти хдт', value: 3 });
    const selected = await vscode.window.showQuickPick(items, {
      title: `${index + 1}/${questions.length} · ${question.title}`, canPickMany: true,
      placeHolder: 'Выбери вариант(ы) галочкой и нажми Enter', ignoreFocusOut: true,
    });
    if (!selected?.length) return { cancelled: true, answers: [] };
    let custom;
    if (selected.some(item => item.value === 3)) {
      custom = await vscode.window.showInputBox({ title: question.title, prompt: 'Свой вариант / Варианти хдт',
        ignoreFocusOut: true, validateInput: value => value.trim() ? undefined : 'Введи свой ответ' });
      if (!custom?.trim()) return { cancelled: true, answers: [] };
    }
    answers.push({ question: question.title, selected: selected.filter(item => item.value !== 3).map(item => item.label), ...(custom ? { custom: custom.trim() } : {}) });
  }
  const text = answers.map(answer => `${answer.question}\n${[...answer.selected, ...(answer.custom ? [answer.custom] : [])].map(value => '- ' + value).join('\n')}`).join('\n\n');
  const action = await vscode.window.showInformationMessage(text, { modal: true }, 'Подтвердить и скопировать');
  if (action !== 'Подтвердить и скопировать') return { cancelled: true, answers: [] };
  await vscode.env.clipboard.writeText(text);
  return { cancelled: false, answers, text, delivery: 'clipboard' };
}

function registerQuestions(vscode, context) {
  context.subscriptions.push(vscode.commands.registerCommand('workstationStability.questions', async questions => {
    try {
      if (!questions) {
        const input = await vscode.window.showInputBox({ title: 'Workstation: вопросы задачи',
          prompt: 'Вставь JSON: [{"title":"Вопрос","options":["Вариант 1","Вариант 2","Вариант 3"]}]', ignoreFocusOut: true });
        if (input === undefined) return { cancelled: true, answers: [] };
        questions = JSON.parse(input);
      }
      const result = await askQuestions(vscode, questions);
      if (!result.cancelled) await vscode.window.showInformationMessage('Ответы скопированы. Вставь их в текущий Gemini-чат и отправь.');
      return result;
    } catch (error) {
      await vscode.window.showErrorMessage('Workstation questions: ' + error.message);
      return { cancelled: true, answers: [], error: error.message };
    }
  }));
}

module.exports = { askQuestions, registerQuestions };
