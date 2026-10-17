# Перенос Mansur Setup в НОВЫЙ GitHub-репозиторий одной командой.
# Что делает сам: обновляет адрес репозитория в README, коммитит все изменения,
# подключает новый remote и пушит. От тебя — только адрес нового репозитория.
# Удаление СТАРОГО репозитория на github.com скрипт сделать не может (это твой
# аккаунт): Settings -> Danger Zone -> Delete this repository.
param([string]$Url = 'https://github.com/safarovmurod/antigravity-workstation')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not $Url) { $Url = Read-Host 'Вставь адрес НОВОГО репозитория (https://github.com/USER/REPO или USER/REPO)' }
$Url = $Url.Trim().TrimEnd('/')
if ($Url -match '^https?://github\.com/([^/\s]+)/([^/\s]+?)(?:\.git)?$') { $slug = $Matches[1] + '/' + $Matches[2] }
elseif ($Url -match '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { $slug = $Url }
else { throw "Не похоже на адрес GitHub-репозитория: $Url" }
if ($slug -eq 'safarovmurod/mansur-setup') { throw 'Это адрес СТАРОГО репозитория. Создай новый и вставь его адрес.' }
Write-Host "Новый репозиторий: $slug"

if (-not (git config user.email)) { throw 'Git не знает твой email. Один раз выполни: git config --global user.name "Имя" и git config --global user.email "ты@почта.ру", затем запусти снова.' }

# 1. README: адрес репозитория (обе команды установки) и ссылка на TS MANCHO VSIX.
$readme = Join-Path $root 'README.md'
$text = [IO.File]::ReadAllText($readme)
$old = '$repo = ''safarovmurod/mansur-setup'''
$new = '$repo = ''' + $slug + ''''
$replaced = ([regex]::Matches($text, [regex]::Escape($old))).Count
$text = $text.Replace($old, $new)
$text = $text.Replace('https://github.com/safarovmurod/mansur-setup/raw/main/extensions/ts-mancho/ts-mancho-3.2.0.vsix', 'https://github.com/' + $slug + '/raw/main/extensions/ts-mancho/ts-mancho-3.2.0.vsix')
# Любые оставшиеся упоминания старого slug (например, ссылки на CI) тоже ведут в новый репозиторий.
$text = $text.Replace('safarovmurod/mansur-setup', $slug)
[IO.File]::WriteAllText($readme, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("README.md: обновлено адресов: " + $replaced + " команды + ссылка VSIX.")

# 2. Коммит всех изменений.
git add -A | Out-Null
$pending = @(git status --porcelain)
if ($pending.Count -gt 0) {
  git commit -m "Mansur Setup 2.2.1: TS MANCHO 3.2.0 calm diagnostics, reliability fixes (K1-K4), helper 1.2.2" | Out-Null
  Write-Host 'Изменения закоммичены.'
} else {
  Write-Host 'Новых изменений нет — коммит пропущен.'
}

# 3. Ветка, remote, пуш.
git branch -M main | Out-Null
git remote remove origin 2>$null
git remote add origin ('https://github.com/' + $slug + '.git')
$forcePush = $false
$remoteMain = git ls-remote origin main 2>$null
if ($remoteMain) {
  Write-Host 'В новом репозитории уже есть стартовый коммит (LICENSE/README, созданный GitHub).'
  $answer = Read-Host 'Перезаписать его историей этого проекта? Репозиторий только что создан — терять нечего [Y/n]'
  if ($answer -ne '' -and $answer -notmatch '^[YyДдАа]') { throw 'Отменено. Ничего не изменено.' }
  $forcePush = $true
}
Write-Host 'Пуш... при первом пуше GitHub может спросить вход — это нормально.'
if ($forcePush) { git push -u origin main --force } else { git push -u origin main }
if ($LASTEXITCODE -ne 0) {
  throw "Пуш не прошёл. Если GitHub просит вход — войди в открывшемся окне браузера и запусти скрипт снова. Если нет прав на запись — проверь, что репозиторий создан под твоим аккаунтом."
}
Write-Host ''
Write-Host 'ГОТОВО: код в новом репозитории, команда из README теперь качает именно его.'
Write-Host 'Осталось вручную (у меня нет доступа к твоему аккаунту GitHub):'
Write-Host '  1) открой СТАРЫЙ репозиторий на github.com;'
Write-Host '  2) Settings -> прокрути в самый низ -> Danger Zone -> Delete this repository;'
Write-Host '  3) подтверди имя репозитория в появившемся окне.'
