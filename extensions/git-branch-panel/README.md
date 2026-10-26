# Git Branch Panel

![Git Branch Panel](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/extensions/git-branch-panel/icon.png)

## Короткие инструкции

Исторические анимации ниже — карточки текста, не запись экрана IDE. Они не доказывают работу текущей версии; схема удаления до 1.4.4 не соответствует новым безопасным вариантам. Новые реальные записи ещё не готовы. Нажми изображение для исторического MP4.

### 1. Текущая ветка
[![Текущая ветка](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/docs/feature-guides/current-branch.gif)](https://github.com/safarovmurod/antigravity-workstation/blob/main/docs/feature-guides/current-branch.mp4)

### 2. Новая ветка
[![Новая ветка](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/docs/feature-guides/new-branch.gif)](https://github.com/safarovmurod/antigravity-workstation/blob/main/docs/feature-guides/new-branch.mp4)

### 3. Переключить ветку
[![Переключить ветку](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/docs/feature-guides/switch-branch.gif)](https://github.com/safarovmurod/antigravity-workstation/blob/main/docs/feature-guides/switch-branch.mp4)

### 4. Получить изменения
[![Получить изменения](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/docs/feature-guides/get-changes.gif)](https://github.com/safarovmurod/antigravity-workstation/blob/main/docs/feature-guides/get-changes.mp4)

### 5. Pull Request — предложить объединение веток
Это запрос на проверку и объединение кода одной ветки с другой. Открытие запроса само по себе не объединяет код.

Пешниҳоди якҷоя кардани кодҳои ин ветка бо веткаи дигар. Панель проверяет существование head/base в origin и совпадение локального HEAD с head в origin. Если ветку нужно push/sync, compare не открывается как готовый PR; автоматического push или merge здесь нет.

[![Pull Request](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/docs/feature-guides/pull-request.gif)](https://github.com/safarovmurod/antigravity-workstation/blob/main/docs/feature-guides/pull-request.mp4)

### 6. Удалить ветку
В 1.4.4 обычное удаление по умолчанию касается только local и использует `git branch -d`. Scope выбирается явно: local, только origin или local + origin; force — отдельные варианты. Подтверждение показывает число неслитых commits. Без force такие commits блокируют удаление. Удаление активной local-ветки блокируется при изменённых файлах или несохранённых редакторах. Protected branches нельзя удалить. Remote удаляется с lease на проверенный SHA: чужой новый push не должен потеряться. Remote-only не удаляет local ref. Сначала сохрани нужные commits; force может сделать их недоступными через удалённую ветку.

[![Удалить ветку](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/docs/feature-guides/delete-branch.gif)](https://github.com/safarovmurod/antigravity-workstation/blob/main/docs/feature-guides/delete-branch.mp4)

Панель **Explorer → GitHub** показывает текущую ветку и точный маршрут push. Можно выбрать отдельные изменённые файлы, создать для них ветку из выбранной основы, применить formatter проекта и отправить commit в `origin`.

Блок **Получить изменения** выбирает исходную ветку, загружает её актуальное состояние из GitHub и объединяет с текущей веткой. При конфликте каждый файл можно оставить текущим или полностью принять из GitHub. Отдельный блок открывает официальное создание Pull Request.

Для работы открой Git-проект с `origin`; после подключения через терминал панель обнаружит его автоматически. Интерфейс следует русскому или английскому языку Antigravity. Удаление веток и push в основную ветку требуют отдельного подтверждения. Ошибки Git отображаются в панели; локальный commit сохраняется, если push не удался.

Расширение устанавливается вместе с [Antigravity Workstation](../../README.md).
