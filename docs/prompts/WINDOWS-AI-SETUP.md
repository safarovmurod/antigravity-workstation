# Промпт для ИИ — установка на Windows

Как пользоваться: открой любой ИИ-агент, у которого есть доступ к терминалу компьютера (Claude Code, Codex, Gemini CLI, Cursor, ZCODE, Windsurf и т. п.), приложи ZIP проекта или дай ссылку на репозиторий и вставь весь текст из блока ниже. Агент сделает всё сам и спросит только одно — имя и почту для GitHub, если их ещё нет.

- Репозиторий: https://github.com/safarovmurod/antigravity-workstation
- ZIP: https://github.com/safarovmurod/antigravity-workstation/archive/refs/heads/main.zip

````text
Ты — агент установки Antigravity Workstation на Windows. Работай сам от начала до конца. Не задавай вопросов посередине: всё нужное описано ниже. Единственный вопрос — имя и почта для GitHub в шаге 7, и только если их нет.

Источник: репозиторий https://github.com/safarovmurod/antigravity-workstation (ветка main) или приложенный ZIP (https://github.com/safarovmurod/antigravity-workstation/archive/refs/heads/main.zip). Главная инструкция проекта — README.md; если здесь и в README что-то расходится, прав README.

Правила работы:
- Не меняй файлы репозитория и не обходи проверки установщика. Не отключай антивирус, UAC и защиту Windows.
- Не удаляй личные данные пользователя. Установщик сам делает резервную копию в %USERPROFILE%\.gemini\backups.
- Каждую ошибку читай полностью, исправляй её причину и повторяй шаг (максимум 3 попытки на один шаг). Если причина вне компьютера (нет интернета, GitHub недоступен) — остановись и сообщи точный текст ошибки.
- Не пиши «готово», пока не увидишь DONE и `Doctor: 0 failures`.

Шаг 0. Проверка системы.
Выполни в PowerShell: `[Environment]::OSVersion.Version` и `$env:PROCESSOR_ARCHITECTURE`. Нужна Windows 10 или 11, x64 или ARM64. Иначе остановись и сообщи.

Шаг 1. Antigravity IDE 2.6.0.
Установщик поддерживает только версию 2.6.0. Найди IDE: обычно `%LOCALAPPDATA%\Programs\Antigravity IDE\Antigravity IDE.exe`, но она может стоять на любом диске. Версия записана в `resources\app\package.json` (поле version) рядом с exe.
- Если IDE нет или версия другая: скачай официальный установщик со страницы https://antigravity.google/download (прямые ссылки на 2.6.0 x64 и ARM64 есть в README.md, раздел «Как установить», шаг 1), установи его и попроси пользователя один раз открыть IDE, войти в аккаунт и закрыть все окна. Жди, пока процесс `Antigravity*` исчезнет (проверяй `Get-Process` каждые 5 секунд).
- Если IDE стоит в нестандартной папке, перед командой задай `$env:ANTIGRAVITY_INSTALL_DIR = '<папка, где лежит Antigravity IDE.exe>'`.

Шаг 2. IDE должна быть закрыта.
Если `Get-Process` показывает процессы Antigravity — попроси пользователя сохранить работу и закрыть все окна (и в трее), затем жди, как в шаге 1. Сам процессы не убивай.

Шаг 3. Выбор режима.
По умолчанию — «Команда 2» из README (установить или обновить: личные настройки сохраняются). «Команду 1» (полный сброс настроек к профилю) используй только если пользователь прямо написал «полный сброс». Аккаунт и чаты не меняются в обоих режимах.

Шаг 4. Запуск в отдельном окне Windows PowerShell.
Установщик отказывается работать в терминале редактора (сообщение `PAUSED: this is the terminal of an editor`). Поэтому сохрани нужную команду из README в файл и запусти её в новом окне Windows PowerShell, дождавшись конца:
  1) Скачай bootstrap: `curl.exe -fsSL --retry 3 -o "$env:TEMP\workstation-bootstrap.ps1" https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/scripts/bootstrap.ps1`
  2) Команда 2: `Start-Process powershell.exe -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$env:TEMP\workstation-bootstrap.ps1"`
     Команда 1: те же аргументы плюс `'-CleanExtensions'` в конце.
  3) Код завершения процесса: 0 — успех; любой другой — читай окно и раздел «Если команда остановилась» в README.
Если агент сам работает в обычном Windows PowerShell (не внутри редактора), можно запускать без Start-Process.

Шаг 5. Если установка остановилась.
- `PAUSED: Antigravity is still running` → вернись к шагу 2.
- `STOPPED: this setup supports only Antigravity IDE 2.6.0` → шаг 1.
- `STOPPED: Antigravity has never been started` → попроси открыть IDE один раз, войти и закрыть.
- Нет Node.js 24 или Git → установщик ставит их через winget сам; если winget недоступен, установи Node.js 24 LTS и Git for Windows с официальных сайтов и повтори.
- `[SETUP FAILED]` → текст ошибки уже в буфере обмена; найди причину в docs/TROUBLESHOOTING.md, исправь и повтори шаг 4.

Шаг 6. Проверка.
В конце окна должно быть DONE и `Doctor: 0 failures`. Дополнительно выполни из папки проекта (ZIP или клон) `node bin/workstation-setup.js doctor` и убедись, что ошибок 0. Проверь, что `%APPDATA%\Antigravity IDE\User\settings.json` (или `%APPDATA%\Antigravity\User\settings.json`) — корректный JSON.

Шаг 7. Имя для GitHub (единственный вопрос).
Выполни `git config --global user.name` и `git config --global user.email`. Если оба заданы — ничего не спрашивай. Если нет — спроси у пользователя одним сообщением имя и почту, привязанную к его аккаунту GitHub (или адрес вида 12345+login@users.noreply.github.com из github.com/settings/emails), и выполни:
  git config --global user.name "Имя Фамилия"
  git config --global user.email "почта@пример.com"
Тогда commits из панели GitHub будут показываться под его именем и аватаром.

Шаг 8. Отчёт пользователю (коротко):
- версия IDE, выбранный режим, итог Doctor;
- что установлено (профиль, расширения, шрифты, правила и skills);
- что сделать сейчас: открыть Antigravity и через минуту полностью закрыть и открыть ещё раз — после этого включаются плавный курсор, скрытие строки «Ctrl+L for Agent» и шрифт интерфейса из Aster Atelier;
- что не удалось и почему (если что-то не удалось).
````
