'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/feature-guides');
const clips = [
  ['current-branch', 'Текущая ветка', ['Открой Explorer → GitHub в Git-проекте.', 'Текущая ветка показывает, где сохраняются твои commits.', 'Проверь маршрут push: origin и имя ветки. Файлы не меняются.']],
  ['new-branch', 'Новая ветка', ['Выбери основу и введи уникальное имя новой ветки.', 'Создай ветку: Git переключит работу на неё.', 'Новые commits попадут в новую ветку. Исходная ветка сохранится.']],
  ['switch-branch', 'Переключить ветку', ['Выбери существующую ветку в панели.', 'Перед переключением проверь несохранённые изменения.', 'Git обновит файлы под выбранную ветку. Проверь её имя сверху.']],
  ['get-changes', 'Получить изменения', ['В блоке «Получить изменения» выбери исходную ветку.', 'Панель загрузит её из origin и объединит с текущей.', 'При конфликте проверь каждый файл. Затем проверь результат и тесты.']],
  ['pull-request', 'Pull Request: предложить объединение', ['Выбери: из текущей ветки → в целевую ветку.', 'Открой создание Pull Request. Откроется страница GitHub.', 'Проверь diff и создай запрос. Сам запрос ещё не объединяет код.']],
  ['delete-branch', 'Удалить ветку', ['Выбери ненужную ветку. Сначала сохрани нужные commits.', 'Проверь имя и тип удаления в подтверждении.', 'Подтверди только правильную ветку. Проверь обновлённый список.']],
  ['stability', 'Workstation Stability', ['Открой View → Output → Workstation Antigravity Stability.', 'Расширение применяет профиль и показывает конфликты настроек.', 'Нажми Workstation в status bar: отчёт укажет scope и файл конфликта.']],
  ['calm-typescript', 'Calm TypeScript', ['Открой JavaScript/TypeScript файл с ошибкой типа.', 'Диагностика остаётся: оформление спокойнее, обычные подсказки работают.', 'Settings → Extensions → Calm TypeScript: настрой эффекты; Reset вернёт сохранённые значения.']],
];
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-guides-'));
try {
  for (const [name, title, steps] of clips) {
    const frames = [];
    for (let index = 0; index < steps.length; index++) {
      const words = steps[index].split(' '), lines = [''];
      for (const word of words) {
        if ((lines.at(-1) + word).length > 44) lines.push('');
        lines[lines.length - 1] += word + ' ';
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#282c34"/><rect x="30" y="30" width="900" height="480" rx="20" fill="#21252b"/><g font-family="DejaVu Sans" fill="#abb2bf"><text x="65" y="82" font-size="17">ANTIGRAVITY · АНИМИРОВАННАЯ ИНСТРУКЦИЯ</text><text x="65" y="145" font-size="29" fill="#c6a0f6">${escape(title)}</text><text x="65" y="210" font-size="22" fill="#7dd3fc">ШАГ ${index + 1} / 3</text>${lines.map((line, n) => `<text x="65" y="${275 + n * 42}" font-size="26">${escape(line.trim())}</text>`).join('')}<text x="65" y="470" font-size="16">Схема действий · не запись экрана IDE</text></g></svg>`;
      const source = path.join(temporary, name + index + '.svg');
      const frame = path.join(temporary, name + index + '.png');
      fs.writeFileSync(source, svg);
      execFileSync('convert', ['-size', '960x540', 'xc:#21252b', '-font', 'DejaVu-Sans', '-fill', '#abb2bf', '-pointsize', '17', '-annotate', '+65+82', 'ANTIGRAVITY · АНИМИРОВАННАЯ ИНСТРУКЦИЯ', '-fill', '#c6a0f6', '-pointsize', '29', '-annotate', '+65+145', title, '-fill', '#7dd3fc', '-pointsize', '22', '-annotate', '+65+210', `ШАГ ${index + 1} / 3`, '-fill', '#abb2bf', '-pointsize', '26', ...lines.flatMap((line, n) => ['-annotate', `+65+${275 + n * 42}`, line.trim()]), '-pointsize', '16', '-annotate', '+65+470', 'Схема действий · не запись экрана IDE', frame]);
      frames.push(frame);
    }
    const gif = path.join(output, name + '.gif');
    execFileSync('convert', ['-delay', '350', ...frames, '-loop', '0', gif]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', gif, '-t', '10.5', '-vf', 'fps=12,format=yuv420p', '-movflags', '+faststart', path.join(output, name + '.mp4')]);
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log('Built ' + clips.length + ' instructional GIF/MP4 pairs.');
