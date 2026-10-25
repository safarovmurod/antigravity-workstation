# Код, MUI, className и сохранение проекта

Для нового кода: TypeScript (.ts) и React TSX (.tsx). Новый frontend: React + TypeScript + Vite + MUI + React Router + Axios, только нужные зависимости. Существующий JavaScript-проект сохранять с его .js/.jsx без миграции. MUI + sx использовать по текущему стеку; Tailwind + className — при прямом выборе шефа или существующем рабочем использовании. Старый default JSX и TS/Tailwind не заменяет действующий договор.

Канонический договор Antigravity находится в ~/.gemini/GEMINI.md; current-agreement.md — только указатель на него. Нельзя менять его смысл общими рекомендациями React/performance skills.

## Стиль простой логики

Function declaration и понятные handlers для нового кода; arrow callback у map/filter/find уместен. В existing коде сохранить имена/quotes/semicolons/отступы. Простые if/ранний return вместо вложенных ternary. Не навязывать generics, custom hooks, service layers, memo, useReducer, useRef и advanced patterns. Если они уже работают в проекте — не удалять автоматически.

Components extract только когда крупная секция/реальное повторение; не создавать -v2/-new/-final альтернативы. Изменение только логики сохраняет дизайн; изменение только дизайна сохраняет API/state/handlers/props/routes. Не добавляй комментарии в новый код; объяснение дай отдельно в чате.

## MUI default

MUI компоненты + sx; размеры px, цвета hex, порядок layout → размер → отступ → цвет → шрифт → эффект. Button textTransform: "none"; whiteSpace: "nowrap" по необходимости. Responsive xs/lg, md только по реальной нужде. Не добавлять animation/shadow/transition без запроса или причины.
Иконки named import: проверить dependency version и существующий export до утверждения. В data icon: Checkroom; в JSX `const CategoryIcon = category.icon`; нельзя хранить несуществующий export.
Локальные assets, реальные имя/размер/fit. img: product1, не img: { product1 }. Если картинки нет, сообщи об этом отдельно и используй существующее empty-state проекта; не выдумывай asset и не добавляй комментарий-placeholder. Переданное имя не переименовывать самовольно.

## Tailwind / className когда выбрано

Сохранять простые строки className и существующую версию/конфиг Tailwind. Если шеф выбрал размеры px и hex — использовать понятные arbitrary values вида `mt-[20px] text-[#64748b]`, не мигрировать весь стиль ради единообразия. Порядок layout → размер → отступ → цвет → шрифт → эффект. Не добавлять CSS файл или shadcn без задачи. Не выдумывать класс из другой версии Tailwind.
className — React prop для CSS классов, это не JS class syntax. JS classes не использовать по умолчанию; при прямом вопросе объяснить отдельно, не переводить функциональные компоненты на классы.

## Screenshot / Figma

Сначала источник/размер viewport/структура/assets. Собирать крупными блоками и сравнивать actual browser. Проверять desktop/mobile отдельно; missing mobile/asset уточнить, не выдумывать random placeholder. Не утверждать точное совпадение font/размеров если это только оценка по screenshot. Разница описывается file → component → свойство → текущее → ожидаемое → исправление.

Полный код имеет все import/export и handler. Для куска дать точный файл/component/место. Не обещать build по статическому виду JSX. Структуру source ZIP сначала целиком картировать; вопросу об одной строке огромный audit не нужен.

## Структура нового TypeScript-примера

App.tsx собирает router; layout/Layout.tsx — Header + Outlet + Footer; pages собирают страницы, components — общий UI, data/api.ts — локальные данные, assets — реальные файлы. Это ориентир, не команда перестраивать существующий проект. Крупные секции выделяй только для читаемости или реального повторения, без произвольного лимита строк.

Обычная широкая MUI-секция (кусок JSX, применимый и в .tsx; не полный компонент):

```jsx
<Box sx={{ width: "100%", px: { xs: "16px", lg: "0px" }, py: "60px" }}>
  <Box sx={{ width: "100%", maxWidth: "1280px", mx: "auto" }}>
  </Box>
</Box>
```

Значения выше учебные; по макету используй реальные размеры. Полное новое решение содержит imports, простые types и handlers.
