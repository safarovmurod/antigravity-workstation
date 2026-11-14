# Контекст проекта для следующих сессий

Этот файл — краткая карта проекта и журнал последних изменений. Его цель: новая
сессия (человек или AI) за 5 минут понимает, что это за проект, что уже сделано,
какие настройки зачем стоят и где лежат ограничения. Подробности — в ссылках.

Последнее обновление: 14 ноября 2026, setup **3.8.0**, Aster Atelier **1.7.0**,
поддерживаемая IDE — **Antigravity IDE 2.6.0**.

## 1. Что это за проект

`antigravity-workstation` — установщик готового рабочего профиля для
**Antigravity IDE** (IDE Google на базе VS Code) под Windows. Одна команда в
Windows PowerShell скачивает свежий `main` с GitHub и ставит:

- настройки редактора (`config/settings.json`, 289 ключей), сочетания клавиш, `argv.json`;
- расширения (Prettier, Error Lens, Tailwind, сниппеты React и др.) и 4 своих
  расширения из `extensions/`: **Aster Atelier** (темы и шрифты), **Workstation
  Stability Helper** (применяет профиль внутри IDE), **Calm TypeScript**,
  **Git Branch Panel**;
- правила, навыки и агентов для чата Antigravity (`rules/`, `skills/`, `agents/`),
  MCP-серверы (`config/mcp/`), хуки;
- шрифты с лигатурами (через расширение Aster).

AI-подсказки (серый ghost text) выключаются, обычный IntelliSense остаётся.
Перед изменениями создаётся резервная копия.

Основные папки: `bin/` (CLI), `lib/` (логика установщика), `config/`
(профиль), `extensions/` (свои расширения), `scripts/` (bootstrap и сборка),
`tests/` (тесты), `docs/` (документация). Правила работы — в `AGENTS.md`.

## 2. Как пользователь ставит профиль

Две команды из `README.md` (всегда из обычного **Windows PowerShell** из меню
«Пуск», не из терминала IDE):

| Команда | Что делает |
| --- | --- |
| **1** (`-CleanExtensions`) | Полный сброс: всё старое (настройки, расширения, вход, чаты) уходит в одну резервную копию, IDE один раз открывается на чистом профиле и закрывается сама, затем ставится профиль |
| **2** (без флага) | Установка или обновление: каждая настройка профиля ставится заново; личные тема, шрифт, размер шрифта и настройки вне профиля остаются |

Ход работы `scripts/bootstrap.ps1`: проверка Windows и IDE → Node.js 24 и Git
(ставятся через winget) → загрузка `main` через git → (команда 1: сброс) →
установка (`bin/workstation-setup.js install`) → Doctor. Конец — зелёная рамка
**DONE** и `Doctor: 0 failures`.

### Частые остановки

- **`PAUSED: Antigravity is still running`** — скрипт видит процесс с именем
  `Antigravity IDE`, `Antigravity` или `antigravity-ide` (`bootstrap.ps1`,
  `Test-ReadyToRun`) и ничего не меняет. После закрытия окон Electron может
  оставить фоновый процесс без окна. Решение для пользователя:
  `Get-Process -Name 'Antigravity IDE','Antigravity','antigravity-ide' | Stop-Process -Force`,
  затем та же команда. Сообщение не показывает, какой процесс мешает, — это
  известная слабость (см. раздел 8).
- **`PAUSED: this is the terminal of an editor`** — команда запущена из терминала IDE.
- **`STOPPED: this setup supports only Antigravity IDE 2.6.0`** — стоит другая
  версия IDE (например, вышедшая 12 ноября 2026 **2.7.0**). См. раздел 7.

### Где установщик ищет IDE (диск C или D)

