# Mansur · Antigravity IDE

Конфиги охирини Antigravity-и шеф барои Windows. **Setup 2.2.1.** Settings, MD, skills, agents, hooks, runtime ва **21 extension** бо як команда барқарор мешаванд. Jelly Cursor дар catalog ҳамчун extension-и ихтиёрӣ мемонад. Версияҳои extension дар ҳамин repo нигоҳ дошта мешаванд: **TS MANCHO 3.2.0**, **Mansur Antigravity Stability 1.2.2** ва **Mansur GitHub Panel 1.2.1** ҳам дохиланд.

**[Скачать TS MANCHO 3.2.0 (.vsix)](https://github.com/safarovmurod/mansur-setup/raw/main/extensions/ts-mancho/ts-mancho-3.2.0.vsix)** — насб: Extensions → Install from VSIX. Quiet mode хатҳои сурх/зардро бо шаффофии 95% (`editorError/editorWarning.foreground` бо alpha `0D`) ором нишон медиҳад; unused hints ва Error Lens пурра боқӣ мемонанд; санҷиши TypeScript ва IntelliSense фаъол мемонад. Сохтани VSIX аз source: `npm run build:ts-mancho`.

Иловаҳои интихобшудаи 4–5–6: **typing pulse** дар JS/TS бо затухание-и 280 ms; **Auto Save** пас аз 1000 ms пауза. Танзимҳо: `tsMancho.typingPulse`, `tsMancho.autoSaveAfterTyping`, `tsMancho.autoSaveDelayMs`. Форматирование тугмаи алоҳида надорад: Prettier-и расмӣ бо `editor.formatOnSave` ва стандартной команди editor кор мекунад. Агар native Auto Save фаъол бошад, delay-и худи editor истифода мешавад. Командаи **TS MANCHO: Reset Managed Editor Settings** ҳамаи арзишҳои идорашавандаро ба арзишҳои аслӣи шумо бар мегардонад.

<a id="quick-start"></a>

## Насб ё update бо як команда

Antigravity IDE-ро кушо → **Terminal → New Terminal → PowerShell**. Ҳамин командаро пурра гузор:

**Нав дар 2.2.1:** TS MANCHO 3.2.0 — quiet mode-и ором: хатҳои сурх/зардро бо шаффофии 95% нишон медиҳад (бетирак пинҳон), unused hints ва Error Lens барқарор мешаванд; тугмаи Format хориҷ шуд (форматирование тавассути Prettier-и расмӣ); командаи нави Reset барои баргардонидани арзишҳои аслӣ. Antigravity Chat-и автоматӣ: ба allow-қоидаҳо `command(git *)`, `write_file(*)` ва `read_url(*)` илова шуд; native Terminal/Artifact Always Proceed ва MCP `mcp(*) Allow` тавре ки буд боқӣ мемонанд. **Надёжность:** backup-и бе manifest рад карда мешавад; backup ҳар файлро бо sha256-и худ сабт мекунад ва restore пеш аз ҳар гуна тағйир бутунӣ ро санҷид; lock-и вайршудаи resume худ иваз мешавад; recovery-worker Node-и зиндаро истифода мебарад, агар роҳи нигоҳдоршуда ғайб шуда бошад; Apply-и дастӣ ҳангоми санҷиш force-и худро нигоҳ медорад. Helper **1.2.2** — дар ҳамин ислоҳот.

**Нав дар 2.2.0:** санҷиши версия ва database пеш аз тағйирот; rollback-и ягонаи файлҳо + native preferences; `status` ва барқароркунии кори нотамом; ташхиси конфликтҳои project барои забонҳо ва multi-root; Windows smoke workflow; интихоби иловагии extension-ҳои `lite`. **`settings.json` дар насб/update ҳамоно аз конфиги ҳамин repo татбиқ мешавад**, аз ҷумла font/theme/formatter — ин рафтори дархосткардаи шеф нигоҳ дошта шуд. [Дастур ва маҳдудиятҳо](docs/RELIABILITY-2.2.0.md).

**Ҳамин команда ҳам барои насби нав ва ҳам барои update аст.** Он native **AI Tab/next-edit** ва **матни шаффофи AI (ghost text)**-ро автоматӣ хомӯш мекунад. Подсказкаҳои одии import, variable ва роҳҳои файл мемонанд; чати agent фаъол мемонад. Барои ин қисми setup командаи иловагӣ лозим нест. Пас аз анҷом корро Save кун, ҳамаи window-ҳои Antigravity-ро одӣ пурра пӯш, натиҷаи native-ро аз `statusFile` то `applied` санҷ ва IDE-ро аз нав кушо.

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $repo = 'safarovmurod/mansur-setup' # ← при переносе в новый репозиторий меняется только эта строка
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $p = Join-Path $env:TEMP ('mansur-setup-' + [guid]::NewGuid() + '.ps1')
  $url = 'https://raw.githubusercontent.com/' + $repo + '/main/scripts/bootstrap.ps1?t=' + [guid]::NewGuid()
  try {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    for ($i = 1; $i -le 3; $i++) {
      try {
        Write-Host "Downloading latest bootstrap ($i/3)..."
        if ($curl) {
          & $curl.Source --fail --location --show-error --connect-timeout 20 --max-time 120 --output $p $url
          if ($LASTEXITCODE -ne 0) { throw "curl exited with code $LASTEXITCODE" }
        } else {
          Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $p -TimeoutSec 120 -ErrorAction Stop
        }
        if (-not (Test-Path -LiteralPath $p -PathType Leaf) -or (Get-Item -LiteralPath $p).Length -eq 0) { throw 'Bootstrap download is empty' }
        break
      } catch {
        if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
        if ($i -eq 3) { throw "Bootstrap download failed: $url. $($_.Exception.Message)" }
        Write-Warning "Download failed: $($_.Exception.Message). Retrying..."
        Start-Sleep -Seconds (2 * $i)
      }
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Name "Шеф" -MinimumVersion '2.2.0' -RepoSlug $repo
    if ($LASTEXITCODE -ne 0) { throw 'Mansur Setup failed; read the error above.' }
  } finally {
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
  }
}
```

Команда bootstrap-и охирини `main`-ро бо cache-busting URL мегирад, commit-и ҷориро як бор муайян мекунад ва install + Doctor-ро аз ҳамон commit иҷро мекунад. Setup 2.2.1 хомӯш кардани native AI Tab/next-edit ва ghost text-ро ҳам дорад. TS MANCHO 3.2.0, роҳҳои ислоҳшудаи agent ва hook-ҳои бо quote ба ҳамин download дохиланд. Installer VSIX-и версияи дар catalog нишондодашударо интихоб мекунад; архивҳои таърихии дар repo монда насб намешаванд ва нусхаи кӯҳнаи npm cache истифода намешавад. Node.js ≥24, npm ≥10 ва Git санҷида мешаванд; агар лозим бошад, bootstrap онҳоро бо `winget` насб мекунад. `-Name "Шеф"` танҳо номи log аст. Дар log бояд **Package 2.2.1** ё версияи навтар барояд. `-MinimumVersion 2.2.0` версияи кӯҳнаро пеш аз install қатъ мекунад; версия ва commit дар log нишон дода мешаванд. MD, rules, skills, agents ва hooks аз ҳамон ZIP кушода насб мешаванд — download-и дастии ҷудогона лозим нест.

**Санҷиши 2.2.1:** **227 санҷиши асосӣ** — 205 гузаштанд, 0 вақтиагӣ, 22 skip (нативии opt-in ва symlink-guard дар Windows-муҳити маҳаллӣ); `test:bootstrap` 4/4 гузашт. Таърихии 2.2.0: [отчёти версияи ҷорӣ ва commit-ҳои санҷидашуда](docs/RELIABILITY-VERIFICATION.json) — **220 асосӣ, 11 native, 23 bootstrap ва 5 font-staging** гузаштанд; командаи зеркашидашуда насби такрорӣ ва **1068 payload file**, `status` ва rollback-ро санҷид. [Санҷиши воқеии Windows 2.5.5](https://github.com/safarovmurod/mansur-setup/actions/runs/38963163258) низ гузашт: кушодан → worker интизор мешавад → пӯшидани одӣ → татбиқ → боз кушодан, нигоҳдории native preferences, IntelliSense ва роҳи дақиқи project override. Live chat бо аккаунти Google ва lifecycle-и VSIX-и helper ба ин smoke дохил нестанд.

Отчётҳои пешина ҳамчун таърих мемонанд: [2.1.13 — download ва quiet-completion](docs/QUIET-COMPLETION-VERIFICATION.json), [2.1.12](docs/PUBLISHED-VERIFICATION.json).

**Full ё Lite:** ҳамон командаи боло бо нобаёнӣ профили пурраи пешинаро насб мекунад. Барои 11 extension-и асосӣ ба сатри `powershell.exe ... -File $p` фақат `-ExtensionProfile lite` илова кун. Extension-ҳои мавҷуд нест намешаванд; `settings.json`, хомӯшкунии AI-подсказкаҳо ва автоматикаи чат дар ҳар ду вариант татбиқ мешаванд.

**Ҳолати насб баъди download-и яккомандагӣ:** ин команда runtime-и нигоҳдошташударо мехонад; checkout-и project лозим нест:

```powershell
$runtime = Join-Path $env:USERPROFILE '.gemini\config\mansur-setup\automation-v2'
node (Join-Path $runtime 'setup-status.js') --status (Join-Path $runtime 'request.json')
```

Агар worker баъди restart қатъ шуда бошад, helper 1.2.2 ҳангоми кушодани IDE ҳамон request-ро бо ҳамон scope барқарор мекунад. `waiting` ҳанӯз `applied` нест. Натиҷаи native-и сабтшуда ва рафтори чати воқеӣ ҷудо нишон дода мешаванд. [Status, resume ва rollback-и ягона](docs/RELIABILITY-2.2.0.md).

**Агар интернет суст бошад:** download то 3 кӯшиш мекунад. Bootstrap timeout-и 120 сония, ZIP timeout-и 600 сония дорад. Агар сервери ZIP дастнорас бошад, ҳамон commit бо Git аз `github.com` гирифта мешавад. Барои ислоҳи timeout командаи навро аз ҳамин README пурра нусха гир; TLS ва hash-check хомӯш намешаванд.

**Дар насби автоматӣ нестанд:** Pyrefly, Python, Python Debugger, Python Environments, Ruby LSP, GitHub Actions, Go, Gradle for Java, Icon Classes, JetBrains New UI Product Icon Theme, Container Tools, clangd ва Docker. Setup онҳоро насб/нав намекунад; агар пештар насб шуда бошанд, худкор нест намекунад. Docker 2.0.0 ҳам хориҷ шудааст, чун ба Container Tools вобаста аст ва онро аз нав насб мекард. Иконкаҳои интерфейс ба варианти стандартии IDE (`Default`) гузаштанд; Material Icon Theme барои файлҳо мемонад.

Jelly Cursor танҳо ороиши курсор аст ва барои React/TypeScript лозим нест: setup онро худкор насб намекунад. Агар пештар насб шуда бошад, нигоҳ дошта мешавад. Набудани он насби асосӣ ва Doctor-ро қатъ намекунад. Барои agent-browser Chrome/Edge-и мавҷуд истифода мешавад; Chrome танҳо ҳангоми набудани runtime скачат мешавад. Browser дар session ва profile-и муваққатӣ санҷида мешавад.

Пас аз насб **Save кун, ҳамаи window-ҳои Antigravity-ро пурра пӯш ва IDE-ро аз нав кушо**. Барои забони русӣ full restart лозим аст; Reload Window кофӣ нест. Language Pack насб мешавад, `locale: ru` худкор интихоб ва cache-и startup аз translation-файлҳои воқеӣ барқарор мешавад. Қисмҳои махсуси худи Antigravity метавонанд тарҷума надошта бошанд.

**Настройкаҳои extension-и аллакай насбшуда ҳам татбиқ мешаванд.** Helper 1.2.2 plan-и `~/.gemini/config/mansur-setup/editor-profile.json`-ро мехонад ва танзимоти дастгиришавандаро бо API-и editor дар profile-и фаъол менависад: theme/icons, Prettier барои JS/TS/React, Auto Save, font, smooth caret ва typing pulse. Натиҷа дар **Output → Mansur Antigravity Stability** аст. Command-и дастӣ: **Mansur: Apply and Check Editor Settings**. Project override-и мухолиф нишон дода мешавад; settings-и project пинҳонӣ иваз намешавад.

**Подсказкаҳо:** Setup 2.2.1 ҳам native **AI Tab/next-edit** ва ҳам **inline/ghost text-и шаффоф**-ро хомӯш мекунад. Барои native Tab танҳо `editor.inlineSuggest.enabled: false` кофӣ набуд: он preference-и ҷудогонаи дохили database дорад. Акнун `tabEnabled = OFF (1)` ва `tabToJump = DISABLED (2)` ҳам татбиқ мешаванд. Номҳои переменнаяҳои худат, import-и JS/TS/TSX, номи component ва роҳи файл/папка мемонанд. Word-based, keyword, snippet, Emmet, parameter hints ва категорияҳои зиёдатии completion хомӯшанд. Барои auto-import-и function/class/type категорияҳои онҳо фаъоланд; VS Code настройкаи алоҳидаи «фақат imported function/class, на local function/class» надорад. Helper switch-ҳои autocomplete-и Antigravity/Codeium-ро танҳо аз schema-и extension-и насбшуда ёфта хомӯш мекунад.

<details>
<summary>Ихтиёрӣ: танҳо AI-подсказкаҳоро хомӯш кардан, бе насб ё update-и пурра</summary>

Насб ва update бо командаи асосии боло ҳар ду намуди AI-подсказкаро аллакай автоматӣ хомӯш мекунанд. Командаҳои ин қисм барои татбиқи ҷудогонаи ҳамин танзимҳо ҳастанд.

Дар checkout-и ҳамин project, бе тағйири иҷозатҳои чати agent:

```powershell
node bin/mansur-setup.js quiet-completion
```

Ё `npm.cmd run quiet-completion`. Команда `editor.inlineSuggest.enabled: false`-ро дар user settings, ҳамаи language override-ҳои мавҷуд ва JS/TS override-ҳо мегузорад ва native Tab-ро хомӯш мекунад. Plan-и helper танҳо key-ҳои ҳамин хомӯшкуниро мегирад, то plan-и пешина иҷозатҳои chat-ро аз нав татбиқ накунад. Агар IDE кушода бошад, worker то пӯшидани одии ҳамаи window-ҳои Antigravity интизор мешавад. Натиҷаро аз роҳи дақиқи `statusFile`-и command хон: барои ҳар request файли алоҳидаи `automation-v2/status-<requestId>.json` сохта мешавад. Пас аз `applied` IDE-ро аз нав кушо. Танзими мухолифи project ҳамчун `needs-attention` нишон дода мешавад; setup project-ро пинҳонӣ иваз намекунад. [Preference-ҳо, status ва rollback](docs/AGENT-AUTOMATION.md).

**Фақат AI-подсказкаҳоро аз версияи охирин хомӯш кардан, бо як команда:** ин вариант source-и навро мегирад ва `quiet-completion`-ро иҷро мекунад. Full setup ва иҷозатҳои chat аз нав татбиқ намешаванд.

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $repo = 'safarovmurod/mansur-setup' # ← при переносе в новый репозиторий меняется только эта строка
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $p = Join-Path $env:TEMP ('mansur-quiet-' + [guid]::NewGuid() + '.ps1')
  $url = 'https://raw.githubusercontent.com/' + $repo + '/main/scripts/bootstrap.ps1?t=' + [guid]::NewGuid()
  try {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    for ($i = 1; $i -le 3; $i++) {
      try {
        Write-Host "Downloading latest bootstrap ($i/3)..."
        if ($curl) {
          & $curl.Source --fail --location --show-error --connect-timeout 20 --max-time 120 --output $p $url
          if ($LASTEXITCODE -ne 0) { throw "curl exited with code $LASTEXITCODE" }
        } else {
          Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $p -TimeoutSec 120 -ErrorAction Stop
        }
        if (-not (Test-Path -LiteralPath $p -PathType Leaf) -or (Get-Item -LiteralPath $p).Length -eq 0) { throw 'Bootstrap download is empty' }
        break
      } catch {
        if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
        if ($i -eq 3) { throw "Bootstrap download failed: $url. $($_.Exception.Message)" }
        Write-Warning "Download failed: $($_.Exception.Message). Retrying..."
        Start-Sleep -Seconds (2 * $i)
      }
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Name "Шеф" -MinimumVersion '2.2.0' -RepoSlug $repo -QuietCompletion
    if ($LASTEXITCODE -ne 0) { throw 'Quiet completion setup failed; read the error above.' }
  } finally {
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
  }
}
```

</details>

Хатҳои сурхи зачёркнутый метавонанд ҳам preview-и next-edit ва ҳам diff-и тағйироти дар chat дархостшуда бошанд. Аз як скрин сарчашмаи дақиқро тасдиқ карда намешавад. Хомӯш кардани AI-подсказкаҳо diff-и тағйироте, ки худат аз chat талаб мекунӣ, намепӯшонад; agent-и chat кор мекунад.

**MCP:** `docker-mcp` ва `github-mcp-server` дигар илова/скачат намешаванд. Update ин ду entry-ро аз ҳар ду config бо backup мебарорад. GSD, Sequential Thinking ва Chrome DevTools мемонанд.

## Чӣ барқарор мешавад

| Қисм | Конфиги ҳозира | Ҷойи насб |
|---|---|---|
| Editor settings | 233 managed key; personal keys нигоҳ дошта мешаванд | `%APPDATA%\Antigravity IDE\User\settings.json` |
| Keybindings | 15 binding | `%APPDATA%\Antigravity IDE\User\keybindings.json` |
| Startup / locale | Аргументҳои идорашавандаи ҳозира | `~/.antigravity-ide/argv.json` |
| MD / rules / guides | GEMINI.md, 2 rule, 2 guide | `~/.gemini/GEMINI.md`, `~/.gemini/config/` |
| Skills | 78 skill, 163 file | `~/.gemini/config/skills/` |
| Agents | 64 file | `~/.gemini/config/agents/` |
| Hooks | 43 file | `~/.gemini/antigravity/hooks/` |
| GSD Core | 756 file | `~/.gemini/antigravity/gsd-core/` |
| Runtime scripts / GSD config | 23 script ва 3 profile/manifest | `~/.gemini/antigravity/` |
| Android skill-и иловагӣ | 2 ҷой, ҳар кадом 3 file | `~/.gemini/skills/`, `~/.gemini/antigravity/skills/` |
| MCP runtime | 3 package бо package-lock-и дақиқ | `~/.gemini/config/mcp-runtime/` |
| Extensions | 18 gallery + 3 local; Jelly Cursor ихтиёрӣ | `~/.antigravity-ide/extensions/` |
| Font / browser tooling | JetBrains Mono, agent-browser ва browser runtime | Windows font / npm CLI / browser cache |

Antigravity метавонад дар C:, D: ё диски дигар насб бошад. Installer нусхаи кушодаи IDE, CLI-и PATH, папкаҳои стандартӣ ва registry-и насбро месанҷад; роҳи EXE ва CLI-и дохили `bin`-ро дуруст ҷудо мекунад. Settings ба `APPDATA`, extensions/rules ба home ва download ба `TEMP`-и ҳамон Windows мераванд: IDE дар D: будан settings-ро худсарона аз C: намекӯчонад. Барои portable IDE-и сабтнашуда метавон `ANTIGRAVITY_INSTALL_DIR`-ро ба папкаи IDE таъин кард. Snapshot workspace/project history ё credential-и шефро дарбар намегирад.

## Иҷозатҳои чати Antigravity

Bootstrap ҳоло `install --auto-approve` иҷро мекунад: native **Terminal Command Auto Execution → Always Proceed**, **Artifact Review Policy → Always Proceed** ва MCP `mcp(*) Allow`. Барои IDE-и кушода worker-и бе window то пӯшидани одии ҳамаи window-ҳо интизор мешавад; IDE маҷбуран пӯшида намешавад. Backup ва read-back пеш аз натиҷаи `applied` ҳатмист. Коди native танҳо барои build-и санҷидашудаи **2.5.5** тағйир меёбад. Ин режим командаҳоро бе тасдиқи одӣ иҷро мекунад; Secure Mode, policy-и ташкилот, project override ва авторизатсияи аккаунт боқӣ мемонанд. [Механизм, status, rollback ва натиҷаҳои санҷиш](docs/AGENT-AUTOMATION.md).

## Update ва тозакунии кӯҳнаҳо

Installer пеш аз тағйир backup месозад. Managed settings ва shortcut-ҳо нав мешаванд; key-ҳои шахсӣ, shortcut-ҳои бегона ва deny-и явнии command нигоҳ дошта мешаванд. Файлҳои кӯҳнаи аз ҳамин setup насбшуда бо ownership/hash шинохта, тоза мешаванд. Launcher-ҳои MCP нав мешаванд; token, headers-и authorization ва ҳолати enable/disable нигоҳ дошта мешаванд. TS MANCHO-и кӯҳна аз папкаи фаъол бо backup бароварда мешавад.

Файли шахсии таҳриршуда conflict нишон медиҳад; installer онро пинҳонӣ пок намекунад. `config/migrations/legacy-payload.json` танҳо catalog-и тозакунии setup-и пешина аст — rule-и фаъол ё нусхаи насбшавандаи кӯҳна нест.

```powershell
node bin/mansur-setup.js install --skip-permissions --name "povilitel" --dry-run
node bin/mansur-setup.js doctor
node bin/mansur-setup.js restore --dry-run
```

`--dry-run` нақшаро нишон медиҳад. Барои restore-и воқеӣ `node bin/mansur-setup.js restore` истифода мешавад. Backup дар `~/.gemini/backups/` мемонад.

## Санҷиш

[Аудити Setup 2.1.10 (таърихӣ): ислоҳҳо, тестҳо ва маҳдудиятҳо](docs/REPOSITORY-AUDIT.md). Doctor акнун файлҳои payload, hooks, keybindings, MCP launcher-ҳо ва extension-ҳои ҳатмиро пурра муқоиса мекунад; набудани қисми ҳатмӣ дигар ҳамчун муваффақият ҳисоб намешавад. Backup-и нав набудани config-и пешина ва rule-ҳои дохили зерпапкаро ҳам барқарор мекунад.

[Отчёти санҷиш ва hash-ҳои Setup 2.1.10 (таърихӣ)](docs/PROFILE-SYNC-REPORT.json) · [CI-и main](https://github.com/safarovmurod/mansur-setup/actions/workflows/setup-checks.yml) · [Inventory](docs/INVENTORY.md)

```powershell
npm.cmd test
npm.cmd run test:bootstrap
npm.cmd run test:bootstrap:network
npm.cmd run test:powershell
```

Санҷиши воқеии се MCP: `npm.cmd ci --prefix resources/mcp-runtime`, баъд `npm.cmd run test:mcp`. Санҷиши download/extract аз GitHub ба profile-и муваққатӣ: `npm.cmd run test:bootstrap:live` (PowerShell 7 лозим). Ин тест насби native Windows, font registration ё тамоми gallery-ро исбот намекунад.

Санҷиши воқеии TS MANCHO дар VS Code: `MANSUR_VSCODE_PATH=/path/to/Code npm run test:ts-mancho:editor`. Барои headless Linux `Xvfb` ё `MANSUR_XVFB_PATH=/path/to/Xvfb` лозим аст. Runner худи VSIX-ро дар profile-и муваққатӣ месанҷад: pulse-и намоён, сабти воқеии файл, хатҳои диагностикӣ бо рангҳои ором ва smooth cursor. Profile-и шахсӣ истифода намешавад.

Doctor файлҳо, versions ва settings-ро месанҷад. Authorization-и MCP, иҷрои ҳамаи workflows ва UI-и ҳар extension санҷиши алоҳида мехоҳанд. Дастрасии gallery/download аз интернет ва Antigravity CLI вобаста аст.

[Rules](docs/UNIFIED-RULES.md) · [Skills](docs/SKILLS.md) · [MCP](docs/MCP_SETUP.md) · [Stability](docs/STABILITY.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [License / sources](docs/THIRD_PARTY.md)

## Catalog — 22 extension: 21 ҳатмӣ + Jelly Cursor ихтиёрӣ

Версия ва ID-и дақиқ дар [рӯйхати extension-ҳо](docs/EXTENSIONS.md) ҳаст. 21 extension-и ҳатмӣ бо ҳамон командаи боло насб мешаванд; Jelly Cursor пропуск мешавад.

| Ном | Чӣ кор мекунад |
|---|---|
| HTML End Tag Labels | Номи блокро назди теги пӯшидаи HTML нишон медиҳад. |
| htmltagwrap | Коди интихобшударо дохили HTML tag мегузорад. |
| Tailwind CSS IntelliSense | Барои Tailwind CSS autocomplete ва санҷиши классҳо медиҳад. |
| npm Intellisense | Номи npm package-ҳоро ҳангоми import пешниҳод мекунад. |
| Path Intellisense | Роҳи файл ва папкаҳоро autocomplete мекунад. |
| ES7+ React/Redux/React-Native snippets | Насб мемонад, вале snippet-подсказкаҳо дар меню хомӯшанд. |
| Better Comments Next | TODO, warning ва дигар comment-ҳоро бо ранг ҷудо мекунад. |
| Prettier - Code formatter | Кодро автоматӣ формат мекунад. |
| Auto Rename Tag | Номи HTML tag-и ҷуфтро якҷоя иваз мекунад. |
| Jelly Cursor (ихтиёрӣ) | Барои cursor аниматсия ва glow медиҳад; худкор насб намешавад. |
| Image preview | Preview-и расмро дар gutter ва ҳангоми hover нишон медиҳад. |
| TS MANCHO | Хатҳои сурх/зардро бо шаффофии 95% ором нишон медиҳад; unused hints ва Error Lens боқӣ мемонанд; санҷиши JS/TS ва IntelliSense фаъол аст. Typing pulse ва Auto Save медиҳад; форматирование тавассути Prettier-и расмӣ. |
| Mansur Antigravity Stability | Настройкаҳоро дар profile-и фаъол татбиқ/санҷида мекунад ва ду ислоҳи extension-ҳоро нигоҳ медорад. |
| Mansur GitHub Panel | Панели GitHub барои дидани branch, сохтан, гузаштан ва ҳазфи branch медиҳад. |
| Russian Language Pack for Visual Studio Code | Интерфейси editor-ро ба русӣ мегузорад. |
| SQL Server (mssql) | Ба SQL Server пайваст мешавад ва query/schema-ро идора мекунад. |
| Oxc | Oxlint ва Oxfmt-ро барои lint ва format пайваст мекунад. |
| Material Icon Theme | Иконкаҳои файл ва папкаҳоро ба Material Icons мегузорад. |
| Live Server | Сервери маҳаллӣ барои HTML/CSS/JS бо live reload мекушояд. |
| Code Spell Checker | Хатоҳои имлои матн ва номҳои дохили кодро нишон медиҳад. |
| Error Lens | Хато ва warning-ҳоро бевосита назди сатри код нишон медиҳад. |
| Import Cost | Андозаи package-и import/require-шударо назди код нишон медиҳад. |
