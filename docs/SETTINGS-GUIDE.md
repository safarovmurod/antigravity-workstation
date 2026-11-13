# SETTINGS GUIDE — полная карта настроек Antigravity Workstation

Этот документ — единая точка правды для любого ИИ или разработчика: **какая настройка существует, что она реально делает, зачем она нужна и какой баг решает**. Читай его перед тем, как менять что-либо в `config/`.

Репозиторий: `safarovmurod/antigravity-workstation`. Продукт — установщик/менеджер настроек для Antigravity IDE (форк VS Code, engine 1.107) + собственные расширения (Aster Atelier, Workstation Stability, Calm TypeScript, Git Branch Panel).

---

## 1. Как настройки попадают к пользователю (pipeline)

```
GitHub main → scripts/bootstrap.ps1 (Windows 10/11)
  → git скачивает последний commit main (только изменения; старый launcher сам передаёт работу новому)
  → bin/workstation-setup.js install (lib/installer.js)
      ├─ backup старых settings в ~/.gemini/backups/...
      ├─ mergeSettings(): managed config + личные значения пользователя
      ├─ пишет settings.json, keybindings.json, argv.json профиля IDE
      └─ ставит 23 расширения каталога (gallery → latest stable; local VSIX → SHA-pin)
  → Doctor проверяет результат (цель: 80 PASS / 0 FAIL)
```

Три источника правды в репозитории:

| Файл | Что это | Кто меняет |
|---|---|---|
| `config/settings.json` | managed-настройки редактора (289 ключей) | человек/ИИ руками |
| `config/keybindings.json` | managed-горячие клавиши | человек/ИИ руками |
| `config/extensions.json` | каталог 23 расширений (источник, версия) | человек/ИИ руками |
| `extensions/aster-appearance/themes/*.json` | 22 палитры Aster — **GENERATED** из `palettes.cjs` | только `scripts/build-aster.cjs` |
| `extensions/*/manifest.json` | SHA-256 pin упакованных VSIX | только `scripts/package-*.cjs` |

## 2. Права владения (ownership) — САМОЕ ВАЖНОЕ

`lib/profile-settings.js → mergeSettings(current, managed)` решает, кто выигрывает:

- **Personal-ключи** (пользователь главнее): `workbench.colorTheme`, все 10 font-family ключей из `FONT_FAMILY_KEYS`, `editor.fontSize/fontWeight/fontLigatures`, `terminal.integrated.fontWeight`, `editor.guides.*`, `errorLens.*`, `git.autofetch`, `prettier.requireConfig`, `editor.semanticTokenColorCustomizations`. Единый список — `PERSONAL_SETTINGS` в `lib/profile-settings.js`.
- **`workbench.settings.applyToAllProfiles`** — особый случай: union (managed-дополнения добавляются, пользовательские записи сохраняются).
- **`workbench.colorCustomizations`** — глубокий merge: managed-дополнения приходят, личные значения не затираются.
- **Языковые блоки `[typescript]` и т.п.** — в обычном режиме значение пользователя выигрывает, managed-дополнения заполняют остальное; в `--apply-profile`/`--quiet-completion` managed-политика главнее.
- Остальные managed-ключи — значение из `config/settings.json`.

Режимы установки: `install` без флагов (личные значения остаются) / `--apply-profile` (команда 2 из README: каждая managed-настройка и сочетание клавиш ставятся заново; тема, шрифты, размер шрифта, направляющие и вид Error Lens остаются) / `--reset-profile` (команда 1: профиль с нуля) / `--quiet-completion` (выключить AI completion) / `--auto-approve` (расширяет agent-permissions — не использовать без явного запроса).

Исторический баг (исправлен, не ломай обратно): старый код подставлял копию пользователя вместо managed для объектных ключей → новые managed-ключи никогда не доходили до старых установок. Регрессия-тест: `tests/test-personal-config-preservation.mjs → "Upgrade delivers new managed appearance keys"`.

## 3. config/settings.json — по группам

