# Запрос, form, routes: просто и по реальному контракту

## Запрос local и global

Если запрос и data нужны одному component, оставить простой function + useState/useEffect. Если data совместно используется и проект уже выбрал store, запрос/action находится в его существующем месте. Global store не заменяет HTTP и не является backend.

Перед кодом проверить package.json, axios instance/baseURL, Swagger/документацию/response, method, точное имя полей, Content-Type, params, body и тип id. Не придумывать URL по аналогии с прошлым проектом.

Axios response.data — тело ответа. Внутри него может реально быть ещё data, items или другая структура; смотреть response, не объявлять data.data ошибкой по виду. Fetch возвращает Response: сначала проверить response.ok там, где нужна обработка HTTP ошибок, затем await response.json() для JSON. Fetch не rejects автоматически только из-за HTTP 400/500. [Axios schema](https://axios.rest/pages/advanced/response-schema).

Объяснить отдельно:
1. input хранит строку;
2. click/submit вызывает именованный handler;
3. handler собирает существующие поля;
4. запрос отправляет body/params по контракту;
5. сервер отвечает;
6. action/setState получает правильный data;
7. React обновляет UI;
8. ошибка остаётся ошибкой, form не закрывается как будто всё сохранилось.

Для обучения показать безопасный console result до/после и Network method/status/body, без token/password. Console примеры разрешены по просьбе обучения; не добавлять production логи без задачи.

## Операции учить отдельно

GET список → INFO/GET by id → POST → PUT → PATCH → DELETE → связь с search/filter/UI. Порядок источника или явно заданный порядок шеф важнее этой рекомендации. Каждую операцию сначала показать отдельно, затем объединить, когда попросит.

- PUT и PATCH: не обещать универсальный формат; реальный API определяет обязательные поля и замена/частичное изменение.
- DELETE может вернуть id, объект, сообщение или пустой 204; не читать несуществующий JSON без проверки.
- После успешного изменения обновить список/Info существующим способом (response/local update/refetch). Не делать ложный success до ответа.
- Add/delete images: сохранить реальные endpoint/id; после удаления обновить именно выбранную сущность, включая info atom если он источник UI.
- `PageSize=1000` остаётся лимитом. Не объявлять «без ограничений» только потому, что сейчас пришло три записи.
- DummyJSON и иные учебные API могут симулировать запись; предупреждать о конкретной подтверждённой persistence-модели, не обещать сохранение после F5.
- Loading/error/empty — разные состояния. Недоступный API не равен пустому списку. Не добавлять сложную систему retries/optimistic update без задачи.

## Forms

Сохранить существующий controlled или uncontrolled стиль. Submit: event.preventDefault(); взять form до await (`const form = event.currentTarget`), реальные input name → объект → action/request. Для uncontrolled формы возможен FormData(form) как чтение полей; отправка HTTP FormData — отдельное решение по контракту. Не угадывать что нужен JSON.

`preventDefault` чувствителен к регистру. Проверить реальное имя AddUserZ/AddUserS/import/export. Не исправлять names только по прошлому чату.
При rename поля сверять data → type (если TS) → input name → чтение form → payload → edit → display. Input с name="name" может конфликтовать с свойствами form; при необходимости использовать FormData или elements.namedItem, а не утверждать что event.target.name.value универсален.
Reset/close после успеха, если этого требует UX. При rejected оставить данные для исправления.

Formik и React Hook Form — инструменты формы, не state managers вроде Redux/Zustand/Jotai. Когда просит только Formik + RHF, не добавлять managers или другую архитектуру. Проверять установленную версию и API; validation шагами, console результата только в учебном режиме.

## Routing / auth

Layout + Outlet и Header/Footer один раз — default новой страницы с router. Если проект намеренно без Layout, не возвращать его без задачи. App — router, pages собирают реальные компоненты.
Detail `/items/:id` должен получать id из URL и работать после F5/direct URL; location.state может помогать UI, но не быть единственным источником данных. Проверить router версию и сервер SPA fallback, когда релевантно.
Не считать любое Number(id) ошибкой: смотреть тип настоящего API id.
При token error проверить Network/status/ответ и код refresh. Не заявлять истечение token без доказательства. Не просить прислать token. Refresh/route guards менять только по реальному контракту, проверять отсутствие бесконечного retry и поведение после неудачи.
Frontend env VITE_* доступны browser; личный Gemini/OpenAI/Anthropic token и server secret там не хранить.

## Effect / render

`useEffect` синхронизирует внешнюю систему: запрос/таймер/подписку. Не объявлять любой effect лишним. Проверять dependencies и последствия setState. Для timer/subscription cleanup требуется по их жизненному циклу. Таймер после unmount/F5 продолжится только если код действительно сохраняет основу времени/state.
State — snapshot данного render; setter планирует обновление. Не обещать новое значение в console той же строки после setState. Объяснить функциональное обновление через prev, когда новое значение зависит от предыдущего.
Dev Strict Mode дополнительные проверки не равны production багу; проверять реальный flow. [React useEffect](https://react.dev/reference/react/useEffect).