`Find-Ide` в `bootstrap.ps1` проверяет по порядку: переменную
`ANTIGRAVITY_INSTALL_DIR`, регистрацию в реестре (Uninstall), `PATH`
(`antigravity-ide.cmd`, `antigravity.cmd`, `agy.cmd`), затем
`%LOCALAPPDATA%\Programs`, `Program Files`, `Program Files (x86)` и на **каждом
несъёмном диске** (C:, D:, E: …) корень, `\Programs`, `\Program Files`, `\Apps`
с папками `Antigravity IDE` и `Antigravity`. Стандартная папка установщика
Google — `C:\Users\<имя>\AppData\Local\Programs\Antigravity IDE`. Для своей
папки пользователь пишет перед командой
`$env:ANTIGRAVITY_INSTALL_DIR = 'D:\Папка с Antigravity IDE.exe'`.

## 3. Что делают настройки профиля (главное)

Полный список — `config/settings.json`, объяснения — `docs/SETTINGS-GUIDE.md`.

| Группа | Значения | Зачем |
| --- | --- | --- |
| AI-подсказки | `editor.inlineSuggest.enabled: false` и выключатели AI-автодополнения | Ученик пишет код сам; IntelliSense (`cons` → `console`) остаётся |
| Сохранение и формат | `files.autoSave: afterDelay`, `files.autoSaveDelay: 1000`, `editor.formatOnSave: true`, `formatOnType: false`, Prettier по умолчанию | Сохранение через 1 с; код не переформатируется во время набора |
| Отступы | `editor.tabSize: 3`, `detectIndentation: false` | Единый стиль; Prettier: 3 пробела, без `;`, двойные кавычки |
| Скобки и кавычки | `autoClosingBrackets/Quotes: always` | `(` → `()`, `"` → `""`, в JSX тоже |
| Подсказки | `editor.quickSuggestions` (в строках да, в комментариях нет), `wordBasedSuggestions: off` | Подсказки по смыслу, без мусора из слов файла |
| Вид | `minimap: false`, `renderLineHighlight: none`, `fontLigatures: true`, шрифт JetBrains Mono | Спокойный экран, лигатуры `=== !== =>` |
| Тема | `workbench.colorTheme: Visual Studio Dark` + `asterAppearance.theme: One Dark Pro` | Палитры Aster накладываются поверх базовой темы VS (см. раздел 4) |
| Терминал | профиль по умолчанию **Git Bash** | Команды как в учебных материалах |
| Агент | `chat.tools.terminal.autoApprove` (npm run dev/build/lint, git add …), MCP Allow, Secure Mode выключен | Агент работает без постоянных вопросов (флаг `--auto-approve` в bootstrap) |
| Error Lens | фоны `#00000000`, текст с прозрачностью | Ошибки видны, но не кричат |
| Jelly Cursor | `jellyCursor.*` | Плавный курсор |

**Личные настройки не затираются** (`lib/profile-settings.js`,
`PERSONAL_SETTINGS`): тема, шрифты всех поверхностей, `editor.fontSize`,
`editor.fontWeight`, `editor.fontLigatures`, `asterAppearance.fontStyle` и др.
Команда 2 оставляет их как есть.

## 4. Aster Atelier — темы, шрифты, начертания (`extensions/aster-appearance`)

Открывается: **Ctrl+Shift+P → Aster Atelier: Темы и шрифты**.

- **22 темы Aster** + темы IDE (Antigravity Light/Dark, Dark+, Light+,
  Solarized Dark, Quiet Light), карточками в 5 группах. Палитры заданы в
  `palettes.cjs`, файлы `themes/*.json` **генерируются**
  `node scripts/build-aster.cjs` — руками не править. С 1.6.0 добавлены
  спокойные темы в духе One Dark Pro: Nord, Everforest Dark, Rose Pine Moon,
  Kanagawa Wave, Vitesse Dark. Темы не повторяют друг друга (тест: среднее
  расстояние ≥ 0.09 в OKLab).
- **Комментарии всегда цветные (зелёные)**, не серые и не прозрачные:
  `greenComment()` в `color.cjs` даёт зелёный (насыщенность OKLCH 0.12); если
  в теме строки уже зелёные — морская волна/бирюза. В темах IDE серый
  комментарий заменяется зелёным через правила `Aster Atelier · readable`
  (`swatches.cjs`). Контраст ≥ 5:1.
