'use strict';
// Twenty palettes after the most installed editor themes. Every theme keeps its
// own colours for each code role; the generator only darkens or lightens a
// colour (same hue) where it would read below WCAG 4.5:1 on the background.
// Sources and licences are listed in THEMES.md.
// name, kind, editor, chrome, text, accent, muted, syntax roles
const s = (keyword, func, type, variable, property, string, number, tag, attribute, parameter, comment, operator, constant, regex) =>
  ({ keyword, func, type, variable, property, string, number, tag, attribute, parameter, comment, operator, constant, regex });
module.exports = [
  ['One Dark Pro','dark','#282c34','#21252b','#abb2bf','#61afef','#7f848e',
    s('#c678dd','#61afef','#e5c07b','#e06c75','#e06c75','#98c379','#d19a66','#e06c75','#d19a66','#e06c75','#7f848e','#56b6c2','#d19a66','#56b6c2')],
  ['Dracula','dark','#282a36','#21222c','#f8f8f2','#bd93f9','#7a87b8',
    s('#ff79c6','#50fa7b','#8be9fd','#f8f8f2','#f8f8f2','#f1fa8c','#bd93f9','#ff79c6','#50fa7b','#ffb86c','#6272a4','#ff79c6','#bd93f9','#ff5555')],
  ['Monokai','dark','#272822','#1e1f1c','#f8f8f2','#f92672','#9f9b86',
    s('#f92672','#a6e22e','#66d9ef','#f8f8f2','#f8f8f2','#e6db74','#ae81ff','#f92672','#a6e22e','#fd971f','#88846f','#f92672','#ae81ff','#e6db74')],
  ['Tokyo Night','dark','#1a1b26','#16161e','#c0caf5','#7aa2f7','#787c99',
    s('#bb9af7','#7aa2f7','#2ac3de','#c0caf5','#73daca','#9ece6a','#ff9e64','#f7768e','#bb9af7','#e0af68','#565f89','#89ddff','#ff9e64','#b4f9f8')],
  ['Catppuccin Mocha','dark','#1e1e2e','#181825','#cdd6f4','#cba6f7','#a6adc8',
    s('#cba6f7','#89b4fa','#f9e2af','#cdd6f4','#b4befe','#a6e3a1','#fab387','#89b4fa','#f9e2af','#eba0ac','#9399b2','#89dceb','#fab387','#f5c2e7')],
  ['Night Owl','dark','#011627','#01111d','#d6deeb','#7e57c2','#5f7e97',
    s('#c792ea','#82aaff','#ffcb8b','#d6deeb','#7fdbca','#ecc48d','#f78c6c','#7fdbca','#addb67','#addb67','#637777','#c792ea','#ff5874','#5ca7e4')],
  ['GitHub Dark','dark','#0d1117','#010409','#e6edf3','#2f81f7','#8b949e',
    s('#ff7b72','#d2a8ff','#ffa657','#e6edf3','#79c0ff','#a5d6ff','#79c0ff','#7ee787','#79c0ff','#ffa657','#8b949e','#ff7b72','#79c0ff','#7ee787')],
  ['Material Palenight','dark','#292d3e','#232637','#a6accd','#80cbc4','#676e95',
    s('#c792ea','#82aaff','#ffcb6b','#eeffff','#b2ccd6','#c3e88d','#f78c6c','#f07178','#c792ea','#ff9cac','#676e95','#89ddff','#f78c6c','#89ddff')],
  ['Ayu Mirage','dark','#242936','#1f2430','#cccac2','#ffcc66','#707a8c',
    s('#ffad66','#ffd173','#73d0ff','#cccac2','#f28779','#d5ff80','#dfbfff','#5ccfe6','#ffd173','#dfbfff','#6e7c8f','#f29e74','#dfbfff','#95e6cb')],
  ['Gruvbox Dark','dark','#282828','#1d2021','#ebdbb2','#fabd2f','#a89984',
    s('#fb4934','#fabd2f','#8ec07c','#ebdbb2','#83a598','#b8bb26','#d3869b','#83a598','#8ec07c','#fe8019','#928374','#fe8019','#d3869b','#8ec07c')],
  ['Cobalt2','dark','#193549','#15232d','#ffffff','#ffc600','#aaaaaa',
    s('#ff9d00','#ffc600','#80ffbb','#e1efff','#9effff','#a5ff90','#ff628c','#9effff','#ffc600','#ffee80','#0088ff','#ff9d00','#ff628c','#80ffbb')],
  ['SynthWave 84','dark','#262335','#1e1a2e','#ffffff','#ff7edb','#848bbd',
    s('#fede5d','#36f9f6','#fe4450','#ff7edb','#ff7edb','#ff8b39','#f97e72','#72f1b8','#fede5d','#2ee2fa','#848bbd','#fede5d','#f97e72','#f97e72')],
  ['Shades of Purple','dark','#2d2b55','#1e1e3f','#ffffff','#fad000','#a599e9',
    s('#ff9d00','#fad000','#fb94ff','#e1efff','#9effff','#a5ff90','#ff628c','#9effff','#fad000','#ffee80','#b362ff','#ff9d00','#ff628c','#ff9d00')],
  ['Panda','dark','#292a2b','#232425','#e6e6e6','#19f9d8','#a0a3ab',
    s('#ff75b5','#6fc1ff','#ffcc95','#e6e6e6','#ff9ac1','#19f9d8','#ffb86c','#ff75b5','#ffb86c','#b084eb','#676b79','#f3f3f3','#ffb86c','#ff9ac1')],
  ['GitHub Light','light','#ffffff','#f6f8fa','#1f2328','#0969da','#59636e',
    s('#cf222e','#8250df','#953800','#1f2328','#0550ae','#0a3069','#0550ae','#116329','#0550ae','#953800','#59636e','#cf222e','#0550ae','#116329')],
  ['One Light','light','#fafafa','#eaeaeb','#383a42','#526fff','#696c77',
    s('#a626a4','#4078f2','#c18401','#e45649','#e45649','#50a14f','#986801','#e45649','#986801','#383a42','#a0a1a7','#0184bc','#986801','#0184bc')],
  ['Catppuccin Latte','light','#eff1f5','#e6e9ef','#4c4f69','#8839ef','#6c6f85',
    s('#8839ef','#1e66f5','#df8e1d','#4c4f69','#7287fd','#40a02b','#fe640b','#1e66f5','#df8e1d','#e64553','#7c7f93','#04a5e5','#fe640b','#ea76cb')],
  ['Solarized Light','light','#fdf6e3','#eee8d5','#586e75','#268bd2','#839496',
    s('#859900','#268bd2','#b58900','#6c71c4','#cb4b16','#2aa198','#d33682','#268bd2','#b58900','#dc322f','#93a1a1','#859900','#cb4b16','#dc322f')],
  ['Ayu Light','light','#fcfcfc','#f3f4f5','#5c6166','#ff9940','#8a9199',
    s('#fa8d3e','#f2ae49','#399ee6','#5c6166','#f07171','#86b300','#a37acc','#55b4d4','#f2ae49','#a37acc','#adaeb1','#ed9366','#a37acc','#4cbf99')],
  ['Light Owl','light','#fbfbfb','#f0f0f0','#403f53','#2aa298','#90a7b2',
    s('#994cc3','#4876d6','#bc5454','#403f53','#0c969b','#c96765','#aa0982','#994cc3','#4876d6','#0c969b','#989fb1','#0c969b','#aa0982','#5ca7e4')],
];
// Earlier labels (and their typos) open the closest new palette, so a saved
// choice keeps working after the update.
module.exports.legacy = {
  'oceanic pro':'Night Owl','neon cyan':'Night Owl','nord polar':'Tokyo Night','one dark':'One Dark Pro',
  'graphite pro':'Monokai','grafite pro':'Monokai','slate night':'Material Palenight','slate nigth':'Material Palenight',
  'pure black':'GitHub Dark','black':'GitHub Dark','crimson pro':'Panda','ocean wave':'Cobalt2','ocean wawe':'Cobalt2',
  'amber ledger':'Gruvbox Dark','orchid dusk':'Shades of Purple','evergreen terminal':'Ayu Mirage',
  'git hab light':'GitHub Light','nord light':'Catppuccin Latte','titanium':'Catppuccin Latte','show gray':'Catppuccin Latte',
  'material light':'Light Owl','material ligth':'Light Owl','horizon light':'One Light','cream light':'Solarized Light','ligth':'Solarized Light',
  'sandstone studio':'Ayu Light','synthwave \'84':'SynthWave 84',
};
