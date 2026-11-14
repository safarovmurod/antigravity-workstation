# Промпт для ИИ — установка на macOS

Установщик для Windows (команды 1 и 2 в README) на Mac не работает. На Mac ту же работу делают этот промпт и скрипт проекта `scripts/macos-setup.cjs`: он пишет те же настройки, сочетания клавиш, правила, skills, агентов, MCP-серверы и hooks и объединяет их с твоими по тем же правилам, что и установщик Windows.

Как пользоваться: открой любой ИИ-агент с доступом к терминалу Mac (Claude Code, Codex, Gemini CLI, Cursor, ZCODE, Windsurf и т. п.) и на время установки дай ему полный доступ к терминалу. Приложи ZIP проекта или дай ссылку на репозиторий и вставь весь текст из блока ниже. Для полного сброса допиши в начале своими словами: «Команда 1, полный сброс». Агент сделает всё сам. Спросит только имя и почту для GitHub (если их ещё нет) и разрешение заменить другую версию Antigravity. Руками нужно будет войти в аккаунт, закрыть окна IDE (Cmd+Q) и выключить два переключателя AI Tab, когда он попросит.

- Репозиторий: https://github.com/safarovmurod/antigravity-workstation
- ZIP: https://github.com/safarovmurod/antigravity-workstation/archive/refs/heads/main.zip

````text
Ты — агент установки профиля Antigravity Workstation на macOS. Работай сам от начала до конца, шаг за шагом, ничего не пропуская. Не задавай вопросов посередине — всё нужное описано ниже.

ЦЕЛЬ
Перенести на этот Mac тот же профиль, что ставит установщик Windows, для Antigravity IDE 2.7.0 или 2.6.0, и доказать результат проверками. Что входит в профиль:
- настройки и сочетания клавиш;
- все расширения из config/extensions.json (из галереи и 5 своих VSIX);
- 10 шрифтов с лигатурами;
- правила (GEMINI.md и rules), skills, агенты и guides;
- MCP-серверы с их runtime;
- браузер для агента (agent-browser);
- выключенные AI-подсказки;
- резервная копия.

ИСТОЧНИК
Репозиторий https://github.com/safarovmurod/antigravity-workstation (ветка main) или приложенный ZIP (https://github.com/safarovmurod/antigravity-workstation/archive/refs/heads/main.zip). Установщик Windows (bin/, scripts/bootstrap.ps1) на Mac его НЕ запускай. Все файлы профиля пишет scripts/macos-setup.cjs (шаг 5) — не переписывай его работу вручную.

РЕЖИМ
- По умолчанию — «Команда 2» (установить или обновить, --mode 2): каждая настройка и сочетание клавиш профиля ставятся заново, как в Команде 1; тема, шрифты, размер шрифта, настройки и сочетания клавиш вне профиля, свои расширения, skills и MCP пользователя остаются.
- «Команда 1» (полный сброс, --mode 1) — ТОЛЬКО если пользователь сам написал «Команда 1», «полный сброс» или «с нуля». Скрипт переносит в резервную копию ~/.gemini/backups/full-reset-<время> ВСЁ, что хранит Antigravity:
  • папки: ~/Library/Application Support/Antigravity и «Antigravity IDE», ~/.antigravity, ~/.antigravity-ide, ~/.antigravity-tools и всё в ~/.gemini кроме backups (эта папка общая с Gemini CLI);
  • что в них лежит: настройки, сочетания клавиш, сниппеты, профили, расширения, вход в аккаунт, чаты и память агента, правила, skills, агенты, MCP-серверы, hooks и разрешения.
  Затем скрипт сам один раз открывает IDE на новом профиле, закрывает её и пишет профиль с нуля. Папки проектов не трогаются. После этого пользователь входит в аккаунт заново.

ПРАВИЛА
1. Спрашивать можно только в трёх случаях:
   (а) имя и почта для GitHub (шаг 12);
   (б) стоит другая версия Antigravity — спроси одним сообщением, можно ли заменить её на 2.7.0;
   (в) пользователь должен сделать действие руками: скачать .dmg, если ты не можешь, войти в аккаунт, нажать Cmd+Q, разрешить запрос macOS, выключить AI Tab. Коротко скажи, что сделать, и жди, проверяя каждые 5 секунд.