- **11 шрифтов** внутри расширения (OFL, SHA-256 в `fonts.json`, скачиваются
  `scripts/fetch-aster-fonts.cjs` с закреплённых коммитов): JetBrains Mono,
  Fira Code, Cascadia Code, Victor Mono, Lilex, Kode Mono, Fragment Mono,
  Monaspace Argon/Xenon/Radon/Krypton. У Monaspace лигатуры в наборах
  `ss01…ss10` — Aster пишет их в `editor.fontLigatures` сам (`fontFeatures`).
  Fragment Mono не соединяет `&&`, Victor Mono и Kode Mono — `||`.
- **12 начертаний** (`asterAppearance.fontStyle`, `FONT_STYLES` в
  `appearance.cjs`): Обычный, Курсив, Лёгкий 300, Средний 500, Полужирный 600,
  Жирный 700, Жирный курсив; и по частям кода (с 1.7.0): курсивные
  комментарии, курсивные ключевые слова, курсив для обоих, жирные ключевые
  слова, жирные объявления. Операторы `=> === &&` всегда прямые. Правила
  помечены именем `Aster Atelier · editor style`; личные правила остаются.
- После любого изменения расширения: `node scripts/build-aster.cjs`,
  `node scripts/package-aster.cjs` (новый VSIX + `manifest.json` с хешами),
  повысить версию в `extensions/aster-appearance/package.json` и
  `config/extensions.json`, удалить старый VSIX.

## 5. Журнал изменений (ноябрь 2026)

| Версия setup / Aster | Что сделано |
| --- | --- |
| 3.5.0 / 1.4.0 | Исходное состояние: 17 тем, 5 шрифтов, панель GitHub |
| 3.6.0 / 1.5.0 | (коммит Codex) +5 шрифтов (Kode Mono, Monaspace ×4), 5 начертаний по толщине, первые цветные комментарии |
| 3.7.0 / 1.6.0 | +5 спокойных тем; комментарии стали явно зелёными; бледные имена в Nord не уходят в серый |
| 3.8.0 / 1.7.0 | +Fragment Mono; +5 начертаний по частям кода; предпросмотр показывает начертание |

Все версии проверены GitHub Actions (Setup checks, Native Windows IDE smoke,
Aster actual Antigravity appearance, Verify Aster VSIX build).

## 6. Тесты и проверка

- `npm test` — основной набор (`node:test`). В облачной Linux-сессии **около 100
  тестов всегда падают**: им нужен Windows (`powershell.exe`, `C:\Windows\System32\tar.exe`,
  реестр). Правильная проверка — сравнить список падений до и после правок: он
  должен совпадать. Настоящая проверка Windows — в GitHub Actions после push.
- Тесты Aster: `node --test tests/test-aster-appearance.mjs tests/test-aster-studio.mjs tests/test-aster-themes.mjs tests/test-aster-comments.mjs`
  (2 теста VSIX падают на Linux из-за `tar.exe` — это нормально).
- `node scripts/audit-tracked-files.cjs` — `issues` должен быть пустым.
- Тесты создают мусор в корне (`languagepacks.json`, папки `\tmp\...`) —
  перед commit удалить `languagepacks.json`; папки `\tmp\…` игнорируются git.
- Для шрифтов нужны `pip install fonttools uharfbuzz`
  (`ASTER_PYTHON=python3 node scripts/fetch-aster-fonts.cjs`).

## 7. Новая версия IDE (как добавить поддержку, например 2.7.0)

Установщик поддерживает **ровно одну проверенную** версию IDE. Версия
закреплена в нескольких местах:

- `scripts/bootstrap.ps1`: `$IdeVersion`, `$IdeDownload` (официальная ссылка
  `dl.google.com/edgedl/release2/j0qc3/antigravity/stable/<версия>-<build>/windows-<arch>/Antigravity%20IDE.exe`);
