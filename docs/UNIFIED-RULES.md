# Дастурҳои ҳозираи Antigravity

Snapshot-и 14.10.2026 як **GEMINI.md мустақил**, ду contextual rule ва ду guide дорад. Қоидаҳои кӯҳнаи `mansur-01`, `mansur-02`, `mansur-03`, `mansur-unified-core`, `mansur-unified-sources` ва дигар нусхаҳои такрорӣ ба payload-и ҳозира дохил намешаванд. Дастури асосӣ дар ҳар чати нав бе slash command истифода мешавад; ду rule бо `trigger: model_decision` барои мавзӯъҳои мувофиқанд.

| Source дар repo | Ҷойи насб |
|---|---|
| [rules/GEMINI.template.md](../rules/GEMINI.template.md) | `~/.gemini/GEMINI.md` |
| [rules/mansur-unified-design.template.md](../rules/mansur-unified-design.template.md) | `~/.gemini/config/rules/mansur-unified-design.md` |
| [rules/mansur-unified-full-stack.template.md](../rules/mansur-unified-full-stack.template.md) | `~/.gemini/config/rules/mansur-unified-full-stack.md` |
| [resources/guides/design.md](../resources/guides/design.md) | `~/.gemini/config/mansur-unified/guides/design.md` |
| [resources/guides/full-stack.md](../resources/guides/full-stack.md) | `~/.gemini/config/mansur-unified/guides/full-stack.md` |

Full [bootstrap](../README.md#quick-start) ҳамин панҷ файлро ҳамроҳи settings, skills, hooks ва extensions мегузорад. Барои фақат ҳамин панҷ файл аз папкаи repo:

```powershell
node bin/mansur-setup.js install --rules-only --name "povilitel" --dry-run
node bin/mansur-setup.js install --rules-only --name "povilitel"
```

`--dry-run` файлҳоро намегардонад. Ҳангоми тағйири воқеӣ backup сохта мешавад. `--rules-only` editor settings, MCP, font ва extensions-ро насб намекунад; барои профили пурра командаи README-ро истифода кун. Файлҳои шахсии дигар дар ин папкаҳо аз рӯйи тахмин пок карда намешаванд.

Барои санҷиши runtime, баъди Reload Window чати нав кушо ва кори хурди frontend ё design бидеҳ. Мавҷуд будани файл ва frontmatter танҳо насбро нишон медиҳад; истифодаи воқеии rule дар чати AI алоҳида санҷида мешавад.
