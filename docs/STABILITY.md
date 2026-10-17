# Antigravity stability — Setup 2.2.0

Helper `mansur.antigravity-stability-helper` 1.2.2 дар startup ва баъди тағйири рӯйхати extensions ду catalog entry-ро месанҷад:

| Extension | Версия | Сабаби ислоҳи маҳаллӣ |
|---|---|---|
| HTML End Tag Labels | 1.0.0 | JSX-и ҳангоми навиштан нопурра ба parser error мерасид; SyntaxError нигоҳ дошта мешавад, closed document ва timer ҳифз мешаванд |
| Auto Rename Tag | 0.1.10 | Event-и ҳудуди кӯҳнаи line аз ҳудуди document мебаромад; cache бо document-и ҷорӣ ҳамоҳанг мешавад |

Original ва patched SHA-256 дар `extensions/mansur-antigravity-stability/maintenance.cjs` ҳастанд. Пеш аз repair backup, баъд syntax ва hash санҷида мешаванд. Коди ношинос, update race, symlink/junction, роҳи берун аз extension ва backup conflict repair-ро бозмедоранд. Status command файлро иваз намекунад. Check дар process-и ҷудогона, timeout 6 секунд ва lock барои як repair иҷро мешавад.

Ду ислоҳи vendor бо 32 санҷиши regression дар audit-и маҳаллии 8–9 октябр санҷида шуданд. Дар repo source-и пурраи vendor нашр нашудааст; CI 18 ҳолати filesystem-ро бо fixture-и хурд ва 12 ҳолати helper-ро бо API mock месанҷад. Ин санҷишҳо худ аз худ ҳамаи error-и editor ё ҳамаи версияҳои ояндаро тасдиқ намекунанд.

## MCP Refresh

Дар IDE 2.5.5, stop/restart-и native баъзан GitHub/Docker-ро бо exit 1 қатъ мекунад ва баъзе ё ҳамаи tools нест мешаванд. Counter-и tools ҳам метавонад аз ҳолати воқеӣ қафо монад. Helper ин қисми дохилии app-ро patch намекунад.

**Reconnect MCP** panel-и тозаи `Manage MCPs`-ро пеш аз command-и native-и reload мебандад. Dirty tab ва project tab нигоҳ дошта мешаванд. Action танҳо баъди интихоби user иҷро мешавад. Баъди startup рӯйхати серверҳо ва tools-ро нав санҷ; counter-и кӯҳна кофӣ нест. Refresh-ро пайдарпай ҳамчун «кафолати repair» истифода набар.

Дар setup-и ҳозира се MCP мемонад: Chrome DevTools, GSD ва Sequential Thinking. Docker/GitHub MCP аз насби нав ва update хориҷ шудаанд. Таърифи server далели кори tool ё authorization нест; runtime алоҳида санҷида мешавад.

[Расмии MCP](https://antigravity.google/docs/mcp) · [Расмии Rules](https://antigravity.google/docs/rules) · [API activation](https://code.visualstudio.com/api/references/activation-events#onStartupFinished).

Аз 1.1.0 helper танзимоти editor-ро низ аз plan-и setup дар profile-и фаъол татбиқ/санҷида мекунад. Command: **Mansur: Apply and Check Editor Settings**. Output settings-и номувофиқ, unavailable, workspace overrides ва забони воқеии runtime-ро нишон медиҳад. Full install-и нав managed key-ҳои `settings.json`-ро қасдан аз repo мегирад; нигоҳдории key-ҳои managed-и шахсӣ илова нашуд.

## Санҷиши read-only-и project

Helper 1.2.2 командаи **Mansur: Inspect Project Setting Conflicts (Read Only)** ва indicator-и Mansur дар status bar дорад. Он registered language-ҳо, забонҳои ҳуҷҷатҳои кушода, selector-ҳои user/workspace/folder, combined selector ва ҳамаи folder-ҳои workspace-ро месанҷад. Report key, expected/effective value, language, scope ва роҳи маълуми source-ро медиҳад. User/policy source метавонад танҳо аз API маълум бошад ва роҳи файл надошта бошад. Ҳам override-и фаъол ва ҳам declaration-и ҳоло сояафканшуда нишон дода мешавад; read/parse failure ҳамчун `needs-attention` мебарояд.

Inspector `.vscode/settings.json`, `.code-workspace`, source-и application, account ё token-ро тағйир намедиҳад. Project override то ислоҳи явнӣ метавонад effective монад. **Apply and Check Editor Settings** global profile-ро татбиқ мекунад; он иҷозати иваз кардани project settings нест.

## Барқароркунии worker

Helper 1.2.2 дар startup runtime-и доимии `automation-v2`-ро барои request-и protocol-2-и interrupted/expired бо Node-и сабтшуда мехонад ва resume мекунад. Recovery ҳамон request ID ва scope-ро нигоҳ медорад: completion-only иҷозатҳои chat-ро тағйир намедиҳад. Request-и cancelled, superseded ё worker-и ҳоло зинда аз нав оғоз намешавад. Protocol-и кӯҳна иҷрои setup-и навро талаб мекунад. Windows startup task сохта намешавад ва IDE-и user баста ё kill намешавад; worker то shutdown-и муқаррарӣ интизор мемонад.

`npm.cmd run status` натиҷаи starting/waiting/applied/failed/cancelled/interrupted/expired ё drift-и storage-ро медиҳад; `npm.cmd run resume` recovery-и дастӣ аст. Runtime баъди тоза шудани download-и муваққатӣ боқӣ мемонад. Роҳ ва commands-и мустақил дар [reliability guide](RELIABILITY-2.2.0.md#status-and-recovery) ҳастанд. Rollback-и умумӣ native baseline ва файлҳоро якҷоя бармегардонад ва worker-ҳои интизорро бекор мекунад; [маҳдудиятҳои restore](RELIABILITY-2.2.0.md#one-coordinated-restore)-ро бин.

## Далели санҷиш

[Windows smoke workflow](../.github/workflows/native-windows-smoke.yml) барои runner-и ҷудогонаи GitHub-hosted Windows пешбинӣ шудааст. Он checksum-и installer/main.js, native codec/preflight/rollback/status, extension-host settings, TypeScript completion, real-process shutdown/reopen ва conflict fixture-ро месанҷад. Натиҷаҳои ҷорӣ бояд аз run ва artifact-и воқеии Actions гирифта шаванд; мавҷуд будани workflow ё гузаштани Linux tests далели Windows success нест. Login-и user, чати authenticated ва ҷавоби model қисми ин smoke test нестанд. [Ҳисоботи release](RELIABILITY-VERIFICATION.json) ва [reliability guide](RELIABILITY-2.2.0.md#windows-smoke-workflow) scope-и санҷишро нигоҳ медоранд.
