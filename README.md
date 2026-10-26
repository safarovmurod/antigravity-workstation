# Antigravity Workstation

[Публикация в main, резервное восстановление и незакрытые проверки](docs/MAIN-CONSOLIDATION-2026-10-26.md). Сохранение кода в main не заменяет live Gemini/Windows-приёмку.

[Проверки main 3.0.26](docs/MAIN-CONSOLIDATION-2026-10-26.md): локальный полный suite — **443 PASS, 0 FAIL, 0 SKIP** с официальным bundle; отдельные native/Windows CI и незакрытые live-проверки не смешиваются. [Предыдущая проверка 34cf909](docs/DEEP-SAFETY-REVIEW-2026-10-26.md) и [ранняя проверка](docs/REANALYSIS-2026-10-26.md) сохранены как история. Это не заявление о завершении всех требований.

**Aster Atelier**: один VSIX с 20 темами и 10 лицензированными шрифтами. [Исходный код и Details](extensions/aster-appearance/README.md), [VSIX](extensions/aster-appearance/aster-appearance-1.0.0.vsix), [точная матрица готовности](docs/ASTER-ACCEPTANCE.md). Полный и lite setup включают пакет; отдельно его можно выбрать через **Extensions → Install from VSIX**, затем **Aster Atelier: Appearance Studio**. Managed-зависимость от One Dark Pro заменена; личные theme-расширения не удаляются. Публикация кода в main не означает завершения всех live-проверок: ограничения перечислены ниже.

**Твой готовый профиль Antigravity IDE для Windows.**

JetBrains Mono · плавный курсор · автоимпорт · Prettier с отступом 3 пробела · Auto Save · GitHub-панель · правила и агенты.

[Видео с озвучкой](docs/VIDEO-GUIDE.md) · [Расширения и настройки](docs/EXTENSIONS.md) · [Исторический отчёт 3.0.24](docs/DELIVERY-2026-10-25.md) · [Текущий corrective checklist](docs/CORRECTIVE-AUDIT-WIP-2026-10-25.md)

[Доказательный corrective отчёт:118 строк/247 отдельных acceptance](docs/FINAL-CORRECTIVE-AUDIT-2026-10-25.md). Draft PR не является принятым release.

Setup **3.0.26** объединяет проверенные исправления и Aster Atelier. Личные JSON/token rules сохраняются через ownership merge; GSD — 1.18.0; Git delete имеет явный local/origin/force scope; gallery updater проверяет metadata перед download. Все три команды ниже получают текущий **main**, не временные ветки. Это не подтверждение выполнения всех 13 требований: inline Gemini questionnaire, шесть Git-видео, live Gemini, exhaustive visual review и Windows reboot остаются непроверенными/заблокированными. Исторические текстовые анимации не являются реальными записями текущего IDE.

Ownership fix в опубликованном main сохраняет неизвестные personal diagnostic/import options, включая Python overrides. Main 96c43a4 содержит Stability 1.3.13; repair source добавляет 1.3.14 с отдельным локальным плеером двух настоящих записей. До merge repair PR команды ниже по-прежнему получают опубликованный main, не repair branch. Старые VSIX не выбираются каталогом. [Отдельные acceptance criteria для всех118 исходных строк](docs/CORRECTIVE-ACCEPTANCE.json), [inventory cleanup](docs/SETTINGS-CLEANUP-INVENTORY.json), [локальная запись настоящих видео после официального входа](docs/LOCAL-RECORDING-RUNBOOK.md), [непройденная live Gemini matrix](docs/LIVE-GEMINI-ACCEPTANCE.json). Runtime tokens/latency и inline form не объявлены проверенными.

Bootstrap сначала разрешает точный текущий commit main, затем скачивает и проверяет snapshot этого commit; cache другой версии не подставляется. Если main/сеть недоступны или Setup старее **3.0.26**, установка завершается ошибкой, без fallback на старые ветки. Команда 2 сохраняет личные расширения; `--clean-extensions` используйте только для явно выбранной очистки. До фактической публикации 3.0.26 freshness guard откажет старому main, а не молча установит старую версию.

