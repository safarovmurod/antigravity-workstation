# Local / global state, Zustand, Redux Toolkit, Jotai

Используй этот материал когда шеф прямо просит state manager или он уже есть в проекте. Наличие урока в skill не разрешает автоматически добавлять Redux/Zustand/Jotai в новый TypeScript + MUI проект. Существующий JS-проект сохраняй без миграции.

## Три разные оси

| Вопрос | Варианты | Что объяснить |
|---|---|---|
| Где компонентам доступен state? | useState в компоненте / общий store или atom | Local UI и global UI |
| Откуда data? | локальный массив / реальный API | Global store может хранить локальный массив без запросов |
| Где data переживает F5? | память / localStorage / сервер | Global не означает persistence, облако или синхронизацию телефона с ПК |

Начинай с простой идеи, затем покажи текущий путь: click → handler → id/object → action или request → новое state → render. GET без сервера — чтение массива; POST/PUT/PATCH/DELETE в локальном уроке — аналогии операций, HTTP не отправляется. Не выдумывай сеть для локальной практики.

## Простая логика массива

Ниже куски логики, не полные компоненты. `items`, `newItem`, `updatedItem`, `selectedId` — учебные имена; в проекте используй реальные.

```js
const addedItems = [...items, newItem];
const selectedItem = items.find((item) => item.id === selectedId);
const remainingItems = items.filter((item) => item.id !== selectedId);
const editedItems = items.map((item) => {
  if (item.id === updatedItem.id) {
    return { ...item, ...updatedItem };
  }
  return item;
});
```

Добавление в начало `[newItem, ...items]` допустимо, если так устроен проект. Edit сохраняет id. В локальном Add используй одно id, соответствующее существующему типу/генератору; API id бери с сервера. Не меняй string id на number без проверки.

Для объяснения Delete: `[1, 2, 3]`, выбран `2`; `1 !== 2` true — остаётся, `2 !== 2` false — удаляется, `3 !== 2` true — остаётся; результат `[1, 3]`.

## Zustand

- `create` импортируется из `zustand`. Созданный `useZustand`/`useUserStore` — hook пользователя, не встроенный hook React. Сохраняй реальное имя.
- `set` обновляет store; обычный set выполняет shallow merge на первом уровне. Вложенный объект/массив копируй явно.
- Local CRUD: Add — новый массив; Edit/status — map; Delete — filter; Info — find. Без Immer не мутируй state напрямую.
- `{ ...item, user: user }` добавляет вложенное поле user. Для обновления плоских name/image: `{ ...item, ...user }`. Если реальная модель вложенная, не объявляй такую запись ошибкой.
- Async action: настоящий axios/fetch → корректное извлечение response → set → UI. Не переносить весь запрос в компонент без просьбы.
- Можно использовать понятный существующий destructuring store. Не заменять весь стиль на сложные selectors ради вида. При новых selectors проверять правила версии о стабильности результата.
- Persistence вводить только по задаче: сохранять долговечные данные; temporary info, loading, error обычно не сохранять. Не обещать F5 persistence от одного create.

## Redux Toolkit

- `createSlice` из `@reduxjs/toolkit`, не `create` из Zustand. Slice предоставляет actions/reducer, configureStore собирает reducer, react-redux Provider получает `store`.
- `useSelector((state) => state.realSlice.items)` читает реально зарегистрированный slice. Не придумывать имя `state.counter`.
- `useDispatch()` даёт dispatch; dispatch(action(payload)) вызывает обработку action. Объясняй отдельно action, payload, reducer, store, selector, render.
- В createSlice reducers допускается запись вроде `state.items.push(...)`: Immer создаёт корректное обновление. Не запрещай это по правилу React useState/обычного Zustand.
- Локальный Redux slice не требует API. API thunk: pending → запрос → fulfilled/rejected; extraReducers обновляет состояние. Сохраняй существующее разделение thunks и slices.
- Не выполняй async-запрос внутри обычного reducer. Не превращай rejected в успех через пустой catch.
- Обычный await dispatch(thunk()) возвращает action; для try/catch результата запроса используй unwrap, если такая обработка действительно нужна. Не добавляй её без задачи.

## Jotai

- `atom` хранит конфигурацию атома, значение находится в Jotai store. `useAtom` читает значение и возвращает setter для writable atom; useAtomValue читает, useSetAtom пишет.
- Общие atom объявляй вне component для стабильной identity. Не создавать `useAtom(atom(...))` заново на каждом render.
- Local CRUD обновляет array atom с spread/map/filter/find. Writable action atom использует `(get, set, argument)`: get читает atom, set записывает atom. Это не axios GET и не React setState.
- Async write atom может сделать реальный запрос и обновить нужный atom. GET списка и GET by id держи различными операциями.
- По умолчанию возможно provider-less использование, но отдельные Provider/store изолируют значения. Сохраняй существующую границу store.

## Изоляция и смешанные учебные проекты

Задача Redux → меняй Redux; Zustand → Zustand; Jotai → Jotai. Не синхронизировать менеджеры автоматически.
Исключение: пользовательский проект уже намеренно объединяет два store по одному id. Сохрани этот контракт: один Add id для обеих частей, Edit сохраняет id, Delete удаляет обе части. Это исключение данного проекта, не default архитектура.
При общем Info выбери активный manager явно. `reduxInfo || zustandInfo || jotaiInfo` может показать старые данные другого manager, если это подтверждено состоянием. Не считать любой `||` ошибкой.

## Простая UI логика

- Add open — boolean; Edit selectedUser — object/null, если так устроено: setUser(item) выбирает и открывает, setUser(null) закрывает; `if (!user) return null` показывает ничего.
- `!value` означает логическое отрицание truthy/falsy, не исключительно «пустой объект». `{}` и `[]` truthy; null/undefined/false/0/пустая строка falsy.
- `user?.id`: если user null/undefined, вернётся undefined; это не проверка существования любого поля.
- Controlled input: value + onChange; uncontrolled: defaultValue — начальное значение. Смена props не переустановит уже существующее uncontrolled поле автоматически.
- key может заставить React пересоздать form при смене id. Когда закрытие действительно unmount-ит form, key для этого reset может быть лишним. Проверить flow; закрытый MUI Dialog сам по себе не всегда означает unmount.
- Accordion — openId; повторный click закрывает. Slider — activeId/index по настоящей модели; после Delete выбранной картинки проверить границы. Pagination — filter/search сначала, slice потом; search обычно сбрасывает page, если этого требует UX.
- Не усложнять handlers Context/reducer/useRef ради простого Add/Edit.

Официальные источники: [Zustand update](https://zustand.docs.pmnd.rs/learn/guides/updating-state), [Redux createSlice](https://redux.js.org/toolkit/api/createSlice), [Thunk](https://redux.js.org/toolkit/api/createAsyncThunk), [Provider](https://redux.js.org/react-redux/api/provider), [Jotai atom](https://jotai.org/docs/core/atom), [Jotai hooks](https://jotai.org/docs/core/use-atom), [React reset](https://react.dev/learn/preserving-and-resetting-state). Перед правкой проверять версии проекта.
