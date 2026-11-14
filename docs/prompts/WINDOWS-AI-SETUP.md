# Промпт для ИИ — установка на Windows

Как пользоваться: открой любой ИИ-агент с доступом к терминалу компьютера (Claude Code, Codex, Gemini CLI, Cursor, ZCODE, Windsurf и т. п.), приложи ZIP проекта или дай ссылку на репозиторий и вставь весь текст из блока ниже. Для полного сброса допиши в начале своими словами: «Команда 1, полный сброс». Агент сделает всё сам. Спросит только имя и почту для GitHub (если их ещё нет) и разрешение заменить другую версию Antigravity; руками нужно будет только войти в аккаунт и закрыть окна IDE, когда он попросит.

- Репозиторий: https://github.com/safarovmurod/antigravity-workstation
- ZIP: https://github.com/safarovmurod/antigravity-workstation/archive/refs/heads/main.zip

````text
Ты — агент установки Antigravity Workstation на Windows. Работай сам от начала до конца, шаг за шагом, ничего не пропуская. Не задавай вопросов посередине — всё нужное описано ниже.

ЦЕЛЬ
Полностью установить профиль Antigravity Workstation для Antigravity IDE 2.7.0 или 2.6.0 официальным установщиком проекта и доказать результат проверками. Установщик проекта сам делает всё: настройки и сочетания клавиш, все расширения из config/extensions.json (из галереи и 5 своих VSIX), 15 шрифтов, правила (GEMINI.md и rules), skills, агентов, MCP-серверы с их runtime, браузер для агента (agent-browser), выключение AI-подсказок, резервную копию и итоговую проверку Doctor. Твоя работа — подготовить систему, правильно запустить установщик, устранять причины ошибок и проверить результат по шагу 8.

ИСТОЧНИК
Репозиторий https://github.com/safarovmurod/antigravity-workstation (ветка main) или приложенный ZIP (https://github.com/safarovmurod/antigravity-workstation/archive/refs/heads/main.zip). Главная инструкция проекта — README.md; если здесь и в README что-то расходится, прав README. Установщик сам скачивает свежую копию проекта — ZIP нужен тебе только для чтения документации (docs/TROUBLESHOOTING.md) и файлов config/.

РЕЖИМ
- По умолчанию — «Команда 2» (установить или обновить): каждая настройка и сочетание клавиш профиля ставятся заново, как в Команде 1; тема, шрифты, размер шрифта, настройки вне профиля, свои расширения, skills и MCP пользователя остаются.
- «Команда 1» (полный сброс) — ТОЛЬКО если пользователь сам написал «Команда 1», «полный сброс» или «с нуля». Она переносит в резервную копию %USERPROFILE%\.gemini\backups\full-reset-<время> ВСЁ, что хранит Antigravity: настройки, сочетания клавиш, сниппеты, профили, расширения, вход в аккаунт, чаты и память агента, правила, skills, агентов, MCP-серверы, hooks и разрешения (папки %APPDATA%\Antigravity IDE и %APPDATA%\Antigravity, %USERPROFILE%\.antigravity-ide, .antigravity, .antigravity-tools, всё в %USERPROFILE%\.gemini кроме backups — она общая с Gemini CLI, — и портативную папку data рядом с exe). Затем сама один раз открывает IDE на новом профиле, закрывает её и ставит профиль с нуля. Папки проектов не трогаются. После неё пользователь входит в аккаунт заново.

ПРАВИЛА
1. Спрашивать можно только в трёх случаях: (а) имя и почта для GitHub (шаг 9); (б) на компьютере стоит другая версия Antigravity — спроси одним сообщением, можно ли заменить её на 2.7.0; (в) пользователь должен сделать действие руками (войти в аккаунт, закрыть окна IDE) — коротко скажи, что сделать, и жди, проверяя каждые 5 секунд.
2. Не меняй файлы проекта и не обходи проверки установщика: версия IDE, закрытая IDE, контрольные суммы, TLS. Не отключай антивирус, UAC, SmartScreen и защиту Windows. Не завершай процессы пользователя — проси закрыть окна.
3. Любая ошибка: прочитай текст полностью → найди причину (лог из шага 6, docs/TROUBLESHOOTING.md) → устрани причину → повтори тот же шаг. Не больше 3 попыток на шаг. Если причина вне компьютера (нет интернета, GitHub или dl.google.com недоступны, нет прав) — остановись и сообщи точный текст ошибки.
4. Не пиши «готово», пока все проверки шага 8 не дали PASS. Чего проверить не удалось — так и напиши: NOT TESTED и почему.
5. Сообщения пользователю — коротко, на его языке (по умолчанию русский): что делаешь сейчас и что нужно от него.