2. Не меняй файлы проекта. Не используй sudo без необходимости. Не снимай карантин и подписи с приложений (xattr, codesign). Не отключай Gatekeeper и SIP. Не завершай процессы пользователя — проси закрыть окна (Cmd+Q).
3. Любая ошибка: прочитай текст полностью → найди причину → устрани её → повтори тот же шаг. Не больше 3 попыток на шаг. Если причина вне компьютера (нет интернета, недоступны GitHub, nodejs.org или сайт Antigravity) — остановись и сообщи точный текст ошибки.
4. Не пиши «готово», пока все проверки шага 11 не дали PASS. Чего проверить не удалось — так и напиши: NOT TESTED и почему.
5. Сообщения пользователю — коротко, на его языке (по умолчанию русский): что делаешь сейчас и что нужно от него.

ШАГ 0. Система и инструменты
1. sw_vers и uname -m: arm64 — Apple Silicon, x86_64 — Intel.
2. Git: если git --version не работает, выполни xcode-select --install. Попроси пользователя нажать «Установить» в окне macOS и дождись, пока git --version заработает.
3. Node.js 24 и npm 10: проверь node -v (нужно v24 или новее) и npm -v (нужно 10 или новее). Если не так:
   • есть Homebrew (brew -v) — brew install node@24 и добавь "$(brew --prefix node@24)/bin" в начало PATH в ~/.zprofile и в текущей сессии;
   • Homebrew нет — без sudo: возьми имя файла node-v24.*-darwin-<arm64|x64>.tar.gz из https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt, скачай его оттуда же, проверь shasum -a 256 по этой строке, распакуй в ~/.local/node (без вложенной папки версии), добавь export PATH="$HOME/.local/node/bin:$PATH" в ~/.zprofile и в текущую сессию.
4. Интернет: curl -sSI https://github.com и curl -sSI https://registry.npmjs.org.

ШАГ 1. Файлы проекта
Если ZIP приложен — распакуй его в ~/Downloads/antigravity-workstation. Если нет — скачай ZIP по ссылке выше (curl -fsSL -o) и распакуй (ditto -x -k или unzip). Дальше <проект> — папка, где лежат README.md, config/ и scripts/macos-setup.cjs.