### 3.1 Курсор и спокойный редактор
- `editor.cursorBlinking: smooth`, `editor.cursorSmoothCaretAnimation: on`, `editor.cursorWidth: 2` — плавный тонкий курсор; тест `test:calm-typescript:editor` проверяет анимацию и ширину **2px** в реальном рендере.
- `editor.renderLineHighlight: none`, `editor.matchBrackets: never`. Линия области `{ }` видна только у блока под курсором (`editor.guides.bracketPairs` и `bracketPairsHorizontal: active`, `highlightActiveBracketPair: true`); линии отступов выключены.
- `editor.minimap.enabled: false`, узкие скроллбары 8px, smoothScrolling везде, `editor.lineHeight: 25`, `letterSpacing: 0.3`, padding 12/12 — комфортная плотность кода.

### 3.2 Прозрачные диагностики (Error Lens) — решение «жёлтых блоков»
Проблема: расширение Tailwind публикует подсказки вида `The class 'gap-[24px]' can be written as 'gap-6'` как diagnostics (Warning/Info), а Error Lens рисовал их **сплошными оранжевыми блоками на всю строку**.

Решение в `workbench.colorCustomizations`:
- `errorLens.{error,warning,info,hint}Background` + `...BackgroundLight` + `...MessageBackground` + `...RangeBackground` = `#00000000` (16 ключей) — **все** фоны полностью прозрачны, во всех темах (Light-варианты нужны, т.к. Error Lens берёт их для светлых тем; их отсутствие и было причиной блоков).
- `errorLens.*Foreground` + `...ForegroundLight` = цвета с alpha `26` (hex) ≈ 15% непрозрачности (85–90% прозрачности) — текст подсказки почти невидим.
- `editor{Error,Warning,Info}.foreground` с alpha `26` — сами squiggle-подчёркивания тонкие и прозрачные.
- `errorLens.enabled: true, followCursor: allLines, delay: 500` — подсказки работают, но не перекрывают код.
- `htmlEndTagLabels.labelColor: #00000000` — подписи закрывающих HTML-тегов тоже прозрачны.

⚠️ Правило: эти ключи живут **в двух местах** — здесь и в каждой из 22 палитр Aster (`extensions/aster-appearance/themes/*`, generated). Менять только через `scripts/build-aster.cjs`, не руками в темах.

### 3.3 Подсказки и сниппеты (настроены под React/TS-разработку)
- `editor.quickSuggestions {other: true, comments: false, strings: true}` + delay 10 — автоподсказки без Ctrl+Space.
- `editor.tabCompletion: on`, `snippetSuggestions: top` — Tab работает со сниппетами.
- `editor.inlineSuggest.enabled: false` — без «призрачного» автодополнения (мешал обучению и печатал за пользователя); отключено и в каждом языковом блоке.
- `editor.suggest.showWords: false`, `matchOnWordStartOnly: false` — без мусорных словесных подсказок; показ методов/классов/сниппетов включён точечно.
- `acceptSuggestionOnCommitCharacter: false`, `acceptSuggestionOnEnter: on`.
- `editor.wordBasedSuggestions: off` — слова из файла не засоряют список.

### 3.4 Emmet + Tab (решение «Tab не принимал сниппет»)
- `emmet.triggerExpansionOnTab: true`, `showExpandedAbbreviation: always`, `showSuggestionsAsSnippets: true` — Emmet-сокращения расширяются Tab и видны в меню.
- **Конфликт, который это создавало**: Tab в меню подсказок запускал Emmet вместо принятия выбранного React-сниппета (`rfc` → `<rfc></rfc>` вместо компонента). Решение — биндинг в `keybindings.json` (см. §4), а не отключение Emmet.

