# Исправление незавершённой установки через текущий чат

Начиная с setup 3.0.9 и Workstation Stability 1.3.5 команды 1 и 2 из README сохраняют задачу восстановления после собранных установщиком ошибок отдельных расширений, шрифта, MCP/runtime или браузера, а также после неудачной проверки Doctor. Независимые этапы продолжаются. Ошибки предварительной проверки, backup, повреждённого профиля и конфликтующих записей остаются остановкой; они не превращаются в разрешение продолжать изменение профиля.

Задача отправляется в **текущий native чат Antigravity с текущей моделью**. Helper использует проверенную для IDE 2.5.5 внутреннюю команду `antigravity.sendPromptToAgentPanel` с одной текстовой строкой. Она открывает панель и передаёт `sendMessage` в текущую беседу; если беседы нет, IDE создаёт её штатным способом. Helper не выбирает модель, не создаёт отдельную беседу принудительно и не читает аккаунты или токены. Для другой версии IDE или отсутствующей команды задача остаётся ожидающей. Это внутренний интерфейс IDE, поэтому поддержка новой версии требует проверки.

В setup 3.0.10 / helper 1.3.6 текст задачи написан на английском и разделён на 7 шагов: определить реальные сбои; открыть сохранённый исходник; определить пути IDE и профиля; найти исходные конфиги и официальные источники нужного компонента; исправить только затронутые части; запустить Doctor для исходного ID; показать таблицу результата. В задаче указаны локальные пути setup-failure.json и лога, если они доступны. Намеренно пропущенные optional-расширения и повторно использованные исправные пакеты не считаются сбоями. Длинная сводка сокращается с явной пометкой и ссылкой на локальную диагностику.

Задача содержит ограниченную, повторно очищенную от распространённых форм credentials сводку ошибки, путь проверенного исходника и команды повторной обычной установки/проверки. Проекты, базы аккаунтов и полные логи в сообщение не прикладываются. Вывод ошибки помечается как данные, а не инструкции. Gemini или другой выбранный агент должен исправлять только сбои и сохранять личные файлы, настройки и учётные данные. Сеть, вход в аккаунт, quota и выполнение агентом запроса остаются условиями работы чата.

Отправка начинается после освобождения installer lock и общего source-cache lock. На Windows helper проверяет также `FileShare.None` bootstrap: повторная установка вместе с Doctor не должна пересекаться с новой отправкой. После первого обновления уже загруженного helper или при закрытой IDE нужен штатный полный перезапуск. Если helper не установлен или clean rollback восстановил старую версию, задача сохранена, но её автоматическая отправка требует активного helper 1.3.5 или новее. Установка helper не объявляется успешной при его собственном сбое.

Файлы находятся в `%USERPROFILE%\.gemini\config\workstation-setup\repair-chat`: один `request.json`, один `status.json`, кратковременный `dispatch.lock`. Повтор той же ошибки использует ту же задачу. Блокировка общая для окон IDE. Перед вызовом native команды сохраняется `dispatching`; после принятия события — `dispatched`. Эти статусы не доказывают ответ агента или успешное исправление. После crash/timeout состояние `uncertain` не отправляется повторно автоматически. Явная команда палитры **Workstation: Retry Setup Repair Task in Current Chat** разрешает повтор; сначала проверь, не появилась ли задача в текущем чате.

При передаче задачи bootstrap завершается с **exit 2**, а README выводит предупреждение «исправление ожидается». Исходный exit code и причина остаются в `setup-failure.json`. Если задачу сохранить не удалось, остаётся первоначальный неуспешный код. Exit 0 полной установки означает успешный install и Doctor; queued/dispatched не подменяют этот результат. Третья README-команда остаётся отдельным completion-only действием.

## Если автоматическая передача в чат не сработала

