# Инвентари Antigravity — 16.10.2026

Ин рӯйхат snapshot-и конфигуратсияи шахсии ҳозира аст. Source-и ҳар қисми насб дар ҳамин repo аст; маълумоти account/credential ба он дохил намешавад.

| Қисм | Шумора | Source |
|---|---:|---|
| Editor settings | 233 key | [config/settings.json](../config/settings.json) |
| Keybindings | 15 binding | [config/keybindings.json](../config/keybindings.json) |
| Global GEMINI.md | 1 | [rules/GEMINI.template.md](../rules/GEMINI.template.md) |
| Contextual rules | 2 | [rules/](../rules/) |
| Guides | 2 | [resources/guides/](../resources/guides/) |
| Skills | 78 каталог бо `SKILL.md` | [skills/](../skills/) |
| Agents | 64 file | [agents/](../agents/) |
| Hooks | 43 file | [resources/hooks/](../resources/hooks/) |
| GSD Core | 756 file | [resources/gsd-core/](../resources/gsd-core/) |
| Antigravity runtime scripts | 23 file | [resources/antigravity-runtime/scripts/](../resources/antigravity-runtime/scripts/) |
| Additional Android skill locations | 2 каталог, ҳар кадом 3 file | [resources/global-skills/](../resources/global-skills/), [runtime skills](../resources/antigravity-runtime/skills/) |
| GSD profile and installation manifests | 3 file | [resources/antigravity-runtime/](../resources/antigravity-runtime/) |
| Local MCP runtimes | 3 package, 2 dependency manifest | [resources/mcp-runtime/](../resources/mcp-runtime/) |
| Extensions | Catalog: 22; насби асосӣ: 18 gallery + 3 local VSIX; Jelly Cursor ихтиёрӣ | [config/extensions.json](../config/extensions.json) |

Танзимоти agent ва hook entrypoint-ҳо дар `config/antigravity-settings.json`, `config/gemini-config.json` ва `config/hooks.json` ҳастанд. MCP definitions дар [config/mcp/active.template.json](../config/mcp/active.template.json)анд; server connection ва иҷозати шахсӣ алоҳида санҷида мешаванд.

Рақамҳо шумораи файл/entry-ҳои snapshot-ро нишон медиҳанд. TS MANCHO 3.2.0 дар VSIX-и repo аст; насби он дар профили ҳаррӯза ҳоло тасдиқ нашудааст. Барои 3.1.2 pulse, Auto Save, Format, quiet decorations ва smooth cursor дар VS Code 1.107.1-и Linux санҷида шуданд; барои 3.2.0 (рангҳои ором бо 95% шаффофӣ, бе тугмаи Format) ҳоло танҳо unit-санҷишҳо ва build hash тасдиқ шудаанд, editor-runner ва Windows UI ҳоло иҷро нашудаанд. [PROFILE-SYNC-REPORT.json](PROFILE-SYNC-REPORT.json) санҷиш ва hash-ҳои конфиги ҷориро сабт мекунад. Runtime-и AI, Docker ва MCP authorization бо ин рақамҳо исбот намешаванд. [Командаи насб](../README.md#quick-start) ва [марзи санҷиши MCP](MCP_SETUP.md).