ШАГ 0. Система
В PowerShell: [Environment]::OSVersion.Version и $env:PROCESSOR_ARCHITECTURE (если есть $env:PROCESSOR_ARCHITEW6432 — бери его). Нужна Windows 10 сборка 19041+ или Windows 11, AMD64 (x64) или ARM64 (ARM64 — только Windows 11). Иначе остановись и сообщи. Проверь интернет: curl.exe -sSI https://github.com и curl.exe -sSI https://dl.google.com.

ШАГ 1. Файлы проекта
Если ZIP приложен — распакуй его в %USERPROFILE%\Downloads\antigravity-workstation. Если нет — скачай: curl.exe -fsSL --retry 3 -o "$env:TEMP\aw.zip" https://github.com/safarovmurod/antigravity-workstation/archive/refs/heads/main.zip и распакуй (Expand-Archive). Дальше <проект> — папка, где лежат README.md и config\.

ШАГ 2. Antigravity IDE 2.7.0 или 2.6.0
2.1 Найди установку. Папка подходит, если в ней есть «Antigravity IDE.exe» (или Antigravity.exe, antigravity-ide.exe) и resources\app\product.json. Где искать по порядку: $env:ANTIGRAVITY_INSTALL_DIR; ключи реестра HKCU и HKLM \Software\Microsoft\Windows\CurrentVersion\Uninstall\* (и WOW6432Node) с DisplayName «Antigravity» или «Antigravity IDE» — поля InstallLocation и DisplayIcon; %LOCALAPPDATA%\Programs\Antigravity IDE; %ProgramFiles%\Antigravity IDE; на каждом локальном диске X:\Antigravity IDE, X:\Programs\Antigravity IDE, X:\Program Files\Antigravity IDE, X:\Apps\Antigravity IDE.
2.2 Версия: поле ideVersion в resources\app\product.json. Не бери version из package.json — там версия VS Code, а не Antigravity. Подходит 2.7.0 или 2.6.0 (обе проверены). Из того же product.json запомни nameShort (обычно «Antigravity IDE») и applicationName (обычно «antigravity-ide»).
2.3 IDE нет — установи 2.7.0. Официальный установщик: x64 https://dl.google.com/edgedl/release2/j0qc3/antigravity/stable/2.7.0-4507555968450560/windows-x64/Antigravity%20IDE.exe, ARM64 https://dl.google.com/edgedl/release2/j0qc3/antigravity/stable/2.7.0-4507555968450560/windows-arm64/Antigravity%20IDE.exe. Скачай в %TEMP% и проверь SHA-256 (Get-FileHash) с полем source.installerSha256 сборки 2.7.0 для своей архитектуры в <проект>\config\native-compatibility.json. Не совпало — удали файл, скачай ещё раз; снова не совпало — остановись. Установи тихо и дождись конца: Start-Process -FilePath <установщик> -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/CURRENTUSER' -Wait -PassThru — ExitCode должен быть 0. IDE встанет в %LOCALAPPDATA%\Programs\Antigravity IDE.
2.4 Стоит другая версия — спроси разрешение (правило 1б). Получил «да» — сделай 2.3 с дополнительным аргументом '/DIR="<папка той установки>"', чтобы 2.7.0 встала на её место. Получил «нет» — остановись: проект поддерживает только 2.7.0 и 2.6.0.
2.5 Запомни <IDE> — папку установки. Если она не %LOCALAPPDATA%\Programs\Antigravity IDE, передашь её установщику в шаге 5.

ШАГ 3. Первый запуск (только для Команды 2)
Команде 1 этот шаг не нужен — переходи к шагу 4. Для Команды 2 проверь файл %APPDATA%\<nameShort>\User\globalStorage\state.vscdb. Если его нет, IDE ещё ни разу не запускалась: запусти Start-Process "<IDE>\Antigravity IDE.exe" и напиши пользователю: «Antigravity открыта. Войди в аккаунт Google, затем закрой все окна Antigravity (и значок в трее)». Жди, пока файл появится и пропадут процессы Antigravity IDE, Antigravity и antigravity-ide (Get-Process каждые 5 секунд).

ШАГ 4. IDE закрыта
Get-Process -Name 'Antigravity IDE','Antigravity','antigravity-ide' -ErrorAction SilentlyContinue. Если что-то найдено — попроси пользователя сохранить работу и закрыть все окна Antigravity (и в трее). Жди, пока процессы не исчезнут.