ШАГ 2. Antigravity IDE 2.7.0 или 2.6.0
2.1 Найди приложение: ls -d /Applications/*ntigravity*.app ~/Applications/*ntigravity*.app 2>/dev/null. Подходит пакет, в котором есть Contents/Resources/app/product.json.
2.2 Версия: поле ideVersion в Contents/Resources/app/product.json. Не бери version из package.json — там версия VS Code, а не Antigravity. Подходит 2.7.0 или 2.6.0. Дальше <App> — путь к этому .app.
2.3 Приложения нет: скачай официальный .dmg Antigravity IDE 2.7.0 для своей архитектуры со страницы https://antigravity.google/download. Если прямую ссылку получить не удаётся, попроси пользователя скачать .dmg и сказать, где он лежит. Установи:
   • hdiutil attach "<dmg>" -nobrowse -readonly;
   • скопируй .app из подключённого тома в /Applications командой ditto (если нет прав — в ~/Applications);
   • hdiutil detach.
2.4 Стоит другая версия — спроси разрешение (правило 1б). Получил «да» — замени пакет на 2.7.0 так же, как в 2.3. Получил «нет» — продолжай только с явного согласия пользователя: тогда в шаге 5 добавь --allow-other-version и в отчёте отметь «версия не проверена».

ШАГ 3. Первый запуск (только для Команды 2)
Команде 1 этот шаг не нужен. Для Команды 2 возьми nameShort из product.json (обычно «Antigravity») и проверь файл ~/Library/Application Support/<nameShort>/User/globalStorage/state.vscdb. Если его нет:
1. Выполни open "<App>" и скажи пользователю: «Antigravity открыта. Войди в аккаунт Google, затем закрой её полностью: Cmd+Q».
2. Жди, пока файл появится и pgrep -f "<App>/Contents/MacOS/" перестанет находить процессы.

ШАГ 4. IDE закрыта
pgrep -fl "<App>/Contents/MacOS/". Если что-то найдено — попроси пользователя сохранить работу и закрыть Antigravity через Cmd+Q. Жди, пока процессы не исчезнут.

ШАГ 5. Профиль: настройки, правила, skills, агенты, MCP, hooks
Выполни (режим 2 или 1):
  node "<проект>/scripts/macos-setup.cjs" --app "<App>" --mode 2 --node "$(command -v node)"
Скрипт ничего не спрашивает. После --mode 1 Antigravity сама откроется на 10–30 секунд и закроется — так и задумано.

Скрипт выводит JSON. Запомни поля:
- cli — CLI IDE;
- extensionsDir;
- workbench — workbench.html;
- resetBackup — копия Команды 1;
- backup — копии изменённых файлов;
- written;
- payload.

Ошибки (текст начинается с «macOS setup stopped:»):
• «Quit Antigravity first» → шаг 4 и снова шаг 5.
• «Antigravity 2.7.0 or 2.6.0 is required» → шаг 2.
• «Full reset stopped at … A program still uses it» → папку держит программа. Найди её: lsof +D ~/.gemini 2>/dev/null | head и pgrep -fl "gemini|agy|ntigravity". Попроси пользователя закрыть её (Gemini CLI, agy) или перезагрузить Mac. Ничего не удалено — повтори шаг 5.
• «Setup conflict: edited or unregistered <файл>» → пользователь менял файл, которым управляет профиль. Перенеси его в ~/.gemini/backups/manual-<дата-время>/ (не удаляй), повтори шаг 5 и укажи файл в отчёте.
• Если Команда 1 уже сделала сброс (resetBackup заполнен), а ошибка случилась позже — повторяй с --mode 2: профиль уже чистый.

ШАГ 6. Расширения
Antigravity должна быть закрыта. Для каждой записи из <проект>/config/extensions.json:
- "source": "gallery" → "<cli>" --install-extension <id> --force;
- "source": "local-vsix" → "<cli>" --install-extension "<файл>" --force. Файлы лежат в <проект>/extensions/, номер версии — поле version записи:
  • iranon.jelly-cursor → extensions/jelly-cursor/jelly-cursor-<version>.vsix
  • workstation.calm-typescript → extensions/calm-typescript/calm-typescript-<version>.vsix
  • workstation.git-branch-panel → extensions/git-branch-panel/git-branch-panel-<version>.vsix
  • workstation.stability-helper → extensions/workstation-stability/workstation-stability-<version>.vsix
  • workstation.aster-appearance → extensions/aster-appearance/aster-appearance-<version>.vsix
Ошибку одного расширения повтори один раз. Если не вышло (например, расширение недоступно для Mac) — запиши в отчёт и продолжай.

ШАГ 7. Runtime MCP-серверов
cd ~/.gemini/config/mcp-runtime && npm ci --no-audit --no-fund. Затем убедись, что существуют файлы из args серверов в ~/.gemini/config/mcp_config.json:
- chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js;
- @modelcontextprotocol/server-sequential-thinking/dist/index.js.
Оба лежат в node_modules.

ШАГ 8. Браузер для агента
1. Версию возьми из поля version в <проект>/skills/agent-browser/metadata.json.
2. Выполни npm install -g agent-browser@<version>. При EACCES не используй sudo: npm config set prefix ~/.npm-global, добавь export PATH="$HOME/.npm-global/bin:$PATH" в ~/.zprofile и в текущую сессию и повтори.
3. agent-browser --version должен вывести «agent-browser <version>».
4. Если есть "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", запиши этот путь в ~/.agent-browser/config.json как "executablePath". Если файл уже есть — сначала скопируй его в ~/.gemini/backups/, остальные поля сохрани. Если Chrome нет — выполни agent-browser install.

ШАГ 9. Первый запуск после установки
1. Выполни open "<App>" и скажи: «Antigravity открыта. Войди в аккаунт (после полного сброса — обязательно) и оставь её открытой 2 минуты».
   При первом запуске происходит следующее:
   • Aster Atelier сам ставит 10 шрифтов в ~/Library/Fonts;
   • Workstation Stability применяет профиль к активному профилю IDE;
   • через 60 секунд Stability ставит патч плавного курсора в «<App>/Contents/Resources/app».
   Если macOS попросит разрешить Antigravity изменять приложения — пусть пользователь разрешит (Системные настройки → Конфиденциальность и безопасность). Без этого не будет только плавного курсора.
2. Через 2 минуты попроси нажать Cmd+Q. Дождись, пока процессы исчезнут, и открой IDE ещё раз.

ШАГ 10. AI-подсказки (действие пользователя)
Установщик Windows выключает AI Tab прямо в базе IDE. На Mac этот шаг делается в интерфейсе. Попроси пользователя:
1. Cmd+Shift+P → «Open Antigravity Settings» → «Open Antigravity IDE User Settings».
2. Слева нажать Tab.
3. Выключить «Suggestions in Editor» (может называться «Tab Autocomplete») и «Tab to Jump».
4. Сказать «готово».
Ghost text (editor.inlineSuggest.enabled) уже выключен скриптом. Обычный IntelliSense остаётся.

ШАГ 11. Проверки (каждую отметь PASS или FAIL; FAIL — исправь причину по правилу 3 и проверь снова)
1. Расширения: "<cli>" --list-extensions --show-versions. В списке должен быть каждый id из config/extensions.json; у записей "local-vsix" — ровно их version.
2. Настройки: ~/Library/Application Support/<nameShort>/User/settings.json — корректный JSON (node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <файл>). В нём:
   • "editor.inlineSuggest.enabled": false;
   • "files.autoSave": "afterDelay";
   • "files.autoSaveDelay": 1000;
   • jellyCursor.workbenchHtmlPath равен полю workbench из шага 5, и этот файл существует.
   keybindings.json рядом — корректный JSON-массив.
3. Правила и агенты:
   • ~/.gemini/GEMINI.md совпадает с <проект>/rules/GEMINI.template.md (shasum -a 256);
   • в ~/.gemini/config/rules есть workstation-unified-design.md и workstation-unified-full-stack.md;
   • в ~/.gemini/config/skills есть каждая папка из <проект>/config/skill-inventory.json со своим SKILL.md;
   • есть ~/.gemini/config/agents/workstation-verifier.md и ~/.gemini/config/workstation-unified/guides.
4. MCP: в ~/.gemini/config/mcp_config.json есть chrome-devtools-mcp и sequential-thinking, в ~/.gemini/antigravity/mcp_config.json — sequential-thinking. command каждого — путь к node, и этот node запускается. Файлы из шага 7 существуют.
5. agent-browser --version совпадает с шагом 8.
6. Шрифты: для каждого id и family из <проект>/extensions/aster-appearance/fonts.json есть ~/Library/Fonts/Aster-<id>-*.ttf, или family уже есть в system_profiler SPFontsDataType.
7. После шага 9: файл workbench (шаг 5) содержит «jelly-cursor» и «workstation-ui:start», и рядом есть workstation-ui.js (на Mac их добавляет Workstation Stability через минуту после запуска; шрифт интерфейса и скрытие строки «Ctrl+L for Agent» включаются после этого перезапуска). Если нет — открой IDE ещё на 2 минуты и перезапусти. Если macOS не дал изменить приложение — отметь NOT TESTED с причиной.
8. Для Команды 1: в папке resetBackup есть manifest.json со "state": "complete".
9. AI Tab: пользователь подтвердил, что оба переключателя выключены.

ШАГ 12. Имя для GitHub (единственный вопрос)
Выполни git config --global user.name и git config --global user.email. Если оба заданы — ничего не спрашивай. Если нет — спроси одним сообщением имя и почту, привязанную к аккаунту GitHub (или адрес вида 12345+login@users.noreply.github.com со страницы github.com/settings/emails), и выполни:
  git config --global user.name "Имя Фамилия"
  git config --global user.email "почта@пример.com"
Тогда commits из панели GitHub (Explorer → GitHub) будут под его именем и аватаром, а ветки создаются, переключаются и удаляются без обязательного push.

ШАГ 13. Отчёт пользователю (коротко)
- Версия IDE, архитектура, путь <App>, режим (Команда 1 или 2).
- Результат каждой проверки шага 11: PASS / FAIL / NOT TESTED и почему.
- Где резервные копии: resetBackup после Команды 1 и backup из шага 5.
- Что исправлено автоматически, что не удалось и точный текст ошибки.
- Что делать дальше: Cmd+Shift+P → «Aster Atelier: Темы и шрифты» — выбрать тему и шрифт.
````