### 3.5 TypeScript/JavaScript поведение
- `*.validate.enable: true` — красные ошибки валидации включены.
- `*.suggest.autoImports: true`, `updateImportsOnFileMove: always` — автоперенос импортов.
- `*.suggest.paths: false`, `classMemberSnippets: false`, `completeJSDocs: false`, `completeFunctionCalls: false` — убраны навязчивые подсказки (пути даёт npm-intellisense/path-intellisense).
- `preferences.quoteStyle: double`, `importModuleSpecifier: shortest` — единый стиль. `jsxAttributeCompletionStyle: auto` — атрибут-строка получает `""` (`className=""`), функция, число, массив и объект — `{}` (`onClick={}`).
- `typescript.tsserver.maxTsServerMemory` — **вычисляется установщиком** из RAM машины (`lib/system-resources.js`), не хардкодить.

### 3.6 Форматирование — Prettier + 3 пробела
- `editor.defaultFormatter: esbenp.prettier-vscode` + во всех языковых блоках; `formatOnSave: true (file)`, `formatOnPaste: false`, `formatOnType: false`.
- `editor.tabSize: 3, insertSpaces: true, detectIndentation: false` + `prettier.tabWidth: 3, semi: false, singleQuote: false, printWidth: 100, trailingComma: es5` — единый стиль: **3 пробела, без точек с запятой, двойные кавычки**. Языковые блоки `[js|jsx|ts|tsx|html|css|scss|json|jsonc|markdown]` дублируют это (детерминизм против дефолтов IDE).
- `oxc.enable.oxfmt: false` — Oxc-форматтер не конкурирует с Prettier.

### 3.7 Tailwind CSS IntelliSense
- `tailwindCSS.classAttributes: [class, className]`, `emmetCompletions: true`, `includeLanguages` для js/ts/tsx — классы подсказываются в React.
- `lint.*` — конфликты классов warning, остальное error.
- Подсказки «can be written as» приходят отсюда — их вид управляется Error Lens (см. §3.2).

### 3.8 Шрифты — «весь IDE одним шрифтом»
- `editor.fontFamily: 'JetBrains Mono', 'Cascadia Code', monospace`, `fontSize: 15`, `fontWeight: 400`, `fontLigatures: true`, `lineHeight: 25`.
- Все 10 font-family ключей (`editor`, `terminal.integrated`, `debug.console`, `chat`, `chat.editor`, `editor.inlayHints`, `editor.inlineSuggest`, `notebook.output`, `notebook.markup`, `scm.input`) уже в `config/settings.json` = `'JetBrains Mono', monospace` — на чистом ПК шрифт сразу везде, без открытия студии Aster. `terminal.integrated.fontSize: 14`, cursor line/2px.
- `workbench.settings.applyToAllProfiles` — **12 ключей-семейств** (`editor.fontFamily`, `terminal.integrated.fontFamily`, `debug.console.fontFamily`, `chat.editor.fontFamily`, `chat.fontFamily`, `editor.inlayHints.fontFamily`, `editor.inlineSuggest.fontFamily`, `notebook.output.fontFamily`, `notebook.markup.fontFamily`, `scm.inputFontFamily`, `editor.fontSize`, `window.zoomLevel`) — шрифт применяется ко **всем профилям** IDE и ко всем поверхностям, которые вообще регистрирует хост. Список font-family ключей — единственный источник `FONT_FAMILY_KEYS` в `extensions/aster-appearance/appearance.cjs`: его используют студия Aster и установщик, а тест проверяет, что каждый ключ задан в config и в `applyToAllProfiles`.
- ⚠️ Не добавлять туда ключи, которых нет в registry хоста: legacy `notebook.outputFontFamily` строка в коде хоста есть, но настройка незарегистрирована — проверено живым CI-тестом, из-за неё установка падала.
- Ограничение (не баг): шрифт самого workbench-хрома (explorer, вкладки) настройкой не меняется — в этом IDE нет поддерживаемого API.

### 3.9 Терминал и Explorer
- `terminal.integrated.defaultProfile.windows: Git Bash` + профиль с `${GIT_BASH_PATH}` — путь **подставляет установщик** (`lib/paths.js`), Git Bash обязателен.
- `explorer.confirmDelete/confirmDragAndDrop/confirmPasteNative: false` — без лишних подтверждений; `decorations.colors/badges: false` (и `workbench.editor.decorations.colors/badges: false` для вкладок: имя файла с ошибкой не красится в красный) — чистое дерево файлов.

