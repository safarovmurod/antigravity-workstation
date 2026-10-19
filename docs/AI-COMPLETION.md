# AI-подсказки: проверка и включение

[Команда из третьего раздела README](../README.md#3-только-отключить-ai-подсказки) отключает AI Tab, next edit и ghost text. Полная установка уже включает это действие.

**1. Открой настройки Antigravity.** Нажми Ctrl+Shift+P, напиши `Open Antigravity Settings`, выбери **Open Antigravity IDE User Settings** и нажми Enter.

![1 — открыть настройки Antigravity](images/ai-open-settings.png)

**2. Слева нажми Tab.** **Suggestions in Editor** отвечает за AI-дополнение кода, **Tab to Jump** — за переход к следующему предполагаемому месту правки. На этом снимке оба включены — синие переключатели справа.

![2 — настройки до отключения](images/ai-before.png)

**3. Для ручного написания кода выключи оба переключателя.** Их положение должно выглядеть как на снимке ниже. Чтобы вернуть AI, включи эти же два переключателя.

![3 — Suggestions in Editor и Tab to Jump выключены](images/ai-after.png)

**4. Проверь ghost text.** В палитре команд выбери **Preferences: Open User Settings**, найди `editor.inlineSuggest.enabled`: **Editor: Inline Suggest: Enabled** должен быть выключен. Чтобы вернуть ghost text, включи этот параметр.

![4 — Editor: Inline Suggest: Enabled выключен](images/inline-after.png)

Обычные подсказки переменных, методов и автоимпорта работают через **Ctrl+Space** или **Alt+Space**. Чат агента остаётся доступным. Повторная полная установка снова отключит AI-подсказки.
