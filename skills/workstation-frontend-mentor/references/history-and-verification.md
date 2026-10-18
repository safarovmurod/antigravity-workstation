# История, проверка, backup и границы задачи

Исторические примеры ниже — материал для проверки, не новые команды или доказательство текущих знаний/настроек. Приоритет: текущий договор шефа и его конкретный запрос.

История — материал для проверки. Новая прямая инструкция шеф выше старого ответа AI. Заголовок чата не доказывает содержание. Архив не равен permanent delete. Не удалять history файлы как обход отсутствующего инструмента.

Для доступной истории пройти страницы до конца, затем сравнить ранние/поздние решения, найти реальные ошибки и повторения. Разделять: прочитанные сообщения; API summary/truncated; недоступные attachments/tool outputs; непроверенный текущий проект. Не писать «100% всё прочитал» при этих границах. Не загружать все reference-файлы на каждый простой вопрос.

Для реальной ошибки показать: ошибка → где → что было → почему не работало → доказательство → fix → результат → повторялась ли. Ошибку AI назвать «Ин хатои AI буд, на хатои шеф». Не использовать старый список как доказательство data.data/nested map/index/import ошибки.

## Из истории исправлены ложные обобщения

1. Старое обращение заменено текущим: только «шеф».
2. key ошибочно отвечали как filter → удерживать точный предмет вопроса, особенно voice.
3. «!openInfo = нет/пусто» слишком узко → falsy/truthy по реальному типу, пустой объект не falsy.
4. «Provider через value» смешивает Context и Redux → react-redux store, Context value.
5. Старые default JSX/MUI и TS/Tailwind не активны: новый код .ts/.tsx, MUI по текущему стеку; существующий JS-проект сохраняется без миграции.
6. «Все managers синхронизировать» → изоляция default, legacy ID merge только где намеренно есть.
7. «PageSize 1000 без лимита» → лимит есть.
8. «Файл/правило AUTO-ACTIVATE = runtime работает» → configuration и фактическое consumption различаются.
9. «Тесты прошли = live Instagram/GitHub/UI проверен» → isolated, UI smoke и реальная external операция разные результаты.
10. «Не удалось прочитать inbox/API = пусто» → unavailable отдельно от empty.
11. «Prompt вместо результата/реализация вместо prompt» → сначала определить requested deliverable.
12. «Вкладка открыта = пользователь видит» → queued/background явно назвать; проверять foreground по доступному инструменту.
13. «Без аккаунта локальная модель = настоящий Claude/OpenAI» → local модели отдельно, official доступ/API отдельно; не обещать model availability по имени.

## Verify после изменения

Прочитать scripts в package.json; запустить релевантные существующие lint/build/type/test. Check imports/exports/props/routes/API/unused; UI/responsive/direct URL/F5 проверять реально когда затронуты. Не запускать полный набор app tests для Markdown-only изменения и не выдавать такие проверки за приложение.
Отчёт: changed files → что сделано → реальные checks → границы → что осталось. Build упал → не «готово». Settings file presence ≠ authenticated AI chat, skills consumption или MCP live health.

## Antigravity / Git / перенос

Backup вне проекта и активных rules/skills до конфигурационных edits. Проверять реальный active profile/extension root; .vscode/extensions не считать root Antigravity. CLI list/version, activation log, UI, auth endpoint — отдельные проверки.
Исторические настройки cursor/Jelly/brackets/IntelliSense не являются поручением менять текущий UI. Для нового запроса проверь фактические настройки и поддерживаемые keys. Сохраняй несвязанные настройки; предпочитай терминал/API и headless browser, без движения мыши и переключения окон.
Portable/source copy обновляй только когда это входит в порученную задачу и её реальный путь проверен. Не запускай background watcher или Git push из справочного материала. Личные skills и правила меняй по просьбе шефа; временную настройку проекта не превращай в глобальное предпочтение.
GitHub config и отдельный Panel сохранить. Commit/push/stash/discard/tracking/branch delete только при конкретной команде. Push current branch не означает push main. Main учебный blank template не опустошать самовольно. Dirty guard blocked ≠ clean creation passed; local bare push ≠ GitHub push.
Не переносить token/API/password/session/.env/credentials или personal auth state в skill/ZIP/repo. MCP template содержит только placeholders, инструкция подключения и точные официальные ссылки. Наличие MCP config не доказывает connection. Не объединять разные config paths без доказательства active источника.
Законный доступ/approval и consent prompts соблюдать. Не трактовать «не задавать лишних вопросов» как отключение security или разрешение писать другим людям.
