Мансур, ин helper settings-и setup-ро дар profile-и фаъол татбиқ/санҷида мекунад ва ду ислоҳи audit-ро баъди reinstall-и версияҳои маълум нигоҳ медорад.

Дар **1.2.3** default-и дохилии забон танҳо маълумот аст (`active: false`), агар plan барои ҳамин забон арзиши алоҳида надошта бошад. Override-и воқеии user/project/policy ҳанӯз конфликт мемонад. Setting-и scope-и window бо resource/language хонда намешавад: ин warning-ҳои зиёдатии extension host-ро бартараф мекунад.

Дар startup ва баъди тағйироти рӯйхати extensions, check-и кӯтоҳ иҷро мешавад. Коди аллакай ислоҳшуда дигар навишта намешавад. Барои версия ё hash-и ношинос notice мебарояд; коди vendor иваз ё extension хомӯш карда намешавад. Backup пеш аз repair нигоҳ дошта мешавад; syntax ва hash-и натиҷа санҷида мешаванд.

Command Palette:

- **Mansur: Check Antigravity Stability** — танҳо status-ро мехонад.
- **Mansur: Restore Known Extension Fixes** — танҳо ду source-и версия ва hash-и маълумро барқарор мекунад.
- **Mansur: Reconnect MCP (Reload Window)** — аввал panel-и тозаи Manage MCPs-ро мебандад, сипас command-и native-и Antigravity-ро бо интихоби дастии Мансур иҷро мекунад. Window ва language server аз нав кушода мешаванд. Баъди тайёр шудани startup, Manage MCPs-ро аз нав кушо. Хатои дохилии native Refresh бо ин ислоҳ намешавад.

Helper account, model ва credential-ро тағйир намедиҳад. Аз 1.1.0 settings-и идорашавандаи setup-ро дар profile-и фаъоли editor татбиқ ва месанҷад; project settings-ро намеҷунбонад. Check дар process-и ҷудогона бо timeout-и 6 секунд ва як request-и фаъол дар ҳар extension host иҷро мешавад. Window худкор reload намешавад; барои коди нав action-и **Reload Window** танҳо баъди интихоби Мансур кор мекунад.

`onStartupFinished` аз API-и editor истифода мешавад: https://code.visualstudio.com/api/references/activation-events#onStartupFinished

Ҳолатҳои нави vendor бояд алоҳида audit шаванд. Helper барои ҳамаи версияҳои оянда ё ҳамаи ошибкаҳои IDE кафолат намедиҳад.

- **Mansur: Apply and Check Editor Settings** — plan-и setup-ро ба profile-и фаъол татбиқ карда, theme/icons, formatter, Auto Save, caret ва settings-и extension-ҳои дастрасро месанҷад. Global settings-и пешина дар global state-и helper backup мешаванд.
- **Mansur: Inspect Project Setting Conflicts (Read Only)** — setting-и воқеии editor-ро мехонад ва key, language, scope ва source-и конфликтро дар **Output → Mansur Antigravity Stability** нишон медиҳад. Барои single-folder source-и `.vscode/settings.json`, барои multi-root ҳам settings-и `.code-workspace` ва ҳам файли ҳар folder нишон дода мешаванд. Project files ва иҷозатҳои чат бо ин command тағйир намеёбанд.

AI ghost text хомӯш мешавад; native IntelliSense ва auto-import фаъол мемонанд. Switch-ҳои махсуси vendor аз configuration schema-и extension-и насбшуда ёфта мешаванд. Unknown setting ҳамчун unavailable сабт мешавад. Ҳар request як бор татбиқ мешавад; rerun-и installer request-и нав месозад. Runtime-и English баъди интихоби ru full restart мехоҳад. Барои забон ҳамаи window-ҳои IDE-ро пурра пӯш ва аз нав кушо; танҳо Reload Window кофӣ нест.

Аз **1.2.0** санҷиши конфликт танҳо JavaScript/TypeScript нест: language-ҳои editor, selector-ҳои user/workspace/folder (аз ҷумла `[python][rust]`), document-ҳои кушода ва folder-ҳои ҳамаи workspace санҷида мешаванд. `editor.inlineSuggest.enabled`, formatter ва дигар setting-ҳои идорашаванда муқоиса мешаванд. Дар report `active: true` маънои онро дорад, ки setting-и воқеӣ аз plan фарқ мекунад; declaration-и project, ки override-и дигар онро мепӯшонад, метавонад бо `active: false` нишон дода шавад. Агар editor роҳи user profile-ро надиҳад, `source: null` мемонад; роҳи тахминӣ навишта намешавад. Хатои хондан/parse алоҳида сабт мешавад. Нишонаи **Mansur** дар status bar report-ро мекушояд; барои конфликтҳои доимӣ popup-и такрорӣ нест.

Дар **1.2.2** силаи дастӣ **Mansur: Apply and Check Editor Settings**, ки омадааст ҳангоми санҷиши автоматии идорашаванда, force-и худро нигоҳ медорад: навбати дубора бо ҳамон force иҷро мешавад ва дрейфи настройкаҳо татбиқ мешавад.

Дар **1.2.1** роҳи source-и конфликт дар single-folder ислоҳ шуд: агар API setting-ро ҳамчун `workspace-folder` баргардонад, report ҳамон `.vscode/settings.json`-и folder-ро нишон медиҳад ва scope-и API-ро нигоҳ медорад. Файлҳои project тағйир намеёбанд.

Ҳангоми startup як кӯшиши кӯтоҳи recovery-и request-и пешина иҷро мешавад: helper танҳо module-и насбшудаи `~/.gemini/config/mansur-setup/automation-v2/setup-status.js --resume .../request.json`-ро истифода мебарад, аз папкаи муваққатии download вобаста нест. Module танҳо request-и иҷозатдодашудаи пешинаро бо ҳамон scope идома медиҳад; request-и cancelled/restored ё анҷомёфта дубора татбиқ намешавад. Process дар background, бо `windowsHide` ва timeout-и 6 сония оғоз мешавад. Antigravity худкор баста ё reload намешавад. Натиҷаи `waiting/starting/applied/failed` дар Output сабт мешавад; `applied` ҳифз шудани preference-ро тасдиқ мекунад, UI-и воқеиро не. Агар Node ё module набошад, helper хатои recovery-ро нишон медиҳад ва applied намегӯяд.
