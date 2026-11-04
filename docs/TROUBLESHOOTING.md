# Если установка завершилась с ошибкой

Читай первую ошибку этапа над итоговым сообщением. После исправления причины повтори [команду из README](../README.md#quick-start).

| Сообщение или проблема | Действие |
|---|---|
| Download / timeout / HTTP | Проверь доступ к GitHub и Marketplace. Команда делает до 3 попыток; при ошибке ZIP использует Git для того же commit. |
| Node / npm / Git / winget unavailable | Установи Node.js 24+, npm 10+ и Git, затем открой новый терминал. |
| Antigravity IDE not found | Установи IDE и открой её один раз. Для portable-папки укажи её в `ANTIGRAVITY_INSTALL_DIR`. |
| Unsupported native build | Нужен проверенный build из каталога совместимости. Не отключай проверку hash и не подменяй номер версии. |
| Open Antigravity once | Открой IDE один раз для создания профиля, затем повтори установку. |
| Waiting | Сохрани работу и нормально закрой все окна IDE; дождись `applied`. |
| Setup conflict / needs-attention | Сравни указанный файл с backup; проверь настройки проекта. |
| Extension registration failed | Проверь доступ к Marketplace и сообщение установки конкретного расширения. |
| Нет автоимпорта | Установи библиотеку в проект, проверь её exports/типы, нажми Ctrl+Space. Перезапусти TypeScript server через палитру команд. |
| Форматирование отличается | Проверь `.prettierrc`, `prettier.config.*` и `.editorconfig` своего проекта. |
| GitHub push не работает | Проверь `origin`, авторизацию Git и права на репозиторий. Вход в аккаунт IDE не всегда авторизует Git. |
| MCP не подключается | Проверь настройки, доступность и авторизацию конкретного сервиса; выбери Reconnect MCP. |

Backup: `%USERPROFILE%\.gemini\backups`. Личные токены, базы и аккаунты не переносить между компьютерами.
