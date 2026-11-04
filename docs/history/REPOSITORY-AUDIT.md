# Repository audit — Setup 2.1.10

Date: 16 October 2026. Baseline: Setup 2.1.9, commit `145eba118b0497db5f8bad3cb72e5fd551134553`.

## Scope and evidence

The audit inventoried all 1,169 baseline tracked files, including hidden configuration, CI, bundled resources and binary assets. It inspected the installer, backup/restore, ownership protection, path discovery, PowerShell bootstrap, browser provisioning, MCP integration and local extensions. All source files were included in structural checks; runtime tests targeted the actual installation and integration paths.

This is not a proof that every possible GSD workflow, every Markdown instruction, every gallery extension or every Windows configuration is correct. Bundled third-party code was checked structurally and through representative integrations, not exhaustively executed. The limitations below are part of the result.

## Confirmed defects fixed

| Area | Defect | Resolution |
|---|---|---|
| Payload collection | Running `npm ci` in the MCP source directory caused dependency files and npm links to enter the setup payload and abort collection. | Exclude its `node_modules`; provision destination dependencies separately from the pinned lockfile. |
| npm packaging | The `files` allowlist included the installed nested MCP dependencies even though Git ignored them: 6,996 unwanted files and a 144,816,830-byte package. | Explicitly exclude `resources/mcp-runtime/node_modules` from npm packaging. Actual dry-run measured 1,147 files and about 6.8 MB compressed, retaining both pinned runtime manifests. |
| Path templates | Replacement-string sequences such as `$&` corrupted home/Node/Git Bash paths; quotes could invalidate JSON. | Literal callback substitution with JSON escaping. Spaces and C:/D: discovery tests remain enabled. |
| Restore | A fresh-profile backup did not record absent configuration files, so restore left newly installed configuration behind. | Version-2 backup manifests record original absence for a fixed allowlist of managed files; dry-run previews removal, invalid metadata is rejected, and legacy backups retain their earlier behavior. |
| Backup safety | A linked skill inventory could be copied from outside the profile; a dangling destination link bypassed the restore existence check. | Validate every managed target and all existing path components before copying/restoring, including dangling links. |
| Nested rules | Backup/restore ignored rules in subdirectories. | Recursive, link-checked copies preserve nested personal rules. Backup names also include a UUID to avoid same-millisecond collisions. |
| Doctor | Missing required extensions, missing agents/hooks, altered keybindings and missing/wrong MCP launchers could be reported only as warnings or escape checking. | Compare all 1,068 managed payload files, rendered configuration, exact keybindings and required extension versions; verify both MCP launcher configurations. Optional Jelly remains optional. |
| Fresh IDE inventory | A successful, consistently empty extension list was mistaken for CLI failure. | Accept three clean empty responses while retaining retries and failures for actual errors or unusable output. |
| Dry-run | Gallery preview still required a working IDE inventory command. | Preview does not probe or launch the IDE. |
| Source validation | Invalid source configuration could be discovered after editor files had already been overwritten. | Parse/render configuration, keybindings, argv and MCP templates before backup, font provisioning or profile writes. |
| GitHub Panel secrets | Trimming NUL-delimited Git output destroyed significant status spaces; rename records were parsed incorrectly. | Preserve machine-readable bytes and handle rename/copy source records, so secret checks run correctly before staging. |
| GitHub Panel deletion | Deletion lacked complete branch-name validation and merge/rebase guards; some remote failures were misreported as success. | Validate the entire request before mutation, use option terminators, block merge/rebase deletion and report remote rejection as partial failure. Panel version is now 1.2.1. |
| Documentation | Three React guide links and seven GSD documentation links referenced missing local paths. | Point React links into the bundled `rules/` directory; link excluded GSD docs to verified upstream `v1.15.0` files. Update the five affected GSD manifest hashes for those intentional documentation edits. |

No runtime feature, skill, agent or hook was deleted. Calm TypeScript stays at 3.1.2 with visual quiet mode: diagnostics/unused decorations are hidden while JS/TS validation and IntelliSense stay enabled. Docker/GitHub MCP retirement and the existing 21-required/one-optional extension policy are unchanged.

## Executed verification

