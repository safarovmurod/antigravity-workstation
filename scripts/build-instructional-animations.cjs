'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const guides = [
  { id: 'current-branch', title: 'Текущая ветка', steps: [
    ['Explorer → GitHub', 'Открой блок «Текущая ветка».', 'Панель только читает состояние Git.'],
    ['Ветка: feature/login', 'Проверь имя активной ветки.', 'Новые commits создаются здесь.'],
    ['Push → origin/feature/login', 'Проверь маршрут перед Push.', 'Сам просмотр не меняет файлы.']
  ] },
  { id: 'new-branch', title: 'Новая ветка', steps: [
    ['Из ветки: main', 'Выбери основу для новой ветки.', 'Рабочая директория должна быть чистой.'],
    ['Имя: feature/login', 'Введи уникальное имя ветки.', 'Имя проверяется до создания.'],
    ['Создать и отправить', 'Нажми «Создать и отправить».', 'Панель создаёт ветку и делает push в origin.'],
    ['Активна: feature/login', 'Проверь сообщение и origin.', 'При ошибке push ветка останется локальной.']
  ] },
  { id: 'switch-branch', title: 'Переключить ветку', steps: [
    ['Переключить ветку', 'Открой список и выбери ветку.', 'Имя текущей ветки отмечено как активное.'],
    ['Несохранённый редактор', 'Сначала сохрани открытые файлы.', 'Несохранённый редактор блокирует переход.'],
    ['Ветка: feature/login', 'Выбери feature/login в списке.', 'Git перенесёт совместимые локальные изменения.'],
    ['Конфликтующие изменения', 'Если Git сообщает о конфликте — остановись.', 'Сохрани или закоммить работу, затем повтори.']
  ] },
  { id: 'get-changes', title: 'Получить изменения', steps: [
    ['Из ветки: origin/feature', 'Выбери исходную ветку из origin.', 'Текущая ветка должна быть чистой.'],
    ['В текущую: main', 'Проверь исходную и текущую ветки.', 'Панель сначала обновляет список из origin.'],
    ['Получить и объединить', 'Подтверди получение и merge.', 'При конфликте выбери версии или отмени merge.'],
    ['Проверь результат', 'Проверь файлы и запусти тесты.', 'Для отправки результата нужен отдельный Push.']
  ] },
  { id: 'pull-request', title: 'Pull Request', steps: [
    ['Из текущей: feature/login', 'Pull Request — предложение объединить ветки.', 'Исходная ветка берётся из текущей.'],
    ['В ветку: main', 'Выбери другую целевую ветку.', 'Head и base должны существовать в origin.'],
    ['Открыть Pull Request', 'Панель проверяет локальный и remote head.', 'Если они отличаются — сначала синхронизируй.'],
    ['GitHub: сравнение', 'Проверь head, base и diff на GitHub.', 'Открытие страницы ещё не создаёт PR и не делает merge.']
  ] },
  { id: 'delete-branch', title: 'Удалить ветку', steps: [
    ['Выбор ветки', 'Выбери ветку и нажми «Удалить выбранные».', 'main, master и default защищены от удаления.'],
    ['Проверка commits', 'Прочитай unmerged и unpublished commits.', 'Обычное удаление не удаляет unmerged commits.'],
    ['Удалить local + origin', 'Явно выбери область удаления.', 'Force может сделать commits недоступными через ref.'],
    ['Подтверждение origin', 'Remote требует отдельного подтверждения.', 'SHA проверяется: новый чужой push не перезаписывается.'],
    ['Активная ветка', 'Сохрани изменения перед её удалением.', 'Панель переключится на безопасную ветку или остановится.']
  ] },
  { id: 'aster-appearance', title: 'Aster Atelier', steps: [
    ['SELECT THEME — 20', 'Выбери одну из 20 тем.', 'Тема применяется к редактору сразу.'],
    ['SELECT FONT — 10', 'Выбери один из 10 шрифтов.', 'Отсутствующий шрифт: preview и установка с подтверждением.'],
    ['Font size: 19 · weight: 600', 'Измени размер и толщину.', 'Preview показывает выбранные параметры.'],
    ['Font style: Normal / Italic', 'Выбери прямое или наклонное начертание.', 'Личные и более специфичные правила могут иметь приоритет.'],
    ['Сохранение настроек', 'Настройки сохраняются в профиле пользователя.', 'При повторном открытии панель читает текущие значения.']
  ] }
];
const dimensions = { width: 1024, height: 600 };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function wrap(text, limit = 37) {
  return text.split(' ').reduce((lines, word) => {
    if (lines.at(-1) && (lines.at(-1) + ' ' + word).length > limit) lines.push(word);
    else lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word;
    return lines;
  }, ['']);
}
function draw(frame, guide, index, motion) {
  const [selection, action, outcome] = guide.steps[index];
  const command = ['-size', `${dimensions.width}x${dimensions.height}`, 'xc:#171d29', '-font', 'DejaVu-Sans',
    '-fill', '#202b3c', '-draw', 'roundrectangle 26,24 998,576 16,16',
    '-fill', '#111a28', '-draw', 'roundrectangle 48,102 456,510 12,12',
    '-fill', '#18263a', '-draw', 'roundrectangle 478,102 976,510 12,12',
    '-fill', '#85d4f4', '-pointsize', '18', '-annotate', '+50+64', 'WORKSTATION  /  УЧЕБНАЯ СХЕМА',
    '-fill', '#e7eef8', '-pointsize', '29', '-annotate', '+50+145', guide.title,
    '-fill', '#8fa8c2', '-pointsize', '16', '-annotate', '+50+183', `ШАГ ${index + 1} / ${guide.steps.length}`,
    '-fill', '#304968', '-stroke', '#7ed3ff', '-strokewidth', '2', '-draw', 'roundrectangle 68,226 432,300 8,8',
    '-stroke', 'none', '-fill', '#f3f7fd', '-pointsize', '20'];
  wrap(selection, 25).forEach((line, n) => command.push('-annotate', `+84+${256 + n * 25}`, line));
  const x = Math.round(315 + motion * 77), y = Math.round(170 + motion * 140);
  command.push('-fill', '#f9c66d', '-draw', `polygon ${x},${y} ${x + 16},${y + 32} ${x + 19},${y + 18} ${x + 32},${y + 13}`,
    '-fill', '#95aec8', '-pointsize', '16', '-annotate', '+68+364', 'ПОКАЗАНА СХЕМА ИНТЕРФЕЙСА',
    '-fill', '#8fd8b6', '-pointsize', '19', '-annotate', '+506+148', 'ЧТО СДЕЛАТЬ');
  wrap(action).forEach((line, n) => command.push('-fill', '#f3f7fd', '-pointsize', '23', '-annotate', `+506+${195 + n * 32}`, line));
  command.push('-fill', '#8fd8b6', '-pointsize', '19', '-annotate', '+506+310', 'ЧТО ПРОИЗОЙДЁТ');
  wrap(outcome).forEach((line, n) => command.push('-fill', '#d5e0ee', '-pointsize', '21', '-annotate', `+506+${355 + n * 31}`, line));
  command.push('-fill', '#9badc1', '-pointsize', '16', '-annotate', '+50+550', 'Анимация-инструкция · не запись Antigravity IDE', frame);
  execFileSync('convert', command, { stdio: 'pipe' });
}
function generate() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-instructional-'));
  const generated = [], manifestFile = path.join(root, 'docs/feature-guides/instructional-animations.json');
  const previous = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;
  try {
    for (const guide of guides) {
      const frames = guide.steps.map((_, index) => Array.from({ length: 5 }, (_, motion) => {
        const frame = path.join(temporary, `${guide.id}-${index}-${motion}.png`); draw(frame, guide, index, motion / 4); return frame;
      }));
      const gif = path.join(temporary, guide.id + '.gif'), mp4 = path.join(temporary, guide.id + '.mp4');
      execFileSync('convert', [...frames.flatMap(group => ['-delay', '8', ...group.slice(0, 4), '-delay', '288', group[4]]), '-loop', '0', gif], { stdio: 'pipe' });
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', gif, '-t', String(guide.steps.length * 3.2), '-vf', 'fps=12,format=yuv420p', '-c:v', 'libx264', '-movflags', '+faststart', mp4], { stdio: 'pipe' });
      const extension = guide.id === 'aster-appearance' ? 'aster-appearance' : 'git-branch-panel';
      const media = [gif, mp4].map(file => {
        const bytes = fs.readFileSync(file), relative = `extensions/${extension}/media/${path.basename(file)}`;
        const target = path.join(root, relative);
        if (fs.existsSync(target)) {
          const old = previous?.guides?.flatMap(item => item.media).find(item => item.path === relative);
          if (!old || hash(fs.readFileSync(target)) !== old.sha256) throw new Error('Existing media is not the previous owned output: ' + relative);
        }
        generated.push({ target, bytes });
        return { path: relative, bytes: bytes.length, sha256: hash(bytes) };
      });
      guide.media = media;
    }
    for (const item of generated) { fs.mkdirSync(path.dirname(item.target), { recursive: true }); fs.writeFileSync(item.target, item.bytes); }
    fs.writeFileSync(manifestFile, JSON.stringify({ schema: 1, type: 'instructional animation, not IDE recording', dimensions,
      durationPerStepSeconds: 3.2, guides }, null, 2) + '\n');
    console.log(JSON.stringify({ guides: guides.length, media: generated.length, type: 'instructional animation' }));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
if (require.main === module) generate();
module.exports = { guides, wrap, dimensions, draw, generate };
