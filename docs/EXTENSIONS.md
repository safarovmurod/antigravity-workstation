# Extension-ҳои Antigravity — Setup 2.2.0

[config/extensions.json](../config/extensions.json) **22 ID/version** дорад: **19 gallery + 3 local extension**. Profile-и пешфарзи `full` ҳамон **21 extension** (18 gallery + 3 local)-ро бо [як командаи README](../README.md#quick-start) насб мекунад. Jelly Cursor ихтиёрӣ аст ва худкор насб намешавад; нусхаи мавҷуда нигоҳ дошта мешавад. Installer версияи manifest-ро талаб мекунад ва сабт/hash-и extension-ҳои маҳаллиро месанҷад.

## Full ва lite

[config/extension-profiles.json](../config/extension-profiles.json) интихобро муайян мекунад. `full` рӯйхати пурраи пешинаро нигоҳ медорад. `lite` танҳо **11 extension** (8 gallery + 3 local)-ро барои насби нав интихоб мекунад: Tailwind, npm/path IntelliSense, Prettier, Auto Rename Tag, TS MANCHO, Stability Helper, GitHub Panel, Russian Language Pack, Material Icons ва Code Spell Checker. Theme-и Dark+ дар худи editor ҳаст ва extension-и иловагӣ намехоҳад.

```powershell
# Дар checkout-и repo:
node bin/mansur-setup.js install --auto-approve --extension-profile lite

# Дар bootstrap-и аллакай downloadшуда:
.\scripts\bootstrap.ps1 -MinimumVersion '2.2.0' -ExtensionProfile lite
```

Барои download-и нав block-и README-ро истифода бар ва ба сатри `powershell.exe ... -File $p` параметри `-ExtensionProfile lite` илова кун. Бе ин параметр `full` мемонад. SQL Server, React snippets, Oxc, Live Server ва preview/decorations аз талаботи нави `lite` берунанд; аз catalog ё repo ҳазф намешаванд. **Lite extension-и аллакай насбшударо uninstall намекунад.** Ин интихоби миқдори насб аст; беҳбудии суръати IDE бе ченкунӣ кафолат дода намешавад.

Интихоб дар `%USERPROFILE%\.gemini\config\mansur-setup\install-options.json` нигоҳ дошта мешавад. Doctor extension-ҳои ҳатмии ҳамин profile-ро месанҷад; backup/restore интихобро ҳам мегирад. Ҳар ду profile ҳамон managed `settings.json`, native AI Tab OFF ва ghost-text OFF-ро истифода мебаранд. Managed key-ҳои settings дар full update қасдан аз repo аз нав навишта мешаванд. Profile ягон AI completion provider-ро фаъол намекунад.

## Catalog-и пурра

| Ном | ID | Версия | Чӣ кор мекунад |
|---|---|---|---|
| HTML End Tag Labels | `anteprimorac.html-end-tag-labels` | 1.0.0 | Номи блокро назди теги пӯшидаи HTML нишон медиҳад. |
| htmltagwrap | `bradgashler.htmltagwrap` | 1.0.0 | Коди интихобшударо дохили HTML tag мегузорад. |
| Tailwind CSS IntelliSense | `bradlc.vscode-tailwindcss` | 0.16.0 | Барои Tailwind CSS autocomplete ва санҷиши классҳо медиҳад. |
| npm Intellisense | `christian-kohler.npm-intellisense` | 1.4.5 | Номи npm package-ҳоро ҳангоми import пешниҳод мекунад. |
| Path Intellisense | `christian-kohler.path-intellisense` | 2.8.0 | Роҳи файл ва папкаҳоро autocomplete мекунад. |
| ES7+ React/Redux/React-Native snippets | `dsznajder.es7-react-js-snippets` | 4.4.3 | Шаблонҳои кӯтоҳи React, JavaScript ва TypeScript медиҳад. |
| Better Comments Next | `edwinhuish.better-comments-next` | 3.6.0 | TODO, warning ва дигар comment-ҳоро бо ранг ҷудо мекунад. |
| Prettier - Code formatter | `esbenp.prettier-vscode` | 12.4.0 | Кодро автоматӣ формат мекунад. |
| Auto Rename Tag | `formulahendry.auto-rename-tag` | 0.1.10 | Номи HTML tag-и ҷуфтро якҷоя иваз мекунад. |
| Jelly Cursor (ихтиёрӣ) | `iranon.jelly-cursor` | 0.0.8 preferred | Ороиши курсор; барои React/TypeScript лозим нест, худкор насб намешавад. |
| Image preview | `kisstkondoros.vscode-gutter-preview` | 0.32.2 | Preview-и расмро дар gutter ва ҳангоми hover нишон медиҳад. |
| TS MANCHO | `mancho.ts-mancho` | 3.2.0 | Хатҳои сурх/зард бо шаффофии 95%; unused hints ва Error Lens боқӣ мемонанд; JS/TS validation фаъол. Typing Pulse ва Auto Save. |
| Mansur Antigravity Stability | `mansur.antigravity-stability-helper` | 1.2.2 | Настройкаҳоро дар profile-и фаъол татбиқ/санҷида мекунад ва ду ислоҳи extension-ҳоро нигоҳ медорад. |
| Mansur GitHub Panel | `mansur.mansur-github-panel` | 1.2.1 | Панели GitHub барои дидани branch, сохтан, гузаштан ва ҳазфи branch медиҳад. |
| Russian Language Pack for Visual Studio Code | `ms-ceintl.vscode-language-pack-ru` | 1.106.0 | Интерфейси editor-ро ба русӣ мегузорад. |
| SQL Server (mssql) | `ms-mssql.mssql` | 1.46.0 | Ба SQL Server пайваст мешавад ва query/schema-ро идора мекунад. |
| Oxc | `oxc.oxc-vscode` | 1.63.0 | Oxlint ва Oxfmt-ро барои lint ва format пайваст мекунад. |
| Material Icon Theme | `pkief.material-icon-theme` | 5.39.0 | Иконкаҳои файл ва папкаҳоро ба Material Icons мегузорад. |
| Live Server | `ritwickdey.liveserver` | 5.7.10 | Сервери маҳаллӣ барои HTML/CSS/JS бо live reload мекушояд. |
| Code Spell Checker | `streetsidesoftware.code-spell-checker` | 4.9.3 | Хатоҳои имлои матн ва номҳои дохили кодро нишон медиҳад. |
| Error Lens | `usernamehw.errorlens` | 3.29.0 | Хато ва warning-ҳоро бевосита назди сатри код нишон медиҳад. |
| Import Cost | `wix.vscode-import-cost` | 3.3.0 | Андозаи package-и import/require-шударо назди код нишон медиҳад. |

TS MANCHO 3.2.0 ва Stability 1.2.2 аз VSIX-и repo насб мешаванд. GitHub Panel 1.2.1 аз source-и repo дар вақти install ба VSIX package ва бо CLI сабт мешавад. Танзимоти extension-ҳо дар [config/settings.json](../config/settings.json) ҳастанд. Gallery extension аз Antigravity CLI гирифта мешавад; account/login-и шахсӣ аз repo намеояд.

Дар helper-и насби алоҳида танҳо Jelly Cursor compatible-version fallback дорад: версияи воқеии сабтшуда аз CLI хонда ва дар Doctor нишон дода мешавад. Дигар extension-ҳо pin-и snapshot-ро нигоҳ медоранд. Fallback VSIX аз Microsoft Marketplace меояд; identity/version/manifest checksum ва registration санҷида мешаванд.

Аз насби автоматӣ хориҷ шудаанд: `meta.pyrefly`, `ms-python.python`, `ms-python.debugpy`, `ms-python.vscode-python-envs`, `shopify.ruby-lsp`, `github.vscode-github-actions`, `golang.go`, `vscjava.vscode-gradle`, `akintomiwa-fisayo.icon-classes`, `fogio.jetbrains-product-icon-theme`, `ms-azuretools.vscode-containers`, `llvm-vs-code-extensions.vscode-clangd`, `ms-azuretools.vscode-docker`. Setup онҳоро download ё update намекунад ва нусхаҳои аллакай насбшударо худкор нест намекунад.

`workbench.productIconTheme` ба `Default` гузошта шудааст, то иконкаҳои интерфейс ба extension-и хориҷшуда вобаста набошанд. Material Icon Theme-и файлҳо нигоҳ дошта мешавад.

Docker 2.0.0 низ хориҷ шудааст: [manifest-и расмии он](https://github.com/microsoft/vscode-docker/blob/v2.0.0/package.json) `ms-azuretools.vscode-containers`-ро ҳамчун `extensionDependencies` талаб мекунад. Ин аз бознасби ғайримустақими Container Tools пешгирӣ мекунад.
