# Aster Atelier — implementation and acceptance

Development branch: `codex/aster-appearance-20261025`. This is not a main release. Evidence below distinguishes earlier successful runtime checks from the current failing Windows font-recovery regression; an older green run does not certify a later package.

| Requirement | Implementation / evidence | Status |
| --- | --- | --- |
| One original extension, original icon, Details, VSIX | `extensions/aster-appearance`, deterministic `scripts/package-aster.cjs`; real Antigravity installed Details/name/icon checked in run 40224149663 | DONE for that tested revision; current final validation pending |
| Exactly 20 complete palettes, first 16 literal labels | `palettes.cjs`, `themes/*`, 90+ UI colors, TextMate and semantic definitions; all 20 real VS Code editor backgrounds tested, contrast assertions | PARTIAL — full visual review / Antigravity pending |
| Ten real fonts with licenses | Official pinned `google/fonts` revision `e7db6ca603fd4862010383ff17ffd6cc4ffac1c0`; actual TTF payloads, name tables, axes, SHA-256 and OFL per family | DONE — bundled payload, not OS installation acceptance |
| Missing font download and per-user install | Run 40221342206 installed missing fonts from official URLs and checked all ten actual editor font families. New interrupted-registration/rollback regression in run 40225094808 fails before its intended invalid-font boundary | PARTIAL — current recovery regression FAIL; not release-ready |
| Real font previews | Real Antigravity webview loads ten actual FontFace families, missing fonts labelled preview-only; evidence in `docs/evidence/aster-native-fonts-bcdbfd1.json` | DONE for tested revision |
| Theme/font selectors change actual editor | All 20 native picker selections and ten OS-rendered editor families verified in real Antigravity; `docs/evidence/aster-native-profiles-52db207.json` | DONE for tested revision |
| Size, weight, normal/italic | Global native font settings plus owned TextMate/semantic styling; actual VS Code visible glyphs checked at 19px/600, italic then normal | PARTIAL — Windows / cross-language / unsupported personal overrides pending |
| Global persistence, profiles, restart, project change, update | Run 40222859812 checks restart/new project/separate named profile. Run 40224149663 checks explicitly synthetic 0.9.0 fixture → 1.0.0 upgrade, not a historical release migration | PARTIAL — Windows OS reboot and final setup round-trip not verified |
| Replace One Dark Pro and conflicting legacy overrides | Removed managed gallery dependency after real host verification; exact ownership migration preserves personal/modified colors and personally installed packages | DONE for source/catalog migration; current main remains unchanged |
| Professional light/dark panel and genuine screenshots | Real installed panel selectors verified; CSP icon bug discovered by screenshot review and fixed | PARTIAL — final captures pending |
| Setup integration without breaking other features | Fourth bundled extension verified by setup; helper 1.3.13. At 75a0338 Setup checks run 40225094849 and Native Windows IDE run 40225094851 succeeded | PARTIAL — latest changes still require corresponding final results |
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

## Open evidence / environment boundaries

- The current Windows font rollback fixture fails with `CommandNotFoundException`, not the intended invalid-font error. Run 40225094808 is FAIL, not skipped or accepted. A diagnostic-only follow-up prints the complete subprocess error so the actual cause can be fixed.
- Real Antigravity light/dark/Details PNGs exist in Actions artifacts (for example run 40224149663). They have not yet been downloaded, visually reviewed and embedded in the installed extension. Artifact transfer into this workspace returned HTTP 403. No synthetic screenshot replaces them.
- A proposal to grant workflow `contents: write` for automatic screenshot publication was rejected. The workflow retains `contents: read`; publication must not bypass that decision.
- Normal authenticated interactive missing-font confirmation, Windows OS reboot, full all-language visual inspection and final README/main install are not certified by the extension test-host runs.
- Earlier runtime evidence is pinned to its own source commit in `docs/evidence/aster-native-*.json`. Do not treat it as a current-HEAD PASS.
