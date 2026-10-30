# Aster Atelier

Twenty considered editor palettes. Ten real programming font families. One appearance studio.

For theme and font controls, open **Aster Atelier: Appearance Studio — темы и шрифты** from the Command Palette or the extension gear menu. Font size, weight, style and preview are inside that panel; the picture below is only an illustration.

Open the studio with **Aster Atelier: Выбрать тему без предпросмотра** or **Appearance Studio**. The command **Aster Atelier: Выбрать тему без предпросмотра** now opens a click-only picker: arrow navigation and hovering only move the highlight and never apply or preview a theme — a theme is written only by clicking the row or pressing Enter; Escape changes nothing. The first two choices are Antigravity Light and Antigravity Dark, followed by twenty Aster palettes. Inside the studio, browsing changes only the pending selection: click **Применить тему** to apply it or **Отмена** to restore the selection. The IDE's own **Set Color Theme** button on the details page uses its native live-preview picker, which previews while you navigate; an extension cannot replace that button through the supported API — use the Aster command or the studio for click-only selection.

Every Aster palette keeps inline Error Lens decorations invisible: message, line, range and light-theme backgrounds are fully transparent and the message text stays at 85–90% transparency, so large warning blocks never cover code; only the thin diagnostic squiggle remains. The same transparent values are part of the managed settings, so native Antigravity themes get the identical behavior.

## Appearance Studio guide

This instructional animation illustrates the controls; it is not an IDE recording. Click the preview to download MP4, or play it in the editor via **Workstation: Open Recorded IDE Guide / Instructional Animation** → **Анимация · Aster Atelier** (Workstation Stability 1.3.17). Details does not claim inline MP4 playback.

[![Appearance Studio instructional animation](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/aster-appearance/media/aster-appearance.gif)](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/aster-appearance/media/aster-appearance.mp4)

![Appearance Studio with a light theme](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/f42c4d0e3aed4dffd784bd77ff15f1d67f3df649/extensions/aster-appearance/media/appearance-light.png)

![Appearance Studio with a dark theme](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/f42c4d0e3aed4dffd784bd77ff15f1d67f3df649/extensions/aster-appearance/media/appearance-dark.png)

These are historical Windows Antigravity test-host screenshots. The animation and screenshots predate the explicit Apply/Cancel controls and three-section panel; use the instructions above for the current interface.

Choose a font, editor size and editor weight. Normal/italic is a saved preview preference; it does not change editor token styling. Font width is not exposed as an editor setting. Selecting a family applies it to every font-family surface the IDE registers — the code editor, integrated terminal, debug console, chat input and output, inlay hints, inline suggestions, notebook outputs and markup, and the SCM input field — and the family is shared across profiles. Missing fonts have an explicit **Download, install & apply** action using pinned official Google Fonts files with SHA-256 checks. Installation is per OS user, not administrator-wide. Every family includes its SIL Open Font License. The bundled preview is explicitly labelled when the font is not installed. A renderer that cannot access a newly installed font requires a reload; the extension refuses to claim application in that case. The workbench chrome itself (explorer labels, tab captions) has no supported font-family setting in this host, so those areas keep the product's UI font.

Selections are saved to the current profile's user settings. Existing user preferences in **Apply Setting to all Profiles** are respected; Aster does not rewrite that list. Extension availability across profiles is separate: activation uses the official **Apply Extension to all Profiles** action when needed and verifies registration. Workspace/language overrides may take precedence. Selecting normal/italic does not overwrite personal TextMate or semantic rules.

## Palettes

oceanic pro · nord polar · one dark · git hab light · nord light · material ligth · horizon light · grafite pro · slate nigth · show gray · titanium · ligth · black · crimson pro · ocean wawe · neon cyan · Amber Ledger · Orchid Dusk · Sandstone Studio · Evergreen Terminal

The requested palette labels are retained exactly. All definitions and artwork are original to this extension; no One Dark Pro assets are bundled.

## Fonts

JetBrains Mono · Fira Code · Source Code Pro · IBM Plex Mono · Roboto Mono · Space Mono · Inconsolata · Victor Mono · Intel One Mono · Cascadia Code

Fira Code and Inconsolata have no bundled italic face; the renderer may synthesize their italic shape. Space Mono provides regular/bold weights, not a continuous weight axis. The studio exposes the supported range for the selected family.

## Validation status

Automated Antigravity UI and Windows registration checks have been run; exhaustive visual review, an authenticated session and an operating-system reboot remain separate verification tasks.

Native Light/Dark choices resolve registered theme IDs from the running IDE. Antigravity 2.6.0 uses Default Light Modern / Default Dark Modern; older named Antigravity themes remain supported. Unknown IDs are not offered.