### 3.10 Безопасность и AI
- `security.workspace.trust.untrustedFiles: open` — IDE не блокирует файлы (доверие управляется осознанно).
- `chat.tools.terminal.autoApprove` — белый список команд, которые AI-агент может выполнять без спроса: только чтение/сборка (`npm run dev/build/lint`, `npm install`, `git add/commit/status`, `npx tsc --noEmit`). Всё остальное — спросить. **Не расширять без явного запроса пользователя**; удалённые записи (`false`) сохраняются при обновлениях.
- `inlineChat.holdToSpeech: false` и беззвучные `accessibility.signals.voiceRecordingStarted/Stopped` — голосовые фичи IDE не срабатывают случайно (это же дублируется негативными keybindings, §4). Ключи `accessibility.voice.autoSynthesize/keywordActivation/speechTimeout` убраны в 3.4.0: Antigravity 2.6.0 их не регистрирует (проверка всех настроек в настоящей IDE после команды 1), IDE их игнорировала и подчёркивала как неизвестные; установка удаляет их и из старых профилей.

### 3.11 Вычисляемые ключи (не хардкодить!)
- `jellyCursor.workbenchHtmlPath: ${ANTIGRAVITY_WORKBENCH_HTML}` — установщик подставляет путь к workbench.html найденной IDE; по нему Workstation Stability находит файл для патча Jelly Cursor.
- `terminal.integrated.profiles.windows.Git Bash.path: ${GIT_BASH_PATH}` — подставляется из найденного Git Bash.
- `typescript.tsserver.maxTsServerMemory` — из объёма RAM.
- **Jelly Cursor** (`iranon.jelly-cursor` 0.0.8, MIT) — ставится всегда как local VSIX `extensions/jelly-cursor/`. Upstream объявляет engine `^1.120.0`, и Antigravity (1.107) его отклоняет, хотя использует только старые API. Пакет пересобран `scripts/package-jelly-cursor.cjs`: код байт-в-байт upstream, изменён только engine → `^1.107.0` (`upstream.json` хранит hash оригинала; тест `test-jelly-cursor.mjs`). Проверено живым CLI: upstream — «Failed Installing», пересобранный — «successfully installed».
- Профиль для долгой работы с кодом — мягкий и плавный, глаза не устают: `animationMode: smooth` — курсор просто плавно «плывёт» к новому месту без растяжения и пружины (`midSpeed 0.26`, около четверти секунды), `shapeStyle: rounded`, слабое свечение только при движении (`glowOpacity 0.3 / glowIntensity 1 / glowSize 8`), без следа (`trailEnabled: false`, нет «призрачных» отметок). В покое курсор мягко мигает вместе с родным `cursorBlinking: smooth` и в нижней точке остаётся едва видимым (`minAlpha 0.12`). IDE мигает всем слоем `.cursors-layer`, а Jelly читает прозрачность самого `.cursor`, поэтому без помощи нарисованный курсор не мигал: Stability 1.3.24 после каждой установки патча дописывает в `jelly-cursor.js` короткий блок `workstation-blink`, который переносит прозрачность слоя активного редактора на курсор Jelly. Сама IDE прекращает мигание после 20 циклов (около 10 секунд покоя); с Stability 1.3.25 этот блок продлевает мягкое мигание (`animation-iteration-count: infinite`), а при наборе текста курсор, как обычно, не мигает. Проверено в живой IDE через локальный порт отладки: через 15 секунд после клика прозрачность курсора Jelly продолжает идти 1 → 0.39 → 0.12 → 0.74 → 1. Выключено всё, что мелькает вокруг текста: ripple (круг при клике), spark (`sparkAmount 0`, пузырьки), landingPulse, rainbow, gradient и напоминания Jelly (`reminders: false` — патч ставит Stability). Прыжки дальше 400 px не анимируются. `cursorColor`/`glowColor` = `""` — цвет курсора из темы. Значения, которые записали прошлые версии setup, обновление переводит на этот профиль (`RETIRED_MANAGED_VALUES` в `lib/profile-settings.js`); любое другое значение — личный выбор и сохраняется.
- DOM-патч ставится **сам**: Workstation Stability при старте IDE (`jelly-patch.cjs`) вызывает родную команду `jellyCursor.installDomPatch`, если маркера в `workbench.html` нет (первая установка или обновление IDE стёрло патч). Эффекты видны после **второго** запуска IDE. Проверено на копии Antigravity 2.6.0: патч поставлен автоматически, после перезапуска слой `.jelly-cursor-layer` рисует курсор с trail, в строке состояния «✓ Jelly Cursor».
- **Интерфейсный блок** (`extensions/workstation-stability/workbench-ui.cjs`, Stability 1.3.28): `workbench.html` загружает собственный `workstation-ui.js`. Он скрывает строки «Ctrl+L for Agent» и «Explain and Fix Problem» и раз в секунду читает `workstation-ui.css`, который пишет Aster Atelier, — галочка «шрифт для всего интерфейса» меняет шрифт меню, панелей и вкладок без перезапуска. Установщик (команды 1 и 2) добавляет блок, пока IDE закрыта, поэтому он работает с первого запуска; после обновления IDE его возвращает Stability через 60 секунд после старта (тогда — после одного перезапуска). Раньше этот код дописывался в `jelly-cursor.js` и работал только после патча Jelly и перезапуска; старая копия удаляется. Doctor проверяет блок и сумму в `product.json`.
- Целостность IDE: любой патч `workbench.html` вызывает «installation appears to be corrupt», а у Antigravity в этом уведомлении нет кнопки «Don't Show Again». По явному разрешению пользователя Stability (`syncIntegrity`) после патча переписывает **одну** запись `checksums["vs/code/electron-browser/workbench/workbench.html"]` в `product.json` IDE: только если рядом есть `workbench.html.jelly-cursor-backup` или в файле есть блок `workstation-ui`, форматирование и остальные суммы не меняются. Проверено на копии IDE 2.6.0: предупреждения нет. Команда `installDomPatch` ждёт закрытия своего сообщения, поэтому Stability ждёт сам файл, а не команду. IDE хэширует файлы один раз за сессию, когда запуск завершён, то есть в момент активации расширений `onStartupFinished`. Поэтому Stability 1.3.22 ставит патч только через 60 секунд (`scheduleJellyPatch`), иначе проверка видит новый файл со старой суммой и предупреждение появляется в этой сессии. Jelly записывает свои настройки внутрь внедрённого скрипта, поэтому Stability 1.3.23 запоминает применённые настройки (`jellyCursor.appliedSettings` в globalState) и переустанавливает патч, когда они изменились.

