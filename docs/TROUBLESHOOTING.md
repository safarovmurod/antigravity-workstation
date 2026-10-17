# Агар setup хато диҳад

[Командаи асосӣ](../README.md#quick-start) ҳар stage-ро дар terminal нишон медиҳад. `Mansur Setup failed` танҳо натиҷаи охир аст; сабаби аниқ дар чанд сатри болояш меояд. Баъди ислоҳи сабаб ҳамон командaро аз нав иҷро кун. Setup 2.2.0 пеш аз lock, бекоркунии worker, backup ва тағйири production profile санҷиши read-only-и native мегузаронад; баъди гузаштани он backup месозад.

| Хато | Санҷиши аввал |
|---|---|
| `winget is unavailable` ё Node/npm/Git версияи паст | Node.js ≥24, npm ≥10 ва Git-ро насб кун; terminal-ро аз нав кушо. |
| Download/HTTP error | Пайвасти GitHub ва gallery-ро санҷ. Bootstrap бояд `main` commit-ро гирифта тавонад. |
| `Время ожидания операции истекло`, `curl exited with code 28` дар bootstrap | Командаи навро аз README пурра гир ва иҷро кун: Setup 2.1.9 timeout, 3 кӯшиш ва fallback-и Git дорад. Командаи кӯҳнаи аз chat/history гирифташударо истифода набар. Агар боз нашуд, аз `Mansur Setup stage` то error-и охир log-ро фирист; `Mansur Setup failed` танҳо натиҷа аст. Барои ин download `raw.githubusercontent.com`, `codeload.github.com` ё fallback-и `github.com` бояд дастрас бошанд. |
| `Antigravity CLI missing` | Antigravity IDE-ро насб ва CLI-и онро санҷ; extension-ҳо бе CLI ба ҳисоб намераванд. |
| `Antigravity IDE not found` ё portable насби D: | IDE-ро кушо ва командаи setup-ро такрор кун. Барои папкаи сабтнашуда `$env:ANTIGRAVITY_INSTALL_DIR = 'D:\Apps\Antigravity IDE'` гузор; роҳи воқеии худатро истифода бар. |
| `Native setup preflight` ё unsupported native build | [Compatibility catalog](../config/native-compatibility.json) ҳоло танҳо build-и санҷидашудаи Windows x64 Antigravity 2.5.5-ро қабул мекунад. Version/hash/schema-и дигар пеш аз тағйири profile рад мешавад. Hash check-ро хомӯш ё рақами версияро сохта иваз накун; build-и нав audit-и алоҳида мехоҳад. |
| `Open Antigravity once to initialize the native profile` | IDE-ро як бор кушо, то database-и profile сохта шавад, баъд setup-ро такрор кун. Файлҳои account/database-ро дастӣ насоз ё тоза накун. |
| `Native profile database or managed preferences are invalid` | Preflight database ё preference-и идорашавандаро хонда натавонист ва setup-ро пеш аз тағйир боздошт. Роҳу error-и database-ро санҷ; ин далели зарурати нест кардани profile нест. |
| `Setup conflict` | Роҳи нишондодаро бо backup муқоиса кун. Файли дастӣ тағйирдода худкор overwrite намешавад. |
| `Unexpected end of JSON input` дар setup-и кӯҳна | Командаи асосиро аз нав иҷро кун: Setup 2.1.3 config-и холӣ/whitespace/BOM-ро бо backup иваз мекунад. Агар JSON воқеан нопурра бошад, паёми нав роҳи дақиқи файлро нишон медиҳад ва профилро тағйир намедиҳад. |
| `Invalid JSON in "..."` ё `JSONC parse error in "..."` | Танҳо файли нишондодаро ислоҳ кун ва setup-ро такрор кун. Нусхаи аслиро нигоҳ дор; файлҳои дигарро кӯр-кӯрона тоза накун. Registry-и `.installation.json` маълумоти насби пешинаро дорад ва config-и ихтиёрии холӣ ҳисоб намешавад. |
| Font hash mismatch | Файли bundled ё download нодуруст аст; package-и навро аз repo гир. Hash check-ро хомӯш накун. |
| Docker/MCP connection error | `docker ps` ва status-и server-ро санҷ; [MCP guide](MCP_SETUP.md). Таърифи config далели пайваст нест. |
| TS MANCHO ё local VSIX registration failed | Натиҷаи `--list-extensions --show-versions` ва stage-и install-ро санҷ; [рӯйхати extension-ҳо](EXTENSIONS.md). |
| `iranon.jelly-cursor@0.0.8 not found` ё `Extension failed: iranon.jelly-cursor` | Командаи умумии навро иҷро кун: Jelly Cursor ихтиёрӣ аст. `full` 21 extension-и ҳатмӣ, `lite` 11 extension дорад; Doctor profile-и интихобшударо месанҷад. Набудани Jelly optional аст; нокомии extension-и ҳатмӣ ҳамоно failure мебошад. `lite` extension-и пештар насбшударо нест намекунад. |
| Chrome download timeout дар `[9/10]` | Setup 2.1.4 Chrome/Edge-и насбшуда ё cache-и тайёрро истифода мебарад. Browser бояд саҳифаи санҷиширо дар session-и ҷудогона кушода ва пӯшонда тавонад. Агар browser набошад, download ҳамоно лозим аст. Defaults-и browser пеш аз тағйир backup мешаванд. |

PowerShell агар `npx.ps1`-ро манъ кунад, командаи асосии README ин мушкилро надорад: он `powershell.exe -ExecutionPolicy Bypass`-ро танҳо барои bootstrap истифода мебарад. Барои command-и npm дастӣ `npm.cmd`/`npx.cmd`-ро интихоб кун; сиёсати умумии Windows-ро дигар кардан лозим нест.

Барои дидани нақша бе тағйир, дар папкаи repo `node bin/mansur-setup.js install --skip-permissions --dry-run`-ро иҷро кун. Барои санҷиши файлу settings `node bin/mansur-setup.js doctor`; барои native request `npm.cmd run status` ё `node bin/mansur-setup.js status --json`. Барои rollback аввал `node bin/mansur-setup.js restore --dry-run`. Backup-и дорои credential-ро нашр накун.

`restore`-и нав file backup ва native snapshot-и пайвастшударо аввал месанҷад, worker-и интизорро бекор мекунад ва барои баргардондан пӯшидани ҳамаи window-ҳои IDE-ро талаб мекунад. Backup-и кӯҳнаи бе native snapshot `complete: false` медиҳад: танзимоти native-и пешина аз он барқарор карда намешавад. Агар баъди native restore навиштани файл ноком шавад, `partial: true`-ро ҳамчун кори пурра қабул накун. [Тафсилоти rollback](RELIABILITY-2.2.0.md#one-coordinated-restore).

| Ҳолат | Чӣ бояд кард |
|---|---|
| Language Pack насб аст, интерфейс English монд | Setup 2.1.8-ро иҷро кун; `locale: ru` интихоб ва startup cache-и translation санҷида/барқарор мешавад. Save кун, **ҳамаи window-ҳои IDE-ро пурра пӯш ва аз нав кушо**. Reload Window барои забон кофӣ нест. Runtime language дар Output-и helper санҷида мешавад. |
| Extension насб аст, настройка фаъол нест | Setup-ро аз нав иҷро кун ва helper 1.2.2-ро бо restart бор кун. **Mansur: Apply and Check Editor Settings** profile-и фаъолро танзим мекунад. `needs-attention` ва workspace override-ро дар Output бин. |
| `docker-mcp` / `github-mcp-server`: executable docker not found | Setup 2.1.8 ин ду entry-ро аз ҳар ду config бо backup тоза мекунад. Барои profile-и ҳозира Docker лозим нест. |
| AI ghost text ё automatic next-edit дар editor | Командаи умумии Setup 2.2.0 ҳар дуро хомӯш мекунад. Барои танҳо ҳамин тағйир `npm.cmd run quiet-completion` дар repo ё командаи `-QuietCompletion` аз README. `editor.inlineSuggest.enabled: false`, native `tabEnabled = OFF (1)` ва `tabToJump = DISABLED (2)` татбиқ мешаванд; IntelliSense, auto-import ва иҷозатҳои chat нигоҳ дошта мешаванд. Агар `queued` бошад, IDE-ро одӣ пурра пӯш; баъди `npm.cmd run status` → `applied` боз кушо. `applied` хондани storage-ро тасдиқ мекунад, на санҷиши чати зиндаи user-ро. |
| `waiting` ё `starting` | Worker интизори пӯшидани муқаррарии ҳамаи window-ҳои Antigravity аст; setup онҳоро намебандад. `status` аз queued будан фарқ мекунад ва PID, heartbeat ва preference-ҳои сабтшударо месанҷад. |
| `interrupted` ё `expired` баъди reboot/24 соат | `npm.cmd run resume` ҳамон request-ро бо ҳамон scope давом медиҳад. Helper 1.2.2 низ ҳангоми startup request-и protocol-2-и қатъшударо барқарор мекунад; баъд IDE бояд одӣ пӯшида шавад. Request-и cancelled/superseded барқарор намешавад. Completion-only ҳангоми recovery иҷозатҳои chat-ро тағйир намедиҳад. |
| `drifted`, `unverified`, `failed` ё `legacy-pending` | Сабаби `status`-ро хон. `drifted` маънои фарқ кардани storage аз request-и анҷомёфта дорад; `unverified` хондани storage-ро тасдиқ карда натавонист. Хатои воқеӣ бояд ислоҳ шавад; protocol-и кӯҳна иҷрои setup-и ҷориро талаб мекунад. Барои маълумоти JSON `node bin/mansur-setup.js status --json`. |
| Keyword/snippet/Emmet-подсказка ё project override | **Mansur: Inspect Project Setting Conflicts (Read Only)**-ро иҷро кун ё indicator-и Mansur-ро дар status bar пахш кун. Helper 1.2.2 ҳамаи забонҳои маълум, combined selector ва folder-ҳои workspace-ро месанҷад; key, scope, effective value ва роҳи маълуми source-ро медиҳад. Inspector файлҳои project-ро иваз намекунад. `editor.suggest.showKeywords`, `editor.suggest.showSnippets` ва `editor.suggest.showWords` бояд `false`, JS/TS auto-import бояд `true` бошанд. Хатҳои сурх метавонанд preview-и next-edit ё diff-и аз chat дархостшуда бошанд; аз скрин танҳо сабаб тасдиқ намешавад. Quiet completion diff-и дархостшудаи chat-ро намепӯшонад. |

Баъди тоза шудани checkout-и муваққатии bootstrap, runtime боқӣ мемонад. Status ва resume аз ҳамон роҳ кор мекунанд:

```powershell
$runtime = Join-Path $env:USERPROFILE '.gemini\config\mansur-setup\automation-v2'
node (Join-Path $runtime 'setup-status.js') --status (Join-Path $runtime 'request.json')
node (Join-Path $runtime 'setup-status.js') --resume (Join-Path $runtime 'request.json')
```

Font, theme, formatter, Auto Save ва дигар key-ҳои идорашавандаи `settings.json` дар full update қасдан аз repo аз нав татбиқ мешаванд. Ин рафтор дар 2.2.0 бо дархости user нигоҳ дошта шуд. [Ҳисоботи release](RELIABILITY-VERIFICATION.json) ва artifact-и воқеии Windows Actions-ро барои натиҷаҳои санҷиши ҷорӣ бин; ҳисоботи 2.1.13 далели санҷиши 2.2.0 нест.
