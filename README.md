# Antigravity Workstation

![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square)
![Antigravity IDE 2.6.0](https://img.shields.io/badge/Antigravity%20IDE-2.6.0-4285F4?style=flat-square)
![x64 · ARM64](https://img.shields.io/badge/CPU-x64%20%7C%20ARM64-555?style=flat-square)

Готовый профиль **Antigravity IDE 2.6.0** для Windows одной командой: настройки редактора, расширения, 15 шрифтов, 20 ярких тем, панель GitHub, правила и агенты. AI-подсказки выключаются, обычный IntelliSense остаётся. Перед изменениями создаётся резервная копия.

Репозиторий: https://github.com/safarovmurod/antigravity-workstation · [Скачать ZIP](https://github.com/safarovmurod/antigravity-workstation/archive/refs/heads/main.zip)

<a id="quick-start"></a>

## Шаг 0 — твоё имя для GitHub

Один раз на компьютере, в любом терминале (Git Bash или PowerShell). Почта — та, что привязана к твоему аккаунту GitHub (или адрес `…@users.noreply.github.com` со страницы [github.com/settings/emails](https://github.com/settings/emails)):

```bash
git config --global user.name "Имя Фамилия"
```

```bash
git config --global user.email "почта@пример.com"
```

Тогда каждый commit и push из панели **Explorer → GitHub** будет под твоим именем и аватаром. Если в скачанном проекте записано чужое имя, панель покажет его и предложит заменить на твоё.

## 4 способа установки

| Способ | Для кого |
| --- | --- |
| [Команда 1](#1-полный-сброс-и-установка-с-нуля) | Windows: полный сброс Antigravity и установка с нуля |
| [Команда 2](#2-установить-или-обновить) | Windows: установить или обновить, твои настройки остаются |
| [Промпт для ИИ — Windows](docs/prompts/WINDOWS-AI-SETUP.md) ([скачать](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/docs/prompts/WINDOWS-AI-SETUP.md)) | Отдаёшь любому ИИ-агенту с терминалом (Claude Code, Codex, Gemini CLI, Cursor, ZCODE…) вместе с ZIP — он ставит всё сам |
| [Промпт для ИИ — macOS](docs/prompts/MAC-AI-SETUP.md) ([скачать](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/docs/prompts/MAC-AI-SETUP.md)) | Mac: ИИ-агент переносит тот же профиль по файлам проекта |

Промпты работают без вопросов посередине: агент сам находит IDE, делает резервную копию, исправляет ошибки и в конце проверяет результат. Спрашивает только имя и почту для GitHub, если шаг 0 ещё не сделан.

## Как установить командой — 3 шага

1. **Antigravity IDE 2.6.0.** Скачай с [официального сайта](https://antigravity.google/download) ([x64](https://dl.google.com/edgedl/release2/j0qc3/antigravity/stable/2.6.0-5526304964083712/windows-x64/Antigravity%20IDE.exe) · [ARM64](https://dl.google.com/edgedl/release2/j0qc3/antigravity/stable/2.6.0-5526304964083712/windows-arm64/Antigravity%20IDE.exe)) и установи на любой диск (C:, D:, E: …). Для команды 2 открой IDE один раз, войди в аккаунт и **закрой все окна**; для команды 1 это не нужно.
2. **Windows PowerShell.** Открой его из меню **Пуск**. Терминал внутри Antigravity не подходит.
3. **Команда.** Скопируй одну команду ниже (кнопка Copy справа), вставь в PowerShell и нажми **Enter**. Окно не закрывай до зелёной надписи **DONE**.

| | Команда 1 | Команда 2 |
| --- | --- | --- |
| Когда | Полный сброс: Antigravity как на новом компьютере, потом установка с нуля | Обновление, когда всё уже настроено |
| Настройки, сочетания клавиш, сниппеты, профили IDE | **Удаляются все**, ставятся только из этого профиля (тема и шрифт тоже) | Твои остаются, недостающее добавляется |
| Расширения | **Удаляются все**, ставятся только нужные | Твои остаются, нужные обновляются |
| Правила, skills, агенты, MCP-серверы, hooks, разрешения агента | **Удаляются все**, ставятся только из профиля | Твои остаются, профиль обновляется |
| Аккаунт, чаты и память агента | **Удаляются** — после установки войди в аккаунт заново | Остаются |
| Резервная копия | Всё старое целиком — в `%USERPROFILE%\.gemini\backups\full-reset-<время>` | Да, в `%USERPROFILE%\.gemini\backups` |
| Папки твоих проектов | Не трогаются | Не трогаются |
| AI-подсказки | Выключаются | Выключаются |

Команда 1 очищает все места, где Antigravity хранит своё, на каком бы диске ни стояла IDE: `%APPDATA%\Antigravity IDE` (и старое `%APPDATA%\Antigravity`), `%USERPROFILE%\.antigravity-ide`, `.antigravity`, `.antigravity-tools`, всё в `%USERPROFILE%\.gemini` кроме `backups` (эта папка общая с Gemini CLI — его вход и настройки тоже сбрасываются) и портативную папку `data` рядом с `Antigravity IDE.exe`. Ничего не удаляется навсегда: папки переносятся в копию, список путей — в её `manifest.json`. Вернуть старое: закрой Antigravity и перенеси папки из копии обратно на их места.

## 1. Полный сброс и установка с нуля

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

Команда 2 идёт по 5 шагам с полосой прогресса: **Windows и IDE 2.6.0 → Node.js и Git → загрузка → установка → Doctor**. Команда 1 — по 6: после загрузки идёт **полный сброс** (всё старое переносится в копию, затем Antigravity сама один раз открывается на новом профиле и закрывается — ничего не нажимай). Node.js 24 и Git ставятся сами через winget, если их нет. Конец — зелёная рамка **DONE** и `Doctor: 0 failures`. После этого открой Antigravity (после команды 1 — войди в аккаунт заново): при первом запуске профиль применяется сам. Через минуту закрой и открой IDE ещё раз — включатся плавный Jelly Cursor, скрытие строки «Ctrl+L for Agent» и шрифт интерфейса.

## Что получишь

| Функция | Как работает |
| --- | --- |
| AI-подсказки | Серый ghost text, AI Tab и next edit **выключены**. Обычный IntelliSense остаётся: `cons` → `console` / `const`, переменные, методы вроде `map`, автоимпорт |
| Автосохранение | Через **1 секунду** паузы. Во время набора код **не переформатируется** |
| Форматирование | **Ctrl+S** или **Ctrl+Shift+F** — Prettier: отступ 3 пробела, без `;`, двойные кавычки |
| Подсказки вручную | **Ctrl+Space** или **Alt+Space** |
| Скобки и кавычки | `(` → `()`, `[` → `[]`, `{` → `{}`, `"` → `""` — и в JSX: `onClick={() => ()}` |
| Атрибуты JSX | `className` → `className=""`, `id` → `id=""`; `onClick`, `style`, массивы и числа → `={}` |
| Строка «Ctrl+L for Agent» | Не появляется на пустых строках; «Explain and Fix Problem» на строке с ошибкой тоже скрыт. Сочетания Ctrl+L и Ctrl+Shift+. работают |
| React / Emmet | `rfc`, `rafce`, `div` → **Tab** |
| Темы | **Ctrl+Shift+P** → **Aster Atelier: Темы и шрифты**: 20 тем по мотивам самых популярных (One Dark Pro, Dracula, Tokyo Night, Catppuccin, GitHub, Night Owl…), Antigravity Light/Dark и 4 стандартные темы VS Code (Dark+, Light+, Solarized Dark, Quiet Light). Ползунки яркости и контраста кода и прозрачности окна |
| Шрифты | 15 шрифтов внутри расширения (JetBrains Mono, Fira Code, Geist Mono, Cascadia Code…). Галочка «для всего интерфейса» меняет шрифт меню, панелей и вкладок; снял — вернулся родной |
| Цвета кода | В каждой теме свои цвета, как в оригинале: ключевые слова, функции, импорты, строки, числа, типы, теги, атрибуты и комментарии различаются; тусклые цвета подняты до читаемых |
| Панель GitHub | **Explorer → GitHub**: файлы, сообщение, **Commit и Push**. Новая ветка, переключение и удаление — без обязательного push; мешающие изменения откладываются и возвращаются сами |
| Выбор сохраняется | Тема, шрифт и ползунки хранятся в настройках: остаются после перезапуска, в новом окне и новом файле |

Агент, MCP, Secure Mode и sandbox не меняются: их разрешения остаются как есть. Скачивается текущая ветка `main`; старый кеш загрузки удаляется после успешной установки.

## Если команда остановилась

| Надпись | Что сделать |
| --- | --- |
| `PAUSED: Antigravity is still running` | Сохрани работу, закрой **все** окна Antigravity (и в трее), вставь ту же команду |
| `PAUSED: this is the terminal of an editor` | Открой **Windows PowerShell** из меню Пуск и вставь команду там |
| `STOPPED: this setup supports only Antigravity IDE 2.6.0` | Установи IDE 2.6.0 по ссылке выше и повтори |
| `STOPPED: Antigravity has never been started` | Только команда 2: открой IDE один раз, войди в аккаунт, закрой все окна и повтори (команде 1 это не нужно) |
| `Full reset stopped at … A program still uses it` | Папку держит другая программа (Gemini CLI, `agy.exe`). Закрой её или перезагрузи Windows и вставь ту же команду. Ничего не удалено: перенесённое уже вернулось на место |
| `[SETUP FAILED]` | Текст ошибки уже скопирован в буфер — вставь его в чат Antigravity один раз. Подробнее: [проблемы и решения](docs/TROUBLESHOOTING.md) |

IDE стоит в своей папке и не найдена? Вставь перед командой строку `$env:ANTIGRAVITY_INSTALL_DIR = 'D:\Папка, где лежит Antigravity IDE.exe'` (пробелы и кириллица в пути поддерживаются).

[Все настройки](docs/SETTINGS-GUIDE.md) · [Расширения](docs/EXTENSIONS.md) · [Как вернуть AI-подсказки](docs/AI-COMPLETION.md) · [Совместимость ПК](docs/HARDWARE-COMPATIBILITY.md) · [Восстановление через чат](docs/CHAT-REPAIR.md)
