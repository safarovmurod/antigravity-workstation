# Git Branch Panel

![Git Branch Panel](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/extensions/git-branch-panel/icon.png)

## Короткие инструкции

Ниже — актуальные учебные схемы действий, не запись экрана IDE и не результат тестирования. Нажми GIF для скачивания MP4. Чтобы воспроизвести видео в редакторе, открой **Workstation: Open Recorded IDE Guide / Instructional Animation** и выбери соответствующую «Анимацию» (нужен Workstation Stability 1.3.17). Встроенный MP4-плеер в Details не заявляется.

### 1. Текущая ветка
[![Текущая ветка](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/current-branch.gif)](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/current-branch.mp4)

### 2. Новая ветка
[![Новая ветка](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/new-branch.gif)](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/new-branch.mp4)

### 3. Переключить ветку
[![Переключить ветку](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/switch-branch.gif)](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/switch-branch.mp4)

### 4. Получить изменения
[![Получить изменения](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/get-changes.gif)](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/get-changes.mp4)

### 5. Pull Request — предложить объединение веток
Это запрос на проверку и объединение кода одной ветки с другой. Открытие запроса само по себе не объединяет код.

Пешниҳоди якҷоя кардани кодҳои ин ветка бо веткаи дигар. Панель проверяет существование head/base в origin и совпадение локального HEAD с head в origin. Если ветку нужно push/sync, compare не открывается как готовый PR; автоматического push или merge здесь нет.

[![Pull Request](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/pull-request.gif)](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/pull-request.mp4)

### 6. Удалить ветку
В 1.4.4 обычное удаление по умолчанию касается только local и использует `git branch -d`. Scope выбирается явно: local, только origin или local + origin; force — отдельные варианты. Подтверждение показывает число неслитых commits. Без force такие commits блокируют удаление. Удаление активной local-ветки блокируется при изменённых файлах или несохранённых редакторах. Protected branches нельзя удалить. Remote удаляется с lease на проверенный SHA: чужой новый push не должен потеряться. Remote-only не удаляет local ref. Сначала сохрани нужные commits; force может сделать их недоступными через удалённую ветку.

[![Удалить ветку](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/delete-branch.gif)](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/git-branch-panel/media/delete-branch.mp4)

Панель **Explorer → GitHub** показывает текущую ветку и точный маршрут push. Можно выбрать отдельные изменённые файлы, создать для них ветку из выбранной основы, применить formatter проекта и отправить commit в `origin`.

Блок **Получить изменения** выбирает исходную ветку, загружает её актуальное состояние из GitHub и объединяет с текущей веткой. При конфликте каждый файл можно оставить текущим или полностью принять из GitHub. Отдельный блок открывает официальное создание Pull Request.

Для работы открой Git-проект с `origin`; после подключения через терминал панель обнаружит его автоматически. Интерфейс следует русскому или английскому языку Antigravity. Удаление веток и push в основную ветку требуют отдельного подтверждения. Ошибки Git отображаются в панели; локальный commit сохраняется, если push не удался.

Расширение устанавливается вместе с [Antigravity Workstation](../../README.md).
