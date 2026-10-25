# Workstation Stability

## Вопросы задачи с галочками

Command Palette → **Workstation: Вопросы задачи (галочки и свой вариант)**. Вставь JSON вопросов, который подготовил чат:

```json
[{"title":"Как исправить код?","options":["Сохранить мою логику","Middle","Architect"]}]
```

Для каждого вопроса выбери галочки и при необходимости свой ответ. После подтверждения ответы копируются в clipboard: вставь и отправь их в текущий Gemini-чат. Отмена не копирует частичные ответы. Это реальный выбор в UI IDE, а не встроенная форма внутри сообщения Gemini; автоматической отправки в чат нет.

![Workstation Stability](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/extensions/workstation-stability/icon.png)

Короткая анимированная инструкция (схема действий, не запись IDE). Нажми для MP4:

[![Профиль и отчёт о конфликтах](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/docs/feature-guides/stability.gif)](https://github.com/safarovmurod/antigravity-workstation/blob/main/docs/feature-guides/stability.mp4)

Применяет профиль редактора, проверяет конфликтующие настройки проекта и состояние отложенной установки. Обычные подсказки TypeScript остаются доступны, AI-подсказки выключены. Неподдерживаемые внутренние исправления сторонних расширений не применяет.

## Обновления gallery без нового commit

В 1.3.11 полный Setup сохраняет проверяемый план собственного gallery updater. Через минуту после старта IDE он проверяет metadata, затем проверяет не чаще раза в сутки. Сбой не считается успешной проверкой; повтор допускается через час. Обновляются только уже установленные обязательные gallery ID выбранного setup-профиля, только на latest stable compatible с реальным текущим IDE/OS/architecture. Удалённые пользователем extensions не переустанавливаются. Совпадающий полный package повторно не скачивается. Lock общий с установщиком; при полном setup updater ждёт.

Это отдельный механизм Workstation, а не включение native per-extension Auto Update: VSIX может оставаться `pinned:true`. Чужие pins не меняются. `workstationStability.autoUpdateManagedExtensions=false` отключает этот механизм; `workstationStability.autoUpdateExcludedExtensions` исключает перечисленные managed ID. Состояние и версия записываются в `~/.gemini/config/workstation-setup/gallery-update-status.json` и Output. Исходный snapshot и Node должны оставаться доступны; bootstrap сохраняет используемый snapshot. После ручного изменения проверяемого source запусти Setup снова.

Локальные Git Branch Panel / Stability / Calm VSIX не имеют Marketplace auto-update: они обновляются повторным полным Setup по README из текущего main с freshness guard. Фоновый gallery updater их не обновляет. Реальный native old-version → update → restart сценарий находится в Windows smoke; наличие сценария само по себе не означает PASS.

Состояние: **View → Output → Workstation Antigravity Stability**. Подробности конфликта показывают файл настройки.

Обычный старт, смена проекта и повторный Setup сохраняют выбранную тему. Команда **Workstation: Apply and Check Editor Settings** — принудительное восстановление managed defaults, включая тему; перед изменением появляется явное подтверждение. Cancel ничего не сбрасывает. Личные tokenColorCustomizations/textMateRules сохраняются и при подтверждённом reset.

Расширение устанавливается вместе с [Antigravity Workstation](../../README.md).

The managed formatting and suggestion shortcuts are also contributed as extension defaults in every profile where this helper is enabled. Named profiles do not need a copy of the default user keybindings file; personal user shortcuts keep their normal priority.

Setup 3.0.9 can queue recovery of a failed full installation. This helper sends one task to the current native Antigravity 2.5.5 chat with its current model after installer/cache locks release. It does not change model or account settings. Sending is not a verified repair: the task must run the original Doctor verification command. A crash/timeout is not retried automatically; the explicit Retry Setup Repair Task command is available after checking the chat.