### 3.12 Прочее
- `files.associations` (.jsx/.tsx/.env), `files.watcherExclude`/`search.exclude` (node_modules, dist, .git) — скорость и корректные типы файлов.
- `extensions.autoUpdate/autoCheckUpdates: true` — gallery-расширения обновляются сами; local VSIX (Aster, Stability) обновляет установщик по SHA-pin.
- `better-comments.tags`, `highlight-matching-tag.*`, `gutterpreview.*` — настройка соответствующих gallery-расширений.
- `calmTypeScript.*` — настройки собственного расширения Calm TypeScript (тихий режим, мягкий пульс печати (alpha ≤ 0.14), подсветка строки курсора на 0,3 с после ручного сохранения Ctrl+S — `savePulse`, автосохранение не мигает). Само расширение ничего не сохраняет: автосохранение 1 с делает IDE (`files.autoSave: afterDelay`), поэтому Format On Save не срабатывает во время набора.
- `window.menuBarVisibility: compact`, `workbench.editor.empty.hint: hidden` — минимализм UI.
- `workbench.editorAssociations: {*.vsix: default}` — VSIX открывается штатно (нужно для установки расширений из VSIX).

## 4. config/keybindings.json — каждая клавиша и почему

| Клавиша | Команда | Зачем |
|---|---|---|
| `tab` | `acceptSelectedSuggestion` | **Главный фикс**: когда меню подсказок открыто и сниппет выделен, Tab принимает его (раньше Tab перехватывал Emmet → `rfc` давал `<rfc></rfc>`). Guards обязательны: `suggestWidgetVisible && suggestWidgetHasFocusedSuggestion && !editorReadonly && !tabMovesFocus` — вне меню Tab ведёт себя как раньше (indent/Emmet). Этот binding дублируется в `extensions/workstation-stability/package.json` (обязан совпадать — тест следит) и применяется через helper во всех профилях. |
| `ctrl+shift+f` / `ctrl+alt+f` / `shift+alt+f` | `editor.action.formatDocument` | Форматирование одной клавишей: Prettier ставит отступы и стиль. Alt+Shift+F закреплён явно, чтобы другое расширение не перехватило его. |
| `ctrl+space` / `alt+space` | `editor.action.triggerSuggest` | Принудительное меню подсказок. |
| `ctrl+m`, `enter`, `shift+enter`, `ctrl+enter`, `m` → `-команда` | отключение голосовых команд Antigravity (`-antigravity.startVoiceRecording`, `-workbench.action.speech.*`) | Голосовой ввод срабатывал случайно при обычной печати (Ctrl+M/Enter) — отключён; `m` больше не останавливает запись. |

