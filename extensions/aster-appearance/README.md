# Aster Atelier

Twenty vivid editor palettes after the most used themes. Fifteen bundled programming fonts. One studio that changes nothing until you press **Apply**.

Open **Aster Atelier: Темы и шрифты** from the Command Palette (or the gear menu of this extension).

- **Theme** — pick a palette, Antigravity Light/Dark or one of four standard VS Code themes (Dark+, Light+, Solarized Dark, Quiet Light), then **Применить тему**. **Яркость** and **Контраст** retune the code colours of an Aster palette; **Прозрачность окна** makes every Antigravity window 50–100 % opaque on Windows. Browsing never changes the IDE; **Отмена** returns to the applied values. **Aster Atelier: Выбрать тему** is a quick list that applies only on click or Enter.
- **Font** — family, size, weight and normal/italic are previewed in the panel and applied together with **Применить шрифт**. Italic is applied to all code. The family is set for the editor, terminal, debug console, chat, inlay hints, inline suggestions, notebooks and the commit message box. With **Этот шрифт — для всего интерфейса** the menus, side bar, tabs and panels use it too, within two seconds; unchecking it brings the IDE's own font back. Icons, the editor and the terminal keep their own fonts.

Aster palettes are applied over the plain Visual Studio Light/Dark theme as theme-scoped colours, so they are not listed in the IDE's own theme picker (which changes the theme while you hover). Every part of the window is coloured — editor, side bar, panels, tabs, menus, widgets, notifications, terminal, diff, chat and syntax — and every palette keeps text contrast at 4.5:1 or higher. Error Lens messages stay transparent. Colours you set yourself in `workbench.colorCustomizations` keep winning.

All fifteen fonts ship inside the extension (SIL Open Font License, SHA-256 pinned) and are installed for the current OS user without a download. A newly installed font appears in the editor after a full IDE restart.

[![Appearance Studio instructional animation](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/aster-appearance/media/aster-appearance.gif)](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/aster-appearance/media/aster-appearance.mp4)

## Palettes

**Dark:** One Dark Pro · Dracula · Monokai · Tokyo Night · Catppuccin Mocha · Night Owl · GitHub Dark · Material Palenight · Ayu Mirage · Gruvbox Dark · Cobalt2 · SynthWave 84 · Shades of Purple · Panda

**Light:** GitHub Light · One Light · Catppuccin Latte · Solarized Light · Ayu Light · Light Owl

Each palette keeps the code colours of the theme it follows — sources and licences are in [THEMES.md](THEMES.md). Earlier palette names open their closest new palette.

## Fonts

JetBrains Mono · Fira Code · Source Code Pro · IBM Plex Mono · Roboto Mono · Space Mono · Inconsolata · Victor Mono · Intel One Mono · Cascadia Code · Geist Mono · Red Hat Mono · Martian Mono · DM Mono · Anonymous Pro

Fira Code, Inconsolata and Martian Mono have no italic face; the renderer slants them. Space Mono and Anonymous Pro have regular and bold weights only.
