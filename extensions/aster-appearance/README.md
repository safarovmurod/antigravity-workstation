# Aster Atelier

Twenty considered editor palettes. Ten real programming font families. One appearance studio.

For theme and font controls, open **Aster Atelier: Appearance Studio — темы и шрифты** from the Command Palette or the extension gear menu. Font size, weight, style and preview are inside that panel; the picture below is only an illustration.

For a theme picker that does not preview or change your current theme while browsing, use **Aster Atelier: Выбрать тему без предпросмотра** from the Command Palette or extension gear menu. Select a theme to apply it; Escape leaves it unchanged. The IDE's own **Set Color Theme** button uses its native live-preview picker; an extension cannot replace that button through the supported API.

## Appearance Studio guide

This instructional animation illustrates the controls; it is not an IDE recording. Click the preview to download MP4, or play it in the editor via **Workstation: Open Recorded IDE Guide / Instructional Animation** → **Анимация · Aster Atelier** (Workstation Stability 1.3.17). Details does not claim inline MP4 playback.

[![Appearance Studio instructional animation](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/aster-appearance/media/aster-appearance.gif)](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/4a448749e552a29ff2cabbf7722a6c6e3e7a0786/extensions/aster-appearance/media/aster-appearance.mp4)

![Appearance Studio with a light theme](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/f42c4d0e3aed4dffd784bd77ff15f1d67f3df649/extensions/aster-appearance/media/appearance-light.png)

![Appearance Studio with a dark theme](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/f42c4d0e3aed4dffd784bd77ff15f1d67f3df649/extensions/aster-appearance/media/appearance-dark.png)

These are actual Windows Antigravity test-host screenshots, not an authenticated session or a video.

Choose a font, size, weight and normal/italic token style. Missing fonts have an explicit **Download, install & apply** action using pinned official Google Fonts files with SHA-256 checks. Installation is per OS user, not administrator-wide. Every family includes its SIL Open Font License. The bundled preview is explicitly labelled when the font is not installed. A renderer that cannot access a newly installed font requires a reload; the extension refuses to claim application in that case.

Selections are saved to user settings and shared using the host's all-profiles settings mechanism. On the verified 1.107 host, activation invokes its official **Apply Extension to all Profiles** action only when this extension is not already application-scoped; registration is checked afterwards and concurrent hosts cannot send duplicate toggles. If the host/action cannot be verified, the studio reports that limitation instead of claiming global availability. Workspace/language overrides remain intact and may take precedence. Italic uses TextMate/semantic token rules, not an unsupported `editor.fontStyle` setting or internal IDE patch. Personal, more-specific token styling can take precedence.

## Palettes

oceanic pro · nord polar · one dark · git hab light · nord light · material ligth · horizon light · grafite pro · slate nigth · show gray · titanium · ligth · black · crimson pro · ocean wawe · neon cyan · Amber Ledger · Orchid Dusk · Sandstone Studio · Evergreen Terminal

The requested palette labels are retained exactly. All definitions and artwork are original to this extension; no One Dark Pro assets are bundled.

## Fonts

JetBrains Mono · Fira Code · Source Code Pro · IBM Plex Mono · Roboto Mono · Space Mono · Inconsolata · Victor Mono · Intel One Mono · Cascadia Code

Fira Code and Inconsolata have no bundled italic face; the renderer may synthesize their italic shape. Space Mono provides regular/bold weights, not a continuous weight axis. The studio exposes the supported range for the selected family.

## Validation status

Automated Antigravity UI and Windows registration checks have been run; exhaustive visual review, an authenticated session and an operating-system reboot remain separate verification tasks.