| Check | Actual result |
|---|---|
| Baseline `npm test` | 115 passed, 0 failed, 0 skipped. |
| New regression file | Covers the defects above, healthy Doctor behavior, rejected remote deletion, npm packaging and all 946 GSD manifest entries. Included in `npm test`; exact final counts are recorded in the JSON report. |
| Final full Node suite | See the current machine-readable results in [PROFILE-SYNC-REPORT.json](PROFILE-SYNC-REPORT.json); no Windows outcome is implied. |
| JavaScript syntax | All 352 `.js`, `.cjs`, `.mjs` files in the audited working tree passed `node --check`. |
| JSON and shell | All 50 JSON files parsed; all 8 shell scripts passed `bash -n`. |
| PowerShell syntax | All 7 PowerShell scripts parsed in PowerShell 7.4.19. |
| TypeScript declaration | Bundled `re2js.d.cts` checked with TypeScript 5.9.3, strict/ES2022/Node16: 0 diagnostics. |
| PowerShell network regressions | 17 portable scenarios passed: explicit timeouts, retries, partial/empty/corrupt downloads, HTTPS/TLS-preserving curl arguments, exact-commit Git fallback and README launcher cleanup/error propagation. HTTP faults are simulated; fallback uses real local Git. |
| Font staging | 5 portable scenarios passed, including checksum mismatch and personal-font conflict handling. Windows font registration was not run. |
| Public GitHub download | Real raw bootstrap download, commit resolution, ZIP download and PowerShell extraction succeeded for the published 2.1.9 baseline; the downloaded rules installer and full isolated configuration/repeat succeeded. The opt-in `test:bootstrap:live` reproduces this check against whatever `main` currently resolves to. |
| Upgrade and rollback | Actual baseline source → current source isolated upgrade, repeat installation and payload rollback to the baseline passed. Font, gallery, browser and MCP provisioning were skipped in this isolated profile check. |
| MCP lockfile installation | `npm ci --prefix resources/mcp-runtime` completed; 125 packages installed. No lockfile changes. |
| Dependency audit | npm reported 0 known vulnerabilities for the locked MCP dependency tree at audit time. This is not a guarantee that dependencies contain no undiscovered defects. |
| Actual MCP servers | All 3 stdio integrations passed: Chrome DevTools exposed 30 tools, GSD exposed 3 and Sequential Thinking exposed 1. A real Chromium page was opened and its DOM read through MCP; GSD read a disposable `.planning/STATE.md`; Sequential Thinking handled a real tool call. |
| Actual browser | agent-browser 0.38.1 with system Chromium: matching screenshot comparison, changed-background detection and actual button click passed. Production browser discovery/configuration/probe and its repeat also passed. |
| Actual editor | Official VS Code 1.107.1 under Xvfb passed 13 Calm TypeScript checks: validation, hidden/restored decorations, completion, typing pulse, autosave, Format button and smooth-caret configuration. The downloaded official editor package SHA-256 matched Microsoft package metadata. |
| C:/D: portability | Existing simulated Windows discovery/registry/process cases and separate-directory filesystem installation/repeat tests passed as part of `npm test`. They are not native Windows desktop tests. |
| Documentation | All project README/docs relative file links resolve. Seven upstream documentation files returned HTTP 200 at their pinned tag. Ten remaining scanner matches are example paths/generated-file placeholders, not missing setup payload. |

Initial browser launch failed because this container lacks a usable Chromium sandbox. Only isolated test invocations used `--no-sandbox`; production Windows defaults were not changed. The MCP browser fixture initially used a data URL blocked by this machine's browser policy; it now serves a local HTTP page and passes without changing that policy. The initial npm install hit a read-only default cache; rerunning with a dedicated `/tmp` cache succeeded.

## README automation contract

The copy/paste PowerShell block remains the primary install/update path. It fetches a cache-busted bootstrap from `main`, resolves `main` once to an immutable commit, downloads/extracts that snapshot, runs its Node installer and then its Doctor. Failed installation is not reported as successful. ZIP failure falls back to a shallow Git fetch of the same SHA; stale npm package cache is not used. Partial temporary downloads are cleaned up.

Bootstrap download has a 120-second limit and three attempts; snapshot ZIP has a 600-second limit and three attempts. Git retries include low-speed failure detection. These bounds do not repair a broken Internet route. The user's `curl 28`, `curl 56`, connection-reset and Git early-EOF logs establish interrupted downloads, not a disk C:/D: error. A successful download from this cloud does not prove the user's network has recovered.

Full restart remains necessary for the display language. Personal authentication/authorization and accepting required Windows installer prompts cannot safely be fabricated or silently bypassed.

## Modified files

- Installer/runtime: `lib/backup.js`, `lib/doctor.js`, `lib/extensions.js`, `lib/installer.js`, `lib/owned-files.js`, `lib/profile-settings.js`.
- Version/catalog: `package.json`, `config/extensions.json`, `extensions/git-branch-panel/package.json`.
- Panel implementation: `extensions/git-branch-panel/extension.js`.
- Tests: `tests/test-audit-regressions.mjs`, `tests/test-bootstrap-live.ps1`, `tests/test-mcp-runtime.mjs`, `tests/test-installer.mjs`, `tests/test-setup-automation.mjs`.
- Bundled documentation: `skills/vercel-react-best-practices/AGENTS.md`; `resources/antigravity-runtime/scripts/changeset/README.md`; `resources/gsd-core/references/agent-skills-bootstrap.md`, `loop-hook-dispatch.md`, `mvp-concepts.md`, `planning-config.md`, `reviewer-instances.md`.
- Matching metadata: `resources/antigravity-runtime/gsd-file-manifest.json`.
- User documentation/evidence: `README.md`, `docs/EXTENSIONS.md`, `docs/PROFILE-SYNC-REPORT.json`, this report.

## Not verified here

- Native Windows 10/11 PowerShell 5.1, winget prerequisite installation, Windows font registration, real C:/D: disks and the complete copy/paste install on the user's computer.
- Installation/compatibility of all 18 gallery extensions through the actual Antigravity CLI, all gallery UI behaviors and their account/network prerequisites.
- The actual Antigravity UI, its vendor-specific AI settings, native MCP authorization/lifecycle and the user's running Russian interface. Earlier Russian/profile UI observations retained in the JSON report are explicitly prior evidence, not rerun results for this audit.
- Every GSD workflow and every third-party runtime branch. Static checking and representative integrations do not establish exhaustive behavioral correctness.
- Current GitHub Actions results: API access was denied (HTTP 403). Windows CI jobs are configured but their outcome is not asserted.

No claim of 100% correctness or of successful installation on the user's Windows machine is made.
