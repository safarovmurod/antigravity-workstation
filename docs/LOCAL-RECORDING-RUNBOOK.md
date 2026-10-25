# Real recordings on an authenticated Windows computer

Status: procedure and tested disposable fixture, **not eight completed recordings**. Hosted Antigravity2.5.5 test mode refuses real dialogs; normal hosted mode is covered by sign-in onboarding. No hidden Skip button, fake login state, DOM removal or simulated confirmation is allowed.

1. In your own normal Antigravity IDE, complete the official Google sign-in/onboarding yourself. Never upload credentials, account storage, cookies, the whole profile, or a screen showing tokens. This procedure does not import authentication into CI.
2. Use the candidate checkout, not an old main download. In its terminal run `node tests/docs-screenshots/manual-fixture.cjs`. It creates new local repositories under the printed temporary directory (with spaces), no remote network/account/global Git changes. Open the printed `repo` in your already authenticated IDE. Do not use a real work repository for destructive demonstrations. Existing CI capture.ps1 remains hosted-only; do not remove its guard to run it on your normal profile.
3. Confirm installed versions in Extensions and retain a screenshot of Details. Record the actual UI at1440x1000 or a documented readable viewport, with cursor and captions. Use your OS recorder (Windows11 Snipping Tool video or an already installed recorder). These are manual alternatives, not a claimed automated recording command. Exclude account notifications and secrets from the capture.

## Eight scenes and acceptance evidence

| Clip | Actual steps | Verify after the click |
|---|---|---|
| current-branch | Explorer→GitHub→Current Branch, expand/collapse | main, destination origin/main; `git status --porcelain` and HEAD unchanged |
| new-branch | New Branch→base main→demo-new→Create and send | `git branch --all`: active demo-new plus origin/demo-new; show that create pushes immediately |
| switch-branch | Edit branch.txt without saving→attempt demo-other; then save conflicting edit→retry; undo only that fixture edit→switch | First attempts retain work/branch; clean switch changes branch.txt. Do not discard real user changes |
| get-changes | On demo-other choose incoming→Receive and merge→read/accept the real confirmation | Actual shared.txt conflict. Choose current version in conflict controls; verify local merge commit and origin/demo-other unchanged until separate push. A separate fresh fixture can demonstrate `git merge --abort` rollback |
| delete-branch | Attempt ordinary local delete of demo-other; show unsaved active-file refusal; after cancelling, select merged demo-new and explicitly local+origin | Unmerged/unsaved work retained. Read both dialogs/fresh SHA. Verify only demo-new refs disappear. For remote-only/local-only/force acceptance use separate fresh fixtures, never main or an unrelated origin |
| pull-request | Use a separate clean candidate checkout whose HEAD is already published in this user's repo; choose base main and open official compare | Show head/base and real diff. Opening compare is not creating a PR or merging. Do not push/delete/create a real PR merely to film. A disposable local origin cannot produce a GitHub PR |
| stability | Run Apply Profile/Inspect Project Conflicts/Show Status in a fixture with an intentional font-size override | Show readable current conflict output, exact settings file and current/managed values. Do not alter another project's settings |
| calm-typescript | Use a small fixture with real JS/TS errors and exported completion symbol; toggle quiet mode, completion/import, Settings and Reset | Errors still exist, completion/auto-import works; show exact current version and actual Reset behavior |

## Packaging and installed Details acceptance

Keep original MP4s locally and record clip name, date, exact code commit, actual installed extension versions/module hashes, viewport, duration and operation evidence. Generate GIF previews from the same actual clips; re-encoding/captions are allowed, inventing result frames is not. On Windows `Get-FileHash -Algorithm SHA256 -LiteralPath <file>` records each MP4/GIF checksum. Do not edit the existing manifest to say a manual clip was captured by the CI harness.

Before publishing, inspect every clip and its actual Git refs. Put only reviewed media in the known docs/feature-guides paths, update provenance with `method: manual actual authenticated IDE capture` and immutable media URLs, rebuild the three VSIX packages as applicable, then verify **installed** Details: every GIF loads, each MP4 actually plays, reload/reopen/restart preserves access. A reachable URL or checksum alone does not prove playback. Rerun source/package/checksum/Windows tests before requesting safe release. This entire final media acceptance is still outstanding until the actual recordings and playback evidence exist.

If recording cannot proceed, retain the exact visible error and mark BLOCKED. Do not paste a password/token into this chat. The temporary fixture is intentionally retained for review; this procedure never recursively deletes a supplied directory.
