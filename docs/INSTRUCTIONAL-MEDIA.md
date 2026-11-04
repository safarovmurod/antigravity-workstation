# Instructional media and historical recordings

The user changed the media acceptance: clear, accurate instructional animations in installed extension Details are acceptable; recording every operation in an authenticated IDE is no longer mandatory. This does not retroactively turn the original request for eight genuine recordings into completed evidence. The verbatim original remains in `docs/requests/` and the historical corrective ledger remains separate.

| Extension | Instructional media | Details and playback |
|---|---|---|
| Git Branch Panel 1.4.5 | Current, new, switch, receive, Pull Request and delete: six separate animated schemes | Six GIF previews link to immutable raw MP4 downloads; all twelve media files are included in its VSIX |
| Aster Atelier 1.0.2 | One animation covers 20 themes, 10 fonts, size, weight, style, preview and saved selections | GIF and MP4 are included in its VSIX; Details links the preview and download |
| Workstation Stability 1.3.17 | One current instructional animation covers settings, read-only conflicts, backup and restore | GIF and MP4 are included in its VSIX; Details links the preview and download |
| Calm TypeScript 3.3.3 | Genuine earlier recording covers diagnostics, settings, completion and reset | Existing GIF preview, raw MP4 and local player are retained |

All eight new clips say **instructional animation, not an IDE recording**. They are diagrams, not tests or proof of interactions. The old real Stability 1.3.12 clip remains available and is labelled historical. The records and SHA-256 digests of the new materials are in `feature-guides/instructional-animations.json` and `feature-guides/stability-instructional.json`. Each raw URL is pinned to the commit containing its bytes; a stale deleted branch is not required.

Clicking a GIF opens a raw MP4 download, which may be offered as a download rather than played in the browser. To play locally inside the editor, use **Workstation: Open Recorded IDE Guide / Instructional Animation** and choose the labelled guide. This supported script-free Webview player verifies the bundled MP4 checksum. It is separate from Details: inline MP4 support in Details is not claimed. H.264 codec availability depends on the host.

The old `build-feature-guides.cjs` command now invokes the new animation builder rather than overwriting genuine Calm/Stability recordings with old text cards. Developers who deliberately change animation bytes must publish the media commit and update the pinned revisions in `scripts/build-instructional-catalog.cjs`; public-byte/hash and installed-player tests catch mismatches. The former builder remains recoverable in Git history.

## What is verified

`tests/test-instructional-animations.mjs` checks all GIF frame counts, SHA-256, local package content, Details links and the distinction between animations and recordings. `tests/guide-player-editor.cjs` installs the actual four VSIX packages in a disposable editor profile, opens Details, checks each preview and MP4 target, then verifies local video frames, playback, pause, seek and restart. Linux VS Code is useful cross-host evidence, not a replacement for Antigravity Windows. The `media-playback` Windows workflow runs the same installed-host assertions, verifies all raw bytes and retains diagnostic results for GitHub blob pages.

The legacy `docs-screenshots` workflow still supports the original normal-host capture via manual `all-eight`. Push/PR now default to the explicitly scoped two-recording test; this is not claimed as eight real recordings or a normal-host Details result. The separate mandatory media-playback test checks all installed previews and players. Authenticated Gemini, inline chat forms, screenshot-to-code visual comparison and Windows OS reboot remain separate open acceptance items.