## 5. config/extensions.json — каталог 23 расширений

- `source: gallery` + `trackLatest: true` — ставится latest compatible через официальный CLI (без пинования версий — версия записывается после установки).
- `source: local-vsix` — собственные расширения с SHA-256 pin в `manifest.json`: `workstation.aster-appearance` (1.6.0, 22 палитры без повторов с общим набором из 22 ролей кода — карточками в 5 группах: Antigravity, VS Code, тёмные спокойные, тёмные яркие, светлые; тема ставится одним кликом; 10 шрифтов с лигатурами, яркость/контраст, шрифт интерфейса без перезапуска), `workstation.stability-helper` (1.3.28 — применяет профиль, чинит known vendor issues через maintenance, возвращает интерфейсный блок после обновления IDE), `workstation.calm-typescript`, `workstation.git-branch-panel`.
- Live-Server и авто-импорт-провайдеры **намеренно отсутствуют** — встроенный TypeScript владеет импортами.
- Каждый entry содержит описание и категорию; состав поддерживается тестами (`test-verified-extension-install`, `test-clean-extensions`).

## 6. Темы Aster Atelier — generated, руками не править

`extensions/aster-appearance/themes/<имя>.json` (22 файла) генерируются `scripts/build-aster.cjs` из `palettes.cjs`. Каждая палитра задаёт ~570 цветов: все ключи встроенных тем Default и все видимые части IDE (сайдбар, панели, вкладки, меню, виджеты, уведомления, терминал, diff, чат Antigravity) плюс правило для каждого синтаксиса базовой темы — ни один угол не остаётся «чужого» цвета. Список ключей IDE лежит в `scripts/aster-color-registry.json`; тест проверяет, что каждый ключ существует, покрывает базовую тему и что контраст текста ≥ 4.5. С 1.4.0 все темы окрашивают одни и те же 22 роли кода (одна карта TextMate-скоупов и semantic-токенов в `build-aster.cjs`), комментарии ≥ 5:1, ключевые роли заметно различаются (`tests/test-aster-themes.mjs`).

