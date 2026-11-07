# Aster palettes and their sources

Each Aster palette follows the colours of a widely used editor theme. Aster does
not copy theme files: it takes the published colour values for each code role
(keyword, function, type, string, number, tag, attribute, parameter, comment,
operator, constant) and paints every IDE surface from them. Where a colour reads
below 4.6:1 on its background, Aster keeps the hue and only makes it lighter
(dark palettes) or darker (light palettes), so code stays clearly readable.

| Aster palette | Follows | Licence of the original |
| --- | --- | --- |
| One Dark Pro | One Dark Pro (Binaryify), after Atom One Dark | MIT |
| Dracula | Dracula Theme | MIT |
| Monokai | Monokai by Wimer Hazenberg, as shipped with VS Code | MIT (VS Code) |
| Tokyo Night | Tokyo Night (enkia) | MIT |
| Catppuccin Mocha | Catppuccin | MIT |
| Night Owl | Night Owl (Sarah Drasner) | MIT |
| GitHub Dark | GitHub VS Code Theme (Primer) | MIT |
| Material Palenight | Material Theme Palenight | Apache-2.0 / MIT colour palette |
| Ayu Mirage | Ayu | MIT |
| Gruvbox Dark | Gruvbox (morhetz) | MIT/X11 |
| Cobalt2 | Cobalt2 (Wes Bos) | MIT |
| SynthWave 84 | SynthWave '84 (Robb Owen), without its glow effect | MIT |
| Shades of Purple | Shades of Purple (Ahmad Awais) | MIT |
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

- **Brightness** (−30 … +30 %) makes code colours more or less colourful.
- **Contrast** (−20 … +30 %) moves code colours away from or towards the
  background. Text never drops below 4.5:1.
- **Window opacity** (50 … 100 %) is applied by Windows to every Antigravity
  window and restored on each start.

Brightness and contrast retune Aster palettes only; the Antigravity and VS Code
themes keep their own colours.
