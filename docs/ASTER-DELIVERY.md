# Aster Atelier — candidate delivery

This is a working implementation with incomplete acceptance items, not a completed main release. Current executable source: `34cf90952d88d23d6cbe2491b73952aae8f9c4a6`. See the [current deep safety review](DEEP-SAFETY-REVIEW-2026-10-26.md) for 437 passing terminal tests, repeated coverage, actual published-source installation and exact CI results. Documentation-only evidence commits do not change the VSIX. The older verification section below is explicitly historical.

## Package and install

- Source: `extensions/aster-appearance`.
- Package: `extensions/aster-appearance/aster-appearance-1.0.0.vsix`.
- [Download the current verified-byte VSIX](https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/34cf90952d88d23d6cbe2491b73952aae8f9c4a6/extensions/aster-appearance/aster-appearance-1.0.0.vsix).
- SHA-256: `243130f4e4466ef3d65d0cf024bff21dec2afc706dc7bf14ad76eea60d39effa` — actual downloaded bytes match the committed package.
- In Antigravity, run **Extensions: Install from VSIX**, choose this file, then open **Aster Atelier: Appearance Studio**. All twenty palettes are also contributed to **Preferences: Color Theme**. Native automation installs the same VSIX through the official executable/CLI entry point; the convenience `antigravity` PATH alias is not separately certified.
- Candidate full/lite setup includes this extension. All three commands in this branch's README explicitly select the current candidate branch and resolve its immutable source commit before download. Main still points to Setup 3.0.24; no main merge is claimed. Use command 2 to preserve unrelated extensions.

## Twenty themes

oceanic pro · nord polar · one dark · git hab light · nord light · material ligth · horizon light · grafite pro · slate nigth · show gray · titanium · ligth · black · crimson pro · ocean wawe · neon cyan · Amber Ledger · Orchid Dusk · Sandstone Studio · Evergreen Terminal.

## Ten fonts

JetBrains Mono · Fira Code · Source Code Pro · IBM Plex Mono · Roboto Mono · Space Mono · Inconsolata · Victor Mono · Intel One Mono · Cascadia Code.

Official pinned payloads, license files and per-file checksums are bundled. Missing fonts use explicit verified official download/per-user registration. No unsupported internal IDE font patch is used. Fira Code/Inconsolata italic may be synthesized; Space Mono exposes its real regular/bold weights.

## Changes and preservation

- Removed the project's managed One Dark Pro gallery dependency, not personally installed theme packages. Material Icon Theme remains: it supplies file icons, not replacement editor palettes.
- Fresh-install theme is `oceanic pro`. Existing chosen theme and font family/size/weight survive ordinary setup/update.
- Owned legacy One Dark Pro/global color overrides are removed only with prior ownership proof and exact-value matching. Modified/personal colors, theme-specific rules and unrelated namespaces remain.
- Actual global settings: `workbench.colorTheme`, `editor.fontFamily`, `editor.fontSize`, `editor.fontWeight`, `asterAppearance.fontStyle`, plus the stable union of owned all-profiles keys. Owned TextMate/semantic style rules merge with personal rules; no unsupported `editor.fontStyle`.
- Stability 1.3.13 preserves font preferences during ordinary profile application. Explicit confirmed restore-defaults remains a reset, not an update action.
- No intentional AI/agent/hook/MCP/Git Panel/Prettier/IntelliSense logic replacement. General regressions still need their own results; unchanged code is not proof of live Gemini behavior.

## Historical verification and still-incomplete items

The numerical results and run links in this section refer to the older `3945e92` source, not the current executable. Current-code evidence is in the deep safety review linked above. Untested authentication/reboot/screenshot requirements remain open.

See [all twenty mandatory checks and additional conditions](ASTER-ACCEPTANCE.md), [implementation matrix](ASTER-APPEARANCE-WIP.md), and [native current-code evidence](evidence/aster-native-5c5e3a4.json).

- Final local full suite with verified official bundle: 414 tests, 414 passed, zero failed, zero skipped. The formerly skipped twenty cases also individually pass in the current Windows job. The separate native Linux suite passes all 20 cases, including the three intentionally POSIX-only cases skipped on Windows.
- Actual local VS Code renderer: fresh/restart/named profile passed, distinct from Antigravity evidence.
- [Actual Windows Antigravity](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40256819582): PASS. Includes all twenty native picker selections, ten platform-rendered fonts, controls, Details/icon/name, restart/project/profile persistence and a labelled synthetic version-upgrade fixture.
- [Setup matrix](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40256819613): PASS.
- [General native Windows install/restart matrix](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40256819600): PASS on Windows 2022, Windows 2025 and Windows ARM. This is not substituted by the separate appearance run.
- [Windows browser/MCP matrix](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40256940216): PASS on the same executable source revision.
- The cached-font recovery failure was diagnosed from full stderr: optional `Get-FileHash` was unavailable in the inherited Windows PowerShell environment. Real .NET SHA-256 replaces it, checked against a known vector. The invalid-font/rollback assertion was not weakened.
- Real Antigravity screenshots are captured in [artifact 12621206630](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40251184661/artifacts/12621206630) but have not been transferred, visually reviewed and embedded in the extension Details. Both File Service transfer and official `gh run download` failed; the latter receives HTTP 403 from the Actions Azure Blob redirect. No policy bypass or invented screenshots are used. Artifact size is 1,133,551 bytes; GitHub digest is `sha256:277b34b185b12af1ed475a412d951084a9338479cf704f774276bca318cc2e65`. The user was asked to upload this ZIP through the chat. Workflow permissions remain read-only after the separate write-permission request was rejected.
- Exhaustive all-language/all-UI visual inspection, Windows OS reboot, normal authenticated missing-font confirmation, final full setup round-trip and main release remain incomplete/not tested. IDE restart is not an OS reboot. Project/language overrides are preserved and reported, not forcibly removed.

No 100%, final-release or universally verified claim is made.