- `lib/native-compatibility.js`: `SUPPORTED_IDE_VERSION`, `NATIVE_MAIN_SHA256`;
- `config/native-compatibility.json`: сборки x64/arm64 — `mainSha256`
  (хеш `resources/app/out/main.js`), SHA-256 установщика, схема protobuf
  `unified_state_sync.proto` (по ней агент-автоматизация пишет `state.vscdb`;
  если схема изменилась — нужен новый адаптер, иначе можно повредить данные);
- `scripts/macos-setup.cjs` (`IDE_VERSION`), README (бейдж, ссылки, таблица
  ошибок), `docs/AGENT-AUTOMATION.md` (раздел source-evidence),
  `docs/TROUBLESHOOTING.md`, `docs/prompts/MAC-AI-SETUP.md`, тесты
  (`test-native-compatibility`, `test-install-paths`, `test-bootstrap.ps1`,
  `test-windows-native-smoke.ps1` и др.);
- при смене движка VS Code — проверить `scripts/aster-color-registry.json`
  (ключи цветов) и реестр настроек (`isRegisteredSetting`, недоступные ключи).

Порядок: скачать официальные установщики, посчитать SHA-256, извлечь
`main.js`, сравнить схему protobuf с адаптером `uss-int32-agent-tab-v1`,
обновить все места выше, прогнать тесты и Actions (Native Windows IDE smoke
ставит IDE по этой ссылке).

**Статус на 14.11.2026:** вышла **2.7.0** (12.11.2026: кликабельные «пилюли»
терминала в чате, меню быстрого доступа, переименованные команды diff, правки
diff/Auto Save/входа, исправлен запуск на Windows при занятом порте). Сами
новшества с настройками профиля не конфликтуют по описанию, но **пока
установщик с 2.7.0 остановится** с `STOPPED: supports only 2.6.0`, а не
сломает профиль. Поддержка 2.7.0 не добавлена: облачной сессии нужен доступ к
`antigravity.google` и `dl.google.com` (хосты добавлены в сетевые настройки
окружения «setting claude», но загрузку заблокировала проверка безопасности
сессии — нужно разрешение пользователя). До этого пользователю на 2.7.0 нельзя
запускать команды 1/2; вариант — оставить/вернуть 2.6.0 по ссылке из README.

## 8. Известные слабые места (не исправлены)

- **PAUSED не показывает виновника.** Предложено: выводить имя, PID и путь
  процесса и спрашивать «Закрыть? (Y/N)»; учитывать только текущую сессию
  Windows (`SessionId`).
- **Stability Helper пропускает профиль навсегда.**
  `extensions/workstation-stability/profile.cjs`: `alreadyApplied` сверяет
  только `requestId` в globalState и пишет «already applied … verified current
  values», даже если все 100+ настроек на значениях по умолчанию; строка с
  `editorProfileRequest` записывается и при `overrides`. Обход: команда
  **Workstation: Apply and Check Editor Settings** (с подтверждением) или
  команда 2 (новый `requestId`).
- У Kode Mono и Fragment Mono нет кириллицы — русские комментарии в них
  рисуются запасным шрифтом.

## 9. Правила работы в репозитории

- `AGENTS.md`: Node 24+, npm 10+, LF, отступ 3 (в `lib/` — 2, CommonJS),
  короткие commit-сообщения в повелительном наклонении, личные настройки не
  трогать, секреты не коммитить.
- Пользователь просит отправлять изменения **прямо в `main`** (команды 1/2
  скачивают `main`). При изменении расширения обязательно поднимать его версию
  и версию setup, иначе установщик не заменит старую.
- Облачная сессия **не может удалять ветки** на GitHub (403) — это делает
  пользователь на странице `/branches`.
- Перед работой проверить, нет ли в `main` новых коммитов (пользователь иногда
  работает параллельно через Codex) — строить поверх них, не затирать.
