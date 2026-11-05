# Windows installer continuation

Base: `4f590733397b8d60c0f7193e7fefe718a31470c7`; setup version remains `3.0.39`.

## Changes verified locally

- Run `41683291238` failed in guide-host temp cleanup after fresh/restart playback assertions passed. `tests/guide-player-editor.cjs` now waits for process/stdio close, including timeout termination, then removes temp with bounded cleanup retries. Playback assertions are unchanged.
- `setup-checks.yml` fetches both immutable GSD baseline commits after checkout so the 1.15.0 and 1.18.0 migration tests can execute in CI.
- Static imports were hoisted and nested expressions clarified in the requested library modules. Circular reverse imports and runtime-selected source-tree imports remain deferred. No helpers, dependencies or exports were added or removed.
- `docs/SETTINGS-GUIDE.md` no longer references the removed macOS installer.
- `media/walkthrough-3.0.11` was pushed and verified by `git ls-remote` at `67a67762e88fa9fae448f4c6b27d61f8d7f2e51d`. Media URLs are unchanged.

## Local results

- `npm test`: 502 tests, 480 PASS, 0 FAIL, 22 SKIP; both historical GSD migrations executed and passed.
- `npm run test:bootstrap`: 21 PASS. `npm run test:corrective-audit`: 3 PASS.
- `npm run test:powershell`: all five font staging/preservation/rejection scenarios passed.
- `pwsh -File tests/test-git-panel-vsix.ps1` was blocked by the host signature policy. The same test passed with process-only `-NoProfile -ExecutionPolicy Bypass`; no persistent policy was changed.
- The 22 local skips are the Windows-inapplicable OS hashbang check and 21 tests requiring the absent official native fixture: installer preflight (10), rollback (7), setup status (2), native compatibility (2).
- Diff against the base is empty for `config/`, `rules/`, `skills/`, `agents/`, `resources/`, `extensions/`. No VSIX was rebuilt in the repository, hash baselines changed, or personal IDE installation performed.

## Publication boundary

Use ordinary commits and pushes on `main`; no force-push or history rewrite. The owner declined creating another branch.

Seven workflows must still be verified on the published SHA: setup-checks, aster-appearance, native-windows-smoke, browser-mcp-windows, media-playback, docs-screenshots and build-aster-repair. Local results do not establish hosted CI success.

`docs-screenshots` defaults to `all-eight` and requires an existing authorized `pr_head` distinct from `main`; only `main` exists. Do not create a branch, weaken its assertions or silently substitute a reduced recording scope. Manual dispatch is also unavailable in the current session: `gh` is absent and the available browser is signed out of GitHub.
