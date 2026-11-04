# Проверка Setup 3.0.22 — 24 октября 2026

Проверка включает реальные GitHub-hosted Windows runners. GitHub API отвечал 403, поэтому результаты получены через публичные страницы Actions; ошибка доступа к API не считается отсутствием запусков.

## Подтверждённые ошибки и исправления

1. **Windows PowerShell 5.1 / Invoke-WebRequest принимал оборванный HTTP ответ за успешный download.** Реальный HTTP-тест получил 128 байт вместо объявленных 131072 и воспроизвёл проблему. Bootstrap теперь запрашивает response (`-PassThru`) и сверяет Content-Length с фактически записанной длиной identity-encoded ответа перед переносом файла. Ошибка запускает ограниченные retries; неполный временный файл удаляется. HTTP content encoding учитывается, чтобы не сравнивать размер декодированного тела с размером сжатого ответа. Проверка ZIP/источников остаётся дополнительной защитой.
2. **Все три README launcher проверяли только непустой bootstrap.** В каждую команду добавлена проверка Content-Length до выполнения скачанного скрипта. Три сценария подтверждают, что неполный bootstrap не запускается ни в одном режиме.
3. **Первый запуск браузера на Windows-2022 превысил 45 секунд.** Deadline увеличен до 90 секунд. Только timeout даёт одну повторную попытку после закрытия собственного изолированного session. Ошибки конфигурации и постоянные ошибки не маскируются. Вторая неудача остаётся ошибкой; defaults не публикуются до успешной проверки.
4. **Git fixtures зависели от глобального Windows core.autocrlf и одновременно удаляли папки с незавершённым refresh.** Основные fixtures задают собственный core.autocrlf и ждут state refresh перед cleanup. Отдельный сценарий явно включает core.autocrlf=true и проверяет реальный CRLF checkout после same-branch Pull.
5. **CI скрывал исходную причину ошибок за exit code.** Расширены публичные annotations с хвостом вывода и деталями HTTP/browser проверок. Ошибка кавычки в промежуточном CI-скрипте исправлена и проверена `bash -n`.

## Реальные проверки

- Native IDE: Windows-2022 x64, Windows-2025 x64, Windows 11 ARM64. Установка pinned официальной IDE в изолированную папку, открытие/закрытие/повторное открытие, проверка русской локали, editor settings и RAM-derived heap, native Tab/agent policies, rollback/recovery, регистрация всех обязательных расширений и offline reuse. Editor host проверяет Prettier/три пробела/Auto Save, импорт библиотеки, snippets/Emmet, диагностику TypeScript, path completion, словари и настоящий Git API fetch/push.
- Browser/MCP: отдельный Windows workflow с Chrome/Edge, production `ensureAgentBrowser`, повтором проверки, тремя настоящими MCP stdio серверами и tool calls. Chrome MCP открывает локальную тестовую страницу и читает её DOM; GSD читает state, sequential-thinking отвечает на запрос.
- Setup matrix: Ubuntu Node 24; Windows-2022, Windows-2025 и Windows 11 ARM64 — Node 24/26. В Windows выполняются PowerShell 5.1 и 7, HTTP curl/IWR с корректным/503/пустым/оборванным ответом, короткие/длинные/Unicode пути, font install/repeat.
- Локальный полный suite с официальным native bundle/protobuf runtime: **371 passed, 0 failed, 0 skipped**.
- Portable bootstrap и три README launcher: **70 сценариев**.
- Live download проверяет raw bootstrap/commit ZIP/hash, весь payload, установку в отдельный профиль, повтор/offline reuse и quiet/status/rollback с сохранением личных chat/account bytes.

Конкретные ссылки на завершённые запуски и SHA добавлены в JSON-отчёт рядом с этим файлом.

## Границы проверки

Windows-2022/2025 — hosted серверные версии Windows, а не физический ноутбук Windows 10. Windows 10 build 19041+ проверяется compatibility/preflight сценариями; отдельный физический Windows 10 GUI в этих запусках не использовался. Авторизацию конкретного пользователя GitHub/IDE и корпоративные ограничения невозможно проверить чужим тестовым аккаунтом: native Git API и локальный HTTP/bare origin проверяются без копирования личных credentials. Успешный MCP server/tool call отдельно от vendor lifecycle конкретной IDE-сессии.

Стиль, фонт, три пробела, правила и агенты пользователя не менялись. Версия GitHub Panel остаётся 1.4.2; исправления download/browser доставляются Setup 3.0.22 командами 1/2 README, команда 3 сохраняет completion-only scope.

## Завершённые Actions

- [setup/PowerShell/README: 7/7 — Success](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40072322767), commit `cea1081`.
- [native IDE/full extension catalog: 3/3 — Success](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40072125976), commit `84e50ae`.
- [browser/MCP tool calls: 3/3 — Success](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40072126011), commit `84e50ae`.

Финальные README launchers проверены на `cea1081`; native/browser на `84e50ae`. Между ними менялись только README и тест его launcher, а production browser/installer/config/extension код совпадает. [Машиночитаемый отчёт с artifact SHA-256](WINDOWS-VERIFICATION-3.0.22.json).
