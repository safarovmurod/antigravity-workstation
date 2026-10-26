# Aster Atelier — implementation and acceptance

Development branch: `codex/aster-appearance-20261025`. This is not a main release. Current tested code/package: `5c5e3a42cf25c6a13f705f172905a00339500aba`, native Antigravity run [40251184661](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40251184661) passed. Full per-requirement acceptance remains [PARTIAL](ASTER-ACCEPTANCE.md); no 100% claim.

| Requirement | Implementation / evidence | Status |
| --- | --- | --- |
| One original extension, original icon, Details, VSIX | `extensions/aster-appearance`, deterministic `scripts/package-aster.cjs`; real Antigravity installed Details/name/icon checked in run 40224149663 | DONE for that tested revision; current final validation pending |
| Exactly 20 complete palettes, first 16 literal labels | `palettes.cjs`, `themes/*`, 90+ UI colors, TextMate and semantic definitions; all 20 real Antigravity editor backgrounds and standard-picker selections verified, contrast assertions | PARTIAL — exhaustive UI/all-language visual review remains |
| Ten real fonts with licenses | Official pinned `google/fonts` revision `e7db6ca603fd4862010383ff17ffd6cc4ffac1c0`; actual TTF payloads, name tables, axes, SHA-256 and OFL per family | DONE — bundled payload, not OS installation acceptance |
| Missing font download and per-user install | Official download/OS renderer checks pass in run 40251184661. Cached-font hash failure diagnosed as missing `Get-FileHash`; actual implementation now uses tested .NET SHA-256. Rollback fixture stays strict and conditional on initially absent JetBrains Mono | PARTIAL — test-host path passes; normal interactive confirmation remains untested |
| Real font previews | Real Antigravity webview loads ten actual FontFace families, missing fonts labelled preview-only; evidence in `docs/evidence/aster-native-fonts-bcdbfd1.json` | DONE for tested revision |
| Theme/font selectors change actual editor | All 20 native picker selections and ten OS-rendered editor families verified in real Antigravity; `docs/evidence/aster-native-profiles-52db207.json` | DONE for tested revision |
| Size, weight, normal/italic | Actual Antigravity panel changes rendered glyph size/weight/style in all three phases, run 40251184661 | DONE for tested TypeScript fixture; exhaustive language/personal-rule combinations not certified |
| Global persistence, profiles, restart, project change, update | Run 40222859812 checks restart/new project/separate named profile. Run 40224149663 checks explicitly synthetic 0.9.0 fixture → 1.0.0 upgrade, not a historical release migration | PARTIAL — Windows OS reboot and final setup round-trip not verified |
| Replace One Dark Pro and conflicting legacy overrides | Removed managed gallery dependency after real host verification; exact ownership migration preserves personal/modified colors and personally installed packages | DONE for source/catalog migration; current main remains unchanged |
| Professional light/dark panel and genuine screenshots | Real installed panel selectors verified; CSP icon bug discovered by screenshot review and fixed | PARTIAL — final captures pending |
| Setup integration without breaking other features | Fourth bundled extension verified by setup; helper 1.3.13. Code 5c5e3a4: Setup run 40251184612 and general Native Windows run 40251184597 both PASS, including Windows 2022/2025/ARM; x64 real CLI registers all 23 mandatory extensions | DONE for automated coverage; not a claim of every live AI workflow |
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

The pinned font payload is already bundled. `scripts/fetch-aster-fonts.cjs` is a maintainer asset fetcher, not a runtime requirement; it needs GitHub CLI, curl, Python and fontTools to audit source name tables. Current local full suite: 409 tests, 389 passed, zero failed, 20 platform skips. Actual local VS Code fresh/restart/separate-profile run also passes; this is recorded separately from Antigravity.

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

- Historical failed run 40225094808 remains FAIL. Diagnostic run 40250874845 exposed unavailable `Get-FileHash`; .NET SHA-256 fixed the implementation, not the assertion. Follow-up run 40251184661 passed. See `docs/evidence/aster-native-5c5e3a4.json` for revision-specific renderer results.
- Real Antigravity light/dark/Details PNGs exist in Actions artifacts (for example run 40224149663). They have not yet been downloaded, visually reviewed and embedded in the installed extension. Artifact transfer into this workspace returned HTTP 403. No synthetic screenshot replaces them.
- A proposal to grant workflow `contents: write` for automatic screenshot publication was rejected. The workflow retains `contents: read`; publication must not bypass that decision.
- Normal authenticated interactive missing-font confirmation, Windows OS reboot, full all-language visual inspection and final README/main install are not certified by the extension test-host runs.
- Earlier runtime evidence is pinned to its own source commit in `docs/evidence/aster-native-*.json`. Do not treat it as a current-HEAD PASS.
