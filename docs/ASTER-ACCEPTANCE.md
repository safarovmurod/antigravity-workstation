# Aster Atelier acceptance ledger

Latest executable source: `34cf909`; full terminal suite 437 passed / zero failed / zero skipped, repeated LCOV run, native Linux codec suite 20 passed / zero skipped, 72 portable bootstrap scenarios and actual published-source/cache/rollback checks. Exact current-code CI conclusions and limits are in the [deep safety review](DEEP-SAFETY-REVIEW-2026-10-26.md). Older rows below retain their historical revisions; this does not turn untested reboot, normal authenticated interaction or missing screenshots into DONE.

Scope: the professional appearance extension task, not a claim that the earlier corrective audit is complete. Native evidence is revision-specific. Source is `extensions/aster-appearance`; executable package is `aster-appearance-1.0.0.vsix` in that directory.

| ID | Required real-world check | Evidence / remaining work | Status |
| --- | --- | --- | --- |
| T01 | Installs in Antigravity | Official Windows IDE + installed VSIX, run 40224149663 | DONE at b1babec |
| T02 | Original icon displays | Native Details image natural width 256, same run | DONE at b1babec |
| T03 | Name and description display | Native installed Details text assertions | DONE at b1babec |
| T04 | Exactly 20 standard picker themes | All 20 selected through native picker, run 40222859812 | DONE at 52db207 |
| T05 | Every theme actually applies | Actual editor background and light/dark kind checked for each selection | DONE at 52db207 |
| T06 | Every theme colors UI and syntax correctly | UI/token definitions and contrast tests exist; exhaustive native visual inspection across language/UI surfaces missing | PARTIAL |
| T07 | Ten fonts in selector | Actual native panel DOM and Details inventory | DONE at b1babec |
| T08 | Each installed font really renders | CDP platform-font glyph evidence for all ten, not just CSS family names | DONE at 52db207 |
| T09 | Download/install missing fonts | Current Antigravity run 40251184661 passes official downloads/install/renderer path after actual SHA-256 implementation fix. Normal authenticated install confirmation still untested | PARTIAL |
| T10 | Font size changes editor | Native panel events and computed visible glyph size | DONE at 52db207 |
| T11 | Weight changes editor | Native panel events and computed visible glyph weight | DONE at 52db207 |
| T12 | Normal/italic changes editor | Actual rendered leaf glyph styles, owned TextMate/semantic rules | DONE at 52db207 |
| T13 | Preview matches settings | All ten real preview faces load; size/weight/style bound to selection. Exhaustive visual equivalence not reviewed | PARTIAL |
| T14 | Restart preserves settings | Separate IDE process compares saved settings before writes | DONE at 52db207 |
| T15 | Different projects preserve settings | New project and named profile phases, workspace override preserved | DONE at d5c5cb1 |
| T16 | Extension update preserves settings | Real CLI synthetic version fixture 0.9.0 → 1.0.0; not historical old release. Final installer/update round-trip and OS reboot remain | PARTIAL |
| T17 | Retired managed themes do not reinstall | One Dark Pro absent from managed catalog/profiles; personal theme packages intentionally retained | DONE for candidate source |
| T18 | Existing programming features continue | Full local suite: 389 pass, 20 platform skips, 0 failures at 648a019. Native general smoke run 40225094851 passes at 75a0338; not every interactive AI workflow tested | PARTIAL |
| T19 | VSIX builds | Deterministic packaging, source and payload SHA-256 verification tests | DONE for current package |
| T20 | README installation works | All three candidate launchers now explicitly select current candidate source; real source download/config/repeat/cache/rollback passed at 34cf909. Main remains old; complete main release provisioning is not done | PARTIAL |

## Additional mandatory conditions

| Requirement | Implementation / remaining boundary | Status |
| --- | --- | --- |
| Twenty requested/original palettes | Sixteen labels preserved literally; four original extra palettes | DONE |
| Ten licensed real fonts | Pinned official Google Fonts payloads, real font metadata, OFL and checksums | DONE |
| Global settings / separate profiles | Official all-profiles action verified on Antigravity's 1.107 host; no internal patch | DONE at tested host revision |
| Windows OS restart | No Windows reboot evidence yet; IDE process restart is not OS reboot | NOT TESTED |
| Preserve personal theme/token rules | Ownership merge and migration tests; no unknown namespace deletion | DONE for automated fixtures |
| Only project-managed theme dependencies removed | Managed One Dark Pro entry removed; personal installed packages not uninstalled | DONE |
| Professional screenshots in installed Details | Real native PNGs captured as Actions artifacts; workspace download returned HTTP 403, no source embedding/review completed | BLOCKED for artifact transfer; overall PARTIAL |
| Supported APIs only | Theme contributions, public configuration/webview APIs; official host all-profiles command version-gated and verified | DONE for implementation constraint |
| Missing-font confirmation in normal user session | Test-host backend/renderer evidence does not prove normal authenticated modal interaction | NOT TESTED |
| Final release | No main merge or release declared; failed recovery regression must be fixed first | NOT DONE |

Fira Code and Inconsolata have no bundled italic face: renderer synthesis is disclosed. Space Mono has real regular/bold weights rather than an invented continuous weight axis. Workspace/language settings and more-specific personal token rules may take precedence; the studio reports effective overrides instead of modifying project files.

## Local verification on 2026-10-26

- Historical source 648a019: `npm test` → 409 tests, 389 passed, zero failed, 20 skips because the required official-bundle fixture path was unset; `/tmp/aster-final-suite.log` in the execution workspace. All twenty later executed and passed locally and on Windows; see the latest reanalysis above.
- `pwsh -NoProfile -File tests/test-font-staging.ps1` → portable staging scenarios passed, including repeat/no-download, personal-file conflict and corrupt/missing bundle rejection. This is not proof of the new Windows registration recovery path.
- `node bin/workstation-setup.js --version` → 3.0.25.
- `node bin/workstation-setup.js install --dry-run` on this Linux host refuses preflight: `Git Bash executable not found; install Git for Windows before restoring terminal settings`. No settings were written. This does not count as a successful Windows README installation.

## Earlier native follow-up (historical)

Code/package commit `5c5e3a42cf25c6a13f705f172905a00339500aba`: [actual Antigravity run 40251184661](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40251184661) passed. `docs/evidence/aster-native-5c5e3a4.json` records three real host phases with 20 standard-picker theme selections each, ten actual editor font families, native Details, language override preservation, controls, named-profile sharing and restart. This supersedes older runtime evidence for those checks, not the untested OS reboot or normal authenticated user session.

The committed candidate VSIX was downloaded successfully from its exact GitHub commit. Download/local SHA-256 both equal `2b3bfae9fc2c7b7b00b49c838d3da521769c7ab51b3e6ae013e10fd97bfc978b`.

Final automated results for code `5c5e3a4`: Setup run 40251184612 PASS; general Native Windows run 40251184597 PASS on Windows 2022, Windows 2025 and Windows ARM. Windows 2025 confirms the real install/open/queue/normal-close/apply/reopen flow and all 23 mandatory extensions registered through the actual x64 IDE CLI. These results extend T18's automated evidence, not the untested normal-user modal/OS-reboot acceptance.
