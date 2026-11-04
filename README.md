# Antigravity Workstation

Готовый профиль Antigravity IDE для Windows: настройки редактора, расширения, шрифты, правила и агенты ставятся одной командой. Личные настройки и расширения сохраняются, перед изменениями создаётся резервная копия.

**Что входит:** JetBrains Mono и ещё 9 шрифтов · 17 тем Aster Atelier · плавный Jelly Cursor · Prettier с отступом 3 пробела · автоимпорт · Auto Save · GitHub-панель · правила, skills и агенты.

[Расширения и настройки](docs/EXTENSIONS.md) · [Все настройки по пунктам](docs/SETTINGS-GUIDE.md) · [Видео](docs/VIDEO-GUIDE.md) · [Проблемы и решения](docs/TROUBLESHOOTING.md) · [Старые отчёты](docs/history/README.md)

## Выбери действие

| № | Команда | Где запускать |
| :---: | --- | --- |
| **1** | Полная настройка с очисткой лишних расширений | **Windows PowerShell из Пуска. Antigravity закрыта.** |
| **2** | Установить или обновить, сохранив другие расширения | PowerShell в Antigravity **или** Windows PowerShell |
| **3** | Только отключить AI-подсказки | PowerShell в Antigravity **или** Windows PowerShell |

**Нужно:** установленная Antigravity, интернет, Windows 10 x64 (build 19041+) или Windows 11 x64/ARM64.

**Как запустить:** раскрой нужную команду → нажми **Copy** → вставь целиком в PowerShell (от `& {` до последней `}`). Если вставилось лишнее — **Ctrl+C** и повтори.

**Версии IDE.** Поддерживаются 4 последние версии Antigravity IDE:

| Версия IDE | Настройки, расширения, шрифты, rules | Отключение AI Tab (команда 3) |
| --- | --- | --- |
| **2.6.0** (x64, ARM64) | ✅ | ✅ |
| **2.5.5** (x64, ARM64) | ✅ | ✅ |
| **2.5.2** (x64, ARM64) | ✅ | ✅ |
| **2.1.1** | ✅ | — пропускается с понятным сообщением |
| более новая | ✅ | — пропускается до проверки ([каталог](config/native-compatibility.json)) |

**Диски C: и D:** установщик сам находит папку IDE (процесс, реестр, PATH, стандартные папки). Если не нашёл — см. «IDE в нестандартной папке» ниже.

## 1. Полная настройка с очисткой

**Где:** **Windows PowerShell из меню Пуск**. Сначала сохрани работу и закрой **все окна Antigravity**.

Ставит всё из профиля и переносит лишние или старые расширения в резервную копию.

<details>
<summary><strong>Открыть команду 1 — полная настройка с очисткой</strong></summary>

```powershell
& {
  $file = Join-Path $env:TEMP ('workstation-' + [guid]::NewGuid() + '.ps1')
  $url = 'https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/scripts/bootstrap.ps1'
  try {
    curl.exe -fsSL --retry 3 --connect-timeout 20 --max-time 120 -o $file $url
    if ($LASTEXITCODE -or -not (Test-Path -LiteralPath $file)) {
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
      Invoke-WebRequest $url -OutFile $file -UseBasicParsing -ErrorAction Stop
    }
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $file -CleanExtensions
  } finally { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
}
```

</details>

## 2. Установить или обновить

**Где:** **PowerShell в терминале Antigravity** или **Windows PowerShell из Пуска**. IDE может быть открыта.

Добавляет недостающее и обновляет расширения Workstation. Твои настройки, сочетания клавиш и другие расширения остаются.

<details>
<summary><strong>Открыть команду 2 — установка или обновление</strong></summary>

```powershell
& {
  $file = Join-Path $env:TEMP ('workstation-' + [guid]::NewGuid() + '.ps1')
  $url = 'https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/scripts/bootstrap.ps1'
  try {
    curl.exe -fsSL --retry 3 --connect-timeout 20 --max-time 120 -o $file $url
    if ($LASTEXITCODE -or -not (Test-Path -LiteralPath $file)) {
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
      Invoke-WebRequest $url -OutFile $file -UseBasicParsing -ErrorAction Stop
    }
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $file
  } finally { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
}
```

</details>

## 3. Отключить AI-подсказки

**Где:** **PowerShell в терминале Antigravity** или **Windows PowerShell из Пуска**.

Отключает **AI Tab, next edit и ghost text**. Обычные подсказки, автоимпорт и чат остаются; профиль и расширения не меняются.

<details>
<summary><strong>Открыть команду 3 — только отключение AI-подсказок</strong></summary>

```powershell
& {
  $file = Join-Path $env:TEMP ('workstation-' + [guid]::NewGuid() + '.ps1')
  $url = 'https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/scripts/bootstrap.ps1'
  try {
    curl.exe -fsSL --retry 3 --connect-timeout 20 --max-time 120 -o $file $url
    if ($LASTEXITCODE -or -not (Test-Path -LiteralPath $file)) {
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
      Invoke-WebRequest $url -OutFile $file -UseBasicParsing -ErrorAction Stop
    }
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $file -QuietCompletion
  } finally { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
}
```

</details>

## После выполнения

1. Дождись конца команды. После команды **1/2** Doctor должен показать **0 Failures**. Команда **3** сообщает, что отключение AI-подсказок сохранено или ожидает закрытия IDE.
2. Полностью закрой все окна Antigravity и открой снова (**Reload Window недостаточно**).
3. Через минуту после запуска Jelly Cursor ставит свой эффект; закрой и открой IDE ещё раз — курсор станет плавным. Эффект мягкий: курсор `|` плавно «плывёт» к новому месту с лёгким свечением, без следа и тряски, а в покое всё время мягко мигает (обычная IDE перестаёт мигать через 10 секунд). При клике нет кругов, нет пузырьков и искр.

Все три команды скачивают текущий `main` с GitHub. При ошибке загрузки установка останавливается. После успешной установки командой **1/2** старый кеш скачанного source удаляется, резервные копии настроек сохраняются.

Команды **1/2** не отключают AI-подсказки и не включают Always/Turbo автоматически: твои разрешения агента, MCP, Secure Mode и sandbox остаются как есть. AI Tab отключает только команда **3**.

| Действие | Как |
| --- | --- |
| Темы и шрифты | **Ctrl+Shift+P** → **Aster Atelier: Темы и шрифты** → выбери → **Применить** |
| Форматирование | **Ctrl+Shift+F** — Prettier, отступ **3 пробела** |
| Автосохранение | Через **1 секунду** паузы |
| Сохранение вручную | **Ctrl+S** — строка курсора мягко подсвечивается на 0,3 с (автосохранение не мигает) |
| Автоимпорт | Установи библиотеку → выбери подсказку → **Enter** |
| Подсказки | **Ctrl+Space** или **Alt+Space** |
| React / Emmet | `rfc`, `rafce`, `div` → **Tab** |

## Если возникла ошибка

В терминале будут причина, этап и путь к диагностике. Текст для восстановления копируется в буфер обмена (или сохраняется в `repair-task.txt`) — вставь его в чат один раз. Подробнее: [восстановление](docs/CHAT-REPAIR.md) · [включить AI обратно](docs/AI-COMPLETION.md) · [совместимость](docs/HARDWARE-COMPATIBILITY.md).

<details>
<summary>IDE в нестандартной папке</summary>

Пробелы и кириллица в пути поддерживаются. Добавь в начало выбранной команды `$env:ANTIGRAVITY_INSTALL_DIR = 'D:\Папка с IDE'` — папку, где лежит `.exe` IDE.

</details>
