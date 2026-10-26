# Main consolidation — 26.10.2026

This is a consolidation/publication task, not a claim that previously blocked live acceptance has passed. Setup is now 3.0.26; Aster 1.0.0 (20 themes / 10 fonts), Git Panel 1.4.4, Stability 1.3.13, Calm 3.3.3 and GSD 1.18.0 are retained. The original [118-parent/247-child checklist](CORRECTIVE-ACCEPTANCE.json), [Aster's twenty checks](ASTER-ACCEPTANCE.md) and [deep safety evidence](DEEP-SAFETY-REVIEW-2026-10-26.md) remain available with their historical revisions.

PR [#2](https://github.com/safarovmurod/antigravity-workstation/pull/2) was merged normally as `a6609043d3e19889a34fdc7a9d0a94ca0701ebd9`, preserving original main and all current Aster/corrective commits. Source `e8b19c4` passed Setup, actual Aster UI, native Windows 2022/2025/ARM and browser/MCP checks before merge. The core implementation was published, not declared universally accepted. The main-push Setup matrix now also downloads its own exact published main source and verifies bootstrap/configuration install-update/cache fixtures on Linux and Windows; it does not label that fixture as full external provisioning or live Gemini. Final main SHA/CI/deletion results are verified after publication rather than predicted here.

## Original branches and dispositions

All eight original remote heads were fetched and compared before any deletion. The worktree was clean; no untracked files or personal configuration were removed.

| Original branch | Original exact tip | Disposition |
| --- | --- | --- |
| main | `31ee01f4fe6bcf75ff93cc56e6889a0cd9760009` | Ancestor of Aster; original main history retained, no force push |
| codex/aster-appearance-20261025 | `750b874e92f99618bdbe784aa92831c54ee5e583` | Complete current implementation and 52 commits ahead of original main; integration source |
| codex/corrective-audit-20261025 | `a59e1004a0e41c53f22c33f4ac6f13f20c4bc4b6` | Ancestor of Aster; all corrective commits retained by integration |
| codex/workstation-refresh | `734cf2ae3ddafe6cc149a4dbf58253c3f8d16deb` | Five unique historical commits preserved in recovery archive; superseded implementation is not blindly overlaid |
| media/real-guides-40173282094 | `fc4f7f96d7b490ef92bcc49eefdec97a5e294c44` | Ancestor of Aster, preserved |
| media/real-guides-40175624095 | `4da31d5446dbeb201f9cfae1cc340db98b720b11` | One historical alternate Calm/Stability recording commit retained in archive; newer verified 71573e0 media retained in source |
| media/real-guides-40199028339 | `71573e0a98e1efcb9e48ac0137c6b12d6c9a9dab` | Ancestor of Aster; current immutable media links remain valid |
| media-workstation-3.0.11 | `67a67762e88fa9fae448f4c6b27d61f8d7f2e51d` | Unrelated orphan history containing historical long MP4/SRT; retained by archive parent, links converted to immutable SHA |

Local `work` pointed at original main; local corrective and Aster tips matched recorded remote heads. Local branches are deleted only after safe published-main verification, never as a substitute for integrating changes.

Refresh inspection: 159 touched paths, 32 byte-identical to current source, 115 evolved in the current implementation, 12 historical/retired paths absent. Branding/migrations, architecture cleanup, retirement rollback, bounded native CLI retries, full-catalog verification and actual CDP/inline-settings screenshots already have newer implementation/tests in main's integration source. Obsolete 3.3.0/1.3.0 and pre-Workstation packages, old audit documents and repository-creation scripts are archived, not restored over the working installer. All five original commits remain recoverable even though their old content is not merged blindly.

## Verified recovery outside working branches

- Published annotated tag: [`archive/pre-main-consolidation-20261026`](https://github.com/safarovmurod/antigravity-workstation/tree/archive/pre-main-consolidation-20261026).
- Tag object: `d03e4978d3e159bceca929a827708ce8a8d87a2c`; archive commit: `7e520f3f0b7c72e7b50f44c819cad9795e76bc62`.
- The archive commit's tree contains `recovery-manifest.json`, and its eight parents retain every distinct original tip, including unrelated media history. A tag checkout is a recovery manifest, not the normal setup tree.
- Full external bundle: `/workspace/antigravity-recovery-20261026.GAMjiq/repository.bundle`, SHA-256 `6846946f7a57663592286acc221979f2a46df007c92af1f207a23fb91cca2f47`.
- `git bundle verify` passed; restored into an independent bare mirror. Every one of the eleven recorded local/remote refs resolves to an identical commit/tree; every original tip is reachable from the archive tag; restored `git fsck --full --no-reflogs` passed. Remote annotated-tag and peeled commit identities were reread after successful push.

Recovery without relying on deleted branches: fetch the archive tag, read its manifest, and recover the selected recorded exact SHA. The standalone bundle can independently restore the complete recorded history. No token, cookie or user profile was included.

## Changes needed for a main-only repository

- All three root README commands download main and pass `SourceBranch main`; bootstrap still resolves one exact current ref/SHA and requires Setup >=3.0.26. No stale-branch/cache fallback.
- Aster CI now supports main and pull requests. The explicit media browser diagnostic targets main; a successful source/URL request is still not playback proof.
- Removed the media-publisher job that created/pushed new `media/*` branches and its write permission. Capture, validation and artifact retention remain; this is not removal of a test to obtain PASS.
- PR recording takes an explicit valid existing disposable head, never a deleted hardcoded candidate or a fabricated main-to-main PR. Empty/main/invalid head is rejected before fetch; the fixture does not create/push GitHub branches.
- Historical long-video URLs use the original immutable media commit retained by the archive, not the removed branch. Its MP4/SRT are not silently added to installer downloads.
- No ordinary project source/setting/user-extension deletion was required. Exact personal-settings, ownership, backup, rollback and updater safeguards remain.

## Acceptance and publication gates

Targeted deleted-ref/source-hash tests: 6 passed. All 72 portable PowerShell bootstrap scenarios passed after switching README to main. Full suite/build/native/PR/main publication outcomes must be read for the actual integration commit; earlier green results are not substituted. Final publication and cleanup outcomes are reported with actual SHA/API evidence after the operation, not predicted here.

The following remain open regardless of main publication:

| Requirement | Status and actual barrier |
| --- | --- |
| Authenticated live Gemini transcripts, module consumption and latency | BLOCKED / NOT TESTED: no authorized authenticated Windows/Gemini session attached to this Linux environment |
| Inline chat checkbox, Submit/Cancel, same-task delivery/resume | BLOCKED for end-to-end acceptance; public supported inline API not demonstrated; QuickPick/clipboard remains only a disclosed fallback |
| Six actual Git recordings, current Stability recording and all-eight installed playback | BLOCKED / PARTIAL: normal host onboarding and test-host dialog refusal; existing two real recordings do not count as eight |
| Original screenshot-to-code generation/render/diff and professional Antigravity Details captures | PARTIAL / NOT TESTED: native captures exist as artifacts but transfer/review/embedding and live Gemini reconstruction are not complete |
| Windows OS reboot, normal authenticated missing-font confirmation, exhaustive all-language visual review | NOT TESTED: CI IDE restart is not OS reboot; test-host backend registration is not normal-user consent UI |
| GitHub blob MP4 player | Existing diagnostic may FAIL because GitHub does not expose a playable video element there; no player is injected, no new public website is silently enabled |

These are not fixed by deleting branches. This task must not be described as full feature completion or 100% acceptance. Main consolidation may publish verified implementation while these limitations remain explicitly disclosed.

### Newly reproduced documentation failure

Run [40317057612](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40317057612) at `53bf623` failed with `IDE exited before after-native-reload: 1`, not the earlier Git selector error. The reload scenario was using the extension-test lifecycle, which exits its test host during window reload. Details/reload now uses the normal development host and startup activation, keeping the actual PID-change assertion and requiring exit code zero. A visible official onboarding/authentication overlay is detected and reported BLOCKED, never removed. A bounded redacted native-log tail is retained for subsequent failure diagnosis. This fix still requires its own native run; it is not labelled PASS from the unit launch-mode check.

Follow-up [40318561766](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40318561766) at `e8b19c4` passed the three capture contract tests, then failed explicitly with `BLOCKED: official authentication/onboarding covers the normal IDE; no overlay was removed or bypassed`. This is the current external barrier, not a successful reload/all-eight capture. The earlier exit is not claimed fully resolved in an authenticated host; the normal-host path now detects its genuine gate before claiming evidence.

### Actual-main verification corrections

The first published-main Aster run [40320950606](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40320950606) reached two successful real renderer phases, then the vendor CLI printed successful installation and crashed with exit 134 / `v8::ToLocalChecked Empty MaybeLocal` before the named-profile phase. The test harness had used direct one-shot CLI calls, unlike the production verified installer. `tests/aster-cli-install.cjs` now reuses the production bounded three-attempt mechanism and additionally checks the exact VSIX hash, actual registration/version and every installed payload hash (semantic package comparison allows only vendor `__metadata`). It still requires a zero-exit installation and never accepts a permanent crash, missing registration or corrupt bytes. Original 0.9.0 fixture CLI listing and all renderer assertions remain. This handles transient vendor failure, not a claim to have patched the proprietary V8 runtime.

Three new regression tests cover crash → bad payload → verified success, permanent failure, tampered archive and escaping registration. Final local full suite: 440 passed, zero failed/skipped. The Windows Aster rerun is required separately; the failed main run is retained as FAIL.

Published-main source/configuration fixtures now explicitly skip OS-font provisioning and replace the font entry point with a fail-fast guard. This avoids an isolated verification script unexpectedly installing fonts into the Windows user's account. Real OS font registration/rendering remains in the separate explicitly scoped native suites. The actual configuration fixture still runs update/repeat and checks installed payload hashes; it is not labelled full external provisioning.