Палитры **не регистрируются** как темы IDE: встроенный выбор темы (кнопка «Задать цветовую тему», Ctrl+K Ctrl+T) меняет тему при наведении, и отключить это нельзя. Aster пишет цвета как theme-scoped `workbench.colorCustomizations` / `editor.tokenColorCustomizations` / `editor.semanticTokenColorCustomizations` для базы `Visual Studio Dark`/`Visual Studio Light` (не Default Modern — это тема самой Antigravity) и выбирает эту базу; имя палитры хранится в `asterAppearance.theme`. Тема меняется кликом по карточке в студии (сразу, без кнопки) или кликом/Enter в списке «Aster Atelier: Выбрать тему». С 1.2.0 палитры повторяют цвета популярных тем (One Dark Pro, Dracula, Tokyo Night, Catppuccin, GitHub, Night Owl… — источники в `extensions/aster-appearance/THEMES.md`); у каждой свои цвета ролей кода, тусклые цвета подняты до 4.6:1. Старые названия (`oceanic pro`, `nord polar`, `git hab light`, `ligth`…) при запуске сами переводятся на ближайшую новую палитру (`palettes.legacy`). Личные цвета для всех тем (`workbench.colorCustomizations` без скобок) по-прежнему имеют приоритет.

Шрифты: все 10 семейств (JetBrains Mono, Fira Code, Cascadia Code, Victor Mono, Lilex, Kode Mono и Monaspace Argon/Xenon/Radon/Krypton Var) лежат в расширении; установщик (`ensureAsterFonts`) и само расширение при старте ставят недостающие для текущего пользователя из этих файлов — без скачивания, один раз на версию шрифта (запись `installed-fonts.json` в globalStorage). «Применить шрифт» включает проверенные OpenType features в `editor.fontLigatures`: для Monaspace также `ss01`–`ss10`. Шрифт, размер, толщина и одно из 7 начертаний применяются вместе кнопкой «Применить шрифт»; неподдерживаемая толщина отключена в списке. Курсив реально включается для всего кода (одно собственное TextMate-правило + `italic` у semantic `*`, «Обычный» удаляет только их).

После правки palettes/build-aster: `node scripts/build-aster.cjs && node scripts/package-aster.cjs` — он обновит темы, `package.json`, VSIX и `manifest.json` (SHA-pin). Порядок версий должен соответствовать `config/extensions.json`. Прозрачные errorLens-ключи добавлены именно в build-aster (CI пересобирает темы и отбрасывает ручные правки JSON — это ловится тестом).

## 7. Хронология: какой баг каким решением закрыт

