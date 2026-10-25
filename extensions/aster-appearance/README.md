# Aster Atelier

Twenty considered editor palettes. Ten real programming font families. One appearance studio.

Open **Aster Atelier: Appearance Studio** from the Command Palette, or use the standard **Preferences: Color Theme** picker. Theme changes apply to the editor, not just this panel.

Choose a font, size, weight and normal/italic token style. Missing fonts have an explicit **Download, install & apply** action using pinned official Google Fonts files with SHA-256 checks. Installation is per OS user, not administrator-wide. Every family includes its SIL Open Font License. The bundled preview is explicitly labelled when the font is not installed. A renderer that cannot access a newly installed font requires a reload; the extension refuses to claim application in that case.

Selections are saved to user settings and shared using the host's supported all-profiles settings mechanism. Workspace/language overrides remain intact and may take precedence. An extension must also be enabled in the other IDE profile. Italic uses supported TextMate/semantic token rules, not an unsupported `editor.fontStyle` setting or internal IDE patch. Personal, more-specific token styling can take precedence.

## Palettes

oceanic pro · nord polar · one dark · git hab light · nord light · material ligth · horizon light · grafite pro · slate nigth · show gray · titanium · ligth · black · crimson pro · ocean wawe · neon cyan · Amber Ledger · Orchid Dusk · Sandstone Studio · Evergreen Terminal

The requested palette labels are retained exactly. All definitions and artwork are original to this extension; no One Dark Pro assets are bundled.

## Fonts

JetBrains Mono · Fira Code · Source Code Pro · IBM Plex Mono · Roboto Mono · Space Mono · Inconsolata · Victor Mono · Intel One Mono · Cascadia Code

Fira Code and Inconsolata have no bundled italic face; the renderer may synthesize their italic shape. Space Mono provides regular/bold weights, not a continuous weight axis. The studio exposes the supported range for the selected family.

## Validation status

This is a development candidate. Real Antigravity UI, Windows registration, cross-profile persistence, all-theme visual review and screenshots must be verified before a release can be called complete. No fabricated interface screenshots are included.