ШАГ 5. Запуск установщика в отдельном окне Windows PowerShell
Установщик не работает в терминале редактора: видит переменные TERM_PROGRAM, VSCODE_PID или VSCODE_INJECTION и останавливается с «PAUSED: this is the terminal of an editor». Окно, открытое через Start-Process, наследует эти переменные. Поэтому запускай через explorer.exe — новое окно получает чистое окружение Windows. Ещё одна причина: установка идёт 5–30 минут, и окно не должно зависеть от твоего лимита времени на команду. Выполни в PowerShell:

$t = $env:TEMP
curl.exe -fsSL --retry 3 -o "$t\workstation-bootstrap.ps1" https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/scripts/bootstrap.ps1
Remove-Item -LiteralPath "$t\workstation-result.json" -ErrorAction SilentlyContinue
$mode = ''      # Команда 1: $mode = ' -CleanExtensions'
$ideDir = ''    # IDE не в %LOCALAPPDATA%\Programs: $ideDir = '<IDE>'
$launch = $(if ($ideDir) { "`$env:ANTIGRAVITY_INSTALL_DIR = '$ideDir'`r`n" } else { '' }) + "& powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$t\workstation-bootstrap.ps1`" -ResultFile `"$t\workstation-result.json`"$mode`r`nRead-Host 'Done. Press Enter to close this window'`r`n"
[IO.File]::WriteAllText("$t\workstation-launch.ps1", $launch, (New-Object Text.UTF8Encoding $true))
[IO.File]::WriteAllText("$t\workstation-launch.cmd", "@powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%TEMP%\workstation-launch.ps1`"`r`n", (New-Object Text.ASCIIEncoding))
explorer.exe "$t\workstation-launch.cmd"

Скажи пользователю: «Открылось окно установки — не закрывай его и не открывай Antigravity, пока я не скажу». Потом каждые 30 секунд проверяй, появился ли $env:TEMP\workstation-result.json (не дольше 60 минут; если твоя команда ограничена по времени — проверяй короткими командами в цикле). Окно ничего не спрашивает; в конце оно ждёт Enter — его можно просто закрыть. После команды 1 Antigravity сама откроется на 10–30 секунд и закроется — так и задумано.

ШАГ 6. Разбор результата
Прочитай $env:TEMP\workstation-result.json. Поля: exitCode, state, stage, reason, diagnosticsDirectory (логи setup-install.log, setup-doctor.log, setup-reset.log, setup-failure.json), repairTextFile, resetBackup (папка копии после Команды 1).
- exitCode 0, state «stages-complete» — успех, переходи к шагу 7.
- 3 «paused»: IDE открыта или терминал редактора — шаг 4, затем шаг 5 заново.
- 4 «ide-not-ready»: IDE не найдена, не 2.7.0/2.6.0 или не запускалась — шаги 2–3, затем шаг 5.
- 2 «repair-pending» или любой другой код: открой логи в diagnosticsDirectory, найди строки с «✗», «Error», «Setup incomplete», «Installation failed» и устрани причину:
  • winget недоступен или не поставил Node.js или Git — поставь Node.js 24 LTS (https://nodejs.org, MSI для своей архитектуры) и Git for Windows (https://git-scm.com/download/win) сами, тихо, и повтори шаг 5;
  • ошибки сети или git fetch — проверь интернет и прокси, повтори;
  • «Full reset stopped at … A program still uses it» — папку держит программа. Найди её: Get-Process | Where-Object { $_.Path -and ($_.Path -like "$env:USERPROFILE\.gemini\*" -or $_.Path -like "$env:USERPROFILE\.antigravity*" -or $_.Path -like "$env:APPDATA\Antigravity*") }. Попроси пользователя закрыть её (Gemini CLI, agy.exe) или перезагрузить Windows. Ничего не удалено — повтори шаг 5;
  • «Setup conflict: edited or unregistered <файл>» — пользователь менял файл, которым управляет установщик. Перенеси этот файл в %USERPROFILE%\.gemini\backups\manual-<дата-время>\ (не удаляй), повтори шаг 5 и укажи файл в отчёте;
  • остальное — найди текст ошибки в <проект>\docs\TROUBLESHOOTING.md.
- Если Команда 1 уже прошла сброс (в результате заполнен resetBackup), а ошибка случилась позже, повторяй Командой 2: профиль уже чистый, второй раз сбрасывать его не нужно.

ШАГ 7. Первый запуск после установки
Обнови PATH в своей сессии: $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'). Установщик скачал проект в <копия> = родитель папки diagnosticsDirectory + \source (обычно D:\WorkstationSetup\safarovmurod-antigravity-workstation\source или %LOCALAPPDATA%\WorkstationSetup\safarovmurod-antigravity-workstation\source). Затем:
7.1 Запусти Start-Process "<IDE>\Antigravity IDE.exe" и скажи: «Antigravity открыта. Войди в аккаунт (после полного сброса — обязательно) и оставь её открытой 2 минуты». При первом запуске расширение Workstation Stability само применяет профиль, а через 60 секунд ставит патч плавного курсора.
7.2 Через 2 минуты попроси закрыть все окна Antigravity. Дождись, пока процессы исчезнут, и запусти IDE ещё раз — включится плавный Jelly Cursor. Скрытие строки «Ctrl+L for Agent» и шрифт интерфейса работают уже с первого запуска: установка добавила их в IDE, пока она была закрыта.

ШАГ 8. Проверки (каждую отметь PASS или FAIL; FAIL — исправь причину по правилу 3 и проверь снова)
Перед проверками убери из своей сессии переменные редактора, чтобы CLI Antigravity не обратился к чужому окну: Get-ChildItem Env:VSCODE_* | Remove-Item; Remove-Item Env:TERM_PROGRAM -ErrorAction SilentlyContinue.
1. Doctor: node "<копия>\bin\workstation-setup.js" doctor → строка «Doctor Summary: … 0 Failures».
2. Расширения: "<IDE>\bin\<applicationName>.cmd" --list-extensions --show-versions содержит каждый id из <копия>\config\extensions.json, а у записей с "source": "local-vsix" — ровно их version.
3. %APPDATA%\<nameShort>\User\settings.json — корректный JSON, в нём "editor.inlineSuggest.enabled": false, "files.autoSave": "afterDelay", "files.autoSaveDelay": 1000. keybindings.json рядом — корректный JSON-массив.
4. %USERPROFILE%\.gemini\GEMINI.md побайтно совпадает с <копия>\rules\GEMINI.template.md (Get-FileHash). В %USERPROFILE%\.gemini\config\rules есть workstation-unified-design.md и workstation-unified-full-stack.md; в %USERPROFILE%\.gemini\config\skills — каждая папка из <копия>\config\skill-inventory.json со своим SKILL.md; есть %USERPROFILE%\.gemini\config\agents\workstation-verifier.md и %USERPROFILE%\.gemini\config\workstation-unified\guides.
5. MCP: в %USERPROFILE%\.gemini\config\mcp_config.json есть серверы chrome-devtools-mcp и sequential-thinking, в %USERPROFILE%\.gemini\antigravity\mcp_config.json — sequential-thinking. Файлы из их args существуют (они лежат в %USERPROFILE%\.gemini\config\mcp-runtime\node_modules).
6. agent-browser --version выводит «agent-browser <version>», где version взят из <копия>\skills\agent-browser\metadata.json.
7. Шрифты: Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families.Name содержит каждое family из <копия>\extensions\aster-appearance\fonts.json.
8. Сразу после установки <IDE>\resources\app\out\vs\code\electron-browser\workbench\workbench.html содержит «workstation-ui:start», и рядом есть workstation-ui.js; node -e "const ui=require('<копия>/extensions/workstation-stability/workbench-ui.cjs');console.log(ui.status(ui.workbenchHtml(process.argv[1])))" "<IDE>\resources\app" выводит installed: true и checksum: 'match'. Если нет — закрой все окна IDE и повтори шаг установки. После шага 7.2 тот же файл содержит ещё и «jelly-cursor»; если нет — открой IDE ещё на 2 минуты и перезапусти (шаг 7).
9. Для Команды 1: папка из resetBackup существует, в ней manifest.json со "state": "complete".

ШАГ 9. Имя для GitHub (единственный вопрос)
Выполни git config --global user.name и git config --global user.email. Если оба заданы — ничего не спрашивай. Если нет — спроси одним сообщением имя и почту, привязанную к аккаунту GitHub (или адрес вида 12345+login@users.noreply.github.com со страницы github.com/settings/emails), и выполни:
  git config --global user.name "Имя Фамилия"
  git config --global user.email "почта@пример.com"
Тогда commits из панели GitHub (Explorer → GitHub) будут под его именем и аватаром.

ШАГ 10. Отчёт пользователю (коротко)
- Версия IDE, папка установки, режим (Команда 1 или 2).
- Результат каждой проверки шага 8: PASS / FAIL / NOT TESTED и почему.
- Где резервная копия: resetBackup после Команды 1, иначе %USERPROFILE%\.gemini\backups.
- Что сделано автоматически и какие ошибки ты исправил.
- Что осталось пользователю: после Команды 1 — войти в аккаунт; в Antigravity: Ctrl+Shift+P → «Aster Atelier: Темы и шрифты» — выбрать тему и шрифт; если что-то не удалось — точный текст ошибки.
````
