# Workstation Stability

![Workstation Stability](icon.png)

Применяет профиль редактора, проверяет конфликтующие настройки проекта и состояние отложенной установки. Обычные подсказки TypeScript остаются доступны, AI-подсказки выключены. Неизвестные версии сторонних расширений не изменяет.

Состояние: **View → Output → Workstation Antigravity Stability**. Подробности конфликта показывают файл настройки.

Расширение устанавливается вместе с [Antigravity Workstation](../../README.md).

The managed formatting and suggestion shortcuts are also contributed as extension defaults in every profile where this helper is enabled. Named profiles do not need a copy of the default user keybindings file; personal user shortcuts keep their normal priority.

Setup 3.0.9 can queue recovery of a failed full installation. This helper sends one task to the current native Antigravity 2.5.5 chat with its current model after installer/cache locks release. It does not change model or account settings. Sending is not a verified repair: the task must run the original Doctor verification command. A crash/timeout is not retried automatically; the explicit Retry Setup Repair Task command is available after checking the chat.
