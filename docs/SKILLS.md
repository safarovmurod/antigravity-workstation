# Skills, правила и агент

Установка кладёт в `~/.gemini` только то, что нужно для работы с frontend-проектами. Ничего лишнего: чем меньше контекста, тем быстрее отвечает агент.

| Что | Куда ставится | Зачем |
| --- | --- | --- |
| [GEMINI.md](../rules/GEMINI.template.md) | `~/.gemini/GEMINI.md` | Главные правила: язык, scope задачи, простой код, проверка |
| Правила design и full-stack | `~/.gemini/config/rules/` | Подключаются только для задач по дизайну или backend |
| [workstation-frontend-mentor](../skills/workstation-frontend-mentor/SKILL.md) | `~/.gemini/config/skills/` | Модули: state, API, формы, routing, MUI/Tailwind, проверка |
| [project-coding-rules](../skills/project-coding-rules/SKILL.md) | там же | Минимальные правки в существующем проекте |
| [workstation-workflow](../skills/workstation-workflow/SKILL.md) | там же | Большая задача: план → работа → проверка |
| [workstation-practice](../skills/workstation-practice/SKILL.md) | там же | Учебные задачи |
| [in-chat-screenshot-to-code](../skills/in-chat-screenshot-to-code/SKILL.md) | там же | Вёрстка по screenshot. Источник: [provenance](upstream/IN-CHAT-SCREENSHOT-TO-CODE-PROVENANCE.md) |
| [agent-browser](../skills/agent-browser/SKILL.md) | там же | Проверка страницы в браузере |
| [workstation-verifier](../agents/workstation-verifier.md) | `~/.gemini/config/agents/` | Независимая проверка готовой работы, код не меняет |

Skill загружается только когда задача ему подходит; наличие файла не значит, что агент прочитал его в конкретном чате. Только правила без skills: `install --rules-only` ([UNIFIED-RULES.md](UNIFIED-RULES.md)).
