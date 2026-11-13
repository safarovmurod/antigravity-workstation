# Aster Atelier

Twenty-two editor palettes after the most used themes. Eleven bundled programming fonts with coding ligatures and twelve font styles. One studio for all of them.

Open **Aster Atelier: Темы и шрифты** from the Command Palette (or the gear menu of this extension).

- **Theme** — every theme is a card drawn in its own colours, in five groups: **Antigravity** (Light/Dark), **VS Code** (Dark+, Light+, Solarized Dark, Quiet Light), **Тёмные · спокойные**, **Тёмные · яркие** and **Светлые**. A click on a card (or Enter on the focused card) applies the theme at once; the page keeps its scroll position, so the next theme is one click away. Arrow keys move between cards without applying. **Яркость цветов кода** and **Контраст кода** retune the code colours of an Aster palette; they stay pending until **Применить яркость и контраст**, and **Отмена** returns to the applied values. **Aster Atelier: Выбрать тему** is a quick list that applies only on click or Enter.
- **Font** — family, size, weight and twelve font styles are previewed in the panel, ligatures included, and applied together with **Применить шрифт**. Applying a font also switches on `editor.fontLigatures`, so `=== !== => <= ->` are drawn as ligatures. Italic is applied to all code. The family is set for the editor, terminal, debug console, chat, inlay hints, inline suggestions, notebooks and the commit message box. With **Этот шрифт — для всего интерфейса** the menus, side bar, tabs and panels use it too, within a second and without a restart; unchecking it brings the IDE's own font back. Icons, the editor and the terminal keep their own fonts.

Aster palettes are applied over the plain Visual Studio Light/Dark theme as theme-scoped colours, so they are not listed in the IDE's own theme picker (which changes the theme while you hover). Every part of the window is coloured — editor, side bar, panels, tabs, menus, widgets, notifications, terminal, diff, chat and syntax. All palettes colour the same 22 code roles (keywords, declarations, function and method calls, variables, parameters, properties, types, JSX tags and attributes, imports, strings, template strings, constants, regex, operators, punctuation, comments, doc comments) with semantic highlighting on; every code colour reads at 4.5:1 or more and comments at 5:1. Comments are a clear green that suits the palette — green, or sea green or teal where the palette's strings are green already — never grey and never transparent. Error Lens messages stay transparent. Colours you set yourself in `workbench.colorCustomizations` keep winning.

All ten fonts ship inside the extension (SIL Open Font License, SHA-256 pinned) and are installed once per font version for the current OS user, without a download. A newly installed font appears in the editor after a full IDE restart; the notice about it is shown once.

## Palettes

**Dark:** One Dark Pro · Dracula · Tokyo Night · Catppuccin Mocha · Night Owl · GitHub Dark · Ayu Mirage · Gruvbox Dark · Cobalt2 · SynthWave 84 · Panda · Nord · Everforest Dark · Rose Pine Moon · Kanagawa Wave · Vitesse Dark

The last five, added in 1.6.0, are calm themes in the spirit of One Dark Pro: muted, soft colours that are easy on the eyes in long sessions.

**Light:** GitHub Light · One Light · Catppuccin Latte · Solarized Light · Ayu Light · Light Owl

Each palette keeps the hues of the theme it follows — sources, licences and the colour rules are in [THEMES.md](THEMES.md). Earlier palette names open their closest new palette.

## Fonts

JetBrains Mono (default) · Fira Code · Cascadia Code · Victor Mono · Lilex · Kode Mono · Fragment Mono · Monaspace Argon Var · Monaspace Xenon Var · Monaspace Radon Var · Monaspace Krypton Var

Each draws `=== !== => <= >= -> != &&` as verified coding ligatures. Monaspace's stylistic OpenType features are enabled automatically in both the editor and preview. Victor Mono and Kode Mono do not join `||`; Fragment Mono, a strict Helvetica-like grotesque, joins `||` but not `&&`. Fira Code and Kode Mono have no separate italic face; the renderer slants them.

**Styles:** Normal · Italic · Light (300) · Medium (500) · Semibold (600) · Bold (700) · Bold Italic (700) · Italic comments · Italic keywords · Italic comments and keywords · Bold keywords · Bold declarations (functions, methods, classes, interfaces, types). Role styles keep the chosen weight; operators such as `=>` `===` `&&` stay upright and regular. Presets outside the selected family's weight range are disabled; Kode Mono starts at 400. The weight slider remains available for a custom weight. Existing personal colours and token rules are retained.
