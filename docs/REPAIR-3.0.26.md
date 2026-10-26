# Setup 3.0.26 repair evidence

Publication update: PR #3 was merged normally into main `f7a31811ca34e91ae04b4c29558323cce74ef156`. Setup, all three native Windows jobs, Aster and actual installed MP4 playback passed for that published main; the documentation capture remains blocked by official login. The sections below retain chronological repair evidence rather than claiming their older source revisions are current. The separate [GSD 1.19 follow-up](GSD-1.19-MIGRATION.md) records Setup 3.0.27 and its own validation boundary.

Baseline: published main `96c43a4be14ffdbb168709aeaa445a3a40f45bdf`; PR #2 already merged. Repair branch: `codex/repair-media-acceptance-20261026`. No force push, history rewrite, old branch restoration or personal configuration mutation.

## Media behavior

GitHub blob MP4 pages are file pages, not promised embedded players. Failed run 40325456498 found no `<video>` in either Edge or Chrome. A separate public raw download returned HTTP 200, `Content-Type: application/octet-stream`, exactly 301458 bytes and Calm SHA-256 `0efcbe69a67715a8ca9b94b4f8a76e2c6360217c4d9af67740d641ce305f417e`. This explains why a download is not a hosted HTML5 player. Raw GIF preview, raw MP4 download and decoded playback are separate checks. Stability 1.3.14 adds an official, script-free local Webview player (`Workstation: Open Recorded IDE Guide`) containing only the two checksum-verified genuine recordings. Details documents download explicitly; no inline Details playback is claimed. No public website is created.

Actual local VS Code 1.107.1 installed-VSIX test passed fresh and restart: both clips advanced time, decoded frames, paused, sought and resumed; screenshots and JSON are in `/tmp/workstation-repair-guide-playback`. Expanded verification in `/tmp/workstation-repair-guide-details` also loaded both genuine GIFs in actual installed Details at natural size 1080×750 and verified their exact raw MP4 anchors. This is NOT native Antigravity or authenticated Gemini proof. Native Antigravity player/public-URL run [40338146178](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40338146178) passed at repair commit `ff34cbc`; subsequent code/Details changes require a new exact-head run and do not inherit that PASS.

| Recording | Origin / duration | Current implementation evidence |
| --- | --- | --- |
| Calm TypeScript | Actual installed 3.3.3, 35 seconds | Runtime recording hash retained; playback does not prove all current Details interactions |
| Stability | Actual installed 1.3.12, 29 seconds | Historical, not current 1.3.14 UI; no equivalence claim |
| Six Git guides | Missing authenticated recordings | BLOCKED; text-card animations are not recordings |

## Authentication boundary

Run 40325462611 reports official `antigravity-onboarding` / `antigravity-auth-wrapper` covering the normal IDE. The capture harness retains this read-only guard; no overlay is removed. Decoded job 121580903138 logs place `toJSON` in official `resources/app/out/main.js:36:5496` IPC (`fRt.onPromise/onRawMessage`); UNKNOWN `agentSessions` is vendor dependency injection in `workbench.desktop.main.js:5986` (`Gxr._throwIfStrict/_createInstance`). Neither stack points into owned extension/harness code. They are host/vendor errors, not demonstrated causes of the explicit authentication blocker, and are not declared fixed by selector changes. Test-host dialogs remain distinct from normal-host authentication. Repair capture runs 40338081008 and 40338145961 still fail; they are not hidden or relabelled PASS.

## Intentional empty defaults and a real retention bug

`editor.tokenColorCustomizations: {}` is a neutral Aster-compatible managed default; ownership merge preserves personal theme blocks and textMateRules. `chrome-devtools-mcp.env: {}` adds no fabricated secret; the MCP managed overlay retains unknown nested personal env/options and foreign servers. The two Error Lens exclusion arrays mean no exclusions on a fresh install. However, prior scalar/array replacement **did** clear personal exclusion lists on update. The repair gives only these two lists an explicit personal-ownership policy for empty managed defaults, preserves them in installer and runtime profile/reset, and makes Doctor accept them. This is not a general array concatenation rule. A real disposable installer test covers update, repeat, exact backup rollback and Doctor; active-profile tests cover repeat/reset and absence of false conflicts.

No personal setting or user-installed package was deleted. Older tracked Stability VSIX artifacts remain as revision-bound recovery/evidence; the live catalog selects only 1.3.14 in repair, 1.3.13 in published main. No claim is made that obsolete-source cleanup is complete. Historical original request files and media provenance are unchanged.