Сначала проверь текущий чат: после timeout сообщение могло уже попасть туда. Если задачи там нет, выполни этот блок в обычном Windows PowerShell. Он показывает сохранённую английскую задачу и копирует её в буфер обмена, когда буфер доступен. Затем вставь текст в чат вручную. Helper и вход в AI для самого копирования не нужны. Команда не запускает установку, не отправляет сообщение и не меняет статус задачи.

```powershell
& {
  $ErrorActionPreference = 'Stop'
  try {
    $directory = Join-Path $env:USERPROFILE '.gemini\config\workstation-setup\repair-chat'
    $file = Join-Path $directory 'request.json'
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      Write-Warning 'No saved repair task. Use the Setup diagnostics / Failure report path printed by the installer.'
      return
    }
    $item = Get-Item -LiteralPath $file -Force
    if ($item.Length -gt 65536 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid repair request file.' }
    $request = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($request.schema -ne 1 -or $request.kind -ne 'workstation-setup-repair' -or
        $request.id -notmatch '^[a-f0-9-]{36}$' -or $request.prompt -isnot [string] -or
        [string]::IsNullOrWhiteSpace($request.prompt) -or $request.prompt.Length -gt 24576) { throw 'Invalid repair task.' }
    $statusFile = Join-Path $directory 'status.json'
    if (Test-Path -LiteralPath $statusFile -PathType Leaf) {
      $statusItem = Get-Item -LiteralPath $statusFile -Force
      if ($statusItem.Length -gt 65536 -or ($statusItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid repair status file.' }
      $status = Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($status.id -eq $request.id -and $status.state -in @('verified', 'superseded')) {
        Write-Host 'This repair task is already resolved. Nothing copied; use diagnostics for any new failure.'
        return
      }
    }
    Write-Output $request.prompt
    try {
      Set-Clipboard -Value $request.prompt -ErrorAction Stop
      Write-Host 'Repair task copied. Check the current chat for an existing copy before pasting. Doctor verification is still required.'
    } catch {
      Write-Warning 'Clipboard unavailable. Copy the English task printed above; the original request.json is unchanged.'
    }
  } catch {
    Write-Warning ('Cannot read the saved task: ' + $_.Exception.Message + ' Use the original Setup diagnostics / Failure report.')
  }
}
```

Если задача уже исправлена или отмечена как `verified`/`superseded`, повторно не вставляй её. Если агент не смог исправить сбой, сначала восстанови недостающий доступ/сеть или выполни указанное штатное закрытие IDE, затем продолжи ту же задачу в том же чате. Путь исходника и команда проверки Doctor уже включены в текст. Для повторной автоматической отправки есть **Workstation: Retry Setup Repair Task in Current Chat**; используй её только после проверки, что предыдущая отправка не создала дубликат. Недоступная авторизация или quota сами от копирования не исправляются.

В задаче есть команда `node '<source>/scripts/queue-repair-chat.cjs' --verify '<request-id>'`. Она запускает Doctor из того же исходника и записывает `verified` только после exit 0. Другой ID, другой исходник, работающий installer или неуспешный Doctor не могут подтвердить эту задачу. Самостоятельный успешный повтор полной README-установки после Doctor помечает старую задачу `superseded`, чтобы она уже не отправлялась. Обычный CLI `install` не создаёт новые chat-задачи, поэтому повтор из самого агента не зацикливается.

Source cache сохраняет текущий/предыдущий проверенные commit и, при необходимости, ещё **один** исходник активной неподтверждённой задачи. После проверки или успешного повторного bootstrap дополнительный исходник снова допускается к обычной очистке. Полный проект в очередь не копируется; старые непознанные или изменённые вручную данные сохраняются как прежде.

Проверки покрывают очистку сводки, отсутствие выбора модели, дедупликацию, несколько окон, блокировки, неизвестную версию IDE, crash/timeout, ID проверки, Doctor и устаревшую задачу. Native Windows smoke проверяет регистрацию команды в реальной IDE, не отправляя синтетический платный запрос. Работа авторизованного чата конкретного аккаунта и результат реального AI-исправления не подменяются этими проверками.
