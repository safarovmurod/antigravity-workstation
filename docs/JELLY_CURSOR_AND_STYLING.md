# Ороиши editor ва Jelly Cursor

Source-и ҳозира [config/settings.json](../config/settings.json) аст. Editor `Default Dark+`, Material Icon Theme ва JetBrains Mono (15px, line height 25)-ро интихоб мекунад. Full installer font-ро месанҷад ва барои user насб мекунад; project settings метавонанд баъзе арзишҳои editor-ро override кунанд.

Аз Setup 2.1.5 Jelly Cursor ихтиёрӣ аст: худкор насб намешавад ва набудани он install/Doctor-ро қатъ намекунад. Он танҳо ороиши курсор аст; барои React/TypeScript лозим нест. Нусхаи қаблан насбшуда нигоҳ дошта мешавад. Дар snapshot effect-ҳои он хомӯшанд: `animationMode: "off"`, ripple, glow, trail, spark, spring ва дигар эффектҳо `false`. Smooth caret-и native-и editor истифода мешавад. Танзими `jellyCursor.workbenchHtmlPath` ҳангоми install аз роҳи воқеии Antigravity сохта мешавад; placeholder-и repo ҳамчун роҳи ниҳоӣ навишта намешавад.

Calm TypeScript 3.2.0 бо `calmTypeScript.quietMode: true` насб мешавад. Quiet mode хатҳои сурх/зардро бо шаффофии 95% (`#f871710D`/`#fbbf240D` дар `workbench.colorCustomizations`) нишон медиҳад; unused hints ва Error Lens пурра боқӣ мемонанд. JS/TS validation, IntelliSense ва санҷишҳои CLI фаъол мемонанд. Smooth caret бо `calmTypeScript.smoothTyping: true` аз config/settings.json татбиқ мешавад. Typing pulse ва Auto Save-и extension боқӣ мемонанд. Тугмаи Format аз 3.2.0 вуҷуд надорад: форматирование тавассути Prettier-и расмӣ ва `editor.formatOnSave` кор мекунад. Пас аз update window-ро reload кун: навиштаҳои кӯҳнаи 3.1.x (`problems.visibility`, `showUnused`, Error Lens exclusions) худкор барқарор мешаванд.

Ин ҳуҷҷат patch кардани `workbench.html`-ро талаб намекунад. Агар ороиш баъди update тағйир ёбад, settings-и насбшуда ва версияи extension-ро аз editor хонда санҷ; code-и vendor-ро аз рӯйи фармони кӯҳна дастӣ иваз накун.

Helper-и насби алоҳида аз Setup 2.1.4 барои Jelly Cursor-и дар gallery нодастрас версияи мувофиқ ва VSIX-и расмии Marketplace-ро месанҷад. Насби асосии 2.1.5 ин download-ро иҷро намекунад. Pin 0.0.8 preferred мемонад; версияи воқеӣ дар log/Doctor нишон дода мешавад. Installer DOM patch-ро худкор иҷро намекунад.
