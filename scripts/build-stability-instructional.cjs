'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { draw, dimensions } = require('./build-instructional-animations.cjs');
const root = path.resolve(__dirname, '..');
const guide = { id: 'stability-instructional', title: 'Workstation Stability', steps: [
  ['Settings → Stability', 'Открой настройки Workstation Stability.', 'Личные настройки и тема сохраняются при обычном update.'],
  ['Проверка конфликтов', 'Workstation: Inspect Project Setting Conflicts (Read Only)', 'Command Palette: проверка не меняет файлы проекта.'],
  ['Output → Stability', 'Посмотри точный файл и scope конфликта.', 'Решение о настройке остаётся за пользователем.'],
  ['Setup · backup', 'Перед обновлением Setup создаёт backup.', 'Сохрани путь к backup для восстановления.'],
  ['Setup · restore --dry-run', 'node bin/workstation-setup.js restore --dry-run', 'Из папки Setup: проверка без изменения файлов.'],
  ['Setup · restore', 'node bin/workstation-setup.js restore', 'Закрой IDE. Без пути выбирается последний backup.']
] };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function generate() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-stability-guide-'));
  const manifestFile = path.join(root, 'docs/feature-guides/stability-instructional.json');
  const previous = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile)) : null;
  try {
    const frames = guide.steps.map((_, index) => Array.from({ length: 5 }, (_, motion) => {
      const frame = path.join(temporary, `frame-${index}-${motion}.png`); draw(frame, guide, index, motion / 4); return frame;
    }));
    const gif = path.join(temporary, guide.id + '.gif'), mp4 = path.join(temporary, guide.id + '.mp4');
    execFileSync('convert', [...frames.flatMap(group => ['-delay', '8', ...group.slice(0, 4), '-delay', '288', group[4]]), '-loop', '0', gif], { stdio: 'pipe' });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', gif, '-t', String(guide.steps.length * 3.2), '-vf', 'fps=12,format=yuv420p', '-c:v', 'libx264', '-movflags', '+faststart', mp4], { stdio: 'pipe' });
    const output = [gif, mp4].map(file => {
      const bytes = fs.readFileSync(file), relative = 'extensions/workstation-stability/media/' + path.basename(file), target = path.join(root, relative);
      if (fs.existsSync(target)) {
        const old = previous?.media?.find(item => item.path === relative);
        if (!old || hash(fs.readFileSync(target)) !== old.sha256) throw new Error('Existing media is not the previous owned output: ' + relative);
      }
      return { target, bytes, metadata: { path: relative, bytes: bytes.length, sha256: hash(bytes) } };
    });
    for (const item of output) { fs.mkdirSync(path.dirname(item.target), { recursive: true }); fs.writeFileSync(item.target, item.bytes); }
    fs.writeFileSync(manifestFile, JSON.stringify({ schema: 1, type: 'instructional animation, not IDE recording', dimensions,
      durationPerStepSeconds: 3.2, ...guide, media: output.map(item => item.metadata) }, null, 2) + '\n');
    console.log('Built the labelled Stability instructional animation.');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
if (require.main === module) generate();
module.exports = { guide, generate };
