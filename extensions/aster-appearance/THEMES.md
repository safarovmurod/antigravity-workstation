# Aster palettes and their sources

Each Aster palette follows the colours of a widely used editor theme. Aster does
not copy theme files: it takes the published colour values of the original
(keyword, function, type, variable, property, string, number, tag, attribute,
parameter, comment, operator, regex) and generates every theme file from them
with `scripts/build-aster.cjs`.

All seventeen themes colour the same 22 code roles through one shared scope map
(TextMate scopes and semantic tokens), so no theme falls back to the IDE's own
colours: keyword, storage (`const`, `function`), function declaration, function
call, method, variable declaration, variable, parameter, property, type, JSX tag
or component, JSX attribute, library name (imports, `console`, `Math`), string,
template string, constant (numbers, `true`, `null`), regex, operator,
punctuation, comment, doc comment and invalid. A declaration and its later use
share one hue; the declaration is a little brighter.

- Every code colour reads at 4.5:1 or more on the editor background; comments
  at 5:1 or more, in the theme's own comment hue and never a dull grey. Plain
  text reads at 7:1.
- Keyword, string, function, type, comment and variable stay visibly apart
  (OKLab distance 0.07 or more); a colour that comes too close moves in
  lightness first, then slightly in hue.
- Dark palettes keep their hues but not the neon edge: colourfulness is capped
  at OKLCH chroma 0.16 (0.19 on light backgrounds).
- Where the original leaves names in the plain text colour, they take the colour
  VS Code recommends for names (Dark+ light blue, Light+ dark blue).
- Workbench, terminal (each ANSI colour from the palette colour nearest its hue),
  selection, find, bracket pairs (three calm colours in turn), Git decorations,
  errors and warnings are defined in every theme.

Monokai, Material Palenight and Shades of Purple were removed in 1.3.0 because
they repeated Dracula, Tokyo Night and Cobalt2; a saved choice opens that twin.

| Aster palette | Follows | Licence of the original |
| --- | --- | --- |
| One Dark Pro | One Dark Pro (Binaryify), after Atom One Dark | MIT |
| Dracula | Dracula Theme | MIT |
| Tokyo Night | Tokyo Night (enkia) | MIT |
| Catppuccin Mocha | Catppuccin | MIT |
| Night Owl | Night Owl (Sarah Drasner) | MIT |
| GitHub Dark | GitHub VS Code Theme (Primer) | MIT |
| Ayu Mirage | Ayu | MIT |
| Gruvbox Dark | Gruvbox (morhetz) | MIT/X11 |
| Cobalt2 | Cobalt2 (Wes Bos) | MIT |
| SynthWave 84 | SynthWave '84 (Robb Owen), without its glow effect | MIT |
| Panda | Panda Syntax (Siamak Mokhtari) | MIT |
| GitHub Light | GitHub VS Code Theme (Primer) | MIT |
| One Light | Atom One Light | MIT |
| Catppuccin Latte | Catppuccin | MIT |
| Solarized Light | Solarized (Ethan Schoonover) | MIT |
| Ayu Light | Ayu | MIT |
| Light Owl | Night Owl Light (Sarah Drasner) | MIT |

The names identify the colour scheme a palette follows. They are not the
original extensions and are not endorsed by their authors.

## Studio controls

- A click on a theme card applies the theme at once.
- **Яркость цветов кода** (−30 … +30 %) makes code colours more or less colourful.
- **Контраст кода** (−20 … +30 %) moves code colours away from or towards the
  background. Text never drops below 4.5:1. Both are applied with their own
  **Применить** button.

Brightness and contrast retune Aster palettes only; the Antigravity and VS Code
themes keep their own colours.
