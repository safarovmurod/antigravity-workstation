# Промпт для ИИ — установка на macOS

Установщик проекта (команды 1 и 2 в README) работает только в Windows. Этот промпт поручает ИИ-агенту перенести тот же профиль на Mac вручную, по файлам проекта.

Как пользоваться: открой любой ИИ-агент с доступом к терминалу Mac (Claude Code, Codex, Gemini CLI, Cursor, ZCODE, Windsurf и т. п.), дай ему полный доступ к терминалу на время установки, приложи ZIP проекта или дай ссылку на репозиторий и вставь весь текст из блока ниже. Агент сделает всё сам и спросит только одно — имя и почту для GitHub, если их ещё нет.

- Репозиторий: https://github.com/safarovmurod/antigravity-workstation
- ZIP: https://github.com/safarovmurod/antigravity-workstation/archive/refs/heads/main.zip

````text
Ты — агент установки профиля Antigravity Workstation на macOS. Работай сам от начала до конца. Не задавай вопросов посередине: всё нужное описано ниже. Единственный вопрос — имя и почта для GitHub в шаге 9, и только если их нет.

Источник: репозиторий https://github.com/safarovmurod/antigravity-workstation (ветка main) или приложенный ZIP (https://github.com/safarovmurod/antigravity-workstation/archive/refs/heads/main.zip). Скачай и распакуй его во временную папку, например ~/Downloads/antigravity-workstation. Установщик проекта (bin/, scripts/bootstrap.ps1) рассчитан на Windows — на Mac его НЕ запускай; переноси профиль по файлам, как описано ниже.

Правила работы:
- Сначала резервная копия (шаг 3), потом изменения. Ничего не удаляй без копии.
- Личные настройки пользователя, которых нет в профиле, сохраняй как есть. Не трогай аккаунт, чаты, ключи и токены.
- Каждую ошибку читай полностью, исправляй причину и повторяй шаг (максимум 3 попытки). Если причина вне компьютера — остановись и сообщи точный текст.
- Не пиши «готово», пока не выполнены проверки шага 8.

Шаг 0. Система: `sw_vers` и `uname -m` (arm64 — Apple Silicon, x86_64 — Intel). Нужны git (если `git --version` не работает — `xcode-select --install`) и Node.js 24 (если `node -v` меньше 24 — установи LTS с https://nodejs.org).

Шаг 1. Antigravity IDE. Найди приложение: `ls -d /Applications/*ntigravity*.app ~/Applications/*ntigravity*.app 2>/dev/null`. Если его нет — скачай с https://antigravity.google/download для своей архитектуры, установи и попроси пользователя один раз открыть IDE, войти и полностью закрыть (Cmd+Q). Версию возьми из `<App>/Contents/Resources/app/package.json` (version). Профиль проверялся на 2.6.0; другую версию отметь в отчёте как «не проверено», но продолжай.

Шаг 2. Пути. Прочитай `<App>/Contents/Resources/app/product.json` и возьми:
- nameShort → папка настроек: ~/Library/Application Support/<nameShort>/User (settings.json, keybindings.json);
- dataFolderName → папка расширений: ~/<dataFolderName>/extensions;
- applicationName → CLI: `<App>/Contents/Resources/app/bin/<applicationName>`.
Убедись, что IDE закрыта (`pgrep -fl -i antigravity`); если открыта — попроси закрыть (Cmd+Q) и жди.

Шаг 3. Резервная копия: скопируй папку User из шага 2 и ~/.gemini (если есть) в ~/antigravity-workstation-backup-<дата-время>/.

Шаг 4. Настройки. Возьми config/settings.json из проекта и объедини с текущим settings.json пользователя: значения из профиля записываются поверх, остальные ключи пользователя остаются. Пропусти или замени ключи только для Windows:
- terminal.integrated.profiles.windows и terminal.integrated.defaultProfile.windows — не переносить;
- jellyCursor.workbenchHtmlPath = `<App>/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html` (если файла нет — найди workbench.html внутри `<App>/Contents/Resources/app/out` и укажи его);
- typescript.tsserver.maxTsServerMemory = меньшее из 4096 и (RAM в МБ / 4), RAM — `sysctl -n hw.memsize`.
Результат должен быть корректным JSON (проверь `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <файл>`).
Сочетания клавиш: объедини config/keybindings.json с keybindings.json пользователя (записи профиля добавить, свои записи пользователя оставить).

Шаг 5. Расширения через CLI из шага 2 (с IDE в закрытом состоянии):
- из config/extensions.json возьми все записи с "source": "gallery" и для каждой выполни `"<CLI>" --install-extension <id>`;
- записи с "source": "local-vsix" ставь из файлов проекта: extensions/jelly-cursor/jelly-cursor-<version>.vsix, extensions/calm-typescript/calm-typescript-<version>.vsix, extensions/git-branch-panel/git-branch-panel-<version>.vsix, extensions/workstation-stability/workstation-stability-<version>.vsix, extensions/aster-appearance/aster-appearance-<version>.vsix (версии — из того же config/extensions.json): `"<CLI>" --install-extension <путь к .vsix> --force`.
Если расширение из галереи недоступно для Mac — отметь его в отчёте и продолжай.

Шаг 6. Правила, skills и агенты Gemini:
- rules/GEMINI.template.md → ~/.gemini/GEMINI.md;
- остальные rules/*.template.md → ~/.gemini/config/rules/<имя без .template>.md;
- папки skills/* → ~/.gemini/config/skills/;
- agents/*.md → ~/.gemini/config/agents/;
- resources/guides/* → ~/.gemini/config/workstation-unified/guides/.
Если у пользователя уже есть свой файл с тем же именем и другим содержимым — сохрани его в резервной копии из шага 3 и только потом заменяй.

Шаг 7. Шрифты: ничего копировать не нужно — Aster Atelier при первом запуске сам ставит свои 15 шрифтов в ~/Library/Fonts из файлов внутри расширения. Не копируй .ttf вручную, иначе шрифты задвоятся.

Шаг 8. Проверки:
- `"<CLI>" --list-extensions --show-versions` — все расширения из шага 5 в списке;
- settings.json и keybindings.json — корректный JSON;
- ~/.gemini/GEMINI.md и ~/.gemini/config/skills/workstation-workflow/SKILL.md существуют;
- открой IDE, дождись загрузки и закрой — в логе нет ошибок активации Aster Atelier (Output → Aster Atelier), если доступно.

Шаг 9. Имя для GitHub (единственный вопрос). Выполни `git config --global user.name` и `git config --global user.email`. Если оба заданы — ничего не спрашивай. Если нет — спроси у пользователя одним сообщением имя и почту, привязанную к его аккаунту GitHub (или адрес вида 12345+login@users.noreply.github.com из github.com/settings/emails), и выполни:
  git config --global user.name "Имя Фамилия"
  git config --global user.email "почта@пример.com"
Тогда commits из панели GitHub (Explorer → GitHub) будут под его именем и аватаром, а ветки создаются, переключаются и удаляются без обязательного push.

Шаг 10. Отчёт пользователю (коротко): версия IDE и архитектура; что перенесено; где резервная копия; что не удалось и почему. Напомни: открыть Antigravity, через минуту полностью закрыть (Cmd+Q) и открыть снова — тогда включаются плавный курсор и правки интерфейса. Прозрачность окна в Aster Atelier работает только в Windows.
````
