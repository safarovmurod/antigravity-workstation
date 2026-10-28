# Antigravity Workstation

[Публикация в main, резервное восстановление и незакрытые проверки](docs/MAIN-CONSOLIDATION-2026-10-26.md). Сохранение кода в main не заменяет live Gemini/Windows-приёмку.

Исторические [проверки Setup 3.0.26](docs/MAIN-CONSOLIDATION-2026-10-26.md) и [34cf909](docs/DEEP-SAFETY-REVIEW-2026-10-26.md) сохранены отдельно. Актуальные результаты относятся только к своему commit: [GitHub Actions main](https://github.com/safarovmurod/antigravity-workstation/actions?query=branch%3Amain). Исторические количества PASS не являются приёмкой текущей версии.

**Aster Atelier**: один VSIX с 20 темами и 10 лицензированными шрифтами. [Исходный код и Details](extensions/aster-appearance/README.md), [VSIX](extensions/aster-appearance/aster-appearance-1.0.4.vsix), [точная матрица готовности](docs/ASTER-ACCEPTANCE.md). Полный и lite setup включают пакет; отдельно его можно выбрать через **Extensions → Install from VSIX**, затем **Aster Atelier: Appearance Studio**. Managed-зависимость от One Dark Pro заменена; личные theme-расширения не удаляются. Публикация кода в main не означает завершения всех live-проверок: ограничения перечислены ниже.

**Твой готовый профиль Antigravity IDE для Windows.** Отдельная установка для MacBook приведена ниже.

JetBrains Mono · плавный курсор · автоимпорт · Prettier с отступом 3 пробела · Auto Save · GitHub-панель · правила и агенты.

[Видео с озвучкой](docs/VIDEO-GUIDE.md) · [Расширения и настройки](docs/EXTENSIONS.md) · [Исторический отчёт 3.0.24](docs/DELIVERY-2026-10-25.md) · [Текущий corrective checklist](docs/CORRECTIVE-AUDIT-WIP-2026-10-25.md)

[Доказательный corrective отчёт:118 строк/247 отдельных acceptance](docs/FINAL-CORRECTIVE-AUDIT-2026-10-25.md). Draft PR не является принятым release.

[Автоматический аудит и его ограничения](docs/AUTOMATED-AUDIT-2026-10-27.md) · [Короткая ручная проверка в Antigravity](docs/USER-MANUAL-ACCEPTANCE-2026-10-27.md).

Setup **3.0.28** добавляет полную миграцию GSD **1.19.0** к опубликованным исправлениям и Aster Atelier. Личные JSON/token rules сохраняются через ownership merge; Git delete имеет явный local/origin/force scope; gallery updater проверяет metadata перед download. Все три команды ниже получают текущий **main**, не временные ветки. Это не подтверждение выполнения всех 13 требований: inline Gemini questionnaire, live Gemini, exhaustive visual review и Windows reboot остаются непроверенными/заблокированными. Шесть актуальных Git-схем и инструкции Aster/Stability — анимации, не записи IDE; их отдельная проверка описана в [acceptance](docs/INSTRUCTIONAL-MEDIA.md).

Ownership fix сохраняет неизвестные personal diagnostic/import options, включая Python overrides. Source включает Stability 1.3.18: локальный плеер двух настоящих записей и восьми отмеченных учебных анимаций, сохранение личных Error Lens exclusions и обновление legacy React snippet cache через официальный configuration API. `rfc/rafce` не добавляют `import React`; после первого обновления React Snippets 4.4.3 сохрани работу и выполни **Developer: Reload Window**. Class-аннотации у closing tag скрыты, обычные подсказки Tailwind и tag matching сохранены. Старые VSIX не выбираются каталогом. PR #3 уже merged в main `f7a3181`; [GSD 1.19 migration и новые проверки](docs/GSD-1.19-MIGRATION.md), [repair evidence](docs/REPAIR-3.0.26.md), [отдельные acceptance criteria для всех118 исходных строк](docs/CORRECTIVE-ACCEPTANCE.json), [inventory cleanup](docs/SETTINGS-CLEANUP-INVENTORY.json), [локальная запись настоящих видео после официального входа](docs/LOCAL-RECORDING-RUNBOOK.md), [непройденная live Gemini matrix](docs/LIVE-GEMINI-ACCEPTANCE.json). Runtime tokens/latency и inline form не объявлены проверенными.

Bootstrap сначала разрешает точный текущий commit main, затем скачивает и проверяет snapshot этого commit; cache другой версии не подставляется. Если main/сеть недоступны или Setup старее **3.0.28**, установка завершается ошибкой, без fallback на старые ветки. Команда 2 сохраняет личные расширения; `--clean-extensions` используйте только для явно выбранной очистки. До фактической публикации 3.0.28 freshness guard откажет старому main, а не молча установит старую версию.

Обновление профиля сохраняет выбранную вручную цветовую тему и шрифт. Для нового профиля используется Aster `oceanic pro`; One Dark Pro больше не устанавливается проектом. Gallery-расширения проверяются на latest stable compatible; отдельный проверяемый updater не выдаётся за native auto-update pinned-пакетов. Локальные расширения обновляются этими командами README. Реальные записи и оставшиеся исторические схемы действий различаются в manifest; восемь реальных роликов пока не готовы.

## Выбери действие

Обычный install/update сохраняет существующие настройки. Для явной замены managed editor defaults доступен CLI-флаг `install --apply-profile`; `install --quiet-completion` или команда 3 явно отключают AI completion. Отдельный `install --auto-approve` меняет широкие agent permissions, Secure Mode/sandbox и native AI Tab — не используйте его без выбора именно такого режима. Значения, изменённые прежними установками, автоматически не угадываются и не восстанавливаются: для восстановления нужен настоящий backup.

### MacBook: отдельная команда 1

В скачанной и распакованной копии репозитория также есть `Install-Antigravity.command`. В Terminal из этой папки выполни `chmod +x Install-Antigravity.command`, затем открой файл двойным кликом. Он запускает тот же macOS bootstrap; Node.js 24+, установленная и закрытая Antigravity остаются обязательными. Не переноси `.command` отдельно от папки `scripts`.

Установи [Antigravity IDE для macOS](https://antigravity.google/download) и Node.js 24+, открой IDE один раз, затем полностью закрой её. В **Terminal** вставь **одну команду**:

```bash
bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/scripts/bootstrap-macos.sh | bash'
```

Команда запускает **отдельный установщик macOS** из `macos/`; установщик Windows не используется и не меняется. Он применяет настройки, правила, skills, шрифт и расширения с резервной копией. Apple Silicon и Intel проверяются раздельными GitHub Actions jobs; штатные установки остаются условием для окончательного подтверждения. Если IDE находится в другом месте, до запуска укажи абсолютный путь к `.app` в `ANTIGRAVITY_INSTALL_DIR`. Внутренние настройки AI Tab и разрешения агента требуют проверки конкретной сборки IDE на Mac и этим установщиком не изменяются.

### Windows: команды 1–3

| № | Команда | Где запускать |
| :---: | --- | --- |
| **1** | Полная настройка с очисткой лишних расширений | **Windows PowerShell из Пуска. Antigravity закрыта.** |
| **2** | Установить или обновить, сохранив другие расширения | PowerShell в Antigravity **или** Windows PowerShell |
| **3** | Только отключить AI-подсказки | PowerShell в Antigravity **или** Windows PowerShell |

**Нужно:** установленная Antigravity, интернет, Windows 10 x64 (build 19041+) или Windows 11 x64/ARM64. Native runtime проверен и подтверждён для IDE **2.5.5** и **2.6.0** (x64 и ARM64). Native adapter проверяет точные bundle/schema hashes. Несовпадение audited native bytes останавливает preflight до изменений. [Read-only диагностика активной установки](scripts/inspect-running-antigravity.ps1) и [границы проверки](docs/MAIN-ONLY-SAFETY-2026-10-28.md) описаны отдельно; image paste в аутентифицированном чате описан в границах приёмки.

<a id="quick-start"></a>

**Как запустить:** раскрой нужную команду → нажми **Copy** у блока → вставь целиком в PowerShell. Копируй от `& {` до последней `}`; без строк с обратными кавычками, `PS C:\...>` и `>>`. Если вставил лишнее — **Ctrl+C** и повтори. Выполняй под своим Windows-пользователем; открытая папка проекта на место установки не влияет.

## 1. Полная настройка с очисткой

**Где:** отдельный **Windows PowerShell из меню Пуск**. Сначала сохрани работу и закрой **все окна Antigravity**.

Устанавливает обязательные расширения и добавляет недостающие настройки. Существующие настройки и shortcuts сохраняет. Только выбранный здесь CleanExtensions архивирует лишние/старые расширения с резервной копией. Этот режим не означает согласие на изменение AI completion или agent security permissions. При конфликте с вручную изменёнными rules/skills установка останавливается.

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
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -MinimumVersion '3.0.28' -RepoSlug $repo -SourceBranch $sourceBranch -ResultFile $resultFile -CleanExtensions
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

Добавляет недостающее и обновляет Workstation-расширения, сохраняя существующие personal settings, shortcuts и другие расширения. AI completion, MCP grants, Secure Mode и sandbox автоматически не меняет. Проверенные файлы использует повторно; отсутствующие или повреждённые скачивает. Повторная установка не создаёт дубли настроек.

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
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -MinimumVersion '3.0.28' -RepoSlug $repo -SourceBranch $sourceBranch -ResultFile $resultFile
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
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -MinimumVersion '3.0.28' -RepoSlug $repo -SourceBranch $sourceBranch -ResultFile $resultFile -QuietCompletion
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


> **Published on main:** Aster Atelier 1.0.4 and the macOS installer are included from commit `272969f180244db2e3a5b81c24c056a58a30662d`. The commands above resolve current `main`; live authenticated chat/image-paste acceptance remains unverified.
