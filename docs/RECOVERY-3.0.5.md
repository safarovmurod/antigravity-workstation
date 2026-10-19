# Проверка истории и восстановление 3.0.5

Исходное состояние: чистый checkout `4ba5f3425d66c246aa8008d962b492dff28fec78`, совпадающий с опубликованной 3.0.4. В загруженном чате последние изменения завершились ошибкой лимита; их commit/push не записан. Оригинальных изменённых файлов с Windows в этой среде нет: в чате сохранились команды и имена файлов, а не полный patch. Поведение восстановлено по последнему запросу и проверено заново.

| Запрос из истории | Что уже было в 3.0.4 | Что сделано в 3.0.5 |
|---|---|---|
| Последние расширения, удаление дублей | Выбор последних совместимых gallery-версий, проверенная установка, backup/rollback старых версий | Сохранено; новые локальные VSIX включены в Git и каталог |
| Скачивание всей настройки из main | Загрузка точного commit, контроль версии, source на D: с fallback, 1068 файлов payload | Минимальная версия всех трёх README-команд повышена до 3.0.5; payload по-прежнему 1068 файлов |
| Отступ после установки | Editor/Prettier/EditorConfig по 2 пробела; старые языковые переопределения могли побеждать | По 3 пробела; обновляются управляемые одиночные и совместные языковые селекторы, включая активный профиль |
| rfc/rafce и React import | Расширение установлено, но snippets были внизу, Tab-completion выключен, React import отключён | Snippets в начале, Tab включён, React import включён; принятие реальной подсказки и сам Tab проверены |
| div/HTML/JSX | Emmet полностью выключен настройками | Emmet включён, div раскрывается в HTML и TSX; включены mappings JS/TS → JSX/TSX |
| Видимые ошибки TypeScript | Validation включён, но цвет имел alpha 0D — около 5% непрозрачности | Validation и decorations включены; alpha 33 — 20% непрозрачности / 80% прозрачности. Обновлены и конфиг, и код Calm TypeScript |
| Auto Save, автоимпорт, плавность | Уже были | Сохранены и повторно проверены в настоящем editor host |

Версии: setup **3.0.5**, Calm TypeScript **3.3.1**, Workstation Stability **1.3.1**. Старые локальные VSIX заменены воспроизводимыми пакетами; manifest/hash и каталог согласованы. AI ghost text остаётся выключенным. Чужие параметры, Python indentation и явные запреты команд сохраняются. Конфиги самого проекта `.editorconfig`, `.prettierrc` и `.vscode/settings.json` имеют приоритет; Workstation показывает обнаруженные конфликты.

Проверено в этой облачной Linux-среде:

- `npm test`: **302 passed, 0 failed, 0 skipped** с настоящим проверенным bundle Antigravity 2.5.5.
- Native schema/automation: **12 passed**; recovery/link guards: **4 passed**.
- PowerShell 7.5.4: **29** portable bootstrap network scenarios и **5** font staging scenarios.
- MCP: **3** сервера действительно запущены, handshake и вызовы инструментов прошли. Full-catalog harness: **3** теста прошли.
- VS Code **1.107.1**: автоимпорт установленной React-библиотеки, Prettier/Auto Save с 3 пробелами, настоящая клавиша Tab для rfc/rafce и div, ошибка TypeScript 2322, видимые squiggles и Error Lens с вычисленным цветом `rgba(248, 113, 113, 0.2)`.
- Calm TypeScript: выключение/включение quiet mode, сохранение диагностики, typing pulse и плавный курсор. Исправлена проверка runner: отсутствие пользовательского значения цвета определяется через `inspect().globalValue`, поскольку эффективный default в VS Code — пустой объект.

После push commit `be3f7eb5f6150bbdea2f99c49e0cde9a530e324c` прошла настоящая загрузка raw bootstrap и ZIP из GitHub: версия 3.0.5, **1068 payload-файлов** сверены по hash, повторная установка, quiet completion и coordinated rollback прошли. Этот check не устанавливает внешние расширения, шрифты и браузер.

Дополнительно для того же source commit `be3f7eb` завершились успешно оба workflow: [Setup checks](https://github.com/safarovmurod/antigravity-workstation/actions/runs/39273321401) на Ubuntu/Windows x64/Windows ARM64 и [Native Windows IDE smoke](https://github.com/safarovmurod/antigravity-workstation/actions/runs/39273321216) в настоящем Antigravity на Windows x64 и ARM64, включая новые проверки React/Emmet/TypeScript. Наблюдался итог workflow через публичную страницу GitHub; исходные report artifacts отдельно не скачивались. Старые результаты 3.0.4 не выдаются за проверку новой версии. Профиль IDE на компьютере пользователя не изменялся. Логины и внешние аккаунты не проверялись.

Машиночитаемые результаты: [verification-3.0.5.json](../specs/001-workstation-refresh/verification-3.0.5.json). Старый [verification.json](../specs/001-workstation-refresh/verification.json) сохранён как история 3.0.4.

Для работы в подготовленной cloud-среде:

```bash
cd /workspace/antigravity-workstation
. /workspace/cloud-setup/activate.sh
npm test
npm run test:editor-tooling
```

Зависимости обновляются командой `bash /workspace/cloud-setup/install.sh`, без изменения отслеживаемых файлов. Проверенные инструменты находятся в `/workspace/toolchain` и сохраняются в snapshot. Используется существующий checkout; отдельный Git worktree не требуется. Процессы editor/Xvfb создаются тестовым runner заново и завершаются после проверки. Никакой постоянный web-сервер этому репозиторию не нужен.
