# Git Branch Panel

![Git Branch Panel](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/extensions/git-branch-panel/icon.png)

## Короткие инструкции

Анимации показывают последовательность действий, это не запись экрана IDE. Нажми изображение для MP4 (примерно 11 секунд).

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

[![Pull Request](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/docs/feature-guides/pull-request.gif)](https://github.com/safarovmurod/antigravity-workstation/blob/main/docs/feature-guides/pull-request.mp4)

### 6. Удалить ветку
[![Удалить ветку](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/docs/feature-guides/delete-branch.gif)](https://github.com/safarovmurod/antigravity-workstation/blob/main/docs/feature-guides/delete-branch.mp4)

Панель **Explorer → GitHub** показывает текущую ветку и точный маршрут push. Можно выбрать отдельные изменённые файлы, создать для них ветку из выбранной основы, применить formatter проекта и отправить commit в `origin`.

Блок **Получить изменения** выбирает исходную ветку, загружает её актуальное состояние из GitHub и объединяет с текущей веткой. При конфликте каждый файл можно оставить текущим или полностью принять из GitHub. Отдельный блок открывает официальное создание Pull Request.

Для работы открой Git-проект с `origin`; после подключения через терминал панель обнаружит его автоматически. Интерфейс следует русскому или английскому языку Antigravity. Удаление веток и push в основную ветку требуют отдельного подтверждения. Ошибки Git отображаются в панели; локальный commit сохраняется, если push не удался.

Расширение устанавливается вместе с [Antigravity Workstation](../../README.md).