Обновление профиля сохраняет выбранную вручную цветовую тему и шрифт. Для нового профиля используется Aster `oceanic pro`; One Dark Pro больше не устанавливается проектом. Gallery-расширения проверяются на latest stable compatible; отдельный проверяемый updater не выдаётся за native auto-update pinned-пакетов. Локальные расширения обновляются этими командами README. Реальные записи и оставшиеся исторические схемы действий различаются в manifest; восемь реальных роликов пока не готовы.

## Выбери действие

| № | Команда | Где запускать |
| :---: | --- | --- |
| **1** | Полная настройка с очисткой лишних расширений | **Windows PowerShell из Пуска. Antigravity закрыта.** |
| **2** | Установить или обновить, сохранив другие расширения | PowerShell в Antigravity **или** Windows PowerShell |
| **3** | Только отключить AI-подсказки | PowerShell в Antigravity **или** Windows PowerShell |

**Нужно:** установленная Antigravity, интернет, Windows 10 x64 (build 19041+) или Windows 11 x64/ARM64. Native-настройки проверены для IDE **2.5.5**; неподдерживаемая версия останавливает установку до изменения профиля.

<a id="quick-start"></a>

**Как запустить:** раскрой нужную команду → нажми **Copy** у блока → вставь целиком в PowerShell. Копируй от `& {` до последней `}`; без строк с обратными кавычками, `PS C:\...>` и `>>`. Если вставил лишнее — **Ctrl+C** и повтори. Выполняй под своим Windows-пользователем; открытая папка проекта на место установки не влияет.

## 1. Полная настройка с очисткой

**Где:** отдельный **Windows PowerShell из меню Пуск**. Сначала сохрани работу и закрой **все окна Antigravity**.

Применяет полный профиль из этого проекта и устанавливает обязательные расширения. Лишние и старые копии расширений убирает с резервной копией; исправные обязательные пакеты использует повторно. Управляемые настройки заменяет значениями проекта, добавляет недостающие. Аккаунты и посторонние личные настройки сохраняет — полного удаления пользовательского профиля нет. При конфликте с вручную изменёнными rules/skills останавливается для согласования.