1. Жёлтые блоки подсказок Tailwind на всю строку → прозрачные `errorLens.*Background(+Light/Message/Range)` + Foreground alpha 26 (была причина: Light-варианты не были перекрыты).
2. Tab принимал Emmet вместо React-сниппета → keybinding `tab → acceptSelectedSuggestion` с узкими guards.
3. Шрифт применялся только к редактору → 10 font-family ключей (+ `editor.fontSize`, `window.zoomLevel` = 12 записей) в `applyToAllProfiles`; с 3.0.29 все 10 ключей заданы и в config, а `--apply-profile` не разводит шрифты редактора и терминала.
4. Шрифт не устанавливался (`UnauthorizedAccess`) → `install-font.ps1` вызывается только с `-ExecutionPolicy Bypass` (`font-service.cjs`, `lib/font.js`).
5. Тема менялась без клика (нативный preview-пикер) → с Aster 1.1.0 палитры не регистрируются как темы IDE, поэтому кнопки «Задать цветовую тему» больше нет; выбор — только клик по карточке в студии или клик/Enter в «Aster Atelier: Выбрать тему».
6. Новые managed-ключи не доходили до старых установок → фикс merge (объекты + union + починка мёртвого regex `\\[`); регрессия-тест обязателен.
7. Обновление Stability падало (ENOENT при backup `media/`) → `backupRegisteredHelper` создаёт подкаталоги.
8. Theme change на странице Studio без Apply → Apply/Cancel: просмотр не коммитит, Cancel возвращает.
9. Обычная установка падала на непроверенной версии IDE → native-preflight только для `--auto-approve`/`--quiet-completion`; каталог `config/native-compatibility.json`: 2.6.0 (исправлена мёртвая ссылка 404), 2.5.5, 2.5.2 (проверка встроенной схемы). Регрессия-тест: `test-installer-preflight.mjs`.
10. Цвета Calm TypeScript (11 ключей) расходились с config (27) → `QUIET_COLORS` = ровно управляемые ключи config, тест `test-calm-typescript.mjs` сверяет.
12. Turbo Console Log убран по запросу пользователя: нет в каталоге, 4 ключа `turboConsoleLog.*` удалены из config; у старых установок расширение архивируется в `~/.gemini/backups` (`RETIRED_EXTENSIONS` → `true`), а их `turboConsoleLog.*` удаляются из settings.json (`RETIRED_SETTING_PREFIXES`).
11. Старые папки Aster копились в профиле → после установки архивируются в `~/.gemini/backups` (`archiveStaleExtensionDirs`).
13. «Installation appears to be corrupt» в первой сессии после патча Jelly → патч через 60 секунд после запуска, после проверки целостности IDE (Stability 1.3.22).
14. Части IDE оставались цвета базовой темы, 20 палитр с дублями и опечатками в названиях → 17 палитр с полным покрытием (~570 цветов), имена исправлены, старые переводятся автоматически (Aster 1.1.0).
15. Код выглядел бесцветным: в 14 из 20 палитр переменные, `const`, свойства и параметры оставались цветом простого текста; три палитры повторяли другие (Monokai ≈ Dracula, Material Palenight ≈ Tokyo Night, Shades of Purple ≈ Cobalt2); Quiet Light и Solarized Dark рисовали код ниже 4.5:1 и делали функции/типы жирными при выбранном «Обычный» → 17 палитр без повторов (сохранённый выбор открывает двойника), имена получают рекомендованный VS Code цвет (Dark+ светло-голубой, Light+ тёмно-синий), текст от 7:1, в стандартных темах тусклые цвета поднимаются до 4.6:1, выбранный стиль действует во всех темах (Aster 1.3.0).
15. Шрифт требовал скачивания, «Font exists in the OS but is not available in this renderer», курсив только для предпросмотра → шрифты из расширения, кнопка «Применить шрифт», настоящий курсив (Aster 1.1.0).
16. Имя вкладки с ошибкой красилось в красный → `workbench.editor.decorations.colors/badges: false`.
17. Новые настройки Jelly не применялись к уже стоящему патчу → Stability 1.3.23 переустанавливает патч при их изменении.

## 8. Где код и как проверять

| Задача | Код | Проверка |
|---|---|---|
| Применение settings/keybindings | `lib/installer.js`, `lib/profile-settings.js` | `npm test`, `tests/test-install-modes.mjs`, `tests/test-personal-config-preservation.mjs` |
| Темы и шрифты (студия) | `extensions/aster-appearance/` | `node --test tests/test-aster-appearance.mjs`; live: `node tests/aster-editor.cjs` |
| Профиль/конфликты/восстановление | `extensions/workstation-stability/` | `npm run test:extension-settings`, `test:profile-keybindings` |
| Установка | `scripts/bootstrap.ps1`, `bin/workstation-setup.js` | `npm run test:bootstrap` (PS 5.1), `test:bootstrap:network` (pwsh 7, CI) |
| Шрифты ОС | `extensions/aster-appearance/font-service.cjs` | live-тест в CI (`ASTER_VERIFY_FONT_INSTALL=1`) |

## 9. Правила для ИИ/разработчика

1. Personal-ключи (§2) не перетирать значениями из `config/` — новые managed-ключи добавляются, старые личные значения остаются.
2. Темы и manifest — только через build-скрипты; версию Aster поднимать при любом изменении payload.
3. `errorLens.*`/шрифты менять **симметрично**: config/settings.json + build-aster.cjs (для тем) + тесты.
4. `chat.tools.terminal.autoApprove` и `security.workspace.trust.*` — только по явному запросу пользователя.
5. Каждый фикс настроек сопровождай регрессия-тестом (примеры в test-stability, test-personal-config-preservation, test-install-modes) — без теста CI-регрессии неизбежны.
6. Прямой push в `main` разрешён; PR/force-push — нет.
