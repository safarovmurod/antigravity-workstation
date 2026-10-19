# Antigravity Workstation

Готовые настройки Antigravity IDE для Windows: автоимпорт, Prettier, Auto Save, плавный курсор и расширения для ручного написания кода.

Нужны установленная Antigravity IDE, интернет и Windows 10 x64 (build 19041+) либо Windows 11 x64/ARM64. Автоматические настройки AI и разрешений проверены для IDE 2.5.5; неизвестная версия останавливает установку до изменения профиля.

Лимит памяти TypeScript подбирается по RAM ПК; большие расширения скачиваются на диск частями. Полный набор настроек и расширений сохраняется. [Совместимость и память](docs/HARDWARE-COMPATIBILITY.md).

IDE может находиться на C:, D: или другом диске, во вложенной папке с пробелами и кириллицей. Приоритет: запущенная IDE → регистрация Windows → PATH → стандартные папки; настройки и расширения устанавливаются в профиль текущего пользователя. Если IDE перенесена вручную и не определяется, добавь в начало выбранной команды `$env:ANTIGRAVITY_INSTALL_DIR = 'D:\Папка с IDE\My editor'`, указав папку с её `.exe`.

<a id="quick-start"></a>

## 1. Установить или обновить, сохранив остальные расширения

В Antigravity открой **Terminal → New Terminal → PowerShell**, вставь команду целиком:

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $repo = 'safarovmurod/antigravity-workstation'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $script = Join-Path $env:TEMP ('workstation-' + [guid]::NewGuid() + '.ps1')
  $url = 'https://raw.githubusercontent.com/' + $repo + '/main/scripts/bootstrap.ps1?t=' + [guid]::NewGuid()
  try {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      try {
        if ($curl) {
          & $curl.Source --fail --location --show-error --connect-timeout 20 --max-time 120 --output $script $url
          if ($LASTEXITCODE -ne 0) { throw "Download failed: curl $LASTEXITCODE" }
        } else {
          Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $script -TimeoutSec 120 -ErrorAction Stop
        }
        if (-not (Test-Path -LiteralPath $script -PathType Leaf) -or (Get-Item -LiteralPath $script).Length -eq 0) { throw 'Empty bootstrap' }
        break
      } catch {
        if (Test-Path -LiteralPath $script) { Remove-Item -LiteralPath $script -Force }
        if ($attempt -eq 3) { throw }
        Start-Sleep -Seconds (2 * $attempt)
      }
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -MinimumVersion '3.0.7' -RepoSlug $repo
    if ($LASTEXITCODE -ne 0) { throw 'Installation failed; read the error above.' }
  } finally {
    if (Test-Path -LiteralPath $script) { Remove-Item -LiteralPath $script -Force }
  }
}
```

Команда скачивает свежий commit из `main`, распаковывает весь проект и применяет настройки, rules, skills, agents, hooks, MCP и все обязательные расширения. Исправные, зарегистрированные и совместимые Gallery-расширения переиспользуются без повторного скачивания. Отсутствующие, повреждённые или несовместимые берутся из последней совместимой версии Marketplace; локальные Workstation-расширения обновляются из скачанного проекта. Source сохраняется на D:, а если диск недоступен — в `%LOCALAPPDATA%\WorkstationSetup`.

Настройки установки обновляются; старые и повторные версии управляемых расширений переносятся в backup. Остальные расширения сохраняются. AI Tab, next edit и ghost text отключаются, обычные подсказки и чат остаются. Для действий агента и MCP включается Always/Turbo; вход в аккаунты и ограничения организации могут требовать подтверждения.

Если установка завершилась ошибкой, исходник сохраняется по пути `Downloaded source retained in`. В нём остаются `setup-install.log` и `setup-failure.json` с исходной причиной и кодом завершения; последняя строка `exit 1` сама по себе причину не объясняет. Doctor запускается только после успешной установки.

После команды сохрани работу, закрой **все** окна Antigravity, дождись `applied` в указанном `statusFile` и открой IDE заново.

Автоимпорт: установи библиотеку в своём проекте, начни писать её экспорт, выбери подсказку с названием библиотеки и нажми Enter. Меню подсказок — **Ctrl+Space** или **Alt+Space**. Форматирование Prettier — **Ctrl+Shift+F**, отступ по умолчанию — 3 пробела; Auto Save — после паузы 1 секунда. React-шаблоны `rfc`/`rafce` и Emmet `div` раскрываются через Tab или выбор подсказки + Enter. Shortcut-ы набора доступны и в именованных профилях; личные назначения клавиш имеют приоритет. Диагностика TypeScript включена; прозрачность подчёркиваний и Error Lens — 80%. Свои `.editorconfig` и `.prettierrc` проекта имеют приоритет. [Расширения и их настройки](docs/EXTENSIONS.md).

## 2. Установить с нуля, удалив все пользовательские расширения

Сохрани работу, закрой все окна Antigravity и открой отдельный **Windows PowerShell**. Этот режим сохраняет backup всех пользовательских расширений, удаляет их и устанавливает полный набор заново. Аккаунты сохраняются.

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $repo = 'safarovmurod/antigravity-workstation'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $script = Join-Path $env:TEMP ('workstation-' + [guid]::NewGuid() + '.ps1')
  $url = 'https://raw.githubusercontent.com/' + $repo + '/main/scripts/bootstrap.ps1?t=' + [guid]::NewGuid()
  try {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      try {
        if ($curl) {
          & $curl.Source --fail --location --show-error --connect-timeout 20 --max-time 120 --output $script $url
          if ($LASTEXITCODE -ne 0) { throw "Download failed: curl $LASTEXITCODE" }
        } else {
          Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $script -TimeoutSec 120 -ErrorAction Stop
        }
        if (-not (Test-Path -LiteralPath $script -PathType Leaf) -or (Get-Item -LiteralPath $script).Length -eq 0) { throw 'Empty bootstrap' }
        break
      } catch {
        if (Test-Path -LiteralPath $script) { Remove-Item -LiteralPath $script -Force }
        if ($attempt -eq 3) { throw }
        Start-Sleep -Seconds (2 * $attempt)
      }
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -MinimumVersion '3.0.7' -RepoSlug $repo -CleanExtensions
    if ($LASTEXITCODE -ne 0) { throw 'Installation failed; read the error above.' }
  } finally {
    if (Test-Path -LiteralPath $script) { Remove-Item -LiteralPath $script -Force }
  }
}
```

