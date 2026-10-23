# Дополнительная проверка Setup 3.0.20 / GitHub Panel 1.4.2

Проверено в изолированной облачной Linux-среде с настоящим Git, PowerShell 7 и официальным извлечённым Windows bundle Antigravity. Другой публичный Windows-сервер не был доступен. GitHub Actions API ранее ответил 403; этот отчёт не выдаёт локальные проверки за запуск Actions или Windows GUI.

## Исправление

Периодическое обновление панели пересоздавало checkbox файлов и select веток/конфликтов. Это могло вернуть снятую галочку перед commit либо сбросить источник Pull. Теперь прежний выбор сохраняется для существующих файлов/веток. Секретные файлы остаются заблокированными; исчезнувшие ветки не сохраняются как доступные варианты.

## Сервер и реальные операции

В тесте запускается отдельный HTTP Git server на loopback с настоящим `git http-backend`, bare repository и сетевыми push/fetch. Нет зависимости от авторизации GitHub. Проверены HTTP push, same-branch Pull и принудительный HTTP 503: операция сообщает об отказе сервера, локальный commit и рабочие файлы не меняются.

Дополнительные реальные Git сценарии: недоступный origin, non-fast-forward rejection с сохранением локального commit, последующий Pull/merge и успешный повторный push, конфликт и merge abort, отмена полного incoming replacement, точный incoming tree SHA и backup. Client-функции из настоящего webview выполняются с DOM-моделью для проверки сохранения выбора; это не снимок Windows GUI.

## Результаты до публикации

- Полный Node suite с официальным bundle/codec: **368 passed, 0 failed, 0 skipped**.
- Дополнительные native automation/rollback checks: **20 passed, 0 failed, 0 skipped**.
- Portable PowerShell bootstrap failure/retry/README scenarios: **68 passed**.
- Live download предыдущего опубликованного commit `a3e76f6`: настоящий raw bootstrap и commit ZIP, совпадение исходников, verified cache/offline reuse для трёх режимов, установка и повтор в isolated profile, проверка всех managed payload hashes — passed.

Полная установка gallery extensions, графический запуск Windows и PowerShell 5.1 в этом Linux-прогоне не выполнялись. Отказ сети/сервера должен сообщаться пользователю, а не превращаться в фиктивный успех. Новые проверки сохранены в `tests/test-github-panel-workflows.mjs` и включены в обычный `npm test`.
