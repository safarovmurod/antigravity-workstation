# Aster Atelier — implementation and acceptance

Development branch: `codex/aster-appearance-20261025`. This is not a released replacement for the existing theme profile yet.

| Requirement | Implementation / evidence | Status |
| --- | --- | --- |
| One original extension, original icon, Details, VSIX | `extensions/aster-appearance`, deterministic `scripts/package-aster.cjs`; actual VS Code package installation tested | PARTIAL — Antigravity test pending |
| Exactly 20 complete palettes, first 16 literal labels | `palettes.cjs`, `themes/*`, 90+ UI colors, TextMate and semantic definitions; all 20 real VS Code editor backgrounds tested, contrast assertions | PARTIAL — full visual review / Antigravity pending |
| Ten real fonts with licenses | Official pinned `google/fonts` revision `e7db6ca603fd4862010383ff17ffd6cc4ffac1c0`; actual TTF payloads, name tables, axes, SHA-256 and OFL per family | DONE — bundled payload, not OS installation acceptance |
| Missing font download and per-user install | Official HTTPS URLs, SHA-256 verification, Windows registry/GDI registration with rollback, Linux fontconfig and macOS user font folder; no apply if OS/renderer cannot find font | NOT TESTED — actual Windows registration / download path |
| Real font previews | Webview FontFace loads actual bundled faces; installed font uses OS family; missing fonts explicitly labelled preview only | PARTIAL — all-family renderer check in progress |
| Theme/font selectors change actual editor | Global configuration API, OS check plus renderer local-font handshake; real theme selector boundary tested in VS Code | PARTIAL — font selector / Antigravity pending |
| Size, weight, normal/italic | Global native font settings plus owned TextMate/semantic styling; actual VS Code visible glyphs checked at 19px/600, italic then normal | PARTIAL — Windows / cross-language / unsupported personal overrides pending |
| Global persistence, profiles, restart, project change, update | Native apply-to-all-profiles setting, application-scoped style; ordinary installer/helper preserve personal font family/size/weight | PARTIAL — real restart/multiple profiles pending |
| Replace One Dark Pro and conflicting legacy overrides | Deliberately not removed before validating the replacement; no personal extension uninstallation | NOT DONE |
| Professional light/dark panel and genuine screenshots | Real installed panel selectors verified; CSP icon bug discovered by screenshot review and fixed | PARTIAL — final captures pending |
| Setup integration without breaking other features | Fourth bundled extension installed/verified by setup; new catalog entry; old helper changes versioned 1.3.13 | PARTIAL — focused regression 64 passed; full rerun pending |
| GitHub download and README installation | Local VSIX exists; remote candidate publication and main release not complete | PARTIAL |
| Required 20 acceptance tests | `tests/test-aster-appearance.mjs`, `tests/aster-editor.cjs`; explicit Windows Antigravity workflow added | PARTIAL — not all user acceptance checks passed |
| No fake completion or unsupported IDE patches | Uses public webview/configuration/theme APIs; no `editor.fontStyle`, DOM patch of product files or invented screenshots | DONE — implementation constraint |
| Final complete delivery | No main merge or release; incomplete items remain explicitly above | NOT DONE |

## Reproducible commands

```sh
node scripts/build-aster.cjs
node scripts/build-aster-icon.cjs
node scripts/package-aster.cjs
node --test tests/test-aster-appearance.mjs
```

The pinned font payload is already bundled. `scripts/fetch-aster-fonts.cjs` is a maintainer asset fetcher, not a runtime requirement; it needs GitHub CLI, curl, Python and fontTools to audit source name tables.

Candidate VSIX: `extensions/aster-appearance/aster-appearance-1.0.0.vsix`. On a machine with Antigravity's CLI, the intended local install command is:

```powershell
antigravity --install-extension .\extensions\aster-appearance\aster-appearance-1.0.0.vsix --force
```

This exact Antigravity command is not yet claimed tested. The automated Windows test uses the official installed executable and CLI entry point instead of assuming a PATH alias. Do not claim the old main README installs this unpublished branch.

## Sources investigated

- https://code.visualstudio.com/api/extension-guides/color-theme
- https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide
- https://code.visualstudio.com/docs/configure/profiles
- https://github.com/google/fonts/tree/e7db6ca603fd4862010383ff17ffd6cc4ffac1c0

Ordinary setup now preserves existing editor font preferences. Stability's **explicit, confirmed restore defaults** command retains its existing reset behavior; startup and normal update do not reset appearance.