После завершения закрой все окна IDE, дождись `applied` и открой её заново.

## 3. Только отключить AI-подсказки

Скачивает последнюю конфигурацию и отключает AI Tab, next edit и ghost text. Обычные подсказки, расширения и разрешения чата сохраняются.

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $repo = 'safarovmurod/antigravity-workstation'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $script = Join-Path $env:TEMP ('workstation-' + [guid]::NewGuid() + '.ps1')
  $url = 'https://raw.githubusercontent.com/' + $repo + '/main/scripts/bootstrap.ps1?t=' + [guid]::NewGuid()
  try {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      try {
        if ($curl) {
          & $curl.Source --fail --location --show-error --connect-timeout 20 --max-time 120 --output $script $url
          if ($LASTEXITCODE -ne 0) { throw "Download failed: curl $LASTEXITCODE" }
        } else {
          Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $script -TimeoutSec 120 -ErrorAction Stop
        }
        if (-not (Test-Path -LiteralPath $script -PathType Leaf) -or (Get-Item -LiteralPath $script).Length -eq 0) { throw 'Empty bootstrap' }
        break
      } catch {
        if (Test-Path -LiteralPath $script) { Remove-Item -LiteralPath $script -Force }
        if ($attempt -eq 3) { throw }
        Start-Sleep -Seconds (2 * $attempt)
      }
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -MinimumVersion '3.0.7' -RepoSlug $repo -QuietCompletion
    if ($LASTEXITCODE -ne 0) { throw 'Installation failed; read the error above.' }
  } finally {
    if (Test-Path -LiteralPath $script) { Remove-Item -LiteralPath $script -Force }
  }
}
```

Сохрани работу, закрой все окна IDE, дождись `applied` и открой IDE заново. [Как проверить и включить подсказки обратно](docs/AI-COMPLETION.md).

<details>
<summary>Проверка и включение AI: 4 шага</summary>

**1.** Ctrl+Shift+P → **Open Antigravity IDE User Settings**.

![1 — открыть настройки](docs/images/ai-open-settings.png)

**2.** Слева **Tab**: синие **Suggestions in Editor** и **Tab to Jump** означают, что AI-подсказки включены.

![2 — до отключения](docs/images/ai-before.png)

**3.** После установки оба переключателя должны быть серыми. Чтобы вернуть AI, включи их.

![3 — после отключения](docs/images/ai-after.png)

**4.** **Preferences: Open User Settings** → `editor.inlineSuggest.enabled` → **Editor: Inline Suggest: Enabled** выключен. Для возвращения ghost text включи этот параметр.

![4 — inline-подсказки выключены](docs/images/inline-after.png)

</details>