<details>
<summary><strong>Открыть команду 1 — полная настройка с очисткой</strong></summary>

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $repo = 'safarovmurod/antigravity-workstation'
  $sourceBranch = 'main'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $script = Join-Path $env:TEMP ('workstation-' + [guid]::NewGuid() + '.ps1')
  $resultFile = $script + '.result.json'
  $url = 'https://raw.githubusercontent.com/' + $repo + '/' + $sourceBranch + '/scripts/bootstrap.ps1?t=' + [guid]::NewGuid()
  $bootstrapStarted = $false
  $repairScope = 'Command 1: full setup with the explicitly selected clean mode and verified backups.'
  try {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      try {
        if ($curl) {
          & $curl.Source --fail --location --show-error --connect-timeout 20 --max-time 120 --output $script $url
          if ($LASTEXITCODE -ne 0) { throw "Download failed: curl $LASTEXITCODE" }
        } else {
          $response = Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $script -TimeoutSec 120 -ErrorAction Stop -PassThru
          [long]$bootstrapExpectedBytes = 0
          if ($response -and (-not $response.Headers['Content-Encoding'] -or [string]$response.Headers['Content-Encoding'] -eq 'identity') -and
              [long]::TryParse([string]$response.Headers['Content-Length'], [ref]$bootstrapExpectedBytes) -and $bootstrapExpectedBytes -ge 0 -and
              (Get-Item -LiteralPath $script).Length -ne $bootstrapExpectedBytes) { throw 'Incomplete bootstrap download' }
        }
        if (-not (Test-Path -LiteralPath $script -PathType Leaf) -or (Get-Item -LiteralPath $script).Length -eq 0) { throw 'Empty bootstrap' }
        break
      } catch {
        if (Test-Path -LiteralPath $script) { Remove-Item -LiteralPath $script -Force }
        if ($attempt -eq 3) { throw }
        Start-Sleep -Seconds (2 * $attempt)
      }
    }
    $bootstrapStarted = $true
    $setupExitCode = 1
    $global:LASTEXITCODE = 1
    $ErrorActionPreference = 'Continue'
    try {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -MinimumVersion '3.0.26' -RepoSlug $repo -SourceBranch $sourceBranch -ResultFile $resultFile -CleanExtensions
      $setupExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
    if ($setupExitCode -eq 2) { Write-Warning 'Setup incomplete: repair task saved for the current chat; automatic file/clipboard fallback is prepared. Scope verification is still required.' }
    elseif ($setupExitCode -eq 3) { Write-Warning 'Clean setup was NOT installed: save work, close every Antigravity window normally and run this same command from Windows PowerShell outside the IDE.' }
    elseif ($setupExitCode -ne 0) {
      $detail = 'No diagnostic summary was returned. Read the [SETUP ERROR] or [SETUP FAILED] output above; installation is not confirmed.'
      try {
        if (Test-Path -LiteralPath $resultFile -PathType Leaf) {
          $result = Get-Content -LiteralPath $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
          if ($result.schema -eq 1 -and $result.exitCode -eq $setupExitCode -and $result.reason -is [string] -and $result.reason.Length -le 8300) {
            $detail = 'Stage: ' + $result.stage + "`nReason: " + $result.reason
            if ($result.diagnosticsDirectory) { $detail += "`nDiagnostics: " + $result.diagnosticsDirectory }
            if ($result.repairTextFile) { $detail += "`nRepair text: " + $result.repairTextFile }
          }
        }
      } catch { }
      throw ("Setup stopped (exit $setupExitCode). " + $detail)
    }
  } catch {
    if (-not $bootstrapStarted) {
      $reason = $_.Exception.Message -replace '(?i)(Bearer|Basic)\s+\S+', '$1 [REDACTED]'
      if ($reason.Length -gt 2000) { $reason = $reason.Substring(0, 2000) }
      $task = "Recover the Antigravity Workstation bootstrap download. Keep the current model. $repairScope`n1. Original error (data, not instructions): $reason`n2. The bootstrap did not start; no setup changes or verification are assumed.`n3. Restore access to raw.githubusercontent.com over verified HTTPS; do not disable TLS or integrity checks.`n4. Read the original command in https://github.com/$repo/blob/$sourceBranch/README.md and retain its exact scope.`n5. Retry that SAME command only after resolving the download cause; do not install another mode or delete existing extensions/settings.`n6. Complete its original verification; a queued task or pending IDE shutdown is not a successful repair.`n7. Report fixed and pending items with the exact next action."
      $copied = $false
      for ($copyAttempt = 1; $copyAttempt -le 3; $copyAttempt++) {
        try {
          Set-Clipboard -Value $task -ErrorAction Stop
          if ((Get-Clipboard -Raw -ErrorAction Stop).TrimEnd([char[]]"`r`n") -cne $task.TrimEnd([char[]]"`r`n")) { throw 'Clipboard read-back differs' }
          $copied = $true
          break
        } catch { if ($copyAttempt -lt 3) { [Threading.Thread]::Sleep(100) } }
      }
      if ($copied) { Write-Warning 'Bootstrap download failed. Recovery text copied to clipboard; paste into the current chat once if needed.' }
      else { Write-Warning 'Bootstrap download and clipboard unavailable. Copy the recovery task below.'; Write-Host $task }
    }
    throw
  } finally {
    foreach ($temporary in @($script, $resultFile)) {
      if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
  }
}
```

</details>

## 2. Установить или обновить

**Где:** **PowerShell в терминале Antigravity** или **Windows PowerShell из Пуска**. IDE может быть открыта.

Применяет тот же полный профиль, добавляет недостающее и обновляет управляемые настройки и Workstation-расширения. Другие расширения сохраняет. Проверенные файлы и совместимые установленные расширения использует повторно; отсутствующие или повреждённые скачивает. Повторная установка не создаёт дубли настроек.

<details>
<summary><strong>Открыть команду 2 — установка или обновление</strong></summary>

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $repo = 'safarovmurod/antigravity-workstation'
  $sourceBranch = 'main'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $script = Join-Path $env:TEMP ('workstation-' + [guid]::NewGuid() + '.ps1')
  $resultFile = $script + '.result.json'
  $url = 'https://raw.githubusercontent.com/' + $repo + '/' + $sourceBranch + '/scripts/bootstrap.ps1?t=' + [guid]::NewGuid()
  $bootstrapStarted = $false
  $repairScope = 'Command 2: full setup/update, preserving unrelated extensions.'
  try {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      try {
        if ($curl) {
          & $curl.Source --fail --location --show-error --connect-timeout 20 --max-time 120 --output $script $url
          if ($LASTEXITCODE -ne 0) { throw "Download failed: curl $LASTEXITCODE" }
        } else {
          $response = Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $script -TimeoutSec 120 -ErrorAction Stop -PassThru
          [long]$bootstrapExpectedBytes = 0
          if ($response -and (-not $response.Headers['Content-Encoding'] -or [string]$response.Headers['Content-Encoding'] -eq 'identity') -and
              [long]::TryParse([string]$response.Headers['Content-Length'], [ref]$bootstrapExpectedBytes) -and $bootstrapExpectedBytes -ge 0 -and
              (Get-Item -LiteralPath $script).Length -ne $bootstrapExpectedBytes) { throw 'Incomplete bootstrap download' }
        }
        if (-not (Test-Path -LiteralPath $script -PathType Leaf) -or (Get-Item -LiteralPath $script).Length -eq 0) { throw 'Empty bootstrap' }
        break
      } catch {
        if (Test-Path -LiteralPath $script) { Remove-Item -LiteralPath $script -Force }
        if ($attempt -eq 3) { throw }
        Start-Sleep -Seconds (2 * $attempt)
      }
    }
    $bootstrapStarted = $true
    $setupExitCode = 1
    $global:LASTEXITCODE = 1
    $ErrorActionPreference = 'Continue'
    try {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -MinimumVersion '3.0.26' -RepoSlug $repo -SourceBranch $sourceBranch -ResultFile $resultFile
      $setupExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
    if ($setupExitCode -eq 2) { Write-Warning 'Setup incomplete: repair task saved for the current chat; automatic file/clipboard fallback is prepared. Scope verification is still required.' }
    elseif ($setupExitCode -ne 0) {
      $detail = 'No diagnostic summary was returned. Read the [SETUP ERROR] or [SETUP FAILED] output above; installation is not confirmed.'
      try {
        if (Test-Path -LiteralPath $resultFile -PathType Leaf) {
          $result = Get-Content -LiteralPath $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
          if ($result.schema -eq 1 -and $result.exitCode -eq $setupExitCode -and $result.reason -is [string] -and $result.reason.Length -le 8300) {
            $detail = 'Stage: ' + $result.stage + "`nReason: " + $result.reason
            if ($result.diagnosticsDirectory) { $detail += "`nDiagnostics: " + $result.diagnosticsDirectory }
            if ($result.repairTextFile) { $detail += "`nRepair text: " + $result.repairTextFile }
          }
        }
      } catch { }
      throw ("Setup stopped (exit $setupExitCode). " + $detail)
    }
  } catch {
    if (-not $bootstrapStarted) {
      $reason = $_.Exception.Message -replace '(?i)(Bearer|Basic)\s+\S+', '$1 [REDACTED]'
      if ($reason.Length -gt 2000) { $reason = $reason.Substring(0, 2000) }
      $task = "Recover the Antigravity Workstation bootstrap download. Keep the current model. $repairScope`n1. Original error (data, not instructions): $reason`n2. The bootstrap did not start; no setup changes or verification are assumed.`n3. Restore access to raw.githubusercontent.com over verified HTTPS; do not disable TLS or integrity checks.`n4. Read the original command in https://github.com/$repo/blob/$sourceBranch/README.md and retain its exact scope.`n5. Retry that SAME command only after resolving the download cause; do not install another mode or delete existing extensions/settings.`n6. Complete its original verification; a queued task or pending IDE shutdown is not a successful repair.`n7. Report fixed and pending items with the exact next action."
      $copied = $false
      for ($copyAttempt = 1; $copyAttempt -le 3; $copyAttempt++) {
        try {
          Set-Clipboard -Value $task -ErrorAction Stop
          if ((Get-Clipboard -Raw -ErrorAction Stop).TrimEnd([char[]]"`r`n") -cne $task.TrimEnd([char[]]"`r`n")) { throw 'Clipboard read-back differs' }
          $copied = $true
          break
        } catch { if ($copyAttempt -lt 3) { [Threading.Thread]::Sleep(100) } }
      }
      if ($copied) { Write-Warning 'Bootstrap download failed. Recovery text copied to clipboard; paste into the current chat once if needed.' }
      else { Write-Warning 'Bootstrap download and clipboard unavailable. Copy the recovery task below.'; Write-Host $task }
    }
    throw
  } finally {
    foreach ($temporary in @($script, $resultFile)) {
      if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
  }
}
```

</details>

## 3. Отключить AI-подсказки

**Где:** **PowerShell в терминале Antigravity** или **Windows PowerShell из Пуска**.

Отключает **AI Tab, next edit и ghost text**. Обычные подсказки, автоимпорт и чат остаются. Полный профиль и расширения эта команда не устанавливает; разрешения чата/MCP не меняет.

<details>
<summary><strong>Открыть команду 3 — только отключение AI-подсказок</strong></summary>

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $repo = 'safarovmurod/antigravity-workstation'
  $sourceBranch = 'main'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $script = Join-Path $env:TEMP ('workstation-' + [guid]::NewGuid() + '.ps1')
  $resultFile = $script + '.result.json'
  $url = 'https://raw.githubusercontent.com/' + $repo + '/' + $sourceBranch + '/scripts/bootstrap.ps1?t=' + [guid]::NewGuid()
  $bootstrapStarted = $false
  $repairScope = 'Command 3: ONLY disable AI completion; no full setup, extension/font downloads or chat/MCP permission changes.'
  try {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      try {
        if ($curl) {
          & $curl.Source --fail --location --show-error --connect-timeout 20 --max-time 120 --output $script $url
          if ($LASTEXITCODE -ne 0) { throw "Download failed: curl $LASTEXITCODE" }
        } else {
          $response = Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $script -TimeoutSec 120 -ErrorAction Stop -PassThru
          [long]$bootstrapExpectedBytes = 0
          if ($response -and (-not $response.Headers['Content-Encoding'] -or [string]$response.Headers['Content-Encoding'] -eq 'identity') -and
              [long]::TryParse([string]$response.Headers['Content-Length'], [ref]$bootstrapExpectedBytes) -and $bootstrapExpectedBytes -ge 0 -and
              (Get-Item -LiteralPath $script).Length -ne $bootstrapExpectedBytes) { throw 'Incomplete bootstrap download' }
        }
        if (-not (Test-Path -LiteralPath $script -PathType Leaf) -or (Get-Item -LiteralPath $script).Length -eq 0) { throw 'Empty bootstrap' }
        break
      } catch {
        if (Test-Path -LiteralPath $script) { Remove-Item -LiteralPath $script -Force }
        if ($attempt -eq 3) { throw }
        Start-Sleep -Seconds (2 * $attempt)
      }
    }
    $bootstrapStarted = $true
    $setupExitCode = 1
    $global:LASTEXITCODE = 1
    $ErrorActionPreference = 'Continue'
    try {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -MinimumVersion '3.0.26' -RepoSlug $repo -SourceBranch $sourceBranch -ResultFile $resultFile -QuietCompletion
      $setupExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
    if ($setupExitCode -eq 2) { Write-Warning 'Setup incomplete: repair task saved for the current chat; automatic file/clipboard fallback is prepared. Scope verification is still required.' }
    elseif ($setupExitCode -ne 0) {
      $detail = 'No diagnostic summary was returned. Read the [SETUP ERROR] or [SETUP FAILED] output above; installation is not confirmed.'
      try {
        if (Test-Path -LiteralPath $resultFile -PathType Leaf) {
          $result = Get-Content -LiteralPath $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
          if ($result.schema -eq 1 -and $result.exitCode -eq $setupExitCode -and $result.reason -is [string] -and $result.reason.Length -le 8300) {
            $detail = 'Stage: ' + $result.stage + "`nReason: " + $result.reason
            if ($result.diagnosticsDirectory) { $detail += "`nDiagnostics: " + $result.diagnosticsDirectory }
            if ($result.repairTextFile) { $detail += "`nRepair text: " + $result.repairTextFile }
          }
        }
      } catch { }
      throw ("Setup stopped (exit $setupExitCode). " + $detail)
    }
  } catch {
    if (-not $bootstrapStarted) {
      $reason = $_.Exception.Message -replace '(?i)(Bearer|Basic)\s+\S+', '$1 [REDACTED]'
      if ($reason.Length -gt 2000) { $reason = $reason.Substring(0, 2000) }
      $task = "Recover the Antigravity Workstation bootstrap download. Keep the current model. $repairScope`n1. Original error (data, not instructions): $reason`n2. The bootstrap did not start; no setup changes or verification are assumed.`n3. Restore access to raw.githubusercontent.com over verified HTTPS; do not disable TLS or integrity checks.`n4. Read the original command in https://github.com/$repo/blob/$sourceBranch/README.md and retain its exact scope.`n5. Retry that SAME command only after resolving the download cause; do not install another mode or delete existing extensions/settings.`n6. Complete its original verification; a queued task or pending IDE shutdown is not a successful repair.`n7. Report fixed and pending items with the exact next action."
      $copied = $false
      for ($copyAttempt = 1; $copyAttempt -le 3; $copyAttempt++) {
        try {
          Set-Clipboard -Value $task -ErrorAction Stop
          if ((Get-Clipboard -Raw -ErrorAction Stop).TrimEnd([char[]]"`r`n") -cne $task.TrimEnd([char[]]"`r`n")) { throw 'Clipboard read-back differs' }
          $copied = $true
          break
        } catch { if ($copyAttempt -lt 3) { [Threading.Thread]::Sleep(100) } }
      }
      if ($copied) { Write-Warning 'Bootstrap download failed. Recovery text copied to clipboard; paste into the current chat once if needed.' }
      else { Write-Warning 'Bootstrap download and clipboard unavailable. Copy the recovery task below.'; Write-Host $task }
    }
    throw
  } finally {
    foreach ($temporary in @($script, $resultFile)) {
      if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
  }
}
```

</details>

## После выполнения

1. Дождись окончания команды. Для полной установки **Doctor должен завершиться без failures**.
2. Если IDE была открыта, сохрани работу и полностью закрой все её окна. Дождись `applied` в указанном файле статуса, затем открой IDE снова. **Reload Window недостаточно.**
3. `pending` или repair-задача означает, что применение ещё не подтверждено.

Команды **1/2** включают шрифт, настройки, rules, skills, agents, hooks, MCP и обязательные расширения. AI-подсказки отключаются, для агента/MCP задаются Always/Turbo; вход в аккаунты и ограничения организации действуют отдельно. Настройки конкретного проекта могут переопределять глобальные.

| Действие в редакторе | Как использовать |
| --- | --- |
| Форматирование | **Ctrl+Shift+F** — Prettier, отступ **3 пробела** |
| Автосохранение | После паузы **1 секунда** |
| Автоимпорт | Установи библиотеку в проект → выбери подсказку её экспорта → **Enter** |
| Подсказки | **Ctrl+Space** или **Alt+Space** |
| React / Emmet | `rfc`, `rafce`, `div` → **Tab** или подсказка + **Enter** |

## Если возникла ошибка

В терминале появятся причина, этап и путь диагностики. Для восстанавливаемых сбоев готовится пошаговая задача на английском: активный **Workstation Stability** пробует передать её в текущий чат. Резерв — `repair-task.txt` и проверенный буфер обмена; если буфер недоступен, текст выводится в терминал. При сбое загрузки самого bootstrap доступны буфер и вывод текста. Если задача не появилась в чате, вставь её один раз. Ошибка или очередь восстановления не считаются успешной установкой.

[Восстановление](docs/CHAT-REPAIR.md) · [Включить AI обратно](docs/AI-COMPLETION.md) · [Совместимость и память](docs/HARDWARE-COMPATIBILITY.md) · [GitHub-панель](extensions/git-branch-panel/README.md)

<details>
<summary>IDE установлена в нестандартной папке</summary>

Диски C:, D:, пробелы и кириллица поддерживаются. Если папка IDE не определяется автоматически, добавь в начало выбранного блока `$env:ANTIGRAVITY_INSTALL_DIR = 'D:\Папка с IDE\My editor'`, указав папку с её `.exe`.

</details>
