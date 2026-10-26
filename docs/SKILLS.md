# Global skills и их файлы

Full installer нусхаи ҳозираи 79 skill-ро ҳамроҳи GEMINI.md мустақил, ду contextual rule ва ду guide мегузорад. Барои фақат GEMINI.md/rules/guides `install --rules-only` истифода мешавад: [UNIFIED-RULES.md](UNIFIED-RULES.md). Число 79 каталогҳои дорои `SKILL.md` аст; будани файл ҳанӯз иҷро шудани workflow-ро исбот намекунад.

При full install терминал показывает имя каждого skill и прогресс после его копирования: `Skill [1/79]` … `[79/79] 100%`. Это подтверждение deployment, не выполнения всех workflows. [Установка из терминала](../README.md#quick-start).

Все 79 Antigravity-совместимых bundles автоматически копируются installer из skills/ в ~/.gemini/config/skills/. Ду нусхаи иловагии ҳозираи `android-cli` дар `~/.gemini/skills/` ва `~/.gemini/antigravity/skills/` низ барқарор мешаванд; source дар [global skills](../resources/global-skills/) ва [runtime skills](../resources/antigravity-runtime/skills/) ҳаст. GSD 1.18.0 также получает resources/gsd-core и agents/. Личные auth/session/settings.db не экспортируются. Inventory с hash, source, trigger, dependencies, install path и честным статусом активации: [CONTEXT-INVENTORY.json](CONTEXT-INVENTORY.json). Воспроизведение: `node scripts/audit-context-inventory.cjs docs/CONTEXT-INVENTORY.json`. Disk bytes не равны активным tokens; runtime response latency не измерена.

Новый [in-chat-screenshot-to-code](../skills/in-chat-screenshot-to-code/SKILL.md) адаптирован из оригинального ZIP пользователя, а не подменён старым собственным workflow. Проверенный hash/различия/неподтверждённая лицензия отдельного attachment: [provenance](upstream/IN-CHAT-SCREENSHOT-TO-CODE-PROVENANCE.md). Installer ставит только адаптированные Markdown, без .DS_Store/__MACOSX. Live model activation отдельно остаётся NOT TESTED.

- [agent-browser](../skills/agent-browser/SKILL.md)
- [gsd-add-tests](../skills/gsd-add-tests/SKILL.md)
- [gsd-ai-integration-phase](../skills/gsd-ai-integration-phase/SKILL.md)
- [gsd-audit-fix](../skills/gsd-audit-fix/SKILL.md)
- [gsd-audit-milestone](../skills/gsd-audit-milestone/SKILL.md)
- [gsd-audit-uat](../skills/gsd-audit-uat/SKILL.md)
- [gsd-autonomous](../skills/gsd-autonomous/SKILL.md)
- [gsd-capture](../skills/gsd-capture/SKILL.md)
- [gsd-cleanup](../skills/gsd-cleanup/SKILL.md)
- [gsd-code-review](../skills/gsd-code-review/SKILL.md)
- [gsd-complete-milestone](../skills/gsd-complete-milestone/SKILL.md)
- [gsd-config](../skills/gsd-config/SKILL.md)
- [gsd-debug](../skills/gsd-debug/SKILL.md)
- [gsd-discuss-phase](../skills/gsd-discuss-phase/SKILL.md)
- [gsd-docs-update](../skills/gsd-docs-update/SKILL.md)
- [gsd-eval-review](../skills/gsd-eval-review/SKILL.md)
- [gsd-execute-phase](../skills/gsd-execute-phase/SKILL.md)
- [gsd-explore](../skills/gsd-explore/SKILL.md)
- [gsd-extract-learnings](../skills/gsd-extract-learnings/SKILL.md)
- [gsd-fast](../skills/gsd-fast/SKILL.md)
- [gsd-forensics](../skills/gsd-forensics/SKILL.md)
- [gsd-graphify](../skills/gsd-graphify/SKILL.md)
- [gsd-health](../skills/gsd-health/SKILL.md)
- [gsd-help](../skills/gsd-help/SKILL.md)
- [gsd-import](../skills/gsd-import/SKILL.md)
- [gsd-inbox](../skills/gsd-inbox/SKILL.md)
- [gsd-ingest-docs](../skills/gsd-ingest-docs/SKILL.md)
- [gsd-manager](../skills/gsd-manager/SKILL.md)
- [gsd-map-codebase](../skills/gsd-map-codebase/SKILL.md)
- [gsd-mempalace-capture](../skills/gsd-mempalace-capture/SKILL.md)
- [gsd-mempalace-recall](../skills/gsd-mempalace-recall/SKILL.md)
- [gsd-milestone-summary](../skills/gsd-milestone-summary/SKILL.md)
- [gsd-mvp-phase](../skills/gsd-mvp-phase/SKILL.md)
- [gsd-new-milestone](../skills/gsd-new-milestone/SKILL.md)
- [gsd-new-project](../skills/gsd-new-project/SKILL.md)
- [gsd-next](../skills/gsd-next/SKILL.md)
- [gsd-ns-context](../skills/gsd-ns-context/SKILL.md)
- [gsd-ns-ideate](../skills/gsd-ns-ideate/SKILL.md)
- [gsd-ns-manage](../skills/gsd-ns-manage/SKILL.md)
- [gsd-ns-project](../skills/gsd-ns-project/SKILL.md)
- [gsd-ns-review](../skills/gsd-ns-review/SKILL.md)
- [gsd-ns-workflow](../skills/gsd-ns-workflow/SKILL.md)
- [gsd-onboard](../skills/gsd-onboard/SKILL.md)
- [gsd-pause-work](../skills/gsd-pause-work/SKILL.md)
- [gsd-phase](../skills/gsd-phase/SKILL.md)
- [gsd-plan-phase](../skills/gsd-plan-phase/SKILL.md)
- [gsd-plan-review-convergence](../skills/gsd-plan-review-convergence/SKILL.md)
- [gsd-pr-branch](../skills/gsd-pr-branch/SKILL.md)
- [gsd-profile-user](../skills/gsd-profile-user/SKILL.md)
- [gsd-progress](../skills/gsd-progress/SKILL.md)
- [gsd-quick](../skills/gsd-quick/SKILL.md)
- [gsd-quick-batch](../skills/gsd-quick-batch/SKILL.md)
- [gsd-resume-work](../skills/gsd-resume-work/SKILL.md)
- [gsd-review](../skills/gsd-review/SKILL.md)
- [gsd-review-backlog](../skills/gsd-review-backlog/SKILL.md)
- [gsd-secure-phase](../skills/gsd-secure-phase/SKILL.md)
- [gsd-settings](../skills/gsd-settings/SKILL.md)
- [gsd-ship](../skills/gsd-ship/SKILL.md)
- [gsd-sketch](../skills/gsd-sketch/SKILL.md)
- [gsd-spec-phase](../skills/gsd-spec-phase/SKILL.md)
- [gsd-spike](../skills/gsd-spike/SKILL.md)
- [gsd-stats](../skills/gsd-stats/SKILL.md)
- [gsd-surface](../skills/gsd-surface/SKILL.md)
- [gsd-thread](../skills/gsd-thread/SKILL.md)
- [gsd-ui-phase](../skills/gsd-ui-phase/SKILL.md)
- [gsd-ui-review](../skills/gsd-ui-review/SKILL.md)
- [gsd-ultraplan-phase](../skills/gsd-ultraplan-phase/SKILL.md)
- [gsd-undo](../skills/gsd-undo/SKILL.md)
- [gsd-update](../skills/gsd-update/SKILL.md)
- [gsd-validate-phase](../skills/gsd-validate-phase/SKILL.md)
- [gsd-verify-work](../skills/gsd-verify-work/SKILL.md)
- [gsd-workspace](../skills/gsd-workspace/SKILL.md)
- [gsd-workstreams](../skills/gsd-workstreams/SKILL.md)
- [workstation-frontend-mentor](../skills/workstation-frontend-mentor/SKILL.md)
- [workstation-practice](../skills/workstation-practice/SKILL.md)
- [project-coding-rules](../skills/project-coding-rules/SKILL.md)
- [vercel-react-best-practices](../skills/vercel-react-best-practices/SKILL.md)

## Другие tools

Следующие shared skills сохранены в исходной shared установке, но не перенесены как работающие Antigravity skills: они обращаются к Codex hooks, app tools, Canvas/SDK/config paths. Подмена их runtime не входит в этот setup.

- automate
- autopilot
- canvas
- create-hook
- create-rule
- create-skill
- create-subagent
- loop
- migrate-to-skills
- onboard
- rename-chat
- review
- review-bugbot
- review-security
- sdk
- shell
- split-to-prs
- statusline
- update-cli-config
- update-cursor-settings

Это доступность и правила выбора. Наличие файла не доказывает, что AI прочитал его в конкретном чате. Другие skills выбираются автоматически по задаче; не выполняются все workflows одновременно.

## Android CLI

Bundle `android-cli` добавлен в каталог (78 skills). Installer копирует skill и два reference; Android CLI/SDK отдельно устанавливается при соответствующей Android задаче, не при установке профиля.
