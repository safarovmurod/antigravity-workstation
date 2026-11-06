# Antigravity Workstation

![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square)
![Antigravity IDE 2.6.0](https://img.shields.io/badge/Antigravity%20IDE-2.6.0-4285F4?style=flat-square)
![x64 · ARM64](https://img.shields.io/badge/CPU-x64%20%7C%20ARM64-555?style=flat-square)

Готовый профиль **Antigravity IDE 2.6.0** для Windows одной командой: настройки редактора, расширения, 10 шрифтов, 17 тем, правила и агенты. AI-подсказки выключаются, обычный IntelliSense остаётся. Перед изменениями создаётся резервная копия.

<a id="quick-start"></a>

## Как установить — 3 шага

1. **Antigravity IDE 2.6.0.** Скачай с [официального сайта](https://antigravity.google/download) ([x64](https://dl.google.com/edgedl/release2/j0qc3/antigravity/stable/2.6.0-5526304964083712/windows-x64/Antigravity%20IDE.exe) · [ARM64](https://dl.google.com/edgedl/release2/j0qc3/antigravity/stable/2.6.0-5526304964083712/windows-arm64/Antigravity%20IDE.exe)), установи на любой диск (C:, D:, E: …), открой один раз, войди в аккаунт и **закрой все окна**.
2. **Windows PowerShell.** Открой его из меню **Пуск**. Терминал внутри Antigravity не подходит.
3. **Команда.** Скопируй одну команду ниже (кнопка Copy справа), вставь в PowerShell и нажми **Enter**. Окно не закрывай до зелёной надписи **DONE**.

| | Команда 1 | Команда 2 |
| --- | --- | --- |
| Когда | Первая установка или «начать с чистого листа» | Обновление, когда всё уже настроено |
| Настройки редактора | Твои остаются (тема, шрифт, курсив), недостающее добавляется | Твои остаются, недостающее добавляется |
| Лишние расширения | Убираются в резервную копию | Остаются |
| AI-подсказки | Выключаются | Выключаются |

## 1. Полная настройка с очисткой

```powershell
& {
  $file = Join-Path $env:TEMP ('workstation-' + [guid]::NewGuid() + '.ps1')
  $url = 'https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/scripts/bootstrap.ps1'
  try {
    curl.exe -fsSL --retry 3 --connect-timeout 20 --max-time 120 -o $file $url
    if ($LASTEXITCODE -or -not (Test-Path -LiteralPath $file)) {
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
      Invoke-WebRequest $url -OutFile $file -UseBasicParsing -ErrorAction Stop
    }
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $file -CleanExtensions
  } finally { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
}
```

## 2. Установить или обновить

```powershell
& {
  $file = Join-Path $env:TEMP ('workstation-' + [guid]::NewGuid() + '.ps1')
  $url = 'https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/scripts/bootstrap.ps1'
  try {
    curl.exe -fsSL --retry 3 --connect-timeout 20 --max-time 120 -o $file $url
    if ($LASTEXITCODE -or -not (Test-Path -LiteralPath $file)) {
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
      Invoke-WebRequest $url -OutFile $file -UseBasicParsing -ErrorAction Stop
    }
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $file
  } finally { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
}
```

## Что происходит в окне

Команда идёт по 5 шагам с полосой прогресса: **Windows и IDE 2.6.0 → Node.js и Git → загрузка → установка → Doctor**. Node.js 24 и Git ставятся сами через winget, если их нет. Конец — зелёная рамка **DONE** и `Doctor: 0 failures`. После этого открой Antigravity: при первом запуске профиль применяется сам. Через минуту закрой и открой IDE ещё раз — включится плавный Jelly Cursor.

## Что получишь

| Функция | Как работает |
| --- | --- |
| AI-подсказки | Серый ghost text, AI Tab и next edit **выключены**. Обычный IntelliSense остаётся: `cons` → `console` / `const`, переменные, методы вроде `map`, автоимпорт |
| Автосохранение | Через **1 секунду** паузы. Во время набора код **не переформатируется** |
| Форматирование | **Ctrl+S** или **Ctrl+Shift+F** — Prettier: отступ 3 пробела, без `;`, двойные кавычки |
| Подсказки вручную | **Ctrl+Space** или **Alt+Space** |
| React / Emmet | `rfc`, `rafce`, `div` → **Tab** |
| Темы и шрифты | **Ctrl+Shift+P** → **Aster Atelier: Темы и шрифты** → выбери → **Применить** |
| Цвета кода | Во всех 17 темах: ключевые слова, функции, строки, числа, типы, теги, атрибуты и комментарии — каждый своим спокойным цветом |

Агент, MCP, Secure Mode и sandbox не меняются: их разрешения остаются как есть. Скачивается текущая ветка `main`; старый кеш загрузки удаляется после успешной установки.

## Если команда остановилась

| Надпись | Что сделать |
| --- | --- |
| `PAUSED: Antigravity is still running` | Сохрани работу, закрой **все** окна Antigravity (и в трее), вставь ту же команду |
| `PAUSED: this is the terminal of an editor` | Открой **Windows PowerShell** из меню Пуск и вставь команду там |
| `STOPPED: this setup supports only Antigravity IDE 2.6.0` | Установи IDE 2.6.0 по ссылке выше и повтори |
| `STOPPED: Antigravity has never been started` | Открой IDE один раз, войди в аккаунт, закрой все окна и повтори |
| `[SETUP FAILED]` | Текст ошибки уже скопирован в буфер — вставь его в чат Antigravity один раз. Подробнее: [проблемы и решения](docs/TROUBLESHOOTING.md) |

IDE стоит в своей папке и не найдена? Вставь перед командой строку `$env:ANTIGRAVITY_INSTALL_DIR = 'D:\Папка, где лежит Antigravity IDE.exe'` (пробелы и кириллица в пути поддерживаются).

[Все настройки](docs/SETTINGS-GUIDE.md) · [Расширения](docs/EXTENSIONS.md) · [Как вернуть AI-подсказки](docs/AI-COMPLETION.md) · [Совместимость ПК](docs/HARDWARE-COMPATIBILITY.md) · [Восстановление через чат](docs/CHAT-REPAIR.md)
