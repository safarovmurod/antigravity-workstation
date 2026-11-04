# MCP дар setup-и ҳозира

Installer launcher ва argument-ҳои се сервери асосиро аз [active.template.json](../config/mcp/active.template.json) нав мекунад. Дар `~/.gemini/antigravity/mcp_config.json` ҳам таърифҳои GSD ва Sequential Thinking ба snapshot-и ҳозира мегузаранд. Credential-ҳои шахсӣ аз env/headers ва ҳолати enable/disable нигоҳ дошта мешаванд; env-и кӯҳнаи бе credential аз серверҳои идорашаванда тоза мешавад. Серверҳои шахсии дигар нигоҳ дошта мешаванд. Credentials ба repo ворид намешаванд. Конфиги асосӣ се launcher-и маҳаллии ҳозираро истифода мебарад: `node.exe` → `~/.gemini/config/mcp-runtime/node_modules/`. Installer dependency-ҳоро аз [package lock](../resources/mcp-runtime/package-lock.json) насб мекунад ва версия ва entrypoint-и ҳар се серверро месанҷад; `node_modules` ба GitHub дохил намешавад.

| Server | Чӣ талаб мекунад | Ҳолати template |
|---|---|---|
| `gsd` | Node/npm; package-и pinned ҳангоми setup насб мешавад | Definition илова мешавад |
| `sequential-thinking` | Node/npm; package-и pinned ҳангоми setup насб мешавад | Definition илова мешавад |
| `chrome-devtools-mcp` | Node/npm; runtime-и pinned ва browser-и дастрас | Definition илова мешавад |

Насб шудани definition ҳанӯз маънои пайваст шудан ё кор кардани tool-ро надорад. Насби тозаи се runtime-и Node ва initialize + tools/list-и онҳо санҷида шуд: Chrome DevTools — 30 tool, GSD — 3 tool, Sequential Thinking — 1 tool. Authorization-и account ва иҷрои ҳамаи ин tools алоҳида санҷида мешаванд. Баъди Reload Window дар Antigravity → Manage MCP Servers сервер, tools ва як амали read-only-ро санҷ. `docker-mcp` ва `github-mcp-server` аз template хориҷ шудаанд. Аз Setup 2.1.8 update онҳоро аз ҳар ду config баъди backup тоза мекунад. Серверҳои шахсии дигар ва credential-ҳои онҳо нигоҳ дошта мешаванд. Docker ва GitHub token барои се сервери ҳозира лозим нестанд.

Bootstrap-и [README](../README.md#quick-start) бо `--auto-approve` иҷро мешавад: native terminal/artifact Always Proceed ва MCP Allow ҳангоми IDE-и пӯшида ё баъди shutdown-и одӣ татбиқ мешаванд. MCP Ask/Deny-и қаблӣ бо сиёсати умумии `mcp(*) Allow` иваз мешавад; command/file deny-ҳои дигар нигоҳ дошта мешаванд. Барои нигоҳ доштани ҳамаи approvals installer-ро дастӣ бо `--skip-permissions` иҷро кун. [Status ва rollback](AGENT-AUTOMATION.md). Барои MCP-и нав account login/authorization алоҳида лозим аст. Дар баъзе версияҳои Antigravity native MCP Refresh метавонад lifecycle error диҳад; [Stability helper](STABILITY.md) танҳо reconnect-и идорашавандаро пешниҳод мекунад.