## Acceptance boundary

The historical 118-parent / 247-child checklist remains revision-bound. At baseline: 146 DONE, 40 PARTIAL, 24 BLOCKED, 35 NOT TESTED, 2 NOT DONE. No status is promoted solely because a document or player was added. Aster remains 14/20 fully accepted; six PARTIAL checks include complete visual/language review, normal-session font consent, preview equivalence, final provisioning, programming interactions and reboot. Live Gemini G01–G18 results remain empty, NOT TESTED. QuickPick + clipboard is not inline chat/Submit/autosend. No unsupported API or synthetic transcript is introduced.

## One authenticated Windows handoff

On the user's Windows computer, sign into Antigravity through its official UI (do not share credentials), follow [the local recording runbook](LOCAL-RECORDING-RUNBOOK.md) in a disposable Git repository, and return the six GIF/MP4 files with before/after local/origin refs and version/hash manifest. Also return Aster Details PNGs and same-viewport screenshot comparison, G01–G18 input/output/code diffs with Submit/Cancel/restart results, and settings snapshots before/after an actual OS reboot. IDE restart alone is not OS reboot. Preserve personal data and redact secrets.

## Additional Windows failures found during repair

At `4fb8531`, native playback/public-media run 40339702533 passed, including the newly expanded actual installed Details preview/raw-anchor checks, decode/seek and restart. The capture run 40339702528 instead failed earlier than authentication: the official CLI crashed while installing Stability (`node::OnFatalError`, controller line 154). The controller now uses the existing bounded verified installer for both local packages: source-identical VSIX, zero exit, exact registration/version and every expected payload hash are required. A success-looking stdout or crashed process is never accepted.

Native ARM job 121630719827 in run 40339702534 exposed a second genuine issue: a read-only status poll can overlap the detached worker's SQLite write, producing `ERR_SQLITE_ERROR` / SQLITE_BUSY. The worker previously terminated the authorized request. It now defers only SQLite BUSY/LOCKED (codes 5/6), within its existing bounded request deadline and cancellation/scope checks, then repeats normal validation/readback. Other errors still fail. Real SQLite lock regressions verify successful commit after release and timeout without applied status for a persistent lock. No database lock is bypassed and no partial state is declared applied. These additional source changes require their own final-head reruns; earlier native PASS is not inherited.

## Additional user screenshots

The user explicitly requested `rfc` / `rafce` without `import React` and publication of all available fixes to main using no additional branch. Managed `reactSnippets.settings.importReactOnTop` was actually `true`; it is now `false`, using the installed ES7 snippets extension's declared boolean setting. Native snippet acceptance now requires real JSX/TSX expansion without a React namespace/default import. Existing source imports, JSX compiler mode, hooks auto-imports and user project files are not rewritten.

The supplied PNG shows the native `Upload to Agent` drag overlay, not a Workstation error dialog. The identical text/component exists in the original hash-audited official Antigravity `main.js`, rendered only when `isDraggingImage` is true. Managed editor associations override only `*.vsix`; no image drop/attachment disabling setting is declared. The cursor module has no drag/drop/preventDefault handlers. A causal Workstation-setting fault has not been established, so image/chat settings and vendor internal files are deliberately unchanged, as requested. Live drag/drop still needs the actual authenticated user session; this is not called repaired.

The later screenshot's `/.flex...` annotation is HTML End Tag Labels, not Tailwind completion. Its registered 1.0.0 schema has no enabled boolean. Supported transparent label/theme colors hide exactly that annotation; no invented `false` setting or vendor patch is used. Tailwind completion, hover, color chips, tag matching and auto-rename stay enabled. Actual renderer tests require the annotation's alpha to be zero and separately retain the matching-tag underline and Tailwind provider checks.

Legacy React Snippets 4.4.3 also ships a generated cache containing React imports and does not reload it just because the preference becomes false. Stability 1.3.15 activates that known version, uses a supported configuration round-trip with an unchanged effective default to invoke the vendor's own regeneration, and restores the original global assignment with a concurrent-change guard. It never writes vendor source/cache itself. Vendor-required window reload remains explicit; no unsaved window is closed automatically. Actual JSX/TSX suggestion acceptance is tested only after a real process restart; preparation alone is not acceptance.

## Publication

README commands deliberately still resolve `main`, minimum Setup 3.0.26. Repair source is not published to normal users until its PR merges. A main merge is not a formal GitHub release or full live acceptance. Current-head CI, source/package scans and regression results will be recorded after execution; historical green runs are not reused as current-head proof.
